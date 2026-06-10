import { useEffect, useState } from 'react';
import { Home, Search, Zap, MessageCircle, User, Sparkles } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { icon: Home, label: 'Home', path: '/', color: 'text-[#1E6FFF]' },
  { icon: Search, label: 'Discover', path: '/discover', color: 'text-[#7B2FFF]' },
  { icon: Zap, label: 'Vibes', path: '/vibes', color: 'text-[#FF6B35]' },
  { icon: MessageCircle, label: 'Chats', path: '/chats', color: 'text-[#00B4D8]' },
  { icon: User, label: 'Profile', path: '/profile', color: 'text-[#2ECC71]' },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchUnreadNotifs();
    fetchUnreadChats();

    const channel = supabase
      .channel('bottomnav:' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => fetchUnreadNotifs())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => fetchUnreadNotifs())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchUnreadChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetchUnreadChats())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  useEffect(() => {
    if (location.pathname.startsWith('/chats')) {
      supabase.from('messages')
        .update({ seen_at: new Date().toISOString() })
        .neq('sender_id', user.id)
        .is('seen_at', null);
      setUnreadChats(0);
    }
    if (location.pathname === '/notifications') setUnreadNotifs(0);
  }, [location.pathname]);

  const fetchUnreadNotifs = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadNotifs(count || 0);
  };

  const fetchUnreadChats = async () => {
    if (location.pathname.startsWith('/chats')) { setUnreadChats(0); return; }
    const { data: allChats } = await supabase
      .from('chats').select('id').contains('participants', [user.id]);
    if (!allChats?.length) return;
    let total = 0;
    for (const chat of allChats) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .neq('sender_id', user.id)
        .is('seen_at', null);
      total += count || 0;
    }
    setUnreadChats(total);
  };
return (
  <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
    <div className="w-full max-w-[620px] pointer-events-auto relative">

      {/* B-Link AI floating button */}
      <div className="absolute -top-16 right-4">
        <button
          onClick={() => navigate('/ai')}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 active:scale-95 transition-all border-2 border-white/20"
          title="B-Link AI"
        >
          <Sparkles size={20} className="text-white" />
        </button>
      </div>

      {/* Glass bar */}
        <div className="bg-[#0d1f3c]/95 backdrop-blur-md border-t border-white/10 h-16 flex items-center justify-around px-2 shadow-2xl shadow-black/50">
          {tabs.map(({ icon: Icon, label, path, color }) => {
            const isActive = location.pathname === path ||
              (path === '/chats' && location.pathname.startsWith('/chats'));
            const isVibes = label === 'Vibes';
            const isChats = path === '/chats';

            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full group relative"
              >
                {isVibes ? (
  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#FFD700] flex items-center justify-center shadow-lg shadow-[#FF6B35]/40 active:scale-95 transition-transform">
    <Icon size={22} className="text-white" />
  </div>
) : (
                  <>
                    <div className="relative">
                      <Icon
                        size={22}
                        className={'transition-all duration-200 ' + (isActive ? color : 'text-[#6B7280] group-hover:text-white/60')}
                        fill={isActive ? 'currentColor' : 'none'}
                      />
                      {/* Notification badge on home via notifications */}
                      {path === '/' && unreadNotifs > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-[#FF6B35] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                          {unreadNotifs > 9 ? '9+' : unreadNotifs}
                        </span>
                      )}
                      {/* Chat unread badge */}
                      {isChats && unreadChats > 0 && !location.pathname.startsWith('/chats') && (
                        <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-[#1E6FFF] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                          {unreadChats > 99 ? '99+' : unreadChats}
                        </span>
                      )}
                    </div>
                    <span className={'text-[10px] font-medium transition-all duration-200 ' + (isActive ? color : 'text-[#6B7280]')}>
                      {label}
                    </span>
                    {/* Active dot */}
                    {isActive && (
                      <div className={'absolute -bottom-0 w-1 h-1 rounded-full ' + color.replace('text-', 'bg-')} />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNav;