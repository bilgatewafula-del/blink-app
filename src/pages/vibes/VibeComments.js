import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { X, Send, Heart, AtSign, Image as ImageIcon, Mic } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';

const EMOJI_TABS = [
  { label: '🔥', emojis: ['🔥','💯','🚀','⭐','💎','🏆','✨','💫','⚡','🎯'] },
  { label: '😂', emojis: ['😂','🤣','😭','😅','😆','😁','😊','🥳','😎','🤩'] },
  { label: '❤️', emojis: ['❤️','😍','🥰','💕','💖','💘','😘','🙏','👏','💪'] },
  { label: '🇰🇪', emojis: ['🇰🇪','🇳🇬','🇬🇭','🇿🇦','🇹🇿','🇺🇬','🌍','💃','🕺','🎵'] },
  { label: '👍', emojis: ['👍','👎','✌️','🤞','👌','🤙','🙌','👀','🤔','😮'] },
];

const STICKERS = ['🎉','🏆','💯','🔥','❤️','😂','👏','🙏','💪','🌟','🎶','💎'];

export default function VibeComments({ vibe, onClose }) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [showStickers, setShowStickers] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const [likedComments, setLikedComments] = useState(new Set());
  const inputRef = useRef();

  useEffect(() => {
    fetchComments();
    fetchUserLikes();
    const ch = supabase.channel('vc:' + vibe.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vibe_comments', filter: 'vibe_id=eq.' + vibe.id }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [vibe.id, sortBy]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from('vibe_comments')
      .select('*, users:user_id(id, username, display_name, avatar_url, is_verified)')
      .eq('vibe_id', vibe.id)
      .is('parent_id', null)
      .order(sortBy === 'top' ? 'likes_count' : 'created_at', { ascending: false })
      .limit(50);
    setComments(data || []);
    setLoading(false);
  };

  // Load which comments THIS user has already liked (1-per-person, persisted)
  const fetchUserLikes = async () => {
    const { data } = await supabase
      .from('vibe_comment_likes')
      .select('comment_id')
      .eq('user_id', user.id);
    if (data) setLikedComments(new Set(data.map((d) => d.comment_id)));
  };

  const handleSubmit = async (overrideText = null) => {
    const text = overrideText || comment.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const { data } = await supabase.from('vibe_comments').insert({
      vibe_id: vibe.id, user_id: user.id,
      body: text, parent_id: replyTo?.id || null,
    }).select('*, users:user_id(id,username,display_name,avatar_url,is_verified)').single();

    if (data) {
      setComments((prev) => [data, ...prev]);
      await supabase.from('vibes').update({ comments_count: (vibe.comments_count || 0) + 1 }).eq('id', vibe.id);

      // Notify the vibe owner
      if (vibe.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: vibe.user_id, from_user_id: user.id, type: 'comment',
          message: 'commented on your Vibe: "' + text.slice(0, 40) + '"',
          ref_id: vibe.id, is_read: false,
        });
      }
    }
    setComment(''); setReplyTo(null); setShowEmoji(false); setShowStickers(false); setSubmitting(false);
  };

  // 1 like per person — persisted via vibe_comment_likes table
  const handleLike = async (commentId, currentLikes) => {
    if (likedComments.has(commentId)) {
      const nl = Math.max(0, currentLikes - 1);
      await supabase.from('vibe_comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id);
      await supabase.from('vibe_comments').update({ likes_count: nl }).eq('id', commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likes_count: nl } : c));
      setLikedComments((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
    } else {
      const nl = currentLikes + 1;
      await supabase.from('vibe_comment_likes').insert({ comment_id: commentId, user_id: user.id });
      await supabase.from('vibe_comments').update({ likes_count: nl }).eq('id', commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likes_count: nl } : c));
      setLikedComments((prev) => new Set([...prev, commentId]));
    }
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '68dvh',
          background: 'rgba(10,22,40,0.98)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease-out',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', margin: '10px auto 4px', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: '8px 16px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>
            {formatNumber(vibe.comments_count || 0)} Comments
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', padding: '2px' }}>
              {['recent', 'top'].map((s) => (
                <button key={s} onClick={() => setSortBy(s)}
                  style={{
                    padding: '4px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 700,
                    background: sortBy === s ? '#1E6FFF' : 'transparent',
                    color: sortBy === s ? 'white' : 'rgba(255,255,255,0.5)',
                    border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                  {s}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Comments list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', scrollbarWidth: 'none' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <div style={{ width: '24px', height: '24px', border: '2px solid #FF6B35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <p style={{ fontSize: '40px', marginBottom: '8px' }}>💬</p>
              <p style={{ color: 'white', fontWeight: 700, fontSize: '15px' }}>No comments yet</p>
              <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>Be the first! Drop a comment 🔥</p>
            </div>
          ) : (
            comments.map((c) => {
              const isLiked = likedComments.has(c.id);
              return (
                <div key={c.id} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ flexShrink: 0 }}>
                    <Avatar url={c.users?.avatar_url} name={c.users?.display_name} size={9} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          {c.is_pinned && <span style={{ color: '#FFD700', fontSize: '10px', fontWeight: 700 }}>📌</span>}
                          <span style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>{c.users?.display_name}</span>
                          {c.users?.is_verified && <span style={{ background: '#1E6FFF', color: 'white', fontSize: '8px', padding: '1px 4px', borderRadius: '99px', fontWeight: 700 }}>✓</span>}
                          {c.user_id === vibe.user_id && <span style={{ background: 'rgba(255,107,53,0.2)', color: '#FF6B35', fontSize: '9px', padding: '1px 6px', borderRadius: '99px', fontWeight: 700 }}>Creator</span>}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.body}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
                          <span style={{ color: '#6B7280', fontSize: '11px' }}>{formatTime(c.created_at)}</span>
                          <button
                            onClick={() => { setReplyTo(c); setComment('@' + c.users?.username + ' '); inputRef.current?.focus(); }}
                            style={{ color: '#6B7280', fontSize: '11px', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                          >Reply</button>
                        </div>
                      </div>
                      <button
                        onClick={() => handleLike(c.id, c.likes_count || 0)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px' }}
                      >
                        <Heart size={17} style={{ color: isLiked ? '#EF4444' : '#6B7280', fill: isLiked ? '#EF4444' : 'none', transition: 'all 0.2s' }} />
                        {(c.likes_count || 0) > 0 && <span style={{ color: '#6B7280', fontSize: '10px' }}>{formatNumber(c.likes_count)}</span>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sticker row */}
        {showStickers && (
          <div style={{ flexShrink: 0, display: 'flex', gap: '8px', padding: '10px 16px', overflowX: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', scrollbarWidth: 'none' }}>
            {STICKERS.map((s) => (
              <button key={s} onClick={() => handleSubmit(s + s + s)}
                style={{ fontSize: '32px', flexShrink: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', cursor: 'pointer', padding: '8px 12px' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Emoji picker — tabs + grid */}
        {showEmoji && (
          <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: '4px', padding: '8px 16px 4px' }}>
              {EMOJI_TABS.map((tab, i) => (
                <button key={tab.label} onClick={() => setEmojiTab(i)}
                  style={{ fontSize: '18px', padding: '4px 8px', borderRadius: '8px', background: emojiTab === i ? 'rgba(255,107,53,0.2)' : 'none', border: 'none', cursor: 'pointer' }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '4px', padding: '4px 16px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {EMOJI_TABS[emojiTab].emojis.map((emoji) => (
                <button key={emoji}
                  onMouseDown={(e) => { e.preventDefault(); setComment((c) => c + emoji); }}
                  style={{ fontSize: '24px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reply banner */}
        {replyTo && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', background: 'rgba(30,111,255,0.1)', borderTop: '1px solid rgba(30,111,255,0.2)' }}>
            <div style={{ width: '2px', height: '32px', background: '#FF6B35', borderRadius: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#FF6B35', fontSize: '11px', fontWeight: 700 }}>Replying to @{replyTo.users?.username}</p>
              <p style={{ color: '#6B7280', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.body}</p>
            </div>
            <button onClick={() => { setReplyTo(null); setComment(''); }} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

       {/* ── Comment input — fixed, inline styles, always visible ── */}
        <div style={{
          flexShrink: 0,
          background: '#0d1f3c',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 10px',
          paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
          <div style={{ flexShrink: 0 }}>
            <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
          </div>

          {/* Sticker toggle */}
          <button
            onMouseDown={(e) => { e.preventDefault(); setShowStickers(!showStickers); setShowEmoji(false); }}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: showStickers ? '#FFD700' : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', padding: 0 }}
          >
            <ImageIcon size={17} />
          </button>

          <div style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '20px',
            padding: '8px 10px',
            minHeight: '38px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a comment..."
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px', fontFamily: 'inherit', width: '100%' }}
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); setShowEmoji(!showEmoji); setShowStickers(false); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', flexShrink: 0, color: showEmoji ? '#FFD700' : 'rgba(255,255,255,0.4)', padding: 0, lineHeight: 1 }}
            >😊</button>
          </div>

          <button
            onClick={() => handleSubmit()}
            disabled={submitting || !comment.trim()}
            style={{
              width: '38px', height: '38px', minWidth: '38px', borderRadius: '50%', flexShrink: 0,
              background: (submitting || !comment.trim()) ? 'rgba(255,107,53,0.4)' : 'linear-gradient(135deg, #FF6B35, #FFD700)',
              border: 'none', cursor: (submitting || !comment.trim()) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(255,107,53,0.4)',
              padding: 0,
            }}
          >
            <Send size={15} style={{ color: 'white', marginLeft: '1px' }} />
          </button>
        </div>
      </div>
    </div>
  );
}