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
  ChevronDown, Info, Volume2, VolumeX, Shield
} from 'lucide-react';
import Avatar from '../../components/Avatar';

// Full emoji list with categories
const EMOJI_CATEGORIES = [
  {
    label: '😀 Faces', emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨',
      '😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕',
      '🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁',
      '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
      '😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺',
    ]
  },
  {
    label: '👋 Gestures', emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️',
      '💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀',
    ]
  },
  {
    label: '❤️ Hearts', emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉',
      '♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴',
    ]
  },
  {
    label: '🎉 Celebration', emojis: [
      '🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️',
      '🎪','🤹','🎭','🎨','🖼️','🎰','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝',
      '🎵','🎶','🎼','🎤','🎧','🎷','🎸','🎹','🎺','🎻','🥁','🪘','🎙️','📻','📺','📷',
    ]
  },
  {
    label: '🍕 Food', emojis: [
      '🍕','🍔','🍟','🌭','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿',
      '🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮',
      '🍡','🥟','🥠','🥡','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬',
      '🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷',
    ]
  },
  {
    label: '🐶 Animals', emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈',
      '🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝',
      '🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷️','🦂','🐢','🐍','🦎','🦖',
      '🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅',
    ]
  },
  {
    label: '🌍 Places', emojis: [
      '🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️',
      '🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫',
      '🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁',
      '🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🎡','🎢','💈','🎪','🚂','🚃','🚄',
    ]
  },
  {
    label: '🇰🇪 Flags', emojis: [
      '🇰🇪','🇳🇬','🇬🇭','🇿🇦','🇹🇿','🇺🇬','🇪🇹','🇷🇼','🇬🇧','🇺🇸','🇨🇦','🇦🇺','🇮🇳','🇨🇳','🇯🇵','🇰🇷',
      '🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇵🇹','🇧🇷','🇲🇽','🇦🇷','🇨🇴','🇵🇪','🇻🇪','🇨🇱','🇪🇬','🇲🇦','🇩🇿','🇹🇳',
      '🇸🇳','🇨🇮','🇨🇲','🇦🇴','🇲🇿','🇿🇼','🇿🇲','🇧🇼','🇳🇦','🇸🇿','🇱🇸','🇲🇼','🇲🇬','🇸🇴','🇩🇯','🇪🇷',
    ]
  },
];

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

