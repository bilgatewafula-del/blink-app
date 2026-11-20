// src/pages/flash/BFlash.js
// B-Flash — the dedicated video experience inside B-Link.
// Same account, same posts table, same likes / saves / comments / share / block systems.
// Videos appear here (and on profiles) but never on Home.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Bookmark, Share2, EllipsisVertical, Play, Pause, Volume2, VolumeX,
  Plus, X, Zap, Flag, Settings, Clapperboard, EyeOff, BellOff, Ban, RefreshCw, Link2,
  Maximize, Pin, PinOff, Pencil, Trash2, Eye, Globe, Users, Lock, MessageSquareOff, User, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import FollowButton from '../../components/FollowButton';
import { EmptyState, Spinner } from '../../components/ui';
import { CommentsPanel } from '../../components/post/Comments';
import { ShareSheet } from '../../components/post/Sheets';
import { notifyAdminOnReport } from '../../utils/notifyAdmin';
import { videoSrc } from '../../lib/imageUtils';
import { formatNumber } from '../../utils/formatNumber';
import { usePrefs, setPrefs } from '../../lib/prefs';
import useViewport from '../../lib/useViewport';
import {
  requestPostState, patchPostState, toggleSave, isPostHidden, isUserMuted, hidePost, muteUser, postLink,
} from '../../lib/posts';

/* ── design tokens (change the brand colour in ONE place) ── */
const ACCENT = '#FF5A1F';
const ICON = 24;
const STROKE = 1.9;
const PAGE = 8;
const LOAD_TIMEOUT = 15000;
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const TABS = [['following', 'Following'], ['foryou', 'For You'], ['trending', 'Trending'], ['latest', 'Latest']];

const REPORT_REASONS = [
  'Nudity or sexual content', 'Violence or dangerous content', 'Harassment or bullying',
  'Hate or discrimination', 'Spam or misleading content', 'Copyright infringement', 'Other',
];
const AUDIENCES = [
  { key: 'public', icon: Globe, label: 'Everyone' },
  { key: 'followers', icon: Users, label: 'Followers only' },
  { key: 'private', icon: Lock, label: 'Only me' },
];

const SELECT = `
  id, caption, hashtags, audience, is_pinned, video_url, video_duration, video_thumbnail, post_type,
  likes_count, comments_count, shares_count, views_count, comments_disabled, created_at, user_id,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,is_verified,role)
`.trim();

/* ── device settings that are specific to B-Flash ── */
const FKEY = 'blink_flash_prefs_v1';
const FDEFAULT = { autoscroll: false, pauseOnComments: false, sound: true, speed: 1 };
const readFlashPrefs = () => {
  try { return { ...FDEFAULT, ...(JSON.parse(localStorage.getItem(FKEY)) || {}) }; } catch { return { ...FDEFAULT }; }
};

/* ── videos this device has already shown (so For You doesn't repeat them) ── */
const SEEN_KEY = 'blink_flash_seen_v1';
const readSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch { return new Set(); } };
const markSeen = (id) => {
  try {
    const s = readSeen(); s.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-400)));
  } catch { /* storage blocked */ }
};

/* ── ranking: real engagement signals, freshness, and creator variety ── */
const engagement = (p) => (p.likes_count || 0) + 3 * (p.comments_count || 0) + 4 * (p.shares_count || 0) + 0.1 * (p.views_count || 0);
const ageHours = (p) => Math.max(0, (Date.now() - new Date(p.created_at).getTime()) / 36e5);
const trendScore = (p) => Math.log1p(engagement(p)) / Math.pow(ageHours(p) + 2, 0.8);
const forYouScore = (p, seen) => Math.log1p(engagement(p)) * 0.6 + 4 / Math.pow(ageHours(p) / 6 + 1, 0.7) - (seen.has(p.id) ? 100 : 0);
const spreadCreators = (rows) => {
  const pool = [...rows], out = [];
  while (pool.length) {
    const last = out.length ? out[out.length - 1].user_id : null;
    let i = pool.findIndex((p) => p.user_id !== last);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
};

const withTimeout = (promise, ms = LOAD_TIMEOUT) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
]);

const parseTags = (text) => [...new Set((text || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '').replace(/[^\w]/g, '')).filter(Boolean))].slice(0, 15);

/* ── small shared UI ── */
function RailButton({ icon: Icon, label, count, active, fill, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
    >
      <span className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35">
        <Icon size={ICON} strokeWidth={STROKE} color={active ? ACCENT : '#fff'} fill={active && fill ? ACCENT : 'none'} />
      </span>
      {count !== undefined && (
        <span className="text-white text-[12px] font-semibold leading-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
          {formatNumber(count)}
        </span>
      )}
    </button>
  );
}

function TopIcon({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} aria-label={label} className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
      <Icon size={22} strokeWidth={STROKE} color="#fff" />
    </button>
  );
}

function Toggle({ label, desc, on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on}
      className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-white/[0.04]">
      <span className="flex-1 min-w-0">
        <span className="block text-white text-[15px] font-semibold">{label}</span>
        {desc && <span className="block text-[#8E8C88] text-[12px] mt-0.5 leading-snug">{desc}</span>}
      </span>
      <span className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors" style={{ background: on ? ACCENT : 'rgba(255,255,255,.18)' }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
      </span>
    </button>
  );
}

