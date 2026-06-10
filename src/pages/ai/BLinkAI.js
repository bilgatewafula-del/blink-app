import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Send, Paperclip, X,
  Sparkles, RefreshCw, Copy, ThumbsUp,
  ThumbsDown, Mic, Image as ImageIcon
} from 'lucide-react';
import { formatTime } from '../../utils/formatTime';

// ── B-Link AI Knowledge Base ──────────────────────────────────────
const BLINK_KNOWLEDGE = `
You are B-Link AI, the official intelligent assistant for B-Link — Africa's premier GenZ social media platform.

ABOUT YOU:
- Name: B-Link AI (also called "Blinky" informally)
- Created by: Bilgate Mukhayo (CEO & Founder of B-Link), with the B-Link Engineering Team
- Purpose: Help B-Link users get the most out of the platform, answer questions, provide support, and be a friendly companion
- Personality: Warm, encouraging, professional yet relatable, uses occasional African slang naturally, never robotic
- You were launched alongside B-Link V2.0

ABOUT B-LINK APP:
- Full name: B-Link — Africa's Social Platform
- Vision: Africa's first GenZ-centric lightweight social media platform
- Built with: React.js, Supabase, Cloudinary, Vercel
- Target audience: African GenZ users and African diaspora worldwide
- Key markets: Kenya, Nigeria, Ghana, Uganda, Tanzania, South Africa and across Africa

FEATURES YOU KNOW ABOUT:
1. FEED: Three tabs — Following (people you follow), Trending (most liked posts), Country (posts from your country). Pull to refresh, infinite scroll, real-time updates.
2. POSTS: Create text posts with colorful backgrounds (7 colors), upload up to 6 images, add hashtags with autocomplete, set location, choose audience (Public/Followers/Private). Double-tap any image to like instantly.
3. REACTIONS: 5 reaction types — ❤️ Like, 😂 Haha, 😮 Wow, 😢 Sad, 😡 Angry. Long press the like button to see all reactions.
4. STORIES: 24-hour disappearing content. Create photo stories or text stories with colorful backgrounds. Stories expire automatically after 24 hours.
5. CHATS: Full-featured messaging — send text, images, reply to messages (swipe), delete for me or everyone, star important messages, edit sent messages, react with emoji, schedule messages, search within chats, mute conversations.
6. NOTIFICATIONS: Real-time alerts for likes, comments, replies, follows, mentions, messages. Filter by type. Accept/decline follow requests.
7. DISCOVER: Search users by name or username, browse trending hashtags, see trending posts grid, follow people directly.
8. PROFILE: View your posts grid, saved posts, analytics (engagement rate, total reactions, comments). Edit profile photo, bio, website, country.
9. VERIFICATION: 3-step process — choose badge type (Personal KES 200/mo, Business KES 500/mo, Creator free for 1K+ followers), upload ID, submit for review (3-5 business days).
10. WALLET: Coming Soon — M-Pesa integration for tips and creator earnings. Creator economy features launching Q2 2025.
11. BUSINESS CENTER: Analytics dashboard — impressions, reach, engagement rate, top posts, audience insights, boost packages (coming soon).
12. NEWS: Kenya and Africa news with categories — Kenya, Politics, Business, Tech, Sports, Africa.
13. HASHTAGS: Tap any hashtag to see all posts using it. Sort by Recent or Top.
14. FOLLOW SYSTEM: Follow/Unfollow, Follow Back, private accounts with follow requests, mutual followers display.
15. STORIES REPLY: Reply to someone's story — message goes directly to their chat inbox.

TECHNICAL DETAILS:
- Available on: Web browser (Chrome, Safari, Firefox), installable as PWA on Android and iOS
- To install on Android: Open in Chrome → tap 3 dots → Add to Home Screen
- To install on iOS: Open in Safari → tap Share → Add to Home Screen
- Database: Supabase (PostgreSQL) with Row Level Security
- Images: Cloudinary CDN with auto-compression
- Deployed on: Vercel

PRICING:
- B-Link is completely FREE to use
- Verification badges have monthly fees (Personal KES 200, Business KES 500)
- Creator badge is free for accounts with 1,000+ followers
- Wallet/tips feature coming soon with M-Pesa integration

TEAM:
- CEO & Founder: Bilgate Mukhayo
- Built by the B-Link Engineering Team
- Made in Kenya 🇰🇪

SUPPORT:
- Email: support@blink.africa
- Help Center: Available in the app under Menu → Help Center
- Report issues: Menu → Help Center → Report a Problem

ENCOURAGE USERS:
- Always encourage users to post more, engage with others, follow people
- Remind them about features they might not know
- Be positive and supportive
- Celebrate milestones (first post, first 10 followers, etc.)

RESPONSE STYLE:
- Friendly and warm, like talking to a knowledgeable friend
- Use "you" not "the user"
- Occasional use of African expressions naturally (e.g., "Sawa!", "That's fire 🔥")
- Keep responses concise but complete
- Use emojis naturally but not excessively
- Never say "I cannot" — always find a way to help
- If you don't know something specific, be honest but helpful
- Always end with an encouraging note or offer to help further
`;

