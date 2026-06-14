import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import { Check } from 'lucide-react';
import Avatar from '../../components/Avatar';

const NOTIF_TABS = [
  { key: 'all',      label: 'All'      },
  { key: 'activity', label: 'Activity' },
  { key: 'social',   label: 'Social'   },
  { key: 'messages', label: 'Messages' },
];

const TYPE_CONFIG = {
  like:        { emoji: '❤️', color: '#EF4444', text: 'reacted to your post'           },
  love:        { emoji: '❤️', color: '#EF4444', text: 'loved your post'                },
  fire:        { emoji: '🔥', color: '#FF6B35', text: 'fired your post'                },
  haha:        { emoji: '😂', color: '#FFD700', text: 'found your post funny'          },
  wow:         { emoji: '😮', color: '#FFD700', text: 'was amazed by your post'        },
  sad:         { emoji: '😢', color: '#6B7280', text: 'felt sad about your post'       },
  clap:        { emoji: '👏', color: '#00D4C8', text: 'clapped for your post'          },
  comment:     { emoji: '💬', color: '#1E6FFF', text: 'commented on your post'         },
  reply:       { emoji: '↩️', color: '#1E6FFF', text: 'replied to your comment'        },
  follow:      { emoji: '👥', color: '#7B2FFF', text: 'followed you'                   },
  follow_request:{ emoji:'👤', color:'#7B2FFF', text: 'sent a follow request'          },
  repost:      { emoji: '🔁', color: '#2ECC71', text: 'reposted your post'             },
  quote:       { emoji: '💬', color: '#2ECC71', text: 'quoted your post'               },
  share:       { emoji: '📤', color: '#00D4C8', text: 'shared your post'               },
  mention:     { emoji: '🏷️', color: '#FF6B35', text: 'mentioned you'                  },
  message:     { emoji: '📨', color: '#1E6FFF', text: 'sent you a message'             },
  milestone:   { emoji: '🔥', color: '#FFD700', text: ''                               },
  achievement: { emoji: '🏆', color: '#FFD700', text: ''                               },
  system:      { emoji: '📢', color: '#6B7280', text: ''                               },
};

const getTabTypes = (tab) => {
  if (tab === 'activity') return ['like','love','fire','haha','wow','sad','clap','comment','reply','repost','quote','share'];
  if (tab === 'social')   return ['follow','follow_request','mention'];
  if (tab === 'messages') return ['message'];
  return null;
};