function Sheet({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/65 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[86vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />
        {title && <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function SheetRow({ icon: Icon, label, value, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-5 py-3.5 active:bg-white/[0.05] text-left">
      <Icon size={20} strokeWidth={STROKE} color={danger ? '#FF5C5C' : '#fff'} />
      <span className="flex-1 text-[15px] font-semibold" style={{ color: danger ? '#FF5C5C' : '#fff' }}>{label}</span>
      {value && <span className="text-[13px] text-[#8E8C88]">{value}</span>}
    </button>
  );
}

function Chips({ options, value, onPick, format = (v) => v }) {
  return (
    <div className="flex gap-2 px-5 py-2 flex-wrap">
      {options.map((o) => (
        <button key={o} onClick={() => onPick(o)} aria-pressed={value === o}
          className="px-3.5 h-9 rounded-full text-[13px] font-bold transition-colors"
          style={{ background: value === o ? ACCENT : 'rgba(255,255,255,.08)', color: '#fff' }}>
          {format(o)}
        </button>
      ))}
    </div>
  );
}

/* ── creator side panel (swipe left on a video, or tap the creator) ── */
function CreatorPanel({ post, isMe, onClose, onOpenProfile, onMute, onBlock }) {
  const u = post.users || {};
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const start = useRef(null);

  useEffect(() => { const id = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      let res = await supabase.from('users').select('bio, followers_count, following_count, posts_count').eq('id', u.id).maybeSingle();
      if (res.error) res = await supabase.from('users').select('followers_count, following_count, posts_count').eq('id', u.id).maybeSingle();
      if (alive && res.data) setInfo(res.data);
    })();
    return () => { alive = false; };
  }, [u.id]);

  const close = () => { setOpen(false); setTimeout(onClose, 200); };

  return (
    <div className="absolute inset-0 z-30 bg-[#0D0C0B] overflow-y-auto"
      style={{ transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .2s ease', touchAction: 'pan-y' }}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const s = start.current; start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (dx > 80 && dx > Math.abs(dy) * 1.6) close();
      }}>
      <div className="flex items-center px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button onClick={close} aria-label="Back to video" className="w-11 h-11 flex items-center justify-center text-white"><X size={22} /></button>
        <p className="text-white font-bold text-[15px]">Creator</p>
      </div>
      <div className="flex flex-col items-center px-6 pt-4 pb-8 text-center">
        <span className="block rounded-full p-[3px]" style={{ background: ACCENT }}>
          <Avatar url={u.avatar_url} name={u.display_name || u.username} size={20} />
        </span>
        <div className="flex items-center gap-1.5 mt-3">
          <p className="text-white font-extrabold text-[18px]">{u.display_name || u.username}</p>
          {u.is_verified && <VerifiedBadge size={17} />}
        </div>
        <p className="text-[#8E8C88] text-[14px]">@{u.username}</p>
        <div className="flex gap-8 mt-5">
          {[['Followers', info?.followers_count], ['Following', info?.following_count], ['Posts', info?.posts_count]].map(([l, v]) => (
            <div key={l}>
              <p className="text-white font-extrabold text-[17px]">{info ? formatNumber(v || 0) : '–'}</p>
              <p className="text-[#8E8C88] text-[12px]">{l}</p>
            </div>
          ))}
        </div>
        {info?.bio && <p className="text-white/80 text-[14px] leading-snug mt-4 max-w-[320px] whitespace-pre-wrap">{info.bio}</p>}
        <div className="w-full max-w-[320px] mt-6 flex flex-col gap-3">
          {!isMe && <FollowButton targetId={u.id} username={u.username} displayName={u.display_name} avatarUrl={u.avatar_url} size="lg" />}
          <button onClick={onOpenProfile} className="w-full h-12 rounded-xl bg-white/10 text-white font-bold flex items-center justify-center gap-2">
            <User size={18} /> View full profile
          </button>
        </div>
      </div>
      {!isMe && (
        <div className="border-t border-white/10 pb-8">
          <SheetRow icon={BellOff} label="Mute creator" onClick={onMute} />
          <SheetRow icon={Ban} label="Block creator" danger onClick={onBlock} />
        </div>
      )}
    </div>
  );
}

/* ── one video panel ── */
function Slide({
  post, active, isNext, muted, canPlay, split, loopVideo, saver, speed, toggleReq, st,
  onVideoRef, onSoundBlocked, onLike, onDoubleLike, onComment, onSave, onShare, onMore, onLongPress,
  onCreator, onEnded,
}) {
  const vref = useRef(null);
  const barRef = useRef(null);
  const userPaused = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const pressTimer = useRef(null);
  const gesture = useRef(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [burst, setBurst] = useState(0);
  const src = videoSrc(post.video_url);
  const u = post.users || {};

  useEffect(() => { if (vref.current) vref.current.muted = muted; }, [muted]);
  useEffect(() => { if (vref.current) vref.current.playbackRate = speed; }, [speed]);
  useEffect(() => () => { clearTimeout(tapTimer.current); clearTimeout(pressTimer.current); }, []);

  const tryPlay = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    const p = v.play();
    if (!p || !p.then) return;
    p.then(() => setPaused(false)).catch((err) => {
      if (err && err.name === 'NotAllowedError' && !v.muted) {       // browser blocked sound: start muted instead
        v.muted = true;
        onSoundBlocked();
        const p2 = v.play();
        if (p2 && p2.then) p2.then(() => setPaused(false)).catch(() => setPaused(true));
      } else setPaused(true);
    });
  }, [onSoundBlocked]);

  const toggle = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) { userPaused.current = false; tryPlay(); }
    else { userPaused.current = true; v.pause(); setPaused(true); }
  }, [tryPlay]);

  // pause / resume requested from the video menu
  useEffect(() => { if (active && toggleReq.n && toggleReq.id === post.id) toggle(); }, [toggleReq.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // play only the visible video, and only when the viewer's settings allow it
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (!active) {
      v.pause();
      userPaused.current = false;
      try { v.currentTime = 0; } catch { /* not ready yet */ }
      if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
      setPaused(false);
      return;
    }
    if (canPlay && !userPaused.current) tryPlay();
    else { v.pause(); setPaused(true); }
  }, [active, canPlay, tryPlay]);

  // pause when the app goes to the background
  useEffect(() => {
    const onVis = () => {
      const v = vref.current;
      if (!v || !active) return;
      if (document.hidden) v.pause();
      else if (canPlay && !userPaused.current) tryPlay();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, canPlay, tryPlay]);

  /* tap = play/pause · double tap = like · hold = menu · horizontal swipe = creator */
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((b) => b + 1);
      onDoubleLike();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(toggle, 280);
  };
  const onPointerDown = (e) => {
    gesture.current = { x: e.clientX, y: e.clientY, long: false, moved: false };
    clearTimeout(pressTimer.current);
    if (split) return;
    pressTimer.current = setTimeout(() => {
      const g = gesture.current;
      if (g && !g.moved) {
        g.long = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* unsupported */ }
        onLongPress();
      }
    }, 480);
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (Math.abs(e.clientX - g.x) > 10 || Math.abs(e.clientY - g.y) > 10) { g.moved = true; clearTimeout(pressTimer.current); }
  };
  const onPointerUp = (e) => {
    clearTimeout(pressTimer.current);
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.long) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!split && dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.6) { onCreator(); return; }
    if (g.moved) return;
    handleTap();
  };
  const onPointerCancel = () => { clearTimeout(pressTimer.current); gesture.current = null; };

  const onTimeUpdate = () => {
    const v = vref.current, b = barRef.current;
    if (!v || !b || !v.duration) return;
    b.style.transform = 'scaleX(' + Math.min(1, v.currentTime / v.duration) + ')';
  };

  return (
    <section className="relative w-full h-full overflow-hidden bg-black" aria-label={'Video by ' + (u.username || 'creator')}>
      <div className="absolute left-0 right-0 top-0 overflow-hidden bg-black" style={{ height: split ? '38%' : '100%', transition: 'height .25s ease' }}>
        <video
          ref={(el) => { vref.current = el; onVideoRef(post.id, el); }}
          src={src}
          poster={post.video_thumbnail || undefined}
          playsInline
          muted={muted}
          loop={loopVideo}
          preload={active ? 'auto' : (isNext && !saver ? 'metadata' : 'none')}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: landscape || split ? 'contain' : 'cover' }}
          onLoadedMetadata={() => { const v = vref.current; if (v) { setLandscape(v.videoWidth > v.videoHeight); v.playbackRate = speed; } }}
          onTimeUpdate={onTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => { setBuffering(false); setPaused(false); }}
          onCanPlay={() => setBuffering(false)}
          onEnded={onEnded}
        />
        <div
          className="absolute inset-0 select-none"
          style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          role="button" aria-label={paused ? 'Play video' : 'Pause video'}
        />

        {paused && active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-16 h-16 rounded-full bg-black/45 flex items-center justify-center"><Play size={30} color="#fff" fill="#fff" /></span>
          </div>
        )}
        {buffering && active && !paused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white"><Spinner size={28} /></div>
        )}
        {burst > 0 && (
          <Heart key={burst} size={96} color={ACCENT} fill={ACCENT}
            className="absolute pointer-events-none motion-reduce:hidden"
            style={{ left: '50%', top: '50%', animation: 'heartPop .8s ease-out forwards' }} />
        )}
        <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/20 pointer-events-none">
          <div ref={barRef} className="h-full origin-left" style={{ background: ACCENT, transform: 'scaleX(0)' }} />
        </div>
      </div>

      {!split && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78), transparent)' }} />
          <div className="absolute left-4 right-[76px] bottom-[18px] pointer-events-none">
            <button onClick={onCreator} className="pointer-events-auto flex items-center gap-2 mb-2 max-w-full">
              <span className="text-white font-bold text-[15px] truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>@{u.username || 'unknown'}</span>
              {u.is_verified && <VerifiedBadge size={15} />}
              {post.is_pinned && <Pin size={13} color="#fff" />}
            </button>
            {post.caption && (
              <p className="text-white text-[14px] leading-snug line-clamp-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>{post.caption}</p>
            )}
          </div>
          <div className="absolute right-3 bottom-[18px] flex flex-col items-center gap-4">
            <button onClick={onCreator} aria-label={'Open ' + (u.username || 'creator') + ' details'} className="active:scale-90 transition-transform">
              <span className="block rounded-full p-[2px]" style={{ background: ACCENT }}>
                <Avatar url={u.avatar_url} name={u.display_name || u.username} size={10} />
              </span>
            </button>
            <RailButton icon={Heart} label={st.liked ? 'Unlike' : 'Like'} active={st.liked} fill count={st.likes} onClick={onLike} />
            <RailButton icon={MessageCircle} label="Comments" count={st.comments} onClick={onComment} />
            <RailButton icon={Bookmark} label={st.saved ? 'Remove from saved' : 'Save'} active={st.saved} fill onClick={onSave} />
            <RailButton icon={Share2} label="Share" onClick={onShare} />
            <RailButton icon={EllipsisVertical} label="Video options" onClick={onMore} />
          </div>
        </>
      )}
    </section>
  );
}

