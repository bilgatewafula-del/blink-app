import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Search, Edit, X, Trash2 } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { ChatListSkeleton } from '../../components/Skeleton';

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

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('chats:' + user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chats',
      }, () => fetchChats())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, () => fetchChats())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .contains('participants', [user.id])
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!data) { setLoading(false); return; }

    const enriched = await Promise.all(
      data.map(async (chat) => {
        const otherId = chat.participants.find((id) => id !== user.id);
        if (!otherId) return { ...chat, other_user: null, unread: 0 };
        const { data: otherUser } = await supabase
          .from('users')
          .select('id, username, display_name, avatar_url, is_verified')
          .eq('id', otherId)
          .single();

        // Count unread messages for this chat
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .neq('sender_id', user.id)
          .is('seen_at', null);

        return { ...chat, other_user: otherUser, unread: count || 0 };
      })
    );

    setChats(enriched);
    setLoading(false);
  };

  const handleUserSearch = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchUsers([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified')
      .or('username.ilike.%' + q + '%,display_name.ilike.%' + q + '%')
      .neq('id', user.id)
      .limit(8);
    setSearchUsers(data || []);
    setSearching(false);
  };

  const startChat = async (otherUser) => {
    const existing = chats.find((c) =>
      c.participants.includes(otherUser.id) && c.participants.includes(user.id)
    );
    if (existing) {
      navigate('/chats/' + existing.id);
      setShowNewChat(false);
      return;
    }
    const { data } = await supabase
      .from('chats')
      .insert({ participants: [user.id, otherUser.id] })
      .select()
      .single();
    if (data) {
      navigate('/chats/' + data.id);
      setShowNewChat(false);
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    // Delete all messages in chat first
    await supabase.from('messages').delete().eq('chat_id', chatId);
    // Delete the chat
    await supabase.from('chats').delete().eq('id', chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    setSwipedChat(null);
  };

  // Mark chat as read when opening
  const handleOpenChat = async (chat) => {
    await supabase
      .from('messages')
      .update({ seen_at: new Date().toISOString() })
      .eq('chat_id', chat.id)
      .neq('sender_id', user.id)
      .is('seen_at', null);
    navigate('/chats/' + chat.id);
  };

  const filteredChats = chats.filter((c) =>
    c.other_user?.display_name?.toLowerCase().includes(query.toLowerCase()) ||
    c.other_user?.username?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-bold text-xl">Chats</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-9 h-9 bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] rounded-full flex items-center justify-center shadow-lg shadow-[#1E6FFF]/30"
          >
            <Edit size={16} className="text-white" />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
          />
        </div>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">New Message</h2>
              <button
                onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchUsers([]); }}
                className="text-[#6B7280] hover:text-white"
              >
                <X size={22} />
              </button>
            </div>
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                placeholder="Search by name or username..."
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
              />
            </div>
            {searching && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] animate-pulse" />
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
                        <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold">✓</span>
                      )}
                    </div>
                    <p className="text-[#6B7280] text-xs">@{u.username}</p>
                  </div>
                </button>
              ))}
              {searchQuery && !searching && searchUsers.length === 0 && (
                <p className="text-[#6B7280] text-sm text-center py-4">No users found</p>
              )}
              {!searchQuery && (
                <p className="text-[#6B7280] text-sm text-center py-4">Type a name to search</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat list */}
      {loading ? (
        <ChatListSkeleton />
      ) : filteredChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
          <div className="text-6xl">💬</div>
          <h2 className="text-white font-bold text-xl text-center">No conversations yet</h2>
          <p className="text-[#6B7280] text-sm text-center">Start a conversation with someone.</p>
          <button
            onClick={() => setShowNewChat(true)}
            className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30"
          >
            Start a Chat
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              className="relative overflow-hidden"
            >
              {/* Swipe actions revealed behind */}
              <div className="absolute right-0 top-0 bottom-0 flex items-center">
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  className="w-20 h-full bg-red-500 flex flex-col items-center justify-center gap-1"
                >
                  <Trash2 size={18} className="text-white" />
                  <span className="text-white text-xs font-bold">Delete</span>
                </button>
              </div>

              {/* Chat row */}
              <div
                className={'flex items-center gap-3 px-4 py-4 bg-[#0A1628] transition-transform duration-200 ' + (swipedChat === chat.id ? '-translate-x-20' : 'translate-x-0')}
                onTouchStart={(e) => {
                  const startX = e.touches[0].clientX;
                  const handleMove = (me) => {
                    if (me.touches[0].clientX < startX - 40) {
                      setSwipedChat(chat.id);
                    } else if (me.touches[0].clientX > startX + 10) {
                      setSwipedChat(null);
                    }
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
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#2ECC71] rounded-full border-2 border-[#0A1628]" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className={'font-bold text-sm truncate ' + (chat.unread > 0 ? 'text-white' : 'text-white/80')}>
                          {chat.other_user?.display_name || 'Unknown'}
                        </p>
                        {chat.other_user?.is_verified && (
                          <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
                        )}
                      </div>
                      <span className="text-[#6B7280] text-xs flex-shrink-0 ml-2">
                        {chat.last_message_at ? formatTime(chat.last_message_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={'text-xs truncate ' + (chat.unread > 0 ? 'text-white/80 font-medium' : 'text-[#6B7280]')}>
                        {chat.last_message || 'Start a conversation...'}
                      </p>
                      {chat.unread > 0 && (
                        <span className="ml-2 min-w-[20px] h-5 bg-[#1E6FFF] rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1 flex-shrink-0">
                          {chat.unread > 99 ? '99+' : chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Desktop delete */}
                <button
                  onClick={() => setSwipedChat(swipedChat === chat.id ? null : chat.id)}
                  className="lg:hidden text-[#6B7280] hover:text-red-400 transition-colors p-1 flex-shrink-0"
                >
                  ···
                </button>
                <button
                  onClick={() => handleDeleteChat(chat.id)}
                  className="hidden lg:flex text-[#6B7280] hover:text-red-400 transition-colors p-1 flex-shrink-0"
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