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

function OnlineDot({ show, border = '#FFFFFF' }) {
  if (!show) return null;
  return <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] rounded-full" style={{ border: `2px solid ${border}` }} />;
}

const ChatList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const onlineIds = useOnlineIds();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
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
    const base = filter === 'unread' ? chats.filter((c) => c.unread > 0) : chats;
    if (!q) return base;
    const t = q.toLowerCase();
    return base.filter((c) =>
      c.other_user?.display_name?.toLowerCase().includes(t) ||
      c.other_user?.username?.toLowerCase().includes(t) ||
      c.last_message?.toLowerCase().includes(t));
  }, [chats, q, filter]);
  const unreadTotal = useMemo(() => chats.filter((c) => c.unread > 0).length, [chats]);

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
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[#F8FAFC] transition-colors text-left disabled:opacity-60">
      <div className="relative flex-shrink-0">
        <Avatar url={u.avatar_url} name={u.display_name} size={11} />
        <OnlineDot show={isUserOnline(u, onlineIds)} border="#FFFFFF" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[#111827] font-semibold text-sm truncate">{u.display_name}</p>
          {u.is_verified && <VerifiedBadge size={13} />}
        </div>
        <p className="text-[#64748B] text-xs truncate">@{u.username}</p>
      </div>
      {starting === u.id && <Spinner size={16} className="text-[#0369A1]" />}
    </button>
  );

  const searching = q.length > 0;

  return (
    <div className="min-h-screen pb-24" style={{ background: 'linear-gradient(180deg,#C9E3FF 0%,#DAE9FF 38%,#D8F1EA 100%)' }}>
      <div className="sticky top-0 z-20 px-4 py-3 shadow-[0_4px_14px_rgba(11,58,122,0.25)]" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', background: 'linear-gradient(135deg,#11152E 0%,#0B3A7A 60%,#0284C7 100%)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-extrabold text-[26px] leading-none">Chats</h1>
          <button onClick={openNewChat} aria-label="New message"
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform shadow-[0_4px_12px_rgba(6,182,212,0.45)]"
            style={{ background: 'linear-gradient(135deg,#22D3EE 0%,#2563EB 100%)' }}>
            <Edit size={18} className="text-white" />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats and messages"
            className="w-full bg-white/10 border border-white/15 rounded-xl py-2.5 pl-9 pr-9 text-white placeholder-[#94A3B8] text-[15px] focus:outline-none focus:border-[#67E8F9] focus:bg-white/15 transition-colors" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"><X size={15} /></button>}
        </div>
        {error && <p className="text-[#FCA5A5] text-xs mt-2">{error}</p>}
      </div>

      {!loading && !searching && (
        <>
          {(() => {
            const onlineChats = chats.filter((c) => isUserOnline(c.other_user, onlineIds)).slice(0, 14);
            if (!onlineChats.length) return null;
            return (
              <div className="pt-3.5">
                <p className="text-[#0369A1] text-[11px] font-bold uppercase tracking-wider px-4 pb-2">Online now</p>
                <div className="flex gap-3.5 overflow-x-auto scrollbar-none px-4 pb-1">
                  {onlineChats.map((c) => (
                    <button key={c.id} onClick={() => openChat(c)} className="flex flex-col items-center gap-1 flex-shrink-0 w-[58px] active:scale-95 transition-transform">
                      <span className="relative p-[2.5px] rounded-full" style={{ background: 'linear-gradient(135deg,#22D3EE,#2563EB,#7C3AED)' }}>
                        <span className="block rounded-full bg-white p-[2px]">
                          <Avatar url={c.other_user?.avatar_url} name={c.other_user?.display_name} size={11} />
                        </span>
                        <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-[#10B981] rounded-full border-2 border-white" />
                      </span>
                      <span className="text-[11px] font-medium text-[#1E3A5F] truncate w-full text-center">{(c.other_user?.display_name || '').split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex gap-2 px-4 pt-3" role="tablist" aria-label="Chat filters">
            {[{ key: 'all', label: 'All' }, { key: 'unread', label: unreadTotal > 0 ? 'Unread · ' + unreadTotal : 'Unread' }].map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={'px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors active:scale-95 ' +
                  (filter === f.key ? 'bg-[#0284C7] text-white shadow-[0_2px_8px_rgba(2,132,199,0.35)]' : 'bg-white/80 text-[#0369A1] border border-[#BFD7F2]')}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {showNewChat && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowNewChat(false)}>
          <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-5 h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[#111827] font-bold text-lg">New message</h2>
              <button onClick={() => { setShowNewChat(false); setPeopleQuery(''); setPeople([]); }} aria-label="Close" className="text-[#64748B] hover:text-[#111827]"><X size={22} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
              <input type="text" value={peopleQuery} onChange={(e) => setPeopleQuery(e.target.value)} placeholder="Search by name or username" autoFocus
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-3 pl-9 pr-4 text-[#111827] placeholder-[#94A3B8] text-[15px] focus:outline-none focus:border-[#7C3AED]/60" />
            </div>
            <div className="overflow-y-auto flex-1 -mx-2 px-2">
              {safeLike(peopleQuery).length >= 2 ? (
                peopleBusy ? <div className="flex justify-center py-6 text-[#0369A1]"><Spinner size={20} /></div>
                  : people.length === 0 ? <p className="text-[#64748B] text-sm text-center py-8">No one found</p>
                  : people.map(personRow)
              ) : (
                <>
                  <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-3 pb-2">People you follow</p>
                  {suggested === null ? <div className="flex justify-center py-6 text-[#0369A1]"><Spinner size={20} /></div>
                    : suggested.length === 0 ? <p className="text-[#64748B] text-sm text-center py-8">Follow people to message them quickly, or search above.</p>
                    : suggested.map(personRow)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-[#111827] font-bold text-base text-center">Delete this conversation?</p>
            <p className="text-[#64748B] text-sm text-center mt-1">This deletes the conversation and all its messages for both of you. This cannot be undone.</p>
            <div className="space-y-2 mt-4">
              <button onClick={confirmDelete} className="w-full py-3 rounded-xl bg-red-500/15 text-red-600 font-bold border border-red-500/30">Delete</button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-3 rounded-xl bg-[#F1F5F9] text-[#111827] font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <ChatListSkeleton /> : (
        <>
          {searching && msgHits.length > 0 && (
            <div>
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">Messages</p>
              {msgHits.map((m) => (
                <button key={m.id} onClick={() => openChat(m.chat, { jumpTo: m.id, at: m.created_at })}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F8FAFC] text-left">
                  <Avatar url={m.chat.other_user?.avatar_url} name={m.chat.other_user?.display_name} size={10} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between">
                      <p className="text-[#111827] text-sm font-semibold truncate">{m.chat.other_user?.display_name}</p>
                      <span className="text-[#64748B] text-[11px] flex-shrink-0 ml-2">{formatTime(m.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-[#64748B] truncate">{m.sender_id === user.id ? 'You: ' : ''}{m.body}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searching && (filteredChats.length > 0) && <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">Chats</p>}

          {filteredChats.length === 0 && !(searching && msgHits.length > 0) ? (
            searching ? (
              msgBusy ? <div className="flex justify-center py-12 text-[#0369A1]"><Spinner size={22} /></div>
                : <EmptyState icon={SearchX} title="No results" text="Try a different name or word from the message." />
            ) : (
              <EmptyState icon={MessageCircle} title={filter === 'unread' ? "You're all caught up" : "No conversations yet"} text={filter === 'unread' ? "No unread chats right now." : "Message someone you follow, or search for a new friend."}>
                <button onClick={openNewChat} className="bg-[#7C3AED] text-white px-6 py-3 rounded-full font-bold text-sm  ">Start a chat</button>
              </EmptyState>
            )
          ) : (
            <div className="px-3 pt-3 space-y-2">
              {filteredChats.map((chat) => {
                const on = isUserOnline(chat.other_user, onlineIds);
                return (
                  <div key={chat.id} className={'relative overflow-hidden rounded-2xl border shadow-[0_1px_3px_rgba(11,58,122,0.08)] ' + (chat.unread > 0 ? 'border-[#7DD3FC] bg-[#F0F9FF]' : 'border-[#D5E3F5] bg-white')}>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center">
                      <button onClick={() => setDeleteTarget(chat.id)} aria-label="Delete conversation" className="w-20 h-full bg-red-500 flex flex-col items-center justify-center gap-1">
                        <Trash2 size={18} className="text-white" /><span className="text-white text-xs font-bold">Delete</span>
                      </button>
                    </div>
                    <div
                      className={'flex items-center gap-3 px-4 py-3.5 transition-transform duration-200 ' + (chat.unread > 0 ? 'bg-[#F0F9FF] ' : 'bg-white ') + + (swipedChat === chat.id ? '-translate-x-20' : 'translate-x-0')}
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
                              <p className={'font-bold text-[15px] truncate ' + (chat.unread > 0 ? 'text-[#111827]' : 'text-[#111827]')}>{chat.other_user?.display_name || 'Unknown'}</p>
                              {chat.other_user?.is_verified && <VerifiedBadge size={13} />}
                            </div>
                            <span className={'text-[11px] flex-shrink-0 ml-2 ' + (chat.unread > 0 ? 'text-[#0369A1] font-bold' : 'text-[#64748B]')}>
                              {chat.last_message_at ? formatTime(chat.last_message_at) : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className={'text-[13px] truncate ' + (chat.unread > 0 ? 'text-[#111827] font-medium' : 'text-[#64748B]')}>
                              {chat.last_message || 'Say hello'}
                            </p>
                            {chat.unread > 0 && (
                              <span className="ml-2 min-w-[20px] h-5 rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1.5 flex-shrink-0 shadow-[0_2px_6px_rgba(37,99,235,0.4)]" style={{ background: 'linear-gradient(135deg,#0EA5E9,#4F46E5)' }}>
                                {chat.unread > 99 ? '99+' : chat.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button onClick={() => setDeleteTarget(chat.id)} aria-label="Delete conversation" className="hidden lg:flex text-[#64748B] hover:text-red-600 p-1 flex-shrink-0"><Trash2 size={16} /></button>
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
