// src/lib/stories.js — status updates: data layer (all rules live in the database)
import { supabase } from './supabaseClient';
import { compressImage, uploadImage } from './imageUtils';

export const STORY_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏', '🙏', '💯'];

let cache = null; // { rows, t }
export const getCachedFeed = () => (cache && Date.now() - cache.t < 45000 ? cache.rows : null);
export const patchCachedFeed = (fn) => { if (cache) cache = { rows: fn(cache.rows), t: cache.t }; };

export async function fetchStoryFeed() {
  const { data, error } = await supabase.rpc('get_story_feed');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  cache = { rows, t: Date.now() };
  return rows;
}

/* groups: you first, then friends with something new, then the rest */
export function groupStories(rows, myId) {
  const map = new Map();
  rows.forEach((s) => {
    if (!map.has(s.user_id)) {
      map.set(s.user_id, {
        userId: s.user_id,
        user: { id: s.user_id, username: s.username, display_name: s.display_name, avatar_url: s.avatar_url, is_verified: s.is_verified },
        stories: [],
      });
    }
    map.get(s.user_id).stories.push(s);
  });
  const groups = [...map.values()].map((g) => ({
    ...g,
    hasUnviewed: g.userId !== myId && g.stories.some((s) => !s.viewed),
    latest: g.stories[g.stories.length - 1]?.created_at,
  }));
  const rank = (g) => (g.userId === myId ? 0 : g.hasUnviewed ? 1 : 2);
  return groups.sort((a, b) => rank(a) - rank(b) || new Date(b.latest) - new Date(a.latest));
}

export const firstUnviewedIndex = (group, myId) => {
  if (group.userId === myId) return 0;
  const i = group.stories.findIndex((s) => !s.viewed);
  return i < 0 ? 0 : i;
};

export async function createTextStory(text, bg) {
  const { data, error } = await supabase.rpc('create_story', { p_type: 'text', p_text: text, p_bg: bg });
  if (error) throw error;
  cache = null;
  return data;
}

export async function createImageStory(file, caption) {
  const small = await compressImage(file, { maxSize: 1600, quality: 0.85 });
  const url = await uploadImage(small, 'status');
  const { data, error } = await supabase.rpc('create_story', { p_type: 'image', p_media_url: url, p_caption: caption || null });
  if (error) throw error;
  cache = null;
  return data;
}

export async function deleteStory(id) {
  const { error } = await supabase.rpc('delete_story', { p_story_id: id });
  if (error) throw error;
  cache = null;
}

export async function recordStoryView(id) {
  const { data, error } = await supabase.rpc('story_record_view', { p_story_id: id });
  if (error) throw error;
  return data;
}

export async function reactToStory(id, emoji) {
  const { data, error } = await supabase.rpc('story_react', { p_story_id: id, p_emoji: emoji });
  if (error) throw error;
  return data; // { my_reaction, reactions_count }
}

export async function replyToStory(id, text) {
  const { data, error } = await supabase.rpc('story_reply', { p_story_id: id, p_text: text });
  if (error) throw error;
  return data; // chat id
}

export async function fetchStoryViewers(id) {
  const { data, error } = await supabase.rpc('story_viewers', { p_story_id: id });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function shareStory(id, chatIds) {
  const { data, error } = await supabase.rpc('story_share', { p_story_id: id, p_chat_ids: chatIds });
  if (error) throw error;
  return data;
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : 'Yesterday';
}