export default function BFlash() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const prefs = usePrefs();
  const vp = useViewport();

  const [fp, setFp] = useState(readFlashPrefs);
  const [tab, setTab] = useState('foryou');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(() => !readFlashPrefs().sound);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [ov, setOv] = useState({});
  const [commentsId, setCommentsId] = useState(null);
  const [creatorId, setCreatorId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const [panel, setPanel] = useState(null);        // { type, id } for edit | visibility | insights | report | confirm-delete | confirm-block
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toggleReq, setToggleReq] = useState({ id: null, n: 0 });
  const [toast, setToast] = useState(null);
  const [navH, setNavH] = useState(80);

  const scRef = useRef(null);
  const cursorRef = useRef(null);
  const offsetRef = useRef(0);
  const trendRef = useRef([]);
  const reqRef = useRef(0);
  const followRef = useRef(null);
  const failedAt = useRef(-1);
  const toastT = useRef(null);
  const videoEls = useRef({});

  const saver = !!prefs.data_saver;
  const kb = typeof window !== 'undefined' && window.innerHeight - vp.h > 150;

  useEffect(() => {
    const el = document.querySelector('.bottom-nav');
    if (!el) return undefined;
    const update = () => setNavH(el.offsetHeight || 80);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, []);

  useEffect(() => () => clearTimeout(toastT.current), []);
  const say = useCallback((t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2200); }, []);

  const setFlashPref = (patch) => {
    setFp((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem(FKEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  };
  const toggleSound = () => {
    const nowMuted = !muted;
    setMuted(nowMuted);
    setSoundBlocked(false);
    setFlashPref({ sound: !nowMuted });      // remember what the viewer chose; never forced again
  };
  const onSoundBlocked = useCallback(() => { setMuted(true); setSoundBlocked(true); }, []);
  const onVideoRef = useCallback((id, el) => { if (el) videoEls.current[id] = el; else delete videoEls.current[id]; }, []);

  /* ── data ── */
  const hydrate = useCallback((rows) => {
    if (!user?.id) return;
    rows.forEach((p) => {
      requestPostState(user.id, p.id).then((st) => {
        setOv((o) => ({ ...o, [p.id]: { liked: st.liked, saved: st.saved, reaction: st.reaction, ...(o[p.id] || {}) } }));
      });
    });
  }, [user?.id]);

  const baseQuery = useCallback(() => supabase.from('posts').select(SELECT)
    .not('video_url', 'is', null)
    .eq('is_draft', false)
    .eq('audience', 'public')
    .neq('status', 'deleted')
    .neq('status', 'hidden'), []);

  const clean = (raw) => raw
    .map((p) => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users || null }))
    .filter((p) => !isPostHidden(p.id) && !isUserMuted(p.user_id));

  // returns { rows, done } and advances cursor / offset for the next page
  const fetchPage = useCallback(async (which, first) => {
    if (which === 'trending') {
      if (first) {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const { data, error: e } = await baseQuery().gte('created_at', since).order('likes_count', { ascending: false }).limit(80);
        if (e) throw e;
        const perCreator = {};
        trendRef.current = clean(data || [])
          .sort((a, b) => trendScore(b) - trendScore(a))
          .filter((p) => { perCreator[p.user_id] = (perCreator[p.user_id] || 0) + 1; return perCreator[p.user_id] <= 2; });
        offsetRef.current = 0;
      }
      const rows = trendRef.current.slice(offsetRef.current, offsetRef.current + PAGE);
      offsetRef.current += PAGE;
      return { rows, done: offsetRef.current >= trendRef.current.length };
    }

    let q = baseQuery().order('created_at', { ascending: false }).limit(which === 'foryou' ? PAGE * 2 : PAGE);
    if (!first && cursorRef.current) q = q.lt('created_at', cursorRef.current);
    if (which === 'following') {
      if (!followRef.current) {
        const { data, error: e } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        if (e) throw e;
        followRef.current = [...(data || []).map((f) => f.following_id), user.id];
      }
      q = q.in('user_id', followRef.current);
    }
    const { data, error: e } = await q;
    if (e) throw e;
    const raw = data || [];
    if (raw.length) cursorRef.current = raw[raw.length - 1].created_at;
    let rows = clean(raw);
    if (which === 'foryou') {
      const seen = readSeen();
      rows = spreadCreators([...rows].sort((a, b) => forYouScore(b, seen) - forYouScore(a, seen)));
    }
    return { rows, done: raw.length < (which === 'foryou' ? PAGE * 2 : PAGE) };
  }, [baseQuery, user?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const loadFirst = useCallback(async (which) => {
    const my = ++reqRef.current;
    setLoading(true); setError(''); setItems([]); setActive(0); setHasMore(true); setCommentsId(null); setCreatorId(null);
    cursorRef.current = null; offsetRef.current = 0;
    if (scRef.current) scRef.current.scrollTop = 0;
    try {
      const { rows, done } = await withTimeout(fetchPage(which, true));
      if (my !== reqRef.current) return;
      setItems(rows);
      setHasMore(!done);
      hydrate(rows);
    } catch (e) {
      if (my !== reqRef.current) return;
      setError(navigator.onLine ? 'Videos are taking too long to load.' : 'You appear to be offline.');
    } finally {
      if (my === reqRef.current) setLoading(false);
    }
  }, [fetchPage, hydrate]);

  useEffect(() => { if (user?.id) loadFirst(tab); }, [tab, user?.id, loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    const my = reqRef.current;
    setLoadingMore(true);
    try {
      const { rows, done } = await withTimeout(fetchPage(tab, false));
      if (my !== reqRef.current) return;
      setHasMore(!done);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      hydrate(rows);
    } catch {
      failedAt.current = items.length;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, fetchPage, tab, hydrate, items.length]);

  useEffect(() => { failedAt.current = -1; }, [active]);
  useEffect(() => {
    if (loading || !hasMore || failedAt.current === items.length) return;
    if (items.length - active <= 3) loadMore();
  }, [active, items.length, loading, hasMore, loadMore]);

  /* remember what was actually watched, so For You moves on */
  useEffect(() => {
    const p = items[active];
    if (!p) return undefined;
    const t = setTimeout(() => markSeen(p.id), 1500);
    return () => clearTimeout(t);
  }, [active, items]);

  /* ── which video is on screen ── */
  useEffect(() => {
    const root = scRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.index));
      });
    }, { root, threshold: [0.6] });
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length, loading]);

  const goNext = (i) => {
    const el = scRef.current && scRef.current.querySelector('[data-index="' + (i + 1) + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── per-video state ── */
  const sOf = (p) => {
    const o = ov[p.id] || {};
    return {
      liked: !!o.liked, saved: !!o.saved, reaction: o.reaction || null,
      likes: o.likes ?? p.likes_count ?? 0,
      comments: o.comments ?? p.comments_count ?? 0,
    };
  };
  const patch = (id, v) => setOv((o) => ({ ...o, [id]: { ...(o[id] || {}), ...v } }));
  const updateItem = (id, v) => setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...v } : p)));
  const removeFromFeed = (pred) => setItems((prev) => prev.filter((p) => !pred(p)));

  const like = async (p, onlyAdd = false) => {
    const s = sOf(p);
    if (onlyAdd && s.liked) return;
    const prev = { liked: s.liked, reaction: s.reaction, likes: s.likes };
    const next = !s.liked;
    const type = s.liked ? (s.reaction || 'like') : 'like';
    patch(p.id, { liked: next, reaction: next ? 'like' : null, likes: Math.max(0, s.likes + (next ? 1 : -1)) });
    try {
      const { data, error: e } = await supabase.rpc('toggle_post_like', { p_post_id: p.id, p_reaction_type: type });
      if (e) throw e;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        patch(p.id, { liked: row.liked, reaction: row.reaction, likes: row.likes_count });
        patchPostState(user.id, p.id, { liked: row.liked, reaction: row.reaction });
      }
    } catch {
      patch(p.id, prev);
      say('Couldn’t update like. Try again.');
    }
  };

  const save = async (p) => {
    const s = sOf(p);
    patch(p.id, { saved: !s.saved });
    try {
      const now = await toggleSave(p.id, s.saved);
      patch(p.id, { saved: now });
      patchPostState(user.id, p.id, { saved: now });
      say(now ? 'Saved' : 'Removed from saved');
    } catch {
      patch(p.id, { saved: s.saved });
      say('Couldn’t save. Try again.');
    }
  };

  const bumpComments = (p, d) => setOv((o) => {
    const cur = o[p.id]?.comments ?? p.comments_count ?? 0;
    return { ...o, [p.id]: { ...(o[p.id] || {}), comments: Math.max(0, cur + d) } };
  });

  /* ── actions from the video menu ── */
  const copyLink = async (p) => {
    try { await navigator.clipboard.writeText(postLink(p.id)); say('Link copied'); } catch { say('Couldn’t copy the link'); }
    setMenuId(null);
  };
  const fullscreen = (p) => {
    const v = videoEls.current[p.id];
    setMenuId(null);
    if (!v) return;
    const fn = v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen || v.msRequestFullscreen;
    if (fn) { try { fn.call(v); } catch { say('Full screen isn’t available here'); } } else say('Full screen isn’t available here');
  };
  const notInterested = (p) => { hidePost(p.id); removeFromFeed((x) => x.id === p.id); setMenuId(null); setCreatorId(null); say('We’ll show fewer videos like this'); };
  const muteCreator = (p) => { muteUser(p.user_id); removeFromFeed((x) => x.user_id === p.user_id); setMenuId(null); setCreatorId(null); say('Creator muted'); };
  const blockCreator = async (p) => {
    setPanel(null);
    try {
      const { error: e } = await supabase.rpc('block_user', { p_target_id: p.user_id });
      if (e) throw e;
      removeFromFeed((x) => x.user_id === p.user_id);
      setCreatorId(null); setMenuId(null);
      say('Creator blocked');
    } catch { say('Couldn’t block this account. Try again.'); }
  };
  const ownerUpdate = async (p, fields, okMsg) => {
    const { error: e } = await supabase.from('posts').update(fields).eq('id', p.id).eq('user_id', user.id);
    if (e) { say('Couldn’t save: ' + e.message); return false; }
    updateItem(p.id, fields);
    if (okMsg) say(okMsg);
    return true;
  };
  const deleteVideo = async (p) => {
    setPanel(null);
    try {
      const { error: e } = await supabase.rpc('delete_own_post', { p_post_id: p.id });
      if (e) throw e;
      removeFromFeed((x) => x.id === p.id);
      setMenuId(null);
      say('Video deleted');
    } catch (e) { say('Delete failed: ' + (e.message || 'try again')); }
  };

  const commentsPost = items.find((p) => p.id === commentsId) || null;
  const creatorPost = items.find((p) => p.id === creatorId) || null;
  const menuPost = items.find((p) => p.id === menuId) || null;
  const panelPost = panel ? items.find((p) => p.id === panel.id) || null : null;
  const canPlay = !!prefs.autoplay_videos && !saver && !(commentsId && fp.pauseOnComments);
  const boxStyle = { top: vp.top, height: Math.max(0, vp.h - (kb ? 0 : navH)) };
  const frozen = !!(commentsId || creatorId);

  return (
    <div className="fixed left-0 right-0 z-20 bg-black" style={boxStyle}>
      <style>{'.bflash-sc{scrollbar-width:none}.bflash-sc::-webkit-scrollbar{display:none}'}</style>
      <div className="relative h-full w-full max-w-[480px] mx-auto overflow-hidden">

        <div ref={scRef} className="bflash-sc absolute inset-0 snap-y snap-mandatory"
          style={{ overflowY: frozen ? 'hidden' : 'scroll', overscrollBehavior: 'contain' }}>
          {items.map((p, i) => {
            const inWindow = Math.abs(i - active) <= (saver ? 0 : 1);
            return (
              <div key={p.id} data-index={i} className="w-full h-full snap-start snap-always">
                {inWindow && (
                  <Slide
                    post={p}
                    active={i === active} isNext={i === active + 1}
                    muted={muted} canPlay={canPlay} saver={saver} speed={fp.speed} toggleReq={toggleReq}
                    split={commentsId === p.id}
                    loopVideo={!fp.autoscroll}
                    st={sOf(p)}
                    onVideoRef={onVideoRef} onSoundBlocked={onSoundBlocked}
                    onLike={() => like(p)}
                    onDoubleLike={() => like(p, true)}
                    onComment={() => setCommentsId(p.id)}
                    onSave={() => save(p)}
                    onShare={() => setShareFor(p)}
                    onMore={() => setMenuId(p.id)}
                    onLongPress={() => setMenuId(p.id)}
                    onCreator={() => setCreatorId(p.id)}
                    onEnded={() => goNext(i)}
                  />
                )}
              </div>
            );
          })}
          {loadingMore && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center text-white/70 pointer-events-none"><Spinner size={18} /></div>
          )}
        </div>

        {/* top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
          style={{ paddingTop: 'max(6px, env(safe-area-inset-top))', background: 'linear-gradient(to bottom, rgba(0,0,0,.6), transparent)' }}>
          <div className="flex items-center justify-between pl-4 pr-1">
            <div className="flex items-center gap-1.5">
              <Zap size={20} color={ACCENT} fill={ACCENT} />
              <span className="text-white font-extrabold text-[17px] tracking-tight">B-Flash</span>
            </div>
            <div className="flex items-center pointer-events-auto">
              <TopIcon icon={muted ? VolumeX : Volume2} label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={toggleSound} />
              <TopIcon icon={Settings} label="B-Flash settings" onClick={() => setSettingsOpen(true)} />
              <TopIcon icon={Plus} label="Create a video post" onClick={() => navigate('/create')} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-5 pb-3 pointer-events-auto">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className="relative py-2 text-[14px] font-bold transition-colors" style={{ color: tab === k ? '#fff' : 'rgba(255,255,255,.6)' }}>
                {l}
                {tab === k && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-5 h-[3px] rounded-full" style={{ background: ACCENT }} />}
              </button>
            ))}
          </div>
        </div>

        {soundBlocked && muted && !frozen && items.length > 0 && (
          <button onClick={toggleSound}
            className="absolute left-1/2 -translate-x-1/2 z-10 px-4 h-10 rounded-full bg-black/70 text-white text-[13px] font-bold flex items-center gap-2"
            style={{ top: 'calc(max(6px, env(safe-area-inset-top)) + 98px)' }}>
            <Volume2 size={16} /> Tap to turn sound on
          </button>
        )}

        {loading && <div className="absolute inset-0 flex items-center justify-center text-white"><Spinner size={30} /></div>}
        {!loading && error && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState icon={RefreshCw} title="Couldn’t load videos" text={error}>
              <button onClick={() => loadFirst(tab)} className="px-6 py-2.5 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Try again</button>
            </EmptyState>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState icon={Clapperboard}
              title={tab === 'following' ? 'No videos from people you follow' : tab === 'trending' ? 'Nothing trending yet' : 'No videos yet'}
              text={tab === 'following' ? 'Follow creators to see their videos here, or explore For You.' : 'Be the first to share a video on B-Flash.'}>
              {tab === 'following' && (
                <button onClick={() => setTab('foryou')} className="px-5 py-2.5 rounded-xl text-white font-bold bg-white/10">Explore For You</button>
              )}
              <button onClick={() => navigate('/create')} className="px-5 py-2.5 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Post a video</button>
            </EmptyState>
          </div>
        )}

        {/* SplitView comments (light design) */}
        {commentsPost && (
          <div className="absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-3xl border-t border-[#E4E6EB] flex flex-col" style={{ height: '62%' }}>
            <div className="flex items-center justify-center pt-2.5 pb-1.5 flex-shrink-0 relative">
              <div className="w-10 h-1 rounded-full bg-[#CED0D4]" />
              <button onClick={() => setCommentsId(null)} aria-label="Close comments" className="absolute right-1 top-0 w-11 h-11 flex items-center justify-center text-[#65676B]">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <CommentsPanel
                post={commentsPost}
                count={sOf(commentsPost).comments}
                onCountChange={(d) => bumpComments(commentsPost, d)}
                onNavigate={(path) => navigate(path)}
              />
            </div>
          </div>
        )}

        {creatorPost && (
          <CreatorPanel
            post={creatorPost}
            isMe={creatorPost.user_id === user?.id}
            onClose={() => setCreatorId(null)}
            onOpenProfile={() => creatorPost.users?.username && navigate('/profile/' + creatorPost.users.username)}
            onMute={() => muteCreator(creatorPost)}
            onBlock={() => setPanel({ type: 'confirm-block', id: creatorPost.id })}
          />
        )}

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-40 bg-black/85 text-white text-[13px] font-semibold px-4 py-2 rounded-full whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>

      {shareFor && <ShareSheet post={shareFor} onClose={() => setShareFor(null)} onDone={(m) => { setShareFor(null); if (m) say(m); }} />}

      {/* ── video menu: long-press or ⋮ ── */}
      {menuPost && (() => {
        const mine = menuPost.user_id === user?.id;
        const s = sOf(menuPost);
        const vid = videoEls.current[menuPost.id];
        const isPaused = !vid || vid.paused;
        return (
          <Sheet onClose={() => setMenuId(null)}>
            <p className="px-5 pb-1 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">Playback speed</p>
            <Chips options={SPEEDS} value={fp.speed} onPick={(v) => setFlashPref({ speed: v })} format={(v) => v + '×'} />
            <div className="h-px bg-white/10 my-1" />
            <SheetRow icon={isPaused ? Play : Pause} label={isPaused ? 'Resume video' : 'Pause video'}
              onClick={() => { setToggleReq((r) => ({ id: menuPost.id, n: r.n + 1 })); setMenuId(null); }} />
            {mine ? (
              <>
                <SheetRow icon={Pencil} label="Edit caption & hashtags" onClick={() => { setPanel({ type: 'edit', id: menuPost.id }); setMenuId(null); }} />
                <SheetRow icon={Globe} label="Who can watch" value={(AUDIENCES.find((a) => a.key === menuPost.audience) || AUDIENCES[0]).label}
                  onClick={() => { setPanel({ type: 'visibility', id: menuPost.id }); setMenuId(null); }} />
                <SheetRow icon={menuPost.comments_disabled ? MessageCircle : MessageSquareOff} label={menuPost.comments_disabled ? 'Turn comments on' : 'Turn comments off'}
                  onClick={() => { ownerUpdate(menuPost, { comments_disabled: !menuPost.comments_disabled }, menuPost.comments_disabled ? 'Comments on' : 'Comments off'); setMenuId(null); }} />
                <SheetRow icon={menuPost.is_pinned ? PinOff : Pin} label={menuPost.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
                  onClick={() => { ownerUpdate(menuPost, { is_pinned: !menuPost.is_pinned }, menuPost.is_pinned ? 'Unpinned' : 'Pinned to your profile'); setMenuId(null); }} />
                <SheetRow icon={Eye} label="View analytics" onClick={() => { setPanel({ type: 'insights', id: menuPost.id }); setMenuId(null); }} />
              </>
            ) : (
              <SheetRow icon={Bookmark} label={s.saved ? 'Remove from saved' : 'Save video'} onClick={() => { save(menuPost); setMenuId(null); }} />
            )}
            <SheetRow icon={Link2} label="Copy link" onClick={() => copyLink(menuPost)} />
            <SheetRow icon={Share2} label="Share" onClick={() => { setShareFor(menuPost); setMenuId(null); }} />
            <SheetRow icon={Maximize} label="Full screen" onClick={() => fullscreen(menuPost)} />
            {mine ? (
              <SheetRow icon={Trash2} label="Delete video" danger onClick={() => { setPanel({ type: 'confirm-delete', id: menuPost.id }); setMenuId(null); }} />
            ) : (
              <>
                <SheetRow icon={User} label="View creator" onClick={() => { setCreatorId(menuPost.id); setMenuId(null); }} />
                <SheetRow icon={EyeOff} label="Not interested" onClick={() => notInterested(menuPost)} />
                <SheetRow icon={BellOff} label="Mute creator" onClick={() => muteCreator(menuPost)} />
                <SheetRow icon={Flag} label="Report video" danger onClick={() => { setPanel({ type: 'report', id: menuPost.id }); setMenuId(null); }} />
                <SheetRow icon={Ban} label="Block creator" danger onClick={() => { setPanel({ type: 'confirm-block', id: menuPost.id }); setMenuId(null); }} />
              </>
            )}
          </Sheet>
        );
      })()}

      {panel && panelPost && panel.type === 'edit' && (
        <EditSheet post={panelPost} onClose={() => setPanel(null)}
          onSave={async (caption, tags) => { const ok = await ownerUpdate(panelPost, { caption, hashtags: tags }, 'Saved'); if (ok) setPanel(null); }} />
      )}
      {panel && panelPost && panel.type === 'visibility' && (
        <Sheet onClose={() => setPanel(null)} title="Who can watch this video">
          {AUDIENCES.map((a) => (
            <SheetRow key={a.key} icon={a.icon} label={a.label} value={panelPost.audience === a.key || (!panelPost.audience && a.key === 'public') ? '✓' : ''}
              onClick={async () => { const ok = await ownerUpdate(panelPost, { audience: a.key }, 'Updated'); if (ok) { setPanel(null); if (a.key !== 'public' && tab !== 'following') say('Only the audience you picked can see this in B-Flash'); } }} />
          ))}
        </Sheet>
      )}
      {panel && panelPost && panel.type === 'insights' && <InsightsSheet post={panelPost} onClose={() => setPanel(null)} />}
      {panel && panelPost && panel.type === 'report' && (
        <ReportSheet post={panelPost} userId={user?.id} onClose={() => setPanel(null)} onDone={(m) => { setPanel(null); say(m); }} />
      )}
      {panel && panelPost && panel.type === 'confirm-delete' && (
        <Sheet onClose={() => setPanel(null)} title="Delete this video?">
          <p className="px-5 pb-3 text-[#8E8C88] text-[14px] leading-snug">It will be removed for everyone, along with its likes and comments. This can’t be undone.</p>
          <div className="px-5 flex flex-col gap-2.5">
            <button onClick={() => deleteVideo(panelPost)} className="h-12 rounded-xl bg-[#E5484D] text-white font-bold">Delete video</button>
            <button onClick={() => setPanel(null)} className="h-12 rounded-xl bg-white/10 text-white font-bold">Cancel</button>
          </div>
        </Sheet>
      )}
      {panel && panelPost && panel.type === 'confirm-block' && (
        <Sheet onClose={() => setPanel(null)} title={'Block @' + (panelPost.users?.username || 'this creator') + '?'}>
          <p className="px-5 pb-3 text-[#8E8C88] text-[14px] leading-snug">You won’t see each other’s videos, and they won’t be able to follow or contact you. You can unblock them any time in Settings.</p>
          <div className="px-5 flex flex-col gap-2.5">
            <button onClick={() => blockCreator(panelPost)} className="h-12 rounded-xl bg-[#E5484D] text-white font-bold">Block</button>
            <button onClick={() => setPanel(null)} className="h-12 rounded-xl bg-white/10 text-white font-bold">Cancel</button>
          </div>
        </Sheet>
      )}

      {/* ── B-Flash settings ── */}
      {settingsOpen && (
        <Sheet onClose={() => setSettingsOpen(false)} title="B-Flash settings">
          <p className="px-5 pt-1 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">Playback</p>
          <Toggle label="Autoplay videos" desc="Start each video as soon as it’s on screen."
            on={!!prefs.autoplay_videos} onChange={(v) => setPrefs({ autoplay_videos: v })} />
          <Toggle label="Auto-scroll" desc="Move to the next video when one finishes. Off: the video repeats."
            on={fp.autoscroll} onChange={(v) => setFlashPref({ autoscroll: v })} />
          <Toggle label="Pause while commenting" desc="Stop the video while the comments are open."
            on={fp.pauseOnComments} onChange={(v) => setFlashPref({ pauseOnComments: v })} />
          <p className="px-5 pt-2 text-[#8E8C88] text-[12px]">Default speed</p>
          <Chips options={SPEEDS} value={fp.speed} onPick={(v) => setFlashPref({ speed: v })} format={(v) => v + '×'} />
          <p className="px-5 pt-3 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">Sound</p>
          <Toggle label="Play with sound when possible" desc="If your browser blocks sound, videos start muted and you can tap to turn it on."
            on={fp.sound} onChange={(v) => { setFlashPref({ sound: v }); setMuted(!v); setSoundBlocked(false); }} />
          <p className="px-5 pt-3 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">Data & quality</p>
          <Toggle label="Data saver" desc="Lower video quality and no preloading. Autoplay stays off."
            on={saver} onChange={(v) => setPrefs({ data_saver: v })} />
          <p className="px-5 pt-2 text-[#8E8C88] text-[12px]">Video quality</p>
          <Chips options={['auto', 'high', 'medium', 'low']} value={prefs.video_quality} onPick={(v) => setPrefs({ video_quality: v })}
            format={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
        </Sheet>
      )}
    </div>
  );
}

