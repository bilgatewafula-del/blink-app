import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  Bell, Check, CheckCheck, Megaphone,
  Shield, ArrowLeft, X, Send, AlertTriangle,
  Info, Zap, Gift, Wrench, ChevronRight,
} from 'lucide-react';
import Avatar from '../../components/Avatar';

/* ── Notification type config ──────────────────── */
const TYPE_CONFIG = {
  like:         { emoji:'❤️',  color:'#EF4444', tab:'activity' },
  haha:         { emoji:'😂',  color:'#FFD700', tab:'activity' },
  wow:          { emoji:'😮',  color:'#FF6B35', tab:'activity' },
  sad:          { emoji:'😢',  color:'#6B7280', tab:'activity' },
  angry:        { emoji:'😡',  color:'#EF4444', tab:'activity' },
  fire:         { emoji:'🔥',  color:'#FF6B35', tab:'activity' },
  comment:      { emoji:'💬',  color:'#1E6FFF', tab:'activity' },
  reply:        { emoji:'↩️',  color:'#1E6FFF', tab:'activity' },
  mention:      { emoji:'🏷️',  color:'#FF6B35', tab:'social'   },
  follow:       { emoji:'👥',  color:'#7B2FFF', tab:'social'   },
  follow_request:{ emoji:'👤', color:'#7B2FFF', tab:'social'   },
  repost:       { emoji:'🔁',  color:'#2ECC71', tab:'activity' },
  quote:        { emoji:'📝',  color:'#2ECC71', tab:'activity' },
  share:        { emoji:'📤',  color:'#00D4C8', tab:'activity' },
  message:      { emoji:'📨',  color:'#1E6FFF', tab:'messages' },
  admin_action: { emoji:'🛡️',  color:'#EF4444', tab:'system'   },
  announcement: { emoji:'📢',  color:'#FFD700', tab:'system'   },
  system:       { emoji:'⚙️',  color:'#6B7280', tab:'system'   },
  milestone:    { emoji:'🔥',  color:'#FFD700', tab:'activity' },
  achievement:  { emoji:'🏆',  color:'#FFD700', tab:'activity' },
  warning:      { emoji:'⚠️',  color:'#FF6B35', tab:'system'   },
  restrict:     { emoji:'🟡',  color:'#FFD700', tab:'system'   },
  suspend:      { emoji:'🔵',  color:'#FF6B35', tab:'system'   },
  ban:          { emoji:'🔴',  color:'#EF4444', tab:'system'   },
};

const TABS = [
  { key:'all',      label:'All'      },
  { key:'activity', label:'Activity' },
  { key:'social',   label:'Social'   },
  { key:'messages', label:'Messages' },
  { key:'system',   label:'System'   },
];

/* ── Smart notification text ───────────────────── */
function buildText(n) {
  const actors  = n.actor_names?.length ? n.actor_names : [n.from_user?.display_name || 'Someone'];
  const count   = n.grouped_count || 1;
  const first   = actors[0] || 'Someone';
  const others  = count - 1;
  const suffix  = others > 0 ? ` and ${formatNumber(others)} other${others > 1 ? 's' : ''}` : '';

  switch (n.type) {
    case 'like':    case 'haha': case 'wow':
    case 'sad':     case 'angry': case 'fire':
      return `${first}${suffix} reacted to your post`;
    case 'comment':
      return `${first}${suffix} commented on your post`;
    case 'reply':
      return `${first}${suffix} replied to your comment`;
    case 'mention':
      return `${first} mentioned you`;
    case 'follow':
      return `${first}${suffix} followed you`;
    case 'follow_request':
      return `${first}${suffix} sent a follow request`;
    case 'repost':
      return `${first}${suffix} reposted your post`;
    case 'quote':
      return `${first}${suffix} quoted your post`;
    case 'share':
      return `${first}${suffix} shared your post`;
    case 'message':
      return `${first} sent you a message`;
    case 'admin_action':
    case 'announcement':
    case 'system':
    case 'warning':
    case 'restrict':
    case 'suspend':
    case 'ban':
      return n.message || 'System notification';
    case 'milestone':
      return n.message || 'Your post reached a milestone 🔥';
    case 'achievement':
      return n.message || 'You earned an achievement 🏆';
    default:
      return n.message || 'New notification';
  }
}

