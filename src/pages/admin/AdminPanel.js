import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Shield, Users, AlertTriangle, Ban, Clock,
  CheckCircle, XCircle, ChevronDown, ArrowLeft,
  Trash2, Eye, Search, RefreshCw, Activity,
  UserCheck, UserX, Star, AlertOctagon,
} from 'lucide-react';

const ROLE_COLORS = {
  blink:     { bg:'#FFD700', text:'#000', label:'B-Link' },
  admin:     { bg:'#EF4444', text:'#fff', label:'Admin' },
  moderator: { bg:'#7B2FFF', text:'#fff', label:'Mod' },
  user:      { bg:'#374151', text:'#9CA3AF', label:'User' },
};

const STATUS_TABS = ['All','Active','Restricted','Suspended','Banned'];

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-white font-bold text-xl leading-none">{value}</p>
        <p className="text-[#6B7280] text-xs mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.user;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg + '25', color: c.bg, border: '1px solid ' + c.bg + '40' }}>
      {c.label}
    </span>
  );
}

function StatusBadge({ user }) {
  if (user.is_banned)      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Banned</span>;
  if (user.suspended_until && new Date(user.suspended_until) > new Date())
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Suspended</span>;
  if (user.is_restricted)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Restricted</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Active</span>;
}

/* ── User action modal ──────────────────────────── */
function UserActionModal({ target, currentUserRole, onClose, onSuccess }) {
  const [action,    setAction]    = useState('');
  const [reason,    setReason]    = useState('');
  const [days,      setDays]      = useState(7);
  const [newRole,   setNewRole]   = useState(target.role || 'user');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const { user }                  = useAuth();

  const isOwner = currentUserRole === 'blink';
  const isAdmin = currentUserRole === 'admin' || isOwner;
  const isMod   = currentUserRole === 'moderator' || isAdmin;

  const actions = [
    { key:'warn',      label:'⚠️  Warn user',           allowed: isMod },
    { key:'restrict',  label:'🟡 Restrict user',         allowed: isAdmin },
    { key:'unrestrict',label:'✅ Remove restriction',    allowed: isAdmin },
    { key:'suspend',   label:'🔵 Suspend user',          allowed: isAdmin },
    { key:'unsuspend', label:'✅ Unsuspend user',        allowed: isAdmin },
    { key:'ban',       label:'🔴 Permanently ban',       allowed: isOwner },
    { key:'unban',     label:'✅ Unban user',            allowed: isOwner },
    { key:'role',      label:'👑 Change role',           allowed: isOwner },
    { key:'delete',    label:'🗑️  Delete account',       allowed: isOwner },
  ].filter(a => a.allowed);

  const handleSubmit = async () => {
    if (!action) { setError('Select an action.'); return; }
    if (['warn','restrict','suspend','ban'].includes(action) && !reason.trim()) {
      setError('Please enter a reason.'); return;
    }
    setLoading(true); setError('');
    try {
      let updates = {};
      let logDetails = reason;

      switch (action) {
        case 'warn':
          await supabase.from('warnings').insert({ user_id: target.id, issued_by: user.id, reason: reason.trim() });
          break;
        case 'restrict':
          updates = { is_restricted: true, restriction_reason: reason.trim() };
          break;
        case 'unrestrict':
          updates = { is_restricted: false, restriction_reason: null };
          logDetails = 'Restriction removed';
          break;
        case 'suspend':
          const until = new Date(); until.setDate(until.getDate() + days);
          updates = { suspended_until: until.toISOString(), ban_reason: reason.trim() };
          logDetails = `Suspended for ${days} days: ${reason}`;
          break;
        case 'unsuspend':
          updates = { suspended_until: null, ban_reason: null };
          logDetails = 'Suspension lifted';
          break;
        case 'ban':
          updates = { is_banned: true, ban_reason: reason.trim() };
          break;
        case 'unban':
          updates = { is_banned: false, ban_reason: null };
          logDetails = 'Ban lifted';
          break;
        case 'role':
          updates = { role: newRole };
          logDetails = `Role changed to ${newRole}`;
          break;
        case 'delete':
          if (!window.confirm(`Permanently delete @${target.username}? This cannot be undone.`)) { setLoading(false); return; }
          await supabase.from('users').delete().eq('id', target.id);
          await supabase.from('admin_logs').insert({ admin_id: user.id, target_user_id: target.id, action: 'delete_account', details: reason });
          onSuccess(); onClose(); return;
        default: break;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('users').update(updates).eq('id', target.id);
      }

      await supabase.from('admin_logs').insert({
        admin_id: user.id, target_user_id: target.id,
        action, details: logDetails,
      });

      // Notify the user
      if (['warn','restrict','suspend','ban'].includes(action)) {
        await supabase.from('notifications').upsert({
          user_id: target.id, from_user_id: user.id,
          type: 'admin_action',
          message: action === 'warn'      ? `You received a warning: ${reason}` :
                   action === 'restrict'  ? `Your account has been restricted: ${reason}` :
                   action === 'suspend'   ? `Your account has been suspended for ${days} days: ${reason}` :
                   action === 'ban'       ? `Your account has been permanently banned: ${reason}` : '',
          is_read: false,
        }, { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: false });
      }

      onSuccess(); onClose();
    } catch (err) {
      setError(err.message || 'Action failed.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {target.avatar_url
              ? <img src={target.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">{target.display_name?.[0]?.toUpperCase()}</div>
            }
            <div>
              <p className="text-white font-bold">{target.display_name}</p>
              <p className="text-[#6B7280] text-sm">@{target.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white p-1"><XCircle size={22} /></button>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          <RoleBadge role={target.role} />
          <StatusBadge user={target} />
        </div>

        {/* Action selector */}
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Select Action</p>
        <div className="grid grid-cols-1 gap-1.5 mb-4">
          {actions.map(a => (
            <button
              key={a.key}
              onClick={() => setAction(a.key)}
              className={'w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ' +
                (action === a.key
                  ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-white font-semibold'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.07]')}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Suspend: days selector */}
        {action === 'suspend' && (
          <div className="mb-3">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Suspend Duration</p>
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

        {/* Role: selector */}
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

        {/* Reason input */}
        {['warn','restrict','suspend','ban','unrestrict','unsuspend','unban','delete'].includes(action) && (
          <div className="mb-4">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">
              {['unrestrict','unsuspend','unban'].includes(action) ? 'Note (optional)' : 'Reason *'}
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/50 resize-none"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || !action}
          className="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40"
          style={{ background: action === 'ban' || action === 'delete' ? '#EF4444' : action === 'unban' || action === 'unsuspend' || action === 'unrestrict' ? '#2ECC71' : '#1E6FFF' }}
        >
          {loading ? 'Processing...' : 'Confirm Action'}
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

  const [users,        setUsers]       = useState([]);
  const [logs,         setLogs]        = useState([]);
  const [stats,        setStats]       = useState({});
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [statusTab,    setStatusTab]   = useState('All');
  const [activeSection,setActiveSection] = useState('users'); // users | logs | warnings
  const [selectedUser, setSelectedUser] = useState(null);
  const [warnings,     setWarnings]    = useState([]);

  const myRole = profile?.role || 'user';
  const canAccess = ['blink','admin','moderator'].includes(myRole);

  useEffect(() => {
    if (!canAccess) { navigate('/'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchLogs(), fetchStats(), fetchWarnings()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('users')
      .select('id,username,display_name,avatar_url,role,is_banned,is_restricted,suspended_until,ban_reason,restriction_reason,created_at')
      .order('created_at', { ascending: false });
    setUsers(data || []);
  };

  const fetchLogs = async () => {
    const { data } = await supabase.from('admin_logs')
      .select('*, admin:admin_id(username,display_name), target:target_user_id(username,display_name)')
      .order('created_at', { ascending: false }).limit(100);
    setLogs(data || []);
  };

  const fetchWarnings = async () => {
    const { data } = await supabase.from('warnings')
      .select('*, user:user_id(username,display_name,avatar_url), issuer:issued_by(username,display_name)')
      .order('created_at', { ascending: false }).limit(100);
    setWarnings(data || []);
  };

  const fetchStats = async () => {
    const [total, banned, suspended, restricted, admins] = await Promise.all([
      supabase.from('users').select('id', { count:'exact', head:true }),
      supabase.from('users').select('id', { count:'exact', head:true }).eq('is_banned', true),
      supabase.from('users').select('id', { count:'exact', head:true }).not('suspended_until', 'is', null).gt('suspended_until', new Date().toISOString()),
      supabase.from('users').select('id', { count:'exact', head:true }).eq('is_restricted', true),
      supabase.from('users').select('id', { count:'exact', head:true }).in('role', ['admin','moderator','blink']),
    ]);
    setStats({
      total:      total.count      || 0,
      banned:     banned.count     || 0,
      suspended:  suspended.count  || 0,
      restricted: restricted.count || 0,
      admins:     admins.count     || 0,
    });
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    const matchSearch = !search || u.username?.toLowerCase().includes(search.toLowerCase()) || u.display_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusTab === 'All'        ? true :
      statusTab === 'Active'     ? (!u.is_banned && !u.is_restricted && (!u.suspended_until || new Date(u.suspended_until) <= new Date())) :
      statusTab === 'Restricted' ? u.is_restricted :
      statusTab === 'Suspended'  ? (u.suspended_until && new Date(u.suspended_until) > new Date()) :
      statusTab === 'Banned'     ? u.is_banned : true;
    return matchSearch && matchStatus;
  });

  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white"><ArrowLeft size={22} /></button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-[#7B2FFF] flex items-center justify-center">
              <Shield size={16} color="white" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">Admin Panel</p>
              <p className="text-[#6B7280] text-[11px]">{ROLE_COLORS[myRole]?.label || 'User'}</p>
            </div>
          </div>
        </div>
        <button onClick={fetchAll} className="text-[#6B7280] hover:text-white p-1"><RefreshCw size={18} /></button>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Users}        label="Total Users"  value={stats.total      || 0} color="#1E6FFF" />
          <StatCard icon={UserCheck}    label="Staff"        value={stats.admins     || 0} color="#7B2FFF" />
          <StatCard icon={AlertTriangle}label="Restricted"   value={stats.restricted || 0} color="#FFD700" />
          <StatCard icon={Clock}        label="Suspended"    value={stats.suspended  || 0} color="#FF6B35" />
          <StatCard icon={Ban}          label="Banned"       value={stats.banned     || 0} color="#EF4444" />
          <StatCard icon={Activity}     label="Actions"      value={logs.length}            color="#2ECC71" />
        </div>

        {/* Section tabs */}
        <div className="flex bg-white/[0.04] rounded-2xl p-1 gap-1">
          {[
            { key:'users',    label:'Users',    icon: Users },
            { key:'logs',     label:'Logs',     icon: Activity },
            { key:'warnings', label:'Warnings', icon: AlertOctagon },
          ].map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ' +
                (activeSection === s.key ? 'bg-[#1E6FFF] text-white shadow-lg shadow-[#1E6FFF]/30' : 'text-[#6B7280] hover:text-white')}>
              <s.icon size={14} /> {s.label}
            </button>
          ))}
        </div>

        {/* ── USERS SECTION ── */}
        {activeSection === 'users' && (
          <div>
            {/* Search */}
            <div className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 mb-3">
              <Search size={16} className="text-[#6B7280] flex-shrink-0" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search users..."
                className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none"
              />
              {search && <button onClick={() => setSearch('')} className="text-[#6B7280] hover:text-white"><XCircle size={16} /></button>}
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
              {STATUS_TABS.map(tab => (
                <button key={tab} onClick={() => setStatusTab(tab)}
                  className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                    (statusTab === tab ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'text-[#6B7280] border-white/10 hover:border-white/20')}>
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No users found.</p></div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(u => (
                  <div key={u.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm">{u.display_name?.[0]?.toUpperCase()}</div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-white font-bold text-[13px] truncate">{u.display_name}</p>
                        <RoleBadge role={u.role} />
                      </div>
                      <p className="text-[#6B7280] text-[12px]">@{u.username}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <StatusBadge user={u} />
                        {u.ban_reason && <span className="text-[#6B7280] text-[10px] truncate max-w-[150px]">"{u.ban_reason}"</span>}
                      </div>
                    </div>

                    {/* Action button */}
                    {u.role !== 'blink' && (
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="flex-shrink-0 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-xl text-white text-xs font-bold transition-all"
                      >
                        Manage
                      </button>
                    )}
                    {u.role === 'blink' && (
                      <span className="text-[#FFD700] text-xs flex-shrink-0">👑 B-Link</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LOGS SECTION ── */}
        {activeSection === 'logs' && (
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
                      <span className="text-[#1E6FFF] text-[13px] font-semibold">{log.target?.display_name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        log.action === 'ban'       ? 'bg-red-500/20 text-red-400' :
                        log.action === 'suspend'   ? 'bg-orange-500/20 text-orange-400' :
                        log.action === 'warn'      ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action === 'restrict'  ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action.startsWith('un')|| log.action.startsWith('remove')
                                                   ? 'bg-green-500/20 text-green-400' :
                        'bg-[#1E6FFF]/20 text-[#1E6FFF]'
                      }`}>{log.action}</span>
                      {log.details && <span className="text-[#6B7280] text-[11px] truncate max-w-[200px]">"{log.details}"</span>}
                    </div>
                  </div>
                  <span className="text-[#6B7280] text-[10px] flex-shrink-0 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString('en-KE',{ day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── WARNINGS SECTION ── */}
        {activeSection === 'warnings' && (
          <div className="space-y-2">
            {warnings.length === 0 ? (
              <div className="text-center py-10"><p className="text-[#6B7280]">No warnings issued yet.</p></div>
            ) : warnings.map(w => (
              <div key={w.id} className="bg-yellow-500/[0.05] border border-yellow-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-3 mb-2">
                  {w.user?.avatar_url
                    ? <img src={w.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold text-sm flex-shrink-0">⚠️</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[13px]">{w.user?.display_name}</p>
                    <p className="text-[#6B7280] text-[11px]">Warned by {w.issuer?.display_name}</p>
                  </div>
                  <span className="text-[#6B7280] text-[10px] flex-shrink-0">
                    {new Date(w.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'short' })}
                  </span>
                </div>
                <p className="text-white/70 text-[13px] bg-white/[0.04] rounded-xl px-3 py-2">"{w.reason}"</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User action modal */}
      {selectedUser && (
        <UserActionModal
          target={selectedUser}
          currentUserRole={myRole}
          onClose={() => setSelectedUser(null)}
          onSuccess={() => { fetchAll(); setSelectedUser(null); }}
        />
      )}
    </div>
  );
}