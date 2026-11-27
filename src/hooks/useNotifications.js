import { supabase } from '../lib/supabaseClient';

export const sendNotification = async ({ to, from, type, message, refId }) => {
  if (!to || !from || to === from) return;
  try {
    await supabase.from('notifications').insert({
      user_id: to,
      from_user_id: from,
      type,
      message,
      ref_id: refId || null,
      is_read: false,
    });
  } catch (err) {
    console.warn('Notification error:', err);
  }
};

// One lookup for every @name (max 10), instead of one query per name.
const MAX_MENTIONS = 10;
const findMentioned = async (text, fromUserId) => {
  const found = (text || '').match(/@[A-Za-z0-9_]{1,30}/g);
  if (!found) return [];
  const names = [...new Set(found.map((m) => m.slice(1).toLowerCase()))].slice(0, MAX_MENTIONS);
  const { data } = await supabase.from('users').select('id').in('username', names);
  return (data || []).map((u) => u.id).filter((id) => id !== fromUserId);
};

export const sendMentionNotifications = async ({ caption, fromUserId, refId }) => {
  const ids = await findMentioned(caption, fromUserId);
  await Promise.all(ids.map((to) => sendNotification({
    to, from: fromUserId, type: 'mention', message: 'mentioned you in a post', refId,
  })));
};

export const sendCommentMentionNotifications = async ({ body, fromUserId, refId }) => {
  const ids = await findMentioned(body, fromUserId);
  await Promise.all(ids.map((to) => sendNotification({
    to, from: fromUserId, type: 'mention',
    message: 'mentioned you in a comment: "' + (body || '').slice(0, 50) + '"', refId,
  })));
};