/* ── Announcement type icon ────────────────────── */
function AnnouncementIcon({ type, size = 20 }) {
  const icons = {
    info:        <Info size={size} color="#1E6FFF" />,
    warning:     <AlertTriangle size={size} color="#FF6B35" />,
    update:      <Zap size={size} color="#2ECC71" />,
    promo:       <Gift size={size} color="#FFD700" />,
    maintenance: <Wrench size={size} color="#6B7280" />,
  };
  return icons[type] || <Megaphone size={size} color="#FFD700" />;
}

/* ── Send Announcement modal (admin only) ──────── */
function SendAnnouncementModal({ onClose, onSent }) {
  const { user } = useAuth();
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [type,    setType]    = useState('info');
  const [icon,    setIcon]    = useState('📢');
  const [actionUrl,   setActionUrl]   = useState('');
  const [actionLabel, setActionLabel] = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');

  const TYPES = [
    { key:'info',        label:'ℹ️ Info',         color:'#1E6FFF' },
    { key:'update',      label:'⚡ Update',        color:'#2ECC71' },
    { key:'warning',     label:'⚠️ Warning',       color:'#FF6B35' },
    { key:'promo',       label:'🎁 Promotion',     color:'#FFD700' },
    { key:'maintenance', label:'🔧 Maintenance',   color:'#6B7280' },
  ];

  const ICONS = ['📢','🚀','⚡','🎉','🔥','💎','🛡️','✨','🌍','🏆','📱','💬'];

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    setSending(true); setError('');

    try {
      // Insert announcement
      const { data: ann, error: annErr } = await supabase.from('announcements').insert({
        admin_id:     user.id,
        title:        title.trim(),
        body:         body.trim(),
        type,
        icon,
        action_url:   actionUrl.trim() || null,
        action_label: actionLabel.trim() || null,
      }).select().single();

      if (annErr) throw annErr;

      // Fetch all user IDs to notify
      const { data: allUsers } = await supabase
        .from('users')
        .select('id')
        .neq('id', user.id)
        .eq('is_banned', false);

      // Batch insert notifications (in chunks of 100 to avoid timeout)
      const userIds = (allUsers || []).map(u => u.id);
      const chunkSize = 100;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        await supabase.from('notifications').insert(
          chunk.map(uid => ({
            user_id:     uid,
            from_user_id: user.id,
            type:        'announcement',
            message:     `${icon} ${title}: ${body.slice(0, 100)}`,
            ref_id:      ann.id,
            is_read:     false,
          }))
        );
      }

      onSent();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send. Try again.');
    }
    setSending(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#FFD700]/20 flex items-center justify-center">
              <Megaphone size={18} className="text-[#FFD700]" />
            </div>
            <div>
              <p className="text-white font-bold">Broadcast Announcement</p>
              <p className="text-[#6B7280] text-xs">Notify all users instantly</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Type selector */}
        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Type</p>
        <div className="flex gap-2 flex-wrap mb-4">
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={'px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                (type === t.key ? 'text-white' : 'text-[#6B7280] border-white/10 hover:border-white/20')}
              style={type === t.key ? { background: t.color + '30', borderColor: t.color + '60', color: t.color } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Icon picker */}
        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Icon</p>
        <div className="flex gap-2 flex-wrap mb-4">
          {ICONS.map(ic => (
            <button
              key={ic}
              onClick={() => setIcon(ic)}
              className={'text-xl w-10 h-10 rounded-xl border transition-all ' +
                (icon === ic ? 'bg-white/15 border-white/40' : 'bg-white/5 border-white/10 hover:bg-white/10')}
            >
              {ic}
            </button>
          ))}
        </div>

        {/* Title */}
        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Title *</p>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. New Feature Available!"
          maxLength={80}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/50 mb-4"
        />

        {/* Message */}
        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Message *</p>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your announcement here..."
          maxLength={500}
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/50 resize-none mb-1"
        />
        <div className="flex justify-end mb-4">
          <span className={`text-xs ${body.length > 450 ? 'text-orange-400' : 'text-[#6B7280]'}`}>{body.length}/500</span>
        </div>

        {/* Optional action button */}
        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Action Button (optional)</p>
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={actionLabel}
            onChange={e => setActionLabel(e.target.value)}
            placeholder="Button label"
            maxLength={30}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-[#6B7280] focus:outline-none"
          />
          <input
            type="text"
            value={actionUrl}
            onChange={e => setActionUrl(e.target.value)}
            placeholder="Link or /page"
            maxLength={100}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-[#6B7280] focus:outline-none"
          />
        </div>

        {/* Preview */}
        {(title || body) && (
          <div className="mb-5 border border-[#FFD700]/20 bg-[#FFD700]/5 rounded-2xl p-4">
            <p className="text-[#FFD700] text-xs font-bold mb-2">Preview</p>
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div>
                <p className="text-white font-bold text-sm">{title || 'Title...'}</p>
                <p className="text-white/70 text-xs mt-0.5">{body || 'Message...'}</p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          className="w-full py-4 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: sending ? 'rgba(255,215,0,0.4)' : 'linear-gradient(135deg, #FFD700, #FF6B35)' }}
        >
          {sending ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending to all users...</>
          ) : (
            <><Megaphone size={16} /> Broadcast to All Users</>
          )}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN NOTIFICATIONS PAGE
═══════════════════════════════════════════════ */
export default function Notifications() {
  const { user, profile } = useAuth();
  const navigate           = useNavigate();

  const [activeTab,    setActiveTab]    = useState('all');
  const [notifs,       setNotifs]       = useState([]);
  const [announcements,setAnnouncements]= useState([]);
  const [loading,      setLoading]      = useState(true);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [showBroadcast,setShowBroadcast]= useState(false);
  const [todayStats,   setTodayStats]   = useState({ reactions:0, comments:0, followers:0, messages:0 });

  const isAdmin = ['blink','admin'].includes(profile?.role);

  /* Real-time subscription */
  useEffect(() => {
    const ch = supabase.channel('notifs:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, () => { fetchNotifications(); fetchUnreadCount(); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, () => { fetchNotifications(); fetchUnreadCount(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [activeTab]);

  useEffect(() => {
    fetchNotifications();
    fetchAnnouncements();
    fetchUnreadCount();
  }, [activeTab]);

  const fetchUnreadCount = async () => {
    const { count } = await supabase.from('notifications')
      .select('id', { count:'exact', head:true })
      .eq('user_id', user.id).eq('is_read', false);
    setUnreadCount(count || 0);
  };

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data?.length) return;

    // Filter out ones already read by this user
    const { data: reads } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', user.id);

    const readIds = new Set((reads || []).map(r => r.announcement_id));
    setAnnouncements((data || []).filter(a => !readIds.has(a.id)));
  };

  const fetchNotifications = async () => {
    setLoading(true);
    const tabTypes = {
      activity: ['like','haha','wow','sad','angry','fire','comment','reply','repost','quote','share','milestone','achievement'],
      social:   ['follow','follow_request','mention'],
      messages: ['message'],
      system:   ['admin_action','announcement','system','warning','restrict','suspend','ban'],
    };

    let q = supabase
      .from('notifications')
      .select('*, from_user:from_user_id(id,username,display_name,avatar_url,is_verified)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(80);

    if (activeTab !== 'all') {
      const types = tabTypes[activeTab];
      if (types) q = q.in('type', types);
    }

    const { data } = await q;
    setNotifs(data || []);

    // Today stats
    const today = new Date(); today.setHours(0,0,0,0);
    const todayData = (data || []).filter(n => new Date(n.created_at) >= today);
    setTodayStats({
      reactions: todayData.filter(n => ['like','haha','wow','sad','angry','fire'].includes(n.type))
                          .reduce((sum, n) => sum + (n.grouped_count || 1), 0),
      comments:  todayData.filter(n => ['comment','reply'].includes(n.type))
                          .reduce((sum, n) => sum + (n.grouped_count || 1), 0),
      followers: todayData.filter(n => n.type === 'follow')
                          .reduce((sum, n) => sum + (n.grouped_count || 1), 0),
      messages:  todayData.filter(n => n.type === 'message').length,
    });

    setLoading(false);

    // Mark all as read (except system ones that need attention)
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .not('type', 'in', '(ban,restrict,suspend,warning)');
  };

  const handleMarkAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleTapNotif = async (n) => {
    // Mark read
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));

    // Navigate
    if (['like','haha','wow','sad','angry','fire','comment','reply','repost','quote','share'].includes(n.type) && n.ref_id) {
      navigate('/post/' + n.ref_id);
    } else if (['follow','follow_request','mention'].includes(n.type)) {
      navigate('/profile/' + n.from_user?.username);
    } else if (n.type === 'message' && n.ref_id) {
      navigate('/chats/' + n.ref_id);
    }
    // system/admin/ban notifications: stay on page, user can read the message
  };

  const handleFollowBack = async (e, fromUserId) => {
    e.stopPropagation();
    try {
      await supabase.from('follows').upsert(
        { follower_id: user.id, following_id: fromUserId, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      );
      await supabase.from('notifications').upsert(
        { user_id: fromUserId, from_user_id: user.id, type: 'follow', message: 'followed you back', is_read: false },
        { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
      );
    } catch (err) { console.error(err.message); }
  };

  const dismissAnnouncement = async (annId) => {
    await supabase.from('announcement_reads').upsert(
      { announcement_id: annId, user_id: user.id },
      { onConflict: 'announcement_id,user_id' }
    );
    setAnnouncements(prev => prev.filter(a => a.id !== annId));
  };

  const hasTodayActivity = Object.values(todayStats).some(v => v > 0);

  /* Group notifications by date */
  const groupByDate = (items) => {
    const today     = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const groups    = { Today: [], Yesterday: [], 'Earlier': [] };
    items.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today)     groups['Today'].push(n);
      else if (d >= yesterday) groups['Yesterday'].push(n);
      else                groups['Earlier'].push(n);
    });
    return groups;
  };

  const grouped = groupByDate(notifs);

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* Broadcast modal */}
      {showBroadcast && (
        <SendAnnouncementModal
          onClose={() => setShowBroadcast(false)}
          onSent={() => { fetchNotifications(); fetchAnnouncements(); }}
        />
      )}

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell size={22} className="text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#1E6FFF] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <h1 className="text-white font-bold text-xl">Notifications</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Admin broadcast button */}
            {isAdmin && (
              <button
                onClick={() => setShowBroadcast(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}
              >
                <Megaphone size={13} /> Broadcast
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[#1E6FFF] text-xs font-semibold"
              >
                <CheckCheck size={14} /> All read
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none px-4 pb-0 gap-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={'flex-shrink-0 px-3 py-2.5 text-[13px] font-semibold relative transition-all ' +
                (activeTab === tab.key ? 'text-white' : 'text-[#6B7280] hover:text-white/70')}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full" style={{ width:'70%' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* ── ANNOUNCEMENTS (unread only) ── */}
        {announcements.length > 0 && (activeTab === 'all' || activeTab === 'system') && (
          <div className="space-y-2">
            {announcements.map(ann => (
              <div
                key={ann.id}
                className="border rounded-2xl p-4"
                style={{
                  background: ann.type === 'warning'     ? 'rgba(255,107,53,0.07)' :
                               ann.type === 'maintenance' ? 'rgba(107,114,128,0.07)' :
                               ann.type === 'promo'       ? 'rgba(255,215,0,0.07)' :
                               ann.type === 'update'      ? 'rgba(46,204,113,0.07)' :
                               'rgba(30,111,255,0.07)',
                  borderColor: ann.type === 'warning'     ? 'rgba(255,107,53,0.25)' :
                               ann.type === 'maintenance' ? 'rgba(107,114,128,0.25)' :
                               ann.type === 'promo'       ? 'rgba(255,215,0,0.25)' :
                               ann.type === 'update'      ? 'rgba(46,204,113,0.25)' :
                               'rgba(30,111,255,0.25)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {ann.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: ann.type === 'warning' ? '#FF6B35' : ann.type === 'promo' ? '#FFD700' : ann.type === 'update' ? '#2ECC71' : '#1E6FFF' }}>
                          📢 B-Link
                        </span>
                        <span className="text-[#6B7280] text-[10px]">{formatTime(ann.created_at)}</span>
                      </div>
                      <p className="text-white font-bold text-[14px]">{ann.title}</p>
                      <p className="text-white/70 text-[13px] mt-0.5 leading-snug">{ann.body}</p>
                      {ann.action_label && ann.action_url && (
                        <button
                          onClick={() => { navigate(ann.action_url); dismissAnnouncement(ann.id); }}
                          className="mt-2 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
                          style={{ background: 'rgba(30,111,255,0.2)', color: '#1E6FFF', border: '1px solid rgba(30,111,255,0.3)' }}
                        >
                          {ann.action_label} <ChevronRight size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => dismissAnnouncement(ann.id)}
                    className="text-[#6B7280] hover:text-white flex-shrink-0 p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TODAY'S ACTIVITY SUMMARY ── */}
        {hasTodayActivity && activeTab === 'all' && (
          <div className="bg-gradient-to-r from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-4">
            <p className="text-white font-bold text-sm mb-3">📊 Today's Activity</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label:'Reactions', value:todayStats.reactions, emoji:'❤️', color:'#EF4444' },
                { label:'Comments',  value:todayStats.comments,  emoji:'💬', color:'#1E6FFF' },
                { label:'Followers', value:todayStats.followers, emoji:'👥', color:'#7B2FFF' },
                { label:'Messages',  value:todayStats.messages,  emoji:'📨', color:'#00D4C8' },
              ].map(s => (
                <div key={s.label} className="text-center bg-white/[0.04] rounded-xl py-2.5 px-1">
                  <p className="text-lg leading-none mb-1">{s.emoji}</p>
                  <p className="text-white font-bold text-sm leading-none">{formatNumber(s.value)}</p>
                  <p className="text-[#6B7280] text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS LIST ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifs.length === 0 && announcements.length === 0 ? (
          <div className="text-center py-20 px-6">
            <p className="text-6xl mb-3">🔔</p>
            <p className="text-white font-bold text-lg">No notifications yet</p>
            <p className="text-[#6B7280] text-sm mt-1">
              When people interact with you, you'll see it here.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([dateLabel, items]) => {
            if (!items.length) return null;
            return (
              <div key={dateLabel}>
                <p className="text-[#6B7280] text-xs font-bold uppercase tracking-wider mb-2 mt-2">
                  {dateLabel}
                </p>
                <div className="space-y-1">
                  {items.map(n => {
                    const cfg     = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
                    const actors  = n.actor_avatars?.length ? n.actor_avatars : [n.from_user?.avatar_url];
                    const names   = n.actor_names?.length   ? n.actor_names   : [n.from_user?.display_name];
                    const count   = n.grouped_count || 1;
                    const isFollow = n.type === 'follow';
                    const isSystem = ['admin_action','system','ban','restrict','suspend','warning','announcement'].includes(n.type);

                    return (
                      <button
                        key={n.id}
                        onClick={() => handleTapNotif(n)}
                        className={'w-full flex items-start gap-3 px-3 py-3 rounded-2xl transition-all hover:bg-white/[0.04] text-left ' +
                          (!n.is_read ? 'bg-[#1E6FFF]/[0.06] border border-[#1E6FFF]/[0.12]' : '')}
                      >
                        {/* Avatar / Icon area */}
                        <div className="relative flex-shrink-0">
                          {isSystem ? (
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
                              style={{ background: cfg.color + '20', border: '1px solid ' + cfg.color + '40' }}
                            >
                              {cfg.emoji}
                            </div>
                          ) : (
                            <div className="relative">
                              {/* Primary avatar */}
                              {actors[0]
                                ? <img src={actors[0]} alt="" className="w-11 h-11 rounded-full object-cover" />
                                : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">
                                    {names[0]?.[0]?.toUpperCase() || '?'}
                                  </div>
                              }
                              {/* Second actor (stacked) */}
                              {actors[1] && (
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0A1628] overflow-hidden">
                                  <img src={actors[1]} alt="" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {/* Type badge */}
                              <div
                                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-[#0A1628]"
                                style={{ background: cfg.color }}
                              >
                                {cfg.emoji}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Main text — Twitter style: bold name + action */}
                          <p className="text-[14px] leading-snug text-white/90">
                            {!isSystem && (
                              <span className="font-bold">{names[0] || 'Someone'} </span>
                            )}
                            <span className={isSystem ? 'font-medium' : ''}>
                              {buildText(n).replace(names[0] || '', '').trimStart()}
                            </span>
                          </p>

                          {/* Preview text (comment body, message snippet) */}
                          {n.preview_text && (
                            <p className="text-[#6B7280] text-[12px] mt-0.5 line-clamp-1">
                              "{n.preview_text}"
                            </p>
                          )}

                          {/* Time */}
                          <p className="text-[#6B7280] text-[11px] mt-1">{formatTime(n.created_at)}</p>
                        </div>

                        {/* Right side */}
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {/* Unread dot */}
                          {!n.is_read && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[#1E6FFF] shadow-sm shadow-[#1E6FFF]/60" />
                          )}

                          {/* Post thumbnail */}
                          {n.preview_image && !isFollow && !isSystem && (
                            <img
                              src={n.preview_image}
                              alt=""
                              className="w-12 h-12 rounded-xl object-cover border border-white/10"
                            />
                          )}

                          {/* Follow back button */}
                          {isFollow && (
                            <button
                              onClick={e => handleFollowBack(e, n.from_user?.id)}
                              className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                              style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', color: 'white' }}
                            >
                              Follow Back
                            </button>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}