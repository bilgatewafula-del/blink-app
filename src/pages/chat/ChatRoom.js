// src/pages/chat/ChatRoom.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { sendNotification } from '../../hooks/useNotifications';
import { compressImage, uploadImage } from '../../lib/imageUtils';
import { useOnlineIds, isUserOnline, formatLastSeen } from '../../lib/presence';
import {
  ArrowLeft, Send, ImageIcon, Smile, MoreVertical, Search, X, Copy, Reply, Forward,
  Star, Pin, Edit3, Trash2, Info, Volume2, VolumeX, Shield, Flag, Paperclip, Camera,
  CalendarClock, MapPin, Zap, ChevronDown, ChevronUp, Check, Eraser, Clock, Download,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import ImageViewer from '../../components/ImageViewer';
import VerifiedBadge from '../../components/VerifiedBadge';
import MessageBubble from '../../components/chat/MessageBubble';
import { Spinner } from '../../components/ui';

const EMOJI_CATS = [
  { label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺'] },
  { label: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','✍️','💅','🤳','🦵','🦶','👂','🦻','👃','👀','👁️','👅','🦷','🦴'] },
  { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','💯','💢','💥','💫','💦','💨','💬','💭','💤'] },
  { label: '🎉', emojis: ['🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','🏅','🎵','🎶','🎼','🎤','🎧','🎷','🎸','🎹','🎺','🎻','🥁','🎮','🎲','🎯','🎳','🎪','🎭','🎨','🎬'] },
  { label: '🍕', emojis: ['🍕','🍔','🍟','🌭','🌮','🌯','🥙','🍳','🥘','🍲','🍜','🍝','🍣','🍱','🍛','🍚','🍙','🍘','🧁','🎂','🍰','🍩','🍪','🍫','🍬','🍭','☕','🧋','🍵','🧃','🥤','🍺','🍻','🥂','🍷'] },
  { label: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🐙','🦑','🐬','🐳','🦈'] },
  { label: '🌍', emojis: ['🌍','🌎','🌏','🌐','🗺️','🏔️','⛰️','🌋','🏕️','🏖️','🏜️','🏝️','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏰','🗼','🗽','⛪','🕌','🌁','🌃','🏙️','🌄','🌅','🌆'] },
  { label: '🇰🇪', emojis: ['🇰🇪','🇳🇬','🇬🇭','🇿🇦','🇹🇿','🇺🇬','🇪🇹','🇷🇼','🇬🇧','🇺🇸','🇨🇦','🇦🇺','🇮🇳','🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇧🇷','🇲🇽','🇦🇷','🇨🇴','🇪🇬','🇲🇦','🇸🇳','🇨🇲','🇦🇴'] },
];

const PAGE = 40;
const MAX_LEN = 2000;
const MAX_IMG_MB = 15;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '👏'];
const REPORT_REASONS = ['Spam or scam', 'Harassment or bullying', 'Fake account or impersonation', 'Inappropriate content', 'Something else'];
const DEFAULT_QUICK = ['Sawa, nakuja', 'Nipigie baadaye', 'Asante sana', 'Niko busy kidogo, nitakurudia'];

/* ── helpers ─────────────────────────────────────────────── */
const uniqSorted = (arr) => {
  const map = new Map();
  arr.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

const dayLabel = (iso) => {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-KE', { weekday: 'long' });
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtFull = (iso) => iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const safeLike = (q) => q.replace(/[%_,()\\]/g, ' ').trim();
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };

/* Keep the chat exactly the size of what is VISIBLE, so the keyboard,
   emoji panels and phone sticker/GIF keyboards can never cover the input. */
function useViewport() {
  const read = () => {
    const vv = window.visualViewport;
    return { h: vv ? vv.height : window.innerHeight, top: vv ? vv.offsetTop : 0 };
  };
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setVp(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return vp;
}

/* ── small UI pieces ─────────────────────────────────────── */
function Sheet({ onClose, children, z = 60 }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center" style={{ zIndex: z }} onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />
        {children}
      </div>
    </div>
  );
}

function SheetRow({ icon: Icon, label, onClick, red, sub, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={'w-full flex items-center gap-3.5 px-5 py-3.5 text-left hover:bg-white/[0.05] active:bg-white/[0.08] disabled:opacity-40 ' + (red ? 'text-red-400' : 'text-white')}>
      <Icon size={19} className={red ? 'text-red-400' : 'text-white/70'} />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {sub && <span className="block text-[12px] text-[#8E8C88] mt-0.5">{sub}</span>}
      </span>
    </button>
  );
}

/* ── main screen ─────────────────────────────────────────── */
export default function ChatRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const vp = useViewport();
  const onlineIds = useOnlineIds();

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const typingCh = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const mountedRef = useRef(true);
  const nearBottom = useRef(true);
  const lastNotifAt = useRef(0);
  const sendStamps = useRef([]);
  const messagesRef = useRef([]);
  const otherRef = useRef(null);
  const toastTimer = useRef(null);

  const [messages, setMessages] = useState([]);
  const [parents, setParents] = useState({});
  const [otherUser, setOtherUser] = useState(null);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [detached, setDetached] = useState(false);
  const [unseenBelow, setUnseenBelow] = useState(0);

  const [msg, setMsg] = useState(() => lsGet('blink_draft_' + id, ''));
  const [panel, setPanel] = useState(null);           // 'emoji' | null
  const [emojiCat, setEmojiCat] = useState(0);
  const [recents, setRecents] = useState(() => lsGet('blink_recent_emoji', []));
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [actionMsg, setActionMsg] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [popId, setPopId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [toast, setToast] = useState(null);

  const [searchMode, setSearchMode] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchIdx, setSearchIdx] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [starredView, setStarredView] = useState(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const [schedSupported, setSchedSupported] = useState(null);
  const [scheduled, setScheduled] = useState([]);
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedListOpen, setSchedListOpen] = useState(false);
  const [schedTime, setSchedTime] = useState('');
  const [quickReplies, setQuickReplies] = useState(() => lsGet('blink_quick_replies', DEFAULT_QUICK));
  const [quickOpen, setQuickOpen] = useState(false);

  messagesRef.current = messages;
  otherRef.current = otherUser;

  const online = isUserOnline(otherUser, onlineIds);

  const showToast = useCallback((text, type = 'ok') => {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearTimeout(toastTimer.current); }; }, []);

  /* ── scrolling ── */
  const scrollBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom.current) setUnseenBelow(0);
    if (el.scrollTop < 80) loadOlderRef.current?.();
  }, []);

  /* ── data ── */
  const attachReactions = useCallback(async (rows) => {
    if (rows.length === 0) return rows;
    const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', rows.map((m) => m.id));
    const byMsg = {};
    (data || []).forEach((r) => { (byMsg[r.message_id] = byMsg[r.message_id] || {})[r.user_id] = r.emoji; });
    return rows.map((m) => ({ ...m, reactions: byMsg[m.id] || {} }));
  }, []);

  const visibleFilter = (q) => q.or(`deleted_for.is.null,deleted_for.not.cs.{${user.id}}`);

  const loadLatest = useCallback(async () => {
    const { data, error } = await visibleFilter(
      supabase.from('messages').select('*').eq('chat_id', id),
    ).order('created_at', { ascending: false }).limit(PAGE);
    if (error) throw error;
    const rows = await attachReactions((data || []).reverse().filter((m) => !m.deleted_for?.includes(user.id)));
    if (!mountedRef.current) return;
    setMessages(rows);
    setHasOlder((data || []).length === PAGE);
    setDetached(false);
    requestAnimationFrame(() => scrollBottom(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user.id]);

  const loadOlderRef = useRef(null);
  const loadOlder = useCallback(async () => {
    const first = messagesRef.current[0];
    if (!first || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevH = el?.scrollHeight || 0;
    const { data } = await visibleFilter(
      supabase.from('messages').select('*').eq('chat_id', id).lt('created_at', first.created_at),
    ).order('created_at', { ascending: false }).limit(PAGE);
    const rows = await attachReactions((data || []).reverse().filter((m) => !m.deleted_for?.includes(user.id)));
    if (!mountedRef.current) return;
    setMessages((prev) => uniqSorted([...rows, ...prev]));
    setHasOlder((data || []).length === PAGE);
    setLoadingOlder(false);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH + el.scrollTop; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasOlder, loadingOlder, user.id]);
  loadOlderRef.current = loadOlder;

  const markRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    await supabase.from('messages').update({ seen_at: new Date().toISOString() })
      .eq('chat_id', id).neq('sender_id', user.id).is('seen_at', null);
  }, [id, user.id]);

  /* ── init ── */
  useEffect(() => {
    let cancelled = false;
    setInitLoading(true); setInitError(''); setMessages([]);
    setMsg(lsGet('blink_draft_' + id, ''));
    (async () => {
      try {
        const [infoRes] = await Promise.all([
          supabase.rpc('get_chat_info', { p_chat_id: id }),
          loadLatest(),
          markRead(),
        ].map((p) => Promise.resolve(p).catch((e) => ({ data: null, error: e }))));
        if (cancelled) return;

        let info = infoRes?.data?.[0];
        if (!info) {
          try {
            const { data: chat } = await supabase.from('chats').select('id, participants').eq('id', id).maybeSingle();
            const otherId = (chat?.participants || []).find((pid) => pid !== user.id);
            if (otherId) {
              const { data: u } = await supabase.from('users')
                .select('id,username,display_name,avatar_url,is_verified,last_seen,bio').eq('id', otherId).maybeSingle();
              if (u) info = { other_user_id: u.id, ...u };
            }
          } catch { /* handled below */ }
        }
        if (!info) throw infoRes?.error || new Error('This conversation could not be found.');
        setOtherUser({
          id: info.other_user_id, username: info.username, display_name: info.display_name,
          avatar_url: info.avatar_url, is_verified: info.is_verified, last_seen: info.last_seen, bio: info.bio,
        });
        setMuted(!!info.is_muted);
      } catch (err) {
        if (!cancelled) setInitError(err.message || 'Could not load conversation.');
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // drafts survive leaving the screen
  useEffect(() => {
    const t = setTimeout(() => { if (msg) lsSet('blink_draft_' + id, msg); else localStorage.removeItem('blink_draft_' + id); }, 350);
    return () => clearTimeout(t);
  }, [msg, id]);

  // grow the text box
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [msg, editing]);

  // keep the latest message in view when the keyboard / panels open
  useEffect(() => { if (nearBottom.current) scrollBottom(false); }, [vp.h, panel, replyTo, editing, scrollBottom]);

  /* ── realtime ── */
  useEffect(() => {
    const ch = supabase.channel('chat:' + id + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'chat_id=eq.' + id }, (p) => {
        const row = p.new;
        if (!row || row.deleted_for?.includes(user.id)) return;
        const mine = row.sender_id === user.id;
        if (!mine) {
          const patch = { delivered_at: new Date().toISOString() };
          if (document.visibilityState === 'visible') patch.seen_at = patch.delivered_at;
          supabase.from('messages').update(patch).eq('id', row.id).then(() => {});
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          // replace our optimistic copy of the same message
          const idx = mine ? prev.findIndex((m) => m._pending && m._tempKey && m.body === row.body && m.message_type === row.message_type) : -1;
          if (idx >= 0) { const next = prev.slice(); next[idx] = { ...row, reactions: {} }; return next; }
          return [...prev, { ...row, reactions: {} }];
        });
        if (!mine) {
          if (nearBottom.current) requestAnimationFrame(() => scrollBottom(true));
          else setUnseenBelow((n) => n + 1);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'chat_id=eq.' + id }, (p) => {
        const row = p.new;
        if (row.deleted_for?.includes(user.id)) { setMessages((prev) => prev.filter((m) => m.id !== row.id)); return; }
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const mid = p.old?.id;
        if (mid) setMessages((prev) => prev.filter((m) => m.id !== mid));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
        const row = p.new?.message_id ? p.new : p.old;
        if (!row?.message_id) return;
        if (!messagesRef.current.some((m) => m.id === row.message_id)) return;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== row.message_id) return m;
          const next = { ...(m.reactions || {}) };
          if (p.eventType === 'DELETE') delete next[row.user_id];
          else next[row.user_id] = p.new.emoji;
          return { ...m, reactions: next };
        }));
      })
      .subscribe();

    const tc = supabase.channel('typing:' + id)
      .on('broadcast', { event: 'typing' }, (p) => {
        if (p.payload?.uid && p.payload.uid === otherRef.current?.id) {
          setIsTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsTyping(false), 2800);
        }
      }).subscribe();
    typingCh.current = tc;

    const onVis = () => { if (document.visibilityState === 'visible') markRead(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      supabase.removeChannel(ch); supabase.removeChannel(tc);
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(typingTimer.current);
    };
  }, [id, user.id, markRead, scrollBottom]);

  // contact's profile changes (name / photo / last_seen)
  useEffect(() => {
    if (!otherUser?.id) return;
    const ch = supabase.channel('contact:' + otherUser.id + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'id=eq.' + otherUser.id },
        (p) => setOtherUser((prev) => ({ ...prev, display_name: p.new.display_name, avatar_url: p.new.avatar_url, last_seen: p.new.last_seen, is_verified: p.new.is_verified })))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [otherUser?.id]);

  // quoted messages that are older than what we loaded
  useEffect(() => {
    const have = new Set(messages.map((m) => m.id));
    const missing = [...new Set(messages.map((m) => m.parent_message_id).filter((pid) => pid && !have.has(pid) && !parents[pid]))];
    if (missing.length === 0) return;
    supabase.from('messages').select('id, body, message_type, sender_id, is_deleted').in('id', missing.slice(0, 30)).then(({ data }) => {
      if (!data) return;
      setParents((prev) => { const n = { ...prev }; data.forEach((r) => { n[r.id] = r; }); return n; });
    });
  }, [messages, parents]);

  // arriving from a message search: jump straight to that message
  useEffect(() => {
    const st = location.state;
    if (initLoading || !st?.jumpTo) return;
    const t = setTimeout(() => jumpTo(st.jumpTo, st.at), 250);
    navigate(location.pathname, { replace: true, state: null });
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initLoading]);

  /* ── scheduled messages (needs the SQL file; hidden if absent) ── */
  const loadScheduled = useCallback(async () => {
    const { data, error } = await supabase.from('scheduled_messages').select('id, body, send_at, status')
      .eq('chat_id', id).eq('status', 'pending').order('send_at', { ascending: true });
    if (error) { setSchedSupported(false); return; }
    setSchedSupported(true);
    setScheduled(data || []);
  }, [id]);

  useEffect(() => {
    loadScheduled();
    const t = setInterval(async () => {
      const { data } = await supabase.rpc('deliver_due_messages');
      if (data > 0) loadScheduled();
    }, 30000);
    return () => clearInterval(t);
  }, [loadScheduled]);

  /* ── sending ── */
  const allowSend = () => {
    const now = Date.now();
    sendStamps.current = sendStamps.current.filter((t) => now - t < 5000);
    if (sendStamps.current.length >= 12) { showToast('Slow down a little', 'error'); return false; }
    sendStamps.current.push(now);
    return true;
  };

  const notifyOther = (text) => {
    if (!otherRef.current || muted) return;
    if (Date.now() - lastNotifAt.current < 60000) return; // one alert per minute per chat
    lastNotifAt.current = Date.now();
    sendNotification({ to: otherRef.current.id, from: user.id, type: 'message', message: text, refId: id }).catch(() => {});
  };

  const insertMessage = async (payload) => {
    const { data, error } = await supabase.from('messages')
      .insert({ ...payload, chat_id: id, sender_id: user.id, delivered_at: new Date().toISOString(), deleted_for: [], starred_by: [] })
      .select('*').single();
    if (error) throw error;
    return data;
  };

  const sendOptimistic = async (payload, local = {}) => {
    const tempId = 'temp-' + Date.now() + Math.random().toString(36).slice(2, 5);
    const temp = {
      id: tempId, chat_id: id, sender_id: user.id, created_at: new Date().toISOString(),
      deleted_for: [], starred_by: [], reactions: {}, _pending: true, _tempKey: tempId, _payload: payload,
      body: '', message_type: 'text', ...payload, ...local,
    };
    setMessages((prev) => [...prev, temp]);
    nearBottom.current = true;
    requestAnimationFrame(() => scrollBottom(true));
    try {
      const row = await insertMessage(payload);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? { ...row, reactions: {} } : m));
      });
      return row;
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
      return null;
    }
  };

  const handleSend = async () => {
    const text = msg.trim();
    if (!text) return;
    if (text.length > MAX_LEN) { showToast(`Messages can be up to ${MAX_LEN} characters`, 'error'); return; }

    if (editing) {
      if (Date.now() - new Date(editing.created_at).getTime() > 15 * 60 * 1000) { showToast('Messages can only be edited for 15 minutes', 'error'); setEditing(null); setMsg(''); return; }
      const target = editing;
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, body: text, edited: true } : m)));
      setEditing(null); setMsg('');
      const { error } = await supabase.from('messages').update({ body: text, edited: true, edited_at: new Date().toISOString() }).eq('id', target.id).eq('sender_id', user.id);
      if (error) { showToast("Couldn't save the edit", 'error'); setMessages((prev) => prev.map((m) => (m.id === target.id ? target : m))); }
      return;
    }

    if (!allowSend()) return;
    const payload = { body: text, message_type: 'text', parent_message_id: replyTo?.id || null };
    setMsg(''); setReplyTo(null); setPanel(null);
    localStorage.removeItem('blink_draft_' + id);
    const row = await sendOptimistic(payload);
    if (row) notifyOther('sent you a message: "' + text.slice(0, 50) + '"');
  };

  const retryFailed = async (m) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (m._payload) {
      if (m._payload.message_type === 'image' && m._file) await sendImage(m._file);
      else await sendOptimistic(m._payload);
    }
  };

  const sendImage = async (file) => {
    if (!allowSend()) return;
    const preview = URL.createObjectURL(file);
    const tempId = 'temp-' + Date.now();
    setMessages((prev) => [...prev, {
      id: tempId, chat_id: id, sender_id: user.id, created_at: new Date().toISOString(), body: '', message_type: 'image',
      media_url: preview, _local: true, _pending: true, _tempKey: tempId, deleted_for: [], starred_by: [], reactions: {},
    }]);
    nearBottom.current = true;
    requestAnimationFrame(() => scrollBottom(true));
    setUploading(true);
    try {
      const small = await compressImage(file, { maxSize: 1280, quality: 0.82 });
      const url = await uploadImage(small, 'chat_media');
      const row = await insertMessage({ body: '', media_url: url, message_type: 'image' });
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? { ...row, reactions: {} } : m));
      });
      notifyOther('sent you a photo');
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true, _file: file, _payload: { message_type: 'image' } } : m)));
      showToast(err.message || 'Photo could not be sent', 'error');
    }
    setUploading(false);
  };

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setAttachOpen(false);
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Please choose an image', 'error'); return; }
    if (f.size > MAX_IMG_MB * 1024 * 1024) { showToast(`Image must be under ${MAX_IMG_MB}MB`, 'error'); return; }
    sendImage(f);
  };

  const shareLocation = () => {
    setAttachOpen(false);
    if (!navigator.geolocation) { showToast('Location is not available on this device', 'error'); return; }
    showToast('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await sendOptimistic({ body: `My location: https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`, message_type: 'text' });
      },
      () => showToast('Allow location access to share it', 'error'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const doSchedule = async (iso) => {
    const text = msg.trim();
    if (!text) { showToast('Type the message first, then schedule it', 'error'); return; }
    const when = new Date(iso);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 30000) { showToast('Pick a time at least a minute from now', 'error'); return; }
    const { error } = await supabase.rpc('schedule_message', { p_chat_id: id, p_body: text, p_send_at: when.toISOString() });
    if (error) { showToast(error.message || 'Could not schedule', 'error'); return; }
    setMsg(''); setSchedOpen(false); setSchedTime('');
    showToast('Scheduled for ' + fmtFull(when.toISOString()));
    loadScheduled();
  };

  const cancelScheduled = async (sid) => {
    const { error } = await supabase.rpc('cancel_scheduled_message', { p_id: sid });
    if (error) { showToast(error.message || 'Could not cancel', 'error'); return; }
    setScheduled((prev) => prev.filter((s) => s.id !== sid));
  };

  /* ── typing ── */
  const onType = (e) => {
    const v = e.target.value.slice(0, MAX_LEN + 50);
    setMsg(v);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { uid: user.id } });
    }
  };

  /* ── emoji ── */
  const insertAtCaret = (txt) => {
    const el = inputRef.current;
    const s = el?.selectionStart ?? msg.length;
    const e2 = el?.selectionEnd ?? msg.length;
    setMsg(msg.slice(0, s) + txt + msg.slice(e2));
    requestAnimationFrame(() => { if (el) { el.selectionStart = el.selectionEnd = s + txt.length; } });
    const next = [txt, ...recents.filter((r) => r !== txt)].slice(0, 24);
    setRecents(next); lsSet('blink_recent_emoji', next);
  };

  const toggleEmoji = () => {
    if (panel === 'emoji') { setPanel(null); setTimeout(() => inputRef.current?.focus(), 30); }
    else { inputRef.current?.blur(); setPanel('emoji'); setAttachOpen(false); }
  };

  const emojiList = emojiCat === -1 ? recents : EMOJI_CATS[emojiCat]?.emojis || [];

  /* ── message actions ── */
  const react = useCallback(async (mid, emoji) => {
    const m = messagesRef.current.find((x) => x.id === mid);
    if (!m || m.is_deleted || String(mid).startsWith('temp-')) return;
    const undo = m.reactions?.[user.id] === emoji;
    setMessages((prev) => prev.map((x) => {
      if (x.id !== mid) return x;
      const next = { ...(x.reactions || {}) };
      if (undo) delete next[user.id]; else next[user.id] = emoji;
      return { ...x, reactions: next };
    }));
    const q = undo
      ? supabase.from('message_reactions').delete().eq('message_id', mid).eq('user_id', user.id)
      : supabase.from('message_reactions').upsert({ message_id: mid, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
    const { error } = await q;
    if (error) setMessages((prev) => prev.map((x) => (x.id === mid ? { ...x, reactions: m.reactions || {} } : x)));
  }, [user.id]);

  const onDoubleTap = useCallback((m) => {
    if (m._pending || m._failed) return;
    setPopId(m.id); setTimeout(() => setPopId(null), 800);
    if (m.reactions?.[user.id] !== '❤️') react(m.id, '❤️');
  }, [react, user.id]);

  const onLongPress = useCallback((m) => { setConfirmAll(false); setActionMsg(m); }, []);
  const onReply = useCallback((m) => {
    if (m.is_deleted || m._pending) return;
    setReplyTo(m); setEditing(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);
  const onImage = useCallback((url) => setViewerImage(url), []);

  const jumpTo = useCallback(async (mid, createdAt) => {
    let el = document.getElementById('msg-' + mid);
    if (!el) {
      const at = createdAt || parents[mid]?.created_at;
      if (!at) { showToast('That message is older than what is loaded', 'error'); return; }
      const [older, newer] = await Promise.all([
        visibleFilter(supabase.from('messages').select('*').eq('chat_id', id).lt('created_at', at)).order('created_at', { ascending: false }).limit(25),
        visibleFilter(supabase.from('messages').select('*').eq('chat_id', id).gte('created_at', at)).order('created_at', { ascending: true }).limit(80),
      ]);
      const rows = await attachReactions([...(older.data || []).reverse(), ...(newer.data || [])].filter((m) => !m.deleted_for?.includes(user.id)));
      setMessages(uniqSorted(rows));
      setHasOlder((older.data || []).length === 25);
      setDetached((newer.data || []).length === 80);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      el = document.getElementById('msg-' + mid);
    }
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlashId(mid); setTimeout(() => setFlashId(null), 1300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user.id, parents]);

  const copyText = async (m) => {
    setActionMsg(null);
    try { await navigator.clipboard.writeText(m.body || ''); showToast('Copied'); } catch { showToast('Could not copy', 'error'); }
  };

  const delForMe = async (m) => {
    setActionMsg(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (String(m.id).startsWith('temp-')) return;
    const { error } = await supabase.rpc('delete_message_for_me', { p_message_id: m.id });
    if (error) { setMessages((prev) => uniqSorted([...prev, m])); showToast('Could not delete', 'error'); }
  };

  const delForAll = async (m) => {
    setActionMsg(null); setConfirmAll(false);
    const snapshot = m;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_deleted: true, body: '', media_url: null, is_pinned: false } : x)));
    const { error } = await supabase.rpc('delete_message_for_all', { p_message_id: m.id });
    if (error) { setMessages((prev) => prev.map((x) => (x.id === m.id ? snapshot : x))); showToast(error.message || 'Could not delete for everyone', 'error'); }
  };

  const removeDeletedNotices = async () => {
    setMenuOpen(false);
    const gone = messagesRef.current.filter((m) => m.is_deleted);
    if (gone.length === 0) { showToast('No deleted-message notices to remove'); return; }
    const ids = new Set(gone.map((m) => m.id));
    setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
    await Promise.all(gone.slice(0, 100).map((m) => supabase.rpc('delete_message_for_me', { p_message_id: m.id })));
    showToast(`Removed ${gone.length} notice${gone.length === 1 ? '' : 's'}`);
  };

  const toggleStar = async (m) => {
    setActionMsg(null);
    const has = m.starred_by?.includes(user.id);
    const next = has ? (m.starred_by || []).filter((u) => u !== user.id) : [...(m.starred_by || []), user.id];
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, starred_by: next } : x)));
    const { error } = await supabase.from('messages').update({ starred_by: next }).eq('id', m.id);
    if (error) setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  };

  const togglePin = async (m) => {
    setActionMsg(null);
    const pin = !m.is_pinned;
    setMessages((prev) => prev.map((x) => ({ ...x, is_pinned: x.id === m.id ? pin : (pin ? false : x.is_pinned) })));
    if (pin) await supabase.from('messages').update({ is_pinned: false }).eq('chat_id', id).eq('is_pinned', true);
    const { error } = await supabase.from('messages').update({ is_pinned: pin }).eq('id', m.id);
    if (error) showToast('Could not update pin', 'error');
  };

  const pinned = useMemo(() => [...messages].reverse().find((m) => m.is_pinned && !m.is_deleted), [messages]);

  /* ── search ── */
  useEffect(() => {
    if (!searchMode) return;
    const q = safeLike(searchQ);
    if (q.length < 2) { setSearchResults([]); setSearchIdx(-1); return; }
    setSearchBusy(true);
    const t = setTimeout(async () => {
      const { data } = await visibleFilter(
        supabase.from('messages').select('id, body, created_at, sender_id, message_type')
          .eq('chat_id', id).ilike('body', `%${q}%`).or('is_deleted.is.null,is_deleted.eq.false'),
      ).order('created_at', { ascending: false }).limit(100);
      setSearchResults(data || []); setSearchIdx(-1); setShowResults(true); setSearchBusy(false);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, searchMode, id]);

  const gotoResult = (i) => {
    const r = searchResults[i];
    if (!r) return;
    setSearchIdx(i); setShowResults(false);
    jumpTo(r.id, r.created_at);
  };

  const closeSearch = () => { setSearchMode(false); setSearchQ(''); setSearchResults([]); setShowResults(false); setSearchIdx(-1); };

  const openStarred = async () => {
    setMenuOpen(false);
    const { data } = await supabase.from('messages').select('*').eq('chat_id', id).contains('starred_by', [user.id])
      .or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: false }).limit(100);
    setStarredView(data || []);
  };

  /* ── header menu actions ── */
  const toggleMute = async () => {
    setMenuOpen(false);
    const prev = muted;
    setMuted(!prev);
    const { data, error } = await supabase.rpc('toggle_chat_mute', { p_chat_id: id });
    if (error) setMuted(prev); else { setMuted(!!data); showToast(data ? 'Muted' : 'Unmuted'); }
  };

  const doBlock = async () => {
    setBlockOpen(false);
    const { error } = await supabase.rpc('block_user', { p_target_id: otherUser.id });
    if (error) { showToast(error.message || 'Could not block', 'error'); return; }
    navigate('/chats');
  };

  const doClear = async () => {
    setClearOpen(false);
    const { error } = await supabase.rpc('clear_chat_for_me', { p_chat_id: id });
    if (error) { showToast(error.message || 'Could not clear chat', 'error'); return; }
    setMessages([]); setHasOlder(false);
    showToast('Chat cleared');
  };

  const doReport = async (reason) => {
    setReportOpen(false);
    const { error } = await supabase.rpc('report_user', { p_target_id: otherUser.id, p_reason: reason, p_details: null });
    showToast(error ? (error.message || 'Could not send report') : 'Report sent. Thank you.', error ? 'error' : 'ok');
  };

  /* ── render helpers ── */
  const groups = useMemo(() => {
    const out = [];
    let last = '';
    messages.forEach((m) => {
      const key = new Date(m.created_at).toDateString();
      if (key !== last) { out.push({ key, label: dayLabel(m.created_at), items: [] }); last = key; }
      out[out.length - 1].items.push(m);
    });
    return out;
  }, [messages]);

  const term = searchMode ? safeLike(searchQ) : '';
  const nameOf = (sid) => (sid === user.id ? 'You' : otherUser?.display_name);
  const canSend = msg.trim().length > 0;

  if (initLoading) return (
    <div className="flex items-center justify-center bg-[#0D0C0B]" style={{ height: vp.h }}><Spinner size={28} className="text-[#FF5A1F]" /></div>
  );

  if (initError) return (
    <div className="flex flex-col items-center justify-center gap-3 bg-[#0D0C0B] px-6 text-center" style={{ height: vp.h }}>
      <p className="text-white font-bold text-[17px]">Could not load conversation</p>
      <p className="text-[#8E8C88] text-[13px]">{initError}</p>
      <button onClick={() => window.location.reload()} className="bg-[#FF5A1F] text-white font-bold text-sm rounded-full px-6 py-2.5">Try again</button>
      <button onClick={() => navigate('/chats')} className="text-[#8E8C88] font-semibold text-sm">Back to chats</button>
    </div>
  );

  const statusLine = isTyping
    ? <span className="text-[#2ECC71] text-[12px] font-medium">typing…</span>
    : online
      ? <span className="text-[#2ECC71] text-[12px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#2ECC71]" />Online</span>
      : <span className="text-[#8E8C88] text-[12px] truncate">{formatLastSeen(otherUser?.last_seen)}</span>;

  return (
    <div className="fixed left-0 right-0 flex flex-col bg-[#0D0C0B]" style={{ top: vp.top, height: vp.h }}>
      {toast && (
        <div className={'fixed top-3 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full text-[13px] font-semibold shadow-xl max-w-[90vw] text-center ' +
          (toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-white text-black')}>{toast.text}</div>
      )}
      {viewerImage && <ImageViewer images={[viewerImage]} index={0} onClose={() => setViewerImage(null)} />}

      {/* ── top bar ── */}
      <div className="flex-shrink-0 bg-[#171614] border-b border-white/10 px-2 py-2 flex items-center gap-1">
        {searchMode ? (
          <>
            <button onClick={closeSearch} aria-label="Close search" className="p-2 text-[#8E8C88]"><ArrowLeft size={22} /></button>
            <input autoFocus value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setShowResults(true); }} placeholder="Search in this chat"
              className="flex-1 bg-transparent text-white text-[16px] outline-none placeholder-[#8E8C88]" />
            {searchBusy && <Spinner size={16} className="text-[#8E8C88] mr-1" />}
            {searchResults.length > 0 && searchIdx >= 0 && (
              <>
                <button onClick={() => setShowResults((v) => !v)} className="text-[12px] text-[#8E8C88] px-1">{searchIdx + 1}/{searchResults.length}</button>
                <button onClick={() => gotoResult(Math.min(searchResults.length - 1, searchIdx + 1))} aria-label="Older match" className="p-2 text-white/80"><ChevronUp size={20} /></button>
                <button onClick={() => gotoResult(Math.max(0, searchIdx - 1))} aria-label="Newer match" className="p-2 text-white/80"><ChevronDown size={20} /></button>
              </>
            )}
            {searchQ && <button onClick={() => setSearchQ('')} aria-label="Clear" className="p-2 text-[#8E8C88]"><X size={18} /></button>}
          </>
        ) : (
          <>
            <button onClick={() => navigate('/chats')} aria-label="Back" className="p-2 text-[#8E8C88]"><ArrowLeft size={22} /></button>
            <button onClick={() => navigate('/profile/' + otherUser?.username)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <div className="relative flex-shrink-0">
                <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={10} />
                {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#2ECC71] border-2 border-[#171614]" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-bold text-[15px] truncate">{otherUser?.display_name}</p>
                  {otherUser?.is_verified && <VerifiedBadge size={14} />}
                </div>
                {statusLine}
              </div>
            </button>
            <button onClick={() => setSearchMode(true)} aria-label="Search messages" className="p-2.5 text-[#8E8C88]"><Search size={20} /></button>
            <button onClick={() => setMenuOpen(true)} aria-label="Chat options" className="p-2.5 text-[#8E8C88]"><MoreVertical size={20} /></button>
          </>
        )}
      </div>

      {/* search results list */}
      {searchMode && showResults && searchQ.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 bg-[#171614] border-b border-white/10 max-h-[55%] overflow-y-auto" style={{ top: 56 }}>
          {searchResults.length === 0 && !searchBusy && <p className="text-[#8E8C88] text-sm text-center py-8">No messages found</p>}
          {searchResults.map((r, i) => (
            <button key={r.id} onClick={() => gotoResult(i)} className="w-full text-left px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.04]">
              <div className="flex justify-between">
                <span className="text-[12px] font-bold text-[#FF5A1F]">{nameOf(r.sender_id)}</span>
                <span className="text-[11px] text-[#8E8C88]">{fmtFull(r.created_at)}</span>
              </div>
              <p className="text-[14px] text-white/80 truncate mt-0.5">{r.body}</p>
            </button>
          ))}
        </div>
      )}

      {/* pinned */}
      {pinned && !searchMode && (
        <button onClick={() => jumpTo(pinned.id, pinned.created_at)}
          className="flex-shrink-0 flex items-center gap-2.5 px-4 py-2 bg-[#FF5A1F]/10 border-b border-[#FF5A1F]/20 text-left">
          <Pin size={14} className="text-[#FF5A1F] flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-[#FF5A1F]">Pinned message</p>
            <p className="text-[12px] text-white/70 truncate">{pinned.message_type === 'image' ? 'Photo' : pinned.body}</p>
          </div>
        </button>
      )}

      {/* ── messages ── */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3" style={{ overscrollBehavior: 'contain' }}
        onClick={() => { if (panel) setPanel(null); }}>
        {loadingOlder && <div className="flex justify-center py-2 text-[#FF5A1F]"><Spinner size={16} /></div>}
        {!hasOlder && messages.length > 0 && <p className="text-center text-[11px] text-[#8E8C88] py-2">Start of conversation</p>}

        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex justify-center my-3">
              <span className="text-[11px] text-[#8E8C88] bg-[#1d1c1a]/90 px-3 py-1 rounded-full">{g.label}</span>
            </div>
            {g.items.map((m, idx) => (
              <MessageBubble
                key={m.id}
                m={m}
                isMine={m.sender_id === user.id}
                isFirst={idx === 0 || g.items[idx - 1].sender_id !== m.sender_id}
                isLast={idx === g.items.length - 1 || g.items[idx + 1].sender_id !== m.sender_id}
                parent={m.parent_message_id ? (messages.find((x) => x.id === m.parent_message_id) || parents[m.parent_message_id]) : null}
                parentName={m.parent_message_id ? nameOf((messages.find((x) => x.id === m.parent_message_id) || parents[m.parent_message_id])?.sender_id) : null}
                otherUser={otherUser}
                isStarred={!!m.starred_by?.includes(user.id)}
                reactions={m.reactions}
                term={term}
                pop={popId === m.id}
                flash={flashId === m.id}
                onLongPress={onLongPress}
                onDoubleTap={onDoubleTap}
                onReply={onReply}
                onJump={jumpTo}
                onImage={onImage}
                onRetry={retryFailed}
              />
            ))}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[50vh]">
            <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={20} />
            <h3 className="text-white font-bold text-lg">{otherUser?.display_name}</h3>
            <p className="text-[#8E8C88] text-sm">No messages yet. Say hello.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[300px]">
              {['Hey!', 'Mambo!', 'Sawa!', 'How are you?'].map((g) => (
                <button key={g} onClick={() => { setMsg(g); inputRef.current?.focus(); }}
                  className="bg-white/[0.06] border border-white/10 rounded-full px-4 py-2 text-white/80 text-[13px]">{g}</button>
              ))}
            </div>
          </div>
        )}

        {isTyping && (
          <div className="flex items-end gap-2 mt-2">
            <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={7} />
            <div className="bg-[#272522] rounded-2xl rounded-bl-md px-3.5 py-3 flex gap-1">
              {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#8E8C88]" style={{ animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's' }} />)}
            </div>
          </div>
        )}
      </div>

      {/* jump buttons */}
      {(unseenBelow > 0 || detached) && (
        <button
          onClick={async () => { if (detached) await loadLatest(); nearBottom.current = true; scrollBottom(true); setUnseenBelow(0); }}
          className="absolute right-4 bg-[#FF5A1F] text-white text-[12px] font-bold rounded-full px-3.5 py-2 shadow-lg flex items-center gap-1.5 z-20"
          style={{ bottom: 92 }}>
          <ChevronDown size={14} /> {unseenBelow > 0 ? `${unseenBelow} new` : 'Latest'}
        </button>
      )}

      {/* ── composer ── */}
      <div className="flex-shrink-0 bg-[#171614] border-t border-white/10">
        {replyTo && (
          <div className="flex items-center gap-3 px-4 pt-2.5">
            <div className="w-[3px] self-stretch bg-[#FF5A1F] rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-[#FF5A1F] text-[12px] font-bold">{replyTo.sender_id === user.id ? 'You' : otherUser?.display_name}</p>
              <p className="text-[#8E8C88] text-[13px] truncate">{replyTo.message_type === 'image' ? 'Photo' : replyTo.body}</p>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1.5 text-[#8E8C88]"><X size={18} /></button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-3 px-4 pt-2.5">
            <Edit3 size={15} className="text-[#FF5A1F]" />
            <div className="flex-1 min-w-0">
              <p className="text-[#FF5A1F] text-[12px] font-bold">Editing message</p>
              <p className="text-[#8E8C88] text-[13px] truncate">{editing.body}</p>
            </div>
            <button onClick={() => { setEditing(null); setMsg(''); }} aria-label="Cancel edit" className="p-1.5 text-[#8E8C88]"><X size={18} /></button>
          </div>
        )}
        {schedSupported && scheduled.length > 0 && (
          <button onClick={() => setSchedListOpen(true)} className="mx-4 mt-2 flex items-center gap-2 text-[12px] text-[#FF9B6A] font-semibold">
            <Clock size={13} /> {scheduled.length} scheduled message{scheduled.length === 1 ? '' : 's'}
          </button>
        )}

        <div className="flex items-end gap-2 px-2.5 pt-2.5" style={{ paddingBottom: panel ? 10 : 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex-1 min-w-0 flex items-end bg-white/[0.08] border border-white/10 rounded-[28px] pl-1 pr-1 focus-within:border-[#FF5A1F]/50 transition-colors">
            <button type="button" onClick={toggleEmoji} aria-label="Emoji"
              className={'w-11 h-12 flex items-center justify-center flex-shrink-0 ' + (panel === 'emoji' ? 'text-[#FF5A1F]' : 'text-[#8E8C88]')}>
              <Smile size={24} />
            </button>
            <textarea
              ref={inputRef} value={msg} onChange={onType} rows={1} enterKeyHint="send"
              onFocus={() => { setPanel(null); setAttachOpen(false); setTimeout(() => scrollBottom(false), 250); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); handleSend(); } }}
              placeholder={editing ? 'Edit message' : 'Message'}
              className="flex-1 min-w-0 bg-transparent text-white outline-none resize-none placeholder-[#8E8C88] py-3.5 px-1"
              style={{ fontSize: 16, lineHeight: '20px', minHeight: 48, maxHeight: 140, fontFamily: 'inherit' }}
            />
            {!editing && (
              <button type="button" onClick={() => { setAttachOpen(true); inputRef.current?.blur(); }} aria-label="Attach"
                className="w-11 h-12 flex items-center justify-center flex-shrink-0 text-[#8E8C88]">
                {uploading ? <Spinner size={18} className="text-[#FF5A1F]" /> : <Paperclip size={22} />}
              </button>
            )}
            {!canSend && !editing && (
              <button type="button" onClick={() => cameraRef.current?.click()} aria-label="Camera"
                className="w-11 h-12 flex items-center justify-center flex-shrink-0 text-[#8E8C88]">
                <Camera size={22} />
              </button>
            )}
          </div>
          <button type="button" onClick={handleSend} disabled={!canSend} aria-label="Send"
            className={'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ' +
              (canSend ? 'bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] text-white shadow-lg shadow-[#FF5A1F]/30' : 'bg-white/[0.08] text-white/30')}>
            {editing ? <Check size={22} /> : <Send size={21} className="-ml-0.5" />}
          </button>
        </div>
        {msg.length > MAX_LEN - 300 && <p className={'text-right text-[11px] px-5 -mt-1 pb-1 ' + (msg.length > MAX_LEN ? 'text-red-400' : 'text-[#8E8C88]')}>{msg.length}/{MAX_LEN}</p>}

        {panel === 'emoji' && (
          <div className="border-t border-white/10 bg-[#1d1c1a]" style={{ height: 290 }}>
            <div className="flex overflow-x-auto px-2 border-b border-white/[0.06]" style={{ scrollbarWidth: 'none' }}>
              {recents.length > 0 && (
                <button onClick={() => setEmojiCat(-1)} className={'flex-shrink-0 px-3 py-2.5 ' + (emojiCat === -1 ? 'border-b-2 border-[#FF5A1F] text-white' : 'text-[#8E8C88] opacity-70')}><Clock size={20} /></button>
              )}
              {EMOJI_CATS.map((c, i) => (
                <button key={c.label} onClick={() => setEmojiCat(i)}
                  className={'flex-shrink-0 px-3 py-2 text-[20px] ' + (emojiCat === i ? 'border-b-2 border-[#FF5A1F]' : 'opacity-60')}>{c.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-0.5 p-2 overflow-y-auto" style={{ height: 238 }}>
              {emojiList.map((e) => (
                <button key={e} onMouseDown={(ev) => ev.preventDefault()} onClick={() => insertAtCaret(e)} className="text-[24px] py-1.5 rounded-lg active:bg-white/10">{e}</button>
              ))}
              {emojiCat === -1 && recents.length === 0 && <p className="col-span-8 text-center text-[#8E8C88] text-sm py-8">Emojis you use appear here</p>}
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />

      {/* ── attach sheet ── */}
      {attachOpen && (
        <Sheet onClose={() => setAttachOpen(false)}>
          <div className="grid grid-cols-4 gap-2 px-4 py-4">
            {[
              { icon: ImageIcon, label: 'Photo', color: '#FF5A1F', fn: () => fileRef.current?.click() },
              { icon: Camera, label: 'Camera', color: '#FF2D78', fn: () => cameraRef.current?.click() },
              { icon: MapPin, label: 'Location', color: '#2ECC71', fn: shareLocation },
              { icon: Zap, label: 'Quick reply', color: '#FFB020', fn: () => { setAttachOpen(false); setQuickOpen(true); } },
              ...(schedSupported ? [{ icon: CalendarClock, label: 'Schedule', color: '#FF9B6A', fn: () => { setAttachOpen(false); if (!msg.trim()) { showToast('Type your message first, then tap Schedule', 'error'); setTimeout(() => inputRef.current?.focus(), 50); } else setSchedOpen(true); } }] : []),
            ].map(({ icon: Icon, label, color, fn }) => (
              <button key={label} onClick={fn} className="flex flex-col items-center gap-2 py-3 rounded-2xl active:bg-white/[0.06]">
                <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: color + '22', border: '1px solid ' + color + '44' }}><Icon size={24} color={color} /></span>
                <span className="text-[12px] text-white/80 font-medium">{label}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* quick replies */}
      {quickOpen && (
        <Sheet onClose={() => setQuickOpen(false)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2 pb-1">Quick replies</p>
          {quickReplies.map((q, i) => (
            <div key={i} className="flex items-center">
              <button onClick={() => { setMsg((cur) => (cur ? cur + ' ' : '') + q); setQuickOpen(false); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="flex-1 text-left px-5 py-3 text-white text-[15px]">{q}</button>
              <button onClick={() => { const n = quickReplies.filter((_, k) => k !== i); setQuickReplies(n); lsSet('blink_quick_replies', n); }} aria-label="Remove" className="p-3 text-[#8E8C88]"><X size={16} /></button>
            </div>
          ))}
          <button
            onClick={() => { const t = msg.trim(); if (!t) { showToast('Type a message, then save it as a quick reply', 'error'); return; } const n = [t, ...quickReplies.filter((x) => x !== t)].slice(0, 12); setQuickReplies(n); lsSet('blink_quick_replies', n); showToast('Saved as quick reply'); }}
            className="w-full text-left px-5 py-3.5 text-[#FF5A1F] font-semibold text-[14px]">Save what I typed as a quick reply</button>
        </Sheet>
      )}

      {/* schedule */}
      {schedOpen && (
        <Sheet onClose={() => setSchedOpen(false)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2">Schedule message</p>
          <p className="text-[#8E8C88] text-[13px] px-5 mt-1 truncate">“{msg.trim()}”</p>
          <div className="grid grid-cols-3 gap-2 px-5 mt-4">
            {[
              ['In 1 hour', () => new Date(Date.now() + 3600000)],
              ['Tonight 8 PM', () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; }],
              ['Tomorrow 8 AM', () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; }],
            ].map(([label, fn]) => (
              <button key={label} onClick={() => doSchedule(fn().toISOString())} className="bg-white/[0.07] border border-white/10 rounded-xl py-3 text-[12px] text-white font-semibold">{label}</button>
            ))}
          </div>
          <div className="px-5 mt-4">
            <input type="datetime-local" value={schedTime} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              onChange={(e) => setSchedTime(e.target.value)} className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] outline-none" />
            <button onClick={() => schedTime && doSchedule(new Date(schedTime).toISOString())} disabled={!schedTime}
              className="w-full mt-3 py-3.5 rounded-xl bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold text-[15px] disabled:opacity-40">Schedule</button>
          </div>
        </Sheet>
      )}

      {schedListOpen && (
        <Sheet onClose={() => setSchedListOpen(false)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2 pb-1">Scheduled messages</p>
          {scheduled.length === 0 && <p className="text-[#8E8C88] text-sm px-5 py-6">Nothing scheduled.</p>}
          {scheduled.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-[14px] truncate">{s.body}</p>
                <p className="text-[#FF9B6A] text-[12px] mt-0.5">{fmtFull(s.send_at)}</p>
              </div>
              <button onClick={() => cancelScheduled(s.id)} className="text-red-400 text-[13px] font-semibold">Cancel</button>
            </div>
          ))}
        </Sheet>
      )}

      {/* ── header menu ── */}
      {menuOpen && (
        <Sheet onClose={() => setMenuOpen(false)}>
          <SheetRow icon={Search} label="Search" onClick={() => { setMenuOpen(false); setSearchMode(true); }} />
          <SheetRow icon={Star} label="Starred messages" onClick={openStarred} />
          <SheetRow icon={muted ? Volume2 : VolumeX} label={muted ? 'Unmute notifications' : 'Mute notifications'} onClick={toggleMute} />
          <SheetRow icon={Info} label="View profile" onClick={() => navigate('/profile/' + otherUser?.username)} />
          <SheetRow icon={Eraser} label="Remove deleted-message notices" sub="Hides 'This message was deleted' for you" onClick={removeDeletedNotices} />
          <SheetRow icon={Trash2} label="Clear chat" red onClick={() => { setMenuOpen(false); setClearOpen(true); }} />
          <SheetRow icon={Flag} label="Report" red onClick={() => { setMenuOpen(false); setReportOpen(true); }} />
          <SheetRow icon={Shield} label={'Block ' + (otherUser?.display_name || '')} red onClick={() => { setMenuOpen(false); setBlockOpen(true); }} />
        </Sheet>
      )}

      {clearOpen && (
        <Sheet onClose={() => setClearOpen(false)}>
          <div className="px-5 pt-3 pb-2 text-center">
            <p className="text-white font-bold text-base">Clear this chat?</p>
            <p className="text-[#8E8C88] text-sm mt-1">Messages are removed for you only. {otherUser?.display_name} keeps their copy.</p>
          </div>
          <div className="px-5 pt-3 space-y-2">
            <button onClick={doClear} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Clear chat</button>
            <button onClick={() => setClearOpen(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold">Cancel</button>
          </div>
        </Sheet>
      )}

      {blockOpen && (
        <Sheet onClose={() => setBlockOpen(false)}>
          <div className="px-5 pt-3 pb-2 text-center">
            <p className="text-white font-bold text-base">Block {otherUser?.display_name}?</p>
            <p className="text-[#8E8C88] text-sm mt-1">They won't be able to message you and you'll stop following each other.</p>
          </div>
          <div className="px-5 pt-3 space-y-2">
            <button onClick={doBlock} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Block</button>
            <button onClick={() => setBlockOpen(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold">Cancel</button>
          </div>
        </Sheet>
      )}

      {reportOpen && (
        <Sheet onClose={() => setReportOpen(false)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2 pb-1">Why are you reporting {otherUser?.display_name}?</p>
          {REPORT_REASONS.map((r) => <button key={r} onClick={() => doReport(r)} className="w-full text-left px-5 py-3.5 text-white text-[15px] hover:bg-white/[0.05]">{r}</button>)}
        </Sheet>
      )}

      {/* starred view */}
      {starredView && (
        <Sheet onClose={() => setStarredView(null)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2 pb-1 flex items-center gap-2"><Star size={16} className="text-yellow-300" fill="#FDE047" /> Starred messages</p>
          {starredView.length === 0 && <p className="text-[#8E8C88] text-sm px-5 py-8 text-center">Long-press a message and tap Star to keep it here.</p>}
          {starredView.map((r) => (
            <button key={r.id} onClick={() => { setStarredView(null); jumpTo(r.id, r.created_at); }} className="w-full text-left px-5 py-3 border-b border-white/[0.05]">
              <div className="flex justify-between"><span className="text-[12px] font-bold text-[#FF5A1F]">{nameOf(r.sender_id)}</span><span className="text-[11px] text-[#8E8C88]">{fmtFull(r.created_at)}</span></div>
              <p className="text-[14px] text-white/80 truncate mt-0.5">{r.message_type === 'image' ? 'Photo' : r.body}</p>
            </button>
          ))}
        </Sheet>
      )}

      {/* ── long-press actions ── */}
      {actionMsg && (() => {
        const m = actionMsg;
        const mine = m.sender_id === user.id;
        const starred = m.starred_by?.includes(user.id);
        const deleted = m.is_deleted;
        const editable = mine && !deleted && m.message_type === 'text' && Date.now() - new Date(m.created_at).getTime() < 15 * 60 * 1000;
        return (
          <Sheet onClose={() => { setActionMsg(null); setConfirmAll(false); }}>
            {!deleted && !confirmAll && (
              <div className="flex justify-around px-3 py-3 border-b border-white/[0.07]">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} onClick={() => { setActionMsg(null); react(m.id, e); }}
                    className={'text-[26px] w-10 h-10 rounded-full flex items-center justify-center active:scale-125 transition-transform ' + (m.reactions?.[user.id] === e ? 'bg-[#FF5A1F]/30' : '')}>{e}</button>
                ))}
              </div>
            )}
            {confirmAll ? (
              <div className="px-5 pt-3 pb-1 text-center">
                <p className="text-white font-bold text-base">Delete for everyone?</p>
                <p className="text-[#8E8C88] text-sm mt-1">This message will be removed for both of you.</p>
                <div className="space-y-2 mt-4">
                  <button onClick={() => delForAll(m)} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Delete for everyone</button>
                  <button onClick={() => setConfirmAll(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {!deleted && <SheetRow icon={Reply} label="Reply" onClick={() => { setActionMsg(null); onReply(m); }} />}
                {!deleted && m.body && <SheetRow icon={Copy} label="Copy" onClick={() => copyText(m)} />}
                {!deleted && !m._pending && <SheetRow icon={Forward} label="Forward" onClick={() => { setActionMsg(null); setForwardMsg(m); }} />}
                {!deleted && !m._pending && <SheetRow icon={Star} label={starred ? 'Remove star' : 'Star'} onClick={() => toggleStar(m)} />}
                {!deleted && !m._pending && <SheetRow icon={Pin} label={m.is_pinned ? 'Unpin' : 'Pin to top'} onClick={() => togglePin(m)} />}
                {editable && <SheetRow icon={Edit3} label="Edit" onClick={() => { setActionMsg(null); setEditing(m); setReplyTo(null); setMsg(m.body); setTimeout(() => inputRef.current?.focus(), 60); }} />}
                {!deleted && m.media_url && <SheetRow icon={Download} label="Save photo" onClick={() => { setActionMsg(null); window.open(m.media_url, '_blank', 'noopener'); }} />}
                {mine && !m._pending && <SheetRow icon={Info} label="Message info" onClick={() => { setActionMsg(null); setInfoMsg(m); }} />}
                <SheetRow icon={Trash2} label={deleted ? 'Remove this notice' : 'Delete for me'} onClick={() => delForMe(m)} />
                {mine && !deleted && !m._pending && <SheetRow icon={Trash2} red label="Delete for everyone" onClick={() => setConfirmAll(true)} />}
              </>
            )}
          </Sheet>
        );
      })()}

      {/* message info */}
      {infoMsg && (
        <Sheet onClose={() => setInfoMsg(null)}>
          <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2">Message info</p>
          {[['Sent', infoMsg.created_at], ['Delivered', infoMsg.delivered_at], ['Read', infoMsg.seen_at]].map(([label, t]) => (
            <div key={label} className="flex justify-between px-5 py-3 border-b border-white/[0.05]">
              <span className="text-[#8E8C88] text-[14px]">{label}</span>
              <span className="text-white text-[14px]">{fmtFull(t)}</span>
            </div>
          ))}
        </Sheet>
      )}

      {forwardMsg && <ForwardSheet message={forwardMsg} onClose={() => setForwardMsg(null)} currentChatId={id} userId={user.id} onDone={(n) => { setForwardMsg(null); showToast(`Forwarded to ${n} chat${n === 1 ? '' : 's'}`); }} onError={(t) => showToast(t, 'error')} />}
    </div>
  );
}

/* ── forward to other chats ─────────────────────────────── */
function ForwardSheet({ message, onClose, currentChatId, userId, onDone, onError }) {
  const [chats, setChats] = useState(null);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('get_my_chats').then(({ data }) => setChats((data || []).filter((c) => c.chat_id !== currentChatId)));
  }, [currentChatId]);

  const list = (chats || []).filter((c) => !q || c.other_display_name?.toLowerCase().includes(q.toLowerCase()) || c.other_username?.toLowerCase().includes(q.toLowerCase()));

  const send = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    const base = { sender_id: userId, body: message.body || '', media_url: message.media_url || null, message_type: message.message_type || 'text', delivered_at: new Date().toISOString(), deleted_for: [], starred_by: [] };
    let ok = 0;
    for (const cid of picked) {
      let { error } = await supabase.from('messages').insert({ ...base, chat_id: cid, forwarded: true });
      if (error) ({ error } = await supabase.from('messages').insert({ ...base, chat_id: cid }));
      if (!error) ok += 1;
    }
    setBusy(false);
    if (ok === 0) onError('Could not forward'); else onDone(ok);
  };

  return (
    <Sheet onClose={onClose} z={70}>
      <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2">Forward to</p>
      <div className="px-4 pb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full bg-white/[0.07] rounded-xl px-4 py-2.5 text-white text-[15px] outline-none placeholder-[#8E8C88]" />
      </div>
      {chats === null && <div className="flex justify-center py-8 text-[#FF5A1F]"><Spinner size={22} /></div>}
      {chats && list.length === 0 && <p className="text-[#8E8C88] text-sm text-center py-8">No other chats yet</p>}
      {list.map((c) => {
        const on = picked.includes(c.chat_id);
        return (
          <button key={c.chat_id} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.chat_id) : [...p, c.chat_id]))}
            className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.05]">
            <Avatar url={c.other_avatar_url} name={c.other_display_name} size={10} />
            <span className="flex-1 text-left min-w-0">
              <span className="block text-white text-[15px] font-semibold truncate">{c.other_display_name}</span>
              <span className="block text-[#8E8C88] text-[12px]">@{c.other_username}</span>
            </span>
            <span className={'w-6 h-6 rounded-full border-2 flex items-center justify-center ' + (on ? 'bg-[#FF5A1F] border-[#FF5A1F]' : 'border-white/30')}>{on && <Check size={14} className="text-white" />}</span>
          </button>
        );
      })}
      <div className="px-5 pt-3">
        <button onClick={send} disabled={picked.length === 0 || busy}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {busy ? <Spinner size={16} /> : <Send size={16} />} Send{picked.length ? ` (${picked.length})` : ''}
        </button>
      </div>
    </Sheet>
  );
}