/* ── owner: edit caption & hashtags ── */
function EditSheet({ post, onClose, onSave }) {
  const [caption, setCaption] = useState(post.caption || '');
  const [tags, setTags] = useState((post.hashtags || []).map((t) => '#' + t).join(' '));
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const c = caption.trim();
    if (c.length > 500) return;
    const all = [...new Set([...parseTags(tags), ...((c.match(/#(\w+)/g) || []).map((h) => h.slice(1)))])].slice(0, 15);
    setSaving(true);
    await onSave(c, all);
    setSaving(false);
  };
  return (
    <Sheet onClose={onClose} title="Edit video details">
      <div className="px-5 flex flex-col gap-3">
        <label className="text-[#8E8C88] text-[12px] font-bold">Caption</label>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={500}
          className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3 text-white outline-none resize-none focus:border-[#FF5A1F]/60"
          style={{ fontSize: 16 }} />
        <p className="text-right text-[11px] text-[#8E8C88]">{caption.length}/500</p>
        <label className="text-[#8E8C88] text-[12px] font-bold">Hashtags</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#comedy #nairobi"
          className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 h-12 text-white outline-none focus:border-[#FF5A1F]/60" style={{ fontSize: 16 }} />
        <button onClick={submit} disabled={saving} className="h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: ACCENT }}>
          {saving ? <Spinner size={16} /> : <Check size={18} />} Save changes
        </button>
      </div>
    </Sheet>
  );
}

/* ── owner: analytics from real counters ── */
function InsightsSheet({ post, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    supabase.rpc('post_insights', { p_post_id: post.id }).then(({ data: d, error: e }) => {
      if (!alive) return;
      if (e) setErr('Couldn’t load analytics.'); else setData(d);
    });
    return () => { alive = false; };
  }, [post.id]);
  const cells = data ? [['Views', data.views], ['Likes', data.likes], ['Comments', data.comments], ['Shares', data.shares], ['Saves', data.saves], ['Engagement', data.engagement + '%']] : [];
  return (
    <Sheet onClose={onClose} title="Video analytics">
      {!data && !err && <div className="flex justify-center py-8 text-white"><Spinner size={24} /></div>}
      {err && <p className="px-5 pb-4 text-[#8E8C88]">{err}</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2.5 px-5">
            {cells.map(([l, v]) => (
              <div key={l} className="bg-white/[0.06] rounded-2xl py-3.5 text-center">
                <p className="text-white font-extrabold text-[18px]">{typeof v === 'number' ? formatNumber(v) : v}</p>
                <p className="text-[#8E8C88] text-[12px] mt-0.5">{l}</p>
              </div>
            ))}
          </div>
          <p className="px-5 pt-3 text-[#8E8C88] text-[12px] leading-snug">These are real counts from your video. Watch time and completion rate will appear once view tracking is added.</p>
        </>
      )}
    </Sheet>
  );
}

/* ── report a video (one report per person per video) ── */
function ReportSheet({ post, userId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!reason || sending || !userId) return;
    setSending(true);
    try {
      const { data: existing } = await supabase.from('reports').select('id')
        .eq('reporter_id', userId).eq('target_type', 'post').eq('target_id', post.id).maybeSingle();
      if (existing) { onDone('You already reported this video'); return; }
      const { error: e } = await supabase.from('reports').insert({
        reporter_id: userId, target_type: 'post', target_id: post.id, reason,
        details: details.trim() || null, status: 'pending',
      });
      if (e) throw e;
      await notifyAdminOnReport({ reporterId: userId, targetType: 'post', targetId: post.id, reason });
      onDone('Thanks — we’ll review this video');
    } catch { setSending(false); onDone('Couldn’t send the report. Try again.'); }
  };
  return (
    <Sheet onClose={onClose} title="Report this video">
      {REPORT_REASONS.map((r) => (
        <SheetRow key={r} icon={Flag} label={r} value={reason === r ? '✓' : ''} onClick={() => setReason(r)} />
      ))}
      {reason === 'Other' && (
        <div className="px-5 pt-1">
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={300} placeholder="Tell us what’s wrong"
            className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3 text-white outline-none resize-none" style={{ fontSize: 16 }} />
        </div>
      )}
      <div className="px-5 pt-3">
        <button onClick={send} disabled={!reason || sending} className="w-full h-12 rounded-xl text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: '#E5484D' }}>
          {sending ? <Spinner size={16} /> : 'Submit report'}
        </button>
      </div>
    </Sheet>
  );
}
