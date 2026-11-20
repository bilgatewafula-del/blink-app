import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { verifyAdminServer } from '../../utils/securityUtils';
import { formatNumber } from '../../utils/formatNumber';
import VerifiedBadge from '../../components/VerifiedBadge';
import {
  Shield, Users, AlertTriangle, Ban, Clock,
  XCircle, ArrowLeft, Trash2, Search,
  RefreshCw, Activity, UserCheck, AlertOctagon,
  EyeOff, Eye, RotateCcw, FileText, Flag,
  CheckCircle, ChevronDown, Lock, ShieldAlert,
} from 'lucide-react';

/* ══════════════════════════════════════════════
   SECURITY NOTE
   Every privileged write below calls a SECURITY DEFINER RPC
   (see 04_actual_schema_rpcs.sql) instead of writing tables
   directly. The RPC re-checks the caller's role server-side,
   writes its own admin_logs row, and sends the target's
   notification — the client never inserts admin_logs or
   notifications for another user, and never has a code path
   that can set role/is_banned/coins_balance/etc. directly.
   The duplicate `verifyAdminServer`import from the original
   file has also been removed (it appeared twice).
══════════════════════════════════════════════ */

/* ══════════════════════════════════════════════
   ROLE / STATUS HELPERS
══════════════════════════════════════════════ */
const ROLE_COLORS = {
  blink:     { bg:'#FFD700', label:'B-Link' },
  admin:     { bg:'#EF4444', label:'Admin'  },
  moderator: { bg:'#FF2D78', label:'Mod'    },
  user:      { bg:'#3d3b38', label:'User'   },
};

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.user;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"style={{ background: c.bg + '25', color: c.bg, border: '1px solid ' + c.bg + '40' }}>
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
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"style={{ background: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-white font-bold text-xl leading-none">{formatNumber(value)}</p>
        <p className="text-[#8E8C88] text-xs mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   USER ACTION MODAL
   Every action now calls a protected RPC. The RPC itself
   re-verifies the caller's role (moderator/admin/blink) —
   the `allowed`flags below remain purely for UI/UX and are
   NOT the security boundary.
