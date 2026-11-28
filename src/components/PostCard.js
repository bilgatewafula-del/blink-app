import { memo, useState, useEffect, useRef, useCallback } from 'react';
import VerifiedBadge from './VerifiedBadge';
import { feedImageUrl } from '../lib/imageUtils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../utils/formatTime';
import { formatNumber } from '../utils/formatNumber';
import { notifyAdminOnReport } from '../utils/notifyAdmin';
import {
  Heart, MessageCircle, Repeat2, Share2,
  MoreHorizontal, Bookmark, BarChart2,
  Trash2, Flag, UserX, Volume2, VolumeX,
  Play, Quote, X, Edit3, Pin, PinOff,
  Eye, Link, MessageSquareOff, MessageSquare,
  Archive, EyeOff, BellOff, CheckCircle,
  AlertTriangle, Zap, Crown, ShieldCheck, MapPin,
} from 'lucide-react';
import Avatar from './Avatar';
import ImageViewer from './ImageViewer';
import { CommentsSheet } from './post/Comments';
import TextPost, { isColoredTextPost } from './post/TextPost';
import { ShareSheet, InsightsSheet } from './post/Sheets';
import { bgCss, textSizeFor } from '../lib/storyPalette';
import { videoSrc } from '../lib/imageUtils';
import { getPref } from '../lib/prefs';
import {
  requestPostState, patchPostState, requestQuotedPost, isPostHidden, isUserMuted, hidePost, muteUser, recordShare, toggleSave,
} from '../lib/posts';

/* ── One active video at a time ── */
let globalActiveVideoId = null;
const videoListeners    = new Set();
function setGlobalActiveVideo(id) {
  if (globalActiveVideoId !== id) {
    globalActiveVideoId = id;
    videoListeners.forEach(cb => cb(id));
  }
}

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

const REACTIONS = [
  { emoji:'❤️', type:'like',  color:'#EF4444' },
  { emoji:'😂', type:'haha',  color:'#FFD700' },
  { emoji:'😮', type:'wow',   color:'#7C3AED' },
  { emoji:'😢', type:'sad',   color:'#64748B' },
  { emoji:'😡', type:'angry', color:'#EF4444' },
  { emoji:'🔥', type:'fire',  color:'#7C3AED' },
];

