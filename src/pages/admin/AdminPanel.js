import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  Shield, Users, AlertTriangle, Ban, Clock,
  XCircle, ArrowLeft, Trash2, Search,
  RefreshCw, Activity, UserCheck, AlertOctagon,
  EyeOff, Eye, RotateCcw, FileText, Flag,
  CheckCircle, ChevronDown,
} from 'lucide-react';

/* ══════════════════════════════════════════════
   ROLE / STATUS HELPERS
══════════════════════════════════════════════ */
const ROLE_COLORS = {
  blink:     { bg:'#FFD700', label:'B-Link' },
  admin:     { bg:'#EF4444', label:'Admin'  },
  moderator: { bg:'#7B2FFF', label:'Mod'    },
  user:      { bg:'#374151', label:'User'   },
};

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.user;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: c.bg + '25', color: c.bg, border: '1px solid ' + c.bg + '40' }}>
      {c.label}
    </span>
  );
}

function StatusBadge({ u }) {
  if (u.is_banned) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Banned</span>;
  if (u.suspended_until && new Date(u.suspended_until) > new Date()) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Suspended</span>;
  if (u.is_restricted) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Restricted</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Active</span>;
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-white font-bold text-xl leading-none">{formatNumber(value)}</p>
        <p className="text-[#6B7280] text-xs mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   USER ACTION MODAL
   Performs REAL operations with error feedback
══════════════════════════════════════════════ */
function UserActionModal({ target, myRole, onClose, onSuccess }) {
  const { user } = useAuth();
  const [action,  setAction]  = useState('');
  const [reason,  setReason]  = useState('');
  const [days,    setDays]    = useState(7);
  const [newRole, setNewRole] = useState(target.role || 'user');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState('');

  const isBlink = myRole === 'blink';
  const isAdmin = myRole === 'admin' || isBlink;
  const isMod   = myRole === 'moderator' || isAdmin;

  const ACTIONS = [
    { key:'warn',       label:'⚠️  Warn user',           desc:'Send an official warning',             allowed: isMod  },
    { key:'restrict',   label:'🟡 Restrict user',         desc:'Block from posting & commenting',       allowed: isAdmin },
    { key:'unrestrict', label:'✅ Remove restriction',    desc:'Restore full posting access',           allowed: isAdmin },
    { key:'suspend',    label:'🔵 Suspend user',          desc:'Temporarily block account access',      allowed: isAdmin },
    { key:'unsuspend',  label:'✅ Unsuspend user',        desc:'Lift the suspension immediately',       allowed: isAdmin },
    { key:'ban',        label:'🔴 Permanently ban',       desc:'Permanently block all access',          allowed: isBlink },
    { key:'unban',      label:'✅ Unban user',            desc:'Restore full account access',           allowed: isBlink },
    { key:'role',       label:'👑 Change role',           desc:'Promote or demote this user',           allowed: isBlink },
    { key:'delete',     label:'🗑️  Delete account',       desc:'Permanently erase from system',        allowed: isBlink },
  ].filter(a => a.allowed);

  const handleSubmit = async () => {
    if (!action) { setError('Please select an action.'); return; }
    if (['warn','restrict','suspend','ban'].includes(action) && !reason.trim()) {
      setError('A reason is required for this action.'); return;
    }

    setLoading(true); setError('');

    try {
      switch (action) {

        /* ── WARN ── */
        case 'warn': {
          const { error: wErr } = await supabase.from('warnings').insert({
            user_id: target.id, issued_by: user.id, reason: reason.trim(),
          });
          if (wErr) throw new Error('Warning failed: ' + wErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: `⚠️ Official Warning: ${reason.trim()}`,
            is_read: false,
          });
          setDone(`Warning sent to @${target.username}`);
          break;
        }

        /* ── RESTRICT ── */
        case 'restrict': {
          const { error: rErr } = await supabase.from('users')
            .update({ is_restricted: true, restriction_reason: reason.trim() })
            .eq('id', target.id);
          if (rErr) throw new Error('Restrict failed: ' + rErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: `🟡 Your account has been restricted: ${reason.trim()}`,
            is_read: false,
          });
          setDone(`@${target.username} is now restricted`);
          break;
        }

        /* ── UNRESTRICT ── */
        case 'unrestrict': {
          const { error: urErr } = await supabase.from('users')
            .update({ is_restricted: false, restriction_reason: null })
            .eq('id', target.id);
          if (urErr) throw new Error('Unrestrict failed: ' + urErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: '✅ Your account restriction has been lifted.',
            is_read: false,
          });
          setDone(`Restriction removed from @${target.username}`);
          break;
        }

        /* ── SUSPEND ── */
        case 'suspend': {
          const until = new Date();
          until.setDate(until.getDate() + days);
          const { error: sErr } = await supabase.from('users')
            .update({ suspended_until: until.toISOString(), ban_reason: reason.trim() })
            .eq('id', target.id);
          if (sErr) throw new Error('Suspend failed: ' + sErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: `🔵 Your account has been suspended for ${days} day(s): ${reason.trim()}`,
            is_read: false,
          });
          setDone(`@${target.username} suspended for ${days} day(s)`);
          break;
        }

        /* ── UNSUSPEND ── */
        case 'unsuspend': {
          const { error: usErr } = await supabase.from('users')
            .update({ suspended_until: null, ban_reason: null })
            .eq('id', target.id);
          if (usErr) throw new Error('Unsuspend failed: ' + usErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: '✅ Your suspension has been lifted. Welcome back!',
            is_read: false,
          });
          setDone(`@${target.username} is now unsuspended`);
          break;
        }

        /* ── BAN ── */
        case 'ban': {
          const { error: bErr } = await supabase.from('users')
            .update({ is_banned: true, ban_reason: reason.trim() })
            .eq('id', target.id);
          if (bErr) throw new Error('Ban failed: ' + bErr.message);

          // Revoke all sessions by signing them out (best effort)
          await supabase.auth.admin?.signOut(target.id).catch(() => {});

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: `🔴 Your account has been permanently banned: ${reason.trim()}`,
            is_read: false,
          });
          setDone(`@${target.username} has been permanently banned`);
          break;
        }

        /* ── UNBAN ── */
        case 'unban': {
          const { error: ubErr } = await supabase.from('users')
            .update({ is_banned: false, ban_reason: null })
            .eq('id', target.id);
          if (ubErr) throw new Error('Unban failed: ' + ubErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: '✅ Your ban has been lifted. You can now access B-Link.',
            is_read: false,
          });
          setDone(`@${target.username} has been unbanned`);
          break;
        }

        /* ── CHANGE ROLE ── */
        case 'role': {
          if (newRole === target.role) { setError('User already has this role.'); setLoading(false); return; }
          const { error: rlErr } = await supabase.from('users')
            .update({ role: newRole })
            .eq('id', target.id);
          if (rlErr) throw new Error('Role change failed: ' + rlErr.message);

          await supabase.from('notifications').insert({
            user_id: target.id, from_user_id: user.id,
            type: 'admin_action',
            message: `👑 Your role has been changed to ${newRole}.`,
            is_read: false,
          });
          setDone(`@${target.username} is now a ${newRole}`);
          break;
        }

        /* ── DELETE ACCOUNT ── */
        case 'delete': {
          const confirmed = window.confirm(
            `⚠️ PERMANENTLY DELETE @${target.username}?\n\nThis will:\n• Delete their account\n• Delete all their posts\n• Delete all their comments\n• Remove all their follows/likes\n\nThis CANNOT be undone.`
          );
          if (!confirmed) { setLoading(false); return; }

          // Delete in correct order to avoid FK violations
          // 1. Delete their notifications
          await supabase.from('notifications').delete().eq('user_id', target.id);
          await supabase.from('notifications').delete().eq('from_user_id', target.id);

          // 2. Delete their likes
          await supabase.from('likes').delete().eq('user_id', target.id);

          // 3. Delete their saved posts
          await supabase.from('saved_posts').delete().eq('user_id', target.id);

          // 4. Delete their comment reactions
          await supabase.from('comment_reactions').delete().eq('user_id', target.id);

          // 5. Delete their comments
          await supabase.from('comments').delete().eq('user_id', target.id);

          // 6. Delete their reports
          await supabase.from('reports').delete().eq('reporter_id', target.id);

          // 7. Delete their warnings
          await supabase.from('warnings').delete().eq('user_id', target.id);

          // 8. Delete their follows
          await supabase.from('follows').delete().eq('follower_id', target.id);
          await supabase.from('follows').delete().eq('following_id', target.id);

          // 9. Delete their posts
          await supabase.from('posts').delete().eq('user_id', target.id);

          // 10. Finally delete the user record
          const { error: dErr } = await supabase.from('users').delete().eq('id', target.id);
          if (dErr) throw new Error('Account deletion failed: ' + dErr.message);

          // Log it
          await supabase.from('admin_logs').insert({
            admin_id: user.id,
            target_user_id: null, // already deleted
            action: 'delete_account',
            details: `Deleted @${target.username} (${target.id}). Reason: ${reason || 'none'}`,
          });

          setDone(`@${target.username} has been permanently deleted`);
          setTimeout(() => { onSuccess('deleted', target.id); onClose(); }, 1500);
          setLoading(false);
          return;
        }

        default:
          throw new Error('Unknown action: ' + action);
      }

      /* ── Log all non-delete actions ── */
      await supabase.from('admin_logs').insert({
        admin_id: user.id,
        target_user_id: target.id,
        action,
        details: action === 'suspend'
          ? `${days} days - ${reason}`
          : action === 'role'
            ? `${target.role} → ${newRole}`
            : reason || action,
      });

    } catch (err) {
      console.error('Admin action error:', err.message);
      setError(err.message || 'Action failed. Check your permissions and try again.');
      setLoading(false);
      return;
    }

    setLoading(false);
    // Short delay so user sees success message, then refresh list
    setTimeout(() => { onSuccess(action, target.id); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {target.avatar_url
              ? <img src={target.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">{target.display_name?.[0]?.toUpperCase()}</div>
            }
            <div>
              <p className="text-white font-bold text-[15px]">{target.display_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <RoleBadge role={target.role} />
                <StatusBadge u={target} />
              </div>
              <p className="text-[#6B7280] text-xs mt-0.5">@{target.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white p-1">
            <XCircle size={22} />
          </button>
        </div>

        {/* Success state */}
        {done ? (
          <div className="text-center py-8">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-white font-bold text-lg">{done}</p>
            <p className="text-[#6B7280] text-sm mt-1">Action completed successfully</p>
          </div>
        ) : (
          <>
            {/* Action list */}
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Select Action</p>
            <div className="space-y-1.5 mb-4">
              {ACTIONS.map(a => (
                <button
                  key={a.key}
                  onClick={() => { setAction(a.key); setError(''); }}
                  className={'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border ' +
                    (action === a.key
                      ? 'bg-[#1E6FFF]/15 border-[#1E6FFF]/50'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]')}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${action === a.key ? 'text-white' : 'text-white/80'}`}>{a.label}</p>
                    <p className="text-[#6B7280] text-[11px] mt-0.5">{a.desc}</p>
                  </div>
                  {action === a.key && <CheckCircle size={16} className="text-[#1E6FFF] flex-shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>

            {/* Suspend duration */}
            {action === 'suspend' && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Suspension Duration</p>
                <div className="flex gap-2 flex-wrap">
                  {[1, 3, 7, 14, 30].map(d => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all ' +
                        (days === d ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                    >
                      {d} day{d > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Role selector */}
            {action === 'role' && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Assign New Role</p>
                <div className="flex gap-2 flex-wrap">
                  {['user', 'moderator', 'admin'].map(r => (
                    <button
                      key={r}
                      onClick={() => setNewRole(r)}
                      className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ' +
                        (newRole === r ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-[#6B7280] text-xs mt-2">Current role: <span className="text-white font-semibold">{target.role}</span></p>
              </div>
            )}

            {/* Reason input */}
            {action && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">
                  {['unrestrict','unsuspend','unban'].includes(action) ? 'Note (optional)' :
                   action === 'role' ? 'Note (optional)' :
                   'Reason *'}
                </p>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={
                    action === 'delete' ? 'Why is this account being deleted?' :
                    action === 'ban'    ? 'Why is this user being permanently banned?' :
                    action === 'suspend'? 'What did the user do?' :
                    'Enter reason...'
                  }
                  rows={3}
                  maxLength={300}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/50 resize-none"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[#6B7280] text-[10px]">{reason.length}/300</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || !action}
              className="w-full py-4 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background:
                  ['ban','delete'].includes(action)                         ? 'linear-gradient(135deg, #EF4444, #DC2626)' :
                  ['unban','unsuspend','unrestrict'].includes(action)       ? 'linear-gradient(135deg, #2ECC71, #16A34A)' :
                  '#1E6FFF',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                : action === 'delete' ? '🗑️ Permanently Delete Account'
                : action === 'ban'    ? '🔴 Permanently Ban User'
                : action === 'unban'  ? '✅ Unban User'
                : 'Confirm Action'
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   CONTENT MODERATION MODAL
   Performs REAL hide/delete/restore operations
══════════════════════════════════════════════ */
function ContentModal({ item, type, onClose, onSuccess }) {
  const { user } = useAuth();
  const [action,  setAction]  = useState('');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState('');

  const table = type === 'post' ? 'posts' : 'comments';
  const itemText = type === 'post' ? (item.caption || '[No caption]') : (item.body || '[No text]');

  const handleSubmit = async () => {
    if (!action) { setError('Select an action.'); return; }
    setLoading(true); setError('');

    try {
      if (action === 'delete') {
        /* ── PERMANENT DELETE ── */
        if (type === 'post') {
          // Delete all related data first
          await supabase.from('likes').delete().eq('post_id', item.id);
          await supabase.from('comments').delete().eq('post_id', item.id);
          await supabase.from('saved_posts').delete().eq('post_id', item.id);
          await supabase.from('reports').delete().eq('target_id', item.id).eq('target_type', 'post');
          const { error: delErr } = await supabase.from('posts').delete().eq('id', item.id);
          if (delErr) throw new Error('Delete failed: ' + delErr.message);
        } else {
          await supabase.from('comment_reactions').delete().eq('comment_id', item.id);
          await supabase.from('reports').delete().eq('target_id', item.id).eq('target_type', 'comment');
          const { error: delErr } = await supabase.from('comments').delete().eq('id', item.id);
          if (delErr) throw new Error('Delete failed: ' + delErr.message);
        }

        // Notify content owner
        if (item.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: item.user_id, from_user_id: user.id,
            type: 'admin_action',
            message: `🔴 Your ${type} has been permanently removed by admin${reason ? ': ' + reason : ''}.`,
            is_read: false,
          });
        }

        setDone(`${type === 'post' ? 'Post' : 'Comment'} permanently deleted`);

      } else if (action === 'hide') {
        /* ── SOFT HIDE ── */
        const { error: hideErr } = await supabase.from(table)
          .update({
            status: 'hidden',
            moderated_by: user.id,
            moderated_at: new Date().toISOString(),
            moderation_reason: reason.trim() || null,
          })
          .eq('id', item.id);
        if (hideErr) throw new Error('Hide failed: ' + hideErr.message);

        if (item.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: item.user_id, from_user_id: user.id,
            type: 'admin_action',
            message: `🟡 Your ${type} has been hidden by admin${reason ? ': ' + reason : ''}.`,
            is_read: false,
          });
        }

        setDone(`${type === 'post' ? 'Post' : 'Comment'} hidden from feed`);

      } else if (action === 'restore') {
        /* ── RESTORE ── */
        const { error: restoreErr } = await supabase.from(table)
          .update({
            status: 'active',
            moderated_by: null,
            moderated_at: null,
            moderation_reason: null,
          })
          .eq('id', item.id);
        if (restoreErr) throw new Error('Restore failed: ' + restoreErr.message);

        if (item.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: item.user_id, from_user_id: user.id,
            type: 'admin_action',
            message: `✅ Your ${type} has been restored and is now visible again.`,
            is_read: false,
          });
        }

        setDone(`${type === 'post' ? 'Post' : 'Comment'} restored successfully`);
      }

      // Log the action
      await supabase.from('admin_logs').insert({
        admin_id: user.id,
        target_user_id: item.user_id,
        action: `${action}_${type}`,
        details: reason || `${type} ${action}d`,
      });

    } catch (err) {
      console.error('Content moderation error:', err.message);
      setError(err.message || 'Action failed. Check permissions.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setTimeout(() => { onSuccess(); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Moderate {type === 'post' ? 'Post' : 'Comment'}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><XCircle size={20} /></button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-white font-bold">{done}</p>
          </div>
        ) : (
          <>
            {/* Content preview */}
            <div className={'border rounded-2xl p-4 mb-4 ' +
              (item.status === 'hidden'  ? 'border-yellow-500/25 bg-yellow-500/[0.05]' :
               item.status === 'deleted' ? 'border-red-500/25 bg-red-500/[0.05]' :
               'border-white/10 bg-white/[0.03]')}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {item.users?.avatar_url
                  ? <img src={item.users.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xs">{item.users?.display_name?.[0]?.toUpperCase()}</div>
                }
                <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
                <p className="text-[#6B7280] text-[12px]">@{item.users?.username}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  item.status === 'hidden'  ? 'bg-yellow-500/20 text-yellow-400' :
                  item.status === 'deleted' ? 'bg-red-500/20 text-red-400' :
                  'bg-green-500/20 text-green-400'}`}>
                  {item.status || 'active'}
                </span>
              </div>
              <p className="text-white/75 text-[13px] leading-snug line-clamp-4">{itemText}</p>
              {item.moderation_reason && (
                <p className="text-[#6B7280] text-[11px] mt-2 italic">Previous reason: "{item.moderation_reason}"</p>
              )}
            </div>

            {/* Actions */}
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Action</p>
            <div className="space-y-1.5 mb-4">
              {[
                { key:'hide',    label:'🟡 Hide content',       desc:'Remove from feeds. User can still see it on their profile.', show: item.status !== 'hidden'  },
                { key:'restore', label:'✅ Restore content',    desc:'Make visible again in all feeds.',                           show: item.status === 'hidden'  },
                { key:'delete',  label:'🔴 Delete permanently', desc:'Permanently erase. Cannot be undone.',                       show: item.status !== 'deleted' },
              ].filter(a => a.show).map(a => (
                <button
                  key={a.key}
                  onClick={() => { setAction(a.key); setError(''); }}
                  className={'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border ' +
                    (action === a.key
                      ? 'bg-[#1E6FFF]/15 border-[#1E6FFF]/50'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]')}
                >
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${action === a.key ? 'text-white' : 'text-white/80'}`}>{a.label}</p>
                    <p className="text-[#6B7280] text-[11px] mt-0.5">{a.desc}</p>
                  </div>
                  {action === a.key && <CheckCircle size={16} className="text-[#1E6FFF] flex-shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>

            {action && action !== 'restore' && (
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (optional)..."
                rows={2}
                maxLength={200}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none resize-none mb-4"
              />
            )}

            {error && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !action}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
              style={{
                background:
                  action === 'delete'  ? 'linear-gradient(135deg, #EF4444, #DC2626)' :
                  action === 'restore' ? 'linear-gradient(135deg, #2ECC71, #16A34A)' :
                  '#FF6B35',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                : action === 'delete'  ? '🔴 Delete Permanently'
                : action === 'hide'    ? '🟡 Hide Content'
                : action === 'restore' ? '✅ Restore Content'
                : 'Confirm'
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN ADMIN PANEL
══════════════════════════════════════════════ */
export default function AdminPanel() {
  const navigate          = useNavigate();
  const { user, profile } = useAuth();

  const [section,       setSection]      = useState('overview');
  const [users,         setUsers]        = useState([]);
  const [posts,         setPosts]        = useState([]);
  const [comments,      setComments]     = useState([]);
  const [reports,       setReports]      = useState([]);
  const [logs,          setLogs]         = useState([]);
  const [warnings,      setWarnings]     = useState([]);
  const [stats,         setStats]        = useState({});
  const [loading,       setLoading]      = useState(true);
  const [search,        setSearch]       = useState('');
  const [statusFilter,  setStatusFilter] = useState('All');
  const [contentTab,    setContentTab]   = useState('posts');
  const [selectedUser,  setSelectedUser] = useState(null);
  const [selectedItem,  setSelectedItem] = useState(null);
  const [selectedType,  setSelectedType] = useState('post');

  const myRole    = profile?.role || 'user';
  const isBlink   = myRole === 'blink';
  const isAdmin   = myRole === 'admin' || isBlink;
  const isMod     = myRole === 'moderator' || isAdmin;
  const canAccess = isMod;

  useEffect(() => {
    if (!canAccess) { navigate('/'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchUsers(), fetchReports(), fetchLogs(), fetchWarnings()]);
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const [total, banned, suspended, restricted, staff, pendingReports, hiddenPosts, totalPosts] = await Promise.all([
        supabase.from('users').select('id',{count:'exact',head:true}),
        supabase.from('users').select('id',{count:'exact',head:true}).eq('is_banned',true),
        supabase.from('users').select('id',{count:'exact',head:true}).not('suspended_until','is',null).gt('suspended_until',new Date().toISOString()),
        supabase.from('users').select('id',{count:'exact',head:true}).eq('is_restricted',true),
        supabase.from('users').select('id',{count:'exact',head:true}).in('role',['admin','moderator','blink']),
        supabase.from('reports').select('id',{count:'exact',head:true}).eq('status','pending'),
        supabase.from('posts').select('id',{count:'exact',head:true}).eq('status','hidden'),
        supabase.from('posts').select('id',{count:'exact',head:true}).neq('status','deleted'),
      ]);
      setStats({
        total:          total.count          || 0,
        banned:         banned.count         || 0,
        suspended:      suspended.count      || 0,
        restricted:     restricted.count     || 0,
        staff:          staff.count          || 0,
        pendingReports: pendingReports.count || 0,
        hiddenPosts:    hiddenPosts.count    || 0,
        totalPosts:     totalPosts.count     || 0,
      });
    } catch (err) { console.error('fetchStats:', err.message); }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('users')
      .select('id,username,display_name,avatar_url,role,is_banned,is_restricted,suspended_until,ban_reason,restriction_reason,created_at,followers_count,posts_count')
      .order('created_at', { ascending: false });
    if (error) console.error('fetchUsers:', error.message);
    else setUsers(data || []);
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase.from('posts')
      .select('id, caption, status, created_at, user_id, likes_count, comments_count, moderation_reason, media_urls, users!posts_user_id_fkey(id,username,display_name,avatar_url)')
      .in('status', ['active','hidden'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('fetchPosts:', error.message);
    else setPosts((data||[]).map(p => ({ ...p, users: p['users!posts_user_id_fkey']||p.users })));
  };

  const fetchComments = async () => {
    const { data, error } = await supabase.from('comments')
      .select('id, body, status, created_at, user_id, post_id, moderation_reason, users!comments_user_id_fkey(id,username,display_name,avatar_url)')
      .in('status', ['active','hidden'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('fetchComments:', error.message);
    else setComments((data||[]).map(c => ({ ...c, users: c['users!comments_user_id_fkey']||c.users })));
  };

  const fetchReports = async () => {
    const { data, error } = await supabase.from('reports')
      .select('*, reporter:reporter_id(username,display_name,avatar_url)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('fetchReports:', error.message);
    else setReports(data || []);
  };

  const fetchLogs = async () => {
    const { data, error } = await supabase.from('admin_logs')
      .select('*, admin:admin_id(username,display_name), target:target_user_id(username,display_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('fetchLogs:', error.message);
    else setLogs(data || []);
  };

  const fetchWarnings = async () => {
    const { data, error } = await supabase.from('warnings')
      .select('*, user:user_id(username,display_name,avatar_url), issuer:issued_by(username,display_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) console.error('fetchWarnings:', error.message);
    else setWarnings(data || []);
  };

  const resolveReport = async (reportId, status) => {
    const { error } = await supabase.from('reports')
      .update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', reportId);
    if (error) { alert('Failed to resolve report: ' + error.message); return; }
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status, resolved_by: user.id } : r));
    fetchStats();
  };

  const deleteWarning = async (wid) => {
    await supabase.from('warnings').delete().eq('id', wid);
    setWarnings(prev => prev.filter(w => w.id !== wid));
  };

  // Called after user action completes
  const handleUserActionSuccess = (action, userId) => {
    if (action === 'deleted') {
      setUsers(prev => prev.filter(u => u.id !== userId));
    } else {
      // Refresh to get latest state
      fetchUsers();
    }
    fetchStats();
    fetchLogs();
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q);
    const now = new Date();
    const matchStatus =
      statusFilter === 'All'        ? true :
      statusFilter === 'Active'     ? (!u.is_banned && !u.is_restricted && (!u.suspended_until || new Date(u.suspended_until) <= now)) :
      statusFilter === 'Restricted' ? (u.is_restricted && !u.is_banned) :
      statusFilter === 'Suspended'  ? (u.suspended_until && new Date(u.suspended_until) > now && !u.is_banned) :
      statusFilter === 'Banned'     ? u.is_banned : true;
    return matchSearch && matchStatus;
  });

  const SECTIONS = [
    { key:'overview',  label:'Overview',  icon: Activity },
    { key:'users',     label:'Users',     icon: Users },
    { key:'content',   label:'Content',   icon: FileText },
    { key:'reports',   label:'Reports',   icon: Flag,   badge: stats.pendingReports },
    { key:'logs',      label:'Logs',      icon: Clock },
    { key:'warnings',  label:'Warnings',  icon: AlertOctagon },
  ];

  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-[#7B2FFF] flex items-center justify-center">
              <Shield size={16} color="white" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">Admin Panel</p>
              <p className="text-[#6B7280] text-[11px]">{ROLE_COLORS[myRole]?.label || 'Staff'}</p>
            </div>
          </div>
        </div>
        <button onClick={fetchAll} className="text-[#6B7280] hover:text-white p-1 transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Section nav */}
      <div className="flex overflow-x-auto scrollbar-none px-4 py-3 gap-2 border-b border-white/[0.07]">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => {
              setSection(s.key);
              if (s.key === 'content') { fetchPosts(); fetchComments(); }
            }}
            className={'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all relative ' +
              (section === s.key
                ? 'bg-[#1E6FFF] text-white border-[#1E6FFF] shadow-lg shadow-[#1E6FFF]/30'
                : 'text-[#6B7280] border-white/10 hover:border-white/20 hover:text-white')}
          >
            <s.icon size={13} /> {s.label}
            {s.badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {s.badge > 9 ? '9+' : s.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── OVERVIEW ── */}
        {section === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users}         label="Total Users"    value={stats.total          || 0} color="#1E6FFF" />
              <StatCard icon={UserCheck}     label="Staff"          value={stats.staff          || 0} color="#7B2FFF" />
              <StatCard icon={AlertTriangle} label="Restricted"     value={stats.restricted     || 0} color="#FFD700" />
              <StatCard icon={Clock}         label="Suspended"      value={stats.suspended      || 0} color="#FF6B35" />
              <StatCard icon={Ban}           label="Banned"         value={stats.banned         || 0} color="#EF4444" />
              <StatCard icon={Flag}          label="Open Reports"   value={stats.pendingReports || 0} color="#EF4444" />
              <StatCard icon={EyeOff}        label="Hidden Posts"   value={stats.hiddenPosts    || 0} color="#6B7280" />
              <StatCard icon={Activity}      label="Total Posts"    value={stats.totalPosts     || 0} color="#2ECC71" />
            </div>

            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
              <p className="text-white font-bold mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Manage Users',   key:'users',   color:'#1E6FFF' },
                  { label:'Open Reports',   key:'reports', color:'#EF4444', count: stats.pendingReports },
                  { label:'Moderate Posts', key:'content', color:'#FF6B35' },
                  { label:'View Logs',      key:'logs',    color:'#2ECC71' },
                ].map(a => (
                  <button
                    key={a.key}
                    onClick={() => { setSection(a.key); if (a.key === 'content') { fetchPosts(); fetchComments(); } }}
                    className="py-3 px-4 rounded-xl text-sm font-bold transition-all hover:opacity-80 relative"
                    style={{ background: a.color + '18', border: '1px solid ' + a.color + '35', color: a.color }}
                  >
                    {a.label}
                    {a.count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">{a.count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── USERS ── */}
        {section === 'users' && (
          <div>
            {/* Search */}
            <div className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 mb-3">
              <Search size={16} className="text-[#6B7280]" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or username..."
                className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none"
              />
              {search && <button onClick={() => setSearch('')} className="text-[#6B7280] hover:text-white"><XCircle size={16} /></button>}
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
              {['All','Active','Restricted','Suspended','Banned'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                    (statusFilter === tab ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'text-[#6B7280] border-white/10 hover:border-white/20')}
                >
                  {tab}
                  {tab === 'Banned' && stats.banned > 0 && <span className="ml-1 text-red-400">({stats.banned})</span>}
                </button>
              ))}
            </div>

            <p className="text-[#6B7280] text-xs mb-2">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} shown</p>

            {loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No users found.</p></div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm">{u.display_name?.[0]?.toUpperCase()}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-white font-bold text-[13px] truncate">{u.display_name}</p>
                        <RoleBadge role={u.role} />
                      </div>
                      <p className="text-[#6B7280] text-[12px]">@{u.username}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge u={u} />
                        <span className="text-[#6B7280] text-[10px]">{formatNumber(u.followers_count||0)} followers · {formatNumber(u.posts_count||0)} posts</span>
                      </div>
                      {u.ban_reason && (
                        <p className="text-[#6B7280] text-[10px] mt-0.5 truncate">Reason: "{u.ban_reason}"</p>
                      )}
                    </div>
                    {u.role !== 'blink' ? (
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex-shrink-0 px-3 py-2 bg-white/[0.06] hover:bg-[#1E6FFF]/20 border border-white/10 hover:border-[#1E6FFF]/40 rounded-xl text-white text-xs font-bold transition-all"
                      >
                        Manage
                      </button>
                    ) : (
                      <span className="text-[#FFD700] text-sm flex-shrink-0">👑</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CONTENT ── */}
        {section === 'content' && (
          <div>
            <div className="flex gap-2 mb-4">
              {[
                { key:'posts',    label:'Posts',    count: posts.length    },
                { key:'comments', label:'Comments', count: comments.length },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setContentTab(t.key)}
                  className={'flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ' +
                    (contentTab === t.key ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            {(contentTab === 'posts' ? posts : comments).length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No {contentTab} to moderate.</p></div>
            ) : (
              <div className="space-y-2">
                {(contentTab === 'posts' ? posts : comments).map(item => (
                  <div
                    key={item.id}
                    className={'border rounded-2xl p-3 ' +
                      (item.status === 'hidden' ? 'border-yellow-500/20 bg-yellow-500/[0.04]' : 'border-white/[0.06] bg-white/[0.03]')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {item.users?.avatar_url
                            ? <img src={item.users.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                            : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-[9px]">{item.users?.display_name?.[0]?.toUpperCase()}</div>
                          }
                          <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
                          <p className="text-[#6B7280] text-[12px]">@{item.users?.username}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.status === 'hidden' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                            {item.status || 'active'}
                          </span>
                        </div>
                        <p className="text-white/75 text-[13px] line-clamp-2">
                          {contentTab === 'posts' ? (item.caption || '[No caption]') : item.body}
                        </p>
                        {item.moderation_reason && (
                          <p className="text-[#6B7280] text-[11px] mt-1 italic">Reason: "{item.moderation_reason}"</p>
                        )}
                        <p className="text-[#6B7280] text-[11px] mt-1">{formatTime(item.created_at)}</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setSelectedType(contentTab === 'posts' ? 'post' : 'comment');
                        }}
                        className="flex-shrink-0 px-3 py-2 bg-white/[0.06] hover:bg-[#FF6B35]/20 border border-white/10 hover:border-[#FF6B35]/40 rounded-xl text-white text-xs font-bold transition-all"
                      >
                        Moderate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── REPORTS ── */}
        {section === 'reports' && (
          <div className="space-y-2">
            {reports.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No reports yet.</p></div>
            ) : reports.map(r => (
              <div
                key={r.id}
                className={'border rounded-2xl p-3 ' +
                  (r.status === 'pending'  ? 'border-red-500/20 bg-red-500/[0.04]' :
                   r.status === 'resolved' ? 'border-green-500/20 bg-green-500/[0.04]' :
                   'border-white/[0.06] bg-white/[0.03]')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'pending'  ? 'bg-red-500/20 text-red-400' :
                        r.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                        'bg-[#6B7280]/20 text-[#6B7280]'}`}>
                        {r.status}
                      </span>
                      <span className="text-[#6B7280] text-[10px] bg-white/5 px-1.5 py-0.5 rounded-full">{r.target_type}</span>
                    </div>
                    <p className="text-white/85 text-[13px]">
                      <span className="font-bold text-white">{r.reporter?.display_name || 'User'}</span>
                      {' reported: '}
                      <span className="text-yellow-400 font-semibold">{r.reason}</span>
                    </p>
                    {r.details && <p className="text-[#6B7280] text-[12px] mt-0.5">"{r.details}"</p>}
                    <p className="text-[#6B7280] text-[11px] mt-1">{formatTime(r.created_at)}</p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => resolveReport(r.id, 'resolved')}
                        className="px-2.5 py-1.5 bg-green-500/15 border border-green-500/30 rounded-xl text-green-400 text-[11px] font-bold hover:bg-green-500/25 transition-colors"
                      >
                        ✅ Resolve
                      </button>
                      <button
                        onClick={() => resolveReport(r.id, 'ignored')}
                        className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[#6B7280] text-[11px] font-bold hover:bg-white/10 transition-colors"
                      >
                        Ignore
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LOGS ── */}
        {section === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No admin actions yet.</p></div>
            ) : logs.map(log => (
              <div key={log.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-white font-bold text-[13px]">{log.admin?.display_name || 'System'}</span>
                      <span className="text-[#6B7280] text-[12px]">→</span>
                      <span className="text-[#1E6FFF] font-semibold text-[13px]">{log.target?.display_name || 'Content'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        log.action.includes('ban')      ? 'bg-red-500/20 text-red-400' :
                        log.action.includes('suspend')  ? 'bg-orange-500/20 text-orange-400' :
                        log.action.includes('warn')     ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action.includes('delete')   ? 'bg-red-500/20 text-red-400' :
                        log.action.includes('hide')     ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action.startsWith('un') || log.action.includes('restore') || log.action.includes('unrestrict')
                                                        ? 'bg-green-500/20 text-green-400' :
                        'bg-[#1E6FFF]/20 text-[#1E6FFF]'
                      }`}>{log.action}</span>
                      {log.details && <span className="text-[#6B7280] text-[11px] truncate max-w-[180px]">"{log.details}"</span>}
                    </div>
                  </div>
                  <span className="text-[#6B7280] text-[10px] flex-shrink-0 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── WARNINGS ── */}
        {section === 'warnings' && (
          <div className="space-y-2">
            {warnings.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No warnings issued yet.</p></div>
            ) : warnings.map(w => (
              <div key={w.id} className="bg-yellow-500/[0.05] border border-yellow-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-3 mb-2">
                  {w.user?.avatar_url
                    ? <img src={w.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-sm flex-shrink-0">⚠️</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[13px]">{w.user?.display_name}</p>
                    <p className="text-[#6B7280] text-[11px]">by {w.issuer?.display_name} · {formatTime(w.created_at)}</p>
                  </div>
                  {isMod && (
                    <button
                      onClick={() => deleteWarning(w.id)}
                      className="text-[#6B7280] hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-white/75 text-[13px] bg-white/[0.04] rounded-xl px-3 py-2">"{w.reason}"</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── USER ACTION MODAL ── */}
      {selectedUser && (
        <UserActionModal
          target={selectedUser}
          myRole={myRole}
          onClose={() => setSelectedUser(null)}
          onSuccess={handleUserActionSuccess}
        />
      )}

      {/* ── CONTENT MODERATION MODAL ── */}
      {selectedItem && (
        <ContentModal
          item={selectedItem}
          type={selectedType}
          onClose={() => setSelectedItem(null)}
          onSuccess={() => {
            fetchPosts();
            fetchComments();
            fetchStats();
            fetchLogs();
          }}
        />
      )}
    </div>
  );
}