import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { sendNotification } from '../../hooks/useNotifications';
import {
  ArrowLeft, Send, Image, Smile, MoreVertical,
  Phone, Video, Check, CheckCheck, Trash2, Reply,
  X, Star, Forward, Copy, Edit3, Clock, Search,
  ChevronDown, Info, Volume2, VolumeX, Shield,
  Mic, MicOff, Download, Pin, Eye
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';

const EMOJI_CATEGORIES = [
  {
    label: '😀', emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘',
      '😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐',
      '😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
      '🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮',
      '😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓',
      '😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺',
    ]
  },
  {
    label: '👋', emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪',
      '🦾','✍️','💅','🤳','🦵','🦶','👂','🦻','👃','👀','👁️','👅','🦷','🦴',
    ]
  },
  {
    label: '❤️', emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','♥️','💌','💋','💯','💢','💥','💫','💦','💨','💬','💭','💤',
    ]
  },
  {
    label: '🎉', emojis: [
      '🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','🏅','🎵','🎶','🎼','🎤',
      '🎧','🎷','🎸','🎹','🎺','🎻','🥁','🎮','🎲','🎯','🎳','🎪','🎭','🎨','🎬',
    ]
  },
  {
    label: '🍕', emojis: [
      '🍕','🍔','🍟','🌭','🌮','🌯','🥙','🍳','🥘','🍲','🍜','🍝','🍣','🍱','🍛','🍚',
      '🍙','🍘','🍥','🧁','🎂','🍰','🍩','🍪','🍫','🍬','🍭','🍮','🍯','☕',
      '🧋','🍵','🧃','🥤','🍺','🍻','🥂','🍷','🧊',
    ]
  },
  {
    label: '🐶', emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
      '🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐜',
    ]
  },
  {
    label: '🌍', emojis: [
      '🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🏕️','🏖️','🏜️','🏝️','🏟️','🏛️',
      '🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏰','🗼','🗽','⛪','🕌','🌁','🌃','🏙️',
    ]
  },
  {
    label: '🇰🇪', emojis: [
      '🇰🇪','🇳🇬','🇬🇭','🇿🇦','🇹🇿','🇺🇬','🇪🇹','🇷🇼','🇬🇧','🇺🇸','🇨🇦','🇦🇺','🇮🇳',
      '🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇧🇷','🇲🇽','🇦🇷','🇨🇴','🇪🇬','🇲🇦','🇸🇳','🇨🇲','🇦🇴',
    ]
  },
];

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '👏'];

// Message status component with real colors
const MessageStatus = ({ msg, isMine }) => {
  if (!isMine) return null;
  if (msg.seen_at) {
    return (
      <span title={'Seen ' + formatTime(msg.seen_at)}>
        <CheckCheck size={14} className="text-[#1E6FFF]" style={{ filter: 'drop-shadow(0 0 3px #1E6FFF)' }} />
      </span>
    );
  }
  if (msg.delivered_at) {
    return (
      <span title="Delivered">
        <CheckCheck size={14} className="text-[#6B7280]" />
      </span>
    );
  }
  return (
    <span title="Sent">
      <Check size={14} className="text-[#6B7280]" />
    </span>
  );
};

// Online status component
const OnlineStatus = ({ user: otherUser, isTyping }) => {
  if (!otherUser) return null;
  if (isTyping) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex gap-0.5">
          {[0,1,2].map((i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-[#2ECC71]"
              style={{ animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's' }} />
          ))}
        </div>
        <span className="text-[#2ECC71] text-xs">typing...</span>
      </div>
    );
  }
  if (otherUser.is_online) {
    return <p className="text-[#2ECC71] text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#2ECC71] inline-block" />Online</p>;
  }
  if (otherUser.last_seen) {
    const diff = Date.now() - new Date(otherUser.last_seen).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    let lastSeenText = '';
    if (mins < 1) lastSeenText = 'Last seen just now';
    else if (mins < 60) lastSeenText = 'Last seen ' + mins + 'm ago';
    else if (hours < 24) lastSeenText = 'Last seen ' + hours + 'h ago';
    else lastSeenText = 'Last seen ' + days + 'd ago';
    return <p className="text-[#6B7280] text-xs">{lastSeenText}</p>;
  }
  return <p className="text-[#6B7280] text-xs">Offline</p>;
};