/* ═══════════════════════════════════════════════
   RICH CAPTION — unchanged
═══════════════════════════════════════════════ */
function RichCaption({ text, onHashtag, onMention }) {
  if (!text) return null;
  return (
    <p className="text-[#111827] text-[16px] leading-relaxed break-words whitespace-pre-wrap">
      {text.split(/(#\w+|@\w+(?:\.\w+)*)/g).map((p, i) => {
        if (p.startsWith('#'))
          return <button key={i} onClick={e => { e.stopPropagation(); onHashtag(p.slice(1)); }} className="text-[#6D28D9] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@'))
          return <button key={i} onClick={e => { e.stopPropagation(); onMention(p.slice(1)); }} className="text-[#6D28D9] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

/* ═══════════════════════════════════════════════
   MEDIA GRID — full card width, aspect-aware, double-tap to like
═══════════════════════════════════════════════ */
const MIN_IMG_ASPECT = 0.8;   // 4:5 portrait is the tallest a feed image gets
const MAX_IMG_ASPECT = 1.91;  // widest a feed image gets

function Tile({ src, onTap, children, className = '' }) {
  return (
    <div className={'relative overflow-hidden bg-[#EEF0F8] cursor-pointer ' + className} onClick={onTap}>
      <img src={feedImageUrl(src, 800)} alt="" loading="lazy" decoding="async"
        className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      {children}
    </div>
  );
}

function SingleImage({ src, onTap }) {
  // Frame follows the photo's real shape (clamped), so there are no dead
  // bars around it and nothing gets awkwardly cropped.
  const [aspect, setAspect] = useState(4 / 3);
  return (
    <div className="relative overflow-hidden bg-[#EEF0F8] cursor-pointer" style={{ aspectRatio: aspect }} onClick={onTap}>
      <img src={feedImageUrl(src, 800)} alt="" loading="lazy" decoding="async" draggable={false}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          if (w && h) setAspect(Math.min(MAX_IMG_ASPECT, Math.max(MIN_IMG_ASPECT, w / h)));
        }}
        className="absolute inset-0 w-full h-full object-cover" />
    </div>
  );
}

function MediaGrid({ images, onImageClick, onDoubleTapLike }) {
  const [burst, setBurst] = useState(false);
  const lastTapRef = useRef(0);

  if (!images?.length) return null;
  const n = images.length;

  const tap = (idx) => (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDoubleTapLike?.();
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= 300) onImageClick?.(idx);
      }, 300);
    }
  };

  const more = n > 4 ? n - 4 : 0;
  const shown = images.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E2E6F3]">
      {n === 1 && <SingleImage src={images[0]} onTap={tap(0)} />}

      {n === 2 && (
        <div className="grid grid-cols-2 gap-[2px]" style={{ aspectRatio: '4/3' }}>
          {shown.map((img, i) => <Tile key={i} src={img} onTap={tap(i)} />)}
        </div>
      )}

      {n === 3 && (
        <div className="grid grid-cols-2 grid-rows-2 gap-[2px]" style={{ aspectRatio: '4/3' }}>
          <Tile src={images[0]} onTap={tap(0)} className="row-span-2" />
          <Tile src={images[1]} onTap={tap(1)} />
          <Tile src={images[2]} onTap={tap(2)} />
        </div>
      )}

      {n >= 4 && (
        <div className="grid grid-cols-2 grid-rows-2 gap-[2px]" style={{ aspectRatio: '4/3' }}>
          {shown.map((img, i) => (
            <Tile key={i} src={img} onTap={tap(i)}>
              {i === 3 && more > 0 && (
                <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">+{more}</span>
                </div>
              )}
            </Tile>
          ))}
        </div>
      )}

      {burst && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart size={72} className="text-white drop-shadow-lg animate-heartBurst" fill="currentColor" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIDEO PLAYER
═══════════════════════════════════════════════ */
// Aspect ratio bounds — matches how Twitter/X and Instagram clamp
// feed video: a normal portrait phone video (9:16 ≈ 0.5625) displays
// at its true shape, and only truly extreme aspect ratios (a
// panorama, or an unusually tall/narrow clip) get gently constrained
// instead of dominating or breaking the feed layout.
const MIN_VIDEO_ASPECT = 0.5625; // 9:16 portrait
const MAX_VIDEO_ASPECT = 1.91;   // ~16:9-ish landscape cap

function VideoPlayer({ src, poster, duration }) {
  const videoRef       = useRef();
  const containerRef   = useRef();
  const videoId        = useRef(Math.random().toString(36).slice(2));
  const autoPlayed     = useRef(false);
  const [playing,      setPlaying]      = useState(false);
  const [muted,        setMuted]        = useState(true);
  const [buffering,    setBuffering]    = useState(false);
  const [error,        setError]        = useState(false);
  const [progress,     setProgress]     = useState(0);
  // Was: a hardcoded aspectRatio:'16/9' container with object-cover on
  // the <video> — any video that isn't roughly landscape (portrait
  // phone videos especially, which are extremely common) got scaled
  // up to fill that wide box and had its top and bottom cropped clean
  // off. Now the container sizes itself to the video's actual
  // dimensions (clamped to a sane range above) and the video uses
  // object-contain, so nothing gets cut off — full frame, always.
  const [aspect,       setAspect]       = useState(16/9);

  useEffect(() => {
    const cb = (activeId) => {
      if (activeId !== videoId.current && videoRef.current && playing) {
        videoRef.current.pause();
        setPlaying(false);
      }
    };
    videoListeners.add(cb);
    return () => videoListeners.delete(cb);
  }, [playing]);

  useEffect(() => {
    const el  = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        const e = entries[0];
        if (!e.isIntersecting && videoRef.current && playing) {
          videoRef.current.pause();
          setPlaying(false);
        } else if (e.isIntersecting && e.intersectionRatio >= 0.6 && videoRef.current && !playing && !autoPlayed.current
                   && getPref('autoplay_videos') && !getPref('data_saver')) {
          // "Auto-play videos" setting: muted, once per post, only when well in view
          autoPlayed.current = true;
          videoRef.current.muted = true;
          setMuted(true);
          videoRef.current.play().then(() => setPlaying(true)).catch(() => {});
        }
      },
      { threshold: [0.3, 0.6] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [playing]);

  useEffect(() => {
    const handleVis = () => {
      if (document.hidden && videoRef.current && playing) {
        videoRef.current.pause();
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [playing]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const natural = v.videoWidth / v.videoHeight;
    setAspect(Math.min(MAX_VIDEO_ASPECT, Math.max(MIN_VIDEO_ASPECT, natural)));
  };

  const toggle = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      setGlobalActiveVideo(videoId.current);
      v.play().then(() => setPlaying(true)).catch(() => setError(true));
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration * 100);
  };

  const fmtDur = (s) => s ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '';

  if (error) return (
    <div className="w-full bg-black/40 rounded-2xl flex items-center justify-center gap-2 py-10 border border-[#E2E8F0]">
      <AlertTriangle size={18} className="text-red-600" />
      <span className="text-[#64748B] text-sm">Video unavailable</span>
    </div>
  );

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden bg-black border border-[#E2E8F0]"
      style={{ aspectRatio: aspect, maxHeight: '600px' }}>
      <video
        ref={videoRef}
        src={videoSrc(src)}
        poster={poster}
        muted={muted}
        playsInline
        preload="metadata"
        loop={false}
        className="w-full h-full object-contain"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onError={() => setError(true)}
      />

      <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggle}>
        {buffering && (
          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {!playing && !buffering && (
          <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Play size={22} color="white" fill="white" style={{ marginLeft:2 }} />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-4"
        style={{ background:'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
        <div className="w-full h-[3px] bg-white/30 rounded-full mb-2 cursor-pointer"
          onClick={e => {
            e.stopPropagation();
            const v = videoRef.current;
            if (!v) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct  = (e.clientX - rect.left) / rect.width;
            v.currentTime = pct * v.duration;
          }}>
          <div className="h-full bg-white rounded-full transition-all" style={{ width: progress + '%' }} />
        </div>
        <div className="flex items-center justify-between">
          {duration && (
            <span className="text-white text-[11px] font-medium">{fmtDur(duration)}</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
            className="ml-auto w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
          >
            {muted ? <VolumeX size={13} color="white" /> : <Volume2 size={13} color="white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   QUOTED POST — unchanged
═══════════════════════════════════════════════ */
function QuotedPost({ quotedPost, navigate }) {
  if (!quotedPost) return null;
  const a    = quotedPost.users;
  const imgs = quotedPost.media_urls || [];
  return (
    <div className="border border-[#E2E6F3] rounded-2xl p-3 bg-[#F8F9FD] cursor-pointer active:bg-[#F1F3FA] transition-colors"
      onClick={e => { e.stopPropagation(); navigate('/post/' + quotedPost.id); }}>
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        {a?.avatar_url
          ? <img loading="lazy" decoding="async" src={a.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
          : <div className="w-5 h-5 rounded-full bg-[#7C3AED] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">{a?.display_name?.[0]?.toUpperCase()}</div>
        }
        <span className="text-[#111827] font-bold text-[13px] truncate max-w-[100px]">{a?.display_name}</span>
        {a?.is_verified && <VerifiedBadge size={14} />}
        <span className="text-[#64748B] text-[12px]">@{a?.username}</span>
        <span className="text-[#64748B] text-[12px]">· {formatTime(quotedPost.created_at)}</span>
      </div>
      {quotedPost.caption && <p className="text-[#64748B] text-[13px] leading-snug line-clamp-3 mb-1">{quotedPost.caption}</p>}
      {imgs.length > 0 && <img src={imgs[0]} alt="" className="w-full object-cover rounded-xl" style={{ maxHeight:160 }} loading="lazy" />}
      {quotedPost.video_url && !imgs.length && (
        <div className="w-full bg-[#11152E] rounded-xl flex items-center justify-center gap-2 py-4">
          <Play size={18} color="white" fill="white" /><span className="text-white text-xs font-medium">Video</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REPORT MODAL — unchanged
═══════════════════════════════════════════════ */
function ReportModal({ postId, postUserId, currentUserId, onClose }) {
  const REASONS = [
    'Spam or misleading','Harassment or hate speech',
    'Violence or dangerous content','Adult or sexual content',
    'Misinformation','Intellectual property violation','Other',
  ];
  const [selected, setSelected] = useState('');
  const [details,  setDetails]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [done,     setDone]     = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const { data: existing } = await supabase.from('reports')
        .select('id').eq('reporter_id', currentUserId)
        .eq('target_type','post').eq('target_id', postId).maybeSingle();
      if (!existing) {
        await supabase.from('reports').insert({
          reporter_id: currentUserId, target_type:'post',
          target_id: postId, reason: selected,
          details: details.trim() || null, status:'pending',
        });
        await notifyAdminOnReport({ reporterId: currentUserId, targetType:'post', targetId: postId, reason: selected });
      }
      setDone(true);
    } catch (err) { console.error(err.message); }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#111827] font-bold text-base">Report Post</h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#111827]"><X size={20} /></button>
        </div>
        {done ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-[#111827] font-bold">Report submitted</p>
            <p className="text-[#64748B] text-sm mt-1">Thank you. Our team will review this.</p>
            <button onClick={onClose} className="mt-4 bg-[#7C3AED] text-white px-6 py-2.5 rounded-full font-bold text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {REASONS.map(r => (
                <button key={r} onClick={() => setSelected(r)}
                  className={'w-full text-left px-4 py-3 rounded-xl text-sm border transition-all ' +
                    (selected === r ? 'bg-[#7C3AED]/20 border-[#7C3AED]/50 text-[#6D28D9] font-semibold' : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]')}>
                  {r}
                </button>
              ))}
            </div>
            {selected && (
              <textarea value={details} onChange={e => setDetails(e.target.value)}
                placeholder="Additional details (optional)..." rows={3}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-[#111827] text-sm placeholder-[#94A3B8] focus:outline-none resize-none mb-4" />
            )}
            <button onClick={handleSubmit} disabled={!selected || sending}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 bg-red-500 hover:bg-red-600 transition-colors">
              {sending ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   OPTIONS MENU — delete/save/block now call the
   atomic RPCs instead of multi-step client writes
═══════════════════════════════════════════════ */
function OptionsMenu({ post, isOwner, currentUserId, onClose, onActionDone }) {
  const navigate  = useNavigate();
  const [busy,    setBusy]    = useState(null);
  const [toast,   setToast]   = useState('');
  const [confirm, setConfirm] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (err) { showToast('Error: ' + err.message); }
    setBusy(null);
  };

  const handleEdit = () => {
    onClose();
    navigate('/create?edit=' + post.id);
  };

  const handlePin = () => run('pin', async () => {
    const newVal = !post.is_pinned;
    await supabase.from('posts').update({ is_pinned: newVal }).eq('id', post.id).eq('user_id', currentUserId);
    showToast(newVal ? '📌 Post pinned' : '📌 Post unpinned');
    onActionDone('pin', { is_pinned: newVal });
  });

  const handleInsights = () => {
    onClose();
    navigate('/post/' + post.id + '?tab=insights');
  };

  const handleCopyLink = async () => {
    const url = window.location.origin + '/post/' + post.id;
    try { await navigator.clipboard.writeText(url); recordShare(post.id); showToast('Link copied'); } catch { showToast("Couldn't copy the link"); }
  };

  const handleShare = async () => {
    const url = window.location.origin + '/post/' + post.id;
    try {
      if (navigator.share) { await navigator.share({ title: 'Check this on B-Link', url }); recordShare(post.id); }
      else { await navigator.clipboard.writeText(url); recordShare(post.id); showToast('Link copied'); }
    } catch { /* cancelled */ }
  };

  const handleToggleComments = () => run('comments', async () => {
    const newVal = !post.comments_disabled;
    await supabase.from('posts').update({ comments_disabled: newVal }).eq('id', post.id).eq('user_id', currentUserId);
    showToast(newVal ? 'Comments turned off' : 'Comments turned on');
    onActionDone('comments', { comments_disabled: newVal });
  });

  const handleArchive = () => run('archive', async () => {
    await supabase.from('posts').update({ status: 'archived' }).eq('id', post.id).eq('user_id', currentUserId);
    showToast('📦 Post archived');
    onActionDone('archive');
    onClose();
  });

  // Was a 5-step client-side delete chain (likes, comments, saved_posts,
  // reports, then the post). Now one atomic server-side call — see
  // delete_own_post() in 17_post_interaction_rpcs.sql.
  const handleDelete = async () => {
    setBusy('delete');
    try {
      const { error } = await supabase.rpc('delete_own_post', { p_post_id: post.id });
      if (error) throw error;
      showToast('🗑️ Post deleted');
      onActionDone('delete');
      onClose();
    } catch (err) {
      showToast('Delete failed: ' + err.message);
    }
    setBusy(null);
  };

  // Was a client read-then-write (select existing, then insert/delete) —
  // now one atomic RPC call, consistent with the main card's handleSave.
  const handleSave = () => run('save', async () => {
    const nowSaved = await toggleSave(post.id, !!post.is_saved);
    showToast(nowSaved ? 'Post saved' : 'Removed from saved');
    onActionDone('save');
  });

  const handleViewProfile = () => {
    onClose();
    navigate('/profile/' + post.users?.username);
  };

  const handleHide = () => run('hide', async () => {
    hidePost(post.id);
    showToast('Post hidden from feed');
    onActionDone('hide');
    onClose();
  });

  const handleMute = () => run('mute', async () => {
    muteUser(post.users?.id || post.user_id);
    showToast('@' + post.users?.username + ' muted');
    onClose();
  });

  // Was two client-side deletes; the reverse-direction delete needs
  // permission on a row owned by someone else, which plain RLS would
  // likely just silently skip — meaning "blocking" wouldn't actually
  // stop them from seeing you. Now one atomic server-side call — see
  // block_user() in 17_post_interaction_rpcs.sql.
  const handleBlock = () => run('block', async () => {
    const { error } = await supabase.rpc('block_user', { p_target_id: post.user_id });
    if (error) throw error;
    showToast('User blocked');
    onActionDone('block');
    onClose();
  });

  const OWNER_ITEMS = [
    { key:'edit',     icon: Edit3,           label:'Edit Post',                    action: handleEdit,           danger: false },
    { key:'pin',      icon: post.is_pinned ? PinOff : Pin, label: post.is_pinned ? 'Unpin Post' : 'Pin Post', action: handlePin, danger: false },
    { key:'insights', icon: Eye,             label:'View Insights',                action: handleInsights,       danger: false },
    { key:'share',    icon: Share2,          label:'Share Post',                   action: handleShare,          danger: false },
    { key:'copy',     icon: Link,            label:'Copy Link',                    action: handleCopyLink,       danger: false },
    { key:'comments', icon: post.comments_disabled ? MessageSquare : MessageSquareOff,
                                             label: post.comments_disabled ? 'Enable Comments' : 'Disable Comments',
                                                                                   action: handleToggleComments, danger: false },
    { key:'archive',  icon: Archive,         label:'Archive Post',                 action: handleArchive,        danger: false },
    { key:'delete',   icon: Trash2,          label:'Delete Post',                  action: () => setConfirm({ label:'Permanently delete this post and all its likes and comments?', fn: handleDelete }), danger: true },
  ];

  const OTHER_ITEMS = [
    { key:'save',    icon: Bookmark,  label:'Save Post',     action: handleSave,       danger: false },
    { key:'share',   icon: Share2,    label:'Share Post',    action: handleShare,      danger: false },
    { key:'copy',    icon: Link,      label:'Copy Link',     action: handleCopyLink,   danger: false },
    { key:'profile', icon: Avatar,    label:'View Profile',  action: handleViewProfile,danger: false, isAvatar: true },
    { key:'hide',    icon: EyeOff,    label:'Hide Post',     action: handleHide,       danger: false },
    { key:'mute',    icon: BellOff,   label:'Mute @' + (post.users?.username||'user'), action: handleMute, danger: false },
    { key:'block',   icon: UserX,     label:'Block User',    action: () => setConfirm({ label:`Block @${post.users?.username || 'this user'}? You will stop following each other and this can be undone later from Settings.`, fn: handleBlock }), danger: true },
    { key:'report',  icon: Flag,      label:'Report Post',   action: () => { onClose(); setTimeout(() => onActionDone('report'), 100); }, danger: true },
  ];

  const items = isOwner ? OWNER_ITEMS : OTHER_ITEMS;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl pb-safe overflow-hidden"
        style={{ paddingBottom:'max(16px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>

        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#E2E8F0] backdrop-blur border border-[#E2E8F0] rounded-full px-4 py-2 z-10">
            <p className="text-[#111827] text-sm font-semibold">{toast}</p>
          </div>
        )}

        {confirm && (
          <div className="p-5">
            <p className="text-[#111827] font-bold text-base mb-1">Are you sure?</p>
            <p className="text-[#64748B] text-sm mb-5">{confirm.label}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-[#64748B] bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors">
                Cancel
              </button>
              <button onClick={confirm.fn} disabled={!!busy}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy === 'delete'
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting...</>
                  : busy === 'block'
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Blocking...</>
                    : confirm.fn === handleDelete ? '🗑️ Delete' : '🚫 Block'
                }
              </button>
            </div>
          </div>
        )}

        {!confirm && (
          <>
            <div className="px-5 pt-4 pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Avatar url={post.users?.avatar_url} name={post.users?.display_name} size={8} />
                <div className="min-w-0">
                  <p className="text-[#111827] font-bold text-[13px] truncate">{post.users?.display_name}</p>
                  {post.caption && <p className="text-[#94A3B8] text-[12px] truncate">{post.caption.slice(0,60)}</p>}
                </div>
              </div>
            </div>

            <div className="py-1 max-h-[60vh] overflow-y-auto">
              {items.map(item => {
                const Icon = item.isAvatar ? null : item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={item.action}
                    disabled={!!busy && busy !== item.key}
                    className={'w-full flex items-center gap-4 px-5 py-3.5 transition-all active:scale-[0.98] disabled:opacity-40 ' +
                      (item.danger ? 'hover:bg-red-500/10' : 'hover:bg-[#F8FAFC]')}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.danger ? 'bg-red-500/15' : 'bg-[#F1F5F9]'}`}>
                      {busy === item.key
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : Icon ? <Icon size={16} className={item.danger ? 'text-red-600' : 'text-[#64748B]'} /> : null
                      }
                    </div>
                    <span className={`font-semibold text-[14px] ${item.danger ? 'text-red-600' : 'text-[#111827]'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-4 pt-1 pb-2">
              <button onClick={onClose}
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-[#64748B] bg-[#F1F5F9] hover:bg-[#F1F5F9] transition-colors active:scale-[0.98]">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN POSTCARD
═══════════════════════════════════════════════ */
function PostCard({
  post: initialPost, currentUser, onRefresh,
  // Optional — if the parent feed query already knows whether the
  // current user liked/saved/reposted this post (e.g. via a joined
  // query or a bulk lookup), pass it here to skip this card's own
  // 3 network requests. Falls back to the existing per-card fetch
  // when not provided, so nothing breaks if Home.js isn't updated yet.
  initialLiked, initialReaction, initialSaved, initialReposted,
}) {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const longPressTimer = useRef();

  const [post,        setPost]        = useState(initialPost);
  const [liked,       setLiked]       = useState(initialLiked ?? false);
  const [reaction,    setReaction]    = useState(initialReaction ?? null);
  const [likesCount,  setLikesCount]  = useState(initialPost.likes_count || 0);
  const [saved,       setSaved]       = useState(initialSaved ?? false);
  const [reposted,    setReposted]    = useState(initialReposted ?? false);
  const [repostCount, setRepostCount] = useState(initialPost.reposts_count || 0);
  const [quotedPost,  setQuotedPost]  = useState(null);
  const [imgViewer,   setImgViewer]   = useState({ open:false, idx:0 });

  const [showOptionsMenu,    setShowOptionsMenu]     = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRepostMenu,     setShowRepostMenu]     = useState(false);
  const [showQuoteModal,     setShowQuoteModal]     = useState(false);
  const [showReportModal,    setShowReportModal]    = useState(false);
  const [quoteText,          setQuoteText]          = useState('');
  const [actionToast,        setActionToast]        = useState('');
  const [commentsOpen,       setCommentsOpen]       = useState(false);
  const [shareOpen,          setShareOpen]          = useState(false);
  const [insightsOpen,       setInsightsOpen]       = useState(false);
  const pressed = useRef(false);

  const uid      = currentUser?.id || user?.id;
  const author   = post.users;
  const isOwner  = (author?.id || post.user_id) === uid;
  const images   = post.media_urls || [];
  const isRepost = post.is_repost && post.quoted_post_id;

  const showToast = (msg) => { setActionToast(msg); setTimeout(() => setActionToast(''), 2000); };

  // One request per screen (batched in lib/posts) instead of 3 per card
  const readyRef = useRef(initialLiked !== undefined && initialSaved !== undefined && initialReposted !== undefined);
  useEffect(() => {
    let live = true;
    if (!uid) return undefined;
    if (initialLiked === undefined || initialSaved === undefined || initialReposted === undefined) {
      requestPostState(uid, post.id).then((st) => {
        if (!live) return;
        if (initialLiked === undefined && st.liked) { setLiked(true); setReaction(st.reaction); }
        if (initialSaved === undefined && st.saved) setSaved(true);
        if (initialReposted === undefined && st.reposted) setReposted(true);
        readyRef.current = true;
      });
    }
    if (post.quoted_post_id) requestQuotedPost(post.quoted_post_id).then((q) => { if (live && q) setQuotedPost(q); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, uid]);

  // keep the shared cache in step with what the user just did
  useEffect(() => { if (readyRef.current && uid) patchPostState(uid, post.id, { liked, reaction, saved, reposted }); }, [liked, reaction, saved, reposted, uid, post.id]);

  useEffect(() => { setPost(initialPost); setLikesCount(initialPost.likes_count || 0); }, [initialPost]);

  // Was: read likesCount from state, write likesCount+1 back — a lost
  // update under concurrent likes. Now calls the atomic toggle_post_like
  // RPC and trusts its returned count, with optimistic UI + rollback
  // if the call fails (previously a failed request left the UI
  // permanently out of sync with the database).
  const handleLike = async (type = 'like') => {
    setShowReactionPicker(false);
    const prevLiked = liked, prevReaction = reaction, prevCount = likesCount;

    const willUnlike = liked && reaction === type;
    setLiked(!willUnlike);
    setReaction(willUnlike ? null : type);
    setLikesCount(c => willUnlike ? Math.max(0, c - 1) : (liked ? c : c + 1));

    try {
      const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: post.id, p_reaction_type: type });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setLiked(row.liked);
        setReaction(row.reaction);
        setLikesCount(row.likes_count);
      }
    } catch (err) {
      setLiked(prevLiked); setReaction(prevReaction); setLikesCount(prevCount);
      showToast('Couldn\u2019t update like — try again');
    }
  };

  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    const prevReposted = reposted, prevCount = repostCount;
    setReposted(!reposted);
    setRepostCount(c => reposted ? Math.max(0, c - 1) : c + 1);

    try {
      const { data, error } = await supabase.rpc('toggle_post_repost', { p_post_id: post.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setReposted(row.reposted); setRepostCount(row.reposts_count); }
    } catch (err) {
      setReposted(prevReposted); setRepostCount(prevCount);
      showToast('Couldn\u2019t update repost — try again');
    }
  };

  const handleQuotePost = async () => {
    if (!quoteText.trim()) return;
    setShowQuoteModal(false);
    const text = quoteText.trim();
    setQuoteText('');
    try {
      const { error } = await supabase.rpc('create_quote_post', { p_post_id: post.id, p_caption: text });
      if (error) throw error;
      setRepostCount(c => c + 1);
      showToast('✅ Quoted!');
    } catch (err) {
      showToast('Quote failed — try again');
    }
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    const prevSaved = saved;
    setSaved(!saved);
    try {
      const nowSaved = await toggleSave(post.id, prevSaved);
      setSaved(nowSaved);
      showToast(nowSaved ? 'Post saved' : 'Removed from saved');
    } catch (err) {
      setSaved(prevSaved);
      showToast('Couldn\u2019t update — try again');
    }
  };

  const handleShare = (e) => { e?.stopPropagation?.(); setShareOpen(true); };

  const handleViewInsights = (e) => { e?.stopPropagation?.(); setInsightsOpen(true); };

  const handleOptionsAction = (action, data) => {
    if (action === 'delete' || action === 'archive' || action === 'block' || action === 'hide') {
      if (onRefresh) onRefresh();
    } else if (action === 'pin' && data) {
      setPost(p => ({ ...p, ...data }));
    } else if (action === 'comments' && data) {
      setPost(p => ({ ...p, ...data }));
    } else if (action === 'save') {
      setSaved(s => !s);
    } else if (action === 'report') {
      setShowReportModal(true);
    }
  };

  const getReactionEmoji = () => REACTIONS.find(r => r.type === reaction)?.emoji || null;

  if (isPostHidden(post.id) || isUserMuted(post.user_id)) return null;

  return (
    <>
      {commentsOpen && (
        <CommentsSheet post={post} count={post.comments_count || 0}
          onCountChange={(d) => setPost((p) => ({ ...p, comments_count: Math.max(0, (p.comments_count || 0) + d) }))}
          onClose={() => setCommentsOpen(false)} onNavigate={navigate} />
      )}
      {shareOpen && <ShareSheet post={post} onClose={() => setShareOpen(false)} onDone={(t) => { setShareOpen(false); if (t) showToast(t); }} />}
      {insightsOpen && <InsightsSheet post={post} onClose={() => setInsightsOpen(false)} />}
      {(showReactionPicker || showRepostMenu) && (
        <div className="fixed inset-0 z-[5]" onClick={(e) => { e.stopPropagation(); setShowReactionPicker(false); setShowRepostMenu(false); }} />
      )}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowQuoteModal(false)}>
          <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowQuoteModal(false)} className="text-[#64748B] hover:text-[#111827]"><X size={20} /></button>
              <h3 className="text-[#111827] font-bold">Quote Post</h3>
              <button onClick={handleQuotePost} disabled={!quoteText.trim()}
                className="bg-[#7C3AED] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40">Post</button>
            </div>
            <textarea autoFocus value={quoteText} onChange={e => setQuoteText(e.target.value)}
              placeholder="Add a comment..." maxLength={500} rows={3}
              className="w-full bg-transparent text-[#111827] text-[16px] placeholder-[#94A3B8] focus:outline-none resize-none leading-relaxed mb-3" />
            <div className="border border-[#E2E8F0] rounded-2xl p-3 bg-[#F8FAFC]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[#111827] font-bold text-[13px]">{author?.display_name}</span>
                <span className="text-[#64748B] text-[12px]">@{author?.username}</span>
              </div>
              {post.caption && <p className="text-[#64748B] text-[13px] line-clamp-2">{post.caption}</p>}
              {images[0] && <img loading="lazy" decoding="async" src={images[0]} alt="" className="w-full object-cover rounded-xl mt-2" style={{ maxHeight:80 }} />}
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportModal postId={post.id} postUserId={author?.id} currentUserId={uid} onClose={() => setShowReportModal(false)} />
      )}

      {showOptionsMenu && (
        <OptionsMenu
          post={post}
          isOwner={isOwner}
          currentUserId={uid}
          onClose={() => setShowOptionsMenu(false)}
          onActionDone={handleOptionsAction}
        />
      )}

      {imgViewer.open && images.length > 0 && (
        <ImageViewer
          images={images}
          index={imgViewer.idx}
          onClose={() => setImgViewer({ open:false, idx:0 })}
          onPrev={() => setImgViewer(v => ({ ...v, idx: Math.max(0, v.idx-1) }))}
          onNext={() => setImgViewer(v => ({ ...v, idx: Math.min(images.length-1, v.idx+1) }))}
        />
      )}

      {actionToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[#E2E8F0] backdrop-blur border border-[#E2E8F0] rounded-full px-5 py-2.5 pointer-events-none">
          <p className="text-[#111827] text-sm font-semibold whitespace-nowrap">{actionToast}</p>
        </div>
      )}

      <div
        className="bg-white border border-[#DDE1F0] rounded-[20px] mx-3 mb-3 shadow-[0_1px_2px_rgba(17,21,46,0.04),0_6px_18px_rgba(17,21,46,0.07)] cursor-pointer relative"
        onClick={() => navigate('/post/' + post.id)}
      >
        {post.is_pinned && (
          <div className="flex items-center gap-1.5 px-4 pt-3">
            <Pin size={12} className="text-[#64748B]" />
            <span className="text-[#64748B] text-xs font-medium">Pinned post</span>
          </div>
        )}

        {post.is_boosted && (
          <div className="flex items-center gap-1.5 px-4 pt-3">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7C3AED]/15 text-[#6D28D9] border border-[#7C3AED]/25"><Zap size={10} className="inline -mt-0.5 mr-0.5" />Promoted</span>
          </div>
        )}

        {isRepost && !post.is_pinned && !post.is_boosted && (
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
            <Repeat2 size={13} className="text-[#64748B]" />
            <span className="text-[#64748B] text-xs font-medium">{author?.display_name} reposted</span>
          </div>
        )}

        {/* ── Header: avatar + identity on one row, so the body below can use the full card width ── */}
        <div className="flex items-center gap-3 px-4 pt-3.5">
          <button onClick={e => { e.stopPropagation(); navigate('/profile/' + author?.username); }}
            aria-label={'Open ' + (author?.display_name || 'profile')} className="flex-shrink-0">
            <Avatar url={author?.avatar_url} name={author?.display_name} size={10} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <button onClick={e => { e.stopPropagation(); navigate('/profile/' + author?.username); }}
                className="text-[#111827] font-bold text-[15px] leading-tight hover:underline truncate min-w-0">
                {author?.display_name}
              </button>
              {author?.is_verified && <span className="flex-shrink-0 inline-flex"><VerifiedBadge size={15} /></span>}
              {author?.role === 'blink' && <Crown size={13} className="flex-shrink-0 text-[#B45309]" fill="#FFD700" fillOpacity={0.25} />}
              {author?.role === 'admin' && <ShieldCheck size={13} className="flex-shrink-0 text-[#6D28D9]" />}
            </div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-[#64748B] leading-tight mt-0.5 min-w-0">
              <span className="truncate min-w-0">@{author?.username}</span>
              <span className="flex-shrink-0">·</span>
              <span className="whitespace-nowrap flex-shrink-0">{formatTime(post.created_at)}</span>
              {flagMap[author?.country] && <span className="flex-shrink-0 text-[13px] leading-none">{flagMap[author?.country]}</span>}
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); setShowOptionsMenu(true); }}
            aria-label="Post options"
            className="text-[#64748B] hover:text-[#111827] w-9 h-9 -mr-2 rounded-full hover:bg-[#F1F5F9] active:bg-[#E8EBF5] transition-colors flex-shrink-0 flex items-center justify-center"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* ── Body: caption, quote, video, images — all aligned to the same left/right edges ── */}
        <div className="px-4 pt-3 pb-3 flex flex-col gap-2.5 min-w-0">
          {post.caption && !isRepost && isColoredTextPost(post) && (
            <TextPost text={post.caption} bg={post.bg_color}
              onHashtag={t => navigate('/hashtag/' + t)} onMention={u => navigate('/profile/' + u)} />
          )}
          {post.caption && !isRepost && !isColoredTextPost(post) && (
            <RichCaption text={post.caption}
              onHashtag={t => navigate('/hashtag/' + t)}
              onMention={u => navigate('/profile/' + u)} />
          )}

          {post.caption && post.quoted_post_id && !post.is_repost && (
            <RichCaption text={post.caption}
              onHashtag={t => navigate('/hashtag/' + t)}
              onMention={u => navigate('/profile/' + u)} />
          )}

          {post.quoted_post_id && quotedPost && (
            <div onClick={e => e.stopPropagation()}>
              <QuotedPost quotedPost={quotedPost} navigate={navigate} />
            </div>
          )}

          {post.video_url && (
            <div onClick={e => e.stopPropagation()}>
              <VideoPlayer src={post.video_url} poster={post.video_thumbnail} duration={post.video_duration} />
            </div>
          )}

          {images.length > 0 && (
            <div onClick={e => e.stopPropagation()}>
              <MediaGrid
                images={images}
                onImageClick={(idx) => setImgViewer({ open:true, idx })}
                onDoubleTapLike={() => { if (!liked) handleLike('like'); }}
              />
            </div>
          )}

          {post.location && (
            <p className="text-[#64748B] text-xs flex items-center gap-1"><MapPin size={12} /> {post.location}</p>
          )}

          {post.comments_disabled && (
            <p className="text-[#64748B] text-xs flex items-center gap-1">
              <MessageSquareOff size={11} /> Comments are turned off
            </p>
          )}
        </div>

        {/* One Chats-blue action card: comment · repost · like · views · save · share, all on one line */}
        <div className="px-3 pb-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-stretch rounded-2xl bg-[#0284C7] px-1 shadow-[0_2px_8px_rgba(2,132,199,0.25)]">
            <button onClick={() => setCommentsOpen(true)}
              aria-label="Comment"
              className="flex-1 flex items-center justify-center gap-1.5 text-white px-1 py-3 active:opacity-70 disabled:opacity-50"
              disabled={post.comments_disabled}>
              <MessageCircle size={19} />
              {(post.comments_count||0) > 0 && <span className="text-[13px] font-semibold">{formatNumber(post.comments_count)}</span>}
            </button>

            <div className="relative flex-1 flex justify-center">
              {showRepostMenu && (
                <div className="absolute bottom-11 left-0 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden z-30 shadow-2xl" style={{ minWidth:180 }}>
                  <button onClick={handleDirectRepost}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-sm border-b border-[#E2E8F0]"
                    style={{ color: reposted ? '#10B981':'#111827' }}>
                    <Repeat2 size={16} style={{ color: reposted?'#10B981':'#64748B' }} />
                    {reposted ? 'Undo Repost' : 'Repost'}
                  </button>
                  <button onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-[#111827] text-sm">
                    <Quote size={16} className="text-[#64748B]" /> Quote
                  </button>
                </div>
              )}
              <button onClick={e => { e.stopPropagation(); setShowRepostMenu(!showRepostMenu); setShowReactionPicker(false); }}
                aria-label="Repost"
                className={'flex items-center justify-center gap-1.5 px-1 py-3 active:opacity-70 ' + (reposted ? 'text-[#BBF7D0]' : 'text-white')}>
                <Repeat2 size={19} strokeWidth={reposted ? 2.8 : 2} />
                {repostCount > 0 && <span className="text-[13px] font-semibold">{formatNumber(repostCount)}</span>}
              </button>
            </div>

            <div className="relative flex-1 flex justify-center">
              {showReactionPicker && (
                <div className="absolute bottom-11 left-0 bg-white border border-[#E2E8F0] rounded-full px-2 py-2 flex gap-1 z-30 shadow-2xl" style={{ minWidth:'max-content' }}>
                  {REACTIONS.map(r => (
                    <button key={r.type} onClick={() => handleLike(r.type)}
                      className="text-lg hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F1F5F9]">
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); if (pressed.current) { pressed.current = false; return; } handleLike(reaction||'like'); }}
                onMouseDown={() => { pressed.current = false; longPressTimer.current = setTimeout(() => { pressed.current = true; setShowReactionPicker(true); }, 500); }}
                onMouseUp={() => clearTimeout(longPressTimer.current)}
                onMouseLeave={() => clearTimeout(longPressTimer.current)}
                onTouchStart={e => { e.stopPropagation(); pressed.current = false; longPressTimer.current = setTimeout(() => { pressed.current = true; navigator.vibrate?.(10); setShowReactionPicker(true); }, 450); }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
                onTouchMove={() => clearTimeout(longPressTimer.current)}
                onContextMenu={e => e.preventDefault()}
                aria-label="Like"
                className="flex items-center justify-center gap-1.5 px-1 py-3 text-white active:opacity-70">
                {liked && reaction
                  ? <span className="text-lg leading-none">{getReactionEmoji()}</span>
                  : <Heart size={19} fill={liked ? 'currentColor' : 'none'} />
                }
                {likesCount > 0 && <span className="text-[13px] font-semibold">{formatNumber(likesCount)}</span>}
              </button>
            </div>

            {/* Views — opens the post's insights for the owner */}
            <button
              onClick={isOwner ? handleViewInsights : undefined}
              aria-label="View count"
              className={'flex-1 flex items-center justify-center gap-1.5 px-1 py-3 text-white ' + (isOwner ? 'cursor-pointer active:opacity-70' : 'cursor-default')}>
              <BarChart2 size={19} />
              {(post.views_count||0) > 0 && <span className="text-[13px] font-semibold">{formatNumber(post.views_count)}</span>}
            </button>

            <button onClick={handleSave} aria-label={saved ? 'Remove from saved' : 'Save post'}
              className="flex-1 flex items-center justify-center px-1 py-3 text-white active:opacity-70">
              <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button onClick={handleShare} aria-label="Share post"
              className="flex-1 flex items-center justify-center px-1 py-3 text-white active:opacity-70">
              <Share2 size={19} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Skip re-rendering cards whose props did not change (keeps scrolling and
// pull-to-refresh smooth in long feeds).
export default memo(PostCard);
