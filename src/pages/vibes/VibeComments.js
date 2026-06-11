import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { X, Send, Heart, AtSign, ChevronUp, ChevronDown } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';

const COMMENT_EMOJIS = [
  '🔥','❤️','😂','😍','👏','💯','🙏','😭','🤣','💃',
  '⚽','🎵','✨','🌍','🇰🇪','😊','🥳','💪','🤩','👌',
];

const VibeComments = ({ vibe, onClose }) => {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const inputRef = useRef();
  const listRef = useRef();

  useEffect(() => {
    fetchComments();
    // Auto focus input after mount
    setTimeout(() => inputRef.current?.focus(), 400);

    const channel = supabase
      .channel('vibe_comments:' + vibe.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'vibe_comments',
        filter: 'vibe_id=eq.' + vibe.id,
      }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [vibe.id]);

  useEffect(() => {
    fetchComments();
  }, [sortBy]);

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

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    await supabase.from('vibe_comments').insert({
      vibe_id: vibe.id,
      user_id: user.id,
      body: comment.trim(),
      parent_id: replyTo?.id || null,
    });
    await supabase.from('vibes')
      .update({ comments_count: (vibe.comments_count || 0) + 1 })
      .eq('id', vibe.id);
    if (vibe.user_id !== user.id) {
      await supabase.from('notifications').insert({
        user_id: vibe.user_id,
        from_user_id: user.id,
        type: 'comment',
        message: 'commented on your Vibe: "' + comment.trim().slice(0, 40) + '"',
        is_read: false,
      });
    }
    setComment('');
    setReplyTo(null);
    setShowEmoji(false);
    setSubmitting(false);
    inputRef.current?.focus();
  };

  const handleLikeComment = async (commentId, currentLikes) => {
    await supabase.from('vibe_comments')
      .update({ likes_count: currentLikes + 1 })
      .eq('id', commentId);
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likes_count: c.likes_count + 1 } : c)
    );
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from('vibe_comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  return (
    // Full overlay — positioned to avoid bottom tabs
    <div
      className="absolute inset-x-0 z-40 flex flex-col"
      style={{
        top: 0,
        bottom: 0,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Transparent tap-to-close area above panel */}
      <div
        className="flex-shrink-0"
        style={{ height: '30%' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="flex flex-col rounded-t-3xl overflow-hidden slide-up"
        style={{
          flex: 1,
          background: 'rgba(13, 31, 60, 0.98)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          // Critical: ensure it's above bottom tabs
          paddingBottom: 'max(72px, calc(64px + env(safe-area-inset-bottom)))',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-bold text-base">
              {formatNumber(vibe.comments_count || 0)} Comments
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort toggle */}
            <div className="flex bg-white/10 rounded-full p-0.5">
              {['recent', 'top'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={
                    'px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all ' +
                    (sortBy === s ? 'bg-[#FF6B35] text-white' : 'text-white/60')
                  }
                >
                  {s === 'recent' ? '🕐 New' : '🔥 Top'}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#6B7280] hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Comments list — scrollable */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{ overscrollBehavior: 'contain' }}
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-white font-bold text-base">No comments yet</p>
              <p className="text-[#6B7280] text-sm mt-1">Be the first! Drop a comment 🔥</p>
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={'flex gap-3 mb-4 fade-in ' + (c.is_pinned ? 'bg-[#FFD700]/5 rounded-2xl p-2 border border-[#FFD700]/20' : '')}
              >
                <Avatar url={c.users?.avatar_url} name={c.users?.display_name} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {c.is_pinned && (
                          <span className="text-[#FFD700] text-[10px] font-bold">📌</span>
                        )}
                        <span className="text-white font-bold text-sm">{c.users?.display_name}</span>
                        {c.users?.is_verified && (
                          <span className="bg-[#1E6FFF] text-white text-[8px] px-1 rounded-full font-bold">✓</span>
                        )}
                        {c.user_id === vibe.user_id && (
                          <span className="bg-[#FF6B35]/20 text-[#FF6B35] text-[9px] px-1.5 rounded-full font-bold">
                            Creator
                          </span>
                        )}
                      </div>
                      <p className="text-white/85 text-sm leading-relaxed">{c.body}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[#6B7280] text-xs">{formatTime(c.created_at)}</span>
                        <button
                          onClick={() => {
                            setReplyTo(c);
                            setComment('@' + c.users?.username + ' ');
                            inputRef.current?.focus();
                          }}
                          className="text-[#6B7280] text-xs font-semibold hover:text-[#FF6B35] transition-colors"
                        >
                          Reply
                        </button>
                        {c.user_id === user.id && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-[#6B7280] text-xs hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Like button */}
                    <button
                      onClick={() => handleLikeComment(c.id, c.likes_count || 0)}
                      className="flex flex-col items-center gap-0.5 flex-shrink-0 ml-2"
                    >
                      <Heart size={16} className="text-[#6B7280] hover:text-red-400 transition-colors" />
                      {(c.likes_count || 0) > 0 && (
                        <span className="text-[#6B7280] text-[10px]">{formatNumber(c.likes_count)}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── COMMENT INPUT — always at bottom of panel ── */}
        <div className="flex-shrink-0 border-t border-white/10">
          {/* Emoji strip */}
          {showEmoji && (
            <div
              className="flex gap-2 px-4 py-2 overflow-x-auto bg-black/20"
              style={{ scrollbarWidth: 'none' }}
            >
              {COMMENT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setComment((c) => c + emoji);
                    inputRef.current?.focus();
                  }}
                  className="text-2xl flex-shrink-0 active:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Reply banner */}
          {replyTo && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[#FF6B35]/10 border-b border-[#FF6B35]/20">
              <div className="w-0.5 h-8 bg-[#FF6B35] rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-[#FF6B35] text-xs font-bold">
                  Replying to @{replyTo.users?.username}
                </p>
                <p className="text-[#6B7280] text-xs truncate">{replyTo.body}</p>
              </div>
              <button
                onClick={() => { setReplyTo(null); setComment(''); }}
                className="text-[#6B7280] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2 px-4 py-3">
            <Avatar url={profile?.avatar_url} name={profile?.display_name} size={8} />

            <div
              className="flex-1 flex items-center gap-2 rounded-full px-4 py-2.5 border border-white/20 focus-within:border-[#FF6B35]/60 transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
                }}
                placeholder="Add a comment..."
                className="flex-1 bg-transparent text-white placeholder-white/40 text-sm focus:outline-none"
              />
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowEmoji(!showEmoji);
                  inputRef.current?.focus();
                }}
                className={'text-lg transition-colors flex-shrink-0 ' +
                  (showEmoji ? 'text-[#FFD700]' : 'text-white/40 hover:text-white/80')}
              >
                😊
              </button>
              <button className="text-white/40 hover:text-[#FF6B35] transition-colors flex-shrink-0">
                <AtSign size={15} />
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !comment.trim()}
              className="w-10 h-10 bg-gradient-to-br from-[#FF6B35] to-[#FFD700] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all shadow-lg flex-shrink-0"
            >
              {submitting
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Send size={15} className="text-white" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VibeComments;