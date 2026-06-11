import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { X, Send, Heart, AtSign } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';

const COMMENT_EMOJIS = [
  '🔥','❤️','😂','😍','👏','💯','🙏','😭','🤣','💃','⚽','🎵','✨','🌍','🇰🇪',
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
    const channel = supabase
      .channel('vibe_comments:' + vibe.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'vibe_comments',
        filter: 'vibe_id=eq.' + vibe.id,
      }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(channel);
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
    setComment('');
    setReplyTo(null);
    setShowEmoji(false);
    setSubmitting(false);
  };

  const handleLikeComment = async (commentId, currentLikes) => {
    await supabase.from('vibe_comments')
      .update({ likes_count: currentLikes + 1 })
      .eq('id', commentId);
    setComments((prev) =>
      prev.map((c) => c.id === commentId ? { ...c, likes_count: c.likes_count + 1 } : c)
    );
  };

  const handlePin = async (commentId) => {
    if (vibe.user_id !== user.id) return;
    await supabase.from('vibe_comments')
      .update({ is_pinned: true }).eq('id', commentId);
    fetchComments();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-[#0d1f3c]/98 backdrop-blur-xl rounded-t-3xl border-t border-white/20 flex flex-col slide-up"
        style={{ maxHeight: '75dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-bold text-lg">
              {formatNumber(vibe.comments_count || 0)} Comments
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Sort */}
            <div className="flex bg-white/10 rounded-full p-0.5">
              {['recent', 'top'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={'px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all ' + (sortBy === s ? 'bg-[#1E6FFF] text-white' : 'text-white/60')}
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-[#6B7280] hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Comments list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-2">💬</p>
              <p className="text-white font-bold text-base">No comments yet</p>
              <p className="text-[#6B7280] text-sm mt-1">Be the first to comment!</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={'flex gap-3 fade-in ' + (c.is_pinned ? 'bg-[#FFD700]/5 rounded-2xl p-2 border border-[#FFD700]/20' : '')}>
                <Avatar url={c.users?.avatar_url} name={c.users?.display_name} size={9} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {c.is_pinned && <span className="text-[#FFD700] text-[10px] font-bold">📌 Pinned</span>}
                        <span className="text-white font-bold text-sm">{c.users?.display_name}</span>
                        {c.users?.is_verified && (
                          <span className="bg-[#1E6FFF] text-white text-[8px] px-1 rounded-full">✓</span>
                        )}
                        {c.user_id === vibe.user_id && (
                          <span className="bg-[#FF6B35]/20 text-[#FF6B35] text-[9px] px-1.5 rounded-full font-bold">Creator</span>
                        )}
                      </div>
                      <p className="text-white/80 text-sm leading-relaxed">{c.body}</p>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-[#6B7280] text-xs">{formatTime(c.created_at)}</span>
                        <button
                          onClick={() => { setReplyTo(c); setComment('@' + c.users?.username + ' '); inputRef.current?.focus(); }}
                          className="text-[#6B7280] text-xs hover:text-[#1E6FFF] font-semibold"
                        >
                          Reply
                        </button>
                        {vibe.user_id === user.id && !c.is_pinned && (
                          <button
                            onClick={() => handlePin(c.id)}
                            className="text-[#6B7280] text-xs hover:text-[#FFD700]"
                          >
                            Pin
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLikeComment(c.id, c.likes_count || 0)}
                      className="flex flex-col items-center gap-0.5 flex-shrink-0"
                    >
                      <Heart size={16} className="text-[#6B7280] hover:text-red-400 transition-colors" />
                      {c.likes_count > 0 && (
                        <span className="text-[#6B7280] text-[10px]">{formatNumber(c.likes_count)}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

       {/* Input — always visible, above keyboard */}
<div
  className="flex-shrink-0 border-t border-white/10 bg-[#0d1f3c]"
  style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
>
  {/* Emoji quick pick */}
  {showEmoji && (
    <div
      className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-white/10"
      style={{ scrollbarWidth: 'none' }}
    >
      {COMMENT_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onMouseDown={(e) => {
            e.preventDefault();
            setComment((c) => c + emoji);
          }}
          className="text-2xl flex-shrink-0 hover:scale-125 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </div>
  )}

  {/* Reply banner */}
  {replyTo && (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#1E6FFF]/10 border-b border-[#1E6FFF]/20">
      <div className="w-0.5 h-8 bg-[#1E6FFF] rounded-full" />
      <div className="flex-1 min-w-0">
        <p className="text-[#1E6FFF] text-xs font-bold">
          Replying to @{replyTo.users?.username}
        </p>
        <p className="text-[#6B7280] text-xs truncate">
          {replyTo.body}
        </p>
      </div>
      <button
        onClick={() => {
          setReplyTo(null);
          setComment('');
        }}
        className="text-[#6B7280]"
      >
        <X size={14} />
      </button>
    </div>
  )}

  <div className="flex items-center gap-2 px-4 pt-3 pb-2">
    <Avatar
      url={profile?.avatar_url}
      name={profile?.display_name}
      size={9}
    />

    <div
      className="flex-1 flex items-center gap-2 border border-white/20 rounded-full px-4 py-2.5 focus-within:border-[#1E6FFF]/60 transition-colors"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Add a comment..."
        className="flex-1 bg-transparent text-white placeholder-white/40 text-sm focus:outline-none"
      />

      <button
        onMouseDown={(e) => {
          e.preventDefault();
          setShowEmoji(!showEmoji);
        }}
        className={
          'text-lg transition-colors ' +
          (showEmoji
            ? 'text-[#FFD700]'
            : 'text-white/40 hover:text-white/80')
        }
      >
        😊
      </button>

      <button className="text-white/40 hover:text-[#1E6FFF] transition-colors">
        <AtSign size={15} />
      </button>
    </div>

    <button
      onClick={handleSubmit}
      disabled={submitting || !comment.trim()}
      className="w-10 h-10 bg-gradient-to-br from-[#FF6B35] to-[#FFD700] rounded-full flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all shadow-lg"
    >
      <Send size={15} className="text-white" />
    </button>
  </div>
</div>

      </div>
    </div>
  );
};

export default VibeComments;