import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { sendNotification, sendCommentMentionNotifications } from '../../hooks/useNotifications';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, Heart, Send, MoreHorizontal,
  Trash2, ChevronLeft, ChevronRight,
  AtSign, Flag, UserX, X
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { PostDetailSkeleton } from '../../components/Skeleton';

const REACTIONS = [
  { emoji: '❤️', type: 'like' },
  { emoji: '😂', type: 'haha' },
  { emoji: '😮', type: 'wow' },
  { emoji: '😢', type: 'sad' },
  { emoji: '😡', type: 'angry' },
];

const COMMENT_EMOJIS = [
  '😀','😂','😍','🥰','😎','🤔','😢','😡','👍','❤️','🔥','🎉',
  '💯','🙏','😭','🤣','😊','🥳','😏','🤗','👏','💪','✌️','🤞',
  '🌍','🇰🇪','💃','🕺','🎵','🏆','💎','🚀','⭐','🌟','💫','✨',
];

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

// Facebook-style count display
const formatLikeText = (likers, total) => {
  if (total === 0) return null;
  if (likers.length === 0) return formatNumber(total) + ' reactions';
  if (likers.length === 1 && total === 1) return likers[0];
  if (likers.length === 1 && total > 1) return likers[0] + ' and ' + formatNumber(total - 1) + ' others';
  if (likers.length >= 2) return likers[0] + ', ' + likers[1] + (total > 2 ? ' and ' + formatNumber(total - 2) + ' others' : '');
  return formatNumber(total) + ' reactions';
};

const PostDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const commentInputRef = useRef();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reaction, setReaction] = useState(null);
  const [likesCount, setLikesCount] = useState(0);
  const [topLikers, setTopLikers] = useState([]);
  const [reactionBreakdown, setReactionBreakdown] = useState({});
  const [showReactions, setShowReactions] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const longPressTimer = useRef(null);

  useEffect(() => {
    fetchPost();
    fetchComments();
    checkLiked();
    fetchLikerNames();
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel('comments:' + id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: 'post_id=eq.' + id,
      }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id]);

  const fetchPost = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id, username, display_name, avatar_url, country, is_verified)')
      .eq('id', id)
      .single();
    setPost(data);
    setLikesCount(data?.likes_count || 0);
    setLoading(false);
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, users(id, username, display_name, avatar_url, is_verified, country)')
      .eq('post_id', id)
      .is('parent_id', null)
      .order('created_at', { ascending: true });
    setComments(data || []);
  };

  const fetchLikerNames = async () => {
    const { data } = await supabase
      .from('likes')
      .select('reaction_type, users:user_id(display_name)')
      .eq('post_id', id)
      .limit(3);

    if (data) {
      const names = data.map((l) => l.users?.display_name).filter(Boolean);
      setTopLikers(names);
      const breakdown = data.reduce((acc, l) => {
        acc[l.reaction_type] = (acc[l.reaction_type] || 0) + 1;
        return acc;
      }, {});
      setReactionBreakdown(breakdown);
    }
  };

  const checkLiked = async () => {
    const { data } = await supabase
      .from('likes')
      .select('reaction_type')
      .eq('post_id', id)
      .eq('user_id', user.id)
      .single();
    if (data) { setLiked(true); setReaction(data.reaction_type); }
  };

  const handleReaction = async (type) => {
    setShowReactions(false);
    if (liked && reaction === type) {
      setLiked(false); setReaction(null);
      setLikesCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete()
        .eq('post_id', id).eq('user_id', user.id);
      await supabase.from('posts')
        .update({ likes_count: Math.max(0, likesCount - 1) }).eq('id', id);
    } else {
      if (!liked) setLikesCount((c) => c + 1);
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert(
        { post_id: id, user_id: user.id, reaction_type: type },
        { onConflict: 'post_id,user_id' }
      );
      if (!liked) {
        await supabase.from('posts')
          .update({ likes_count: likesCount + 1 }).eq('id', id);
        const emoji = REACTIONS.find((r) => r.type === type)?.emoji || '❤️';
        await sendNotification({
          to: post?.users?.id, from: user.id,
          type: 'like',
          message: 'reacted ' + emoji + ' to your post',
          refId: id,
        });
      }
      fetchLikerNames();
    }
  };

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => setShowReactions(true), 500);
  };
  const handleLongPressEnd = () => clearTimeout(longPressTimer.current);

  const handleComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    setShowEmojiPicker(false);

    const { data } = await supabase
      .from('comments')
      .insert({
        post_id: id,
        user_id: user.id,
        body: comment.trim(),
        parent_id: replyTo?.id || null,
      })
      .select('*, users(id, username, display_name, avatar_url, is_verified, country)')
      .single();

    if (data) {
      if (!replyTo) setComments((prev) => [...prev, data]);
      await supabase.from('posts')
        .update({ comments_count: (post?.comments_count || 0) + 1 })
        .eq('id', id);

      await sendNotification({
        to: post?.users?.id, from: user.id,
        type: 'comment',
        message: 'commented: "' + comment.trim().slice(0, 50) + '"',
        refId: id,
      });

      if (replyTo && replyTo.user_id !== user.id) {
        await sendNotification({
          to: replyTo.user_id, from: user.id,
          type: 'comment',
          message: 'replied to your comment: "' + comment.trim().slice(0, 50) + '"',
          refId: id,
        });
      }

      await sendCommentMentionNotifications({
        body: comment.trim(), fromUserId: user.id, refId: id,
      });
    }

    setComment('');
    setReplyTo(null);
    setSubmitting(false);
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    await supabase.from('posts')
      .update({ comments_count: Math.max(0, (post?.comments_count || 1) - 1) })
      .eq('id', id);
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    navigate(-1);
  };

  const getCurrentReactionEmoji = () => REACTIONS.find((r) => r.type === reaction)?.emoji || null;

  if (loading) return <PostDetailSkeleton />;
  if (!post) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl mb-4">🔍</p>
        <p className="text-white font-bold text-lg">Post not found</p>
        <button onClick={() => navigate(-1)} className="text-[#1E6FFF] text-sm mt-2">Go back</button>
      </div>
    </div>
  );

  const author = post.users;
  const images = post.media_urls || [];
  const isOwner = author?.id === user?.id;
  const likeText = formatLikeText(topLikers, likesCount);

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24 flex flex-col fade-in">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-base">Post</h1>
        <div className="relative">
          <button onClick={() => setShowOptions(!showOptions)} className="text-[#6B7280] hover:text-white">
            <MoreHorizontal size={22} />
          </button>
          {showOptions && (
            <div className="absolute right-0 top-8 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-48 shadow-2xl">
              {isOwner ? (
                <button onClick={handleDeletePost} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
                  <Trash2 size={16} /> Delete Post
                </button>
              ) : (
                <>
                  <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                    <Flag size={16} /> Report Post
                  </button>
                  <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm">
                    <UserX size={16} /> Block @{author?.username}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Author */}
        <div className="flex items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/profile/' + author?.username)}>
            <Avatar url={author?.avatar_url} name={author?.display_name} size={12} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <button onClick={() => navigate('/profile/' + author?.username)} className="text-white font-bold text-base hover:underline">
                {author?.display_name}
              </button>
              {author?.is_verified && <span className="bg-[#1E6FFF] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              <span>{flagMap[author?.country] || '🌍'}</span>
            </div>
            <p className="text-[#6B7280] text-sm">@{author?.username} · {formatTime(post.created_at)}</p>
          </div>
          {!isOwner && (
            <button className="text-[#1E6FFF] border border-[#1E6FFF]/40 px-4 py-1.5 rounded-full text-sm font-bold hover:bg-[#1E6FFF]/10">
              + Follow
            </button>
          )}
        </div>

        {/* Caption */}
        {post.caption && (
          <div
            style={{ background: !images.length && post.bg_color ? post.bg_color : 'transparent' }}
            className={'text-sm leading-relaxed mb-3 ' +
              (!images.length && post.bg_color
                ? 'py-12 text-center text-white font-bold text-xl mx-4 rounded-2xl px-6'
                : 'px-4 text-white/90 text-base')}
          >
            {post.caption}
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.hashtags.map((tag) => (
                  <button key={tag} onClick={() => navigate('/hashtag/' + tag)} className="text-[#1E6FFF] text-sm font-medium hover:underline">
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className="relative mb-3">
            <div className="aspect-square overflow-hidden bg-[#111827]">
              <img src={images[imageIndex]} alt="post" className="w-full h-full object-cover" />
            </div>
            {images.length > 1 && (
              <>
                {imageIndex > 0 && (
                  <button onClick={() => setImageIndex((i) => i - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-2">
                    <ChevronLeft size={18} className="text-white" />
                  </button>
                )}
                {imageIndex < images.length - 1 && (
                  <button onClick={() => setImageIndex((i) => i + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-2">
                    <ChevronRight size={18} className="text-white" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setImageIndex(i)}
                      className={'rounded-full transition-all ' + (i === imageIndex ? 'bg-white w-4 h-1.5' : 'bg-white/40 w-1.5 h-1.5')} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="px-4 py-2 border-b border-white/5">
          <p className="text-[#6B7280] text-xs">
            {new Date(post.created_at).toLocaleString('en-KE', {
              weekday: 'short', year: 'numeric', month: 'short',
              day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
            {post.location && ' · 📍 ' + post.location}
          </p>
        </div>

        {/* Facebook-style reaction counts */}
        {likesCount > 0 && (
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Reaction emoji bubbles */}
                <div className="flex -space-x-1">
                  {Object.entries(reactionBreakdown).slice(0, 3).map(([type]) => {
                    const r = REACTIONS.find((rx) => rx.type === type);
                    return r ? (
                      <div key={type} className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-xs border border-[#0A1628]">
                        {r.emoji}
                      </div>
                    ) : null;
                  })}
                </div>
                <p className="text-white/70 text-sm">{likeText}</p>
              </div>
              <p className="text-[#6B7280] text-xs">
                {formatNumber(post.comments_count || 0)} comments
              </p>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center border-b border-white/5">
          <div className="flex-1 relative">
            {showReactions && (
              <div className="absolute -top-14 left-4 bg-[#111827] border border-white/10 rounded-full px-3 py-2.5 flex gap-3 z-20 shadow-2xl slide-up">
                {REACTIONS.map((r) => (
                  <button key={r.type} onClick={() => handleReaction(r.type)}
                    className="text-2xl hover:scale-125 transition-transform hover:-translate-y-1">
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => !liked ? handleReaction('like') : handleReaction(reaction)}
              onMouseDown={handleLongPressStart}
              onMouseUp={handleLongPressEnd}
              onTouchStart={handleLongPressStart}
              onTouchEnd={handleLongPressEnd}
              className={'flex items-center justify-center gap-2 py-3 w-full group ' + (liked ? 'text-red-400' : 'text-[#6B7280] hover:text-red-400')}
            >
              {liked && reaction ? (
                <span className="text-xl">{getCurrentReactionEmoji()}</span>
              ) : (
                <Heart size={20} />
              )}
              <span className="text-sm font-semibold">{liked ? 'Liked' : 'Like'}</span>
            </button>
          </div>

          <div className="w-px h-8 bg-white/10" />

          <button
            onClick={() => { commentInputRef.current?.focus(); setShowEmojiPicker(false); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-[#6B7280] hover:text-[#1E6FFF] transition-colors"
          >
            <span className="text-xl">💬</span>
            <span className="text-sm font-semibold">Comment</span>
          </button>

          <div className="w-px h-8 bg-white/10" />

          <button className="flex-1 flex items-center justify-center gap-2 py-3 text-[#6B7280] hover:text-[#2ECC71] transition-colors">
            <span className="text-xl">🔁</span>
            <span className="text-sm font-semibold">Repost</span>
          </button>

          <div className="w-px h-8 bg-white/10" />

          <button className="flex-1 flex items-center justify-center gap-2 py-3 text-[#6B7280] hover:text-[#00D4C8] transition-colors">
            <span className="text-xl">↗️</span>
            <span className="text-sm font-semibold">Share</span>
          </button>
        </div>

        {/* Comments */}
        <div className="px-4 pt-4">
          <h3 className="text-white font-bold text-base mb-4">
            Comments ({formatNumber(post.comments_count || 0)})
          </h3>
          {comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-white/60 text-sm">No comments yet. Be the first!</p>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 group fade-in">
                  <button onClick={() => navigate('/profile/' + c.users?.username)}>
                    <Avatar url={c.users?.avatar_url} name={c.users?.display_name} size={9} />
                  </button>
                  <div className="flex-1">
                    <div className="bg-white/5 rounded-2xl rounded-tl-none px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <button onClick={() => navigate('/profile/' + c.users?.username)} className="text-white font-bold text-sm hover:underline">
                          {c.users?.display_name}
                        </button>
                        {c.users?.is_verified && <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold">✓</span>}
                        <span className="text-sm">{flagMap[c.users?.country] || ''}</span>
                      </div>
                      <p className="text-white/80 text-sm leading-relaxed">{c.body}</p>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 px-2">
                      <span className="text-[#6B7280] text-xs">{formatTime(c.created_at)}</span>
                      <button
                        onClick={() => {
                          setReplyTo(c);
                          setComment('@' + c.users?.username + ' ');
                          commentInputRef.current?.focus();
                        }}
                        className="text-[#6B7280] text-xs font-semibold hover:text-[#1E6FFF]"
                      >
                        Reply
                      </button>
                      {c.user_id === user.id && (
                        <button onClick={() => handleDeleteComment(c.id)} className="text-[#6B7280] text-xs hover:text-red-400 opacity-0 group-hover:opacity-100">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Emoji picker for comments */}
      {showEmojiPicker && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10 px-3 py-2">
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {COMMENT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setComment((c) => c + emoji)}
                className="text-xl p-1 hover:scale-125 transition-transform rounded"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comment input */}
      <div className="sticky bottom-16 bg-[#0A1628]/95 backdrop-blur-md border-t border-white/10 px-4 py-3">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[#6B7280] text-xs">
              Replying to <span className="text-[#1E6FFF] font-semibold">@{replyTo.users?.username}</span>
            </p>
            <button onClick={() => { setReplyTo(null); setComment(''); }} className="text-[#6B7280] text-xs hover:text-white">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2.5">
            <input
              ref={commentInputRef}
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleComment()}
              placeholder={replyTo ? 'Reply to @' + replyTo.users?.username + '...' : 'Write a comment...'}
              className="flex-1 bg-transparent text-white placeholder-[#6B7280] text-sm focus:outline-none"
            />
            {/* Emoji toggle button — NOW ACTIVE */}
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={'transition-colors ' + (showEmojiPicker ? 'text-[#FFD700]' : 'text-[#6B7280] hover:text-[#FFD700]')}
            >
              😊
            </button>
            <button className="text-[#6B7280] hover:text-[#1E6FFF] transition-colors">
              <AtSign size={16} />
            </button>
          </div>
          <button
            onClick={handleComment}
            disabled={submitting || !comment.trim()}
            className="w-9 h-9 bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] rounded-full flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shadow-lg shadow-[#1E6FFF]/30"
          >
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;