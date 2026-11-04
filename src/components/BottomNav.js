import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Home, Compass, Bell, MessageCircle, User
} from 'lucide-react';

export default function BottomNav() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const { user }     = useAuth();
  const [unread, setUnread] = useState(0);
  const [unreadMsg, setUnreadMsg] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    fetchCounts();

    const ch = supabase.channel('nav:counts:' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, fetchCounts)
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const fetchCounts = async () => {
    const [{ count: n }, { count: m }] = await Promise.all([
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('is_read', false)
        .not('type', 'eq', 'message'),
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('is_read', false)
        .eq('type', 'message'),
    ]);
    setUnread(n || 0);
    setUnreadMsg(m || 0);
  };

  const tabs = [
    { path: '/',              icon: Home,          label: 'Home'    },
    { path: '/discover',      icon: Compass,       label: 'Discover'},
    { path: '/notifications', icon: Bell,          label: 'Activity', badge: unread    },
    { path: '/chats',         icon: MessageCircle, label: 'Chats',    badge: unreadMsg },
    { path: '/profile',       icon: User,          label: 'Profile' },
  ];

  const active = (path) => {
    if (path === '/profile') return location.pathname === '/profile' || location.pathname.startsWith('/profile/');
    return location.pathname === path;
  };

  return (
    <div className="bottom-nav">
      <div className="flex items-center justify-around px-2 py-2 max-w-[620px] mx-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const on   = active(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5 relative px-3 py-1.5 rounded-2xl transition-all active:scale-90"
              style={{ minWidth: 48 }}
            >
              {/* Badge */}
              {tab.badge > 0 && (
                <span
                  className="absolute top-0.5 right-1 min-w-[16px] h-4 bg-[#FF5A1F] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5"
                  style={{ lineHeight: 1 }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}

              {/* Icon */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={{ background: on ? 'rgba(255,90,31,0.15)' : 'transparent' }}
              >
                <Icon
                  size={22}
                  style={{ color: on ? '#FF5A1F' : '#8E8C88' }}
                  fill={on && tab.path === '/' ? '#FF5A1F' : 'none'}
                  strokeWidth={on ? 2.2 : 1.8}
                />
              </div>

              {/* Label */}
              <span
                className="text-[9px] font-semibold transition-colors"
                style={{ color: on ? '#FF5A1F' : '#8E8C88' }}
              >
                {tab.label}
              </span>

              {/* Active dot */}
              {on && (
                <div className="w-1 h-1 rounded-full bg-[#FF5A1F] absolute -bottom-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}