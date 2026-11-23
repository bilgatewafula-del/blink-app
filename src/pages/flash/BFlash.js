// src/pages/flash/BFlash.js
// B-Flash — the dedicated video experience inside B-Link.
// Same account, same posts table, same likes / saves / comments / share / block systems.
// Videos appear here (and on profiles) but never on Home.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Bookmark, Share2, EllipsisVertical, Play, Pause, Volume2, VolumeX,
  Plus, X, Zap, Flag, Settings, Clapperboard, EyeOff, BellOff, Ban, RefreshCw, Link2,
  Maximize, Pin, PinOff, Pencil, Trash2, Eye, Globe, Users, Lock, MessageSquareOff, User, Check,
  HeartCrack, RotateCcw, Columns2, Combine, Search, BarChart3, Captions, Film,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import FollowButton from '../../components/FollowButton';
import { EmptyState, Spinner } from '../../components/ui';
import { CommentsPanel } from '../../components/post/Comments';
import { ShareSheet } from '../../components/post/Sheets';
import FlashSearch from './FlashSearch';
import { REL, fetchRelationships, setFollow, iFollowThem, onFollowChange } from '../../lib/follows';
import RichText from '../../components/RichText';
import MentionTextarea from '../../components/MentionTextarea';
import { notifyAdminOnReport } from '../../utils/notifyAdmin';
import { videoSrc } from '../../lib/imageUtils';
import { formatNumber } from '../../utils/formatNumber';
import { usePrefs, setPrefs } from '../../lib/prefs';
import useViewport from '../../lib/useViewport';
import {
  requestPostState, patchPostState, toggleSave, isPostHidden, isUserMuted, hidePost, muteUser, postLink,
  getMutedUserIds, unmuteUser, hiddenPostCount, clearHiddenPosts,
} from '../../lib/posts';

/* ── design tokens (change the brand colour in ONE place) ── */
const ACCENT = '#F97316';
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
// duets & stitches: needs the Stage 3 SQL. If those columns don't exist yet the feed falls back to SELECT.
const REMIX_SELECT = `, allow_remix, remix_of, remix_type, remix_clip_end,
  remix_src:posts!remix_of(id, video_url, video_thumbnail, video_duration, users!posts_user_id_fkey(username, display_name))`;

const POLL_SELECT = ', poll:post_polls(question, options)';
const CAP_SELECT = ', captions';

// edited videos already carry Cloudinary edits; add the viewer's quality choice after them
const QUALITY = { low: 'q_auto:low,w_480', medium: 'q_auto:good,w_720', high: 'q_auto:best' };
const flashSrc = (url, saver, quality) => {
  const base = videoSrc(url);
  if (base !== url || !url || !url.includes('/video/upload/')) return base;     // plain videos: handled by videoSrc
  const t = saver ? QUALITY.low : QUALITY[quality];
  return t ? url.replace(/(\/video\/upload\/(?:[^/]+\/)*?)(v\d+\/)/, '$1' + t + '/$2') : url;
};

/* ── device settings that are specific to B-Flash ── */
const FKEY = 'blink_flash_prefs_v1';
const FDEFAULT = {
  autoscroll: false, pauseOnComments: false, sound: true, speed: 1,
  leftHanded: false, clean: false, progress: true, motion: true, haptics: true, defaultTab: 'foryou', captions: true,
};
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

/* ── remember where you were (tab, hashtag, video) so coming back lands in the same place ── */
const SKEY = 'blink_flash_session_v1';
const readSession = () => {
  try { const x = JSON.parse(sessionStorage.getItem(SKEY)); return x && Date.now() - x.t < 6 * 36e5 ? x : null; } catch { return null; }
};

const BF_CSS = `
.bflash-sc{scrollbar-width:none}.bflash-sc::-webkit-scrollbar{display:none}
@keyframes bfRing{0%{transform:scale(.8);opacity:.9}100%{transform:scale(1.7);opacity:0}}
@keyframes bfPop{0%{transform:scale(1)}35%{transform:scale(1.45)}70%{transform:scale(.9)}100%{transform:scale(1)}}
@keyframes bfBounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}60%{transform:translateY(1px)}}
@keyframes bfSwing{0%{transform:rotate(0)}25%{transform:rotate(-16deg)}60%{transform:rotate(10deg)}100%{transform:rotate(0)}}
@keyframes bfNudge{0%{transform:translate(0,0)}40%{transform:translate(4px,-4px)}100%{transform:translate(0,0)}}
@keyframes bfWiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(90deg)}}
@keyframes bfPlus{0%{box-shadow:0 0 0 0 rgba(255,90,31,.55)}70%{box-shadow:0 0 0 12px rgba(255,90,31,0)}100%{box-shadow:0 0 0 0 rgba(255,90,31,0)}}
@keyframes bfBroken{0%{transform:translate(-50%,-50%) scale(.6);opacity:1}100%{transform:translate(-50%,calc(-50% + 40px)) scale(1.1) rotate(8deg);opacity:0}}
.bf-nomotion .bfa{animation:none!important}
@media (prefers-reduced-motion:reduce){.bfa{animation:none!important}}
`;

const withTimeout = (promise, ms = LOAD_TIMEOUT) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
]);

const parseTags = (text) => [...new Set((text || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '').replace(/[^\w]/g, '')).filter(Boolean))].slice(0, 15);

/* ── small shared UI ── */
const TONE = { like: '#FF4D6D', comment: '#4DB6FF', save: '#FFC24D', share: '#34D6A0', more: '#FFFFFF' };

function RailButton({ icon: Icon, label, count, active, fill, tone = '#fff', anim, onClick }) {
  const [n, setN] = useState(0);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setN((x) => x + 1); onClick(); }}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      className="relative flex flex-col items-center gap-1 active:scale-90 transition-transform"
    >
      <span className="relative w-11 h-11 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(18,16,14,.40)', border: '1px solid rgba(255,255,255,.16)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          boxShadow: active ? '0 0 16px ' + tone + '66' : 'none',
        }}>
        {n > 0 && <span key={'r' + n} className="bfa absolute inset-0 rounded-full pointer-events-none" style={{ border: '2px solid ' + tone, animation: 'bfRing .55s ease-out forwards' }} />}
        <span key={'i' + n} className="bfa flex" style={{ animation: n > 0 && anim ? anim + ' .5s ease-out' : undefined }}>
          <Icon size={ICON - 2} strokeWidth={STROKE} color={active ? tone : '#fff'} fill={active && fill ? tone : 'none'} />
        </span>
      </span>
      {count !== undefined && (
        <span className="text-white text-[12px] font-bold leading-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>{formatNumber(count)}</span>
      )}
    </button>
  );
}

