import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EmojiPicker from 'emoji-picker-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  MoreHorizontal, Bookmark, BarChart2, Trash2, Flag,
  UserX, Volume2, VolumeX, Play, X, Send, SmilePlus,
} from 'lucide-react';
import Avatar from '../../components/Avatar';

/* ── Flag map ──────────────────────────────────── */
const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

/* ── Reactions (long-press like) ───────────────── */
const REACTIONS = [
  { emoji: '❤️', type: 'like',  color: '#EF4444' },
  { emoji: '😂', type: 'haha',  color: '#FFD700' },
  { emoji: '😮', type: 'wow',   color: '#FF6B35' },
  { emoji: '😢', type: 'sad',   color: '#6B7280' },
  { emoji: '😡', type: 'angry', color: '#EF4444' },
  { emoji: '🔥', type: 'fire',  color: '#FF6B35' },
];

/* ── Tiny helper: render caption with clickable hashtags / mentions ─ */
function RichText({ text, onHashtag, onMention }) {
  if (!text) return null;
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('#'))
          return <button key={i} onClick={() => onHashtag(p.slice(1))} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@'))
          return <button key={i} onClick={() => onMention(p.slice(1))} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/* ── Twitter-style media grid ───────────────────── */
function MediaGrid({ images }) {
  if (!images?.length) return null;
  const n = images.length;
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
      {n === 1 && (
        <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight: 500 }} />
      )}
      {n === 2 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.map((img, i) => (
            <img key={i} src={img} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} />
          ))}
        </div>
      )}
      {n === 3 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
          <img src={images[0]} alt="" className="row-span-2 w-full h-full object-cover" style={{ aspectRatio: '1/2' }} />
          <img src={images[1]} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} />
          <img src={images[2]} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} />
        </div>
      )}
      {n >= 4 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.slice(0, 4).map((img, i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="w-full object-cover" style={{ aspectRatio: '1/1' }} />
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

/* ── Single comment row — Twitter compressed style ─ */
function CommentRow({ c, postAuthorId, currentUserId, onReply, onDelete, navigate }) {
  const isAuthor = c.user_id === postAuthorId;
  const isMine   = c.user_id === currentUserId;

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors group">
      {/* Avatar */}
      <div className="flex-shrink-0 pt-0.5">
        <button onClick={() => navigate('/profile/' + c.users?.username)}>
          {c.users?.avatar_url
            ? <img src={c.users.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm">
                {c.users?.display_name?.[0]?.toUpperCase()}
              </div>
          }
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <button onClick={() => navigate('/profile/' + c.users?.username)} className="text-white font-bold text-[13px] hover:underline leading-none">
            {c.users?.display_name}
          </button>
          {c.users?.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[7px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
          )}
          {isAuthor && (
            <span className="bg-[#1E6FFF]/20 text-[#1E6FFF] text-[9px] px-1.5 py-0.5 rounded-full font-bold">Author</span>
          )}
          <span className="text-[#6B7280] text-xs">@{c.users?.username}</span>
          <span className="text-[#6B7280] text-xs">· {formatTime(c.created_at)}</span>
        </div>

        {/* Text */}
        <p className="text-white/85 text-[14px] leading-snug break-words">
          <RichText
            text={c.body}
            onHashtag={(t) => navigate('/hashtag/' + t)}
            onMention={(u) => navigate('/profile/' + u)}
          />
        </p>

        {/* Actions row — Twitter minimal style */}
        <div className="flex items-center gap-3 mt-1.5 -ml-1">
          <button
            onClick={() => onReply(c)}
            className="flex items-center gap-1 text-[#6B7280] text-xs hover:text-[#1E6FFF] px-1.5 py-1 rounded-full hover:bg-[#1E6FFF]/10 transition-all"
          >
            <MessageCircle size={13} /> Reply
          </button>
          {isMine && (
            <button
              onClick={() => onDelete(c.id)}
              className="text-[#6B7280] text-xs hover:text-red-400 px-1.5 py-1 rounded-full hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const commentInputRef = useRef();
  const videoRef        = useRef();
  const longPressTimer  = useRef();
  const emojiPickerRef  = useRef();

  /* ── Data ─────────────────────────────────── */
  const [post,          setPost]         = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [comments,      setComments]     = useState([]);
  const [commentText,   setCommentText]  = useState('');
  const [submitting,    setSubmitting]   = useState(false);
  const [replyTo,       setReplyTo]      = useState(null);
  const [commentCount,  setCommentCount] = useState(0);

  /* ── Engagement ───────────────────────────── */
  const [liked,       setLiked]      = useState(false);
  const [reaction,    setReaction]   = useState(null);
  const [likesCount,  setLikesCount] = useState(0);
  const [saved,       setSaved]      = useState(false);
  const [reposted,    setReposted]   = useState(false);

  /* ── UI state ─────────────────────────────── */
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showMenu,    setShowMenu]   = useState(false);
  const [showEmoji,   setShowEmoji]  = useState(false);
  const [playing,     setPlaying]    = useState(false);
  const [muted,       setMuted]      = useState(false);

  /* ── Lifecycle ────────────────────────────── */
  useEffect(() => {
    fetchPost();
    fetchComments();
    checkActions();
    recordView();

    return () => {
      window.dispatchEvent(new Event('blink:comments:close'));
    };
  }, [id]);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    if (showEmoji) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  // Comment input focus/blur → hide BottomNav
  useEffect(() => {
    const input = commentInputRef.current;
    if (!input) return;
    const onFocus = () => window.dispatchEvent(new Event('blink:comments:open'));
    const onBlur  = () => setTimeout(() => {
      if (!showEmoji) window.dispatchEvent(new Event('blink:comments:close'));
    }, 250);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur',  onBlur);
    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur',  onBlur);
    };
  }, [showEmoji]);

  // Real-time comments
  useEffect(() => {
    const ch = supabase.channel('comments:' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: 'post_id=eq.' + id },
        () => { fetchComments(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  /* ── Fetch helpers ────────────────────────── */
  const recordView = async () => {
    if (!user) return;
    const { data } = await supabase.from('posts').select('views_count').eq('id', id).maybeSingle();
    if (data != null)
      await supabase.from('posts').update({ views_count: (data.views_count || 0) + 1 }).eq('id', id);
  };

  const fetchPost = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id,username,display_name,avatar_url,country,is_verified,badge_type)')
      .eq('id', id).maybeSingle();
    setPost(data);
    setLikesCount(data?.likes_count || 0);
    setCommentCount(data?.comments_count || 0);
    setLoading(false);
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, users(id,username,display_name,avatar_url,is_verified,country)')
      .eq('post_id', id)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(200);
    setComments(data || []);
    setCommentCount(data?.length || 0);
  };

  const checkActions = async () => {
    if (!user?.id) return;
    const uid = user.id;

    const { data: ld } = await supabase.from('likes').select('reaction_type')
      .eq('post_id', id).eq('user_id', uid).maybeSingle();
    if (ld) { setLiked(true); setReaction(ld.reaction_type); }

    const { data: sd } = await supabase.from('saved_posts').select('id')
      .eq('post_id', id).eq('user_id', uid).maybeSingle();
    if (sd) setSaved(true);

    const { data: rd } = await supabase.from('posts').select('id')
      .eq('user_id', uid).eq('quoted_post_id', id).maybeSingle();
    if (rd) setReposted(true);
  };

  /* ── Engagement handlers ──────────────────── */
  const handleLike = useCallback(async (type = 'like') => {
    setShowReactionPicker(false);
    const uid = user?.id;

    if (liked && reaction === type) {
      setLiked(false); setReaction(null);
      setLikesCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete().eq('post_id', id).eq('user_id', uid);
      await supabase.from('posts').update({ likes_count: Math.max(0, likesCount - 1) }).eq('id', id);
    } else {
      if (!liked) {
        setLikesCount((c) => c + 1);
        await supabase.from('posts').update({ likes_count: likesCount + 1 }).eq('id', id);
        if (post?.users?.id !== uid) {
          await supabase.from('notifications').insert({
            user_id: post?.users?.id, from_user_id: uid, type: 'like',
            message: 'liked your post', ref_id: id, is_read: false,
          });
        }
      }
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert(
        { post_id: id, user_id: uid, reaction_type: type },
        { onConflict: 'post_id,user_id' }
      );
    }
  }, [liked, reaction, likesCount, id, post, user]);

  const handleRepost = async () => {
    if (reposted) return;
    setReposted(true);
    await supabase.from('posts').insert({
      user_id: user?.id, caption: '', quoted_post_id: id,
      audience: 'public', is_draft: false, is_repost: true,
    });
    await supabase.from('posts').update({ reposts_count: (post?.reposts_count || 0) + 1 }).eq('id', id);
    if (post?.users?.id !== user?.id) {
      await supabase.from('notifications').insert({
        user_id: post?.users?.id, from_user_id: user?.id,
        type: 'repost', message: 'reposted your post', ref_id: id, is_read: false,
      });
    }
  };

  const handleSave = async () => {
    if (saved) {
      setSaved(false);
      await supabase.from('saved_posts').delete().eq('post_id', id).eq('user_id', user?.id);
    } else {
      setSaved(true);
      await supabase.from('saved_posts').upsert(
        { post_id: id, user_id: user?.id, collection: 'Saved Posts' },
        { onConflict: 'post_id,user_id' }
      );
    }
  };

  const handleShare = async () => {
    const url = window.location.origin + '/post/' + id;
    if (navigator.share) { navigator.share({ title: 'B-Link Post', url }); }
    else { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    await supabase.from('posts').update({ shares_count: (post?.shares_count || 0) + 1 }).eq('id', id);
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    navigate(-1);
  };

  /* ── Comment submit ───────────────────────── */
  const handleComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    setSubmitting(true);
    setShowEmoji(false);

    const { data } = await supabase
      .from('comments')
      .insert({ post_id: id, user_id: user?.id, body, parent_id: replyTo?.id || null })
      .select('*, users(id,username,display_name,avatar_url,is_verified,country)')
      .single();

    if (data) {
      if (!replyTo) {
        setComments((prev) => [...prev, data]);
        setCommentCount((c) => c + 1);
      }
      if (post?.users?.id !== user?.id) {
        await supabase.from('notifications').insert({
          user_id: post?.users?.id, from_user_id: user?.id, type: 'comment',
          message: 'replied: "' + body.slice(0, 60) + '"', ref_id: id, is_read: false,
        });
      }
      // Mention notifications
      const mentions = body.match(/@(\w+)/g) || [];
      for (const m of mentions) {
        const { data: mUser } = await supabase.from('users').select('id').eq('username', m.slice(1)).maybeSingle();
        if (mUser && mUser.id !== user?.id) {
          await supabase.from('notifications').insert({
            user_id: mUser.id, from_user_id: user?.id, type: 'mention',
            message: 'mentioned you: "' + body.slice(0, 60) + '"', ref_id: id, is_read: false,
          });
        }
      }
    }

    setCommentText('');
    setReplyTo(null);
    setSubmitting(false);
    window.dispatchEvent(new Event('blink:comments:close'));
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentCount((c) => Math.max(0, c - 1));
  };

  const handleReply = (c) => {
    setReplyTo(c);
    setCommentText('@' + c.users?.username + ' ');
    commentInputRef.current?.focus();
    window.dispatchEvent(new Event('blink:comments:open'));
  };

  const toggleVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else         { v.play().then(() => setPlaying(true)); }
  };

  const getReactionEmoji = () => REACTIONS.find((r) => r.type === reaction)?.emoji || null;
  const getReactionColor = () => REACTIONS.find((r) => r.type === reaction)?.color || '#6B7280';

  /* ── Loading / not found ──────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-3">
      <p className="text-5xl">🔍</p>
      <p className="text-white font-bold text-lg">Post not found</p>
      <button onClick={() => navigate(-1)} className="text-[#1E6FFF] text-sm">Go back</button>
    </div>
  );

  const author  = post.users;
  const isOwner = author?.id === user?.id;
  const images  = post.media_urls || [];

  return (
    <div
      className="bg-[#0A1628] flex flex-col"
      style={{ minHeight: '100dvh' }}
      onClick={() => { setShowMenu(false); setShowReactionPicker(false); }}
    >
      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-base">Post</h1>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 120 }}>

        {/* ===== ORIGINAL POST ===== */}
        <div className="px-4 pt-4 pb-0">
          {/* Author block */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/profile/' + author?.username)}>
                {author?.avatar_url
                  ? <img src={author.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xl">
                      {author?.display_name?.[0]?.toUpperCase()}
                    </div>
                }
              </button>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => navigate('/profile/' + author?.username)} className="text-white font-bold text-[15px] hover:underline leading-tight">
                    {author?.display_name}
                  </button>
                  {author?.is_verified && (
                    <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
                  )}
                </div>
                <p className="text-[#6B7280] text-sm">
                  @{author?.username} {flagMap[author?.country] || ''}
                </p>
              </div>
            </div>

            {/* ⋯ Menu */}
            <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowMenu(!showMenu)} className="text-[#6B7280] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                <MoreHorizontal size={20} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-9 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-44 shadow-2xl">
                  {isOwner ? (
                    <button onClick={handleDeletePost} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
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
          {post.caption && (
            <div
              className={
                !images.length && !post.video_url && post.bg_color
                  ? 'rounded-2xl py-10 px-6 text-center mb-4'
                  : 'mb-4'
              }
              style={{ background: !images.length && !post.video_url && post.bg_color ? post.bg_color : 'transparent' }}
            >
              <p className={
                'leading-relaxed break-words text-[17px] whitespace-pre-wrap ' +
                (!images.length && !post.video_url && post.bg_color
                  ? 'text-white font-bold text-xl text-center'
                  : 'text-white')
              }>
                <RichText
                  text={post.caption}
                  onHashtag={(t) => navigate('/hashtag/' + t)}
                  onMention={(u) => navigate('/profile/' + u)}
                />
              </p>
            </div>
          )}

          {/* Video */}
          {post.video_url && (
            <div className="relative rounded-2xl overflow-hidden bg-black mb-4 border border-white/10" style={{ aspectRatio: '16/9' }}>
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
                  <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <Play size={30} color="white" fill="white" style={{ marginLeft: 3 }} />
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
                className="absolute bottom-3 right-3 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center"
              >
                {muted ? <VolumeX size={16} color="white" /> : <Volume2 size={16} color="white" />}
              </button>
              {post.video_duration && (
                <div className="absolute bottom-3 left-3 bg-black/60 rounded-full px-2.5 py-0.5">
                  <span className="text-white text-xs font-medium">
                    {Math.floor(post.video_duration / 60)}:{String(post.video_duration % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Images grid */}
          <MediaGrid images={images} />

          {/* Timestamp & location */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mb-3 text-[#6B7280] text-sm">
            <span>
              {new Date(post.created_at).toLocaleString('en-KE', {
                hour: '2-digit', minute: '2-digit',
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
            {post.location && <><span>·</span><span>📍 {post.location}</span></>}
            {(post.views_count || 0) > 0 && (
              <><span>·</span><span>{formatNumber(post.views_count)} views</span></>
            )}
          </div>

          {/* ── Engagement counts row ── */}
          {((post.reposts_count || 0) > 0 || likesCount > 0 || commentCount > 0 || (post.shares_count || 0) > 0) && (
            <div className="flex items-center gap-5 py-3 border-y border-white/[0.07] mb-1">
              {(post.reposts_count || 0) > 0 && (
                <div>
                  <span className="text-white font-bold">{formatNumber(post.reposts_count)}</span>
                  <span className="text-[#6B7280] text-sm ml-1">Reposts</span>
                </div>
              )}
              {likesCount > 0 && (
                <div>
                  <span className="text-white font-bold">{formatNumber(likesCount)}</span>
                  <span className="text-[#6B7280] text-sm ml-1">Likes</span>
                </div>
              )}
              {commentCount > 0 && (
                <div>
                  <span className="text-white font-bold">{formatNumber(commentCount)}</span>
                  <span className="text-[#6B7280] text-sm ml-1">Replies</span>
                </div>
              )}
              {(post.shares_count || 0) > 0 && (
                <div>
                  <span className="text-white font-bold">{formatNumber(post.shares_count)}</span>
                  <span className="text-[#6B7280] text-sm ml-1">Shares</span>
                </div>
              )}
            </div>
          )}

          {/* ── ACTION BAR — Twitter style ── */}
          <div className="flex items-center justify-between py-1 -mx-1" onClick={(e) => e.stopPropagation()}>
            {/* Comment */}
            <button
              onClick={() => {
                commentInputRef.current?.focus();
                window.dispatchEvent(new Event('blink:comments:open'));
              }}
              className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all"
            >
              <MessageCircle size={20} />
            </button>

            {/* Repost */}
            <button
              onClick={handleRepost}
              className={'px-2 py-2 rounded-full transition-all ' +
                (reposted ? 'text-[#2ECC71] hover:bg-[#2ECC71]/10' : 'text-[#6B7280] hover:text-[#2ECC71] hover:bg-[#2ECC71]/10')}
            >
              <Repeat2 size={20} />
            </button>

            {/* Like — long press = reaction picker */}
            <div className="relative">
              {showReactionPicker && (
                <div
                  className="absolute bottom-12 left-0 bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1.5 z-30 shadow-2xl"
                  style={{ minWidth: 'max-content', animation: 'slideUp 0.15s ease-out' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {REACTIONS.map((r) => (
                    <button
                      key={r.type}
                      onClick={() => handleLike(r.type)}
                      className="text-xl hover:scale-125 transition-transform w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10"
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => handleLike(reaction || 'like')}
                onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                onMouseUp={() => clearTimeout(longPressTimer.current)}
                onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
                className="px-2 py-2 rounded-full transition-all hover:bg-red-500/10"
                style={{ color: liked ? getReactionColor() : '#6B7280' }}
              >
                {liked && reaction
                  ? <span className="text-xl leading-none">{getReactionEmoji()}</span>
                  : <Heart size={20} fill={liked ? 'currentColor' : 'none'} className={liked ? '' : 'hover:text-red-400'} />
                }
              </button>
            </div>

            {/* Views */}
            <button className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all">
              <BarChart2 size={20} />
            </button>

            {/* Bookmark */}
            <button
              onClick={handleSave}
              className={'px-2 py-2 rounded-full transition-all ' +
                (saved ? 'text-[#1E6FFF] hover:bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}
            >
              <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
            </button>

            {/* Share */}
            <button onClick={handleShare} className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all">
              <Share2 size={20} />
            </button>
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div className="border-b border-white/[0.07] mb-0" />

        {/* ===== REPLY INPUT — inline (Twitter style: user types inline below post) ===== */}
        <div className="flex gap-3 px-4 py-3 border-b border-white/[0.07]">
          <div className="flex-shrink-0 pt-0.5">
            <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
          </div>
          <div className="flex-1 min-w-0">
            {replyTo && (
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[#6B7280] text-xs">
                  Replying to <span className="text-[#1E6FFF] font-semibold">@{replyTo.users?.username}</span>
                </p>
                <button onClick={() => { setReplyTo(null); setCommentText(''); }} className="text-[#6B7280] hover:text-white">
                  <X size={12} />
                </button>
              </div>
            )}
            <input
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
              onFocus={() => window.dispatchEvent(new Event('blink:comments:open'))}
              onBlur={() => setTimeout(() => { if (!showEmoji) window.dispatchEvent(new Event('blink:comments:close')); }, 250)}
              placeholder="Post your reply..."
              className="w-full bg-transparent text-white text-[16px] placeholder-[#6B7280] focus:outline-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2">
              {/* Emoji picker trigger */}
              <div className="relative" ref={emojiPickerRef}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setShowEmoji(!showEmoji); }}
                  className={'p-1.5 rounded-full transition-all ' + (showEmoji ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}
                >
                  <SmilePlus size={18} />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-10 left-0 z-50 shadow-2xl" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        setCommentText((t) => t + emojiData.emoji);
                        commentInputRef.current?.focus();
                      }}
                      theme="dark"
                      skinTonesDisabled
                      searchPlaceholder="Search emoji..."
                      width={300}
                      height={350}
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>

              {/* Send */}
              <button
                onClick={handleComment}
                disabled={submitting || !commentText.trim()}
                className="bg-[#1E6FFF] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40 hover:bg-[#1565cc] transition-colors shadow-md shadow-[#1E6FFF]/30"
              >
                {submitting ? '...' : 'Reply'}
              </button>
            </div>
          </div>
        </div>

        {/* ===== COMMENTS / REPLIES ===== */}
        {comments.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-4xl mb-2">💬</p>
            <p className="text-white font-bold">No replies yet</p>
            <p className="text-[#6B7280] text-sm mt-1">Be the first to reply!</p>
          </div>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              c={c}
              postAuthorId={post.user_id}
              currentUserId={user?.id}
              onReply={handleReply}
              onDelete={handleDeleteComment}
              navigate={navigate}
            />
          ))
        )}
      </div>

      {/* ── FIXED BOTTOM INPUT (always visible) — shown only when keyboard is up ── */}
      {/* We keep a fixed input bar too for convenience (same as Twitter app) */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '620px',
          background: '#0d1f3c',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '10px 12px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          zIndex: 40,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
        </div>
        <div
          style={{
            flex: '1 1 auto', minWidth: 0,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '22px',
            padding: '9px 14px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleComment(); } }}
            onFocus={() => {
              // Scroll to inline input instead
              commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              commentInputRef.current?.focus();
            }}
            placeholder={replyTo ? 'Replying to @' + replyTo.users?.username : 'Post your reply...'}
            readOnly
            style={{
              flex: 1, minWidth: 0, background: 'transparent',
              border: 'none', outline: 'none', color: '#6B7280',
              fontSize: '15px', cursor: 'pointer',
            }}
          />
          <SmilePlus size={16} style={{ color: '#6B7280', flexShrink: 0 }} />
        </div>
        <button
          onClick={handleComment}
          disabled={submitting || !commentText.trim()}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: (!submitting && commentText.trim()) ? '#1E6FFF' : 'rgba(30,111,255,0.35)',
            border: 'none', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Send size={15} style={{ color: 'white', marginLeft: 1 }} />
        </button>
      </div>
    </div>
  );
}