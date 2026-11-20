// src/lib/posts.js — shared post / comment data layer (batched, cached, server-validated)
import { supabase } from './supabaseClient';

/* ── hide / mute lists (device side), parsed only when they change ── */
const LS_HIDDEN = 'blink_hidden_posts';
const LS_MUTED = 'blink_muted_users';
const memo = {};
function readSet(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { /* storage blocked */ }
  if (memo[key]?.raw === raw) return memo[key].set;
  let arr = [];
  try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
  memo[key] = { raw, set: new Set(arr) };
  return memo[key].set;
}
const writeSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ } };
export const isPostHidden = (id) => readSet(LS_HIDDEN).has(id);
export const isUserMuted = (id) => readSet(LS_MUTED).has(id);
export function hidePost(id) { const s = new Set(readSet(LS_HIDDEN)); s.add(id); writeSet(LS_HIDDEN, s); }
export function muteUser(id) { const s = new Set(readSet(LS_MUTED)); s.add(id); writeSet(LS_MUTED, s); }

export const postLink = (id) => `${window.location.origin}/post/${id}`;

/* ── "did I like / save / repost this?" — one request for a whole screen ── */
const stateCache = new Map();           // `${uid}:${postId}` -> state
let stateQueue = new Map();             // postId -> [resolve]
let stateTimer = null;
let stateUid = null;
const EMPTY_STATE = { liked: false, reaction: null, saved: false, reposted: false };

async function flushStates() {
  const batch = stateQueue; stateQueue = new Map(); stateTimer = null;
  const uid = stateUid;
  const ids = [...batch.keys()];
  const found = new Map();
  try {
    const { data, error } = await supabase.rpc('get_post_states', { p_ids: ids });
    if (error || !Array.isArray(data)) throw error || new Error('no data');
    data.forEach((r) => found.set(r.post_id, r));
  } catch {
    // database script not installed yet: three small queries for the whole batch
    try {
      const [l, s, r] = await Promise.all([
        supabase.from('likes').select('post_id, reaction_type').eq('user_id', uid).in('post_id', ids),
        supabase.from('saved_posts').select('post_id').eq('user_id', uid).in('post_id', ids),
        supabase.from('posts').select('quoted_post_id').eq('user_id', uid).eq('is_repost', true).in('quoted_post_id', ids),
      ]);
      ids.forEach((id) => found.set(id, {
        post_id: id,
        liked: !!(l.data || []).find((x) => x.post_id === id),
        reaction: (l.data || []).find((x) => x.post_id === id)?.reaction_type || null,
        saved: !!(s.data || []).find((x) => x.post_id === id),
        reposted: !!(r.data || []).find((x) => x.quoted_post_id === id),
      }));
    } catch { /* leave defaults */ }
  }
  batch.forEach((resolvers, id) => {
    const r = found.get(id);
    const st = r ? { liked: !!r.liked, reaction: r.reaction || null, saved: !!r.saved, reposted: !!r.reposted } : EMPTY_STATE;
    if (r) stateCache.set(`${uid}:${id}`, st);
    resolvers.forEach((res) => res(st));
  });
}

export function requestPostState(uid, postId) {
  const key = `${uid}:${postId}`;
  if (stateCache.has(key)) return Promise.resolve(stateCache.get(key));
  stateUid = uid;
  return new Promise((resolve) => {
    stateQueue.set(postId, [...(stateQueue.get(postId) || []), resolve]);
    if (!stateTimer) stateTimer = setTimeout(flushStates, 30);
  });
}
export function patchPostState(uid, postId, patch) {
  const key = `${uid}:${postId}`;
  stateCache.set(key, { ...EMPTY_STATE, ...(stateCache.get(key) || {}), ...patch });
}

/* ── quoted posts for a whole screen ── */
const quotedCache = new Map();
let quotedQueue = new Map();
let quotedTimer = null;
async function flushQuoted() {
  const batch = quotedQueue; quotedQueue = new Map(); quotedTimer = null;
  const ids = [...batch.keys()];
  const { data } = await supabase.from('posts')
    .select('id, caption, media_urls, video_url, created_at, user_id, users!posts_user_id_fkey(id,username,display_name,avatar_url,is_verified)')
    .in('id', ids);
  const map = new Map((data || []).map((p) => [p.id, { ...p, users: p['users!posts_user_id_fkey'] || p.users }]));
  batch.forEach((resolvers, id) => {
    const p = map.get(id) || null;
    if (p) quotedCache.set(id, p);
    resolvers.forEach((r) => r(p));
  });
}
export function requestQuotedPost(id) {
  if (quotedCache.has(id)) return Promise.resolve(quotedCache.get(id));
  return new Promise((resolve) => {
    quotedQueue.set(id, [...(quotedQueue.get(id) || []), resolve]);
    if (!quotedTimer) quotedTimer = setTimeout(flushQuoted, 30);
  });
}

/* ── share & insights ── */
export async function recordShare(postId) {
  try { const { data } = await supabase.rpc('record_post_share', { p_post_id: postId }); return data; } catch { return null; }
}
export async function fetchInsights(postId) {
  const { data, error } = await supabase.rpc('post_insights', { p_post_id: postId });
  if (error) throw error;
  return data;
}

