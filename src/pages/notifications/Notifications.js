import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Bell, Heart, MessageCircle, UserPlus, Repeat2,
  AtSign, BadgeCheck, Megaphone, Check, ArrowLeft
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { NotificationSkeleton } from '../../components/Skeleton';
import SwipeBack from '../../components/SwipeBack';

const NOTIFICATION_ICONS = {
  like: { icon: Heart, color: 'text-red-400', bg: 'bg-red-400/20' },
  comment: { icon: MessageCircle, color: 'text-[#1E6FFF]', bg: 'bg-[#1E6FFF]/20' },
  follow: { icon: UserPlus, color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
  follow_request: { icon: UserPlus, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/20' },
  repost: { icon: Repeat2, color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
  mention: { icon: AtSign, color: 'text-[#7B2FFF]', bg: 'bg-[#7B2FFF]/20' },
  verification: { icon: BadgeCheck, color: 'text-[#1E6FFF]', bg: 'bg-[#1E6FFF]/20' },
  tip: { icon: () => <span className="text-sm">💰</span>, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/20' },
  system: { icon: Megaphone, color: 'text-[#FF6B35]', bg: 'bg-[#FF6B35]/20' },
  message: { icon: MessageCircle, color: 'text-[#00B4D8]', bg: 'bg-[#00B4D8]/20' },
};

const getDefaultMessage = (type) => {
  switch (type) {
    case 'like': return 'reacted to your post';
    case 'comment': return 'commented on your post';
    case 'follow': return 'started following you';
    case 'follow_request': return 'wants to follow you';
    case 'repost': return 'reposted your post';
    case 'mention': return 'mentioned you';
    case 'tip': return 'sent you a tip';
    case 'message': return 'sent you a message';
    case 'verification': return 'Your verification was reviewed';
    default: return 'sent you a notification';
  }
};

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    seedDemoNotifications();
    fetchNotifications();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('notifications:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev]);
        setUnreadCount((c) => c + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*, from_user:from_user_id(id, username, display_name, avatar_url, is_verified)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications(data || []);
    setUnreadCount(data?.filter((n) => !n.is_read).length || 0);
    setLoading(false);
  };

  const seedDemoNotifications = async () => {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'system')
      .limit(1);
    if (existing && existing.length > 0) return;
    await supabase.from('notifications').insert([
      {
        user_id: user.id,
        type: 'system',
        message: '🎉 Welcome to B-Link! Your African social platform is ready.',
        is_read: false,
      },
      {
        user_id: user.id,
        type: 'system',
        message: '🔥 Start posting and connect with others.',
        is_read: false,
      },
    ]);
    fetchNotifications();
  };

  const markAllRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleNotificationClick = async (n) => {
    if (!n.is_read) await markRead(n.id);
    if (['like', 'comment', 'repost', 'mention'].includes(n.type)) {
      if (n.ref_id) navigate('/post/' + n.ref_id);
    } else if (['follow', 'follow_request'].includes(n.type)) {
      if (n.from_user?.username) navigate('/profile/' + n.from_user.username);
    } else if (n.type === 'message') {
      if (n.ref_id) navigate('/chats/' + n.ref_id);
    }
  };

  const handleAcceptFollow = async (n) => {
    await supabase.from('follows')
      .update({ status: 'accepted' })
      .eq('follower_id', n.from_user_id)
      .eq('following_id', user.id);
    await sendNotification({
      to: n.from_user_id,
      from: user.id,
      type: 'follow',
      message: 'accepted your follow request',
    });
    await markRead(n.id);
    fetchNotifications();
  };

  const handleDeclineFollow = async (n) => {
    await supabase.from('follows')
      .delete()
      .eq('follower_id', n.from_user_id)
      .eq('following_id', user.id);
    await markRead(n.id);
    fetchNotifications();
  };

  const sendNotification = async ({ to, from, type, message }) => {
    if (!to || !from || to === from) return;
    await supabase.from('notifications').insert({
      user_id: to, from_user_id: from, type, message, is_read: false,
    });
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'like', label: '❤️ Likes' },
    { key: 'comment', label: '💬 Comments' },
    { key: 'follow', label: '👥 Follows' },
    { key: 'mention', label: '@ Mentions' },
    { key: 'system', label: '📢 System' },
  ];

  const filtered = activeFilter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === activeFilter ||
        (activeFilter === 'follow' && n.type === 'follow_request'));

  const grouped = filtered.reduce((acc, n) => {
    const date = new Date(n.created_at);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    let key;
    if (diffDays < 0 || diffDays === 0) key = 'Today';
    else if (diffDays === 1) key = 'Yesterday';
    else if (diffDays < 7) key = diffDays + ' days ago';
    else key = date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <SwipeBack>
      <div className="min-h-screen bg-[#0A1628] pb-24">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell size={20} className="text-[#FF6B35]" />
              <h1 className="text-white font-bold text-lg">Notifications</h1>
              {unreadCount > 0 && (
                <span className="bg-[#FF6B35] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 text-[#1E6FFF] text-xs font-semibold"
              >
                <Check size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ' +
                  (activeFilter === f.key
                    ? 'bg-[#1E6FFF] text-white shadow-lg shadow-[#1E6FFF]/30'
                    : 'bg-white/5 border border-white/10 text-[#6B7280] hover:text-white')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <NotificationSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
            <div className="text-6xl">🔔</div>
            <h2 className="text-white font-bold text-xl text-center">No notifications yet</h2>
            <p className="text-[#6B7280] text-sm text-center">
              When people like, comment or follow you, it shows here.
            </p>
          </div>
        ) : (
          <div>
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="px-4 py-2">
                  <p className="text-[#6B7280] text-xs font-semibold uppercase tracking-wide">
                    {dateLabel}
                  </p>
                </div>

                {items.map((n) => {
                  const config = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.system;
                  const IconComponent = config.icon;
                  const isFollowRequest = n.type === 'follow_request';

                  return (
                    <div
                      key={n.id}
                      onClick={() => !isFollowRequest && handleNotificationClick(n)}
                      className={
                        'flex items-start gap-3 px-4 py-4 border-b border-white/5 transition-colors ' +
                        (!isFollowRequest ? 'cursor-pointer hover:bg-white/3 ' : '') +
                        (!n.is_read ? 'bg-[#1E6FFF]/5 border-l-2 border-l-[#1E6FFF]' : '')
                      }
                    >
                      {/* Icon / avatar */}
                      <div className="relative flex-shrink-0">
                        {n.from_user ? (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); navigate('/profile/' + n.from_user.username); }}>
                              <Avatar url={n.from_user.avatar_url} name={n.from_user.display_name} size={10} />
                            </button>
                            <div className={'absolute -bottom-1 -right-1 w-5 h-5 rounded-full ' + config.bg + ' flex items-center justify-center'}>
                              <IconComponent size={11} className={config.color} />
                            </div>
                          </>
                        ) : (
                          <div className={'w-10 h-10 rounded-full ' + config.bg + ' flex items-center justify-center'}>
                            <IconComponent size={20} className={config.color} />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={'text-sm leading-relaxed ' + (!n.is_read ? 'text-white' : 'text-white/70')}>
                          {n.from_user && (
                            <span className="font-bold text-white">
                              {n.from_user.display_name}{' '}
                            </span>
                          )}
                          {n.message || getDefaultMessage(n.type)}
                        </p>
                        <p className="text-[#6B7280] text-xs mt-1">{formatTime(n.created_at)}</p>

                        {/* Follow request actions */}
                        {isFollowRequest && n.from_user && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAcceptFollow(n); }}
                              className="bg-[#1E6FFF] text-white text-xs font-bold px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                            >
                              Accept
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeclineFollow(n); }}
                              className="bg-white/10 border border-white/20 text-white/70 text-xs font-bold px-4 py-1.5 rounded-full hover:bg-white/20 transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Unread dot */}
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-[#1E6FFF] flex-shrink-0 mt-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </SwipeBack>
  );
};

export default Notifications;