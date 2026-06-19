import { useEffect, useState } from 'react';
import { Home, Search, PlusSquare, MessageCircle, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { icon: Home,          label: 'Home',     path: '/',         color: 'text-[#1E6FFF]' },
  { icon: Search,        label: 'Discover', path: '/discover', color: 'text-[#7B2FFF]' },
  { icon: PlusSquare,    label: 'Create',   path: '/create',   color: 'text-[#00D4C8]' },
  { icon: MessageCircle, label: 'Chats',    path: '/chats',    color: 'text-[#00B4D8]' },
  { icon: User,          label: 'Profile',  path: '/profile',  color: 'text-[#2ECC71]' },
];

export default function BottomNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();

  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadChats,  setUnreadChats]  = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Hide when post comment input is focused
  useEffect(() => {
    const onOpen  = () => setCommentsOpen(true);
    const onClose = () => setCommentsOpen(false);
    window.addEventListener('blink:comments:open',  onOpen);
    window.addEventListener('blink:comments:close', onClose);
    return () => {
      window.removeEventListener('blink:comments:open',  onOpen);
      window.removeEventListener('blink:comments:close', onClose);
    };
  }, []);

  useEffect(() => {
    setCommentsOpen(false);
  }, [location.pathname]);

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
        .neq('sender_id', user?.id)
        .is('seen_at', null);
      setUnreadChats(0);
    }
    if (location.pathname === '/notifications') setUnreadNotifs(0);
  }, [location.pathname]);

  const fetchUnreadNotifs = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false);
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
        .from('messages').select('id', { count: 'exact', head: true })
        .eq('chat_id', chat.id).neq('sender_id', user.id).is('seen_at', null);
      total += count || 0;
    }
    setUnreadChats(total);
  };

  // ── Hide rules ──────────────────────────────────────────────────
  const isInsideChatRoom = /^\/chats\/.+/.test(location.pathname);
  const isAIPage         = location.pathname.startsWith('/ai');

  if (isInsideChatRoom || isAIPage || commentsOpen) return null;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ width: '100%', maxWidth: '620px', pointerEvents: 'auto' }}>
        <div style={{
          background: 'rgba(13,31,60,0.97)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 8px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        }}>
          {tabs.map(({ icon: Icon, label, path, color }) => {
            const isActive =
              location.pathname === path ||
              (path === '/chats' && location.pathname.startsWith('/chats')) ||
              (path === '/profile' && location.pathname.startsWith('/profile'));
            const isCreate = label === 'Create';
            const isChats  = path === '/chats';
            const isHome   = path === '/';

            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '2px', flex: 1, height: '100%',
                  background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
                }}
              >
                {isCreate ? (
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #1E6FFF, #00D4C8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(30,111,255,0.4)',
                  }}>
                    <Icon size={22} color="white" />
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Icon
                        size={22}
                        className={isActive ? color : 'text-[#6B7280]'}
                        fill={isActive ? 'currentColor' : 'none'}
                        style={{ transition: 'all 0.2s' }}
                      />
                      {isHome && unreadNotifs > 0 && (
                        <span style={{
                          position: 'absolute', top: '-8px', right: '-8px',
                          minWidth: '16px', height: '16px', background: '#FF6B35',
                          borderRadius: '99px', fontSize: '9px', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, padding: '0 2px',
                        }}>
                          {unreadNotifs > 9 ? '9+' : unreadNotifs}
                        </span>
                      )}
                      {isChats && unreadChats > 0 && !location.pathname.startsWith('/chats') && (
                        <span style={{
                          position: 'absolute', top: '-8px', right: '-8px',
                          minWidth: '16px', height: '16px', background: '#1E6FFF',
                          borderRadius: '99px', fontSize: '9px', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, padding: '0 2px',
                        }}>
                          {unreadChats > 99 ? '99+' : unreadChats}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium ${isActive ? color : 'text-[#6B7280]'}`}>
                      {label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}