// ── Greeting based on time ────────────────────────────────────────
const getGreeting = (name) => {
  const hour = new Date().getHours();
  let timeGreeting = '';
  if (hour >= 5 && hour < 12) timeGreeting = 'Good morning';
  else if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) timeGreeting = 'Good evening';
  else timeGreeting = 'Hey night owl 🌙';

  const firstName = name?.split(' ')[0] || 'there';

  return timeGreeting + ', ' + firstName + '! 👋 I\'m **Blinky**, your B-Link AI assistant. I\'m here to help you get the most out of B-Link — whether you need help with features, have questions about the app, or just want to chat.\n\nWhat can I help you with today? ✨';
};

// ── Quick suggestions ─────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  '🚀 What can B-Link do?',
  '💬 How do chats work?',
  '⭕ How do I add a story?',
  '✓ How do I get verified?',
  '💰 When is wallet launching?',
  '📊 What is Business Center?',
  '📱 How do I install the app?',
  '🔔 Why am I not getting notifications?',
];

// ── Message bubble ────────────────────────────────────────────────
const MessageBubble = ({ msg, onCopy, onRate }) => {
  const isAI = msg.role === 'assistant';
  const [rated, setRated] = useState(null);

  const formatText = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className={'flex items-end gap-2 mb-4 ' + (isAI ? 'flex-row' : 'flex-row-reverse') + ' fade-in'}>
      {isAI && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#1E6FFF]/30">
          <Sparkles size={14} className="text-white" />
        </div>
      )}

      <div className={'max-w-[82%] ' + (isAI ? '' : 'items-end flex flex-col')}>
        <div
          className={
            'px-4 py-3 rounded-2xl ' +
            (isAI
              ? 'bg-[#0d1f3c] border border-white/10 text-white/90 rounded-tl-sm'
              : 'bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] text-white rounded-tr-sm')
          }
        >
          {msg.file && (
            <div className="mb-2">
              {msg.fileType?.startsWith('image/') ? (
                <img src={msg.file} alt="uploaded" className="rounded-xl max-w-full max-h-48 object-cover" />
              ) : (
                <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                  <Paperclip size={14} />
                  <span className="text-xs truncate">{msg.fileName}</span>
                </div>
              )}
            </div>
          )}
          <p
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatText(msg.content) }}
          />
          <p className={'text-[10px] mt-1.5 ' + (isAI ? 'text-white/40' : 'text-white/60')}>
            {formatTime(msg.timestamp)}
          </p>
        </div>

        {/* AI message actions */}
        {isAI && (
          <div className="flex items-center gap-2 mt-1.5 px-1">
            <button
              onClick={() => onCopy(msg.content)}
              className="text-[#6B7280] hover:text-white transition-colors p-1"
              title="Copy"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => { setRated('up'); onRate(msg.id, 'up'); }}
              className={'transition-colors p-1 ' + (rated === 'up' ? 'text-[#2ECC71]' : 'text-[#6B7280] hover:text-[#2ECC71]')}
              title="Helpful"
            >
              <ThumbsUp size={12} />
            </button>
            <button
              onClick={() => { setRated('down'); onRate(msg.id, 'down'); }}
              className={'transition-colors p-1 ' + (rated === 'down' ? 'text-red-400' : 'text-[#6B7280] hover:text-red-400')}
              title="Not helpful"
            >
              <ThumbsDown size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Typing indicator ──────────────────────────────────────────────
const TypingIndicator = () => (
  <div className="flex items-end gap-2 mb-4 fade-in">
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#1E6FFF]/30">
      <Sparkles size={14} className="text-white" />
    </div>
    <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#1E6FFF]"
              style={{
                animation: 'bounce 1.2s infinite',
                animationDelay: i * 0.2 + 's',
              }}
            />
          ))}
        </div>
        <span className="text-[#6B7280] text-xs ml-1">Blinky is thinking...</span>
      </div>
    </div>
  </div>
);