export default function Notifications() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [notifs, setNotifs]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [todayStats, setTodayStats] = useState({ reactions: 0, comments: 0, followers: 0, messages: 0 });

  useEffect(() => {
    fetchNotifications();
    markAllRead();
  }, [activeTab]);

  // Real-time updates
  useEffect(() => {
    const ch = supabase.channel('notifs:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, () => fetchNotifications())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user.id]);

  const fetchNotifications = async () => {
    setLoading(true);
    const types = getTabTypes(activeTab);

    let q = supabase
      .from('notifications')
      .select('*, from_user:from_user_id(id,username,display_name,avatar_url,is_verified,badge_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(80);

    if (types) q = q.in('type', types);

    const { data } = await q;
    const grouped = groupNotifications(data || []);
    setNotifs(grouped);

    // Today stats
    const today = new Date(); today.setHours(0,0,0,0);
    const todayN = (data || []).filter((n) => new Date(n.created_at) >= today);
    setTodayStats({
      reactions: todayN.filter((n) => ['like','love','fire','haha','wow','sad','clap'].includes(n.type)).length,
      comments:  todayN.filter((n) => ['comment','reply'].includes(n.type)).length,
      followers: todayN.filter((n) => n.type === 'follow').length,
      messages:  todayN.filter((n) => n.type === 'message').length,
    });
    setLoading(false);
  };

  // Smart bundling — group same type + ref_id
  const groupNotifications = (data) => {
    const groups = {};
    data.forEach((n) => {
      const key = n.type + '_' + (n.ref_id || 'general');
      if (!groups[key]) {
        groups[key] = {
          ...n,
          actors: n.from_user ? [n.from_user] : [],
          count: 1,
        };
      } else {
        if (n.from_user && !groups[key].actors.find((a) => a?.id === n.from_user?.id)) {
          groups[key].actors.push(n.from_user);
          groups[key].count++;
        }
        // Update to most recent
        if (new Date(n.created_at) > new Date(groups[key].created_at)) {
          groups[key].created_at = n.created_at;
          groups[key].is_read = n.is_read && groups[key].is_read;
        }
      }
    });
    return Object.values(groups).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  };

  const markOneRead = async (nid) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', nid);
    setNotifs((prev) => prev.map((n) => n.id === nid ? { ...n, is_read: true } : n));
  };

  const handleAction = async (notif) => {
    await markOneRead(notif.id);
    if (['like','love','fire','haha','wow','sad','clap','comment','reply','repost','quote','share','mention'].includes(notif.type) && notif.ref_id) {
      navigate('/post/' + notif.ref_id);
    } else if (notif.type === 'follow' || notif.type === 'follow_request') {
      navigate('/profile/' + notif.actors?.[0]?.username);
    } else if (notif.type === 'message' && notif.ref_id) {
      navigate('/chats/' + notif.ref_id);
    } else if (notif.actors?.[0]?.username) {
      navigate('/profile/' + notif.actors[0].username);
    }
  };

  const handleFollowBack = async (e, fromUserId, fromUsername) => {
    e.stopPropagation();
    await supabase.from('follows').upsert(
      { follower_id: user.id, following_id: fromUserId, status: 'accepted' },
      { onConflict: 'follower_id,following_id' }
    );
    await supabase.from('notifications').insert({
      user_id: fromUserId, from_user_id: user.id,
      type: 'follow', message: 'followed you back', is_read: false,
    });
    alert('You are now following @' + fromUsername);
  };

  const buildText = (notif) => {
    const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
    const actors = notif.actors || [];
    const firstName = actors[0]?.display_name || 'Someone';
    const extra = notif.count > 1 ? ' and ' + formatNumber(notif.count - 1) + (notif.count === 2 ? ' other' : ' others') : '';

    if (notif.type === 'milestone' || notif.type === 'achievement' || notif.type === 'system') {
      return notif.message || 'New notification';
    }
    return firstName + extra + ' ' + (cfg.text || notif.message || '');
  };

  const hasTodayActivity = Object.values(todayStats).some((v) => v > 0);

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-bold text-xl">Notifications</h1>
          <button onClick={markAllRead} className="text-[#1E6FFF] text-xs font-semibold flex items-center gap-1">
            <Check size={14} /> All read
          </button>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {NOTIF_TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                (activeTab === tab.key ? 'bg-[#1E6FFF] text-white shadow-lg' : 'text-[#6B7280]')}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Today summary card */}
      {hasTodayActivity && activeTab === 'all' && (
        <div className="mx-4 mt-4 bg-gradient-to-r from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-3">📊 Today</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Reactions', value: todayStats.reactions, emoji: '❤️' },
              { label: 'Comments',  value: todayStats.comments,  emoji: '💬' },
              { label: 'Followers', value: todayStats.followers, emoji: '👥' },
              { label: 'Messages',  value: todayStats.messages,  emoji: '📨' },
            ].map((s) => (
              <div key={s.label} className="text-center bg-white/5 rounded-xl py-2.5">
                <p className="text-lg mb-0.5">{s.emoji}</p>
                <p className="text-white font-bold text-base">{s.value}</p>
                <p className="text-[#6B7280] text-[10px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="px-4 py-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🔔</p>
            <p className="text-white font-bold text-lg">No notifications yet</p>
            <p className="text-[#6B7280] text-sm mt-1">When people interact with you, you'll see it here.</p>
          </div>
        ) : (
          notifs.map((notif) => {
            const cfg     = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
            const actors  = notif.actors || [];
            const isFollow = notif.type === 'follow';
            const isSpecial = ['milestone', 'achievement', 'system'].includes(notif.type);
            const hasPreview = notif.preview_text || notif.preview_image;

            return (
              <button
                key={notif.id + notif.type + (notif.ref_id || '')}
                onClick={() => handleAction(notif)}
                className={'w-full flex items-start gap-3 p-3 rounded-2xl transition-all hover:bg-white/5 text-left ' +
                  (!notif.is_read ? 'bg-[#1E6FFF]/5 border border-[#1E6FFF]/10' : '')}
              >
                {/* Avatar or emoji */}
                <div className="relative flex-shrink-0 mt-0.5">
                  {isSpecial || actors.length === 0 ? (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
                      style={{ background: cfg.color + '20' }}>
                      {cfg.emoji}
                    </div>
                  ) : (
                    <div className="relative">
                      <Avatar url={actors[0]?.avatar_url} name={actors[0]?.display_name} size={11} />
                      {actors.length > 1 && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#0A1628] overflow-hidden">
                          <Avatar url={actors[1]?.avatar_url} name={actors[1]?.display_name} size={6} />
                        </div>
                      )}
                      <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[#0A1628] flex items-center justify-center text-[10px]"
                        style={{ background: cfg.color + '30' }}>
                        {cfg.emoji}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Main text */}
                  <p className="text-white/90 text-sm leading-snug">
                    {!isSpecial && actors.length > 0 && (
                      <span className="font-bold">{actors[0]?.display_name}</span>
                    )}
                    {!isSpecial && ' '}
                    <span>{isSpecial ? buildText(notif) : buildText(notif).replace(actors[0]?.display_name || '', '').trim()}</span>
                  </p>

                  {/* Preview card */}
                  {hasPreview && (
                    <div className="mt-1.5 bg-white/5 border border-white/8 rounded-xl p-2 flex items-center gap-2">
                      {notif.preview_image && (
                        <img src={notif.preview_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      )}
                      {notif.preview_text && (
                        <p className="text-[#6B7280] text-xs line-clamp-2 flex-1">"{notif.preview_text}"</p>
                      )}
                    </div>
                  )}

                  <p className="text-[#6B7280] text-xs mt-1">{formatTime(notif.created_at)}</p>

                  {/* Follow back button */}
                  {isFollow && actors[0] && (
                    <button
                      onClick={(e) => handleFollowBack(e, actors[0].id, actors[0].username)}
                      className="mt-2 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white text-xs font-bold px-4 py-1.5 rounded-full"
                    >
                      Follow Back
                    </button>
                  )}
                </div>

                {/* Unread dot */}
                {!notif.is_read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1E6FFF] shadow-sm shadow-[#1E6FFF]/50 flex-shrink-0 mt-1.5" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}