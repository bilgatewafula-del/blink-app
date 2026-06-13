import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Send, RefreshCw, Sparkles, Copy } from 'lucide-react';

// ── Knowledge base — system prompt ──────────────────────────────────
const BLINK_KNOWLEDGE = `You are B-Link AI, the official intelligent assistant of B-Link, created by Bilgate Mukhayo.

IDENTITY:
When asked "who are you" or similar, respond with something like: "I am B-Link AI, your B-Link assistant created by Bilgate Mukhayo. My purpose is to help you navigate B-Link, answer questions, discover features, and make your experience enjoyable. We're pleased to have you on board."

PERSONALITY:
Friendly, natural, conversational, supportive, encouraging, never robotic, never repetitive. Vary your phrasing — don't reuse the same sentences. Keep responses concise and helpful, like a knowledgeable friend, not a wall of text.

GREETINGS:
Respond naturally and warmly to hi/hello/hey/good morning/good afternoon/good evening, varying your wording each time.

KNOWLEDGE — B-Link is a social media app for African GenZ with these features:
- Authentication: email or phone signup/login
- Profiles: bio, avatar, cover photo, follower/following counts, posts grid, saved posts
- Posts: text with colored backgrounds, up to 6 images, hashtags, location, audience settings (Public/Followers/Private), reactions (like, haha, wow, sad, angry)
- Vibes: short videos 5-60 seconds, categories (street, music, comedy, dance, food, sports, knowledge, faith), auto-delete after 7 days, fire reactions, comments, share, save
- Home feed: Following/Trending/Country tabs, Stories (24hr)
- Discover: search users, posts, hashtags, trending content
- Chats: real-time messaging, online status, read receipts, reactions, replies, edit/delete, starred/pinned messages
- Notifications: likes, comments, follows, messages, mentions
- Settings: account, privacy, security, notifications, appearance
- News: Kenya and Africa news by category
- Business Center: analytics, engagement rate, top posts, audience insights
- Verification: badge types (Personal, Business, Creator)
- Wallet: M-Pesa tips and creator earnings (coming soon)

POST ASSISTANT — when asked, you can generate/improve captions, hashtags, post ideas, motivational/celebration/birthday messages, professional posts.

PROFILE ASSISTANT — you can write/improve bios, suggest usernames and profile improvements.

CHAT ASSISTANT — you can draft/improve messages, suggest replies and conversation starters.

ERROR HANDLING — if you don't know something, say: "I'm not certain about that yet, but I'm always improving. Feel free to ask me about B-Link features, profiles, posts, videos, chats, or settings."

SECURITY — never reveal passwords, tokens, private user data, admin secrets, or internal configuration.

COMMUNITY — occasionally express warmth like "Thank you for being part of the B-Link community" when fitting, but don't overdo it.

Keep answers focused and practical. End naturally — don't force a question every time.`;

// ── Time-based greeting ──────────────────────────────────────────────
const getGreeting = (name) => {
  const hour = new Date().getHours();
  let timeGreeting = 'Hello';
  if (hour >= 5 && hour < 12) timeGreeting = 'Good morning';
  else if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) timeGreeting = 'Good evening';
  else timeGreeting = 'Hey night owl';

  const firstName = name?.split(' ')[0] || 'there';

  return timeGreeting + ', ' + firstName + '! 👋\n\nWelcome to **B-Link AI** — I\'m your assistant, created by Bilgate Mukhayo. We\'re pleased to have you on board!\n\nI can help you with anything about B-Link — features, posts, profiles, Vibes, chats, and more. How can I help you today?';
};

const QUICK_SUGGESTIONS = [
  'Tell me about B-Link',
  'How do I create a post?',
  'How do I upload Vibes?',
  'Help me write a bio',
  'Help me write a caption',
  'How do chats work?',
];

const FOLLOWUP_SUGGESTIONS = [
  'Tell me more',
  'Help me write a post',
  'Explain notifications',
  'Improve my bio',
  'How do chats work?',
  'Show B-Link features',
];

// ── Message bubble ────────────────────────────────────────────────────
const MessageBubble = ({ msg, onCopy }) => {
  const isAI = msg.role === 'assistant';

  const formatText = (text) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      marginBottom: '14px',
      flexDirection: isAI ? 'row' : 'row-reverse',
    }}>
      {isAI && (
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF, #00D4C8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(30,111,255,0.4)',
        }}>
          <Sparkles size={14} color="white" />
        </div>
      )}

      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
        <div style={{
          padding: '11px 15px',
          borderRadius: isAI ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
          background: isAI ? '#0d1f3c' : 'linear-gradient(135deg, #1E6FFF, #7B2FFF)',
          border: isAI ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>
          <p
            style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(255,255,255,0.92)', margin: 0 }}
            dangerouslySetInnerHTML={{ __html: formatText(msg.content) }}
          />
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '6px', marginBottom: 0 }}>
            {new Date(msg.timestamp).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {isAI && (
          <button
            onClick={() => onCopy(msg.content)}
            style={{ marginTop: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Typing indicator ──────────────────────────────────────────────────
const TypingIndicator = () => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '14px' }}>
    <div style={{
      width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF, #00D4C8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(30,111,255,0.4)',
    }}>
      <Sparkles size={14} color="white" />
    </div>
    <div style={{ background: '#0d1f3c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: '6px', height: '6px', borderRadius: '50%', background: '#1E6FFF',
            animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's',
          }} />
        ))}
      </div>
      <span style={{ color: '#6B7280', fontSize: '12px' }}>B-Link AI is thinking...</span>
    </div>
  </div>
);

