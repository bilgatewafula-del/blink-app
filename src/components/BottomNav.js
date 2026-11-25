import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Home, Compass, Zap, MessageCircle, User
} from 'lucide-react';

// One consistent five-item bottom navigation. Each tab owns a feature colour;
// the selected tab shows its full colour, a tinted tile, a top indicator bar
// AND a white label — so selection never relies on colour alone.
const INACTIVE = '#94A3B8';

export default function BottomNav() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const { user }     = useAuth();
  const [unreadMsg, setUnreadMsg] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    fetchCounts();

    const ch = supabase.channel('nav:message-counts:' + user.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, fetchCounts)
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const fetchCounts = async () => {
    const { count: m } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false)
      .eq('type', 'message');
    setUnreadMsg(m || 0);
  };

  const tabs = [
    { path: '/',         icon: Home,          label: 'Home',     color: '#7C3AED' },
    { path: '/discover', icon: Compass,       label: 'Discover', color: '#059669' },
    { path: '/flash',    icon: Zap,           label: 'B-Flash',  color: '#E11D48' },
    { path: '/chats',    icon: MessageCircle, label: 'Chats',    color: '#0284C7', badge: unreadMsg },
    { path: '/profile',  icon: User,          label: 'Profile',  color: '#84CC16' },
  ];

  const active = (path) => {
    if (path === '/profile') return location.pathname === '/profile' || location.pathname.startsWith('/profile/');
    return location.pathname === path;
  };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="flex items-center justify-around px-2 pt-1.5 pb-1.5 max-w-[620px] mx-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const on   = active(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => {
                if (on) { window.scrollTo({ top: 0, behavior: 'smooth' }); window.dispatchEvent(new CustomEvent('blink:tab-reselect', { detail: tab.path })); }
                else navigate(tab.path);
              }}
              aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} unread` : tab.label}
              aria-current={on ? 'page' : undefined}
              className="flex flex-col items-center gap-0.5 relative px-2 pt-1 pb-0.5 rounded-2xl transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{ minWidth: 56 }}
            >
              {/* Selected indicator bar */}
              {on && (
                <span
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-7 rounded-full"
                  style={{ background: tab.color }}
                />
              )}

              {/* Badge */}
              {tab.badge > 0 && (
                <span
                  className="absolute top-0 right-2 min-w-[17px] h-[17px] bg-[#E11D48] rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1 border-2 border-[#11152E]"
                  style={{ lineHeight: 1 }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}

              {/* Icon */}
              <div
                className="w-11 h-8 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: on ? tab.color + '33' : 'transparent' }}
              >
                <Icon
                  size={24}
                  style={{ color: on ? tab.color : INACTIVE }}
                  strokeWidth={on ? 2.4 : 1.9}
                />
              </div>

              {/* Label */}
              <span
                className="text-[11px] font-semibold leading-none transition-colors"
                style={{ color: on ? '#FFFFFF' : INACTIVE }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
