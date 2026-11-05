// src/lib/follows.js
// Single source of truth for follow / following / follow-back / friends.
//
// Relationship is ALWAYS derived from the two real rows in `follows`
// (do I follow them? do they follow me?) — never from a string returned
// by a server function — so every screen agrees:
//   I follow, they follow me   -> 'friends'
//   I follow, they don't       -> 'following'
//   they follow me, I don't    -> 'follow_back'
//   neither                    -> 'none'
import { supabase } from './supabaseClient';

export const REL = { NONE: 'none', FOLLOWING: 'following', FOLLOW_BACK: 'follow_back', FRIENDS: 'friends' };

/* ── tiny event bus: lets every screen react instantly to a follow ── */
const bus = new EventTarget();
const EVT = 'blink:follow-change';
export function emitFollowChange(detail) {
  bus.dispatchEvent(new CustomEvent(EVT, { detail }));
}
export function onFollowChange(cb) {
  const handler = (e) => cb(e.detail);
  bus.addEventListener(EVT, handler);
  return () => bus.removeEventListener(EVT, handler);
}

export function relFrom(iFollow, theyFollow) {
  if (iFollow && theyFollow) return REL.FRIENDS;
  if (iFollow) return REL.FOLLOWING;
  if (theyFollow) return REL.FOLLOW_BACK;
  return REL.NONE;
}

export const iFollowThem = (rel) => rel === REL.FOLLOWING || rel === REL.FRIENDS;

// What the relationship becomes after I press the button.
export function nextRelationship(rel) {
  switch (rel) {
    case REL.FOLLOWING:   return REL.NONE;
    case REL.FRIENDS:     return REL.FOLLOW_BACK;
    case REL.FOLLOW_BACK: return REL.FRIENDS;
    default:              return REL.FOLLOWING;
  }
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/* ── relationship with one person: one query, both directions ── */
export async function fetchRelationship(me, them) {
  if (!me || !them || me === them) return REL.NONE;
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, following_id')
    .or(`and(follower_id.eq.${me},following_id.eq.${them}),and(follower_id.eq.${them},following_id.eq.${me})`);
  if (error) throw error;
  const rows = data || [];
  return relFrom(
    rows.some((r) => r.follower_id === me),
    rows.some((r) => r.follower_id === them),
  );
}

/* ── relationship with many people at once (lists, Discover) ── */
export async function fetchRelationships(me, ids) {
  const out = {};
  const list = [...new Set((ids || []).filter((i) => i && i !== me))];
  if (!me || list.length === 0) return out;

  const iFollow = new Set();
  const theyFollow = new Set();
  await Promise.all(chunk(list, 60).map(async (part) => {
    const [a, b] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', me).in('following_id', part),
      supabase.from('follows').select('follower_id').eq('following_id', me).in('follower_id', part),
    ]);
    (a.data || []).forEach((r) => iFollow.add(r.following_id));
    (b.data || []).forEach((r) => theyFollow.add(r.follower_id));
  }));

  list.forEach((id) => { out[id] = relFrom(iFollow.has(id), theyFollow.has(id)); });
  return out;
}

/* ── follow / unfollow ─────────────────────────────────────────
   Uses the existing atomic toggle_follow() function (it also creates
   the notification). If that function is unavailable we fall back to a
   plain insert/delete so the button never just "does nothing".
   `wantFollow` is the intent, so a stale screen can never flip the
   wrong way. */
export async function setFollow(me, targetId, wantFollow, currentRel) {
  let actual = currentRel;
  try {
    actual = await fetchRelationship(me, targetId);
  } catch { /* use what we were given */ }

  if (iFollowThem(actual) === wantFollow) return actual; // already there

  const { error } = await supabase.rpc('toggle_follow', { p_target_id: targetId });
  if (error) {
    if (wantFollow) {
      const { error: insErr } = await supabase.from('follows')
        .upsert({ follower_id: me, following_id: targetId }, { onConflict: 'follower_id,following_id' });
      if (insErr) throw insErr;
    } else {
      const { error: delErr } = await supabase.from('follows')
        .delete().eq('follower_id', me).eq('following_id', targetId);
      if (delErr) throw delErr;
    }
  }

  followingIdsCache.delete(me);
  const finalRel = await fetchRelationship(me, targetId).catch(() => nextRelationship(actual));
  emitFollowChange({ me, targetId, relationship: finalRel, previous: actual });
  return finalRel;
}

/* ── ids I follow (cached 60s — used by the "For You" feed) ── */
const followingIdsCache = new Map();
export async function getFollowingIds(me) {
  const hit = followingIdsCache.get(me);
  if (hit && Date.now() - hit.t < 60000) return hit.ids;
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', me).limit(2000);
  const ids = (data || []).map((r) => r.following_id);
  followingIdsCache.set(me, { ids, t: Date.now() });
  return ids;
}

/* ── live, real counts ─────────────────────────────────────────
   One round trip through get_profile_stats() when it exists;
   otherwise exact COUNT queries. Never trusts a stored counter. */
export async function fetchProfileStats(userId) {
  try {
    const { data, error } = await supabase.rpc('get_profile_stats', { p_user_id: userId });
    if (!error && data) {
      const r = Array.isArray(data) ? data[0] : data;
      if (r) {
        return {
          followers: Number(r.followers) || 0,
          following: Number(r.following) || 0,
          friends:   Number(r.friends)   || 0,
          posts:     Number(r.posts)     || 0,
        };
      }
    }
  } catch { /* fall through */ }

  const count = (q) => q.then(({ count: c }) => c || 0);
  const [followers, following, posts, friends] = await Promise.all([
    count(supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId)),
    count(supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId)),
    count(supabase.from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('is_draft.is.null,is_draft.eq.false')
      .or('status.is.null,status.neq.deleted')),
    countFriends(userId),
  ]);
  return { followers, following, friends, posts };
}

async function countFriends(userId) {
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId).limit(1000);
  const ids = (data || []).map((r) => r.following_id);
  let total = 0;
  await Promise.all(chunk(ids, 100).map(async (part) => {
    const { count } = await supabase.from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', userId).in('follower_id', part);
    total += count || 0;
  }));
  return total;
}

/* ── people lists for the modals ── */
const USER_FIELDS = 'id,username,display_name,avatar_url,is_verified,bio';

export async function fetchFollowersList(userId) {
  const { data, error } = await supabase.from('follows')
    .select('users!follows_follower_id_fkey(' + USER_FIELDS + ')')
    .eq('following_id', userId).limit(200);
  if (error) throw error;
  return (data || []).map((r) => r['users!follows_follower_id_fkey'] || r.users).filter(Boolean);
}

export async function fetchFollowingList(userId) {
  const { data, error } = await supabase.from('follows')
    .select('users!follows_following_id_fkey(' + USER_FIELDS + ')')
    .eq('follower_id', userId).limit(200);
  if (error) throw error;
  return (data || []).map((r) => r['users!follows_following_id_fkey'] || r.users).filter(Boolean);
}

export async function fetchFriendsList(userId) {
  const [a, b] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', userId).limit(1000),
    supabase.from('follows').select('follower_id').eq('following_id', userId).limit(1000),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const followers = new Set((b.data || []).map((r) => r.follower_id));
  const ids = (a.data || []).map((r) => r.following_id).filter((id) => followers.has(id)).slice(0, 200);
  if (ids.length === 0) return [];
  const rows = [];
  await Promise.all(chunk(ids, 80).map(async (part) => {
    const { data } = await supabase.from('users').select(USER_FIELDS).in('id', part);
    rows.push(...(data || []));
  }));
  return rows;
}