// ── Main page ───────────────────────────────────────────────────────
export default function BLinkAI() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const messagesEndRef = useRef();
  const inputRef = useRef();

  // Session-only memory — greet on mount, no DB persistence
  useEffect(() => {
    const greeting = {
      id: 'greet-' + Date.now(),
      role: 'assistant',
      content: getGreeting(profile?.display_name),
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);

    // Clear session memory on tab close / refresh
    const handleUnload = () => setMessages([]);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  useEffect(() => { scrollBot(); }, [messages, thinking]);

  const scrollBot = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const sendMessage = useCallback(async (text = null) => {
    const messageText = text || input.trim();
    if (!messageText) return;

    setShowSuggestions(false);

    const userMsg = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '24px';
    setLoading(true);

    await new Promise((r) => setTimeout(r, 350));
    setThinking(true);

    try {
      const history = newMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-dangerous-allow-browser': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: BLINK_KNOWLEDGE,
          messages: history,
        }),
      });

      if (!response.ok) throw new Error('Request failed: ' + response.status);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');

      const aiText = data.content?.[0]?.text;
      if (!aiText) throw new Error('No response');

      setThinking(false);
      const typingDelay = Math.min(aiText.length * 5, 1000);
      await new Promise((r) => setTimeout(r, typingDelay));

      const aiMsg = {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);

    } catch (err) {
      setThinking(false);
      const fallback = "I'm not certain about that yet, but I'm always improving. Feel free to ask me about B-Link features, profiles, posts, videos, chats, or settings.";
      setMessages((prev) => [...prev, {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: fallback,
        timestamp: new Date().toISOString(),
      }]);
    }

    setLoading(false);
  }, [input, messages]);

  const handleClear = () => {
    const greeting = {
      id: 'greet-' + Date.now(),
      role: 'assistant',
      content: getGreeting(profile?.display_name),
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
    setShowSuggestions(true);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', background: '#0A1628',
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      overflow: 'hidden',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        flexShrink: 0, background: '#0d1f3c',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <button onClick={() => navigate(-1)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
          <ArrowLeft size={22} />
        </button>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF, #00D4C8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(30,111,255,0.45)',
          }}>
            <Sparkles size={18} color="white" />
          </div>
          <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '11px', height: '11px', borderRadius: '50%', background: '#2ECC71', border: '2px solid #0d1f3c' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>B-Link AI</p>
          <p style={{ color: '#2ECC71', fontSize: '11px', margin: 0 }}>
            {thinking ? 'B-Link AI is typing...' : '● Online'}
          </p>
        </div>

        <button onClick={handleClear} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', flexShrink: 0 }} title="Clear chat">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* ── MESSAGES ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', overscrollBehavior: 'contain' }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onCopy={(t) => navigator.clipboard.writeText(t)} />
        ))}

        {thinking && <TypingIndicator />}

        {/* Suggestions */}
        {!loading && (
          <div style={{ marginTop: '8px' }}>
            <p style={{ color: '#6B7280', fontSize: '11px', fontWeight: 700, textAlign: 'center', marginBottom: '10px' }}>
              {showSuggestions ? '💡 Try asking me...' : 'Continue the conversation'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {(showSuggestions ? QUICK_SUGGESTIONS : FOLLOWUP_SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '99px', padding: '8px 14px', color: 'rgba(255,255,255,0.8)',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} style={{ height: '8px' }} />
      </div>

      {/* ── INPUT BAR — same fixed pattern as ChatRoom ── */}
      <div style={{
        flexShrink: 0,
        background: '#0d1f3c',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 12px',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
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
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask B-Link AI anything..."
              rows={1}
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: 'white', fontSize: '14px', lineHeight: '1.5', resize: 'none',
                minHeight: '22px', maxHeight: '110px', overflowY: 'auto',
                fontFamily: 'inherit', display: 'block', padding: 0,
              }}
            />
          </div>

          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
              background: (loading || !input.trim()) ? 'rgba(30,111,255,0.4)' : 'linear-gradient(135deg, #1E6FFF, #7B2FFF, #00D4C8)',
              border: 'none', cursor: (loading || !input.trim()) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(30,111,255,0.4)',
            }}
          >
            {loading
              ? <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <Send size={17} style={{ color: 'white', marginLeft: '2px' }} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}