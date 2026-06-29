import { useState, useEffect, useRef, useCallback } from 'react';
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
  AlertTriangle,
} from 'lucide-react';
import Avatar from './Avatar';
import ImageViewer from './ImageViewer';

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
  { emoji:'😮', type:'wow',   color:'#FF6B35' },
  { emoji:'😢', type:'sad',   color:'#6B7280' },
  { emoji:'😡', type:'angry', color:'#EF4444' },
  { emoji:'🔥', type:'fire',  color:'#FF6B35' },
];

/* ═══════════════════════════════════════════════
   RICH CAPTION
═══════════════════════════════════════════════ */
function RichCaption({ text, onHashtag, onMention }) {
  if (!text) return null;
  return (
    <p className="text-white/90 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
      {text.split(/(#\w+|@\w+)/g).map((p, i) => {
        if (p.startsWith('#'))
          return <button key={i} onClick={e => { e.stopPropagation(); onHashtag(p.slice(1)); }} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@'))
          return <button key={i} onClick={e => { e.stopPropagation(); onMention(p.slice(1)); }} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

/* ═══════════════════════════════════════════════
   MEDIA GRID — existing layout preserved
═══════════════════════════════════════════════ */
function MediaGrid({ images, onImageClick }) {
  if (!images?.length) return null;
  const n = images.length;
  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-white/10">
      {n === 1 && (
        <img src={images[0]} alt="" className="w-full object-cover cursor-pointer"
          style={{ maxHeight:420 }} loading="lazy" decoding="async"
          onClick={e => { e.stopPropagation(); onImageClick?.(0); }} />
      )}
      {n === 2 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.map((img,i) => (
            <img key={i} src={img} alt="" className="w-full object-cover cursor-pointer"
              style={{ aspectRatio:'1/1' }} loading="lazy" decoding="async"
              onClick={e => { e.stopPropagation(); onImageClick?.(i); }} />
          ))}
        </div>
      )}
      {n === 3 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr' }}>
          <img src={images[0]} alt="" className="row-span-2 w-full h-full object-cover cursor-pointer"
            style={{ aspectRatio:'1/2' }} loading="lazy" decoding="async"
            onClick={e => { e.stopPropagation(); onImageClick?.(0); }} />
          <img src={images[1]} alt="" className="w-full object-cover cursor-pointer"
            style={{ aspectRatio:'1/1' }} loading="lazy" decoding="async"
            onClick={e => { e.stopPropagation(); onImageClick?.(1); }} />
          <img src={images[2]} alt="" className="w-full object-cover cursor-pointer"
            style={{ aspectRatio:'1/1' }} loading="lazy" decoding="async"
            onClick={e => { e.stopPropagation(); onImageClick?.(2); }} />
        </div>
      )}
      {n >= 4 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.slice(0,4).map((img,i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="w-full object-cover cursor-pointer"
                style={{ aspectRatio:'1/1' }} loading="lazy" decoding="async"
                onClick={e => { e.stopPropagation(); onImageClick?.(i); }} />
              {i === 3 && n > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                  onClick={e => { e.stopPropagation(); onImageClick?.(3); }}>
                  <span className="text-white font-bold text-2xl">+{n-4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VIDEO PLAYER — auto-pause + visibility
═══════════════════════════════════════════════ */
function VideoPlayer({ src, poster, duration }) {
  const videoRef       = useRef();
  const containerRef   = useRef();
  const videoId        = useRef(Math.random().toString(36).slice(2));
  const [playing,      setPlaying]      = useState(false);
  const [muted,        setMuted]        = useState(true);
  const [buffering,    setBuffering]    = useState(false);
  const [error,        setError]        = useState(false);
  const [progress,     setProgress]     = useState(0);

  /* Auto-pause when another video plays */
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

  /* IntersectionObserver — pause when scrolled out */
  useEffect(() => {
    const el  = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        if (!entries[0].isIntersecting && videoRef.current && playing) {
          videoRef.current.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [playing]);

  /* Page visibility — pause when tab hidden */
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

  const toggle = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      setGlobalActiveVideo(videoId.current); // pause all others
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
    <div className="w-full bg-black/40 rounded-2xl flex items-center justify-center gap-2 py-10 border border-white/10">
      <AlertTriangle size={18} className="text-red-400" />
      <span className="text-white/60 text-sm">Video unavailable</span>
    </div>
  );

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden bg-black mb-2 border border-white/10"
      style={{ aspectRatio:'16/9' }}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={muted}
        playsInline
        preload="metadata"
        loop={false}
        className="w-full h-full object-cover"
        onEnded={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onError={() => setError(true)}
      />

      {/* Play/pause overlay */}
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

      {/* Controls bar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-4"
        style={{ background:'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
        {/* Progress bar */}
        <div className="w-full h-[3px] bg-white/20 rounded-full mb-2 cursor-pointer"
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
   QUOTED POST
═══════════════════════════════════════════════ */
function QuotedPost({ quotedPost, navigate }) {
  if (!quotedPost) return null;
  const a    = quotedPost.users;
  const imgs = quotedPost.media_urls || [];
  return (
    <div className="border border-white/15 rounded-2xl p-3 mb-2 bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] transition-colors"
      onClick={e => { e.stopPropagation(); navigate('/post/' + quotedPost.id); }}>
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
      {quotedPost.caption && <p className="text-white/75 text-[13px] leading-snug line-clamp-3 mb-1">{quotedPost.caption}</p>}
      {imgs.length > 0 && <img src={imgs[0]} alt="" className="w-full object-cover rounded-xl" style={{ maxHeight:160 }} loading="lazy" />}
      {quotedPost.video_url && !imgs.length && (
        <div className="w-full bg-black/40 rounded-xl flex items-center justify-center gap-2 py-4">
          <Play size={18} color="white" fill="white" /><span className="text-white text-xs">Video</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REPORT MODAL
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
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Report Post</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
        </div>
        {done ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold">Report submitted</p>
            <p className="text-[#6B7280] text-sm mt-1">Thank you. Our team will review this.</p>
            <button onClick={onClose} className="mt-4 bg-[#1E6FFF] text-white px-6 py-2.5 rounded-full font-bold text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {REASONS.map(r => (
                <button key={r} onClick={() => setSelected(r)}
                  className={'w-full text-left px-4 py-3 rounded-xl text-sm border transition-all ' +
                    (selected === r ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/50 text-white font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.07]')}>
                  {r}
                </button>
              ))}
            </div>
            {selected && (
              <textarea value={details} onChange={e => setDetails(e.target.value)}
                placeholder="Additional details (optional)..." rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none resize-none mb-4" />
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
   OPTIONS MENU — full owner + other-user menus
═══════════════════════════════════════════════ */
function OptionsMenu({ post, isOwner, currentUserId, onClose, onActionDone }) {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const [busy,    setBusy]    = useState(null); // which action is loading
  const [toast,   setToast]   = useState('');
  const [confirm, setConfirm] = useState(null); // { label, fn }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (err) { showToast('Error: ' + err.message); }
    setBusy(null);
  };

  /* ── Owner actions ── */
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
    await navigator.clipboard.writeText(url);
    showToast('🔗 Link copied!');
  };

  const handleShare = async () => {
    const url = window.location.origin + '/post/' + post.id;
    if (navigator.share) {
      await navigator.share({ title: 'Check this on B-Link', url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('🔗 Link copied!');
    }
  };

  const handleToggleComments = () => run('comments', async () => {
    const newVal = !post.comments_disabled;
    await supabase.from('posts').update({ comments_disabled: newVal }).eq('id', post.id).eq('user_id', currentUserId);
    showToast(newVal ? '💬 Comments disabled' : '💬 Comments enabled');
    onActionDone('comments', { comments_disabled: newVal });
  });

  const handleArchive = () => run('archive', async () => {
    await supabase.from('posts').update({ status: 'archived' }).eq('id', post.id).eq('user_id', currentUserId);
    showToast('📦 Post archived');
    onActionDone('archive');
    onClose();
  });

  const handleDelete = async () => {
    setBusy('delete');
    await supabase.from('likes').delete().eq('post_id', post.id);
    await supabase.from('comments').delete().eq('post_id', post.id);
    await supabase.from('saved_posts').delete().eq('post_id', post.id);
    await supabase.from('reports').delete().eq('target_id', post.id).eq('target_type','post');
    await supabase.from('posts').delete().eq('id', post.id).eq('user_id', currentUserId);
    setBusy(null);
    showToast('🗑️ Post deleted');
    onActionDone('delete');
    onClose();
  };

  /* ── Other-user actions ── */
  const handleSave = () => run('save', async () => {
    const { data: existing } = await supabase.from('saved_posts')
      .select('id').eq('post_id', post.id).eq('user_id', currentUserId).maybeSingle();
    if (existing) {
      await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', currentUserId);
      showToast('Removed from saved');
    } else {
      await supabase.from('saved_posts').upsert({ post_id: post.id, user_id: currentUserId, collection:'Saved Posts' }, { onConflict:'post_id,user_id' });
      showToast('✅ Post saved!');
    }
    onActionDone('save');
  });

  const handleViewProfile = () => {
    onClose();
    navigate('/profile/' + post.users?.username);
  };

  const handleHide = () => run('hide', async () => {
    // Client-side hide — store in local hidden list
    const hidden = JSON.parse(localStorage.getItem('blink_hidden_posts') || '[]');
    if (!hidden.includes(post.id)) hidden.push(post.id);
    localStorage.setItem('blink_hidden_posts', JSON.stringify(hidden));
    showToast('🙈 Post hidden from feed');
    onActionDone('hide');
    onClose();
  });

  const handleMute = () => run('mute', async () => {
    const muted = JSON.parse(localStorage.getItem('blink_muted_users') || '[]');
    const uid   = post.users?.id || post.user_id;
    if (!muted.includes(uid)) muted.push(uid);
    localStorage.setItem('blink_muted_users', JSON.stringify(muted));
    showToast('🔕 @' + post.users?.username + ' muted');
    onClose();
  });

  const handleBlock = () => run('block', async () => {
    await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', post.user_id);
    await supabase.from('follows').delete().eq('follower_id', post.user_id).eq('following_id', currentUserId);
    showToast('🚫 User blocked');
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
    { key:'block',   icon: UserX,     label:'Block User',    action: handleBlock,      danger: true  },
    { key:'report',  icon: Flag,      label:'Report Post',   action: () => { onClose(); setTimeout(() => onActionDone('report'), 100); }, danger: true },
  ];

  const items = isOwner ? OWNER_ITEMS : OTHER_ITEMS;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl pb-safe overflow-hidden"
        style={{ paddingBottom:'max(16px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>

        {/* Toast */}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/15 backdrop-blur border border-white/20 rounded-full px-4 py-2 z-10">
            <p className="text-white text-sm font-semibold">{toast}</p>
          </div>
        )}

        {/* Confirm dialog */}
        {confirm && (
          <div className="p-5">
            <p className="text-white font-bold text-base mb-1">Are you sure?</p>
            <p className="text-white/60 text-sm mb-5">{confirm.label}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white/70 bg-white/10 hover:bg-white/15 transition-colors">
                Cancel
              </button>
              <button onClick={confirm.fn} disabled={!!busy}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy === 'delete'
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting...</>
                  : '🗑️ Delete'
                }
              </button>
            </div>
          </div>
        )}

        {!confirm && (
          <>
            {/* Post preview */}
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <Avatar url={post.users?.avatar_url} name={post.users?.display_name} size={8} />
                <div className="min-w-0">
                  <p className="text-white font-bold text-[13px] truncate">{post.users?.display_name}</p>
                  {post.caption && <p className="text-white/40 text-[12px] truncate">{post.caption.slice(0,60)}</p>}
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1 max-h-[60vh] overflow-y-auto">
              {items.map(item => {
                const Icon = item.isAvatar ? null : item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={item.action}
                    disabled={!!busy && busy !== item.key}
                    className={'w-full flex items-center gap-4 px-5 py-3.5 transition-all active:scale-[0.98] disabled:opacity-40 ' +
                      (item.danger ? 'hover:bg-red-500/10' : 'hover:bg-white/[0.05]')}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.danger ? 'bg-red-500/15' : 'bg-white/[0.07]'}`}>
                      {busy === item.key
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : Icon ? <Icon size={16} className={item.danger ? 'text-red-400' : 'text-[#6B7280]'} /> : null
                      }
                    </div>
                    <span className={`font-semibold text-[14px] ${item.danger ? 'text-red-400' : 'text-white/85'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cancel */}
            <div className="px-4 pt-1 pb-2">
              <button onClick={onClose}
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-white/60 bg-white/[0.06] hover:bg-white/10 transition-colors active:scale-[0.98]">
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
export default function PostCard({ post: initialPost, currentUser, onRefresh }) {
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const longPressTimer = useRef();

  const [post,        setPost]        = useState(initialPost);
  const [liked,       setLiked]       = useState(false);
  const [reaction,    setReaction]    = useState(null);
  const [likesCount,  setLikesCount]  = useState(initialPost.likes_count || 0);
  const [saved,       setSaved]       = useState(false);
  const [reposted,    setReposted]    = useState(false);
  const [repostCount, setRepostCount] = useState(initialPost.reposts_count || 0);
  const [quotedPost,  setQuotedPost]  = useState(null);
  const [imgViewer,   setImgViewer]   = useState({ open:false, idx:0 });

  const [showMenu,           setShowMenu]           = useState(false);
  const [showOptionsMenu,    setShowOptionsMenu]     = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRepostMenu,     setShowRepostMenu]     = useState(false);
  const [showQuoteModal,     setShowQuoteModal]     = useState(false);
  const [showReportModal,    setShowReportModal]    = useState(false);
  const [quoteText,          setQuoteText]          = useState('');
  const [actionToast,        setActionToast]        = useState('');

  const uid      = currentUser?.id || user?.id;
  const author   = post.users;
  const isOwner  = (author?.id || post.user_id) === uid;
  const images   = post.media_urls || [];
  const isRepost = post.is_repost && post.quoted_post_id;

  const showToast = (msg) => { setActionToast(msg); setTimeout(() => setActionToast(''), 2000); };

  useEffect(() => {
    checkLiked(); checkSaved(); checkReposted();
    if (post.quoted_post_id) fetchQuotedPost();
  }, [post.id]);

  /* Update post state when parent refreshes */
  useEffect(() => { setPost(initialPost); setLikesCount(initialPost.likes_count || 0); }, [initialPost]);

  const fetchQuotedPost = async () => {
    const { data } = await supabase.from('posts')
      .select('id, caption, media_urls, video_url, created_at, user_id, users!posts_user_id_fkey(id,username,display_name,avatar_url,is_verified)')
      .eq('id', post.quoted_post_id).maybeSingle();
    if (data) setQuotedPost({ ...data, users: data['users!posts_user_id_fkey'] || data.users });
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

  const handleLike = async (type = 'like') => {
    setShowReactionPicker(false);
    if (liked && reaction === type) {
      setLiked(false); setReaction(null); setLikesCount(c => Math.max(0, c-1));
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', uid);
      await supabase.from('posts').update({ likes_count: Math.max(0, likesCount-1) }).eq('id', post.id);
    } else {
      if (!liked) {
        setLikesCount(c => c+1);
        await supabase.from('posts').update({ likes_count: likesCount+1 }).eq('id', post.id);
        if (author?.id !== uid) {
          await supabase.from('notifications').insert({
            user_id: author?.id, from_user_id: uid, type,
            message:'reacted to your post', ref_id: post.id,
            preview_image: images[0]||null, preview_text: post.caption?.slice(0,60)||null, is_read: false,
          });
        }
      }
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert({ post_id: post.id, user_id: uid, reaction_type: type }, { onConflict:'post_id,user_id' });
    }
  };

  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    if (reposted) {
      setReposted(false); setRepostCount(c => Math.max(0, c-1));
      await supabase.from('posts').delete().eq('user_id', uid).eq('quoted_post_id', post.id).eq('is_repost', true);
      await supabase.from('posts').update({ reposts_count: Math.max(0, repostCount-1) }).eq('id', post.id);
    } else {
      setReposted(true); setRepostCount(c => c+1);
      await supabase.from('posts').insert({ user_id:uid, caption:'', quoted_post_id:post.id, audience:'public', is_draft:false, is_repost:true });
      await supabase.from('posts').update({ reposts_count: repostCount+1 }).eq('id', post.id);
      if (author?.id !== uid) {
        await supabase.from('notifications').insert({ user_id:author?.id, from_user_id:uid, type:'repost', message:'reposted your post', ref_id:post.id, is_read:false });
      }
    }
  };

  const handleQuotePost = async () => {
    if (!quoteText.trim()) return;
    setShowQuoteModal(false);
    await supabase.from('posts').insert({ user_id:uid, caption:quoteText.trim(), quoted_post_id:post.id, audience:'public', is_draft:false, is_repost:false });
    await supabase.from('posts').update({ reposts_count: repostCount+1 }).eq('id', post.id);
    setRepostCount(c => c+1); setQuoteText('');
    if (author?.id !== uid) {
      await supabase.from('notifications').insert({ user_id:author?.id, from_user_id:uid, type:'quote', message:'quoted your post', ref_id:post.id, is_read:false });
    }
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    if (saved) {
      setSaved(false);
      await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', uid);
      showToast('Removed from saved');
    } else {
      setSaved(true);
      await supabase.from('saved_posts').upsert({ post_id:post.id, user_id:uid, collection:'Saved Posts' }, { onConflict:'post_id,user_id' });
      showToast('✅ Post saved');
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const url = window.location.origin + '/post/' + post.id;
    if (navigator.share) navigator.share({ title:'Check this on B-Link', url });
    else { navigator.clipboard.writeText(url); showToast('🔗 Link copied!'); }
    await supabase.from('posts').update({ shares_count: (post.shares_count||0)+1 }).eq('id', post.id);
  };

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
  const getReactionColor = () => REACTIONS.find(r => r.type === reaction)?.color || '#6B7280';

  // Skip hidden posts
  const hiddenPosts = JSON.parse(localStorage.getItem('blink_hidden_posts') || '[]');
  if (hiddenPosts.includes(post.id)) return null;

  // Skip muted users
  const mutedUsers = JSON.parse(localStorage.getItem('blink_muted_users') || '[]');
  if (mutedUsers.includes(post.user_id)) return null;

  return (
    <>
      {/* Quote modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowQuoteModal(false)}>
          <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowQuoteModal(false)} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
              <h3 className="text-white font-bold">Quote Post</h3>
              <button onClick={handleQuotePost} disabled={!quoteText.trim()}
                className="bg-[#1E6FFF] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40">Post</button>
            </div>
            <textarea autoFocus value={quoteText} onChange={e => setQuoteText(e.target.value)}
              placeholder="Add a comment..." maxLength={500} rows={3}
              className="w-full bg-transparent text-white text-[16px] placeholder-[#6B7280] focus:outline-none resize-none leading-relaxed mb-3" />
            <div className="border border-white/15 rounded-2xl p-3 bg-white/[0.03]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-white font-bold text-[13px]">{author?.display_name}</span>
                <span className="text-[#6B7280] text-[12px]">@{author?.username}</span>
              </div>
              {post.caption && <p className="text-white/70 text-[13px] line-clamp-2">{post.caption}</p>}
              {images[0] && <img src={images[0]} alt="" className="w-full object-cover rounded-xl mt-2" style={{ maxHeight:80 }} />}
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReportModal && (
        <ReportModal postId={post.id} postUserId={author?.id} currentUserId={uid} onClose={() => setShowReportModal(false)} />
      )}

      {/* Options menu */}
      {showOptionsMenu && (
        <OptionsMenu
          post={post}
          isOwner={isOwner}
          currentUserId={uid}
          onClose={() => setShowOptionsMenu(false)}
          onActionDone={handleOptionsAction}
        />
      )}

      {/* Image viewer */}
      {imgViewer.open && images.length > 0 && (
        <ImageViewer
          images={images}
          index={imgViewer.idx}
          onClose={() => setImgViewer({ open:false, idx:0 })}
          onPrev={() => setImgViewer(v => ({ ...v, idx: Math.max(0, v.idx-1) }))}
          onNext={() => setImgViewer(v => ({ ...v, idx: Math.min(images.length-1, v.idx+1) }))}
        />
      )}

      {/* Toast */}
      {actionToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-white/15 backdrop-blur border border-white/20 rounded-full px-5 py-2.5 pointer-events-none">
          <p className="text-white text-sm font-semibold whitespace-nowrap">{actionToast}</p>
        </div>
      )}

      {/* ── MAIN CARD ── */}
      <div
        className="border-b border-white/[0.07] hover:bg-white/[0.015] transition-colors cursor-pointer relative"
        onClick={() => navigate('/post/' + post.id)}
      >
        {/* Pin indicator */}
        {post.is_pinned && (
          <div className="flex items-center gap-1.5 px-4 pt-2">
            <Pin size={12} className="text-[#6B7280]" />
            <span className="text-[#6B7280] text-xs font-medium">Pinned post</span>
          </div>
        )}

        {/* Boosted indicator */}
        {post.is_boosted && (
          <div className="flex items-center gap-1.5 px-4 pt-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF6B35]/15 text-[#FF6B35] border border-[#FF6B35]/25">⚡ Promoted</span>
          </div>
        )}

        {/* Repost label */}
        {isRepost && !post.is_pinned && !post.is_boosted && (
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
            <Repeat2 size={13} className="text-[#6B7280]" />
            <span className="text-[#6B7280] text-xs font-medium">{author?.display_name} reposted</span>
          </div>
        )}

        <div className="flex gap-3 px-4 pt-3 pb-2">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); navigate('/profile/' + author?.username); }}>
              <Avatar url={author?.avatar_url} name={author?.display_name} size={10} />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            {/* Author row */}
            <div className="flex items-start justify-between gap-1 mb-0.5">
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                <button onClick={e => { e.stopPropagation(); navigate('/profile/' + author?.username); }}
                  className="text-white font-bold text-[14px] hover:underline truncate max-w-[120px]">
                  {author?.display_name}
                </button>
                {author?.is_verified && <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>}
                {author?.role === 'blink'  && <span className="text-[10px] flex-shrink-0">👑</span>}
                {author?.role === 'admin'  && <span className="text-[10px] flex-shrink-0">🛡️</span>}
                <span className="text-[#6B7280] text-[13px] truncate max-w-[80px]">@{author?.username}</span>
                <span className="text-[#6B7280] text-[13px]">·</span>
                <span className="text-[#6B7280] text-[13px] whitespace-nowrap">{formatTime(post.created_at)}</span>
                {flagMap[author?.country] && <span className="text-[13px]">{flagMap[author?.country]}</span>}
              </div>

              {/* ⋯ Options — opens full options menu */}
              <button
                onClick={e => { e.stopPropagation(); setShowOptionsMenu(true); }}
                className="text-[#6B7280] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Caption */}
            {post.caption && !isRepost && (
              <div className="mb-2">
                <RichCaption text={post.caption}
                  onHashtag={t => { navigate('/hashtag/' + t); }}
                  onMention={u => { navigate('/profile/' + u); }} />
              </div>
            )}

            {/* Quote post caption */}
            {post.caption && post.quoted_post_id && !post.is_repost && (
              <div className="mb-2">
                <RichCaption text={post.caption}
                  onHashtag={t => navigate('/hashtag/' + t)}
                  onMention={u => navigate('/profile/' + u)} />
              </div>
            )}

            {/* Quoted post */}
            {post.quoted_post_id && quotedPost && (
              <div onClick={e => e.stopPropagation()}>
                <QuotedPost quotedPost={quotedPost} navigate={navigate} />
              </div>
            )}

            {/* Video */}
            {post.video_url && (
              <div onClick={e => e.stopPropagation()}>
                <VideoPlayer src={post.video_url} poster={post.video_thumbnail} duration={post.video_duration} />
              </div>
            )}

            {/* Images */}
            <div onClick={e => e.stopPropagation()}>
              <MediaGrid images={images} onImageClick={(idx) => setImgViewer({ open:true, idx })} />
            </div>

            {/* Location */}
            {post.location && <p className="text-[#6B7280] text-xs mb-1.5">📍 {post.location}</p>}

            {/* Comments disabled notice */}
            {post.comments_disabled && (
              <p className="text-[#6B7280] text-xs mb-1.5 flex items-center gap-1">
                <MessageSquareOff size={11} /> Comments are turned off
              </p>
            )}

            {/* ── ACTION BAR ── */}
            <div className="flex items-center justify-between mt-1 -ml-2 -mr-1" onClick={e => e.stopPropagation()}>

              {/* Comment */}
              <button onClick={() => navigate('/post/' + post.id)}
                className="flex items-center gap-1.5 text-[#6B7280] hover:text-[#1E6FFF] group px-2 py-1.5 rounded-full hover:bg-[#1E6FFF]/10 transition-all"
                disabled={post.comments_disabled}>
                <MessageCircle size={17} />
                {(post.comments_count||0) > 0 && <span className="text-[13px]">{formatNumber(post.comments_count)}</span>}
              </button>

              {/* Repost dropdown */}
              <div className="relative">
                {showRepostMenu && (
                  <div className="absolute bottom-10 left-0 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-30 shadow-2xl" style={{ minWidth:180 }}>
                    <button onClick={handleDirectRepost}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-sm border-b border-white/5"
                      style={{ color: reposted ? '#2ECC71':'white' }}>
                      <Repeat2 size={16} style={{ color: reposted?'#2ECC71':'#6B7280' }} />
                      {reposted ? 'Undo Repost' : 'Repost'}
                    </button>
                    <button onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-white text-sm">
                      <Quote size={16} className="text-[#6B7280]" /> Quote
                    </button>
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); setShowRepostMenu(!showRepostMenu); setShowReactionPicker(false); }}
                  className={'flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all ' +
                    (reposted ? 'text-[#2ECC71] hover:bg-[#2ECC71]/10' : 'text-[#6B7280] hover:text-[#2ECC71] hover:bg-[#2ECC71]/10')}>
                  <Repeat2 size={17} />
                  {repostCount > 0 && <span className="text-[13px]">{formatNumber(repostCount)}</span>}
                </button>
              </div>

              {/* Like — long press for reactions */}
              <div className="relative">
                {showReactionPicker && (
                  <div className="absolute bottom-10 left-0 bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1 z-30 shadow-2xl" style={{ minWidth:'max-content' }}>
                    {REACTIONS.map(r => (
                      <button key={r.type} onClick={() => handleLike(r.type)}
                        className="text-lg hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); handleLike(reaction||'like'); }}
                  onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                  onMouseUp={() => clearTimeout(longPressTimer.current)}
                  onTouchStart={e => { e.stopPropagation(); longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                  onTouchEnd={() => clearTimeout(longPressTimer.current)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all hover:bg-red-500/10"
                  style={{ color: liked ? getReactionColor() : '#6B7280' }}>
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
                {(post.views_count||0) > 0 && <span className="text-[13px]">{formatNumber(post.views_count)}</span>}
              </button>

              {/* Bookmark + Share */}
              <div className="flex items-center">
                <button onClick={handleSave}
                  className={'px-2 py-1.5 rounded-full transition-all ' +
                    (saved ? 'text-[#1E6FFF] hover:bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}>
                  <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
                </button>
                <button onClick={handleShare}
                  className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-1.5 rounded-full hover:bg-[#1E6FFF]/10 transition-all">
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