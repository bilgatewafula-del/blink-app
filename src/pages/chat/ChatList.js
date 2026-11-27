import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Edit, X, Trash2, MessageCircle, SearchX, Pin, PinOff, Archive, ArchiveRestore, CheckCheck, User as UserIcon, AlertCircle,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { EmptyState, Spinner } from '../../components/ui';
import { formatTime } from '../../utils/formatTime';
import { ChatListSkeleton } from '../../components/Skeleton';
import { useOnlineIds, isUserOnline } from '../../lib/presence';
import { getFollowingIds } from '../../lib/follows';
import { useTypingMap, refreshUnread } from '../../lib/chatLive';

const safeLike = (q) => q.replace(/[%_,()\\]/g, ' ').trim();

/* small per-person lists kept on this phone (pinned / archived chats, drafts) */
const lsRead = (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } };
const lsWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };
const draftOf = (chatId) => { const d = lsRead('blink_draft_' + chatId); return typeof d === 'string' ? d.trim() : ''; };

let listCache = { uid: null, rows: null };   // instant paint when you come back to the tab

function OnlineDot({ show, border = '#FFFFFF' }) {
  if (!show) return null;
  return <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] rounded-full" style={{ border: `2px solid ${border}` }} />;
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[3px] ml-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[5px] h-[5px] rounded-full bg-[#047857]" style={{ animation: 'typingBounce 1.1s infinite', animationDelay: i * 0.16 + 's' }} />
      ))}
    </span>
  );
}

function Toast({ text, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [text, onClose]);
  return (
    <div className="fixed inset-x-3 z-[70] max-w-[600px] mx-auto" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }} role="alert">
      <div className="flex items-start gap-2.5 bg-white border border-[#FECACA] border-l-4 border-l-[#EF4444] rounded-2xl px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
        <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
        <p className="text-[#111827] text-[14px] leading-snug flex-1">{text}</p>
        <button onClick={onClose} aria-label="Dismiss" className="text-[#64748B] p-0.5"><X size={16} /></button>
      </div>
    </div>
  );
}