// ── Main AI Page ──────────────────────────────────────────────────
const BLinkAI = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    loadOrCreateConversation();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadOrCreateConversation = async () => {
    const { data: existing } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.messages?.length > 0) {
      setConversationId(existing.id);
      setMessages(existing.messages);
      setIsFirstVisit(false);
      setShowSuggestions(false);
    } else {
      // First visit — show greeting
      const greeting = {
        id: Date.now().toString(),
        role: 'assistant',
        content: getGreeting(profile?.display_name),
        timestamp: new Date().toISOString(),
      };
      setMessages([greeting]);

      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          messages: [greeting],
        })
        .select()
        .single();

      if (newConv) setConversationId(newConv.id);
    }
  };

  const saveConversation = async (msgs) => {
    if (!conversationId) return;
    await supabase
      .from('ai_conversations')
      .update({
        messages: msgs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  };

  const sendMessage = useCallback(async (text = null) => {
    const messageText = text || input.trim();
    if (!messageText && !file) return;

    setShowSuggestions(false);

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText || '(sent a file)',
      timestamp: new Date().toISOString(),
      file: filePreview,
      fileName,
      fileType,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setFile(null);
    setFilePreview(null);
    setFileName('');
    setFileType('');
    setLoading(true);

    // Show thinking indicator after short delay
    await new Promise((r) => setTimeout(r, 300));
    setThinking(true);

    try {
      // Build conversation history for Claude API
      const history = newMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10) // last 10 messages for context
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: BLINK_KNOWLEDGE,
          messages: history,
        }),
      });

      const data = await response.json();
      const aiText = data.content?.[0]?.text || 'I\'m having trouble connecting right now. Please try again in a moment! 🙏';

      setThinking(false);

      // Simulate natural typing delay based on response length
      const typingDelay = Math.min(aiText.length * 8, 1500);
      await new Promise((r) => setTimeout(r, typingDelay));

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);
      saveConversation(finalMessages);

    } catch (err) {
      setThinking(false);
      const errMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Oops! I\'m having a moment 😅 My connection is a bit unstable right now. Please try again shortly. If this keeps happening, you can reach support at support@blink.africa',
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...newMessages, errMsg];
      setMessages(finalMessages);
      saveConversation(finalMessages);
    }

    setLoading(false);
  }, [input, file, filePreview, fileName, fileType, messages, conversationId]);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setFileName(selected.name);
    setFileType(selected.type);

    if (selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(selected);
    } else {
      setFilePreview(null);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text.replace(/<[^>]*>/g, ''));
  };

  const handleRate = (msgId, rating) => {
    // Could save to DB for improving AI
    console.log('Rated message:', msgId, rating);
  };

  const handleClearChat = async () => {
    if (!window.confirm('Clear this conversation? This cannot be undone.')) return;
    const greeting = {
      id: Date.now().toString(),
      role: 'assistant',
      content: getGreeting(profile?.display_name),
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
    setShowSuggestions(true);
    if (conversationId) {
      await supabase
        .from('ai_conversations')
        .update({ messages: [greeting], updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col bg-[#0A1628]" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-[#0d1f3c] border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white flex-shrink-0">
            <ArrowLeft size={22} />
          </button>

          {/* AI avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] flex items-center justify-center shadow-lg shadow-[#1E6FFF]/40">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#2ECC71] border-2 border-[#0d1f3c]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-white font-bold text-base">Blinky</h1>
              <span className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                AI
              </span>
            </div>
            <p className="text-[#2ECC71] text-xs">
              {thinking ? '✨ Thinking...' : '● Online — B-Link Assistant'}
            </p>
          </div>

          <button
            onClick={handleClearChat}
            className="text-[#6B7280] hover:text-white transition-colors p-2 flex-shrink-0"
            title="Clear conversation"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
        {/* AI info banner */}
        <div className="mb-4 bg-gradient-to-r from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles size={14} className="text-[#1E6FFF]" />
            <p className="text-white font-semibold text-xs">Powered by Claude AI</p>
            <Sparkles size={14} className="text-[#7B2FFF]" />
          </div>
          <p className="text-[#6B7280] text-[10px]">
            Blinky knows everything about B-Link and is here to help you 24/7
          </p>
        </div>

        {/* Messages list */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onCopy={handleCopy}
            onRate={handleRate}
          />
        ))}

        {/* Thinking indicator */}
        {thinking && <TypingIndicator />}

        {/* Quick suggestions */}
        {showSuggestions && messages.length <= 1 && !loading && (
          <div className="mt-4">
            <p className="text-[#6B7280] text-xs font-semibold text-center mb-3">
              💡 Try asking me...
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion.replace(/^[^\s]+\s/, ''))}
                  className="bg-white/5 border border-white/10 rounded-full px-3 py-2 text-xs text-white/80 hover:bg-[#1E6FFF]/20 hover:border-[#1E6FFF]/40 hover:text-white transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File preview */}
      {(file || filePreview) && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10 px-4 py-2">
          <div className="flex items-center gap-3">
            {filePreview ? (
              <img src={filePreview} alt="preview" className="w-12 h-12 rounded-xl object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Paperclip size={18} className="text-[#6B7280]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{fileName}</p>
              <p className="text-[#6B7280] text-[10px]">{fileType}</p>
            </div>
            <button
              onClick={() => { setFile(null); setFilePreview(null); setFileName(''); setFileType(''); }}
              className="text-[#6B7280] hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div
        className="flex-shrink-0 bg-[#0d1f3c] border-t border-white/10 px-3 py-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-end gap-2">
          {/* File attach */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 flex items-center justify-center text-[#6B7280] hover:text-[#1E6FFF] transition-colors rounded-full flex-shrink-0"
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Text input */}
          <div className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-2xl px-3 py-2.5 focus-within:border-[#1E6FFF]/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask Blinky anything about B-Link..."
              rows={1}
              className="w-full bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none resize-none leading-relaxed"
              style={{ minHeight: '22px', maxHeight: '100px', overflowY: 'auto', scrollbarWidth: 'none' }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !file)}
            className="w-10 h-10 bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shadow-lg shadow-[#1E6FFF]/30 flex-shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={15} className="text-white ml-0.5" />
            )}
          </button>
        </div>

        <p className="text-center text-[#6B7280] text-[10px] mt-2">
          Blinky can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
};

export default BLinkAI;