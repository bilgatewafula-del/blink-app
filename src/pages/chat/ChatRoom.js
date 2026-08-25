import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { sendNotification } from '../../hooks/useNotifications';
import {
  ArrowLeft, Send, ImageIcon, Smile, MoreVertical,
  Phone, Video, Check, CheckCheck, Trash2, Reply,
  X, Star, Forward, Copy, Edit3, Clock, Search,
  ChevronDown, Info, Volume2, VolumeX, Shield,
  Download, Pin, Flag
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import ImageViewer from '../../components/ImageViewer';
import { formatTime } from '../../utils/formatTime';

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

const QUICK_REACTIONS = ['❤️','😂','😮','😢','😡','👍','🔥','👏'];
const MAX_CHAT_IMAGE_MB = 10;

const MsgStatus = ({ msg, isMine }) => {
  if (!isMine) return null;
  if (msg.seen_at) return <CheckCheck size={13} style={{ color: '#1E6FFF', filter: 'drop-shadow(0 0 3px #1E6FFF)' }} />;
  if (msg.delivered_at) return <CheckCheck size={13} style={{ color: '#6B7280' }} />;
  return <Check size={13} style={{ color: '#6B7280' }} />;
};

const OnlineStatus = ({ otherUser, isTyping }) => {
  if (!otherUser) return null;
  if (isTyping) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {[0,1,2].map((i) => (
        <div key={i} style={{
          width: '4px', height: '4px', borderRadius: '50%', background: '#2ECC71',
          animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's',
        }} />
      ))}
      <span style={{ color: '#2ECC71', fontSize: '11px' }}>typing...</span>
    </div>
  );
  if (otherUser.is_online) return (
    <span style={{ color: '#2ECC71', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2ECC71', display: 'inline-block' }} />
      Online
    </span>
  );
  if (otherUser.last_seen) {
    const diff = Date.now() - new Date(otherUser.last_seen).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    let t = 'Last seen ';
    if (mins < 1) t += 'just now';
    else if (mins < 60) t += mins + 'm ago';
    else if (hours < 24) t += hours + 'h ago';
    else t += days + 'd ago';
    return <span style={{ color: '#6B7280', fontSize: '11px' }}>{t}</span>;
  }
  return <span style={{ color: '#6B7280', fontSize: '11px' }}>Offline</span>;
};

export default function ChatRoom() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const messagesEndRef = useRef();
  const inputRef = useRef();
  const fileRef = useRef();
  const typingBroadcast = useRef();
  const typingTimer = useRef();
  const mountedRef = useRef(true);

  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [msgMenu, setMsgMenu] = useState(null);
  const [quickReact, setQuickReact] = useState(null);
  const [swipeMsg, setSwipeMsg] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [chatMenu, setChatMenu] = useState(false);
  const [muted, setMuted] = useState(false);
  const [scheduler, setScheduler] = useState(false);
  const [schedTime, setSchedTime] = useState('');
  const [pinnedMsg, setPinnedMsg] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [initError, setInitError] = useState('');
  const [initLoading, setInitLoading] = useState(true);
  const [viewerImage, setViewerImage] = useState(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const swipeX = useRef(null);
  const swipeY = useRef(null);
  const scrollContainerRef = useRef();
  const wasNearBottomRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Init — was 5 fully sequential awaits (is_online update →
  // fetchChatInfo → fetchMessages → markRead → fetchPinned), plus
  // fetchChatInfo itself did 2 MORE sequential round trips inside it.
  // That's up to 6 back-to-back network calls before anything
  // rendered — on a slower connection this is exactly where a 5
  // second open time comes from. None of these four actually depend
  // on each other's results, so they now run together. The is_online
  // write is gone entirely — presence is now a global heartbeat in
  // AuthContext (being active anywhere in the app means "online", not
  // just while a specific chat happens to be open, which was its own
  // bug: closing a conversation instantly made you look offline even
  // if you were still using the app elsewhere).
  useEffect(() => {
    let cancelled = false;
    setInitLoading(true);
    setInitError('');

    (async () => {
      try {
        const [chatInfoRes] = await Promise.all([
          supabase.rpc('get_chat_info', { p_chat_id: id }),
          fetchMessages(),
          markRead(),
          fetchPinned(),
        ]);
        if (cancelled) return;

        const { data: infoRows, error: infoErr } = chatInfoRes;
        if (infoErr) throw infoErr;
        const info = infoRows?.[0];
        if (info) {
          setOtherUser({
            id: info.other_user_id, username: info.username, display_name: info.display_name,
            avatar_url: info.avatar_url, is_verified: info.is_verified,
            is_online: info.is_online, last_seen: info.last_seen, bio: info.bio,
          });
          // Was: `muted` only ever lived in local component state and
          // reset to false every time the chat was reopened — muting
          // someone did nothing beyond the current screen visit. Now
          // reflects the real persisted value from get_chat_info().
          if (mountedRef.current) setMuted(!!info.is_muted);
        }
      } catch (err) {
        if (!cancelled) setInitError(err.message || 'Could not load conversation.');
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Real-time ─────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('chat:' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'chat_id=eq.' + id },
        async (p) => {
          const { data } = await supabase.from('messages')
            .select('*, sender:sender_id(id,username,display_name,avatar_url)')
            .eq('id', p.new.id).maybeSingle();
          if (data) {
            setMessages((prev) => prev.find((m) => m.id === data.id) ? prev : [...prev, { ...data, reactions: {} }]);
            if (data.sender_id !== user.id) {
              await supabase.from('messages').update({ delivered_at: new Date().toISOString(), seen_at: new Date().toISOString() }).eq('id', data.id);
            }
          }
          scrollBot();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'chat_id=eq.' + id },
        (p) => setMessages((prev) => prev.map((m) => m.id === p.new.id ? { ...m, ...p.new } : m)))
      .subscribe();

    const tc = supabase.channel('typing:' + id)
      .on('broadcast', { event: 'typing' }, (p) => {
        if (p.payload?.uid !== user.id) {
          setIsTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsTyping(false), 3000);
        }
      }).subscribe();
    typingBroadcast.current = tc;

    return () => { supabase.removeChannel(ch); supabase.removeChannel(tc); };
  }, [id, user.id]);

  // Other user's presence — unchanged, this was already correct.
  useEffect(() => {
    if (!otherUser?.id) return;
    const ch = supabase.channel('presence:' + otherUser.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'id=eq.' + otherUser.id },
        (p) => setOtherUser((prev) => ({ ...prev, ...p.new })))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [otherUser?.id]);

  // Was: scrollBot() fired on every message change unconditionally,
  // which yanked you back to the bottom even while you'd scrolled up
  // to read older messages. Now only auto-scrolls if you were already
  // near the bottom; otherwise it leaves you where you are and shows
  // a "New messages" button instead.
  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    const onScroll = () => {
      const near = isNearBottom();
      wasNearBottomRef.current = near;
      setShowJumpToBottom(!near);
    };
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => el?.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (wasNearBottomRef.current) scrollBot();
    else setShowJumpToBottom(true);
  }, [messages, isTyping]);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchMessages = async () => {
    const { data, error } = await supabase.from('messages')
      .select('*, sender:sender_id(id,username,display_name,avatar_url)')
      .eq('chat_id', id).order('created_at', { ascending: true }).limit(200);
    if (error) throw error;

    const rows = (data || []).filter((m) => !m.deleted_for?.includes(user.id));

    // Reactions were stored correctly (message_reactions table upsert
    // in react() below) but never actually fetched back — reload the
    // chat and every reaction anyone ever added visually vanished,
    // even though the rows were still sitting in the database the
    // whole time. One extra query, batched for all messages at once.
    if (rows.length > 0) {
      const { data: reactionRows } = await supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', rows.map(m => m.id));
      const byMessage = {};
      (reactionRows || []).forEach(r => {
        byMessage[r.message_id] = byMessage[r.message_id] || {};
        byMessage[r.message_id][r.user_id] = r.emoji;
      });
      rows.forEach(m => { m.reactions = byMessage[m.id] || {}; });
    }

    if (mountedRef.current) setMessages(rows);
  };

  const fetchPinned = async () => {
    const { data } = await supabase.from('messages').select('*, sender:sender_id(id,username,display_name,avatar_url)')
      .eq('chat_id', id).eq('is_pinned', true).maybeSingle();
    if (data && mountedRef.current) setPinnedMsg(data);
  };

  const markRead = async () => {
    await supabase.from('messages').update({ seen_at: new Date().toISOString() })
      .eq('chat_id', id).neq('sender_id', user.id).is('seen_at', null);
  };

  const scrollBot = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // ── Send ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = msg.trim();
    if (!text) return;

    if (editing) {
      await supabase.from('messages').update({ body: text, edited: true, edited_at: new Date().toISOString() }).eq('id', editing.id);
      setMessages((prev) => prev.map((m) => m.id === editing.id ? { ...m, body: text, edited: true } : m));
      setEditing(null); setMsg('');
      if (inputRef.current) inputRef.current.style.height = '24px';
      return;
    }

    setSending(true);

    // Optimistic: show the bubble immediately with a pending clock
    // icon instead of waiting for the round trip — previously there
    // was a visible dead gap after hitting send on a slow connection.
    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      id: tempId, chat_id: id, sender_id: user.id, body: text,
      message_type: 'text', parent_message_id: replyTo?.id || null,
      created_at: new Date().toISOString(), delivered_at: null, seen_at: null,
      deleted_for: [], starred_by: [], reactions: {},
      sender: { id: user.id, username: profile?.username, display_name: profile?.display_name, avatar_url: profile?.avatar_url },
      _pending: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setMsg('');
    if (inputRef.current) inputRef.current.style.height = '24px';
    setShowEmoji(false);
    wasNearBottomRef.current = true;
    scrollBot();

    const { data } = await supabase.from('messages').insert({
      chat_id: id, sender_id: user.id, body: text, message_type: 'text',
      parent_message_id: replyTo?.id || null,
      delivered_at: new Date().toISOString(),
      deleted_for: [], starred_by: [],
    }).select('*, sender:sender_id(id,username,display_name,avatar_url)').single();

    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, reactions: {} } : m));
    } else {
      // Failed — remove the optimistic bubble and put the text back
      // so nothing silently vanishes.
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMsg(text);
    }
    // chats.last_message/last_message_at is now maintained by a
    // trigger (sync_chat_last_message) — the client no longer writes
    // it, which removes both an extra blocking round trip here and
    // the ability for a client to set the list preview to text that
    // doesn't match what was actually sent.
    setReplyTo(null); setSending(false); scrollBot();

    // Notification fires in the background — was awaited before
    // clearing the sending state, adding latency to when the input
    // re-enables for no benefit to the sender.
    if (data && otherUser && !muted) {
      sendNotification({ to: otherUser.id, from: user.id, type: 'message', message: 'sent you a message: "' + text.slice(0, 50) + '"', refId: id }).catch(() => {});
    }
  };

  const broadcastTyping = () => {
    typingBroadcast.current?.send({ type: 'broadcast', event: 'typing', payload: { uid: user.id } });
  };

  const handleImageSend = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > MAX_CHAT_IMAGE_MB * 1024 * 1024) {
      alert(`Image must be under ${MAX_CHAT_IMAGE_MB}MB.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'chat_media');
      const { data } = await supabase.from('messages').insert({
        chat_id: id, sender_id: user.id, body: '', media_url: url, message_type: 'image',
        delivered_at: new Date().toISOString(), deleted_for: [], starred_by: [],
      }).select('*, sender:sender_id(id,username,display_name,avatar_url)').single();
      if (data) {
        setMessages((prev) => prev.find((m) => m.id === data.id) ? prev : [...prev, { ...data, reactions: {} }]);
        if (otherUser) sendNotification({ to: otherUser.id, from: user.id, type: 'message', message: 'sent you a photo 📷', refId: id }).catch(() => {});
      }
    } catch (err) {
      alert('Image upload failed: ' + err.message);
    }
    setUploading(false); scrollBot();
  };

  // ── Message actions ───────────────────────────────────────────────
  // Was a raw array read-then-write — racy across multiple devices/
  // tabs reacting to the delete around the same time. Now atomic.
  const delForMe = async (mid) => {
    setMsgMenu(null);
    try {
      const { error } = await supabase.rpc('delete_message_for_me', { p_message_id: mid });
      if (error) throw error;
      setMessages((prev) => prev.filter((x) => x.id !== mid));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Was a raw update with no check that the caller actually sent the
  // message — any chat participant could wipe the OTHER person's
  // message content. Now server-enforced, sender-only.
  const delForAll = async (mid) => {
    setMsgMenu(null);
    try {
      const { error } = await supabase.rpc('delete_message_for_all', { p_message_id: mid });
      if (error) throw error;
      setMessages((prev) => prev.map((m) => m.id === mid ? { ...m, is_deleted: true, body: '', media_url: null } : m));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const toggleStar = async (mid) => {
    setMsgMenu(null);
    const m = messages.find((x) => x.id === mid);
    const starred = m?.starred_by?.includes(user.id);
    const ns = starred ? (m.starred_by || []).filter((u) => u !== user.id) : [...(m.starred_by || []), user.id];
    await supabase.from('messages').update({ starred_by: ns }).eq('id', mid);
    setMessages((prev) => prev.map((m) => m.id === mid ? { ...m, starred_by: ns } : m));
  };

  const pinMsg = async (mid) => {
    setMsgMenu(null);
    await supabase.from('messages').update({ is_pinned: false }).eq('chat_id', id);
    await supabase.from('messages').update({ is_pinned: true }).eq('id', mid);
    const m = messages.find((x) => x.id === mid);
    setPinnedMsg(m);
    setMessages((prev) => prev.map((m) => ({ ...m, is_pinned: m.id === mid })));
  };

  const react = async (mid, emoji) => {
    setQuickReact(null);
    const prevMessages = messages;
    const current = messages.find(m => m.id === mid)?.reactions?.[user.id];
    const isUndo = current === emoji;

    setMessages((prev) => prev.map((m) => {
      if (m.id !== mid) return m;
      const next = { ...(m.reactions || {}) };
      if (isUndo) delete next[user.id];
      else next[user.id] = emoji;
      return { ...m, reactions: next };
    }));

    try {
      if (isUndo) {
        // Was missing entirely — tapping the same emoji again just
        // re-upserted the identical value with no way to actually
        // remove a reaction once added.
        const { error } = await supabase.from('message_reactions')
          .delete().eq('message_id', mid).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_reactions').upsert(
          { message_id: mid, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' }
        );
        if (error) throw error;
      }
    } catch (err) {
      setMessages(prevMessages);
    }
  };

  // ── Swipe to reply ────────────────────────────────────────────────
  const onTS = (e, m) => { swipeX.current = e.touches[0].clientX; swipeY.current = e.touches[0].clientY; };
  const onTM = (e, m) => {
    if (!swipeX.current) return;
    const dx = e.touches[0].clientX - swipeX.current;
    const dy = Math.abs(e.touches[0].clientY - swipeY.current);
    if (dy > 20) return;
    if ((m.sender_id !== user.id && dx > 60) || (m.sender_id === user.id && dx < -60)) setSwipeMsg(m.id);
    else setSwipeMsg(null);
  };
  const onTE = (m) => {
    if (swipeMsg === m.id && !m.is_deleted) { setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 80); }
    swipeX.current = null; swipeY.current = null; setSwipeMsg(null);
  };

  // ── Grouped messages ──────────────────────────────────────────────
  const display = searchQ
    ? { Results: messages.filter((m) => m.body?.toLowerCase().includes(searchQ.toLowerCase())) }
    : starredOnly
    ? { Starred: messages.filter((m) => m.starred_by?.includes(user.id)) }
    : messages.reduce((acc, m) => {
        const d = new Date(m.created_at).toDateString();
        if (!acc[d]) acc[d] = [];
        acc[d].push(m);
        return acc;
      }, {});

  const emojis = emojiSearch
    ? EMOJI_CATS.flatMap((c) => c.emojis).filter((e) => e.includes(emojiSearch))
    : EMOJI_CATS[emojiCat]?.emojis || [];

  const dateLabel = (key) => {
    if (key === 'Results' || key === 'Starred') return key;
    const d = new Date(key);
    const t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return '📅 Today';
    if (d.toDateString() === y.toDateString()) return '📅 Yesterday';
    return d.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (initLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', background:'#0A1628' }}>
      <div style={{ width:28, height:28, border:'2px solid #1E6FFF', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  );

  if (initError) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100dvh', background:'#0A1628', gap:12, padding:24 }}>
      <p style={{ fontSize:40 }}>⚠️</p>
      <p style={{ color:'white', fontWeight:700 }}>Could not load conversation</p>
      <p style={{ color:'#6B7280', fontSize:13, textAlign:'center' }}>{initError}</p>
      <button onClick={() => navigate('/chats')} style={{ color:'#1E6FFF', fontWeight:700, background:'none', border:'none', cursor:'pointer', fontSize:14 }}>← Back to Chats</button>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: '#0A1628',
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        // Was `overflow: 'hidden'` here — the messages list already
        // has its own internal overflowY:'auto' scroll container, so
        // this wasn't needed for scroll control, but it WAS clipping
        // any popover (chat menu, message menu, quick-react picker)
        // that rendered even a few pixels past this container's own
        // edge. That's what the "narrow line, menu appears empty"
        // symptom was — the dropdown was rendering, just almost
        // entirely cut off by this.
      }}
      onClick={() => { setMsgMenu(null); setQuickReact(null); setChatMenu(false); }}
    >

      {/* ── TOP BAR ── */}
      <div style={{
        flexShrink: 0,
        background: '#0d1f3c',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {searchMode ? (
          <>
            <button onClick={() => { setSearchMode(false); setSearchQ(''); }} aria-label="Close search" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <ArrowLeft size={22} />
            </button>
            <input
              type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search messages..." autoFocus
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px' }}
            />
            {searchQ && <button onClick={() => setSearchQ('')} aria-label="Clear search" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>}
          </>
        ) : (
          <>
            <button onClick={() => navigate('/chats')} aria-label="Back to chats" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
              <ArrowLeft size={22} />
            </button>
            <button onClick={() => navigate('/profile/' + otherUser?.username)} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={10} />
                {otherUser?.is_online && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: '#2ECC71', border: '2px solid #0d1f3c' }} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otherUser?.display_name}</p>
                  {otherUser?.is_verified && <span style={{ background: '#1E6FFF', color: 'white', fontSize: '8px', padding: '1px 4px', borderRadius: '99px', fontWeight: 700, flexShrink: 0 }}>✓</span>}
                </div>
                <OnlineStatus otherUser={otherUser} isTyping={isTyping} />
              </div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
              <button aria-label="Voice call" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}><Phone size={19} /></button>
              <button aria-label="Video call" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}><Video size={19} /></button>
              <button onClick={() => setSearchMode(true)} aria-label="Search messages" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}><Search size={19} /></button>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setChatMenu(!chatMenu); }}
                  aria-label="Chat options"
                  style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
                >
                  <MoreVertical size={19} />
                </button>
                {chatMenu && (
                  <div
                    style={{ position: 'absolute', right: 0, top: '36px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', width: '220px', zIndex: 50, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[
                      { icon: Star, label: 'Starred messages', action: () => { setStarredOnly(true); setChatMenu(false); } },
                      {
                        icon: Pin, label: pinnedMsg ? 'View pinned message' : 'No pinned message',
                        action: () => {
                          setChatMenu(false);
                          // Was a no-op — tapping this did nothing at
                          // all. Now scrolls to and briefly highlights
                          // the actual pinned message, or does nothing
                          // if there isn't one (button still shows so
                          // the option is discoverable either way).
                          if (!pinnedMsg) return;
                          const el = document.getElementById('msg-' + pinnedMsg.id);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          if (el) {
                            el.style.outline = '2px solid #1E6FFF';
                            setTimeout(() => { el.style.outline = 'none'; }, 1500);
                          }
                        },
                      },
                      {
                        icon: muted ? Volume2 : VolumeX, label: muted ? 'Unmute' : 'Mute',
                        action: async () => {
                          setChatMenu(false);
                          const prev = muted;
                          setMuted(!muted); // optimistic
                          try {
                            const { data, error } = await supabase.rpc('toggle_chat_mute', { p_chat_id: id });
                            if (error) throw error;
                            setMuted(!!data);
                          } catch (err) {
                            setMuted(prev); // rollback — was previously local-only state with nothing to fail
                          }
                        },
                      },
                      { icon: Info, label: 'Contact info', action: () => { navigate('/profile/' + otherUser?.username); setChatMenu(false); } },
                      {
                        icon: Flag, label: 'Report user', red: true,
                        action: () => { setChatMenu(false); setShowReportModal(true); },
                      },
                      {
                        // Was a no-op (`action: () => setChatMenu(false)`)
                        // — Block did literally nothing before. Now
                        // calls the real block_user() RPC, which
                        // removes the follow relationship both ways
                        // AND (per 42_fix_chat_start_and_features.sql)
                        // prevents them from messaging you again —
                        // security enforced server-side via RLS, not
                        // just hidden in the UI.
                        icon: Shield, label: 'Block ' + (otherUser?.display_name || 'contact'), red: true,
                        action: async () => {
                          setChatMenu(false);
                          if (!otherUser?.id) return;
                          if (!window.confirm(`Block ${otherUser.display_name}? They won't be able to message you, and you'll stop following each other. You can unblock later from Settings.`)) return;
                          try {
                            const { error } = await supabase.rpc('block_user', { p_target_id: otherUser.id });
                            if (error) throw error;
                            navigate('/chats');
                          } catch (err) {
                            alert('Could not block user: ' + err.message);
                          }
                        },
                      },
                      {
                        icon: Trash2, label: 'Clear chat', red: true,
                        action: async () => {
                          setChatMenu(false);
                          if (!window.confirm('Clear all messages? This only removes them for you.')) return;
                          try {
                            // Was a client-side loop calling
                            // delete_message_for_me once per message —
                            // N round trips for N messages. One call.
                            const { error } = await supabase.rpc('clear_chat_for_me', { p_chat_id: id });
                            if (error) throw error;
                            setMessages([]);
                          } catch (err) {
                            alert('Could not clear chat: ' + err.message);
                          }
                        },
                      },
                    ].map((item) => (
                      <button key={item.label} onClick={item.action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', color: item.red ? '#EF4444' : 'rgba(255,255,255,0.8)', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                        <item.icon size={15} style={{ color: item.red ? '#EF4444' : '#6B7280', flexShrink: 0 }} />{item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pinned */}
      {pinnedMsg && (
        <div style={{ flexShrink: 0, background: 'rgba(30,111,255,0.1)', borderBottom: '1px solid rgba(30,111,255,0.2)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Pin size={14} style={{ color: '#1E6FFF', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#1E6FFF', fontSize: '10px', fontWeight: 700 }}>Pinned</p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinnedMsg.body || '📷 Photo'}</p>
          </div>
          <button onClick={() => setPinnedMsg(null)} aria-label="Dismiss pinned" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {/* Starred */}
      {starredOnly && (
        <div style={{ flexShrink: 0, background: 'rgba(255,215,0,0.1)', borderBottom: '1px solid rgba(255,215,0,0.2)', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Star size={14} style={{ color: '#FFD700', fill: '#FFD700' }} />
            <span style={{ color: '#FFD700', fontSize: '12px', fontWeight: 600 }}>Starred messages</span>
          </div>
          <button onClick={() => setStarredOnly(false)} aria-label="Exit starred view" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {/* ── MESSAGES ── */}
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '12px', overscrollBehavior: 'contain' }}
        onClick={() => { setMsgMenu(null); setQuickReact(null); setChatMenu(false); setShowEmoji(false); }}
      >
        {Object.entries(display).map(([key, msgs]) => (
          <div key={key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px 0' }}>
              <span style={{ color: '#6B7280', fontSize: '11px', background: 'rgba(17,24,39,0.8)', padding: '4px 12px', borderRadius: '99px' }}>{dateLabel(key)}</span>
            </div>
            {msgs.map((m, idx) => {
              const isMine = m.sender_id === user.id;
              const isFirst = idx === 0 || msgs[idx-1]?.sender_id !== m.sender_id;
              const isLast = idx === msgs.length-1 || msgs[idx+1]?.sender_id !== m.sender_id;
              const isDeleted = m.is_deleted;
              const isSwiping = swipeMsg === m.id;
              const isStarred = m.starred_by?.includes(user.id);
              const reactionCounts = Object.values(m.reactions || {}).reduce((a, e) => { a[e] = (a[e]||0)+1; return a; }, {});

              return (
                <div
                  key={m.id}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '2px', flexDirection: isMine ? 'row-reverse' : 'row' }}
                  onTouchStart={(e) => onTS(e, m)}
                  onTouchMove={(e) => onTM(e, m)}
                  onTouchEnd={() => onTE(m)}
                >
                  {!isMine && (
                    <div style={{ width: '28px', flexShrink: 0, marginBottom: '4px' }}>
                      {isLast && <Avatar url={m.sender?.avatar_url} name={m.sender?.display_name} size={7} />}
                    </div>
                  )}

                  {isSwiping && !isDeleted && (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(30,111,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Reply size={13} style={{ color: '#1E6FFF' }} />
                    </div>
                  )}

                  <div
                    className="group"
                    id={'msg-' + m.id}
                    style={{
                      maxWidth: '78%', position: 'relative',
                      transform: isSwiping ? (isMine ? 'translateX(-32px)' : 'translateX(32px)') : 'none',
                      transition: 'transform 0.15s',
                    }}
                  >
                    {!isMine && isFirst && (
                      <p style={{ color: '#1E6FFF', fontSize: '11px', fontWeight: 700, marginBottom: '3px', paddingLeft: '4px' }}>{m.sender?.display_name}</p>
                    )}

                    {m.parent_message_id && (
                      <div style={{ fontSize: '11px', marginBottom: '4px', padding: '6px 10px', borderRadius: '10px', borderLeft: '2px solid #1E6FFF', background: isMine ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)' }}>
                        <p style={{ color: '#1E6FFF', fontSize: '10px', fontWeight: 700, marginBottom: '2px' }}>↩ Reply</p>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Original message</p>
                      </div>
                    )}

                    <div
                      style={{
                        padding: '9px 13px',
                        borderRadius: isFirst && isLast ? '16px' : isMine ? (isFirst ? '16px 4px 16px 16px' : isLast ? '16px 16px 4px 16px' : '16px 4px 4px 16px') : (isFirst ? '4px 16px 16px 16px' : isLast ? '16px 16px 16px 4px' : '4px 16px 16px 4px'),
                        background: isMine ? 'linear-gradient(135deg, #1E6FFF, #7B2FFF)' : '#1a2a4a',
                        opacity: isDeleted ? 0.6 : 1,
                        position: 'relative',
                      }}
                      onDoubleClick={() => !isDeleted && setQuickReact(m.id)}
                    >
                      {m.forwarded && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', opacity: 0.6, fontSize: '10px', color: 'white' }}><Forward size={10} /> Forwarded</div>}
                      <div style={{ position: 'absolute', top: '4px', right: '6px', display: 'flex', gap: '2px' }}>
                        {isStarred && <Star size={9} style={{ color: '#FFD700', fill: '#FFD700' }} />}
                      </div>

                      {isDeleted ? (
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontStyle: 'italic' }}>🚫 This message was deleted</p>
                      ) : m.message_type === 'image' && m.media_url ? (
                        <img
                          src={m.media_url} alt=""
                          onClick={(e) => { e.stopPropagation(); setViewerImage(m.media_url); }}
                          style={{ maxWidth: '240px', borderRadius: '10px', display: 'block', cursor: 'pointer' }}
                          loading="lazy"
                        />
                      ) : (
                        <p style={{ color: 'white', fontSize: '14px', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '3px' }}>
                        {m.edited && !isDeleted && <span style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#6B7280', fontSize: '10px' }}>edited</span>}
                        <span style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#6B7280', fontSize: '10px' }}>{formatTime(m.created_at)}</span>
                        {m._pending
                          ? <Clock size={11} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          : <MsgStatus msg={m} isMine={isMine} />
                        }
                      </div>

                      {Object.keys(reactionCounts).length > 0 && (
                        <div style={{ position: 'absolute', bottom: '-10px', [isMine ? 'left' : 'right']: '4px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px', padding: '1px 6px', display: 'flex', gap: '2px', fontSize: '11px' }}>
                          {Object.entries(reactionCounts).map(([e,c]) => <span key={e}>{e}{c>1?c:''}</span>)}
                        </div>
                      )}
                    </div>

                    {quickReact === m.id && (
                      <div style={{ position: 'absolute', bottom: '100%', [isMine?'right':'left']: 0, marginBottom: '6px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px', padding: '6px', display: 'flex', gap: '2px', zIndex: 40, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        {QUICK_REACTIONS.map(e => (
                          <button key={e} onClick={() => react(m.id, e)}
                            style={{ fontSize: '18px', background: m.reactions?.[user.id] === e ? 'rgba(30,111,255,0.3)' : 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%' }}>{e}</button>
                        ))}
                      </div>
                    )}

                    {!isDeleted && (
                      <div
                        className="group-hover-actions"
                        style={{
                          position: 'absolute', top: 0, opacity: 0,
                          [isMine ? 'right' : 'left']: '100%',
                          display: 'flex',
                          flexDirection: isMine ? 'row-reverse' : 'row',
                          gap: '4px', alignItems: 'center',
                        }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 80); }}
                          aria-label="Reply"
                          style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        ><Reply size={12} style={{ color: 'rgba(255,255,255,0.7)' }} /></button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMsgMenu(msgMenu === m.id ? null : m.id); }}
                          aria-label="More options"
                          style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        ><ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.7)' }} /></button>
                      </div>
                    )}

                    {msgMenu === m.id && (
                      <div
                        style={{
                          position: 'absolute', top: '32px',
                          [isMine ? 'right' : 'left']: 0, zIndex: 40,
                          background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '16px', width: '200px',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.6)', overflow: 'hidden',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[
                          ...((!isDeleted && m.body) ? [{ icon: Copy, label: 'Copy text', action: () => { navigator.clipboard.writeText(m.body); setMsgMenu(null); } }] : []),
                          ...(!isDeleted ? [{ icon: () => <span style={{fontSize:'14px'}}>😊</span>, label: 'React', action: () => { setQuickReact(m.id); setMsgMenu(null); } }] : []),
                          { icon: Reply, label: 'Reply', action: () => { setReplyTo(m); setMsgMenu(null); setTimeout(() => inputRef.current?.focus(), 80); } },
                          ...(!isDeleted ? [{ icon: Forward, label: 'Forward', action: () => { navigator.clipboard.writeText(m.body || '📷 Photo'); setMsgMenu(null); alert('Copied — paste in another chat'); } }] : []),
                          { icon: Star, label: isStarred ? 'Unstar' : 'Star', action: () => toggleStar(m.id) },
                          { icon: Pin, label: m.is_pinned ? 'Unpin' : 'Pin', action: () => pinMsg(m.id) },
                          ...(isMine && !isDeleted && m.message_type === 'text' ? [{ icon: Edit3, label: 'Edit', action: () => { setEditing(m); setMsg(m.body); setMsgMenu(null); setTimeout(() => inputRef.current?.focus(), 80); } }] : []),
                          ...(!isDeleted && m.media_url ? [{ icon: Download, label: 'Download', action: () => { window.open(m.media_url, '_blank'); setMsgMenu(null); } }] : []),
                          { icon: Trash2, label: 'Delete for me', action: () => delForMe(m.id), red: false },
                          ...(isMine && !isDeleted ? [{ icon: Trash2, label: 'Delete for everyone', action: () => delForAll(m.id), red: true }] : []),
                        ].map((item) => (
                          <button key={item.label} onClick={item.action}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px', color: item.red ? '#EF4444' : 'rgba(255,255,255,0.8)', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                            <item.icon size={14} style={{ color: item.red ? '#EF4444' : '#6B7280', flexShrink: 0 }} />{item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {messages.length === 0 && !searchQ && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={20} />
              {otherUser?.is_online && <div style={{ position: 'absolute', bottom: '2px', right: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#2ECC71', border: '2px solid #0A1628' }} />}
            </div>
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '18px' }}>{otherUser?.display_name}</h3>
            <p style={{ color: '#6B7280', fontSize: '14px', textAlign: 'center' }}>Say hello to {otherUser?.display_name?.split(' ')[0]}! 👋</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '280px' }}>
              {['👋 Hey!', '😊 Hi there!', '🔥 What\'s good?', '🇰🇪 Mambo!', '✨ Sawa!'].map((g) => (
                <button key={g} onClick={() => { setMsg(g); setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px', padding: '8px 16px', color: 'rgba(255,255,255,0.8)', fontSize: '13px', cursor: 'pointer' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={7} />
            <div style={{ background: '#1a2a4a', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              {[0,1,2].map((i) => (
                <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6B7280', animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's' }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} style={{ height: '8px' }} />

        {showJumpToBottom && (
          <button
            onClick={(e) => { e.stopPropagation(); wasNearBottomRef.current = true; scrollBot(); setShowJumpToBottom(false); }}
            aria-label="Jump to latest messages"
            style={{
              position: 'sticky', bottom: 8, left: '50%', transform: 'translateX(-50%)',
              background: '#1E6FFF', color: 'white', border: 'none', borderRadius: 999,
              padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(30,111,255,0.4)', display: 'flex',
              alignItems: 'center', gap: 6, zIndex: 10,
            }}
          >
            <ChevronDown size={14} /> New messages
          </button>
        )}
      </div>

      {showEmoji && (
        <div style={{ flexShrink: 0, background: '#111827', borderTop: '1px solid rgba(255,255,255,0.1)', maxHeight: '220px' }}>
          <div style={{ padding: '8px 12px 4px' }}>
            <input type="text" value={emojiSearch} onChange={(e) => setEmojiSearch(e.target.value)} placeholder="Search emoji..."
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 12px', color: 'white', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {!emojiSearch && (
            <div style={{ display: 'flex', overflowX: 'auto', padding: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', scrollbarWidth: 'none' }}>
              {EMOJI_CATS.map((c, i) => (
                <button key={c.label} onClick={() => setEmojiCat(i)}
                  style={{ flexShrink: 0, padding: '6px 8px', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: emojiCat === i ? '2px solid #1E6FFF' : '2px solid transparent', opacity: emojiCat === i ? 1 : 0.6 }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '2px', padding: '8px', overflowY: 'auto', maxHeight: '130px', scrollbarWidth: 'none' }}>
            {emojis.map((e) => (
              <button key={e}
                onMouseDown={(ev) => { ev.preventDefault(); setMsg((m) => m + e); }}
                style={{ fontSize: '22px', padding: '4px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {replyTo && (
        <div style={{ flexShrink: 0, background: '#111827', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '2px', height: '36px', background: '#1E6FFF', borderRadius: '2px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#1E6FFF', fontSize: '11px', fontWeight: 700 }}>{replyTo.sender_id === user.id ? 'You' : replyTo.sender?.display_name}</p>
            <p style={{ color: '#6B7280', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.message_type === 'image' ? '📷 Photo' : replyTo.body}</p>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {editing && (
        <div style={{ flexShrink: 0, background: 'rgba(30,111,255,0.1)', borderTop: '1px solid rgba(30,111,255,0.2)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Edit3 size={14} style={{ color: '#1E6FFF', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#1E6FFF', fontSize: '11px', fontWeight: 700 }}>Editing message</p>
            <p style={{ color: '#6B7280', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing.body}</p>
          </div>
          <button onClick={() => { setEditing(null); setMsg(''); if (inputRef.current) inputRef.current.style.height = '24px'; }} aria-label="Cancel edit" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {scheduler && (
        <div style={{ flexShrink: 0, background: 'rgba(123,47,255,0.1)', borderTop: '1px solid rgba(123,47,255,0.2)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={14} style={{ color: '#7B2FFF', flexShrink: 0 }} />
          <input type="datetime-local" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '12px' }} />
          <button onClick={() => { setScheduler(false); setSchedTime(''); }} aria-label="Cancel schedule" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      <div style={{
        flexShrink: 0,
        background: '#0d1f3c',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingLeft: '12px',
        paddingRight: '12px',
        paddingTop: '10px',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', width: '100%' }}>

          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowEmoji((v) => !v); }}
            aria-label="Emoji picker"
            style={{
              width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
              background: showEmoji ? 'rgba(30,111,255,0.2)' : 'transparent',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: showEmoji ? '#1E6FFF' : '#6B7280',
            }}
          >
            <Smile size={22} />
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Send image"
            style={{
              width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6B7280',
            }}
          >
            {uploading
              ? <div style={{ width: '16px', height: '16px', border: '2px solid #1E6FFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <ImageIcon size={22} />
            }
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSend} />

          <div style={{
            flex: 1, minWidth: 0,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '22px',
            padding: '10px 14px',
            display: 'flex', alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                broadcastTyping();
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              onFocus={() => { setShowEmoji(false); setTimeout(scrollBot, 350); }}
              placeholder={editing ? 'Edit message...' : 'Message...'}
              rows={1}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.5',
                resize: 'none',
                minHeight: '22px',
                maxHeight: '120px',
                overflowY: 'auto',
                fontFamily: 'inherit',
                display: 'block',
                padding: 0,
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setScheduler(!scheduler)}
            aria-label="Schedule message"
            style={{
              width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
              background: scheduler ? 'rgba(123,47,255,0.2)' : 'transparent',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: scheduler ? '#7B2FFF' : '#6B7280',
            }}
          >
            <Clock size={20} />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !msg.trim()}
            aria-label="Send message"
            style={{
              width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
              background: (sending || !msg.trim()) ? 'rgba(30,111,255,0.4)' : 'linear-gradient(135deg, #1E6FFF, #7B2FFF)',
              border: 'none', cursor: (sending || !msg.trim()) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(30,111,255,0.4)',
            }}
          >
            {sending
              ? <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <Send size={17} style={{ color: 'white', marginLeft: '2px' }} />
            }
          </button>
        </div>
      </div>

      {viewerImage && (
        <ImageViewer images={[viewerImage]} index={0} onClose={() => setViewerImage(null)} />
      )}

      {showReportModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => { setShowReportModal(false); setReportDone(false); setReportReason(''); setReportDetails(''); }}
        >
          <div style={{ width: '100%', maxWidth: 620, background: '#0d1f3c', borderTop: '1px solid rgba(255,255,255,0.1)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Report {otherUser?.display_name}</h3>
              <button onClick={() => { setShowReportModal(false); setReportDone(false); }} aria-label="Close" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {reportDone ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
                <p style={{ color: 'white', fontWeight: 700 }}>Report submitted</p>
                <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>Our team will review this.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {['Spam or scam', 'Harassment or bullying', 'Inappropriate content', 'Pretending to be someone else', 'Other'].map(r => (
                    <button key={r} onClick={() => setReportReason(r)}
                      style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 12, fontSize: 14, border: '1px solid ' + (reportReason === r ? 'rgba(30,111,255,0.5)' : 'rgba(255,255,255,0.06)'), background: reportReason === r ? 'rgba(30,111,255,0.15)' : 'rgba(255,255,255,0.03)', color: reportReason === r ? 'white' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                      {r}
                    </button>
                  ))}
                </div>
                {reportReason && (
                  <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)}
                    placeholder="Additional details (optional)..." rows={3}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', color: 'white', fontSize: 14, outline: 'none', resize: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
                )}
                <button
                  onClick={async () => {
                    if (!reportReason || !otherUser?.id) return;
                    setReportSending(true);
                    try {
                      const { error } = await supabase.rpc('report_user', {
                        p_target_id: otherUser.id, p_reason: reportReason, p_details: reportDetails.trim() || null,
                      });
                      if (error) throw error;
                      setReportDone(true);
                    } catch (err) {
                      alert('Could not submit report: ' + err.message);
                    }
                    setReportSending(false);
                  }}
                  disabled={!reportReason || reportSending}
                  style={{ width: '100%', padding: '14px', borderRadius: 16, fontWeight: 700, fontSize: 14, color: 'white', background: '#EF4444', border: 'none', cursor: 'pointer', opacity: (!reportReason || reportSending) ? 0.5 : 1 }}
                >
                  {reportSending ? 'Submitting...' : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}