function SheetAction({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-[#F1F5F9]">
      <span className={'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ' + (danger ? 'bg-red-500/10' : 'bg-[#0284C7]/10')}>
        <Icon size={18} className={danger ? 'text-red-600' : 'text-[#0369A1]'} />
      </span>
      <span className={'text-[15px] font-semibold ' + (danger ? 'text-red-600' : 'text-[#111827]')}>{label}</span>
    </button>
  );
}

const ChatList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const onlineIds = useOnlineIds();
  const typingMap = useTypingMap();

  const cached = listCache.uid === user.id ? listCache.rows : null;
  const [chats, setChats] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'archived'
  const [msgHits, setMsgHits] = useState([]);
  const [msgBusy, setMsgBusy] = useState(false);

  const [showNewChat, setShowNewChat] = useState(false);
  const [people, setPeople] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [starting, setStarting] = useState(null);

  const [menuChat, setMenuChat] = useState(null);       // chat whose options sheet is open
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pinned, setPinned] = useState(() => new Set(lsRead('blink_pinned_chats:' + user.id) || []));
  const [archived, setArchived] = useState(() => new Set(lsRead('blink_archived_chats:' + user.id) || []));
  const [hintSeen, setHintSeen] = useState(() => !!lsRead('blink_chat_hint_seen'));

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
      listCache = { uid: user.id, rows };
      setChats(rows);
      // a new message brings an archived chat back
      setArchived((prev) => {
        const back = rows.filter((r) => r.unread > 0 && prev.has(r.id));
        if (!back.length) return prev;
        const next = new Set(prev); back.forEach((r) => next.delete(r.id));
        lsWrite('blink_archived_chats:' + user.id, [...next]);
        return next;
      });
    } catch (err) {
      if (mountedRef.current && !listCache.rows) setError('Could not load your conversations. Pull to refresh or try again.');
    }
    if (mountedRef.current) setLoading(false);
  }, [user.id]);

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
    let base = chats.filter((c) => (filter === 'archived' ? archived.has(c.id) : !archived.has(c.id)));
    if (filter === 'unread') base = base.filter((c) => c.unread > 0);
    if (!q) return base;
    const t = q.toLowerCase();
    return base.filter((c) =>
      c.other_user?.display_name?.toLowerCase().includes(t) ||
      c.other_user?.username?.toLowerCase().includes(t) ||
      c.last_message?.toLowerCase().includes(t));
  }, [chats, q, filter, archived]);
  const unreadTotal = useMemo(() => chats.filter((c) => c.unread > 0 && !archived.has(c.id)).length, [chats, archived]);

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

  const friendlyError = (err) => {
    const m = (err?.message || '').toLowerCase();
    if (m.includes('block')) return "You can't message this person.";
    if (m.includes('not accepting') || m.includes('followers can')) return err.message;
    return "Couldn't start the conversation. Please try again.";
  };

  // Safety net: if the database function is unavailable, find or create the chat directly.
  const findOrCreateDirect = async (otherId) => {
    const { data: existing } = await supabase.from('chats').select('id').contains('participants', [user.id, otherId]).limit(1);
    if (existing && existing[0]) return existing[0].id;
    const { data, error: err } = await supabase.from('chats').insert({ participants: [user.id, otherId] }).select('id').single();
    if (err) throw err;
    return data.id;
  };

  const startChat = async (other) => {
    if (starting) return;
    setStarting(other.id);
    try {
      let chatId;
      const { data, error: err } = await supabase.rpc('get_or_create_chat', { p_other_id: other.id });
      if (err) {
        if ((err.message || '').toLowerCase().includes('block')) throw err;
        chatId = await findOrCreateDirect(other.id);
      } else {
        chatId = Array.isArray(data) ? data[0]?.id ?? data[0] : data?.id ?? data;
      }
      setShowNewChat(false);
      navigate('/chats/' + chatId);
    } catch (err) {
      setError(friendlyError(err));
      setShowNewChat(false);
    }
    setStarting(null);
  };

  /* ── per-chat actions (hidden behind a long-press) ── */
  const togglePin = (chat) => {
    setMenuChat(null);
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(chat.id)) next.delete(chat.id);
      else if (next.size >= 3) { setError('You can pin up to 3 chats.'); return prev; }
      else next.add(chat.id);
      lsWrite('blink_pinned_chats:' + user.id, [...next]);
      return next;
    });
  };
  const toggleArchive = (chat) => {
    setMenuChat(null);
    setArchived((prev) => {
      const next = new Set(prev);
      next.has(chat.id) ? next.delete(chat.id) : next.add(chat.id);
      lsWrite('blink_archived_chats:' + user.id, [...next]);
      return next;
    });
  };
  const markChatRead = async (chat) => {
    setMenuChat(null);
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c)));
    await supabase.from('messages').update({ seen_at: new Date().toISOString() })
      .eq('chat_id', chat.id).neq('sender_id', user.id).is('seen_at', null);
    refreshUnread();
  };
  const askDelete = (chat) => { setMenuChat(null); setDeleteTarget(chat.id); };

  const confirmDelete = async () => {
    const chatId = deleteTarget;
    setDeleteTarget(null);
    const prev = chats;
    setChats((c) => c.filter((x) => x.id !== chatId));
    const { error: err } = await supabase.rpc('delete_chat', { p_chat_id: chatId });
    if (err) { setChats(prev); setError("Couldn't delete the conversation. Please try again."); }
    else refreshUnread();
  };

  const openChat = (chat, state) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c)));
    navigate('/chats/' + chat.id, state ? { state } : undefined);
  };

  /* long-press (touch) or right-click (desktop) opens the options sheet */
  const press = useRef({ timer: null, fired: false, x: 0, y: 0 });
  const pressStart = (chat) => (e) => {
    const t = e.touches ? e.touches[0] : e;
    press.current = { ...press.current, fired: false, x: t.clientX, y: t.clientY };
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setMenuChat(chat);
      if (!hintSeen) { lsWrite('blink_chat_hint_seen', 1); setHintSeen(true); }
    }, 450);
  };
  const pressMove = (e) => {
    const t = e.touches ? e.touches[0] : e;
    if (Math.abs(t.clientX - press.current.x) > 10 || Math.abs(t.clientY - press.current.y) > 10) clearTimeout(press.current.timer);
  };
  const pressEnd = () => clearTimeout(press.current.timer);

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

  // pinned chats first (in the order of the list), the rest keep their order
  const visibleChats = useMemo(() => {
    const pin = filteredChats.filter((c) => pinned.has(c.id));
    const rest = filteredChats.filter((c) => !pinned.has(c.id));
    return [...pin, ...rest];
  }, [filteredChats, pinned]);
  const archivedCount = useMemo(() => chats.filter((c) => archived.has(c.id)).length, [chats, archived]);

  return (
    <div className="min-h-screen pb-24" style={{ background: 'linear-gradient(180deg,#C9E3FF 0%,#DAE9FF 38%,#D8F1EA 100%)' }}>
      {error && <Toast text={error} onClose={() => setError('')} />}

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
      </div>

      {!loading && !searching && (
        <>
          {filter !== 'archived' && (() => {
            const onlineChats = chats.filter((c) => !archived.has(c.id) && isUserOnline(c.other_user, onlineIds)).slice(0, 14);
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

          <div className="flex gap-2 px-4 pt-3 overflow-x-auto scrollbar-none" role="tablist" aria-label="Chat filters">
            {[
              { key: 'all', label: 'All' },
              { key: 'unread', label: unreadTotal > 0 ? 'Unread · ' + unreadTotal : 'Unread' },
              ...(archivedCount > 0 || filter === 'archived' ? [{ key: 'archived', label: 'Archived · ' + archivedCount }] : []),
            ].map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={'flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors active:scale-95 ' +
                  (filter === f.key ? 'bg-[#0284C7] text-white shadow-[0_2px_8px_rgba(2,132,199,0.35)]' : 'bg-white/80 text-[#0369A1] border border-[#BFD7F2]')}>
                {f.label}
              </button>
            ))}
          </div>

          {!hintSeen && chats.length > 0 && (
            <button onClick={() => { lsWrite('blink_chat_hint_seen', 1); setHintSeen(true); }}
              className="mx-4 mt-3 w-[calc(100%-2rem)] text-left text-[12px] text-[#0369A1] bg-white/70 border border-[#BFD7F2] rounded-xl px-3 py-2">
              Tip: press and hold a chat to pin, archive, mark as read or delete it.
            </button>
          )}
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
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-3 pl-9 pr-4 text-[#111827] placeholder-[#94A3B8] text-[15px] focus:outline-none focus:border-[#0284C7]" />
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

      {/* options for one chat — opened by press-and-hold */}
      {menuChat && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setMenuChat(null)}>
          <div className="w-full max-w-[620px] bg-white rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-[#E2E8F0] mx-auto mt-2.5" />
            <div className="flex items-center gap-3 px-5 pt-3 pb-3 border-b border-[#EEF2F7]">
              <Avatar url={menuChat.other_user?.avatar_url} name={menuChat.other_user?.display_name} size={10} />
              <div className="min-w-0">
                <p className="text-[#111827] font-bold text-[15px] truncate">{menuChat.other_user?.display_name}</p>
                <p className="text-[#64748B] text-[12px] truncate">@{menuChat.other_user?.username}</p>
              </div>
            </div>
            <SheetAction icon={pinned.has(menuChat.id) ? PinOff : Pin} label={pinned.has(menuChat.id) ? 'Unpin chat' : 'Pin chat'} onClick={() => togglePin(menuChat)} />
            {menuChat.unread > 0 && <SheetAction icon={CheckCheck} label="Mark as read" onClick={() => markChatRead(menuChat)} />}
            <SheetAction icon={archived.has(menuChat.id) ? ArchiveRestore : Archive} label={archived.has(menuChat.id) ? 'Unarchive' : 'Archive chat'} onClick={() => toggleArchive(menuChat)} />
            <SheetAction icon={UserIcon} label="View profile" onClick={() => { const u = menuChat.other_user?.username; setMenuChat(null); if (u) navigate('/profile/' + u); }} />
            <div className="h-px bg-[#EEF2F7] mx-5 my-1" />
            <SheetAction icon={Trash2} danger label="Delete conversation" onClick={() => askDelete(menuChat)} />
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center" onClick={() => setDeleteTarget(null)}>
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

          {searching && (visibleChats.length > 0) && <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">Chats</p>}

          {visibleChats.length === 0 && !(searching && msgHits.length > 0) ? (
            searching ? (
              msgBusy ? <div className="flex justify-center py-12 text-[#0369A1]"><Spinner size={22} /></div>
                : <EmptyState icon={SearchX} title="No results" text="Try a different name or word from the message." />
            ) : (
              <EmptyState icon={filter === 'archived' ? Archive : MessageCircle}
                title={filter === 'unread' ? "You're all caught up" : filter === 'archived' ? 'Nothing archived' : 'No conversations yet'}
                text={filter === 'unread' ? 'No unread chats right now.' : filter === 'archived' ? 'Archived chats show up here. A new message brings a chat back.' : 'Message someone you follow, or search for a new friend.'}>
                {filter === 'all' && <button onClick={openNewChat} className="bg-[#0284C7] text-white px-6 py-3 rounded-full font-bold text-sm">Start a chat</button>}
              </EmptyState>
            )
          ) : (
            <div className="px-3 pt-3 space-y-2">
              {visibleChats.map((chat) => {
                const on = isUserOnline(chat.other_user, onlineIds);
                const isTyping = typingMap.has(String(chat.id));
                const draft = !isTyping && draftOf(chat.id);
                const unread = chat.unread > 0;
                return (
                  <button
                    key={chat.id}
                    onClick={() => { if (press.current.fired) { press.current.fired = false; return; } openChat(chat); }}
                    onTouchStart={pressStart(chat)} onTouchMove={pressMove} onTouchEnd={pressEnd} onTouchCancel={pressEnd}
                    onContextMenu={(e) => { e.preventDefault(); setMenuChat(chat); }}
                    style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                    className={'w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl border shadow-[0_1px_3px_rgba(11,58,122,0.08)] active:scale-[0.99] transition-transform ' +
                      (unread ? 'border-[#7DD3FC] bg-[#F0F9FF]' : 'border-[#D5E3F5] bg-white')}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar url={chat.other_user?.avatar_url} name={chat.other_user?.display_name} size={12} />
                      <OnlineDot show={on} border={unread ? '#F0F9FF' : '#FFFFFF'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-bold text-[15px] truncate text-[#111827]">{chat.other_user?.display_name || 'Unknown'}</p>
                          {chat.other_user?.is_verified && <VerifiedBadge size={13} />}
                        </div>
                        <span className={'text-[11px] flex-shrink-0 ml-2 ' + (unread ? 'text-[#0369A1] font-bold' : 'text-[#64748B]')}>
                          {chat.last_message_at ? formatTime(chat.last_message_at) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={'text-[13px] truncate min-w-0 ' + (isTyping ? 'text-[#047857] font-semibold' : unread ? 'text-[#111827] font-medium' : 'text-[#64748B]')}>
                          {isTyping ? <>typing<TypingDots /></>
                            : draft ? <><span className="text-[#047857] font-semibold">Draft: </span>{draft}</>
                            : (chat.last_message || 'Say hello')}
                        </p>
                        <span className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {pinned.has(chat.id) && <Pin size={13} className="text-[#64748B] rotate-45" aria-label="Pinned" />}
                          {unread && (
                            <span className="min-w-[20px] h-5 rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1.5 shadow-[0_2px_6px_rgba(37,99,235,0.4)]" style={{ background: 'linear-gradient(135deg,#0EA5E9,#4F46E5)' }}>
                              {chat.unread > 99 ? '99+' : chat.unread}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
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
