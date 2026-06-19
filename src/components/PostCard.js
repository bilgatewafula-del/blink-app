import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../utils/formatTime';
import { formatNumber } from '../utils/formatNumber';
import {
  Heart, MessageCircle, Repeat2, Share2,
  MoreHorizontal, Bookmark, BarChart2,
  Trash2, Flag, UserX, Volume2, VolumeX,
  Play, Quote, X,
} from 'lucide-react';
import Avatar from './Avatar';

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

const REACTIONS = [
  { emoji: '❤️', type: 'like',  color: '#EF4444' },
  { emoji: '😂', type: 'haha',  color: '#FFD700' },
  { emoji: '😮', type: 'wow',   color: '#FF6B35' },
  { emoji: '😢', type: 'sad',   color: '#6B7280' },
  { emoji: '😡', type: 'angry', color: '#EF4444' },
  { emoji: '🔥', type: 'fire',  color: '#FF6B35' },
];

/* ── Rich text: clickable #hashtag and @mention ─── */
function RichCaption({ text, onHashtag, onMention }) {
  if (!text) return null;
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <p className="text-white/90 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.startsWith('#'))
          return <button key={i} onClick={(e) => { e.stopPropagation(); onHashtag(p.slice(1)); }} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@'))
          return <button key={i} onClick={(e) => { e.stopPropagation(); onMention(p.slice(1)); }} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

/* ── Twitter image grid ─────────────────────────── */
function MediaGrid({ images }) {
  if (!images?.length) return null;
  const n = images.length;
  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/10">
      {n === 1 && <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight: 420 }} loading="lazy" />}
      {n === 2 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.map((img, i) => <img key={i} src={img} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} loading="lazy" />)}
        </div>
      )}
      {n === 3 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
          <img src={images[0]} alt="" className="row-span-2 w-full h-full object-cover" style={{ aspectRatio: '1/2' }} loading="lazy" />
          <img src={images[1]} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} loading="lazy" />
          <img src={images[2]} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} loading="lazy" />
        </div>
      )}
      {n >= 4 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.slice(0, 4).map((img, i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} loading="lazy" />
              {i === 3 && n > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">+{n - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Quoted post card (rendered inside a repost) ── */
function QuotedPost({ quotedPost, navigate }) {
  if (!quotedPost) return null;
  const a = quotedPost.users;
  const imgs = quotedPost.media_urls || [];
  return (
    <div
      className="border border-white/15 rounded-2xl p-3 mb-2 bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors"
      onClick={(e) => { e.stopPropagation(); navigate('/post/' + quotedPost.id); }}
    >
      {/* Author row */}
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        {a?.avatar_url
          ? <img src={a.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
          : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">{a?.display_name?.[0]?.toUpperCase()}</div>
        }
        <span className="text-white font-bold text-[13px] truncate max-w-[100px]">{a?.display_name}</span>
        {a?.is_verified && <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold">✓</span>}
        <span className="text-[#6B7280] text-[12px]">@{a?.username}</span>
        <span className="text-[#6B7280] text-[12px]">· {formatTime(quotedPost.created_at)}</span>
      </div>
      {/* Caption */}
      {quotedPost.caption && (
        <p className="text-white/75 text-[13px] leading-snug line-clamp-3 mb-1">{quotedPost.caption}</p>
      )}
      {/* Media preview (first image only) */}
      {imgs.length > 0 && (
        <img src={imgs[0]} alt="" className="w-full object-cover rounded-xl" style={{ maxHeight: 160 }} loading="lazy" />
      )}
      {quotedPost.video_url && !imgs.length && (
        <div className="w-full bg-black rounded-xl flex items-center justify-center" style={{ height: 80 }}>
          <Play size={22} color="white" fill="white" />
          <span className="text-white text-xs ml-2">Video</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN POSTCARD
══════════════════════════════════════════════════ */
export default function PostCard({ post, currentUser, onRefresh }) {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const videoRef       = useRef();
  const longPressTimer = useRef();

  const [liked,       setLiked]      = useState(false);
  const [reaction,    setReaction]   = useState(null);
  const [likesCount,  setLikesCount] = useState(post.likes_count || 0);
  const [saved,       setSaved]      = useState(false);
  const [reposted,    setReposted]   = useState(false);
  const [repostCount, setRepostCount]= useState(post.reposts_count || 0);

  // UI state
  const [showMenu,           setShowMenu]           = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRepostMenu,     setShowRepostMenu]     = useState(false);
  const [showQuoteModal,     setShowQuoteModal]     = useState(false);
  const [quoteText,          setQuoteText]          = useState('');
  const [quotedPost,         setQuotedPost]         = useState(null);
  const [muted,              setMuted]              = useState(true);
  const [playing,            setPlaying]            = useState(false);

  const uid     = currentUser?.id || user?.id;
  const author  = post.users;
  const isOwner = author?.id === uid;
  const images  = post.media_urls || [];
  // If this post is itself a repost, load the quoted post
  const isRepost = post.is_repost && post.quoted_post_id;

  useEffect(() => {
    checkLiked();
    checkSaved();
    checkReposted();
    if (isRepost) fetchQuotedPost();
  }, [post.id]);

  const fetchQuotedPost = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id,username,display_name,avatar_url,is_verified)')
      .eq('id', post.quoted_post_id)
      .maybeSingle();
    if (data) setQuotedPost(data);
  };

  const checkLiked = async () => {
    const { data } = await supabase.from('likes').select('reaction_type')
      .eq('post_id', post.id).eq('user_id', uid).maybeSingle();
    if (data) { setLiked(true); setReaction(data.reaction_type); }
  };

  const checkSaved = async () => {
    const { data } = await supabase.from('saved_posts').select('id')
      .eq('post_id', post.id).eq('user_id', uid).maybeSingle();
    if (data) setSaved(true);
  };

  const checkReposted = async () => {
    const { data } = await supabase.from('posts').select('id')
      .eq('user_id', uid).eq('quoted_post_id', post.id).maybeSingle();
    if (data) setReposted(true);
  };

  /* ── Like / Reaction ─────────────────────────── */
  const handleLike = async (type = 'like') => {
    setShowReactionPicker(false);
    if (liked && reaction === type) {
      setLiked(false); setReaction(null);
      setLikesCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', uid);
      await supabase.from('posts').update({ likes_count: Math.max(0, likesCount - 1) }).eq('id', post.id);
    } else {
      if (!liked) {
        setLikesCount((c) => c + 1);
        await supabase.from('posts').update({ likes_count: likesCount + 1 }).eq('id', post.id);
        if (author?.id !== uid) {
          await supabase.from('notifications').insert({
            user_id: author?.id, from_user_id: uid, type: 'like',
            message: 'liked your post', ref_id: post.id, is_read: false,
          });
        }
      }
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert(
        { post_id: post.id, user_id: uid, reaction_type: type },
        { onConflict: 'post_id,user_id' }
      );
    }
  };

  /* ── Repost (direct — no quote) ─────────────── */
  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    if (reposted) {
      // Undo repost
      setReposted(false);
      setRepostCount((c) => Math.max(0, c - 1));
      await supabase.from('posts').delete().eq('user_id', uid).eq('quoted_post_id', post.id).eq('is_repost', true);
      await supabase.from('posts').update({ reposts_count: Math.max(0, repostCount - 1) }).eq('id', post.id);
    } else {
      setReposted(true);
      setRepostCount((c) => c + 1);
      await supabase.from('posts').insert({
        user_id: uid, caption: '', quoted_post_id: post.id,
        audience: 'public', is_draft: false, is_repost: true,
      });
      await supabase.from('posts').update({ reposts_count: repostCount + 1 }).eq('id', post.id);
      if (author?.id !== uid) {
        await supabase.from('notifications').insert({
          user_id: author?.id, from_user_id: uid, type: 'repost',
          message: 'reposted your post', ref_id: post.id, is_read: false,
        });
      }
    }
  };

  /* ── Quote post ─────────────────────────────── */
  const handleQuotePost = async () => {
    if (!quoteText.trim()) return;
    setShowQuoteModal(false);
    await supabase.from('posts').insert({
      user_id: uid,
      caption: quoteText.trim(),
      quoted_post_id: post.id,
      audience: 'public',
      is_draft: false,
      is_repost: false,
    });
    await supabase.from('posts').update({ reposts_count: repostCount + 1 }).eq('id', post.id);
    setRepostCount((c) => c + 1);
    setQuoteText('');
    if (author?.id !== uid) {
      await supabase.from('notifications').insert({
        user_id: author?.id, from_user_id: uid, type: 'repost',
        message: 'quoted your post', ref_id: post.id, is_read: false,
      });
    }
  };

  /* ── Save ───────────────────────────────────── */
  const handleSave = async (e) => {
    e.stopPropagation();
    if (saved) {
      setSaved(false);
      await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', uid);
    } else {
      setSaved(true);
      await supabase.from('saved_posts').upsert(
        { post_id: post.id, user_id: uid, collection: 'Saved Posts' },
        { onConflict: 'post_id,user_id' }
      );
    }
  };

  /* ── Share ──────────────────────────────────── */
  const handleShare = async (e) => {
    e.stopPropagation();
    const url = window.location.origin + '/post/' + post.id;
    if (navigator.share) { navigator.share({ title: 'Check this on B-Link', url }); }
    else { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    await supabase.from('posts').update({ shares_count: (post.shares_count || 0) + 1 }).eq('id', post.id);
  };

  /* ── Delete ─────────────────────────────────── */
  const handleDelete = async () => {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', post.id);
    if (onRefresh) onRefresh();
  };

  /* ── Video ──────────────────────────────────── */
  const toggleVideo = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else         { v.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const getReactionEmoji = () => REACTIONS.find((r) => r.type === reaction)?.emoji || null;
  const getReactionColor = () => REACTIONS.find((r) => r.type === reaction)?.color || '#6B7280';

  return (
    <>
      {/* ── QUOTE MODAL ── */}
      {showQuoteModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center"
          onClick={() => setShowQuoteModal(false)}
        >
          <div
            className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowQuoteModal(false)} className="text-[#6B7280] hover:text-white">
                <X size={20} />
              </button>
              <h3 className="text-white font-bold">Quote Post</h3>
              <button
                onClick={handleQuotePost}
                disabled={!quoteText.trim()}
                className="bg-[#1E6FFF] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40 hover:bg-[#1565cc] transition-colors"
              >
                Post
              </button>
            </div>

            {/* Input */}
            <textarea
              autoFocus
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="Add a comment..."
              maxLength={500}
              rows={3}
              className="w-full bg-transparent text-white text-[16px] placeholder-[#6B7280] focus:outline-none resize-none leading-relaxed mb-3"
            />

            {/* Quoted post preview inside modal */}
            <div className="border border-white/15 rounded-2xl p-3 bg-white/[0.03]">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="text-white font-bold text-[13px]">{author?.display_name}</span>
                <span className="text-[#6B7280] text-[12px]">@{author?.username}</span>
              </div>
              {post.caption && (
                <p className="text-white/70 text-[13px] leading-snug line-clamp-2">{post.caption}</p>
              )}
              {images.length > 0 && (
                <img src={images[0]} alt="" className="w-full object-cover rounded-xl mt-2" style={{ maxHeight: 100 }} />
              )}
            </div>

            {/* Char counter */}
            <div className="flex justify-end mt-2">
              <span className={`text-xs ${quoteText.length > 450 ? 'text-orange-400' : 'text-[#6B7280]'}`}>
                {quoteText.length}/500
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CARD ── */}
      <div
        className="border-b border-white/[0.07] hover:bg-white/[0.015] transition-colors cursor-pointer"
        onClick={() => navigate('/post/' + post.id)}
      >
        {/* Repost label (if this is a repost by someone) */}
        {isRepost && (
          <div className="flex items-center gap-1.5 px-4 pt-2 pb-0">
            <Repeat2 size={13} className="text-[#6B7280]" />
            <span className="text-[#6B7280] text-xs font-medium">
              {author?.display_name} reposted
            </span>
          </div>
        )}

        <div className="flex gap-3 px-4 pt-3 pb-2">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); navigate('/profile/' + author?.username); }}>
              <Avatar url={author?.avatar_url} name={author?.display_name} size={10} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">

            {/* Author + timestamp row */}
            <div className="flex items-start justify-between gap-1 mb-0.5">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('/profile/' + author?.username); }}
                  className="text-white font-bold text-[14px] hover:underline truncate max-w-[110px]"
                >
                  {author?.display_name}
                </button>
                {author?.is_verified && (
                  <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
                )}
                <span className="text-[#6B7280] text-[13px] truncate max-w-[80px]">@{author?.username}</span>
                <span className="text-[#6B7280] text-[13px] flex-shrink-0">·</span>
                <span className="text-[#6B7280] text-[13px] flex-shrink-0 whitespace-nowrap">{formatTime(post.created_at)}</span>
                {flagMap[author?.country] && (
                  <span className="flex-shrink-0 text-[13px]">{flagMap[author?.country]}</span>
                )}
              </div>

              {/* ⋯ More menu */}
              <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowMenu(!showMenu); setShowRepostMenu(false); setShowReactionPicker(false); }}
                  className="text-[#6B7280] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-7 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-44 shadow-2xl">
                    {isOwner ? (
                      <button onClick={handleDelete} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
                        <Trash2 size={14} /> Delete post
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setShowMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                          <Flag size={14} className="text-[#6B7280]" /> Report post
                        </button>
                        <button onClick={() => setShowMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm">
                          <UserX size={14} className="text-[#6B7280]" /> Block @{author?.username}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Caption */}
            {post.caption && !isRepost && (
              <div className="mb-2">
                <RichCaption
                  text={post.caption}
                  onHashtag={(t) => navigate('/hashtag/' + t)}
                  onMention={(u) => navigate('/profile/' + u)}
                />
              </div>
            )}

            {/* If quote post: show own caption + quoted post card */}
            {post.caption && post.quoted_post_id && !post.is_repost && (
              <div className="mb-2">
                <RichCaption
                  text={post.caption}
                  onHashtag={(t) => navigate('/hashtag/' + t)}
                  onMention={(u) => navigate('/profile/' + u)}
                />
              </div>
            )}

            {/* Quoted post preview — for reposts & quote posts */}
            {post.quoted_post_id && quotedPost && (
              <div onClick={(e) => e.stopPropagation()}>
                <QuotedPost quotedPost={quotedPost} navigate={navigate} />
              </div>
            )}

            {/* Video */}
            {post.video_url && (
              <div
                className="relative rounded-2xl overflow-hidden bg-black mb-2 border border-white/10"
                style={{ aspectRatio: '16/9' }}
                onClick={(e) => e.stopPropagation()}
              >
                <video
                  ref={videoRef}
                  src={post.video_url}
                  poster={post.video_thumbnail}
                  muted={muted}
                  playsInline
                  preload="metadata"
                  loop
                  className="w-full h-full object-cover"
                  onEnded={() => setPlaying(false)}
                />
                <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleVideo}>
                  {!playing && (
                    <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Play size={22} color="white" fill="white" style={{ marginLeft: 2 }} />
                    </div>
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setMuted(!muted); }} className="absolute bottom-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                  {muted ? <VolumeX size={12} color="white" /> : <Volume2 size={12} color="white" />}
                </button>
                {post.video_duration && (
                  <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                    <span className="text-white text-[11px] font-medium">
                      {Math.floor(post.video_duration / 60)}:{String(post.video_duration % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Images */}
            <div onClick={(e) => e.stopPropagation()}>
              <MediaGrid images={images} />
            </div>

            {/* Location */}
            {post.location && <p className="text-[#6B7280] text-xs mb-1.5">📍 {post.location}</p>}

            {/* ── ACTION BAR ── */}
            <div className="flex items-center justify-between mt-1 -ml-2 -mr-1" onClick={(e) => e.stopPropagation()}>

              {/* Comment */}
              <button
                onClick={() => navigate('/post/' + post.id)}
                className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#1E6FFF] group px-2 py-1.5 rounded-full hover:bg-[#1E6FFF]/10 transition-all"
              >
                <MessageCircle size={17} />
                {(post.comments_count || 0) > 0 && <span className="text-[13px]">{formatNumber(post.comments_count)}</span>}
              </button>

              {/* ── REPOST — with dropdown menu ── */}
              <div className="relative">
                {showRepostMenu && (
                  <div
                    className="absolute bottom-10 left-0 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-30 shadow-2xl"
                    style={{ minWidth: 180 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={handleDirectRepost}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-sm border-b border-white/5"
                      style={{ color: reposted ? '#2ECC71' : 'white' }}
                    >
                      <Repeat2 size={16} style={{ color: reposted ? '#2ECC71' : '#6B7280' }} />
                      {reposted ? 'Undo Repost' : 'Repost'}
                    </button>
                    <button
                      onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-white text-sm"
                    >
                      <Quote size={16} className="text-[#6B7280]" />
                      Quote
                    </button>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRepostMenu(!showRepostMenu); setShowMenu(false); setShowReactionPicker(false); }}
                  className={'flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all ' +
                    (reposted ? 'text-[#2ECC71] hover:bg-[#2ECC71]/10' : 'text-[#6B7280] hover:text-[#2ECC71] hover:bg-[#2ECC71]/10')}
                >
                  <Repeat2 size={17} />
                  {repostCount > 0 && <span className="text-[13px]">{formatNumber(repostCount)}</span>}
                </button>
              </div>

              {/* Like — long press = reaction picker */}
              <div className="relative">
                {showReactionPicker && (
                  <div
                    className="absolute bottom-10 left-0 bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1 z-30 shadow-2xl"
                    style={{ minWidth: 'max-content', animation: 'slideUp 0.15s ease-out' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {REACTIONS.map((r) => (
                      <button
                        key={r.type}
                        onClick={() => handleLike(r.type)}
                        className="text-lg hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleLike(reaction || 'like'); }}
                  onMouseDown={(e) => { e.stopPropagation(); longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                  onMouseUp={() => clearTimeout(longPressTimer.current)}
                  onTouchStart={(e) => { e.stopPropagation(); longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                  onTouchEnd={() => clearTimeout(longPressTimer.current)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all hover:bg-red-500/10"
                  style={{ color: liked ? getReactionColor() : '#6B7280' }}
                >
                  {liked && reaction
                    ? <span className="text-base leading-none">{getReactionEmoji()}</span>
                    : <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
                  }
                  {likesCount > 0 && (
                    <span className="text-[13px]" style={{ color: liked ? getReactionColor() : '#6B7280' }}>
                      {formatNumber(likesCount)}
                    </span>
                  )}
                </button>
              </div>

              {/* Views */}
              <button className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#1E6FFF] px-2 py-1.5 rounded-full hover:bg-[#1E6FFF]/10 transition-all">
                <BarChart2 size={17} />
                {(post.views_count || 0) > 0 && <span className="text-[13px]">{formatNumber(post.views_count)}</span>}
              </button>

              {/* Bookmark + Share */}
              <div className="flex items-center">
                <button
                  onClick={handleSave}
                  className={'px-2 py-1.5 rounded-full transition-all ' +
                    (saved ? 'text-[#1E6FFF] hover:bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}
                >
                  <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleShare}
                  className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-1.5 rounded-full hover:bg-[#1E6FFF]/10 transition-all"
                >
                  <Share2 size={17} />
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}