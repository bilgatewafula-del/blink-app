import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Search, Edit, X, Trash2, MessageCircle, Users, SearchX, Image as ImageIcon } from 'lucide-react';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { EmptyState, Spinner } from '../../components/ui';
import { formatTime } from '../../utils/formatTime';
import { ChatListSkeleton } from '../../components/Skeleton';
import { useOnlineIds, isUserOnline } from '../../lib/presence';
import { getFollowingIds } from '../../lib/follows';

const safeLike = (q) => q.replace(/[%_,()\\]/g, ' ').trim();

function OnlineDot({ show, border = '#0D0C0B' }) {
  if (!show) return null;
  return <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#2ECC71] rounded-full" style={{ border: `2px solid ${border}` }} />;
}

const ChatList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const onlineIds = useOnlineIds();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [msgHits, setMsgHits] = useState([]);
  const [msgBusy, setMsgBusy] = useState(false);

  const [showNewChat, setShowNewChat] = useState(false);
  const [people, setPeople] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [starting, setStarting] = useState(null);

  const [swipedChat, setSwipedChat] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const mountedRef = useRef(true);
  const chatIdsRef = useRef(new Set());
  const refreshTimer = useRef(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearTimeout(refreshTimer.current); }; }, []);

  /* ── list ── */
  const fetchChats = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('get_my_chats');
      if (err) throw err;
      const rows = (data || []).map((r) => ({
        id: r.chat_id,
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        unread: r.unread_count || 0,
        other_user: {
          id: r.other_user_id, username: r.other_username, display_name: r.other_display_name,
          avatar_url: r.other_avatar_url, is_verified: r.other_is_verified, last_seen: r.other_last_seen,
        },
      }));
      if (!mountedRef.current) return;
      chatIdsRef.current = new Set(rows.map((r) => r.id));
      setChats(rows);
      setError('');
    } catch (err) {
      if (mountedRef.current) setError('Could not load conversations.');
    }
    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => { fetchChats(); }, [fetchChats]);

  // refresh at most once per second, only for chats that are ours
  useEffect(() => {
    const queue = () => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(fetchChats, 700); };
    const ch = supabase.channel('chats:' + user.id + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (p) => {
        const row = p.new || p.old;
        if (!row || !row.participants || row.participants.includes(user.id)) queue();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        if (chatIdsRef.current.has(p.new?.chat_id)) queue();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => {
        if (chatIdsRef.current.has(p.new?.chat_id)) queue();
      })
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') fetchChats(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [user.id, fetchChats]);

  // deliver any of my scheduled messages that are due
  useEffect(() => {
    const run = () => supabase.rpc('deliver_due_messages').then(() => {});
    run();
    const t = setInterval(run, 45000);
    return () => clearInterval(t);
  }, []);

  /* ── search: people in my chats + message text ── */
  const q = safeLike(query);
  const filteredChats = useMemo(() => {
    if (!q) return chats;
    const t = q.toLowerCase();
    return chats.filter((c) =>
      c.other_user?.display_name?.toLowerCase().includes(t) ||
      c.other_user?.username?.toLowerCase().includes(t) ||
      c.last_message?.toLowerCase().includes(t));
  }, [chats, q]);

  useEffect(() => {
    if (q.length < 2) { setMsgHits([]); setMsgBusy(false); return; }
    setMsgBusy(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('messages')
        .select('id, chat_id, body, created_at, sender_id')
        .ilike('body', `%${q}%`)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .or(`deleted_for.is.null,deleted_for.not.cs.{${user.id}}`)
        .order('created_at', { ascending: false }).limit(40);
      const byChat = new Map(chats.map((c) => [c.id, c]));
      setMsgHits((data || []).filter((m) => byChat.has(m.chat_id)).map((m) => ({ ...m, chat: byChat.get(m.chat_id) })));
      setMsgBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, chats, user.id]);

  /* ── new chat ── */
  const openNewChat = async () => {
    setShowNewChat(true);
    if (suggested !== null) return;
    try {
      const ids = (await getFollowingIds(user.id)).slice(0, 40);
      if (ids.length === 0) { setSuggested([]); return; }
      const { data } = await supabase.from('users').select('id, username, display_name, avatar_url, is_verified, last_seen')
        .in('id', ids).neq('is_banned', true).limit(40);
      setSuggested(data || []);
    } catch { setSuggested([]); }
  };

  useEffect(() => {
    const t = safeLike(peopleQuery);
    if (t.length < 2) { setPeople([]); setPeopleBusy(false); return; }
    setPeopleBusy(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('users')
        .select('id, username, display_name, avatar_url, is_verified, last_seen')
        .or(`username.ilike.%${t}%,display_name.ilike.%${t}%`)
        .neq('id', user.id).neq('is_banned', true).limit(15);
      setPeople(data || []);
      setPeopleBusy(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [peopleQuery, user.id]);

  const startChat = async (other) => {
    if (starting) return;
    setStarting(other.id);
    try {
      const { data: chatId, error: err } = await supabase.rpc('get_or_create_chat', { p_other_id: other.id });
      if (err) throw err;
      navigate('/chats/' + (Array.isArray(chatId) ? chatId[0]?.id ?? chatId[0] : chatId?.id ?? chatId));
      setShowNewChat(false);
    } catch (err) {
      const m = (err.message || '').toLowerCase();
      setError(m.includes('block') ? "You can't message this person." : 'Could not start conversation: ' + err.message);
      setShowNewChat(false);
    }
    setStarting(null);
  };

  /* ── delete / open ── */
  const confirmDelete = async () => {
    const chatId = deleteTarget;
    setDeleteTarget(null); setSwipedChat(null);
    const prev = chats;
    setChats((c) => c.filter((x) => x.id !== chatId));
    const { error: err } = await supabase.rpc('delete_chat', { p_chat_id: chatId });
    if (err) { setChats(prev); setError('Delete failed: ' + err.message); }
  };

  const openChat = (chat, state) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c)));
    navigate('/chats/' + chat.id, state ? { state } : undefined);
  };

  const personRow = (u) => (
    <button key={u.id} onClick={() => startChat(u)} disabled={starting === u.id}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-white/5 transition-colors text-left disabled:opacity-60">
      <div className="relative flex-shrink-0">
        <Avatar url={u.avatar_url} name={u.display_name} size={11} />
        <OnlineDot show={isUserOnline(u, onlineIds)} border="#171614" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-white font-semibold text-sm truncate">{u.display_name}</p>
          {u.is_verified && <VerifiedBadge size={13} />}
        </div>
        <p className="text-[#8E8C88] text-xs truncate">@{u.username}</p>
      </div>
      {starting === u.id && <Spinner size={16} className="text-[#FF5A1F]" />}
    </button>
  );

  const searching = q.length > 0;

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/95 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-bold text-xl">Chats</h1>
          <button onClick={openNewChat} aria-label="New message"
            className="w-9 h-9 bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] rounded-full flex items-center justify-center shadow-lg shadow-[#FF5A1F]/30 active:scale-90 transition-transform">
            <Edit size={16} className="text-white" />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8C88]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats and messages"
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-9 text-white placeholder-[#8E8C88] text-[15px] focus:outline-none focus:border-[#FF5A1F]/60 transition-colors" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8C88]"><X size={15} /></button>}
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {showNewChat && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowNewChat(false)}>
          <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">New message</h2>
              <button onClick={() => { setShowNewChat(false); setPeopleQuery(''); setPeople([]); }} aria-label="Close" className="text-[#8E8C88] hover:text-white"><X size={22} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8C88]" />
              <input type="text" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search by name or username" autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white placeholder-[#8E8C88] text-[15px] focus:outline-none focus:border-[#FF5A1F]/60" />
            </div>
            <div className="overflow-y-auto flex-1 -mx-2 px-2">
              {safeLike(peopleQuery).length >= 2 ? (
                peopleBusy ? <div className="flex justify-center py-6 text-[#FF5A1F]"><Spinner size={20} /></div>
                  : people.length === 0 ? <p className="text-[#8E8C88] text-sm text-center py-8">No one found</p>
                  : people.map(personRow)
              ) : (
                <>
                  <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-3 pb-2">People you follow</p>
                  {suggested === null ? <div className="flex justify-center py-6 text-[#FF5A1F]"><Spinner size={20} /></div>
                    : suggested.length === 0 ? <p className="text-[#8E8C88] text-sm text-center py-8">Follow people to message them quickly, or search above.</p>
                    : suggested.map(personRow)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-bold text-base text-center">Delete this conversation?</p>
            <p className="text-[#8E8C88] text-sm text-center mt-1">This deletes the conversation and all its messages for both of you. This cannot be undone.</p>
            <div className="space-y-2 mt-4">
              <button onClick={confirmDelete} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Delete</button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <ChatListSkeleton /> : (
        <>
          {searching && msgHits.length > 0 && (
            <div>
              <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">Messages</p>
              {msgHits.map((m) => (
                <button key={m.id} onClick={() => openChat(m.chat, { jumpTo: m.id, at: m.created_at })}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.04] text-left">
                  <Avatar url={m.chat.other_user?.avatar_url} name={m.chat.other_user?.display_name} size={10} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between">
                      <p className="text-white text-sm font-semibold truncate">{m.chat.other_user?.display_name}</p>
                      <span className="text-[#8E8C88] text-[11px] flex-shrink-0 ml-2">{formatTime(m.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-white/60 truncate">{m.sender_id === user.id ? 'You: ' : ''}{m.body}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searching && (filteredChats.length > 0) && <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">Chats</p>}

          {filteredChats.length === 0 && !(searching && msgHits.length > 0) ? (
            searching ? (
              msgBusy ? <div className="flex justify-center py-12 text-[#FF5A1F]"><Spinner size={22} /></div>
                : <EmptyState icon={SearchX} title="No results" text="Try a different name or word from the message." />
            ) : (
              <EmptyState icon={MessageCircle} title="No conversations yet" text="Message someone you follow, or search for a new friend.">
                <button onClick={openNewChat} className="bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#FF5A1F]/30">Start a chat</button>
              </EmptyState>
            )
          ) : (
            <div className="divide-y divide-white/5">
              {filteredChats.map((chat) => {
                const on = isUserOnline(chat.other_user, onlineIds);
                return (
                  <div key={chat.id} className="relative overflow-hidden">
                    <div className="absolute right-0 top-0 bottom-0 flex items-center">
                      <button onClick={() => setDeleteTarget(chat.id)} aria-label="Delete conversation" className="w-20 h-full bg-red-500 flex flex-col items-center justify-center gap-1">
                        <Trash2 size={18} className="text-white" /><span className="text-white text-xs font-bold">Delete</span>
                      </button>
                    </div>
                    <div
                      className={'flex items-center gap-3 px-4 py-3.5 bg-[#0D0C0B] transition-transform duration-200 ' + (swipedChat === chat.id ? '-translate-x-20' : 'translate-x-0')}
                      onTouchStart={(e) => {
                        const startX = e.touches[0].clientX;
                        const move = (me) => {
                          const x = me.touches[0].clientX;
                          if (x < startX - 40) setSwipedChat(chat.id);
                          else if (x > startX + 10) setSwipedChat(null);
                        };
                        document.addEventListener('touchmove', move, { once: true });
                      }}
                    >
                      <button onClick={() => (swipedChat === chat.id ? setSwipedChat(null) : openChat(chat))} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div className="relative flex-shrink-0">
                          <Avatar url={chat.other_user?.avatar_url} name={chat.other_user?.display_name} size={12} />
                          <OnlineDot show={on} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={'font-bold text-[15px] truncate ' + (chat.unread > 0 ? 'text-white' : 'text-white/85')}>{chat.other_user?.display_name || 'Unknown'}</p>
                              {chat.other_user?.is_verified && <VerifiedBadge size={13} />}
                            </div>
                            <span className={'text-[11px] flex-shrink-0 ml-2 ' + (chat.unread > 0 ? 'text-[#FF5A1F] font-semibold' : 'text-[#8E8C88]')}>
                              {chat.last_message_at ? formatTime(chat.last_message_at) : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className={'text-[13px] truncate ' + (chat.unread > 0 ? 'text-white/85 font-medium' : 'text-[#8E8C88]')}>
                              {chat.last_message || 'Say hello'}
                            </p>
                            {chat.unread > 0 && (
                              <span className="ml-2 min-w-[20px] h-5 bg-[#FF5A1F] rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1.5 flex-shrink-0">
                                {chat.unread > 99 ? '99+' : chat.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button onClick={() => setDeleteTarget(chat.id)} aria-label="Delete conversation" className="hidden lg:flex text-[#8E8C88] hover:text-red-400 p-1 flex-shrink-0"><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChatList;