/* ── comments ── */
const missingFn = (err) => /does not exist|could not find|schema cache/i.test(err?.message || '');

const LEGACY_SELECT = `id, body, parent_id, post_id, user_id, created_at, status, reaction_count, reply_count,
  users!comments_user_id_fkey (id, username, display_name, avatar_url, is_verified)`;
const fromLegacy = (c) => ({
  id: c.id, post_id: c.post_id, parent_id: c.parent_id, user_id: c.user_id, body: c.body, created_at: c.created_at,
  edited: false, is_pinned: false, is_hidden: false,
  reaction_count: c.reaction_count || 0, reply_count: c.reply_count || 0, my_reaction: null,
  user: c['users!comments_user_id_fkey'] || c.users || {},
});

export async function fetchComments({ postId, parentId = null, sort = 'top', offset = 0, limit = 20 }) {
  const { data, error } = await supabase.rpc('get_post_comments', {
    p_post_id: postId, p_parent_id: parentId, p_sort: sort, p_limit: limit, p_offset: offset,
  });
  if (!error) return Array.isArray(data) ? data : [];
  if (!missingFn(error)) throw error;

  // fallback before the database script is installed
  let q = supabase.from('comments').select(LEGACY_SELECT).eq('post_id', postId).neq('status', 'deleted');
  q = parentId ? q.eq('parent_id', parentId).order('created_at', { ascending: true }) : q.is('parent_id', null).order('created_at', { ascending: sort === 'new' ? false : true });
  const { data: rows, error: e2 } = await q.range(offset, offset + limit - 1);
  if (e2) throw e2;
  return (rows || []).map(fromLegacy);
}

export async function addComment(postId, text, parentId = null) {
  const { data, error } = await supabase.rpc('add_comment', { p_post_id: postId, p_body: text, p_parent_id: parentId });
  if (!error) return data;
  if (!missingFn(error)) throw error;
  const { data: row, error: e2 } = await supabase.from('comments')
    .insert({ post_id: postId, body: text, parent_id: parentId }).select(LEGACY_SELECT).single();
  if (e2) throw e2;
  return fromLegacy(row);
}

export async function editComment(id, text) {
  const { data, error } = await supabase.rpc('edit_comment', { p_comment_id: id, p_body: text });
  if (error) throw error;
  return data;
}
export async function hideComment(id, hidden) {
  const { error } = await supabase.rpc('hide_comment', { p_comment_id: id, p_hidden: hidden });
  if (error) throw error;
}
export async function pinComment(id, pinned) {
  const { error } = await supabase.rpc('pin_comment', { p_comment_id: id, p_pinned: pinned });
  if (error) throw error;
}
export async function deleteComment(id) {
  let { error } = await supabase.rpc('delete_own_comment', { p_comment_id: id });
  if (error && missingFn(error)) ({ error } = await supabase.rpc('delete_post_comment', { p_comment_id: id }));
  if (error) throw error;
}

/* Save / unsave a post. Uses the server function; falls back to the table itself so the
   button never just says "couldn't update". Returns the new saved state. */
export async function toggleSave(postId, wasSaved) {
  const { data, error } = await supabase.rpc('toggle_post_save', { p_post_id: postId });
  if (!error && typeof data === 'boolean') return data;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Please sign in again.');
  if (wasSaved) {
    const { error: e1 } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', uid);
    if (e1) throw e1;
    return false;
  }
  const { error: e2 } = await supabase.from('saved_posts').upsert({ post_id: postId, user_id: uid }, { onConflict: 'post_id,user_id' });
  if (e2) throw e2;
  return true;
}
export async function toggleCommentLike(id, wasLiked = false) {
  const { data, error } = await supabase.rpc('toggle_comment_like', { p_comment_id: id });
  if (!error) return data; // { liked, count }
  // The database script is not installed (or its unique key is missing): use the direct path
  if (!missingFn(error) && !/on conflict|unique or exclusion/i.test(error.message || '')) throw error;

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Please sign in again.');
  if (wasLiked) {
    const { error: e1 } = await supabase.from('comment_reactions').delete().eq('comment_id', id).eq('user_id', uid);
    if (e1) throw e1;
  } else {
    const { error: e2 } = await supabase.from('comment_reactions')
      .upsert({ comment_id: id, user_id: uid, emoji: '❤️' }, { onConflict: 'comment_id,user_id' });
    if (e2) throw e2;
  }
  const { count } = await supabase.from('comment_reactions').select('comment_id', { count: 'exact', head: true }).eq('comment_id', id);
  return { liked: !wasLiked, count: count || 0 };
}

/* ── lists shown in Settings ── */
export const getMutedUserIds = () => [...readSet(LS_MUTED)];
export function unmuteUser(id) { const s = new Set(readSet(LS_MUTED)); s.delete(id); writeSet(LS_MUTED, s); }
export const hiddenPostCount = () => readSet(LS_HIDDEN).size;
export function clearHiddenPosts() { writeSet(LS_HIDDEN, new Set()); }