const ChatRoom = () => {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const fileInputRef = useRef();
  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);

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
  const [isTyping, setIsTyping] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
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
  const typingTimer = useRef();

  useEffect(() => {
    fetchChatInfo();
    fetchMessages();
    markMessagesRead();
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel('room:' + id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'chat_id=eq.' + id,
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select('*, sender:sender_id(id, username, display_name, avatar_url)')
          .eq('id', payload.new.id)
          .single();
        if (data) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === data.id)) return prev;
            return [...prev, data];
          });
          if (data.sender_id !== user.id) {
            await supabase.from('messages')
              .update({ seen_at: new Date().toISOString() })
              .eq('id', data.id);
          }
        }
        scrollToBottom();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: 'chat_id=eq.' + id,
      }, (payload) => {
        setMessages((prev) =>
          prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m)
        );
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id, user.id]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchChatInfo = async () => {
    const { data: chat } = await supabase
      .from('chats').select('*').eq('id', id).single();
    if (chat) {
      const otherId = chat.participants.find((pid) => pid !== user.id);
      if (otherId) {
        const { data } = await supabase
          .from('users').select('*').eq('id', otherId).single();
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

    // Filter out messages deleted for this user
    const filtered = (data || []).filter((m) => {
      if (!m.deleted_for) return true;
      return !m.deleted_for.includes(user.id);
    });
    setMessages(filtered);
  };

  const markMessagesRead = async () => {
    await supabase
      .from('messages')
      .update({ seen_at: new Date().toISOString() })
      .eq('chat_id', id)
      .neq('sender_id', user.id)
      .is('seen_at', null);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    // Handle edit mode
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

    const msgData = {
      chat_id: id,
      sender_id: user.id,
      body: text,
      message_type: 'text',
      parent_message_id: replyTo?.id || null,
      delivered_at: new Date().toISOString(),
      forwarded: false,
      deleted_for: [],
      starred_by: [],
    };

    // Scheduled message
    if (scheduledTime) {
      msgData.scheduled_at = new Date(scheduledTime).toISOString();
      setScheduledTime('');
      setShowScheduler(false);
      alert('Message scheduled for ' + new Date(scheduledTime).toLocaleString());
      setSending(false);
      setReplyTo(null);
      return;
    }

    const { data } = await supabase
      .from('messages')
      .insert(msgData)
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
          to: otherUser.id,
          from: user.id,
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

  const handleImageSend = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToCloudinary(file, 'chat_media');
    const { data } = await supabase
      .from('messages')
      .insert({
        chat_id: id,
        sender_id: user.id,
        body: '',
        media_url: url,
        message_type: 'image',
        delivered_at: new Date().toISOString(),
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
        last_message: '📷 Photo',
        last_message_at: new Date().toISOString(),
      }).eq('id', id);
      if (otherUser) {
        await sendNotification({
          to: otherUser.id,
          from: user.id,
          type: 'message',
          message: 'sent you a photo 📷',
          refId: id,
        });
      }
    }
    setUploading(false);
    scrollToBottom();
  };

  // ── Delete for ME (stored in DB, persistent) ──
  const handleDeleteForMe = async (msgId) => {
    setShowMsgMenu(null);
    const msg = messages.find((m) => m.id === msgId);
    const currentDeleted = msg?.deleted_for || [];
    const newDeleted = [...currentDeleted, user.id];

    await supabase.from('messages')
      .update({ deleted_for: newDeleted })
      .eq('id', msgId);

    // Remove from local state immediately
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  // ── Delete for EVERYONE (stored in DB) ──
  const handleDeleteForEveryone = async (msgId) => {
    setShowMsgMenu(null);
    await supabase.from('messages')
      .update({
        is_deleted: true,
        body: '',
        media_url: null,
        deleted_for: [],
      })
      .eq('id', msgId);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, is_deleted: true, body: '', media_url: null }
          : m
      )
    );
  };

  // ── Star/Unstar message ──
  const handleStar = async (msgId) => {
    setShowMsgMenu(null);
    const msg = messages.find((m) => m.id === msgId);
    const isStarred = msg?.starred_by?.includes(user.id);
    const newStarred = isStarred
      ? (msg.starred_by || []).filter((uid) => uid !== user.id)
      : [...(msg.starred_by || []), user.id];

    await supabase.from('messages')
      .update({ starred_by: newStarred })
      .eq('id', msgId);

    setMessages((prev) =>
      prev.map((m) => m.id === msgId ? { ...m, starred_by: newStarred } : m)
    );
  };

  // ── Copy message ──
  const handleCopy = (text) => {
    setShowMsgMenu(null);
    navigator.clipboard.writeText(text);
  };

  // ── Forward message ──
  const handleForward = async (msg) => {
    setShowMsgMenu(null);
    // For now copy to clipboard — full forward UI can be added later
    navigator.clipboard.writeText(msg.body || '📷 Photo');
    alert('Message copied — paste it in another chat to forward');
  };

  // ── Edit message ──
  const handleEdit = (msg) => {
    setShowMsgMenu(null);
    setEditingMsg(msg);
    setMessage(msg.body);
    inputRef.current?.focus();
  };

  // ── React to message ──
  const handleReact = async (msgId, emoji) => {
    setShowQuickReact(null);
    await supabase.from('message_reactions').upsert(
      { message_id: msgId, user_id: user.id, emoji },
      { onConflict: 'message_id,user_id' }
    );
    // Update local reactions
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const reactions = m.reactions || {};
        reactions[user.id] = emoji;
        return { ...m, reactions };
      })
    );
  };

  // ── Swipe to reply ──
  const handleTouchStart = (e, msg) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e, msg) => {
    if (!swipeStartX.current) return;
    const diffX = e.touches[0].clientX - swipeStartX.current;
    const diffY = Math.abs(e.touches[0].clientY - swipeStartY.current);
    if (diffY > 20) return; // Vertical scroll — ignore
    const isMine = msg.sender_id === user.id;
    if (!isMine && diffX > 60) setSwipingMsg(msg.id);
    else if (isMine && diffX < -60) setSwipingMsg(msg.id);
    else setSwipingMsg(null);
  };

  const handleTouchEnd = (msg) => {
    if (swipingMsg === msg.id && !msg.is_deleted) {
      setReplyTo(msg);
      setShowMsgMenu(null);
      inputRef.current?.focus();
    }
    swipeStartX.current = null;
    swipeStartY.current = null;
    setSwipingMsg(null);
  };

  const handleTyping = () => {
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setIsTyping(false), 2000);
  };

  const getMessageStatus = (msg) => {
    if (msg.sender_id !== user.id) return null;
    if (msg.seen_at) return <CheckCheck size={13} className="text-[#1E6FFF]" />;
    if (msg.delivered_at) return <CheckCheck size={13} className="text-[#6B7280]" />;
    return <Check size={13} className="text-[#6B7280]" />;
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
    ? { 'Results': filteredMessages }
    : groupedMessages;

  const currentEmojis = emojiSearch
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(emojiSearch))
    : EMOJI_CATEGORIES[emojiCategoryIdx]?.emojis || [];

  return (
    <div className="flex flex-col bg-[#0A1628]" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <div className="flex-shrink-0 bg-[#0d1f3c] border-b border-white/10 px-4 py-3 flex items-center gap-3">
        {searchMode ? (
          <>
            <button onClick={() => { setSearchMode(false); setSearchQuery(''); }} className="text-[#6B7280]">
              <ArrowLeft size={22} />
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              autoFocus
              className="flex-1 bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#6B7280]">
                <X size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={() => navigate('/chats')} className="text-[#6B7280] hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <button
              onClick={() => navigate('/profile/' + otherUser?.username)}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="relative">
                <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={10} />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#2ECC71] rounded-full border-2 border-[#0d1f3c]" />
              </div>
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-bold text-sm truncate">{otherUser?.display_name}</p>
                  {otherUser?.is_verified && (
                    <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold">✓</span>
                  )}
                </div>
                <p className="text-[#2ECC71] text-xs">{isTyping ? 'typing...' : 'Online'}</p>
              </div>
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="text-[#6B7280] hover:text-white p-1"><Phone size={19} /></button>
              <button className="text-[#6B7280] hover:text-white p-1"><Video size={19} /></button>
              <button
                onClick={() => setSearchMode(true)}
                className="text-[#6B7280] hover:text-white p-1"
              >
                <Search size={19} />
              </button>
              {/* More options */}
              <div className="relative">
                <button
                  onClick={() => setShowChatInfo(!showChatInfo)}
                  className="text-[#6B7280] hover:text-white p-1"
                >
                  <MoreVertical size={19} />
                </button>
                {showChatInfo && (
                  <div className="absolute right-0 top-8 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-52 shadow-2xl slide-up">
                    {[
                      { icon: Star, label: 'Starred messages', action: () => { setStarredOnly(true); setShowChatInfo(false); } },
                      { icon: isMuted ? Volume2 : VolumeX, label: isMuted ? 'Unmute' : 'Mute notifications', action: () => { setIsMuted(!isMuted); setShowChatInfo(false); } },
                      { icon: Search, label: 'Search messages', action: () => { setSearchMode(true); setShowChatInfo(false); } },
                      { icon: Info, label: 'Contact info', action: () => { navigate('/profile/' + otherUser?.username); setShowChatInfo(false); } },
                      { icon: Shield, label: 'Block contact', action: () => setShowChatInfo(false) },
                      { icon: Trash2, label: 'Clear chat', action: async () => {
                        if (window.confirm('Clear all messages?')) {
                          await supabase.from('messages').delete().eq('chat_id', id);
                          setMessages([]);
                          setShowChatInfo(false);
                        }
                      }},
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5 last:border-0"
                      >
                        <item.icon size={16} className="text-[#6B7280]" />
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

      {/* Starred banner */}
      {starredOnly && (
        <div className="flex-shrink-0 bg-[#FFD700]/10 border-b border-[#FFD700]/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-[#FFD700] fill-[#FFD700]" />
            <p className="text-[#FFD700] text-xs font-semibold">Starred messages</p>
          </div>
          <button onClick={() => setStarredOnly(false)} className="text-[#6B7280]">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 overscroll-contain"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(30,111,255,0.03) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(123,47,255,0.03) 0%, transparent 60%)' }}
        onClick={() => { setShowMsgMenu(null); setShowQuickReact(null); setShowChatInfo(false); setShowEmoji(false); }}
      >
        {Object.entries(displayGroups).map(([dateLabel, msgs]) => (
          <div key={dateLabel}>
            {/* Date badge */}
            <div className="flex items-center justify-center my-4">
              <span className="text-[#6B7280] text-xs bg-[#111827]/80 backdrop-blur-sm px-3 py-1 rounded-full">
                {dateLabel === 'Results' ? 'Search Results' : (() => {
                  const d = new Date(dateLabel);
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  if (d.toDateString() === today.toDateString()) return 'Today';
                  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
                  return d.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' });
                })()}
              </span>
            </div>

            {msgs.map((msg, idx) => {
              const isMine = msg.sender_id === user.id;
              const isFirst = idx === 0 || msgs[idx - 1]?.sender_id !== msg.sender_id;
              const isLast = idx === msgs.length - 1 || msgs[idx + 1]?.sender_id !== msg.sender_id;
              const isDeleted = msg.is_deleted;
              const isSwiping = swipingMsg === msg.id;
              const isStarred = msg.starred_by?.includes(user.id);
              const msgReactions = msg.reactions || {};
              const reactionCounts = Object.values(msgReactions).reduce((acc, emoji) => {
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
              }, {});
              const isHighlighted = searchQuery && msg.body?.toLowerCase().includes(searchQuery.toLowerCase());

              return (
                <div
                  key={msg.id}
                  className={'flex items-end gap-2 mb-1 ' + (isMine ? 'flex-row-reverse' : 'flex-row') + (isHighlighted ? ' bg-[#FFD700]/5 rounded-xl' : '')}
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

                  {/* Swipe indicator */}
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
                    {/* Sender name for group */}
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
                        'px-3 py-2 relative ' +
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
                      {/* Forwarded label */}
                      {msg.forwarded && (
                        <div className="flex items-center gap-1 mb-1 opacity-60">
                          <Forward size={11} />
                          <p className="text-[10px]">Forwarded</p>
                        </div>
                      )}

                      {/* Starred indicator */}
                      {isStarred && (
                        <Star size={10} className="absolute top-1 right-1 text-[#FFD700] fill-[#FFD700]" />
                      )}

                      {/* Image */}
                      {msg.message_type === 'image' && msg.media_url && !isDeleted && (
                        <img
                          src={msg.media_url}
                          alt="sent"
                          className="rounded-xl max-w-full mb-1.5 max-h-60 object-cover cursor-pointer"
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

                      {/* Edited label */}
                      {msg.edited && !isDeleted && (
                        <p className="text-[10px] text-white/40 mt-0.5">edited</p>
                      )}

                      {/* Time + status */}
                      <div className={'flex items-center gap-1 mt-1 ' + (isMine ? 'justify-end' : 'justify-start')}>
                        <span className="text-[10px] text-white/40">
                          {new Date(msg.created_at).toLocaleTimeString('en-KE', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        {getMessageStatus(msg)}
                      </div>
                    </div>

                    {/* Reactions display */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div className={
                        'flex gap-1 flex-wrap mt-1 ' + (isMine ? 'justify-end' : 'justify-start')
                      }>
                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="flex items-center gap-0.5 bg-[#111827] border border-white/10 rounded-full px-1.5 py-0.5"
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
                          'absolute -top-12 ' +
                          (isMine ? 'right-0' : 'left-0') +
                          ' bg-[#111827] border border-white/10 rounded-full px-2 py-1.5 flex gap-1.5 z-30 shadow-2xl slide-up'
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="text-xl hover:scale-130 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Long press / hover menu */}
                    {!isDeleted && (
                      <div
                        className={
                          'absolute top-0 hidden group-hover:flex items-center gap-1 z-20 ' +
                          (isMine ? 'left-0 -translate-x-full pr-1 flex-row-reverse' : 'right-0 translate-x-full pl-1')
                        }
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); }}
                          className="w-7 h-7 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10"
                        >
                          <Reply size={12} className="text-white/70" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowMsgMenu(showMsgMenu === msg.id ? null : msg.id); }}
                          className="w-7 h-7 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center hover:bg-white/10"
                        >
                          <ChevronDown size={12} className="text-white/70" />
                        </button>
                      </div>
                    )}

                    {/* Full message menu */}
                    {showMsgMenu === msg.id && (
                      <div
                        className={
                          'absolute top-8 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-40 w-48 shadow-2xl slide-up ' +
                          (isMine ? 'right-0' : 'left-0')
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isDeleted && msg.body && (
                          <button
                            onClick={() => handleCopy(msg.body)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                          >
                            <Copy size={14} className="text-[#6B7280]" /> Copy
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
                          onClick={() => { setReplyTo(msg); setShowMsgMenu(null); inputRef.current?.focus(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                        >
                          <Reply size={14} className="text-[#6B7280]" /> Reply
                        </button>
                        {!isDeleted && (
                          <button
                            onClick={() => handleForward(msg)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                          >
                            <Forward size={14} className="text-[#6B7280]" /> Forward
                          </button>
                        )}
                        <button
                          onClick={() => handleStar(msg.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                        >
                          <Star size={14} className={isStarred ? 'text-[#FFD700] fill-[#FFD700]' : 'text-[#6B7280]'} />
                          {isStarred ? 'Unstar' : 'Star'}
                        </button>
                        {isMine && !isDeleted && msg.message_type === 'text' && (
                          <button
                            onClick={() => handleEdit(msg)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                          >
                            <Edit3 size={14} className="text-[#6B7280]" /> Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteForMe(msg.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                        >
                          <Trash2 size={14} className="text-[#6B7280]" /> Delete for me
                        </button>
                        {isMine && !isDeleted && (
                          <button
                            onClick={() => handleDeleteForEveryone(msg.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm"
                          >
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
          <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={20} />
            <h3 className="text-white font-bold text-lg">{otherUser?.display_name}</h3>
            <p className="text-[#6B7280] text-sm text-center">
              Say hello to {otherUser?.display_name?.split(' ')[0]}! 👋
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10 max-h-64">
          {/* Search + categories */}
          <div className="px-3 pt-2 pb-1">
            <input
              type="text"
              value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
              placeholder="Search emoji..."
              className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-white placeholder-[#6B7280] text-xs focus:outline-none focus:border-[#1E6FFF]"
            />
          </div>
          {!emojiSearch && (
            <div className="flex overflow-x-auto border-b border-white/5 px-2" style={{ scrollbarWidth: 'none' }}>
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  onClick={() => setEmojiCategoryIdx(i)}
                  className={
                    'flex-shrink-0 px-2 py-2 text-lg transition-all ' +
                    (emojiCategoryIdx === i ? 'border-b-2 border-[#1E6FFF]' : 'opacity-60')
                  }
                >
                  {cat.emojis[0]}
                </button>
              ))}
            </div>
          )}
          <div
            className="grid grid-cols-8 gap-0.5 p-2 overflow-y-auto"
            style={{ maxHeight: '160px' }}
          >
            {currentEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setMessage((m) => m + emoji)}
                className="text-2xl p-1 rounded-lg hover:bg-white/10 transition-colors active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply preview */}
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
          <button onClick={() => setReplyTo(null)} className="text-[#6B7280] flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Edit mode banner */}
      {editingMsg && (
        <div className="flex-shrink-0 bg-[#1E6FFF]/10 border-t border-[#1E6FFF]/20 px-4 py-2 flex items-center gap-3">
          <Edit3 size={14} className="text-[#1E6FFF] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[#1E6FFF] text-xs font-bold">Editing message</p>
            <p className="text-[#6B7280] text-xs truncate">{editingMsg.body}</p>
          </div>
          <button
            onClick={() => { setEditingMsg(null); setMessage(''); }}
            className="text-[#6B7280] flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Schedule banner */}
      {showScheduler && (
        <div className="flex-shrink-0 bg-[#7B2FFF]/10 border-t border-[#7B2FFF]/20 px-4 py-2 flex items-center gap-3">
          <Clock size={14} className="text-[#7B2FFF] flex-shrink-0" />
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="flex-1 bg-transparent text-white text-xs focus:outline-none"
          />
          <button
            onClick={() => { setShowScheduler(false); setScheduledTime(''); }}
            className="text-[#6B7280]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 bg-[#0d1f3c] border-t border-white/10 px-3 py-3 pb-20">
        <div className="flex items-end gap-2">
          {/* Emoji button */}
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className={'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all ' + (showEmoji ? 'bg-[#1E6FFF]/20 text-[#1E6FFF]' : 'text-[#6B7280] hover:text-[#FFD700]')}
          >
            <Smile size={22} />
          </button>

          {/* Image button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-[#6B7280] hover:text-[#1E6FFF] transition-colors"
          >
            <Image size={22} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSend} />

          {/* Text input */}
          <div className="flex-1 flex items-end bg-white/5 border border-white/10 rounded-2xl px-3 py-2 min-h-[44px]">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={editingMsg ? 'Edit message...' : 'Message...'}
              rows={1}
              className="flex-1 bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none resize-none max-h-28 leading-relaxed"
              style={{ scrollbarWidth: 'none' }}
            />
          </div>

          {/* Schedule button */}
          <button
            onClick={() => setShowScheduler(!showScheduler)}
            className={'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all ' + (showScheduler ? 'bg-[#7B2FFF]/20 text-[#7B2FFF]' : 'text-[#6B7280] hover:text-[#7B2FFF]')}
          >
            <Clock size={20} />
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || (!message.trim() && !uploading)}
            className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] rounded-full flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shadow-lg shadow-[#1E6FFF]/30"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={16} className="text-white ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;