import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { sendNotification } from '../hooks/useNotifications';
import { formatTime } from '../utils/formatTime';
import { formatNumber } from '../utils/formatNumber';
import { getThumbnailUrl } from '../lib/cloudinary';
import {
  Heart, MessageCircle, Repeat2, Bookmark,
  Share2, MoreHorizontal, MapPin,
  ChevronLeft, ChevronRight, Trash2,
  Flag, VolumeX, UserX, Link, AlertCircle,
  X, Send, Edit3, Forward
} from 'lucide-react';
import Avatar from './Avatar';

const REACTIONS = [
  { emoji: '❤️', type: 'like', label: 'Like' },
  { emoji: '😂', type: 'haha', label: 'Haha' },
  { emoji: '😮', type: 'wow', label: 'Wow' },
  { emoji: '😢', type: 'sad', label: 'Sad' },
  { emoji: '😡', type: 'angry', label: 'Angry' },
];

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

const PostCard = ({ post, currentUser, onRefresh }) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [reaction, setReaction] = useState(null);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [topLikers, setTopLikers] = useState([]);
  const [saved, setSaved] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post.reposts_count || 0);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteCaption, setQuoteCaption] = useState('');
  const [reposting, setReposting] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [heartPos, setHeartPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const optionsRef = useRef(null);
  const lastTapRef = useRef(0);

  const author = post.users;
  const images = post.media_urls || [];
  const caption = post.caption || '';
  const isLong = caption.length > 150;
  const isOwner = author?.id === currentUser?.id;

  useEffect(() => {
    checkLiked();
    checkSaved();
    checkFollowing();
    checkReposted();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkLiked = async () => {
    const { data } = await supabase
      .from('likes').select('reaction_type')
      .eq('post_id', post.id).eq('user_id', currentUser.id).single();
    if (data) { setLiked(true); setReaction(data.reaction_type); }
  };

  const checkSaved = async () => {
    const { data } = await supabase
      .from('saved_posts').select('id')
      .eq('post_id', post.id).eq('user_id', currentUser.id).single();
    if (data) setSaved(true);
  };
  
// Add this function after checkSaved
const fetchTopLikers = async () => {
  const { data } = await supabase
    .from('likes')
    .select('users:user_id(display_name)')
    .eq('post_id', post.id)
    .limit(2);
  if (data) setTopLikers(data.map((l) => l.users?.display_name).filter(Boolean));
};

// Call it in useEffect
useEffect(() => {
  checkLiked();
  checkSaved();
  checkFollowing();
  checkReposted();
  fetchTopLikers();
}, []);

  const checkFollowing = async () => {
    if (isOwner) return;
    const { data } = await supabase
      .from('follows').select('id')
      .eq('follower_id', currentUser.id).eq('following_id', author?.id).single();
    if (data) setIsFollowing(true);
  };

  const checkReposted = async () => {
    const { data } = await supabase
      .from('posts').select('id')
      .eq('user_id', currentUser.id).eq('quoted_post_id', post.id).single();
    if (data) setReposted(true);
  };

  const handleReaction = async (type) => {
    setShowReactions(false);
    if (liked && reaction === type) {
      setLiked(false); setReaction(null);
      setLikesCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete()
        .eq('post_id', post.id).eq('user_id', currentUser.id);
      await supabase.from('posts')
        .update({ likes_count: Math.max(0, likesCount - 1) }).eq('id', post.id);
    } else {
      if (!liked) setLikesCount((c) => c + 1);
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert(
        { post_id: post.id, user_id: currentUser.id, reaction_type: type },
        { onConflict: 'post_id,user_id' }
      );
      if (!liked) {
        await supabase.from('posts')
          .update({ likes_count: likesCount + 1 }).eq('id', post.id);
        const emoji = REACTIONS.find((r) => r.type === type)?.emoji || '❤️';
        await sendNotification({
          to: author?.id, from: currentUser.id, type: 'like',
          message: 'reacted ' + emoji + ' to your post', refId: post.id,
        });
      }
    }
  };

  // Double tap to like
  const handleDoubleTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!liked) handleReaction('like');
      setHeartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 700);
    }
    lastTapRef.current = now;
  };

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => setShowReactions(true), 500);
  };
  const handleLongPressEnd = () => clearTimeout(longPressTimer.current);

  const handleSave = async () => {
    if (saved) {
      setSaved(false);
      await supabase.from('saved_posts').delete()
        .eq('post_id', post.id).eq('user_id', currentUser.id);
    } else {
      setSaved(true);
      await supabase.from('saved_posts').insert({ post_id: post.id, user_id: currentUser.id });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    setDeleting(true);
    await supabase.from('posts').delete().eq('id', post.id);
    await supabase.from('users')
      .update({ post_count: Math.max(0, (author?.post_count || 1) - 1) })
      .eq('id', currentUser.id);
    setDeleted(true);
    if (onRefresh) onRefresh();
  };

  const handleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      setIsFollowing(false);
      await supabase.from('follows').delete()
        .eq('follower_id', currentUser.id).eq('following_id', author?.id);
    } else {
      setIsFollowing(true);
      await supabase.from('follows').insert({
        follower_id: currentUser.id, following_id: author?.id, status: 'accepted',
      });
      await sendNotification({
        to: author?.id, from: currentUser.id,
        type: 'follow', message: 'started following you',
      });
    }
    setFollowLoading(false);
  };

  const handleSilentRepost = async () => {
    setShowRepostMenu(false);
    if (reposted) {
      await supabase.from('posts').delete()
        .eq('user_id', currentUser.id).eq('quoted_post_id', post.id);
      setReposted(false);
      setRepostsCount((c) => Math.max(0, c - 1));
      await supabase.from('posts')
        .update({ reposts_count: Math.max(0, repostsCount - 1) }).eq('id', post.id);
      return;
    }
    setReposting(true);
    await supabase.from('posts').insert({
      user_id: currentUser.id, caption: post.caption,
      media_urls: post.media_urls, hashtags: post.hashtags,
      audience: 'public', quoted_post_id: post.id, is_draft: false,
    });
    setReposted(true);
    setRepostsCount((c) => c + 1);
    await supabase.from('posts')
      .update({ reposts_count: repostsCount + 1 }).eq('id', post.id);
    await sendNotification({
      to: author?.id, from: currentUser.id,
      type: 'repost', message: 'reposted your post', refId: post.id,
    });
    setReposting(false);
    if (onRefresh) onRefresh();
  };

  const handleQuoteRepost = async () => {
    if (!quoteCaption.trim()) return;
    setReposting(true);
    setShowQuoteModal(false);
    await supabase.from('posts').insert({
      user_id: currentUser.id, caption: quoteCaption.trim(),
      media_urls: [], hashtags: [], audience: 'public',
      quoted_post_id: post.id, is_draft: false,
    });
    setReposted(true);
    setRepostsCount((c) => c + 1);
    await supabase.from('posts')
      .update({ reposts_count: repostsCount + 1 }).eq('id', post.id);
    await sendNotification({
      to: author?.id, from: currentUser.id,
      type: 'repost', message: 'quote reposted your post', refId: post.id,
    });
    setQuoteCaption('');
    setReposting(false);
    if (onRefresh) onRefresh();
  };

  const handleShare = () => {
    const url = window.location.origin + '/post/' + post.id;
    if (navigator.share) {
      navigator.share({ title: 'B-Link Post', url });
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied!');
    }
  };

  const getCurrentReactionEmoji = () => {
    return REACTIONS.find((r) => r.type === reaction)?.emoji || null;
  };

  if (deleted) return null;

  return (
    <>
      <div className="bg-[#0A1628] border-b border-white/5 py-4 fade-in">
        {/* Header */}
        <div className="flex items-start justify-between px-4 mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/profile/' + author?.username)}>
              <Avatar url={author?.avatar_url} name={author?.display_name} size={10} />
            </button>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => navigate('/profile/' + author?.username)}
                  className="text-white font-bold text-sm hover:underline"
                >
                  {author?.display_name}
                </button>
                {author?.is_verified && (
                  <span className="bg-[#1E6FFF] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
                )}
                <span className="text-base">{flagMap[author?.country] || '🌍'}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[#6B7280] text-xs">@{author?.username}</p>
                <span className="text-[#6B7280] text-xs">·</span>
                <p className="text-[#6B7280] text-xs">{formatTime(post.created_at)}</p>
                {post.edited && <p className="text-[#6B7280] text-xs">· edited</p>}
                {post.location && (
                  <>
                    <span className="text-[#6B7280] text-xs">·</span>
                    <MapPin size={10} className="text-[#FF6B35]" />
                    <p className="text-[#6B7280] text-xs">{post.location}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOwner && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={
                  'text-xs border px-3 py-1 rounded-full font-semibold transition-all ' +
                  (isFollowing
                    ? 'border-white/20 text-white/60 bg-white/5'
                    : 'border-[#1E6FFF]/40 text-[#1E6FFF] hover:bg-[#1E6FFF]/10')
                }
              >
                {isFollowing ? 'Following' : '+ Follow'}
              </button>
            )}
            <div className="relative" ref={optionsRef}>
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="text-[#6B7280] hover:text-white transition-colors p-1"
              >
                <MoreHorizontal size={18} />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-8 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-48 shadow-2xl shadow-black/50">
                  {isOwner ? (
                    <>
                      <button
                        onClick={() => { navigate('/post/' + post.id + '/edit', { state: { post } }); setShowOptions(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                      >
                        <Edit3 size={16} /> Edit Post
                      </button>
                      <button
                        onClick={() => { handleDelete(); setShowOptions(false); }}
                        disabled={deleting}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm border-b border-white/5"
                      >
                        <Trash2 size={16} />
                        {deleting ? 'Deleting...' : 'Delete Post'}
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(window.location.origin + '/post/' + post.id); setShowOptions(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm"
                      >
                        <Link size={16} /> Copy Link
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                        <Link size={16} /> Copy Link
                      </button>
                      <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                        <VolumeX size={16} /> Mute @{author?.username}
                      </button>
                      <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                        <UserX size={16} /> Block @{author?.username}
                      </button>
                      <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                        <AlertCircle size={16} /> Not Interested
                      </button>
                      <button onClick={() => setShowOptions(false)} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
                        <Flag size={16} /> Report Post
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reposted indicator */}
        {post.quoted_post_id && (
          <div className="mx-4 mb-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2">
            <Repeat2 size={13} className="text-[#2ECC71]" />
            <p className="text-[#6B7280] text-xs">Reposted</p>
          </div>
        )}

        {/* Caption */}
        {caption && (
          <div
            style={{ background: !images.length && post.bg_color ? post.bg_color : 'transparent' }}
            className={
              'mb-3 text-sm leading-relaxed ' +
              (!images.length && post.bg_color
                ? 'py-12 text-center text-white font-bold text-lg mx-4 rounded-2xl px-4'
                : 'px-4 text-white/90')
            }
          >
            <span>{isLong && !expanded ? caption.slice(0, 150) : caption}</span>
            {isLong && (
              <button onClick={() => setExpanded(!expanded)} className="text-[#1E6FFF] text-xs ml-1 font-semibold">
                {expanded ? ' Show less' : '... more'}
              </button>
            )}
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.hashtags.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); navigate('/hashtag/' + tag); }}
                    className="text-[#1E6FFF] text-xs font-medium hover:underline"
                  >
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
            <div
              className="aspect-square overflow-hidden bg-[#111827] relative cursor-pointer"
              onClick={handleDoubleTap}
            >
              <img
                src={getThumbnailUrl ? getThumbnailUrl(images[imageIndex], 620) : images[imageIndex]}
                alt="post"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {showHeart && (
                <span
                  className="heart-burst"
                  style={{ left: heartPos.x, top: heartPos.y }}
                >
                  ❤️
                </span>
              )}
            </div>
            {images.length > 1 && (
              <>
                {imageIndex > 0 && (
                  <button
                    onClick={() => setImageIndex((i) => i - 1)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm rounded-full p-2 shadow-lg"
                  >
                    <ChevronLeft size={16} className="text-white" />
                  </button>
                )}
                {imageIndex < images.length - 1 && (
                  <button
                    onClick={() => setImageIndex((i) => i + 1)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm rounded-full p-2 shadow-lg"
                  >
                    <ChevronRight size={16} className="text-white" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImageIndex(i)}
                      className={'rounded-full transition-all ' + (i === imageIndex ? 'bg-white w-4 h-1.5' : 'bg-white/40 w-1.5 h-1.5')}
                    />
                  ))}
                </div>
                <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                  <span className="text-white text-xs font-semibold">{imageIndex + 1}/{images.length}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Reaction bar */}
        <div className="flex items-center justify-between px-4 mt-2">
          <div className="flex items-center gap-5">
            {/* Like */}
            <div className="relative">
              {showReactions && (
                <div className="absolute -top-14 left-0 bg-[#111827] border border-white/10 rounded-full px-3 py-2.5 flex gap-3 z-20 shadow-2xl shadow-black/50 slide-up">
                  {REACTIONS.map((r) => (
                    <button
                      key={r.type}
                      onClick={() => handleReaction(r.type)}
                      className="text-2xl hover:scale-125 transition-transform duration-150 hover:-translate-y-1"
                      title={r.label}
                    >
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
                className="flex items-center gap-1.5 group"
              >
                {liked && reaction ? (
                  <span className="text-xl leading-none like-pop">{getCurrentReactionEmoji()}</span>
                ) : (
                  <Heart size={21} className="text-[#6B7280] group-hover:text-red-400 transition-colors" />
                )}
                <span className={'text-xs font-medium ' + (liked ? 'text-red-400' : 'text-[#6B7280]')}>
                  {formatNumber(likesCount)}
                </span>
              </button>
            </div>

            {/* Comment */}
            <button onClick={() => navigate('/post/' + post.id)} className="flex items-center gap-1.5 group">
              <MessageCircle size={21} className="text-[#6B7280] group-hover:text-[#1E6FFF] transition-colors" />
              <span className="text-[#6B7280] text-xs font-medium">{formatNumber(post.comments_count || 0)}</span>
            </button>

            {/* Repost */}
            <div className="relative">
              <button
                onClick={() => setShowRepostMenu(!showRepostMenu)}
                className="flex items-center gap-1.5 group"
              >
                <Repeat2
                  size={21}
                  className={'transition-colors ' + (reposted ? 'text-[#2ECC71]' : 'text-[#6B7280] group-hover:text-[#2ECC71]')}
                />
                <span className={'text-xs font-medium ' + (reposted ? 'text-[#2ECC71]' : 'text-[#6B7280]')}>
                  {formatNumber(repostsCount)}
                </span>
              </button>
              {showRepostMenu && (
                <div className="absolute bottom-8 left-0 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-20 w-44 shadow-2xl slide-up">
                  <button
                    onClick={handleSilentRepost}
                    disabled={reposting}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"
                  >
                    <Repeat2 size={16} className="text-[#2ECC71]" />
                    {reposted ? 'Undo Repost' : 'Repost'}
                  </button>
                  <button
                    onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm"
                  >
                    <MessageCircle size={16} className="text-[#1E6FFF]" />
                    Quote Repost
                  </button>
                </div>
              )}
            </div>

            {/* Share */}
            <button onClick={handleShare} className="group">
              <Share2 size={21} className="text-[#6B7280] group-hover:text-[#00D4C8] transition-colors" />
            </button>
          </div>

          {/* Bookmark */}
          <button onClick={handleSave} className="group">
            <Bookmark
              size={21}
              className={'transition-colors ' + (saved ? 'text-[#FFD700] fill-[#FFD700]' : 'text-[#6B7280] group-hover:text-[#FFD700]')}
            />
          </button>
        </div>

{/* Facebook-style likes + comments summary */}
{(likesCount > 0 || post.comments_count > 0) && (
  <div className="px-4 mt-2 flex items-center justify-between">
    {likesCount > 0 && (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-0.5">
          {Object.values(
            (post.reaction_breakdown || { like: 1 })
          ).length > 0 && ['❤️','😂','😮'].slice(0, 2).map((e, i) => (
            <div key={i} className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[9px] border border-[#0A1628]">
              {e}
            </div>
          ))}
        </div>
        <p className="text-white/60 text-xs">
          {topLikers.length > 0
            ? topLikers[0] + (likesCount > 1 ? ' and ' + formatNumber(likesCount - 1) + ' others' : '')
            : formatNumber(likesCount) + ' reactions'}
        </p>
      </div>
    )}
    {post.comments_count > 0 && (
      <button onClick={() => navigate('/post/' + post.id)} className="text-[#6B7280] text-xs hover:text-white transition-colors">
        {formatNumber(post.comments_count)} comments
      </button>
    )}
  </div>
)}
      </div>

      {/* Quote Repost Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">Quote Repost</h2>
              <button onClick={() => setShowQuoteModal(false)}>
                <X size={22} className="text-[#6B7280]" />
              </button>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Avatar url={author?.avatar_url} name={author?.display_name} size={8} />
                <p className="text-white font-semibold text-sm">{author?.display_name}</p>
                <p className="text-[#6B7280] text-xs">@{author?.username}</p>
              </div>
              <p className="text-white/70 text-sm line-clamp-2">{caption}</p>
              {images.length > 0 && (
                <img src={images[0]} alt="" className="w-full h-24 object-cover rounded-xl mt-2" />
              )}
            </div>
            <textarea
              value={quoteCaption}
              onChange={(e) => setQuoteCaption(e.target.value)}
              placeholder="Add your thoughts..."
              rows={3}
              maxLength={500}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] resize-none mb-3"
            />
            <div className="flex items-center justify-between">
              <p className="text-[#6B7280] text-xs">{quoteCaption.length}/500</p>
              <button
                onClick={handleQuoteRepost}
                disabled={reposting || !quoteCaption.trim()}
                className="flex items-center gap-2 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-50"
              >
                <Send size={16} />
                {reposting ? 'Posting...' : 'Repost'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PostCard;