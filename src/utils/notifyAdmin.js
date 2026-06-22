// src/utils/notifyAdmin.js
// Call this whenever a user submits a report
import { supabase } from '../lib/supabaseClient';

export async function notifyAdminOnReport({ reporterId, targetType, targetId, reason }) {
  try {
    // Get all admin/blink role users
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .in('role', ['blink', 'admin', 'moderator'])
      .eq('is_banned', false);

    if (!admins?.length) return;

    const { data: reporter } = await supabase
      .from('users')
      .select('display_name, username')
      .eq('id', reporterId)
      .maybeSingle();

    const message = `🚨 ${reporter?.display_name || 'A user'} reported a ${targetType}: "${reason}"`;

    // Notify all admins
    await supabase.from('notifications').insert(
      admins.map(admin => ({
        user_id:      admin.id,
        from_user_id: reporterId,
        type:         'admin_action',
        message,
        ref_id:       targetId,
        is_read:      false,
      }))
    );
  } catch (err) {
    console.error('notifyAdmin error:', err.message);
  }
}