function PlusButton({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Create a video" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
      <span className="bfa w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: '#F97316', animation: 'bfPlus 2.2s ease-out 3', boxShadow: '0 2px 10px rgba(255,90,31,.45)' }}>
        <Plus size={19} strokeWidth={2.6} color="#fff" />
      </span>
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
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/65 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[86vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5" />
        <div className="flex items-center justify-between pl-5 pr-1.5">
          <p className="text-white font-bold text-[15px] py-3">{title || ''}</p>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center text-[#8E8C88] active:scale-90 transition-transform"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function SectionLabel({ children }) {
  return <p className="px-5 pt-4 pb-1 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">{children}</p>;
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
  post, active, isNext, muted, canPlay, split, loopVideo, saver, speed, toggleReq, st, isMine,
  leftHanded, clean, showProgress, quality, onSource, rel, onFollow, showCaptions, onPoll,
  onVideoRef, onSoundBlocked, onLike, onDoubleLike, onComment, onSave, onShare, onMore, onLongPress,
  onCreator, onEnded, onMention, onHashtag,
}) {
  const vref = useRef(null);
  const barRef = useRef(null);
  const userPaused = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const pressTimer = useRef(null);
  const stallTimer = useRef(null);
  const gesture = useRef(null);
  const recoveries = useRef(0);
  const activeRef = useRef(active);
  const canPlayRef = useRef(canPlay);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [burst, setBurst] = useState({ n: 0, type: 'like' });
  const sref = useRef(null);
  const rsrc = post.remix_src && post.remix_type ? post.remix_src : null;       // the original video of a duet / stitch
  const isDuet = !!rsrc && post.remix_type === 'duet';
  const isStitch = !!rsrc && post.remix_type === 'stitch';
  const clipEnd = Number(post.remix_clip_end) || 3;
  const [capText, setCapText] = useState('');
  const capRef = useRef('');
  const caps = Array.isArray(post.captions) && post.captions.length ? post.captions : null;
  const poll = post.poll && Array.isArray(post.poll.options) ? post.poll : null;
  const [phase, setPhase] = useState('src');                                      // stitch: 'src' clip first, then 'own'
  const showingSrc = isStitch && phase === 'src';
  const src = showingSrc ? flashSrc(rsrc.video_url, saver, quality) : flashSrc(post.video_url, saver, quality);
  const u = post.users || {};
  activeRef.current = active;
  canPlayRef.current = canPlay;

  useEffect(() => { if (vref.current) vref.current.muted = muted; }, [muted]);
  useEffect(() => { if (vref.current) vref.current.playbackRate = speed; }, [speed]);
  useEffect(() => () => { clearTimeout(tapTimer.current); clearTimeout(pressTimer.current); clearTimeout(stallTimer.current); }, []);

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
      } else if (!err || err.name !== 'AbortError') setPaused(true);
    });
  }, [onSoundBlocked]);

  // reload the video at the same position (after the app was in the background, or the network dropped)
  const recover = useCallback((manual) => {
    const v = vref.current;
    if (!v) return;
    if (!manual && recoveries.current >= 2) { setFailed(true); setBuffering(false); return; }
    recoveries.current += 1;
    const t = v.currentTime || 0;
    setFailed(false);
    setBuffering(true);
    const onMeta = () => {
      v.removeEventListener('loadedmetadata', onMeta);
      try { if (t > 0.5) v.currentTime = t; } catch { /* not seekable yet */ }
      if (activeRef.current && canPlayRef.current && !userPaused.current) tryPlay();
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.load();
  }, [tryPlay]);

  const toggle = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) { userPaused.current = false; tryPlay(); }
    else { userPaused.current = true; v.pause(); setPaused(true); }
  }, [tryPlay]);

  useEffect(() => { if (!active) { setPhase('src'); capRef.current = ''; setCapText(''); } }, [active]);
  useEffect(() => { // stitch moved on to the creator's own video: keep playing
    if (isStitch && activeRef.current && canPlayRef.current && !userPaused.current) tryPlay();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // pause / resume requested from the video menu
  useEffect(() => { if (active && toggleReq.n && toggleReq.id === post.id) toggle(); }, [toggleReq.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // play only the visible video, and only when the viewer's settings allow it
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (!active) {
      v.pause();
      userPaused.current = false;
      recoveries.current = 0;
      try { v.currentTime = 0; } catch { /* not ready yet */ }
      if (barRef.current) barRef.current.style.transform = 'scaleX(0)';
      setPaused(false); setFailed(false);
      return;
    }
    if (canPlay && !userPaused.current) tryPlay();
    else { v.pause(); setPaused(true); }
  }, [active, canPlay, tryPlay]);

  // app went to the background and came back: resume, or reload if the browser dropped the video
  useEffect(() => {
    const wake = () => {
      const v = vref.current;
      if (!v || !activeRef.current) return;
      if (document.hidden) { v.pause(); return; }
      if (v.error || v.readyState < 2 || v.networkState === 3) { recover(true); return; }
      if (canPlayRef.current && !userPaused.current) tryPlay();
    };
    const online = () => { const v = vref.current; if (v && activeRef.current && (v.error || v.readyState < 3)) recover(true); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', online);
    };
  }, [recover, tryPlay]);

  // stuck on the spinner for 10 seconds: reload once or twice, then offer a retry button
  useEffect(() => {
    clearTimeout(stallTimer.current);
    if (active && buffering && !paused && !failed) stallTimer.current = setTimeout(() => recover(false), 10000);
    return () => clearTimeout(stallTimer.current);
  }, [active, buffering, paused, failed, recover]);

  /* tap = play/pause · double tap = like / unlike · hold = menu · swipe left = creator */
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((b) => ({ n: b.n + 1, type: st.liked ? 'unlike' : 'like' }));
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
    if (!v) return;
    if (isStitch && phase === 'src' && v.currentTime >= clipEnd) { setPhase('own'); return; }
    if (isDuet && sref.current && v.currentTime < 0.3 && sref.current.currentTime > 1) sref.current.currentTime = 0;
    if (caps && showCaptions && !(isStitch && phase === 'src')) {                 // subtitle line for this moment
      const tNow = v.currentTime;
      const line = caps.find((c) => tNow >= c.s && tNow < c.e);
      const txt = line ? line.t : '';
      if (txt !== capRef.current) { capRef.current = txt; setCapText(txt); }
    }
    if (!b || !v.duration) return;
    let pct = v.currentTime / v.duration;
    if (isStitch) {
      const own = Number(post.video_duration) || 0;
      const total = clipEnd + own;
      if (total > 0) pct = ((phase === 'src' ? 0 : clipEnd) + v.currentTime) / total;
    }
    b.style.transform = 'scaleX(' + Math.min(1, Math.max(0, pct)) + ')';
  };
  const handleEnded = () => {
    if (isStitch && phase === 'src') { setPhase('own'); return; }        // the original clip was shorter than planned
    if (isStitch && loopVideo) { setPhase('src'); return; }               // repeat the whole stitch
    onEnded();
  };

  const side = leftHanded ? 'left-3' : 'right-3';

  return (
    <section className="relative w-full h-full overflow-hidden bg-black" aria-label={'Video by ' + (u.username || 'creator')}>
      <div className="absolute left-0 right-0 top-0 overflow-hidden bg-black" style={{ height: split ? '38%' : '100%', transition: 'height .25s ease' }}>
        <video
          ref={(el) => { vref.current = el; onVideoRef(post.id, el); }}
          src={src}
          poster={(showingSrc ? rsrc.video_thumbnail : post.video_thumbnail) || undefined}
          playsInline
          muted={muted}
          loop={isStitch ? false : loopVideo}
          preload={active ? 'auto' : (isNext && !saver ? 'metadata' : 'none')}
          className={isDuet ? 'absolute top-0 bottom-0 right-0 w-1/2' : 'absolute inset-0 w-full h-full'}
          style={{ objectFit: isDuet ? 'cover' : (landscape || split ? 'contain' : 'cover') }}
          onPlay={() => { if (sref.current) sref.current.play().catch(() => {}); }}
          onPause={() => { if (sref.current) sref.current.pause(); }}
          onLoadedMetadata={() => { const v = vref.current; if (v) { setLandscape(v.videoWidth > v.videoHeight); v.playbackRate = speed; } }}
          onTimeUpdate={onTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onStalled={() => { if (activeRef.current) setBuffering(true); }}
          onPlaying={() => { setBuffering(false); setPaused(false); setFailed(false); recoveries.current = 0; }}
          onCanPlay={() => setBuffering(false)}
          onError={() => { if (activeRef.current && post.video_url) recover(false); }}
          onEnded={handleEnded}
        />
        {isDuet && (
          <video ref={sref} src={flashSrc(rsrc.video_url, saver, quality)} poster={rsrc.video_thumbnail || undefined} muted loop playsInline
            preload={active ? 'auto' : 'none'} className="absolute top-0 bottom-0 left-0 w-1/2 pointer-events-none" style={{ objectFit: 'cover' }} />
        )}
        <div
          className="absolute inset-0 select-none"
          style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          role="button" aria-label={paused ? 'Play video' : 'Pause video'}
        />

        {paused && active && !failed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-16 h-16 rounded-full bg-black/45 flex items-center justify-center"><Play size={30} color="#fff" fill="#fff" /></span>
          </div>
        )}
        {buffering && active && !paused && !failed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white"><Spinner size={28} /></div>
        )}
        {failed && active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65">
            <p className="text-white font-semibold text-[14px]">Couldn’t play this video</p>
            <button onClick={() => recover(true)} className="px-5 h-10 rounded-full bg-white/15 text-white font-bold flex items-center gap-2">
              <RotateCcw size={16} /> Try again
            </button>
          </div>
        )}
        {burst.n > 0 && burst.type === 'like' && (
          <Heart key={burst.n} size={96} color={TONE.like} fill={TONE.like}
            className="bfa absolute pointer-events-none"
            style={{ left: '50%', top: '50%', animation: 'heartPop .8s ease-out forwards' }} />
        )}
        {burst.n > 0 && burst.type === 'unlike' && (
          <HeartCrack key={burst.n} size={84} color="#fff" strokeWidth={1.8}
            className="bfa absolute pointer-events-none"
            style={{ left: '50%', top: '50%', animation: 'bfBroken .7s ease-in forwards' }} />
        )}
        {capText && showCaptions && !showingSrc && (
          <div className="absolute pointer-events-none flex justify-center" style={{ left: 16, right: leftHanded ? 16 : 72, bottom: split ? 10 : '24%' }}>
            <span className="px-2.5 py-1 rounded-lg text-white text-[15px] font-bold leading-snug text-center" style={{ background: 'rgba(0,0,0,.62)' }}>{capText}</span>
          </div>
        )}
        {showProgress && (
          <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/20 pointer-events-none">
            <div ref={barRef} className="h-full origin-left" style={{ background: ACCENT, transform: 'scaleX(0)' }} />
          </div>
        )}
      </div>

      {!split && clean && (
        <div className={'absolute bottom-[18px] ' + side}>
          <RailButton icon={EllipsisVertical} label="Video options" tone={TONE.more} anim="bfWiggle" onClick={onMore} />
        </div>
      )}

      {!split && !clean && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[42%] pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78), transparent)' }} />
          <div className={'absolute bottom-[18px] pointer-events-none ' + (leftHanded ? 'left-[76px] right-4' : 'left-4 right-[76px]')}>
            <div className="flex items-center gap-2 mb-2 max-w-full">
              <button onClick={onCreator} className="pointer-events-auto flex items-center gap-1.5 min-w-0">
                <span className="text-white font-bold text-[15px] truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>@{u.username || 'unknown'}</span>
                {u.is_verified && <VerifiedBadge size={15} />}
                {post.is_pinned && <Pin size={13} color="#fff" />}
              </button>
            </div>
            {rsrc && (
              <button onClick={onSource} className="pointer-events-auto mb-1.5 h-7 px-2.5 rounded-full flex items-center gap-1.5 text-white text-[12px] font-bold max-w-full"
                style={{ background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)' }}>
                {isStitch ? <Combine size={13} /> : <Columns2 size={13} />}
                <span className="truncate">{isStitch ? 'Stitch with' : 'Duet with'} @{(rsrc.users && rsrc.users.username) || 'creator'}</span>
              </button>
            )}
            {poll && (
              <button onClick={onPoll} className="pointer-events-auto mb-1.5 h-7 px-2.5 rounded-full flex items-center gap-1.5 text-white text-[12px] font-bold max-w-full"
                style={{ background: 'rgba(77,182,255,.30)', border: '1px solid rgba(77,182,255,.55)' }}>
                <BarChart3 size={13} /> <span className="truncate">Poll: {poll.question}</span>
              </button>
            )}
            {post.caption && (
              <p className="text-white text-[14px] leading-snug line-clamp-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
                <RichText text={post.caption} onMention={onMention} onHashtag={onHashtag} tone="dark" />
              </p>
            )}
          </div>
          <div className={'absolute bottom-[18px] flex flex-col items-center gap-3.5 ' + side}>
            <div className="relative mb-2">
              <button onClick={onCreator} aria-label={'Open ' + (u.username || 'creator') + ' details'} className="active:scale-90 transition-transform">
                <span className="block rounded-full p-[2px]" style={{ background: '#F97316' }}>
                  <Avatar url={u.avatar_url} name={u.display_name || u.username} size={10} />
                </span>
              </button>
              {!isMine && u.id && rel !== undefined && !iFollowThem(rel) && (
                <button onClick={(e) => { e.stopPropagation(); onFollow(); }} aria-label={'Follow @' + (u.username || 'creator')}
                  className="absolute left-1/2 -translate-x-1/2 -bottom-4 w-10 h-10 flex items-center justify-center active:scale-90 transition-transform">
                  <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: '#F97316', border: '2px solid #0D0C0B' }}>
                    <Plus size={13} strokeWidth={3} color="#fff" />
                  </span>
                </button>
              )}
            </div>
            <RailButton icon={Heart} label={st.liked ? 'Unlike' : 'Like'} active={st.liked} fill tone={TONE.like} anim="bfPop" count={st.likes} onClick={onLike} />
            <RailButton icon={MessageCircle} label="Comments" tone={TONE.comment} anim="bfBounce" count={st.comments} onClick={onComment} />
            <RailButton icon={Bookmark} label={st.saved ? 'Remove from saved' : 'Save'} active={st.saved} fill tone={TONE.save} anim="bfSwing" onClick={onSave} />
            <RailButton icon={Share2} label="Share" tone={TONE.share} anim="bfNudge" onClick={onShare} />
            <RailButton icon={EllipsisVertical} label="Video options" tone={TONE.more} anim="bfWiggle" onClick={onMore} />
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
  const [tab, setTab] = useState(() => (readSession() || {}).tab || readFlashPrefs().defaultTab || 'foryou');
  const [tagFilter, setTagFilter] = useState(() => (new URLSearchParams(window.location.search).get('tag') || '').replace(/[^\w]/g, '') || (readSession() || {}).tag || null);
  const [cEmoji, setCEmoji] = useState(false);
  const [rels, setRels] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [pollFor, setPollFor] = useState(null);
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
  const remixOn = useRef(true);
  const pollOn = useRef(true);
  const capOn = useRef(true);
  const searchRef = useRef(null);
  const deepId = useRef(new URLSearchParams(window.location.search).get('v'));
  const restoreId = useRef(deepId.current || (readSession() || {}).id || null);
  const synced = useRef(false);
  const entryPushed = useRef(false);
  const stateRef = useRef({});
  const viewed = useRef(new Set());

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
  useEffect(() => onFollowChange(({ targetId, relationship }) => setRels((r) => ({ ...r, [targetId]: relationship }))), []);
  const hydrate = useCallback((rows) => {
    if (!user?.id) return;
    fetchRelationships(user.id, [...new Set(rows.map((r) => r.user_id))]).then((m) => setRels((r) => ({ ...r, ...m })), () => {});
    rows.forEach((p) => {
      requestPostState(user.id, p.id).then((st) => {
        setOv((o) => ({ ...o, [p.id]: { liked: st.liked, saved: st.saved, reaction: st.reaction, ...(o[p.id] || {}) } }));
      });
    });
  }, [user?.id]);

  const baseQuery = useCallback(() => {
    let q = supabase.from('posts').select(selectStr())
      .not('video_url', 'is', null)
      .eq('is_draft', false)
      .eq('audience', 'public')
      .neq('status', 'deleted')
      .neq('status', 'hidden');
    if (tagFilter) q = q.or('hashtags.cs.{' + tagFilter + '},hashtags.cs.{' + tagFilter.toLowerCase() + '}');
    return q;
  }, [tagFilter]);

  // the optional parts (duets, polls, captions) need the SQL updates; if one is missing the feed still loads without it
  const selectStr = () => SELECT + (remixOn.current ? REMIX_SELECT : '') + (pollOn.current ? POLL_SELECT : '') + (capOn.current ? CAP_SELECT : '');
  const normalizeRow = (p) => ({
    ...p,
    users: p['users!posts_user_id_fkey'] || p.users || null,
    remix_src: p.remix_src ? { ...p.remix_src, users: p.remix_src['users!posts_user_id_fkey'] || p.remix_src.users || null } : null,
    poll: Array.isArray(p.poll) ? (p.poll[0] || null) : (p.poll || null),
    captions: Array.isArray(p.captions) ? p.captions : null,
  });
  const clean = (raw) => raw.map(normalizeRow).filter((p) => !isPostHidden(p.id) && !isUserMuted(p.user_id));

  // run a feed query; if the database doesn't have a newer column or table yet, retry without just that part
  const exec = async (build) => {
    let r = await build();
    for (let i = 0; i < 3 && r.error; i += 1) {
      const msg = r.error.message || '';
      if (pollOn.current && /post_polls|poll/i.test(msg)) pollOn.current = false;
      else if (capOn.current && /captions/i.test(msg)) capOn.current = false;
      else if (remixOn.current && /remix|allow_remix|relationship|schema cache|column/i.test(msg)) remixOn.current = false;
      else break;
      r = await build();
    }
    return r;
  };

  // returns { rows, done } and advances cursor / offset for the next page
  const fetchPage = useCallback(async (which, first) => {
    if (which === 'trending') {
      if (first) {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const { data, error: e } = await exec(() => baseQuery().gte('created_at', since).order('likes_count', { ascending: false }).limit(80));
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

    if (which === 'following' && !followRef.current) {
      const { data: fl, error: fe } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
      if (fe) throw fe;
      followRef.current = [...(fl || []).map((f) => f.following_id), user.id];
    }
    const build = () => {
      let q = baseQuery().order('created_at', { ascending: false }).limit(which === 'foryou' ? PAGE * 2 : PAGE);
      if (!first && cursorRef.current) q = q.lt('created_at', cursorRef.current);
      if (which === 'following') q = q.in('user_id', followRef.current);
      return q;
    };
    const { data, error: e } = await exec(build);
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

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      if (!synced.current) {
        synced.current = true;
        try {
          await withTimeout((async () => {
            const [m, h] = await Promise.all([
              supabase.from('user_mutes').select('muted_id').limit(1000),
              supabase.from('post_hides').select('post_id').limit(1000),
            ]);
            (m.data || []).forEach((r) => muteUser(r.muted_id));
            (h.data || []).forEach((r) => hidePost(r.post_id));
          })(), 4000);
        } catch { /* offline or tables not created yet: this device's list still applies */ }
      }
      loadFirst(tab);
    })();
  }, [tab, user?.id, loadFirst]);

  // coming back to the video you were watching (after a profile, a settings page, or a refresh)
  useEffect(() => {
    const id = restoreId.current;
    if (loading || !id || items.length === 0) return;
    restoreId.current = null;
    if (deepId.current) { deepId.current = null; try { window.history.replaceState(window.history.state, '', '/flash'); } catch { /* ignore */ } }
    const idx = items.findIndex((p) => p.id === id);
    if (idx > 0) {
      const el = scRef.current && scRef.current.querySelector('[data-index="' + idx + '"]');
      if (el) { scRef.current.scrollTop = el.offsetTop; setActive(idx); }
    } else if (idx < 0) {
      supabase.from('posts').select(selectStr()).eq('id', id).eq('audience', 'public').not('video_url', 'is', null).neq('status', 'deleted').maybeSingle()
        .then(({ data }) => {
          if (!data || isUserMuted(data.user_id)) return;
          const row = normalizeRow(data);
          setItems((prev) => [row, ...prev.filter((p) => p.id !== id)]);
          setActive(0);
          hydrate([row]);
        }, () => {});
    }
  }, [loading, items, hydrate]);
  useEffect(() => {
    const p = items[active];
    try { sessionStorage.setItem(SKEY, JSON.stringify({ tab, tag: tagFilter, id: p ? p.id : null, t: Date.now() })); } catch { /* storage blocked */ }
  }, [tab, tagFilter, items, active]);

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
    const t = setTimeout(() => {
      markSeen(p.id);
      if (!viewed.current.has(p.id) && !document.hidden) {
        viewed.current.add(p.id);
        supabase.rpc('record_post_view', { p_post_id: p.id }).then(() => {}, () => {});
      }
    }, 2000);
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

  const like = async (p) => {
    const s = sOf(p);
    if (fp.haptics) { try { if (navigator.vibrate) navigator.vibrate(10); } catch { /* unsupported */ } }
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

  const followCreator = async (p) => {
    const id = p.user_id;
    const prev = rels[id] || REL.NONE;
    setRels((r) => ({ ...r, [id]: REL.FOLLOWING }));                        // the + disappears straight away
    try {
      const fin = await setFollow(user.id, id, true, prev);
      setRels((r) => ({ ...r, [id]: fin }));
      say('Following @' + ((p.users && p.users.username) || 'creator'));
    } catch {
      setRels((r) => ({ ...r, [id]: prev }));
      say('Couldn’t follow. Try again.');
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
  const notInterested = (p) => { hidePost(p.id); supabase.from('post_hides').upsert({ user_id: user.id, post_id: p.id }).then(() => {}, () => {}); removeFromFeed((x) => x.id === p.id); setMenuId(null); setCreatorId(null); say('We’ll show fewer videos like this'); };
  const muteCreator = (p) => { muteUser(p.user_id); supabase.from('user_mutes').upsert({ user_id: user.id, muted_id: p.user_id }).then(() => {}, () => {}); removeFromFeed((x) => x.user_id === p.user_id); setMenuId(null); setCreatorId(null); say('Creator muted'); };
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

  searchRef.current = async (term) => {
    const t = term.replace(/"/g, '');
    const tagLike = /^[\p{L}\p{N}_]+$/u.test(t);
    const ors = ['caption.ilike."%' + t + '%"'];
    if (tagLike) { ors.push('hashtags.cs.{' + t + '}'); if (t.toLowerCase() !== t) ors.push('hashtags.cs.{' + t.toLowerCase() + '}'); }
    const { data, error: e } = await exec(() => baseQuery().or(ors.join(',')).order('created_at', { ascending: false }).limit(24));
    if (e) throw e;
    return clean(data || []);
  };
  const searchVideos = useCallback((term) => searchRef.current(term), []);
  const openFromSearch = (row) => {
    setSearchOpen(false);
    setItems((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
    setActive(0);
    if (scRef.current) scRef.current.scrollTop = 0;
    hydrate([row]);
  };

  /* Back button logic: Back closes the top-most open panel first; only then does it leave B-Flash */
  stateRef.current = { commentsId, creatorId, menuId, shareFor, panel, settingsOpen, searchOpen, pollFor };
  const overlayOpen = !!(commentsId || creatorId || menuId || shareFor || panel || settingsOpen || searchOpen || pollFor);
  const closeTop = useCallback(() => {
    const st = stateRef.current;
    if (st.pollFor) setPollFor(null);
    else if (st.searchOpen) setSearchOpen(false);
    else if (st.panel) setPanel(null);
    else if (st.settingsOpen) setSettingsOpen(false);
    else if (st.shareFor) setShareFor(null);
    else if (st.menuId) setMenuId(null);
    else if (st.commentsId) setCommentsId(null);
    else if (st.creatorId) setCreatorId(null);
  }, []);
  useEffect(() => {
    if (overlayOpen && !entryPushed.current) {
      const st = window.history.state || {};
      window.history.pushState({ ...st, bfOverlay: true, idx: (st.idx || 0) + 1 }, '');
      entryPushed.current = true;
    } else if (!overlayOpen && entryPushed.current) {
      entryPushed.current = false;
      if (window.history.state && window.history.state.bfOverlay) window.history.back();
    }
  }, [overlayOpen]);
  useEffect(() => {
    const onPop = () => { if (entryPushed.current) { entryPushed.current = false; closeTop(); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [closeTop]);
  const go = useCallback((path, state) => {
    const replace = entryPushed.current;           // the panel's history entry becomes the new page, so Back returns to B-Flash
    entryPushed.current = false;
    setCommentsId(null); setCreatorId(null); setMenuId(null); setShareFor(null); setPanel(null); setSettingsOpen(false); setSearchOpen(false); setPollFor(null);
    navigate(path, { replace, state });
  }, [navigate]);

  // after a refresh the browser blocks sound until you touch the screen; your first tap turns it on (no hunting for the button)
  useEffect(() => {
    if (!soundBlocked || !fp.sound) return undefined;
    const unlock = () => { setMuted(false); setSoundBlocked(false); };
    const evs = ['pointerup', 'touchend', 'keydown', 'click'];
    evs.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, unlock));
  }, [soundBlocked, fp.sound]);

  useEffect(() => { if (!commentsId) setCEmoji(false); }, [commentsId]);
  const commentsPost = items.find((p) => p.id === commentsId) || null;
  const creatorPost = items.find((p) => p.id === creatorId) || null;
  const menuPost = items.find((p) => p.id === menuId) || null;
  const panelPost = panel ? items.find((p) => p.id === panel.id) || null : null;
  const canPlay = !!prefs.autoplay_videos && !saver && !(commentsId && fp.pauseOnComments) && !creatorId && !searchOpen;
  const boxStyle = { top: vp.top, height: Math.max(0, vp.h - (kb ? 0 : navH)) };
  const frozen = !!(commentsId || creatorId);

  return (
    <div className={'bf-root fixed left-0 right-0 z-20 bg-black' + (fp.motion ? '' : ' bf-nomotion')} style={boxStyle}>
      <style>{BF_CSS}</style>
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
                    isMine={p.user_id === user?.id}
                    leftHanded={fp.leftHanded} clean={fp.clean} showProgress={fp.progress}
                    rel={rels[p.user_id]} onFollow={() => followCreator(p)} showCaptions={fp.captions} onPoll={() => setPollFor(p.id)}
                    quality={prefs.video_quality} onSource={() => p.remix_of && go('/post/' + p.remix_of)}
                    onMention={(name) => go('/profile/' + name)}
                    onHashtag={(t) => setTagFilter(String(t).replace(/[^\w]/g, '') || null)}
                    loopVideo={!fp.autoscroll}
                    st={sOf(p)}
                    onVideoRef={onVideoRef} onSoundBlocked={onSoundBlocked}
                    onLike={() => like(p)}
                    onDoubleLike={() => like(p)}
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
              <button onClick={() => setSearchOpen(true)} aria-label="Search B-Flash" className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform">
                <Search size={22} strokeWidth={STROKE} color="#fff" />
              </button>
              <PlusButton onClick={() => go('/flash/create')} />
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

        {tagFilter && (
          <div className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none" style={{ top: 'calc(max(6px, env(safe-area-inset-top)) + 92px)' }}>
            <button onClick={() => setTagFilter(null)} aria-label="Clear hashtag filter"
              className="pointer-events-auto h-8 pl-3 pr-2 rounded-full flex items-center gap-1.5 text-[13px] font-bold text-white" style={{ background: 'rgba(77,182,255,.28)', border: '1px solid rgba(77,182,255,.6)' }}>
              #{tagFilter} <X size={14} />
            </button>
          </div>
        )}

        {soundBlocked && muted && !frozen && items.length > 0 && !tagFilter && (
          <button onClick={toggleSound}
            className="absolute left-1/2 -translate-x-1/2 z-10 px-4 h-10 rounded-full bg-black/70 text-white text-[13px] font-bold flex items-center gap-2"
            style={{ top: 'calc(max(6px, env(safe-area-inset-top)) + 98px)' }}>
            <Volume2 size={16} /> Tap to turn sound on
          </button>
        )}

        {loading && <div className="absolute inset-0 flex items-center justify-center text-white"><Spinner size={30} /></div>}
        {!loading && error && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState dark icon={RefreshCw} title="Couldn’t load videos" text={error}>
              <button onClick={() => loadFirst(tab)} className="px-6 py-2.5 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Try again</button>
            </EmptyState>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState dark icon={Clapperboard}
              title={tab === 'following' ? 'No videos from people you follow' : tab === 'trending' ? 'Nothing trending yet' : 'No videos yet'}
              text={tab === 'following' ? 'Follow creators to see their videos here, or explore For You.' : 'Be the first to share a video on B-Flash.'}>
              {tab === 'following' && (
                <button onClick={() => setTab('foryou')} className="px-5 py-2.5 rounded-xl text-white font-bold bg-white/10">Explore For You</button>
              )}
              <button onClick={() => setSettingsOpen(true)} className="px-5 py-2.5 rounded-xl text-white font-bold bg-white/10">Settings</button>
              <button onClick={() => go('/flash/create')} className="px-5 py-2.5 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Post a video</button>
            </EmptyState>
          </div>
        )}

        {/* SplitView comments (light design) */}
        {commentsPost && (
          <div className="absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-3xl border-t border-[#E4E6EB] flex flex-col" style={{ height: cEmoji ? '90%' : '64%', transition: 'height .2s ease' }}>
            <div className="flex items-center justify-between h-12 px-2 flex-shrink-0 border-b border-[#E4E6EB]">
              <span className="w-11" />
              <div className="w-10 h-1 rounded-full bg-[#CED0D4]" />
              <button onClick={() => setCommentsId(null)} aria-label="Close comments" className="w-11 h-11 flex items-center justify-center text-[#65676B] active:scale-90 transition-transform">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <CommentsPanel
                post={commentsPost}
                count={sOf(commentsPost).comments}
                onCountChange={(d) => bumpComments(commentsPost, d)}
                onNavigate={(path) => go(path)}
                onEmojiToggle={setCEmoji}
              />
            </div>
          </div>
        )}

        {creatorPost && (
          <CreatorPanel
            post={creatorPost}
            isMe={creatorPost.user_id === user?.id}
            onClose={() => setCreatorId(null)}
            onOpenProfile={() => creatorPost.users?.username && go('/profile/' + creatorPost.users.username)}
            onMute={() => muteCreator(creatorPost)}
            onBlock={() => setPanel({ type: 'confirm-block', id: creatorPost.id })}
          />
        )}

        {searchOpen && (
          <FlashSearch
            onClose={() => setSearchOpen(false)}
            searchVideos={searchVideos}
            onOpenVideo={openFromSearch}
            onOpenCreator={(c) => go('/profile/' + c.username)}
            onPickTag={(t) => { setSearchOpen(false); setTagFilter(String(t).replace(/[^\w]/g, '') || null); }}
          />
        )}

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-40 bg-black/85 text-white text-[13px] font-semibold px-4 py-2 rounded-full whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>

      {shareFor && createPortal(
        <ShareSheet post={shareFor} onClose={() => setShareFor(null)} onDone={(m) => { setShareFor(null); if (m) say(m); }} />,
        document.body
      )}

      {/* ── video menu: long-press or ⋮ ── */}
      {menuPost && (() => {
        const mine = menuPost.user_id === user?.id;
        const s = sOf(menuPost);
        const vid = videoEls.current[menuPost.id];
        const isPaused = !vid || vid.paused;
        return (
          <Sheet onClose={() => setMenuId(null)} title="Video options">
            <p className="px-5 pb-1 text-[12px] font-bold uppercase tracking-wide text-[#8E8C88]">Playback speed</p>
            <Chips options={SPEEDS} value={fp.speed} onPick={(v) => setFlashPref({ speed: v })} format={(v) => v + '×'} />
            <div className="h-px bg-white/10 my-1" />
            {mine && (
              <div className="grid grid-cols-3 gap-2.5 px-5 py-2">
                {[[Pencil, 'Edit', 'edit'], [Eye, 'Analytics', 'insights'], [Trash2, 'Delete', 'confirm-delete']].map(([Ic, l, t]) => (
                  <button key={t} onClick={() => { setPanel({ type: t, id: menuPost.id }); setMenuId(null); }}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-transform"
                    style={{ background: t === 'confirm-delete' ? 'rgba(229,72,77,.14)' : 'rgba(255,255,255,.07)' }}>
                    <Ic size={22} strokeWidth={1.8} color={t === 'confirm-delete' ? '#FF6B6B' : '#fff'} />
                    <span className="text-[12px] font-bold" style={{ color: t === 'confirm-delete' ? '#FF6B6B' : '#fff' }}>{l}</span>
                  </button>
                ))}
              </div>
            )}
            <SheetRow icon={isPaused ? Play : Pause} label={isPaused ? 'Resume video' : 'Pause video'}
              onClick={() => { setToggleReq((r) => ({ id: menuPost.id, n: r.n + 1 })); setMenuId(null); }} />
            {mine ? (
              <>
                <SheetRow icon={Globe} label="Who can watch" value={(AUDIENCES.find((a) => a.key === menuPost.audience) || AUDIENCES[0]).label}
                  onClick={() => { setPanel({ type: 'visibility', id: menuPost.id }); setMenuId(null); }} />
                <SheetRow icon={menuPost.comments_disabled ? MessageCircle : MessageSquareOff} label={menuPost.comments_disabled ? 'Turn comments on' : 'Turn comments off'}
                  onClick={() => { ownerUpdate(menuPost, { comments_disabled: !menuPost.comments_disabled }, menuPost.comments_disabled ? 'Comments on' : 'Comments off'); setMenuId(null); }} />
                <SheetRow icon={Columns2} label="Duets & stitches" value={menuPost.allow_remix === false ? 'Off' : 'On'}
                  onClick={() => { ownerUpdate(menuPost, { allow_remix: menuPost.allow_remix === false }, menuPost.allow_remix === false ? 'Duets & stitches on' : 'Duets & stitches off'); setMenuId(null); }} />
                <SheetRow icon={menuPost.is_pinned ? PinOff : Pin} label={menuPost.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
                  onClick={() => { ownerUpdate(menuPost, { is_pinned: !menuPost.is_pinned }, menuPost.is_pinned ? 'Unpinned' : 'Pinned to your profile'); setMenuId(null); }} />
              </>
            ) : (
              <SheetRow icon={Bookmark} label={s.saved ? 'Remove from saved' : 'Save video'} onClick={() => { save(menuPost); setMenuId(null); }} />
            )}
            <SheetRow icon={Link2} label="Copy link" onClick={() => copyLink(menuPost)} />
            <SheetRow icon={Share2} label="Share" onClick={() => { setShareFor(menuPost); setMenuId(null); }} />
            <SheetRow icon={Maximize} label="Full screen" onClick={() => fullscreen(menuPost)} />
            <SheetRow icon={muted ? Volume2 : VolumeX} label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={() => { toggleSound(); setMenuId(null); }} />
            {Array.isArray(menuPost.captions) && menuPost.captions.length > 0 && (
              <SheetRow icon={Captions} label="Captions" value={fp.captions ? 'On' : 'Off'} onClick={() => { setFlashPref({ captions: !fp.captions }); setMenuId(null); }} />
            )}
            {!mine && menuPost.allow_remix !== false && menuPost.audience === 'public' && (
              <>
                <SheetRow icon={Columns2} label="Duet with this video" onClick={() => go('/flash/create?remix=' + menuPost.id + '&type=duet')} />
                <SheetRow icon={Combine} label="Stitch this video" onClick={() => go('/flash/create?remix=' + menuPost.id + '&type=stitch')} />
              </>
            )}
            {!mine && (
              <>
                <SheetRow icon={User} label="View creator" onClick={() => { setCreatorId(menuPost.id); setMenuId(null); }} />
                <SheetRow icon={EyeOff} label="Not interested" onClick={() => notInterested(menuPost)} />
                <SheetRow icon={BellOff} label="Mute creator" onClick={() => muteCreator(menuPost)} />
                <SheetRow icon={Flag} label="Report video" danger onClick={() => { setPanel({ type: 'report', id: menuPost.id }); setMenuId(null); }} />
                <SheetRow icon={Ban} label="Block creator" danger onClick={() => { setPanel({ type: 'confirm-block', id: menuPost.id }); setMenuId(null); }} />
              </>
            )}
            <div className="h-px bg-white/10 my-1" />
            <SheetRow icon={Film} label="My videos & saved" onClick={() => go('/flash/me')} />
            <SheetRow icon={Settings} label="B-Flash settings" onClick={() => { setMenuId(null); setSettingsOpen(true); }} />
          </Sheet>
        );
      })()}

      {pollFor && (() => { const pp = items.find((x) => x.id === pollFor); return pp && pp.poll ? <PollSheet post={pp} mine={pp.user_id === user?.id} onClose={() => setPollFor(null)} /> : null; })()}
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
          <SectionLabel>Playback</SectionLabel>
          <Toggle label="Autoplay videos" desc="Start each video as soon as it’s on screen."
            on={!!prefs.autoplay_videos} onChange={(v) => setPrefs({ autoplay_videos: v })} />
          <Toggle label="Auto-scroll" desc="Move to the next video when one finishes. Off: the video repeats."
            on={fp.autoscroll} onChange={(v) => setFlashPref({ autoscroll: v })} />
          <Toggle label="Pause while commenting" desc="Stop the video while the comments are open."
            on={fp.pauseOnComments} onChange={(v) => setFlashPref({ pauseOnComments: v })} />
          <Toggle label="Show captions" desc="Subtitles typed by the creator, when a video has them."
            on={fp.captions} onChange={(v) => setFlashPref({ captions: v })} />
          <p className="px-5 pt-2 text-[#8E8C88] text-[12px]">Default speed</p>
          <Chips options={SPEEDS} value={fp.speed} onPick={(v) => setFlashPref({ speed: v })} format={(v) => v + '×'} />

          <SectionLabel>Sound</SectionLabel>
          <Toggle label="Sound" desc="If your browser blocks sound, videos start muted and you can tap to turn it on."
            on={!muted} onChange={() => toggleSound()} />

          <SectionLabel>Data & quality</SectionLabel>
          <Toggle label="Data saver" desc="Lower video quality and no preloading. Autoplay stays off."
            on={saver} onChange={(v) => setPrefs({ data_saver: v })} />
          <p className="px-5 pt-2 text-[#8E8C88] text-[12px]">Video quality</p>
          <Chips options={['auto', 'high', 'medium', 'low']} value={prefs.video_quality} onPick={(v) => setPrefs({ video_quality: v })}
            format={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />

          <SectionLabel>Layout & display</SectionLabel>
          <Toggle label="Left-handed controls" desc="Move the buttons to the left side of the screen."
            on={fp.leftHanded} onChange={(v) => setFlashPref({ leftHanded: v })} />
          <Toggle label="Clean mode" desc="Hide captions and buttons so only the video shows. Hold the video for the menu."
            on={fp.clean} onChange={(v) => setFlashPref({ clean: v })} />
          <Toggle label="Progress line" desc="Show how far through the video you are."
            on={fp.progress} onChange={(v) => setFlashPref({ progress: v })} />
          <Toggle label="Animations" desc="Button and like animations."
            on={fp.motion} onChange={(v) => setFlashPref({ motion: v })} />
          <Toggle label="Vibration feedback" desc="A small buzz when you like or hold a video."
            on={fp.haptics} onChange={(v) => setFlashPref({ haptics: v })} />

          <SectionLabel>Your feed</SectionLabel>
          <p className="px-5 text-[#8E8C88] text-[12px]">Open B-Flash on</p>
          <Chips options={TABS.map((t) => t[0])} value={fp.defaultTab} onPick={(v) => setFlashPref({ defaultTab: v })}
            format={(v) => (TABS.find((t) => t[0] === v) || [0, v])[1]} />
          <SheetRow icon={RotateCcw} label="Clear watched history" value="For You starts fresh"
            onClick={() => { try { localStorage.removeItem(SEEN_KEY); } catch { /* storage blocked */ } say('Watched history cleared'); }} />
          <SheetRow icon={EyeOff} label="Show hidden videos again" value={String(hiddenPostCount())}
            onClick={() => { clearHiddenPosts(); supabase.from('post_hides').delete().eq('user_id', user.id).then(() => {}, () => {}); say('Hidden videos will show again'); loadFirst(tab); }} />
          <SheetRow icon={BellOff} label="Unmute all creators" value={String(getMutedUserIds().length)}
            onClick={() => { getMutedUserIds().forEach(unmuteUser); supabase.from('user_mutes').delete().eq('user_id', user.id).then(() => {}, () => {}); say('Creators unmuted'); loadFirst(tab); }} />

          <SectionLabel>Your content</SectionLabel>
          <SheetRow icon={Film} label="My videos & saved" value="Stats, manage" onClick={() => go('/flash/me')} />

          <SectionLabel>Safety</SectionLabel>
          <SheetRow icon={Ban} label="Blocked accounts" value="Manage" onClick={() => go('/settings', { open: 'blocked' })} />
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
        <div className="bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-[#F97316]/60">
          <MentionTextarea tone="dark" value={caption} onChange={setCaption} rows={4} maxLength={500} placeholder="Write a caption…" className="text-[16px] leading-snug" />
        </div>
        <p className="text-right text-[11px] text-[#8E8C88]">{caption.length}/500</p>
        <label className="text-[#8E8C88] text-[12px] font-bold">Hashtags</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#comedy #nairobi"
          className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 h-12 text-white outline-none focus:border-[#F97316]/60" style={{ fontSize: 16 }} />
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

/* ── poll: vote once, results show after you vote ── */
function PollSheet({ post, mine, onClose }) {
  const poll = post.poll;
  const [res, setRes] = useState(null);                 // { voted, total, counts, mine }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    supabase.rpc('poll_results', { p_post_id: post.id }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setErr('Polls aren’t available yet.'); else setRes(data || { voted: false, total: 0, counts: null, mine: null });
    });
    return () => { alive = false; };
  }, [post.id]);
  const vote = async (i) => {
    if (busy || (res && res.voted)) return;
    setBusy(true); setErr('');
    const { data, error: e } = await supabase.rpc('vote_post_poll', { p_post_id: post.id, p_option: i });
    setBusy(false);
    if (e) { setErr(e.message || 'Couldn’t save your vote.'); return; }
    setRes(data);
  };
  const showResults = res && res.counts;
  const total = res ? res.total : 0;
  return (
    <Sheet onClose={onClose} title="Poll">
      <p className="px-5 pb-3 text-white font-extrabold text-[18px] leading-snug">{poll.question}</p>
      <div className="px-5 flex flex-col gap-2.5">
        {poll.options.map((o, i) => {
          const n = showResults ? res.counts[i] || 0 : 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const picked = res && res.mine === i;
          return (
            <button key={i} onClick={() => vote(i)} disabled={busy || !res || res.voted}
              className="relative h-12 rounded-xl overflow-hidden text-left disabled:opacity-100"
              style={{ background: 'rgba(255,255,255,.08)', border: '1px solid ' + (picked ? ACCENT : 'rgba(255,255,255,.12)') }}>
              {showResults && <span className="absolute inset-y-0 left-0" style={{ width: pct + '%', background: picked ? 'rgba(255,90,31,.45)' : 'rgba(255,255,255,.14)', transition: 'width .5s ease' }} />}
              <span className="relative h-full flex items-center justify-between gap-3 px-4">
                <span className="text-white font-semibold text-[15px] truncate flex items-center gap-2">{picked && <Check size={16} color={ACCENT} />}{o}</span>
                {showResults && <span className="text-white font-bold text-[14px]">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-5 pt-3 text-[#8E8C88] text-[12px]">
        {!res ? (err || 'Loading…') : res.voted ? total + ' vote' + (total === 1 ? '' : 's') + ' so far. Thanks for voting!'
          : mine ? total + ' vote' + (total === 1 ? '' : 's') + ' so far.' : 'Pick one to see the results. You can’t change your vote.'}
      </p>
      {err && res && <p className="px-5 pt-1 text-[#FF6B6B] text-[13px]">{err}</p>}
    </Sheet>
  );
}
