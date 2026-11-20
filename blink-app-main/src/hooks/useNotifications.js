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

export const sendMentionNotifications = async ({ caption, fromUserId, refId }) => {
  if (!caption) return;
  const mentions = caption.match(/@[\w]+/g);
  if (!mentions) return;
  const usernames = [...new Set(mentions.map((m) => m.slice(1).toLowerCase()))];
  for (const username of usernames) {
    const { data } = await supabase
      .from('users').select('id').eq('username', username).single();
    if (data && data.id !== fromUserId) {
      await sendNotification({
        to: data.id, from: fromUserId,
        type: 'mention',
        message: 'mentioned you in a post',
        refId,
      });
    }
  }
};

export const sendCommentMentionNotifications = async ({ body, fromUserId, refId }) => {
  if (!body) return;
  const mentions = body.match(/@[\w]+/g);
  if (!mentions) return;
  const usernames = [...new Set(mentions.map((m) => m.slice(1).toLowerCase()))];
  for (const username of usernames) {
    const { data } = await supabase
      .from('users').select('id').eq('username', username).single();
    if (data && data.id !== fromUserId) {
      await sendNotification({
        to: data.id, from: fromUserId,
        type: 'mention',
        message: 'mentioned you in a comment: "' + body.slice(0, 50) + '"',
        refId,
      });
    }
  }
};