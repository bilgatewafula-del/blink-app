import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  Shield, Users, AlertTriangle, Ban, Clock,
  CheckCircle, XCircle, ArrowLeft, Trash2,
  Search, RefreshCw, Activity, UserCheck,
  AlertOctagon, Eye, EyeOff, RotateCcw,
  FileText, MessageSquare, Flag, Star,
} from 'lucide-react';

const ROLE_COLORS = {
  blink:     { bg:'#FFD700', label:'B-Link' },
  admin:     { bg:'#EF4444', label:'Admin' },
  moderator: { bg:'#7B2FFF', label:'Mod' },
  user:      { bg:'#374151', label:'User' },
};

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

/* ── User action modal ─────────────────────────── */
function UserActionModal({ target, myRole, onClose, onSuccess }) {
  const { user }  = useAuth();
  const [action,  setAction]  = useState('');
  const [reason,  setReason]  = useState('');
  const [days,    setDays]    = useState(7);
  const [newRole, setNewRole] = useState(target.role || 'user');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const isBlink = myRole === 'blink';
  const isAdmin = myRole === 'admin' || isBlink;
  const isMod   = myRole === 'moderator' || isAdmin;

  const actions = [
    { key:'warn',       label:'⚠️  Warn user',          allowed: isMod },
    { key:'restrict',   label:'🟡 Restrict user',        allowed: isAdmin },
    { key:'unrestrict', label:'✅ Remove restriction',   allowed: isAdmin },
    { key:'suspend',    label:'🔵 Suspend user',         allowed: isAdmin },
    { key:'unsuspend',  label:'✅ Unsuspend user',       allowed: isAdmin },
    { key:'ban',        label:'🔴 Permanently ban',      allowed: isBlink },
    { key:'unban',      label:'✅ Unban user',           allowed: isBlink },
    { key:'role',       label:'👑 Change role',          allowed: isBlink },
    { key:'delete',     label:'🗑️  Delete account',      allowed: isBlink },
  ].filter(a => a.allowed);

  const handleSubmit = async () => {
    if (!action) { setError('Select an action.'); return; }
    if (['warn','restrict','suspend','ban'].includes(action) && !reason.trim()) { setError('Enter a reason.'); return; }
    setLoading(true); setError('');
    try {
      let updates = {};
      let logDetails = reason;

      switch (action) {
        case 'warn':
          await supabase.from('warnings').insert({ user_id: target.id, issued_by: user.id, reason: reason.trim() });
          break;
        case 'restrict':
          updates = { is_restricted: true, restriction_reason: reason.trim() }; break;
        case 'unrestrict':
          updates = { is_restricted: false, restriction_reason: null }; logDetails = 'Restriction removed'; break;
        case 'suspend':
          const until = new Date(); until.setDate(until.getDate() + days);
          updates = { suspended_until: until.toISOString(), ban_reason: reason.trim() };
          logDetails = `Suspended ${days} days: ${reason}`; break;
        case 'unsuspend':
          updates = { suspended_until: null, ban_reason: null }; logDetails = 'Suspension lifted'; break;
        case 'ban':
          updates = { is_banned: true, ban_reason: reason.trim() }; break;
        case 'unban':
          updates = { is_banned: false, ban_reason: null }; logDetails = 'Ban lifted'; break;
        case 'role':
          updates = { role: newRole }; logDetails = `Role → ${newRole}`; break;
        case 'delete':
          if (!window.confirm(`Permanently delete @${target.username}?`)) { setLoading(false); return; }
          await supabase.from('users').delete().eq('id', target.id);
          await supabase.from('admin_logs').insert({ admin_id: user.id, target_user_id: target.id, action: 'delete_account', details: reason });
          onSuccess(); onClose(); return;
        default: break;
      }

      if (Object.keys(updates).length) await supabase.from('users').update(updates).eq('id', target.id);

      await supabase.from('admin_logs').insert({ admin_id: user.id, target_user_id: target.id, action, details: logDetails });

      if (['warn','restrict','suspend','ban'].includes(action)) {
        await supabase.from('notifications').upsert({
          user_id: target.id, from_user_id: user.id, type: 'admin_action',
          message:
            action === 'warn'     ? `⚠️ Warning: ${reason}` :
            action === 'restrict' ? `🟡 Restricted: ${reason}` :
            action === 'suspend'  ? `🔵 Suspended ${days} days: ${reason}` :
            action === 'ban'      ? `🔴 Permanently banned: ${reason}` : '',
          is_read: false,
        }, { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: false });
      }

      onSuccess(); onClose();
    } catch (err) { setError(err.message || 'Action failed.'); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {target.avatar_url
              ? <img src={target.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">{target.display_name?.[0]?.toUpperCase()}</div>
            }
            <div>
              <p className="text-white font-bold">{target.display_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5"><RoleBadge role={target.role} /><StatusBadge u={target} /></div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><XCircle size={22} /></button>
        </div>

        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Select Action</p>
        <div className="grid grid-cols-1 gap-1.5 mb-4">
          {actions.map(a => (
            <button key={a.key} onClick={() => setAction(a.key)}
              className={'w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ' +
                (action === a.key ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-white font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.07]')}>
              {a.label}
            </button>
          ))}
        </div>

        {action === 'suspend' && (
          <div className="mb-3">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Duration</p>
            <div className="flex gap-2 flex-wrap">
              {[1,3,7,14,30].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all ' +
                    (days === d ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        )}

        {action === 'role' && (
          <div className="mb-3">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">New Role</p>
            <div className="flex gap-2 flex-wrap">
              {['user','moderator','admin'].map(r => (
                <button key={r} onClick={() => setNewRole(r)}
                  className={'px-4 py-2 rounded-xl text-sm font-bold border transition-all capitalize ' +
                    (newRole === r ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {action && (
          <div className="mb-4">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">
              {['unrestrict','unsuspend','unban','role'].includes(action) ? 'Note (optional)' : 'Reason *'}
            </p>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Enter reason..." rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/50 resize-none" />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button onClick={handleSubmit} disabled={loading || !action}
          className="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40"
          style={{ background: ['ban','delete'].includes(action) ? '#EF4444' : ['unban','unsuspend','unrestrict'].includes(action) ? '#2ECC71' : '#1E6FFF' }}>
          {loading ? 'Processing...' : 'Confirm Action'}
        </button>
      </div>
    </div>
  );
}

/* ── Content moderation modal ───────────────────── */
function ContentModal({ item, type, onClose, onSuccess }) {
  const { user } = useAuth();
  const [action,  setAction]  = useState('');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!action) return;
    setLoading(true);
    const table  = type === 'post' ? 'posts' : 'comments';
    const status = action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : 'active';

    await supabase.from(table).update({
      status,
      moderated_by: user.id,
      moderated_at: new Date().toISOString(),
      moderation_reason: reason.trim() || null,
    }).eq('id', item.id);

    await supabase.from('admin_logs').insert({
      admin_id: user.id, target_user_id: item.user_id,
      action: `${action}_${type}`,
      details: reason || `${type} ${action}d`,
    });

    // Notify content owner
    if (item.user_id !== user.id) {
      await supabase.from('notifications').upsert({
        user_id: item.user_id, from_user_id: user.id, type: 'admin_action',
        message: action === 'delete'
          ? `🔴 Your ${type} was removed by admin${reason ? ': ' + reason : ''}`
          : action === 'hide'
            ? `🟡 Your ${type} was hidden by admin${reason ? ': ' + reason : ''}`
            : `✅ Your ${type} has been restored`,
        is_read: false,
      }, { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: false });
    }

    setLoading(false); onSuccess(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">Moderate {type === 'post' ? 'Post' : 'Comment'}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><XCircle size={20} /></button>
        </div>

        {/* Content preview */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
            <p className="text-[#6B7280] text-[12px]">@{item.users?.username}</p>
          </div>
          <p className="text-white/70 text-[13px] line-clamp-3">{item.caption || item.body}</p>
          {item.status !== 'active' && (
            <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ' +
              (item.status === 'hidden' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400')}>
              {item.status}
            </span>
          )}
        </div>

        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Action</p>
        <div className="grid grid-cols-1 gap-1.5 mb-4">
          {[
            { key:'hide',    label:'🟡 Hide content (soft remove from feed)' },
            { key:'delete',  label:'🔴 Delete permanently' },
            { key:'restore', label:'✅ Restore hidden content' },
          ].map(a => (
            <button key={a.key} onClick={() => setAction(a.key)}
              className={'w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ' +
                (action === a.key ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-white font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.07]')}>
              {a.label}
            </button>
          ))}
        </div>

        {action && action !== 'restore' && (
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)..." rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none resize-none mb-4" />
        )}

        <button onClick={handleSubmit} disabled={loading || !action}
          className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition-all"
          style={{ background: action === 'delete' ? '#EF4444' : action === 'restore' ? '#2ECC71' : '#FF6B35' }}>
          {loading ? 'Processing...' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN ADMIN PANEL
═══════════════════════════════════════════════ */
export default function AdminPanel() {
  const navigate       = useNavigate();
  const { user, profile } = useAuth();

  const [section,      setSection]     = useState('overview');  // overview|users|content|reports|logs|warnings
  const [users,        setUsers]       = useState([]);
  const [posts,        setPosts]       = useState([]);
  const [comments,     setComments]    = useState([]);
  const [reports,      setReports]     = useState([]);
  const [logs,         setLogs]        = useState([]);
  const [warnings,     setWarnings]    = useState([]);
  const [stats,        setStats]       = useState({});
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [statusFilter, setStatusFilter]= useState('All');
  const [selectedUser, setSelectedUser]= useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [contentType,  setContentType] = useState('post');

  const myRole     = profile?.role || 'user';
  const isBlink    = myRole === 'blink';
  const isAdmin    = myRole === 'admin' || isBlink;
  const isMod      = myRole === 'moderator' || isAdmin;
  const canAccess  = isMod;

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
    const [total, banned, suspended, restricted, staff, pendingReports, hiddenPosts] = await Promise.all([
      supabase.from('users').select('id',{count:'exact',head:true}),
      supabase.from('users').select('id',{count:'exact',head:true}).eq('is_banned',true),
      supabase.from('users').select('id',{count:'exact',head:true}).not('suspended_until','is',null).gt('suspended_until',new Date().toISOString()),
      supabase.from('users').select('id',{count:'exact',head:true}).eq('is_restricted',true),
      supabase.from('users').select('id',{count:'exact',head:true}).in('role',['admin','moderator','blink']),
      supabase.from('reports').select('id',{count:'exact',head:true}).eq('status','pending'),
      supabase.from('posts').select('id',{count:'exact',head:true}).eq('status','hidden'),
    ]);
    setStats({
      total:          total.count          || 0,
      banned:         banned.count         || 0,
      suspended:      suspended.count      || 0,
      restricted:     restricted.count     || 0,
      staff:          staff.count          || 0,
      pendingReports: pendingReports.count || 0,
      hiddenPosts:    hiddenPosts.count    || 0,
    });
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('users')
      .select('id,username,display_name,avatar_url,role,is_banned,is_restricted,suspended_until,ban_reason,restriction_reason,created_at')
      .order('created_at',{ascending:false});
    setUsers(data || []);
  };

  const fetchPosts = async () => {
    const { data } = await supabase.from('posts')
      .select('id,caption,status,created_at,user_id,likes_count,comments_count,moderation_reason,users(username,display_name,avatar_url)')
      .in('status',['active','hidden','deleted'])
      .order('created_at',{ascending:false}).limit(100);
    setPosts(data || []);
  };

  const fetchComments = async () => {
    const { data } = await supabase.from('comments')
      .select('id,body,status,created_at,user_id,post_id,moderation_reason,users(username,display_name,avatar_url)')
      .in('status',['active','hidden','deleted'])
      .order('created_at',{ascending:false}).limit(100);
    setComments(data || []);
  };

  const fetchReports = async () => {
    const { data } = await supabase.from('reports')
      .select('*, reporter:reporter_id(username,display_name,avatar_url)')
      .order('created_at',{ascending:false}).limit(100);
    setReports(data || []);
  };

  const fetchLogs = async () => {
    const { data } = await supabase.from('admin_logs')
      .select('*, admin:admin_id(username,display_name), target:target_user_id(username,display_name)')
      .order('created_at',{ascending:false}).limit(100);
    setLogs(data || []);
  };

  const fetchWarnings = async () => {
    const { data } = await supabase.from('warnings')
      .select('*, user:user_id(username,display_name,avatar_url), issuer:issued_by(username,display_name)')
      .order('created_at',{ascending:false}).limit(100);
    setWarnings(data || []);
  };

  const resolveReport = async (reportId, status) => {
    await supabase.from('reports').update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() }).eq('id', reportId);
    fetchReports(); fetchStats();
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q);
    const matchStatus =
      statusFilter === 'All'        ? true :
      statusFilter === 'Active'     ? (!u.is_banned && !u.is_restricted && (!u.suspended_until || new Date(u.suspended_until) <= new Date())) :
      statusFilter === 'Restricted' ? u.is_restricted :
      statusFilter === 'Suspended'  ? (u.suspended_until && new Date(u.suspended_until) > new Date()) :
      statusFilter === 'Banned'     ? u.is_banned : true;
    return matchSearch && matchStatus;
  });

  const SECTIONS = [
    { key:'overview',  label:'Overview',  icon: Activity },
    { key:'users',     label:'Users',     icon: Users },
    { key:'content',   label:'Content',   icon: FileText },
    { key:'reports',   label:'Reports',   icon: Flag, badge: stats.pendingReports },
    { key:'logs',      label:'Logs',      icon: Clock },
    { key:'warnings',  label:'Warnings',  icon: AlertOctagon },
  ];

  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white"><ArrowLeft size={22} /></button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-[#7B2FFF] flex items-center justify-center">
              <Shield size={16} color="white" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">Admin Panel</p>
              <p className="text-[#6B7280] text-[11px]">{ROLE_COLORS[myRole]?.label}</p>
            </div>
          </div>
        </div>
        <button onClick={fetchAll} className="text-[#6B7280] hover:text-white p-1"><RefreshCw size={18} /></button>
      </div>

      {/* Section nav — scrollable */}
      <div className="flex overflow-x-auto scrollbar-none px-4 py-3 gap-2 border-b border-white/[0.07]">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => {
            setSection(s.key);
            if (s.key === 'content') { fetchPosts(); fetchComments(); }
          }}
            className={'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all relative ' +
              (section === s.key ? 'bg-[#1E6FFF] text-white border-[#1E6FFF] shadow-lg shadow-[#1E6FFF]/30' : 'text-[#6B7280] border-white/10 hover:border-white/20 hover:text-white')}>
            <s.icon size={13} /> {s.label}
            {s.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">{s.badge}</span>
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
              <StatCard icon={Activity}      label="Admin Actions"  value={logs.length}               color="#2ECC71" />
            </div>

            {/* Quick actions */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <p className="text-white font-bold mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Manage Users',   key:'users',   color:'#1E6FFF' },
                  { label:'Review Reports', key:'reports', color:'#EF4444' },
                  { label:'Moderate Posts', key:'content', color:'#FF6B35' },
                  { label:'View Logs',      key:'logs',    color:'#2ECC71' },
                ].map(a => (
                  <button key={a.key} onClick={() => { setSection(a.key); if (a.key === 'content') { fetchPosts(); fetchComments(); } }}
                    className="py-3 px-4 rounded-xl text-white text-sm font-bold transition-all hover:opacity-80"
                    style={{ background: a.color + '20', border: '1px solid ' + a.color + '30', color: a.color }}>
                    {a.label}
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
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search users..." className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none" />
              {search && <button onClick={() => setSearch('')} className="text-[#6B7280] hover:text-white"><XCircle size={16} /></button>}
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
              {['All','Active','Restricted','Suspended','Banned'].map(tab => (
                <button key={tab} onClick={() => setStatusFilter(tab)}
                  className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                    (statusFilter === tab ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'text-[#6B7280] border-white/10 hover:border-white/20')}>
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredUsers.map(u => (
              <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3 mb-2">
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{u.display_name?.[0]?.toUpperCase()}</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-white font-bold text-[13px] truncate">{u.display_name}</p>
                    <RoleBadge role={u.role} />
                  </div>
                  <p className="text-[#6B7280] text-[12px]">@{u.username}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <StatusBadge u={u} />
                    {u.ban_reason && <span className="text-[#6B7280] text-[10px] truncate max-w-[140px]">"{u.ban_reason}"</span>}
                  </div>
                </div>
                {u.role !== 'blink' ? (
                  <button onClick={() => setSelectedUser(u)}
                    className="flex-shrink-0 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-xl text-white text-xs font-bold transition-all">
                    Manage
                  </button>
                ) : (
                  <span className="text-[#FFD700] text-xs flex-shrink-0">👑</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── CONTENT ── */}
        {section === 'content' && (
          <div>
            <div className="flex gap-2 mb-3">
              {[
                { key:'posts',    label:'Posts',    data: posts },
                { key:'comments', label:'Comments', data: comments },
              ].map(t => (
                <button key={t.key}
                  onClick={() => setContentType(t.key)}
                  className={'flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ' +
                    (contentType === t.key ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10')}>
                  {t.label} ({t.data.length})
                </button>
              ))}
            </div>

            {(contentType === 'posts' ? posts : comments).map(item => (
              <div key={item.id} className={'border rounded-2xl p-3 mb-2 ' +
                (item.status === 'hidden'  ? 'border-yellow-500/20 bg-yellow-500/[0.04]' :
                 item.status === 'deleted' ? 'border-red-500/20 bg-red-500/[0.04]' :
                 'border-white/[0.06] bg-white/[0.03]')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-white font-bold text-[13px]">{item.users?.display_name}</p>
                      <p className="text-[#6B7280] text-[12px]">@{item.users?.username}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.status === 'hidden' ? 'bg-yellow-500/20 text-yellow-400' :
                        item.status === 'deleted' ? 'bg-red-500/20 text-red-400' :
                        'bg-green-500/20 text-green-400'}`}>{item.status}</span>
                    </div>
                    <p className="text-white/70 text-[13px] line-clamp-2">{item.caption || item.body}</p>
                    {item.moderation_reason && (
                      <p className="text-[#6B7280] text-[11px] mt-1">Reason: {item.moderation_reason}</p>
                    )}
                    <p className="text-[#6B7280] text-[11px] mt-1">{formatTime(item.created_at)}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedContent(item); setContentType(contentType === 'posts' ? 'post' : 'comment'); }}
                    className="flex-shrink-0 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-xl text-white text-xs font-bold transition-all">
                    Moderate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── REPORTS ── */}
        {section === 'reports' && (
          <div className="space-y-2">
            {reports.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No reports yet.</p></div>
            ) : reports.map(r => (
              <div key={r.id} className={'border rounded-2xl p-3 ' +
                (r.status === 'pending' ? 'border-red-500/20 bg-red-500/[0.04]' :
                 r.status === 'resolved' ? 'border-green-500/20 bg-green-500/[0.04]' :
                 'border-white/[0.06] bg-white/[0.03]')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'pending'  ? 'bg-red-500/20 text-red-400' :
                        r.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                        'bg-[#6B7280]/20 text-[#6B7280]'}`}>{r.status}</span>
                      <span className="text-[#6B7280] text-[10px] bg-white/5 px-1.5 py-0.5 rounded-full">{r.target_type}</span>
                    </div>
                    <p className="text-white/80 text-[13px]"><span className="font-semibold text-white">{r.reporter?.display_name}</span> reported: <span className="text-yellow-400">{r.reason}</span></p>
                    {r.details && <p className="text-[#6B7280] text-[12px] mt-0.5">"{r.details}"</p>}
                    <p className="text-[#6B7280] text-[11px] mt-1">{formatTime(r.created_at)}</p>
                  </div>
                  {r.status === 'pending' && isMod && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => resolveReport(r.id, 'resolved')}
                        className="px-2 py-1.5 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-[11px] font-bold hover:bg-green-500/30 transition-colors">
                        Resolve
                      </button>
                      <button onClick={() => resolveReport(r.id, 'ignored')}
                        className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[#6B7280] text-[11px] font-bold hover:bg-white/10 transition-colors">
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
                      <span className="text-[#1E6FFF] text-[13px] font-semibold">{log.target?.display_name || 'Content'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        log.action.includes('ban')    ? 'bg-red-500/20 text-red-400' :
                        log.action.includes('suspend')? 'bg-orange-500/20 text-orange-400' :
                        log.action.includes('warn')   ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action.startsWith('un') || log.action.includes('restore') ? 'bg-green-500/20 text-green-400' :
                        'bg-[#1E6FFF]/20 text-[#1E6FFF]'
                      }`}>{log.action}</span>
                      {log.details && <span className="text-[#6B7280] text-[11px] truncate max-w-[180px]">"{log.details}"</span>}
                    </div>
                  </div>
                  <span className="text-[#6B7280] text-[10px] flex-shrink-0 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
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
                </div>
                <p className="text-white/70 text-[13px] bg-white/[0.04] rounded-xl px-3 py-2">"{w.reason}"</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedUser && (
        <UserActionModal
          target={selectedUser} myRole={myRole}
          onClose={() => setSelectedUser(null)}
          onSuccess={() => { fetchAll(); setSelectedUser(null); }}
        />
      )}
      {selectedContent && (
        <ContentModal
          item={selectedContent}
          type={contentType === 'posts' ? 'post' : 'comment'}
          onClose={() => setSelectedContent(null)}
          onSuccess={() => { fetchPosts(); fetchComments(); fetchStats(); setSelectedContent(null); }}
        />
      )}
    </div>
  );
}