══════════════════════════════════════════════ */
function PrivateDetails({ target }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    supabase.rpc('admin_get_user_private', { p_user_id: target.id }).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(/does not exist|could not find/i.test(error.message || '') ? 'Account details need the latest database update.' : error.message);
      else setD(data);
    });
    return () => { live = false; };
  }, [target.id]);
  const when = (t) => (t ? new Date(t).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-');
  const rows = d ? [
    ['Email', d.login_email || d.email || '-'], ['Phone', d.phone || d.phone_number || '-'],
    ['Email confirmed', d.email_confirmed ? 'Yes' : 'No'], ['Last sign-in', when(d.last_sign_in_at)],
    ['Birthday', d.date_of_birth || '-'], ['Gender', d.gender || '-'],
    ['Coins', d.coins_balance ?? 0], ['Plan until', when(d.subscription_expires_at)],
  ] : [];
  return (
    <div className="mx-5 mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
      <p className="text-[#8E8C88] text-[10px] font-bold uppercase tracking-wider mb-2">Account details (staff only)</p>
      {err ? <p className="text-red-400 text-xs">{err}</p> : !d ? <p className="text-[#8E8C88] text-xs">Loading…</p> : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0"><p className="text-[#8E8C88] text-[10px]">{k}</p><p className="text-white text-[12px] font-medium break-all">{String(v)}</p></div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserActionModal({ target, myRole, onClose, onSuccess }) {
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
    { key:'warn',       Icon: AlertTriangle, label:'Warn user',        desc:'Send an official warning',                 need:'Moderator', allowed: isMod  },
    { key:'restrict',   Icon: EyeOff,        label:'Restrict user',    desc:'Block from posting and commenting',        need:'Admin',     allowed: isAdmin },
    { key:'unrestrict', Icon: RotateCcw,     label:'Remove restriction', desc:'Restore full posting access',            need:'Admin',     allowed: isAdmin },
    { key:'suspend',    Icon: Clock,         label:'Suspend user',     desc:'Temporarily block account access',         need:'Admin',     allowed: isAdmin },
    { key:'unsuspend',  Icon: RotateCcw,     label:'Unsuspend user',   desc:'Lift the suspension immediately',          need:'Admin',     allowed: isAdmin },
    { key:'ban',        Icon: Ban,           label:'Permanently ban',  desc:'Block all access, keep their data',        need:'B-Link',    allowed: isBlink },
    { key:'unban',      Icon: UserCheck,     label:'Unban user',       desc:'Restore full account access',              need:'B-Link',    allowed: isBlink },
    { key:'role',       Icon: Shield,        label:'Change role',      desc:'Promote or demote this user',              need:'B-Link',    allowed: isBlink },
    { key:'delete',     Icon: Trash2,        label:'Delete account everywhere', desc:'Erase the account, profile, posts, chats and login',  need:'B-Link', allowed: isBlink, danger: true },
  ];
  const NO_REASON = 'No reason provided';
  const [confirmText, setConfirmText] = useState('');

  const handleSubmit = async () => {
    if (!action) { setError('Please select an action.'); return; }
    const chosen = ACTIONS.find((x) => x.key === action);
    if (!chosen?.allowed) { setError('Your role cannot perform this action.'); return; }
    if (action === 'delete' && confirmText.trim().replace(/^@/, '').toLowerCase() !== (target.username || '').toLowerCase()) {
      setError(`Type @${target.username} to confirm.`); return;
    }
    const why = reason.trim() || NO_REASON;

    setLoading(true); setError('');

    try {
      switch (action) {
        case 'warn': {
          const { error: e } = await supabase.rpc('admin_warn_user', {
            p_target_id: target.id, p_reason: why,
          });
          if (e) throw new Error(e.message);
          setDone(`Warning sent to @${target.username}`);
          break;
        }

        case 'restrict': {
          const { error: e } = await supabase.rpc('admin_restrict_user', {
            p_target_id: target.id, p_reason: why,
          });
          if (e) throw new Error(e.message);
          setDone(`@${target.username} is now restricted`);
          break;
        }

        case 'unrestrict': {
          const { error: e } = await supabase.rpc('admin_unrestrict_user', {
            p_target_id: target.id,
          });
          if (e) throw new Error(e.message);
          setDone(`Restriction removed from @${target.username}`);
          break;
        }

        case 'suspend': {
          const { error: e } = await supabase.rpc('admin_suspend_user', {
            p_target_id: target.id, p_days: days, p_reason: why,
          });
          if (e) throw new Error(e.message);
          setDone(`@${target.username} suspended for ${days} day(s)`);
          break;
        }

        case 'unsuspend': {
          const { error: e } = await supabase.rpc('admin_unsuspend_user', {
            p_target_id: target.id,
          });
          if (e) throw new Error(e.message);
          setDone(`@${target.username} is now unsuspended`);
          break;
        }

        case 'ban': {
          const { error: e } = await supabase.rpc('admin_ban_user', {
            p_target_id: target.id, p_reason: why,
          });
          if (e) throw new Error(e.message);
          // NOTE: session revocation now happens server-side (see RPC
          // comment). Do not call supabase.auth.admin.signOut here —
          // it needs the service_role key, which must never ship to
          // the browser.
          setDone(`@${target.username} has been permanently banned`);
          break;
        }

        case 'unban': {
          const { error: e } = await supabase.rpc('admin_unban_user', {
            p_target_id: target.id,
          });
          if (e) throw new Error(e.message);
          setDone(`@${target.username} has been unbanned`);
          break;
        }

        case 'role': {
          if (newRole === target.role) { setError('User already has this role.'); setLoading(false); return; }
          const { error: e } = await supabase.rpc('admin_change_role', {
            p_target_id: target.id, p_new_role: newRole,
          });
          if (e) throw new Error(e.message);
          setDone(`@${target.username} is now a ${newRole}`);
          break;
        }

        case 'delete': {
          // One server-side call removes the account everywhere: login,
          // profile, posts, comments, chats, follows, notifications...
          let res = await supabase.rpc('admin_purge_user', { p_target_id: target.id, p_reason: reason.trim() || null });
          if (res.error && /does not exist|could not find/i.test(res.error.message || '')) {
            // purge function not installed yet -> older delete routine
            res = await supabase.rpc('admin_delete_user', { p_target_id: target.id, p_reason: reason.trim() || null });
          }
          if (res.error) throw new Error(res.error.message);

          setDone(`@${target.username} has been permanently deleted`);
          setTimeout(() => { onSuccess('deleted', target.id); onClose(); }, 1500);
          setLoading(false);
          return;
        }

        default:
          throw new Error('Unknown action: ' + action);
      }
      // Audit logging happens inside every RPC above — no client
      // admin_logs insert here anymore.

    } catch (err) {
      console.error('Admin action error:', err.message);
      setError(err.message || 'Action failed. Check your permissions and try again.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setTimeout(() => { onSuccess(action, target.id); onClose(); }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center"onClick={onClose}>
      <div
        className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto"onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {target.avatar_url
              ? <img src={target.avatar_url} alt=""className="w-11 h-11 rounded-full object-cover" />
              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-lg">{target.display_name?.[0]?.toUpperCase()}</div>
            }
            <div>
              <p className="text-white font-bold text-[15px]">{target.display_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <RoleBadge role={target.role} />
                <StatusBadge u={target} />
              </div>
              <p className="text-[#8E8C88] text-xs mt-0.5">@{target.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white p-1">
            <XCircle size={22} />
          </button>
        </div>
        <PrivateDetails target={target} />

        {done ? (
          <div className="text-center py-8">
            <CheckCircle size={52} className="text-[#2ECC71] mx-auto mb-3" />
            <p className="text-white font-bold text-lg">{done}</p>
            <p className="text-[#8E8C88] text-sm mt-1">Action completed successfully</p>
          </div>
        ) : (
          <>
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Select Action</p>
            <div className="space-y-1.5 mb-4">
              {ACTIONS.map(a => (
                <button
                  key={a.key}
                  disabled={!a.allowed}
                  onClick={() => { if (a.allowed) { setAction(a.key); setError(''); setConfirmText(''); } }}
                  className={'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border disabled:opacity-45 ' +
                    (action === a.key
                      ? (a.danger ? 'bg-red-500/15 border-red-500/50' : 'bg-[#FF5A1F]/15 border-[#FF5A1F]/50')
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]')}
                >
                  <a.Icon size={18} className={(a.danger ? 'text-red-400' : 'text-[#FF5A1F]') + 'mt-0.5 flex-shrink-0'} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${action === a.key ? 'text-white' : 'text-white/80'}`}>{a.label}</p>
                    <p className="text-[#8E8C88] text-[11px] mt-0.5">{a.allowed ? a.desc : `Requires ${a.need} role`}</p>
                  </div>
                  {!a.allowed && <Lock size={14} className="text-[#8E8C88] flex-shrink-0 mt-1" />}
                  {action === a.key && <CheckCircle size={16} className="text-[#FF5A1F] flex-shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>

            {action === 'suspend' && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Suspension Duration</p>
                <div className="flex gap-2 flex-wrap">
                  {[1, 3, 7, 14, 30].map(d => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all ' +
                        (days === d ? 'bg-[#FF5A1F]/20 border-[#FF5A1F]/50 text-[#FF5A1F]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                    >
                      {d} day{d > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {action === 'role' && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Assign New Role</p>
                <div className="flex gap-2 flex-wrap">
                  {['user', 'moderator', 'admin'].map(r => (
                    <button
                      key={r}
                      onClick={() => setNewRole(r)}
                      className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ' +
                        (newRole === r ? 'bg-[#FF5A1F]/20 border-[#FF5A1F]/50 text-[#FF5A1F]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-[#8E8C88] text-xs mt-2">Current role: <span className="text-white font-semibold">{target.role}</span></p>
                <p className="text-[#8E8C88] text-[10px] mt-1">The blink role can never be assigned from this panel — server-enforced, not just hidden.</p>
              </div>
            )}

            {action && (
              <div className="mb-4">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">
                  Reason (optional)
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/50 resize-none"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[#8E8C88] text-[10px]">{reason.length}/300</span>
                </div>
                {action === 'delete' && (
                  <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-red-300 text-[12px] leading-snug">
                      This permanently erases @{target.username}: their login, profile, posts, comments, chats, follows and notifications.
                      It cannot be undone.
                    </p>
                    <input
                      value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={`Type @${target.username} to confirm`}
                      className="mt-2 w-full bg-black/30 border border-red-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !action || (action === 'delete' && confirmText.trim().replace(/^@/, '').toLowerCase() !== (target.username || '').toLowerCase())}
              className="w-full py-4 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"style={{
                background:
                  ['ban','delete'].includes(action)                         ? 'linear-gradient(135deg, #EF4444, #DC2626)' :
                  ['unban','unsuspend','unrestrict'].includes(action)       ? 'linear-gradient(135deg, #2ECC71, #16A34A)' :
                  '#FF5A1F',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                : action === 'delete' ? 'Delete account everywhere'
                : action === 'ban'    ? 'Permanently ban user'
                : action === 'unban'  ? 'Unban user'
                : 'Confirm action'
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   CONTENT MODERATION MODAL — hide/restore/delete now go through
   admin_moderate_content(), which re-checks role server-side
   (hide/restore = moderator+, delete = admin+ — see SQL file's
   flagged assumption, adjust the RPC if your intended tiers differ).
══════════════════════════════════════════════ */
function ContentModal({ item, type, onClose, onSuccess }) {
  const [action,  setAction]  = useState('');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState('');

  const itemText = type === 'post' ? (item.caption || '[No caption]') : (item.body || '[No text]');

  const handleSubmit = async () => {
    if (!action) { setError('Select an action.'); return; }
    setLoading(true); setError('');

    try {
      const { error: e } = await supabase.rpc('admin_moderate_content', {
        p_type: type,
        p_item_id: item.id,
        p_action: action,
        p_reason: reason.trim() || null,
      });
      if (e) throw new Error(e.message);

      setDone(
        action === 'delete'  ? `${type === 'post' ? 'Post' : 'Comment'} permanently deleted` :
        action === 'hide'    ? `${type === 'post' ? 'Post' : 'Comment'} hidden from feed` :
        `${type === 'post' ? 'Post' : 'Comment'} restored successfully`
      );

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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center"onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8"onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Moderate {type === 'post' ? 'Post' : 'Comment'}</h3>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white"><XCircle size={20} /></button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-white font-bold">{done}</p>
          </div>
        ) : (
          <>
            <div className={'border rounded-2xl p-4 mb-4 ' +
              (item.status === 'hidden'  ? 'border-yellow-500/25 bg-yellow-500/[0.05]' :
               item.status === 'deleted' ? 'border-red-500/25 bg-red-500/[0.05]' :
               'border-white/10 bg-white/[0.03]')}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {item.users?.avatar_url
                  ? <img src={item.users.avatar_url} alt=""className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-xs">{item.users?.display_name?.[0]?.toUpperCase()}</div>
                }
                <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
                <p className="text-[#8E8C88] text-[12px]">@{item.users?.username}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  item.status === 'hidden'  ? 'bg-yellow-500/20 text-yellow-400' :
                  item.status === 'deleted' ? 'bg-red-500/20 text-red-400' :
                  'bg-green-500/20 text-green-400'}`}>
                  {item.status || 'active'}
                </span>
              </div>
              <p className="text-white/75 text-[13px] leading-snug line-clamp-4">{itemText}</p>
              {item.moderation_reason && (
                <p className="text-[#8E8C88] text-[11px] mt-2 italic">Previous reason: "{item.moderation_reason}"</p>
              )}
            </div>

            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Action</p>
            <div className="space-y-1.5 mb-4">
              {[
                { key:'hide',    label:'Hide content',       desc:'Remove from feeds. User can still see it on their profile.', show: item.status !== 'hidden'  },
                { key:'restore', label:'Restore content',    desc:'Make visible again in all feeds.',                           show: item.status === 'hidden'  },
                { key:'delete',  label:'Delete permanently', desc:'Permanently erase. Cannot be undone.',                       show: item.status !== 'deleted' },
              ].filter(a => a.show).map(a => (
                <button
                  key={a.key}
                  onClick={() => { setAction(a.key); setError(''); }}
                  className={'w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all border ' +
                    (action === a.key
                      ? 'bg-[#FF5A1F]/15 border-[#FF5A1F]/50'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]')}
                >
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${action === a.key ? 'text-white' : 'text-white/80'}`}>{a.label}</p>
                    <p className="text-[#8E8C88] text-[11px] mt-0.5">{a.desc}</p>
                  </div>
                  {action === a.key && <CheckCircle size={16} className="text-[#FF5A1F] flex-shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>

            {action && action !== 'restore' && (
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (optional)..."rows={2}
                maxLength={200}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#8E8C88] focus:outline-none resize-none mb-4"
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
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all"style={{
                background:
                  action === 'delete'  ? 'linear-gradient(135deg, #EF4444, #DC2626)' :
                  action === 'restore' ? 'linear-gradient(135deg, #2ECC71, #16A34A)' :
                  '#FF6B35',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>
                : action === 'delete'  ? 'Delete Permanently'
                : action === 'hide'    ? 'Hide Content'
                : action === 'restore' ? 'Restore Content'
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
  const usersRef = useRef([]);
  const [checkOpen,     setCheckOpen]    = useState(false);
  const [checkResult,   setCheckResult]  = useState(null);
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
    verifyAdminServer().then(ok => {
      if (!ok) {
        console.warn('[Security] Server-side admin check failed');
        navigate('/');
        return;
      }
      fetchAll();
    });
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchUsers(), fetchReports(), fetchLogs(), fetchWarnings()]);
    setLoading(false);
  };

  usersRef.current = users;

  // Live results: any account change anywhere refreshes the numbers and list.
  useEffect(() => {
    let t;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => { fetchStats(); fetchUsers(); }, 600); };
    // Users update their last_seen every minute; only react to changes that matter here.
    const relevant = (p) => {
      if (p.eventType !== 'UPDATE') return true;
      const cur = usersRef.current.find((u) => u.id === p.new?.id);
      if (!cur) return true;
      return ['is_banned', 'is_restricted', 'suspended_until', 'role'].some((k) => (cur[k] ?? null) !== (p.new[k] ?? null));
    };
    const ch = supabase.channel('admin-live:' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (p) => { if (relevant(p)) refresh(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => { fetchReports(); fetchStats(); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSystemCheck = async () => {
    setCheckOpen(true); setCheckResult({ loading: true });
    const { data, error } = await supabase.rpc('admin_system_check');
    if (error) {
      setCheckResult({ error: /does not exist|could not find/i.test(error.message || '')
        ? 'The admin database script has not been installed yet. Run chat-admin-system.sql in the Supabase SQL Editor.'
        : error.message });
    } else setCheckResult(data);
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
      .select('id,username,display_name,avatar_url,role,is_banned,is_restricted,suspended_until,created_at,followers_count,posts_count')
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchUsers:', error.message); return; }
    // reasons are private: staff read them through a protected function
    const { data: reasons } = await supabase.rpc('admin_user_reasons');
    const byId = {};
    (Array.isArray(reasons) ? reasons : []).forEach((r) => { byId[r.id] = r; });
    setUsers((data || []).map((u) => ({ ...u, ban_reason: byId[u.id]?.ban_reason || null, restriction_reason: byId[u.id]?.restriction_reason || null })));
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

  // Report resolution and warning deletion now go through RPCs too —
  // both were direct client writes to staff-only-relevant tables.
  const resolveReport = async (reportId, status) => {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: reportId, p_status: status,
    });
    if (error) { alert('Failed to resolve report: ' + error.message); return; }
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status, resolved_by: user.id } : r));
    fetchStats();
  };

  const deleteWarning = async (wid) => {
    const { error } = await supabase.rpc('admin_delete_warning', { p_warning_id: wid });
    if (error) { alert('Failed to delete warning: ' + error.message); return; }
    setWarnings(prev => prev.filter(w => w.id !== wid));
  };

  const handleUserActionSuccess = (action, userId) => {
    if (action === 'deleted') {
      setUsers(prev => prev.filter(u => u.id !== userId));
    } else {
      fetchUsers();
    }
    fetchStats();
    fetchLogs();
  };

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
    <div className="min-h-screen bg-[#0D0C0B] pb-20">

      <div className="sticky top-0 z-30 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-[#FF2D78] flex items-center justify-center">
              <Shield size={16} color="white" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">Admin Panel</p>
              <p className="text-[#8E8C88] text-[11px]">{ROLE_COLORS[myRole]?.label || 'Staff'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runSystemCheck} aria-label="System check"className="text-[#8E8C88] hover:text-white p-1 transition-colors">
            <ShieldAlert size={18} />
          </button>
          <button onClick={fetchAll} aria-label="Refresh"className="text-[#8E8C88] hover:text-white p-1 transition-colors">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

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
                ? 'bg-[#FF5A1F] text-white border-[#FF5A1F] shadow-lg shadow-[#FF5A1F]/30'
                : 'text-[#8E8C88] border-white/10 hover:border-white/20 hover:text-white')}
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

        {section === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users}         label="Total Users"value={stats.total          || 0} color="#FF5A1F" />
              <StatCard icon={UserCheck}     label="Staff"value={stats.staff          || 0} color="#FF2D78" />
              <StatCard icon={AlertTriangle} label="Restricted"value={stats.restricted     || 0} color="#FFD700" />
              <StatCard icon={Clock}         label="Suspended"value={stats.suspended      || 0} color="#FF6B35" />
              <StatCard icon={Ban}           label="Banned"value={stats.banned         || 0} color="#EF4444" />
              <StatCard icon={Flag}          label="Open Reports"value={stats.pendingReports || 0} color="#EF4444" />
              <StatCard icon={EyeOff}        label="Hidden Posts"value={stats.hiddenPosts    || 0} color="#8E8C88" />
              <StatCard icon={Activity}      label="Total Posts"value={stats.totalPosts     || 0} color="#2ECC71" />
            </div>

            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
              <p className="text-white font-bold mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Manage Users',   key:'users',   color:'#FF5A1F' },
                  { label:'Open Reports',   key:'reports', color:'#EF4444', count: stats.pendingReports },
                  { label:'Moderate Posts', key:'content', color:'#FF6B35' },
                  { label:'View Logs',      key:'logs',    color:'#2ECC71' },
                ].map(a => (
                  <button
                    key={a.key}
                    onClick={() => { setSection(a.key); if (a.key === 'content') { fetchPosts(); fetchComments(); } }}
                    className="py-3 px-4 rounded-xl text-sm font-bold transition-all hover:opacity-80 relative"style={{ background: a.color + '18', border: '1px solid ' + a.color + '35', color: a.color }}
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

        {section === 'users' && (
          <div>
            <div className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 mb-3">
              <Search size={16} className="text-[#8E8C88]" />
              <input
                type="text"value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or username..."className="flex-1 bg-transparent text-white text-sm placeholder-[#8E8C88] focus:outline-none"
              />
              {search && <button onClick={() => setSearch('')} className="text-[#8E8C88] hover:text-white"><XCircle size={16} /></button>}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
              {['All','Active','Restricted','Suspended','Banned'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                    (statusFilter === tab ? 'bg-[#FF5A1F] text-white border-[#FF5A1F]' : 'text-[#8E8C88] border-white/10 hover:border-white/20')}
                >
                  {tab}
                  {tab === 'Banned' && stats.banned > 0 && <span className="ml-1 text-red-400">({stats.banned})</span>}
                </button>
              ))}
            </div>

            <p className="text-[#8E8C88] text-xs mb-2">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} shown</p>

            {loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#8E8C88]">No users found.</p></div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt=""className="w-10 h-10 rounded-full object-cover" />
                        : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-sm">{u.display_name?.[0]?.toUpperCase()}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-white font-bold text-[13px] truncate">{u.display_name}</p>
                        {u.is_verified && <VerifiedBadge size={13} />}
                        <RoleBadge role={u.role} />
                      </div>
                      <p className="text-[#8E8C88] text-[12px]">@{u.username}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge u={u} />
                        <span className="text-[#8E8C88] text-[10px]">{formatNumber(u.followers_count||0)} followers · {formatNumber(u.posts_count||0)} posts</span>
                      </div>
                      {u.ban_reason && (
                        <p className="text-[#8E8C88] text-[10px] mt-0.5 truncate">Reason: "{u.ban_reason}"</p>
                      )}
                    </div>
                    {u.role !== 'blink' ? (
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex-shrink-0 px-3 py-2 bg-white/[0.06] hover:bg-[#FF5A1F]/20 border border-white/10 hover:border-[#FF5A1F]/40 rounded-xl text-white text-xs font-bold transition-all"
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
                    (contentTab === t.key ? 'bg-[#FF5A1F]/20 border-[#FF5A1F]/50 text-[#FF5A1F]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            {(contentTab === 'posts' ? posts : comments).length === 0 ? (
              <div className="text-center py-10"><p className="text-[#8E8C88]">No {contentTab} to moderate.</p></div>
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
                            ? <img src={item.users.avatar_url} alt=""className="w-6 h-6 rounded-full object-cover" />
                            : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-[9px]">{item.users?.display_name?.[0]?.toUpperCase()}</div>
                          }
                          <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
                          <p className="text-[#8E8C88] text-[12px]">@{item.users?.username}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.status === 'hidden' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                            {item.status || 'active'}
                          </span>
                        </div>
                        <p className="text-white/75 text-[13px] line-clamp-2">
                          {contentTab === 'posts' ? (item.caption || '[No caption]') : item.body}
                        </p>
                        {item.moderation_reason && (
                          <p className="text-[#8E8C88] text-[11px] mt-1 italic">Reason: "{item.moderation_reason}"</p>
                        )}
                        <p className="text-[#8E8C88] text-[11px] mt-1">{formatTime(item.created_at)}</p>
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

        {section === 'reports' && (
          <div className="space-y-2">
            {reports.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#8E8C88]">No reports yet.</p></div>
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
                        'bg-[#8E8C88]/20 text-[#8E8C88]'}`}>
                        {r.status}
                      </span>
                      <span className="text-[#8E8C88] text-[10px] bg-white/5 px-1.5 py-0.5 rounded-full">{r.target_type}</span>
                    </div>
                    <p className="text-white/85 text-[13px]">
                      <span className="font-bold text-white">{r.reporter?.display_name || 'User'}</span>
                      {'reported: '}
                      <span className="text-yellow-400 font-semibold">{r.reason}</span>
                    </p>
                    {r.details && <p className="text-[#8E8C88] text-[12px] mt-0.5">"{r.details}"</p>}
                    <p className="text-[#8E8C88] text-[11px] mt-1">{formatTime(r.created_at)}</p>
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
                        className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[#8E8C88] text-[11px] font-bold hover:bg-white/10 transition-colors"
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

        {section === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#8E8C88]">No admin actions yet.</p></div>
            ) : logs.map(log => (
              <div key={log.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-white font-bold text-[13px]">{log.admin?.display_name || 'System'}</span>
                      <span className="text-[#8E8C88] text-[12px]">→</span>
                      <span className="text-[#FF5A1F] font-semibold text-[13px]">{log.target?.display_name || 'Content'}</span>
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
                        'bg-[#FF5A1F]/20 text-[#FF5A1F]'
                      }`}>{log.action}</span>
                      {log.details && <span className="text-[#8E8C88] text-[11px] truncate max-w-[180px]">"{log.details}"</span>}
                    </div>
                  </div>
                  <span className="text-[#8E8C88] text-[10px] flex-shrink-0 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'warnings' && (
          <div className="space-y-2">
            {warnings.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#8E8C88]">No warnings issued yet.</p></div>
            ) : warnings.map(w => (
              <div key={w.id} className="bg-yellow-500/[0.05] border border-yellow-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-3 mb-2">
                  {w.user?.avatar_url
                    ? <img src={w.user.avatar_url} alt=""className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-sm flex-shrink-0">⚠️</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[13px]">{w.user?.display_name}</p>
                    <p className="text-[#8E8C88] text-[11px]">by {w.issuer?.display_name} · {formatTime(w.created_at)}</p>
                  </div>
                  {isMod && (
                    <button
                      onClick={() => deleteWarning(w.id)}
                      className="text-[#8E8C88] hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition-colors flex-shrink-0"
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

      {selectedUser && (
        <UserActionModal
          target={selectedUser}
          myRole={myRole}
          onClose={() => setSelectedUser(null)}
          onSuccess={handleUserActionSuccess}
        />
      )}

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

      {checkOpen && (
        <div className="fixed inset-0 bg-black/75 z-[60] flex items-end justify-center"onClick={() => setCheckOpen(false)}>
          <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-bold text-base mb-1">System check</p>
            <p className="text-[#8E8C88] text-xs mb-4">Confirms every admin and chat function the app calls exists in the database.</p>
            {checkResult?.loading && <p className="text-[#8E8C88] text-sm py-6 text-center">Checking…</p>}
            {checkResult?.error && <p className="text-red-400 text-sm">{checkResult.error}</p>}
            {checkResult && !checkResult.loading && !checkResult.error && (
              <>
                <p className={'text-sm font-bold mb-2 ' + ((checkResult.missing || []).length === 0 ? 'text-[#2ECC71]' : 'text-red-400')}>
                  {(checkResult.missing || []).length === 0 ? 'Everything is installed' : `${checkResult.missing.length} missing`}
                </p>
                {(checkResult.missing || []).map((n) => <p key={n} className="text-red-300 text-[13px] py-1">Missing: {n}</p>)}
                {(checkResult.ok || []).map((n) => <p key={n} className="text-white/50 text-[12px] py-0.5">OK: {n}</p>)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}