const ChatRoom = () => {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const fileInputRef = useRef();
  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);
  const presenceChannel = useRef(null);
  const typingChannel = useRef(null);
  const typingTimer = useRef();

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategoryIdx, setEmojiCategoryIdx] = useState(0);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [showMsgMenu, setShowMsgMenu] = useState(null);
  const [showQuickReact, setShowQuickReact] = useState(null);
  const [swipingMsg, setSwipingMsg] = useState(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [pinnedMsg, setPinnedMsg] = useState(null);
  const [showPinnedMsg, setShowPinnedMsg] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wallpaper, setWallpaper] = useState(null);

  useEffect(() => {
    fetchChatInfo();
    fetchMessages();
    markMessagesRead();
    updateOnlineStatus(true);
    fetchPinnedMessage();

    return () => {
      updateOnlineStatus(false);
      if (presenceChannel.current) supabase.removeChannel(presenceChannel.current);
      if (typingChannel.current) supabase.removeChannel(typingChannel.current);
    };
  }, [id]);

  // Real-time message subscription
  useEffect(() => {
    const channel = supabase
      .channel('room:' + id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: 'chat_id=eq.' + id,
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select('*, sender:sender_id(id, username, display_name, avatar_url)')
          .eq('id', payload.new.id).maybeSingle();
        if (data) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === data.id)) return prev;
            return [...prev, data];
          });
          // Mark as delivered immediately
          if (data.sender_id !== user.id) {
            await supabase.from('messages')
              .update({ delivered_at: new Date().toISOString() })
              .eq('id', data.id)
              .is('delivered_at', null);
            // Mark as seen if chat is open
            await supabase.from('messages')
              .update({ seen_at: new Date().toISOString() })
              .eq('id', data.id);
          }
        }
        scrollToBottom();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: 'chat_id=eq.' + id,
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m)
        );
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, user.id]);

  // Presence — track other user online status
  useEffect(() => {
    if (!otherUser) return;
    const channel = supabase
      .channel('presence:' + otherUser.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users',
        filter: 'id=eq.' + otherUser.id,
      }, (payload) => {
        setOtherUser((prev) => ({ ...prev, ...payload.new }));
      })
      .subscribe();
    presenceChannel.current = channel;
    return () => supabase.removeChannel(channel);
  }, [otherUser?.id]);

  // Typing indicator via Supabase broadcast
  useEffect(() => {
    const channel = supabase.channel('typing:' + id)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.user_id !== user.id) {
          setIsOtherTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setIsOtherTyping(false), 3000);
        }
      })
      .subscribe();
    typingChannel.current = channel;
    return () => supabase.removeChannel(channel);
  }, [id, user.id]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const updateOnlineStatus = async (online) => {
    await supabase.from('users').update({
      is_online: online,
      last_seen: new Date().toISOString(),
    }).eq('id', user.id);
  };

  const fetchChatInfo = async () => {
    const { data: chat } = await supabase
      .from('chats').select('*').eq('id', id).maybeSingle();
    if (chat) {
      const otherId = chat.participants.find((pid) => pid !== user.id);
      if (otherId) {
        const { data } = await supabase
          .from('users').select('*').eq('id', otherId).maybeSingle();
        setOtherUser(data);
      }
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, display_name, avatar_url)')
      .eq('chat_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    const filtered = (data || []).filter((m) => {
      if (!m.deleted_for) return true;
      return !m.deleted_for.includes(user.id);
    });
    setMessages(filtered);
    const unread = filtered.filter((m) => m.sender_id !== user.id && !m.seen_at).length;
    setUnreadCount(unread);
  };

  const fetchPinnedMessage = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, display_name, avatar_url)')
      .eq('chat_id', id)
      .eq('is_pinned', true)
      .maybeSingle();
    if (data) setPinnedMsg(data);
  };

  const markMessagesRead = async () => {
    await supabase.from('messages')
      .update({ seen_at: new Date().toISOString() })
      .eq('chat_id', id)
      .neq('sender_id', user.id)
      .is('seen_at', null);
    setUnreadCount(0);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    if (editingMsg) {
      await supabase.from('messages')
        .update({ body: text, edited: true, edited_at: new Date().toISOString() })
        .eq('id', editingMsg.id);
      setMessages((prev) =>
        prev.map((m) => m.id === editingMsg.id ? { ...m, body: text, edited: true } : m)
      );
      setEditingMsg(null);
      setMessage('');
      return;
    }

    setSending(true);
    setMessage('');
    setShowEmoji(false);
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = '22px';
    }

    if (scheduledTime) {
      alert('Message scheduled for ' + new Date(scheduledTime).toLocaleString('en-KE'));
      setScheduledTime('');
      setShowScheduler(false);
      setSending(false);
      setReplyTo(null);
      return;
    }

    const { data } = await supabase
      .from('messages')
      .insert({
        chat_id: id,
        sender_id: user.id,
        body: text,
        message_type: 'text',
        parent_message_id: replyTo?.id || null,
        delivered_at: new Date().toISOString(),
        forwarded: false,
        deleted_for: [],
        starred_by: [],
      })
      .select('*, sender:sender_id(id, username, display_name, avatar_url)')
      .single();

    if (data) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      await supabase.from('chats').update({
        last_message: text,
        last_message_at: new Date().toISOString(),
      }).eq('id', id);

      if (otherUser && !isMuted) {
        await sendNotification({
          to: otherUser.id, from: user.id,
          type: 'message',
          message: 'sent you a message: "' + text.slice(0, 50) + '"',
          refId: id,
        });
      }
    }

    setReplyTo(null);
    setSending(false);
    scrollToBottom();
  };

  const handleTypingBroadcast = () => {
    if (typingChannel.current) {
      typingChannel.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id },
      });
    }
  };

  const handleImageSend = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToCloudinary(file, 'chat_media');
    const { data } = await supabase
      .from('messages')
      .insert({
        chat_id: id, sender_id: user.id,
        body: '', media_url: url, message_type: 'image',
        delivered_at: new Date().toISOString(),
        deleted_for: [], starred_by: [],
      })
      .select('*, sender:sender_id(id, username, display_name, avatar_url)')
      .single();
    if (data) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      await supabase.from('chats').update({
        last_message: '📷 Photo',
        last_message_at: new Date().toISOString(),
      }).eq('id', id);
      if (otherUser) {
        await sendNotification({
          to: otherUser.id, from: user.id,
          type: 'message', message: 'sent you a photo 📷', refId: id,
        });
      }
    }
    setUploading(false);
    scrollToBottom();
  };

  const handleDeleteForMe = async (msgId) => {
    setShowMsgMenu(null);
    const msg = messages.find((m) => m.id === msgId);
    const newDeleted = [...(msg?.deleted_for || []), user.id];
    await supabase.from('messages')
      .update({ deleted_for: newDeleted })
      .eq('id', msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  const handleDeleteForEveryone = async (msgId) => {
    setShowMsgMenu(null);
    await supabase.from('messages')
      .update({ is_deleted: true, body: '', media_url: null, deleted_for: [] })
      .eq('id', msgId);
    setMessages((prev) =>
      prev.map((m) => m.id === msgId ? { ...m, is_deleted: true, body: '', media_url: null } : m)
    );
  };

  const handleStar = async (msgId) => {
    setShowMsgMenu(null);
    const msg = messages.find((m) => m.id === msgId);
    const isStarred = msg?.starred_by?.includes(user.id);
    const newStarred = isStarred
      ? (msg.starred_by || []).filter((uid) => uid !== user.id)
      : [...(msg.starred_by || []), user.id];
    await supabase.from('messages').update({ starred_by: newStarred }).eq('id', msgId);
    setMessages((prev) =>
      prev.map((m) => m.id === msgId ? { ...m, starred_by: newStarred } : m)
    );
  };

  const handlePin = async (msgId) => {
    setShowMsgMenu(null);
    // Unpin previous
    await supabase.from('messages')
      .update({ is_pinned: false })
      .eq('chat_id', id)
      .eq('is_pinned', true);
    // Pin new
    await supabase.from('messages')
      .update({ is_pinned: true })
      .eq('id', msgId);
    const msg = messages.find((m) => m.id === msgId);
    setPinnedMsg(msg);
    setShowPinnedMsg(true);
    setMessages((prev) => prev.map((m) => ({
      ...m, is_pinned: m.id === msgId,
    })));
  };

  const handleCopy = (text) => {
    setShowMsgMenu(null);
    navigator.clipboard.writeText(text);
  };

  const handleForward = (msg) => {
    setShowMsgMenu(null);
    navigator.clipboard.writeText(msg.body || '📷 Photo');
    alert('Message copied — paste in another chat to forward');
  };

  const handleEdit = (msg) => {
    setShowMsgMenu(null);
    setEditingMsg(msg);
    setMessage(msg.body);
    inputRef.current?.focus();
  };

  const handleReact = async (msgId, emoji) => {
    setShowQuickReact(null);
    try {
      await supabase.from('message_reactions').upsert(
        { message_id: msgId, user_id: user.id, emoji },
        { onConflict: 'message_id,user_id' }
      );
    } catch (e) {}
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        reactions[user.id] = emoji;
        return { ...m, reactions };
      })
    );
  };

  const handleTouchStart = (e, msg) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e, msg) => {
    if (!swipeStartX.current) return;
    const diffX = e.touches[0].clientX - swipeStartX.current;
    const diffY = Math.abs(e.touches[0].clientY - swipeStartY.current);
    if (diffY > 20) return;
    const isMine = msg.sender_id === user.id;
    if (!isMine && diffX > 60) setSwipingMsg(msg.id);
    else if (isMine && diffX < -60) setSwipingMsg(msg.id);
    else setSwipingMsg(null);
  };

  const handleTouchEnd = (msg) => {
    if (swipingMsg === msg.id && !msg.is_deleted) {
      setReplyTo(msg);
      setShowMsgMenu(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    swipeStartX.current = null;
    swipeStartY.current = null;
    setSwipingMsg(null);
  };

  const groupedMessages = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  const filteredMessages = searchQuery
    ? messages.filter((m) => m.body?.toLowerCase().includes(searchQuery.toLowerCase()))
    : starredOnly
    ? messages.filter((m) => m.starred_by?.includes(user.id))
    : null;

  const displayGroups = filteredMessages
    ? { Results: filteredMessages }
    : groupedMessages;

  const currentEmojis = emojiSearch
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(emojiSearch))
    : EMOJI_CATEGORIES[emojiCategoryIdx]?.emojis || [];

  return (
    <div
      className="flex flex-col bg-[#0A1628]"
      style={{ height: '100dvh' }}
      onClick={() => { setShowMsgMenu(null); setShowQuickReact(null); setShowChatInfo(false); }}
    >
      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 bg-[#0d1f3c] border-b border-white/10 px-3 py-2.5 flex items-center gap-2">
        {searchMode ? (
          <>
            <button onClick={() => { setSearchMode(false); setSearchQuery(''); }} className="text-[#6B7280] p-1">
              <ArrowLeft size={22} />
            </button>
            <input
              type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..." autoFocus
              className="flex-1 bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#6B7280]"><X size={18} /></button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => navigate('/chats')} className="text-[#6B7280] hover:text-white p-1 flex-shrink-0">
              <ArrowLeft size={22} />
            </button>
            <button
              onClick={() => navigate('/profile/' + otherUser?.username)}
              className="flex items-center gap-2.5 flex-1 min-w-0"
            >
              <div className="relative flex-shrink-0">
                <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={10} />
                {otherUser?.is_online && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#2ECC71] rounded-full border-2 border-[#0d1f3c] shadow-sm shadow-[#2ECC71]/50" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-bold text-sm truncate">{otherUser?.display_name}</p>
                  {otherUser?.is_verified && (
                    <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
                  )}
                </div>
                <OnlineStatus user={otherUser} isTyping={isOtherTyping} />
              </div>
            </button>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button className="text-[#6B7280] hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors">
                <Phone size={19} />
              </button>
              <button className="text-[#6B7280] hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors">
                <Video size={19} />
              </button>
              <button onClick={() => setSearchMode(true)} className="text-[#6B7280] hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors">
                <Search size={19} />
              </button>
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowChatInfo(!showChatInfo); }}
                  className="text-[#6B7280] hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors"
                >
                  <MoreVertical size={19} />
                </button>
                {showChatInfo && (
                  <div
                    className="absolute right-0 top-10 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-56 shadow-2xl slide-up"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[
                      { icon: Star, label: 'Starred messages', action: () => { setStarredOnly(true); setShowChatInfo(false); } },
                      { icon: Pin, label: 'View pinned message', action: () => { setShowPinnedMsg(true); setShowChatInfo(false); } },
                      { icon: isMuted ? Volume2 : VolumeX, label: isMuted ? 'Unmute' : 'Mute notifications', action: () => { setIsMuted(!isMuted); setShowChatInfo(false); } },
                      { icon: Search, label: 'Search messages', action: () => { setSearchMode(true); setShowChatInfo(false); } },
                      { icon: Info, label: 'Contact info', action: () => { navigate('/profile/' + otherUser?.username); setShowChatInfo(false); } },
                      { icon: Shield, label: 'Block contact', action: () => setShowChatInfo(false) },
                      {
                        icon: Trash2, label: 'Clear chat', action: async () => {
                          if (window.confirm('Clear all messages for you?')) {
                            // Delete for me only
                            for (const msg of messages) {
                              const newDeleted = [...(msg.deleted_for || []), user.id];
                              await supabase.from('messages').update({ deleted_for: newDeleted }).eq('id', msg.id);
                            }
                            setMessages([]);
                            setShowChatInfo(false);
                          }
                        }
                      },
                    ].map((item) => (
                      <button key={item.label} onClick={item.action}
                        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5 last:border-0">
                        <item.icon size={15} className="text-[#6B7280] flex-shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pinned message banner */}
      {pinnedMsg && showPinnedMsg && (
        <div className="flex-shrink-0 bg-[#1E6FFF]/10 border-b border-[#1E6FFF]/20 px-4 py-2 flex items-center gap-3">
          <Pin size={14} className="text-[#1E6FFF] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[#1E6FFF] text-[10px] font-bold">Pinned Message</p>
            <p className="text-white/70 text-xs truncate">{pinnedMsg.body || '📷 Photo'}</p>
          </div>
          <button onClick={() => setShowPinnedMsg(false)} className="text-[#6B7280]">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Starred banner */}
      {starredOnly && (
        <div className="flex-shrink-0 bg-[#FFD700]/10 border-b border-[#FFD700]/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-[#FFD700] fill-[#FFD700]" />
            <p className="text-[#FFD700] text-xs font-semibold">Starred messages</p>
          </div>
          <button onClick={() => setStarredOnly(false)} className="text-[#6B7280]"><X size={16} /></button>
        </div>
      )}

      {/* ── MESSAGES AREA ── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 overscroll-contain"
        style={{
          backgroundImage: wallpaper
            ? 'url(' + wallpaper + ')'
            : 'radial-gradient(circle at 20% 50%, rgba(30,111,255,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(123,47,255,0.04) 0%, transparent 60%)',
          backgroundSize: wallpaper ? 'cover' : 'auto',
        }}
        onClick={() => { setShowMsgMenu(null); setShowQuickReact(null); setShowChatInfo(false); setShowEmoji(false); }}
      >
        {Object.entries(displayGroups).map(([dateLabel, msgs]) => (
          <div key={dateLabel}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <div className="flex-1 h-px bg-white/5" />
              <span className="mx-3 text-[#6B7280] text-[10px] bg-[#111827]/80 backdrop-blur-sm px-3 py-1 rounded-full flex-shrink-0">
                {dateLabel === 'Results' ? '🔍 Search Results' : (() => {
                  const d = new Date(dateLabel);
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  if (d.toDateString() === today.toDateString()) return '📅 Today';
                  if (d.toDateString() === yesterday.toDateString()) return '📅 Yesterday';
                  return d.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });
                })()}
              </span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {msgs.map((msg, idx) => {
              const isMine = msg.sender_id === user.id;
              const isFirst = idx === 0 || msgs[idx - 1]?.sender_id !== msg.sender_id;
              const isLast = idx === msgs.length - 1 || msgs[idx + 1]?.sender_id !== msg.sender_id;
              const isDeleted = msg.is_deleted;
              const isSwiping = swipingMsg === msg.id;
              const isStarred = msg.starred_by?.includes(user.id);
              const isPinned = msg.is_pinned;
              const msgReactions = msg.reactions || {};
              const reactionCounts = Object.values(msgReactions).reduce((acc, emoji) => {
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
              }, {});

              return (
                <div
                  key={msg.id}
                  className={
                    'flex items-end gap-2 mb-0.5 ' +
                    (isMine ? 'flex-row-reverse' : 'flex-row') +
                    (isPinned ? ' bg-[#1E6FFF]/5 rounded-2xl px-1 py-0.5' : '')
                  }
                  onTouchStart={(e) => handleTouchStart(e, msg)}
                  onTouchMove={(e) => handleTouchMove(e, msg)}
                  onTouchEnd={() => handleTouchEnd(msg)}
                >
                  {/* Avatar */}
                  {!isMine && (
                    <div className="w-7 flex-shrink-0 mb-1">
                      {isLast && (
                        <Avatar url={msg.sender?.avatar_url} name={msg.sender?.display_name} size={7} />
                      )}
                    </div>
                  )}

                  {/* Swipe reply indicator */}
                  {isSwiping && !isDeleted && (
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#1E6FFF]/30 flex-shrink-0">
                      <Reply size={13} className="text-[#1E6FFF]" />
                    </div>
                  )}

                  {/* Message bubble */}
                  <div
                    className={
                      'max-w-[78%] group relative transition-transform duration-150 ' +
                      (isSwiping ? (isMine ? '-translate-x-8' : 'translate-x-8') : '')
                    }
                  >
                    {/* Sender name */}
                    {!isMine && isFirst && (
                      <p className="text-[#1E6FFF] text-xs font-bold mb-1 px-1">
                        {msg.sender?.display_name}
                      </p>
                    )}

                    {/* Reply preview */}
                    {msg.parent_message_id && (
                      <div className={
                        'text-xs mb-1 px-3 py-2 rounded-xl border-l-2 border-[#1E6FFF] ' +
                        (isMine ? 'bg-white/10' : 'bg-white/5')
                      }>
                        <p className="text-[#1E6FFF] font-semibold text-[10px] mb-0.5">↩ Reply</p>
                        <p className="text-white/50 text-[11px] truncate">Original message</p>
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={
                        'px-3 py-2 relative select-text ' +
                        (isMine
                          ? 'bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] text-white ' +
                            (isFirst ? 'rounded-t-2xl ' : 'rounded-t-xl ') +
                            (isLast ? 'rounded-bl-2xl rounded-br-sm ' : 'rounded-b-xl ')
                          : 'bg-[#1a2a4a] text-white/90 ' +
                            (isFirst ? 'rounded-t-2xl ' : 'rounded-t-xl ') +
                            (isLast ? 'rounded-br-2xl rounded-bl-sm ' : 'rounded-b-xl ')) +
                        (isDeleted ? 'opacity-60 ' : '')
                      }
                      onDoubleClick={() => !isDeleted && setShowQuickReact(msg.id)}
                    >
                      {/* Forwarded */}
                      {msg.forwarded && (
                        <div className="flex items-center gap-1 mb-1 opacity-60">
                          <Forward size={11} />
                          <p className="text-[10px]">Forwarded</p>
                        </div>
                      )}

                      {/* Starred + Pinned indicators */}
                      <div className="absolute top-1 right-2 flex items-center gap-1">
                        {isStarred && <Star size={9} className="text-[#FFD700] fill-[#FFD700]" />}
                        {isPinned && <Pin size={9} className="text-[#1E6FFF]" />}
                      </div>

                      {/* Image */}
                      {msg.message_type === 'image' && msg.media_url && !isDeleted && (
                        <img
                          src={msg.media_url} alt="sent"
                          className="rounded-xl max-w-full mb-1.5 max-h-64 object-cover cursor-pointer block"
                          onClick={() => window.open(msg.media_url, '_blank')}
                        />
                      )}

                      {/* Text */}
                      {(msg.body || isDeleted) && (
                        <p className={
                          'text-sm leading-relaxed break-words ' +
                          (isDeleted ? 'italic text-white/40' : '')
                        }>
                          {isDeleted ? '🚫 This message was deleted' : msg.body}
                        </p>
                      )}

                      {/* Edited */}
                      {msg.edited && !isDeleted && (
                        <p className="text-[10px] text-white/40 mt-0.5">edited</p>
                      )}

                      {/* Time + Status */}
                      <div className={
                        'flex items-center gap-1.5 mt-1 ' +
                        (isMine ? 'justify-end' : 'justify-start')
                      }>
                        <span className="text-[10px] text-white/40">
                          {new Date(msg.created_at).toLocaleTimeString('en-KE', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <MessageStatus msg={msg} isMine={isMine} />
                      </div>
                    </div>

                    {/* Reactions */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div className={
                        'flex gap-1 flex-wrap mt-1 ' +
                        (isMine ? 'justify-end' : 'justify-start')
                      }>
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="flex items-center gap-0.5 bg-[#111827] border border-white/10 rounded-full px-1.5 py-0.5 hover:bg-white/10 transition-colors"
                          >
                            <span className="text-xs">{emoji}</span>
                            {count > 1 && <span className="text-[10px] text-white/60">{count}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick react picker */}
                    {showQuickReact === msg.id && !isDeleted && (
                      <div
                        className={
                          'absolute -top-14 ' +
                          (isMine ? 'right-0' : 'left-0') +
                          ' bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1 z-30 shadow-2xl slide-up'
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="text-xl hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Hover action buttons */}
                    {!isDeleted && (
                      <div
                        className={
                          'absolute top-0 hidden group-hover:flex items-center gap-1 z-20 ' +
                          (isMine
                            ? 'left-0 -translate-x-full pr-1 flex-row-reverse'
                            : 'right-0 translate-x-full pl-1')
                        }
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyTo(msg);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="w-7 h-7 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                        >
                          <Reply size={12} className="text-white/70" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowMsgMenu(showMsgMenu === msg.id ? null : msg.id);
                          }}
                          className="w-7 h-7 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                        >
                          <ChevronDown size={12} className="text-white/70" />
                        </button>
                      </div>
                    )}

                    {/* Full message menu */}
                    {showMsgMenu === msg.id && (
                      <div
                        className={
                          'absolute top-8 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-40 w-52 shadow-2xl slide-up ' +
                          (isMine ? 'right-0' : 'left-0')
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isDeleted && msg.body && (
                          <button onClick={() => handleCopy(msg.body)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                            <Copy size={14} className="text-[#6B7280]" /> Copy text
                          </button>
                        )}
                        {!isDeleted && (
                          <button
                            onClick={() => { setShowQuickReact(msg.id); setShowMsgMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                          >
                            <span className="text-base">😊</span> React
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReplyTo(msg);
                            setShowMsgMenu(null);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                        >
                          <Reply size={14} className="text-[#6B7280]" /> Reply
                        </button>
                        {!isDeleted && (
                          <button onClick={() => handleForward(msg)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                            <Forward size={14} className="text-[#6B7280]" /> Forward
                          </button>
                        )}
                        <button onClick={() => handleStar(msg.id)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                          <Star size={14} className={isStarred ? 'text-[#FFD700] fill-[#FFD700]' : 'text-[#6B7280]'} />
                          {isStarred ? 'Unstar' : 'Star message'}
                        </button>
                        <button onClick={() => handlePin(msg.id)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                          <Pin size={14} className="text-[#6B7280]" />
                          {msg.is_pinned ? 'Unpin' : 'Pin message'}
                        </button>
                        {isMine && !isDeleted && msg.message_type === 'text' && (
                          <button onClick={() => handleEdit(msg)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                            <Edit3 size={14} className="text-[#6B7280]" /> Edit message
                          </button>
                        )}
                        {!isDeleted && msg.media_url && (
                          <button
                            onClick={() => { window.open(msg.media_url, '_blank'); setShowMsgMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                          >
                            <Download size={14} className="text-[#6B7280]" /> Download
                          </button>
                        )}
                        <button onClick={() => handleDeleteForMe(msg.id)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                          <Trash2 size={14} className="text-[#6B7280]" /> Delete for me
                        </button>
                        {isMine && !isDeleted && (
                          <button onClick={() => handleDeleteForEveryone(msg.id)} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
                            <Trash2 size={14} /> Delete for everyone
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {messages.length === 0 && !searchQuery && (
          <div className="flex flex-col items-center justify-center min-h-full gap-4 py-20">
            <div className="relative">
              <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={20} />
              {otherUser?.is_online && (
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-[#2ECC71] rounded-full border-2 border-[#0A1628] shadow-lg shadow-[#2ECC71]/50" />
              )}
            </div>
            <h3 className="text-white font-bold text-xl">{otherUser?.display_name}</h3>
            <p className="text-[#6B7280] text-sm text-center">
              Say hello to {otherUser?.display_name?.split(' ')[0]}! 👋
            </p>
            {/* Greeting suggestions */}
            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
              {['👋 Hey!', '😊 Hi there!', '🔥 What\'s good?', '🇰🇪 Mambo!', '✨ Sawa!'].map((greet) => (
                <button
                  key={greet}
                  onClick={() => { setMessage(greet); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white/80 hover:bg-[#1E6FFF]/20 hover:border-[#1E6FFF]/40 transition-all"
                >
                  {greet}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isOtherTyping && (
          <div className="flex items-end gap-2 mt-2">
            <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={7} />
            <div className="bg-[#1a2a4a] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#6B7280]"
                    style={{ animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's' }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* ── EMOJI PICKER ── */}
      {showEmoji && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10" style={{ maxHeight: '240px' }}>
          <div className="px-3 pt-2 pb-1">
            <input
              type="text" value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
              placeholder="Search emoji..."
              className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-white placeholder-[#6B7280] text-xs focus:outline-none focus:border-[#1E6FFF]"
            />
          </div>
          {!emojiSearch && (
            <div className="flex overflow-x-auto px-2 border-b border-white/5 gap-1" style={{ scrollbarWidth: 'none' }}>
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  onClick={() => setEmojiCategoryIdx(i)}
                  className={
                    'flex-shrink-0 px-2 py-2 text-xl transition-all rounded-lg ' +
                    (emojiCategoryIdx === i ? 'bg-[#1E6FFF]/20 border-b-2 border-[#1E6FFF]' : 'opacity-60 hover:opacity-100')
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
          <div
            className="grid grid-cols-8 gap-0.5 p-2 overflow-y-auto"
            style={{ maxHeight: '150px', scrollbarWidth: 'none' }}
          >
            {currentEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { setMessage((m) => m + emoji); inputRef.current?.focus(); }}
                className="text-2xl p-1 rounded-lg hover:bg-white/10 transition-colors active:scale-90 flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── REPLY PREVIEW ── */}
      {replyTo && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10 px-4 py-2 flex items-center gap-3">
          <div className="w-0.5 h-10 bg-[#1E6FFF] rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[#1E6FFF] text-xs font-bold">
              {replyTo.sender_id === user.id ? 'You' : replyTo.sender?.display_name}
            </p>
            <p className="text-[#6B7280] text-xs truncate">
              {replyTo.message_type === 'image' ? '📷 Photo' : replyTo.body}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-[#6B7280] flex-shrink-0 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── EDIT BANNER ── */}
      {editingMsg && (
        <div className="flex-shrink-0 bg-[#1E6FFF]/10 border-t border-[#1E6FFF]/20 px-4 py-2 flex items-center gap-3">
          <Edit3 size={14} className="text-[#1E6FFF] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[#1E6FFF] text-xs font-bold">Editing message</p>
            <p className="text-[#6B7280] text-xs truncate">{editingMsg.body}</p>
          </div>
          <button
            onClick={() => { setEditingMsg(null); setMessage(''); if (inputRef.current) inputRef.current.style.height = '22px'; }}
            className="text-[#6B7280] flex-shrink-0 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── SCHEDULE BANNER ── */}
      {showScheduler && (
        <div className="flex-shrink-0 bg-[#7B2FFF]/10 border-t border-[#7B2FFF]/20 px-4 py-2 flex items-center gap-3">
          <Clock size={14} className="text-[#7B2FFF] flex-shrink-0" />
          <input
            type="datetime-local" value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="flex-1 bg-transparent text-white text-xs focus:outline-none"
          />
          <button
            onClick={() => { setShowScheduler(false); setScheduledTime(''); }}
            className="text-[#6B7280] flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── INPUT BAR — FULLY FIXED ── */}
      <div
        className="flex-shrink-0 bg-[#0d1f3c] border-t border-white/10"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-end gap-2 px-3 pt-2.5 pb-1">

          {/* Emoji button */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // prevent losing focus from textarea
              setShowEmoji((v) => !v);
            }}
            className={
              'w-9 h-9 flex items-center justify-center rounded-full transition-all flex-shrink-0 ' +
              (showEmoji ? 'bg-[#1E6FFF]/20 text-[#1E6FFF]' : 'text-[#6B7280] hover:text-[#FFD700]')
            }
          >
            <Smile size={21} />
          </button>

          {/* Image button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-9 h-9 flex items-center justify-center text-[#6B7280] hover:text-[#1E6FFF] transition-colors rounded-full flex-shrink-0"
          >
            {uploading
              ? <div className="w-4 h-4 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
              : <Image size={21} />
            }
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSend}
          />

          {/* Text input */}
          <div className="flex-1 min-w-0 bg-white/8 border border-white/15 rounded-2xl px-3 py-2.5 focus-within:border-[#1E6FFF]/50 transition-colors" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                handleTypingBroadcast();
                // Auto resize height
                e.target.style.height = 'auto';
                const newHeight = Math.min(e.target.scrollHeight, 120);
                e.target.style.height = newHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onFocus={() => setShowEmoji(false)}
              placeholder={editingMsg ? 'Edit message...' : 'Message...'}
              rows={1}
              className="w-full bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none resize-none leading-relaxed block"
              style={{
                minHeight: '22px',
                maxHeight: '120px',
                height: '22px',
                overflowY: 'auto',
                scrollbarWidth: 'none',
                WebkitScrollbar: 'none',
              }}
            />
          </div>

          {/* Schedule button */}
          <button
            type="button"
            onClick={() => setShowScheduler(!showScheduler)}
            className={
              'w-9 h-9 flex items-center justify-center rounded-full transition-all flex-shrink-0 ' +
              (showScheduler ? 'bg-[#7B2FFF]/20 text-[#7B2FFF]' : 'text-[#6B7280] hover:text-[#7B2FFF]')
            }
          >
            <Clock size={19} />
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || (!message.trim() && !uploading)}
            className="w-10 h-10 bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all shadow-lg shadow-[#1E6FFF]/30 flex-shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Send size={16} className="text-white ml-0.5" />
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;