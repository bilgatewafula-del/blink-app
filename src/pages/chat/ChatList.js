import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Search, Edit, X, Trash2 } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { ChatListSkeleton } from '../../components/Skeleton';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // matches AuthContext's heartbeat interval

const ChatList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUsers, setSearchUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [swipedChat, setSwipedChat] = useState(null);
  const [error, setError] = useState('');

  const mountedRef   = useRef(true);
  const chatIdsRef   = useRef(new Set());
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    // Was two unfiltered subscriptions (`table: 'chats'` and
    // `table: 'messages'` with NO filter at all) — meaning this
    // component refetched the ENTIRE chat list, with its full N+1
    // query cost, every single time ANY user on the whole platform
    // sent ANY message or touched ANY chat, not just this user's own.
    // Postgres realtime filters can't do an "array contains me" check
    // server-side against a `participants uuid[]` column, so this
    // filters client-side inside the callback instead — cheap, and it
    // skips the refetch entirely for anything irrelevant.
    const channel = supabase
      .channel('chats:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (payload) => {
        const row = payload.new || payload.old;
        if (row?.participants?.includes(user.id)) fetchChats();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (chatIdsRef.current.has(payload.new?.chat_id)) fetchChats();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  // Single RPC instead of: 1 query for chats, then for EACH chat, 2
  // more queries (other_user lookup + unread count) run via
  // Promise.all — for 20 chats that was 41 round trips on every load.
  // See get_my_chats() in 33_chat_rpcs_and_rls.sql.
  const fetchChats = async () => {
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('get_my_chats');
      if (err) throw err;

      const rows = (data || []).map(r => ({
        id: r.chat_id,
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        unread: r.unread_count || 0,
        other_user: {
          id: r.other_user_id,
          username: r.other_username,
          display_name: r.other_display_name,
          avatar_url: r.other_avatar_url,
          is_verified: r.other_is_verified,
          is_online: r.other_is_online,
          last_seen: r.other_last_seen,
        },
      }));

      if (!mountedRef.current) return;
      chatIdsRef.current = new Set(rows.map(r => r.id));
      setChats(rows);
    } catch (err) {
      console.error('fetchChats:', err.message);
      if (mountedRef.current) setError('Could not load conversations.');
    }
    if (mountedRef.current) setLoading(false);
  };

  const handleUserSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(searchDebounceRef.current);
    if (!q.trim()) { setSearchUsers([]); return; }
    // Was firing a full pattern-match query on every keystroke.
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, is_verified')
        .or('username.ilike.%' + q + '%,display_name.ilike.%' + q + '%')
        .neq('id', user.id)
        .limit(8);
      setSearchUsers(data || []);
      setSearching(false);
    }, 300);
  };

  // Atomic — was a client-side search through the (possibly stale)
  // local `chats` list, then a plain insert with no de-duplication
  // guarantee. Two people messaging each other for the first time at
  // the same moment could each create their own chat row for the
  // identical pair. get_or_create_chat() is unique-constraint-backed.
  const startChat = async (otherUser) => {
    try {
      const { data: chatId, error: err } = await supabase.rpc('get_or_create_chat', { p_other_id: otherUser.id });
      if (err) throw err;
      navigate('/chats/' + chatId);
      setShowNewChat(false);
    } catch (err) {
      setError('Could not start conversation: ' + err.message);
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    const prev = chats;
    setChats(c => c.filter(x => x.id !== chatId)); // optimistic
    setSwipedChat(null);
    try {
      const { error: err } = await supabase.rpc('delete_chat', { p_chat_id: chatId });
      if (err) throw err;
    } catch (err) {
      setChats(prev); // rollback — was previously unconditional, no
                       // rollback path existed if the delete failed.
      setError('Delete failed: ' + err.message);
    }
  };

  const handleOpenChat = async (chat) => {
    // Optimistic local unread-clear so the badge disappears instantly
    // instead of waiting on the round trip.
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread: 0 } : c));
    navigate('/chats/' + chat.id);
    // Fire-and-forget — ChatRoom's own markRead() on mount is the
    // real source of truth; this just keeps the list's badge in sync
    // a beat sooner without blocking navigation on it.
    supabase.from('messages').update({ seen_at: new Date().toISOString() })
      .eq('chat_id', chat.id).neq('sender_id', user.id).is('seen_at', null)
      .then(() => {});
  };

  const isOnline = (u) => {
    if (u?.is_online) return true;
    if (!u?.last_seen) return false;
    return Date.now() - new Date(u.last_seen).getTime() < ONLINE_THRESHOLD_MS;
  };

  const filteredChats = chats.filter((c) =>
    c.other_user?.display_name?.toLowerCase().includes(query.toLowerCase()) ||
    c.other_user?.username?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-bold text-xl">Chats</h1>
          <button
            onClick={() => setShowNewChat(true)}
            aria-label="New message"
            className="w-9 h-9 bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] rounded-full flex items-center justify-center shadow-lg shadow-[#FF5A1F]/30"
          >
            <Edit size={16} className="text-white" />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8C88]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F] transition-colors"
          />
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {showNewChat && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowNewChat(false)}>
          <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">New Message</h2>
              <button
                onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchUsers([]); }}
                aria-label="Close"
                className="text-[#8E8C88] hover:text-white"
              >
                <X size={22} />
              </button>
            </div>
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8C88]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                placeholder="Search by name or username..."
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F] transition-colors"
              />
            </div>
            {searching && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="space-y-2">
              {searchUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startChat(u)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/5 transition-colors"
                >
                  <Avatar url={u.avatar_url} name={u.display_name} size={10} />
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white font-semibold text-sm">{u.display_name}</p>
                      {u.is_verified && (
                        <span className="bg-[#FF5A1F] text-white text-[8px] px-1 py-0.5 rounded-full font-bold">✓</span>
                      )}
                    </div>
                    <p className="text-[#8E8C88] text-xs">@{u.username}</p>
                  </div>
                </button>
              ))}
              {searchQuery && !searching && searchUsers.length === 0 && (
                <p className="text-[#8E8C88] text-sm text-center py-4">No users found</p>
              )}
              {!searchQuery && (
                <p className="text-[#8E8C88] text-sm text-center py-4">Type a name to search</p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <ChatListSkeleton />
      ) : filteredChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
          <div className="text-6xl">💬</div>
          <h2 className="text-white font-bold text-xl text-center">No conversations yet</h2>
          <p className="text-[#8E8C88] text-sm text-center">Start a conversation with someone.</p>
          <button
            onClick={() => setShowNewChat(true)}
            className="bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#FF5A1F]/30"
          >
            Start a Chat
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {filteredChats.map((chat) => (
            <div key={chat.id} className="relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 flex items-center">
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  aria-label="Delete conversation"
                  className="w-20 h-full bg-red-500 flex flex-col items-center justify-center gap-1"
                >
                  <Trash2 size={18} className="text-white" />
                  <span className="text-white text-xs font-bold">Delete</span>
                </button>
              </div>

              <div
                className={'flex items-center gap-3 px-4 py-4 bg-[#0D0C0B] transition-transform duration-200 ' + (swipedChat === chat.id ? '-translate-x-20' : 'translate-x-0')}
                onTouchStart={(e) => {
                  const startX = e.touches[0].clientX;
                  const handleMove = (me) => {
                    if (me.touches[0].clientX < startX - 40) setSwipedChat(chat.id);
                    else if (me.touches[0].clientX > startX + 10) setSwipedChat(null);
                  };
                  document.addEventListener('touchmove', handleMove, { once: true });
                }}
              >
                <button
                  onClick={() => handleOpenChat(chat)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="relative flex-shrink-0">
                    <Avatar url={chat.other_user?.avatar_url} name={chat.other_user?.display_name} size={12} />
                    {/* Was unconditional — every avatar showed the
                        green dot regardless of actual status. Now
                        reflects the real is_online/last_seen values
                        from get_my_chats(), same threshold logic as
                        ChatRoom's own OnlineStatus component. */}
                    {isOnline(chat.other_user) && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#2ECC71] rounded-full border-2 border-[#0D0C0B]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className={'font-bold text-sm truncate ' + (chat.unread > 0 ? 'text-white' : 'text-white/80')}>
                          {chat.other_user?.display_name || 'Unknown'}
                        </p>
                        {chat.other_user?.is_verified && (
                          <span className="bg-[#FF5A1F] text-white text-[8px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
                        )}
                      </div>
                      <span className="text-[#8E8C88] text-xs flex-shrink-0 ml-2">
                        {chat.last_message_at ? formatTime(chat.last_message_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={'text-xs truncate ' + (chat.unread > 0 ? 'text-white/80 font-medium' : 'text-[#8E8C88]')}>
                        {chat.last_message || 'Start a conversation...'}
                      </p>
                      {chat.unread > 0 && (
                        <span className="ml-2 min-w-[20px] h-5 bg-[#FF5A1F] rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1 flex-shrink-0">
                          {chat.unread > 99 ? '99+' : chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSwipedChat(swipedChat === chat.id ? null : chat.id)}
                  aria-label="More options"
                  className="lg:hidden text-[#8E8C88] hover:text-red-400 transition-colors p-1 flex-shrink-0"
                >
                  ···
                </button>
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  aria-label="Delete conversation"
                  className="hidden lg:flex text-[#8E8C88] hover:text-red-400 transition-colors p-1 flex-shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatList;