// src/pages/flash/BFlash.js
// B-Flash — the dedicated video experience inside B-Link.
// Same account, same posts table, same likes / saves / comments / share systems.
// Videos appear here (and on profiles) but never on Home.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Bookmark, Share2, EllipsisVertical, Play, Volume2, VolumeX,
  Plus, X, Zap, Flag, SlidersHorizontal, Clapperboard, EyeOff, UserX, RefreshCw,
  Ban, Copy, Pencil, Trash2, Gauge, UserRound,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import ReportModal from '../../components/ReportModal';
import { EmptyState, Spinner } from '../../components/ui';
import { CommentsPanel } from '../../components/post/Comments';
import { ShareSheet } from '../../components/post/Sheets';
import { videoSrc } from '../../lib/imageUtils';
import { formatNumber } from '../../utils/formatNumber';
import { usePrefs, setPrefs } from '../../lib/prefs';
import useViewport from '../../lib/useViewport';
import {
  requestPostState, patchPostState, toggleSave, isPostHidden, isUserMuted, hidePost, muteUser, unmuteUser,
} from '../../lib/posts';

/* ── design tokens (change the brand colour in ONE place) ── */
const ACCENT = '#FF5A1F';
const ICON = 24;            // action icons
const STROKE = 1.9;
const PAGE = 8;             // videos per request
const LOAD_TIMEOUT = 15000;

const SELECT = `
  id, caption, video_url, video_duration, video_thumbnail, post_type,
  likes_count, comments_count, shares_count, views_count, comments_disabled,
  created_at, user_id,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,is_verified,role)
`.trim();

/* ── B-Flash-only settings (autoplay + data saver live in the shared app prefs) ── */
const FKEY = 'blink_flash_prefs_v1';
const FDEFAULT = { autoscroll: false, pauseOnComments: false };
const readFlashPrefs = () => {
  try { return { ...FDEFAULT, ...(JSON.parse(localStorage.getItem(FKEY)) || {}) }; } catch { return { ...FDEFAULT }; }
};

const withTimeout = (promise, ms = LOAD_TIMEOUT) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
]);

/* ── one action-rail button: every action uses the same size, stroke and touch target ── */
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
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[82vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />
        {title && <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function SheetRow({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-5 py-3.5 active:bg-white/[0.05]">
      <Icon size={20} strokeWidth={STROKE} color={danger ? '#FF5C5C' : '#fff'} />
      <span className="text-[15px] font-semibold" style={{ color: danger ? '#FF5C5C' : '#fff' }}>{label}</span>
    </button>
  );
}

/* ── one video panel ── */
function Slide({
  post, index, active, isNext, muted, canPlay, split, loopVideo, saver, st, playbackSpeed,
  onLike, onDoubleLike, onComment, onSave, onShare, onMore, onProfile, onEnded, onLongPress, onSwipeBack, onSoundBlocked,
}) {
  const vref = useRef(null);
  const barRef = useRef(null);
  const userPaused = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const holdTimer = useRef(null);
  const gestureStart = useRef(null);
  const holdFired = useRef(false);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [burst, setBurst] = useState(0);
  const src = videoSrc(post.video_url);
  const u = post.users || {};

  useEffect(() => { if (vref.current) { vref.current.muted = muted; vref.current.playbackRate = playbackSpeed || 1; } }, [muted, playbackSpeed]);
  useEffect(() => () => { clearTimeout(tapTimer.current); clearTimeout(holdTimer.current); }, []);

  const tryPlay = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    const p = v.play();
    if (p && p.then) p.then(() => setPaused(false)).catch(() => {
      // Browsers may reject autoplay with sound. Retry muted instead of leaving a blank player.
      if (!v.muted) { v.muted = true; onSoundBlocked?.(); const retry = v.play(); if (retry?.catch) retry.catch(() => setPaused(true)); else setPaused(false); }
      else setPaused(true);
    });
  }, [onSoundBlocked]);

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

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {            // double tap = like
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((b) => b + 1);
      onDoubleLike();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {         // single tap = play / pause
      const v = vref.current;
      if (!v) return;
      if (v.paused) { userPaused.current = false; tryPlay(); }
      else { userPaused.current = true; v.pause(); setPaused(true); }
    }, 280);
  };

  const onTimeUpdate = () => {
    const v = vref.current, b = barRef.current;
    if (!v || !b || !v.duration) return;
    b.style.transform = 'scaleX(' + Math.min(1, v.currentTime / v.duration) + ')';
  };

  return (
    <section className="relative w-full h-full overflow-hidden bg-black" aria-label={'Video by ' + (u.username || 'creator')}>
      {/* media area — shrinks to the top when comments are open (SplitView) */}
      <div className="absolute left-0 right-0 top-0 overflow-hidden bg-black" style={{ height: split ? '38%' : '100%', transition: 'height .25s ease' }}>
        <video
          ref={vref}
          src={src}
          poster={post.video_thumbnail || undefined}
          playsInline
          muted={muted}
          loop={loopVideo}
          preload={active ? 'auto' : (isNext && !saver ? 'metadata' : 'none')}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: landscape || split ? 'contain' : 'cover' }}
          onLoadedMetadata={() => { const v = vref.current; if (v) setLandscape(v.videoWidth > v.videoHeight); }}
          onTimeUpdate={onTimeUpdate}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => { setBuffering(false); setPaused(false); }}
          onCanPlay={() => setBuffering(false)}
          onEnded={onEnded}
        />
        <div
          className="absolute inset-0 touch-pan-y select-none"
          onPointerDown={(e) => {
            gestureStart.current = { x: e.clientX, y: e.clientY };
            holdFired.current = false;
            clearTimeout(holdTimer.current);
            holdTimer.current = setTimeout(() => { holdFired.current = true; onLongPress?.(); }, 550);
          }}
          onPointerMove={(e) => {
            if (!gestureStart.current) return;
            const dx = Math.abs(e.clientX - gestureStart.current.x);
            const dy = Math.abs(e.clientY - gestureStart.current.y);
            if (dx > 12 || dy > 12) clearTimeout(holdTimer.current);
          }}
          onPointerUp={(e) => {
            clearTimeout(holdTimer.current);
            if (gestureStart.current) {
              const dx = e.clientX - gestureStart.current.x;
              const dy = e.clientY - gestureStart.current.y;
              if (!holdFired.current && Math.abs(dx) > 85 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                if (dx < 0) onProfile?.();
                else onSwipeBack?.();
                gestureStart.current = null;
                return;
              }
            }
            gestureStart.current = null;
            if (!holdFired.current) onTap();
          }}
          onPointerCancel={() => { clearTimeout(holdTimer.current); gestureStart.current = null; }}
          onContextMenu={(e) => { e.preventDefault(); onLongPress?.(); }}
          role="button" aria-label={paused ? 'Play video' : 'Pause video'}
        />

        {paused && active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-16 h-16 rounded-full bg-black/45 flex items-center justify-center">
              <Play size={30} color="#fff" fill="#fff" />
            </span>
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

          {/* bottom information */}
          <div className="absolute left-4 right-[76px] bottom-[18px] pointer-events-none">
            <button onClick={onProfile} className="pointer-events-auto flex items-center gap-2 mb-2 max-w-full">
              <span className="text-white font-bold text-[15px] truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
                @{u.username || 'unknown'}
              </span>
              {u.is_verified && <VerifiedBadge size={15} />}
            </button>
            {post.caption && (
              <p className="text-white text-[14px] leading-snug line-clamp-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
                {post.caption}
              </p>
            )}
          </div>

          {/* action rail */}
          <div className="absolute right-3 bottom-[18px] flex flex-col items-center gap-4">
            <button onClick={onProfile} aria-label={'Open ' + (u.username || 'creator') + ' profile'} className="active:scale-90 transition-transform">
              <span className="block rounded-full p-[2px]" style={{ background: ACCENT }}>
                <Avatar url={u.avatar_url} name={u.display_name || u.username} size={10} />
              </span>
            </button>
            <RailButton icon={Heart} label={st.liked ? 'Unlike' : 'Like'} active={st.liked} fill count={st.likes} onClick={onLike} />
            <RailButton icon={MessageCircle} label="Comments" count={st.comments} onClick={onComment} />
            <RailButton icon={Bookmark} label={st.saved ? 'Remove from saved' : 'Save'} active={st.saved} fill onClick={onSave} />
            <RailButton icon={Share2} label="Share" onClick={onShare} />
            <RailButton icon={EllipsisVertical} label="More options" onClick={onMore} />
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
  const previousTabRef = useRef('foryou');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('blink_flash_muted') === 'true'; } catch { return false; } });
  const [ov, setOv] = useState({});               // per-video overrides: liked, saved, likes, comments
  const [commentsId, setCommentsId] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const [moreFor, setMoreFor] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [toast, setToast] = useState(null);
  const [navH, setNavH] = useState(80);

  const scRef = useRef(null);
  const cursorRef = useRef(null);
  const reqRef = useRef(0);
  const followRef = useRef(null);
  const failedAt = useRef(-1);
  const toastT = useRef(null);

  const saver = !!prefs.data_saver;
  const kb = typeof window !== 'undefined' && window.innerHeight - vp.h > 150;   // keyboard open

  /* keep the player exactly above the bottom navigation */
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
  const say = (t) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2200); };

  const changeMuted = (value) => { setMuted(value); try { localStorage.setItem('blink_flash_muted', String(value)); } catch { /* storage blocked */ } };
  const handleSoundBlocked = useCallback(() => { setMuted(true); try { localStorage.setItem('blink_flash_muted', 'true'); } catch { /* storage blocked */ } }, []);

  const setFlashPref = (patch) => {
    setFp((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem(FKEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  };

  /* ── data ── */
  const hydrate = useCallback((rows) => {
    if (!user?.id) return;
    rows.forEach((p) => {
      requestPostState(user.id, p.id).then((st) => {
        setOv((o) => ({ ...o, [p.id]: { liked: st.liked, saved: st.saved, reaction: st.reaction, ...(o[p.id] || {}) } }));
      });
    });
  }, [user?.id]);

  const fetchPage = useCallback(async (which, cursor) => {
    let q = supabase.from('posts').select(SELECT)
      .not('video_url', 'is', null)
      .eq('is_draft', false)
      .eq('audience', 'public')
      .neq('status', 'deleted')
      .neq('status', 'hidden')
      .order(which === 'trending' ? 'views_count' : 'created_at', { ascending: false, nullsFirst: false })
      .limit(PAGE);
    if (cursor) q = q.lt('created_at', cursor);

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
    const rows = raw
      .map((p) => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users || null }))
      .filter((p) => !isPostHidden(p.id) && !isUserMuted(p.user_id));
    return { rows, raw: raw.length, last: raw.length ? raw[raw.length - 1].created_at : null };
  }, [user?.id]);

  const loadFirst = useCallback(async (which) => {
    const my = ++reqRef.current;
    setLoading(true); setError(''); setItems([]); setActive(0); setHasMore(true);
    setCommentsId(null);
    cursorRef.current = null;
    if (scRef.current) scRef.current.scrollTop = 0;
    try {
      const { rows, raw, last } = await withTimeout(fetchPage(which, null));
      if (my !== reqRef.current) return;
      setItems(rows);
      cursorRef.current = last;
      setHasMore(raw === PAGE);
      hydrate(rows);
    } catch (e) {
      if (my !== reqRef.current) return;
      setError(navigator.onLine ? 'Videos are taking too long to load.' : 'You appear to be offline.');
    } finally {
      if (my === reqRef.current) setLoading(false);
    }
  }, [fetchPage, hydrate]);

  useEffect(() => { if (user?.id) loadFirst(tab); }, [tab, user?.id, loadFirst]);
  const changeTab = (next) => { if (next !== tab) { previousTabRef.current = tab; setTab(next); } };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading || !cursorRef.current) return;
    const my = reqRef.current;
    setLoadingMore(true);
    try {
      const { rows, raw, last } = await withTimeout(fetchPage(tab, cursorRef.current));
      if (my !== reqRef.current) return;
      cursorRef.current = last || cursorRef.current;
      setHasMore(raw === PAGE);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      hydrate(rows);
    } catch {
      failedAt.current = items.length;               // retry on the next swipe, not in a tight loop
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, fetchPage, tab, hydrate, items.length]);

  useEffect(() => { failedAt.current = -1; }, [active]);
  useEffect(() => {
    if (loading || !hasMore || failedAt.current === items.length) return;
    if (items.length - active <= 3) loadMore();
  }, [active, items.length, loading, hasMore, loadMore]);

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

  const removeFromFeed = (pred) => setItems((prev) => prev.filter((p) => !pred(p)));
  const openProfile = (p) => { if (p.users?.username) navigate('/profile/' + p.users.username); };

  const commentsPost = items.find((p) => p.id === commentsId) || null;
  const morePost = items.find((p) => p.id === moreFor) || null;
  const canPlay = !!prefs.autoplay_videos && !saver && !(commentsId && fp.pauseOnComments);

  const boxStyle = { top: vp.top, height: Math.max(0, vp.h - (kb ? 0 : navH)) };

  return (
    <div className="fixed left-0 right-0 z-20 bg-black" style={boxStyle}>
      <style>{'.bflash-sc{scrollbar-width:none}.bflash-sc::-webkit-scrollbar{display:none}'}</style>
      <div className="relative h-full w-full max-w-[480px] mx-auto overflow-hidden">

        {/* video feed */}
        <div ref={scRef} className="bflash-sc absolute inset-0 snap-y snap-mandatory"
          style={{ overflowY: commentsId ? 'hidden' : 'scroll', overscrollBehavior: 'contain' }}>
          {items.map((p, i) => {
            const inWindow = Math.abs(i - active) <= (saver ? 0 : 1);
            return (
              <div key={p.id} data-index={i} className="w-full h-full snap-start snap-always">
                {inWindow && (
                  <Slide
                    post={p} index={i}
                    active={i === active} isNext={i === active + 1}
                    muted={muted} canPlay={canPlay} saver={saver} playbackSpeed={playbackSpeed}
                    split={commentsId === p.id}
                    loopVideo={!fp.autoscroll}
                    st={sOf(p)}
                    onLike={() => like(p)}
                    onDoubleLike={() => like(p, true)}
                    onComment={() => setCommentsId(p.id)}
                    onSave={() => save(p)}
                    onShare={() => setShareFor(p)}
                    onMore={() => setMoreFor(p.id)}
                    onProfile={() => openProfile(p)}
                    onEnded={() => goNext(i)}
                    onLongPress={() => setMoreFor(p.id)}
                    onSwipeBack={() => { if (previousTabRef.current !== tab) changeTab(previousTabRef.current); }}
                    onSoundBlocked={handleSoundBlocked}
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
              <TopIcon icon={muted ? VolumeX : Volume2} label={muted ? 'Unmute' : 'Mute'} onClick={() => changeMuted(!muted)} />
              <TopIcon icon={SlidersHorizontal} label="Playback settings" onClick={() => setSettingsOpen(true)} />
              <TopIcon icon={Plus} label="Create a video post" onClick={() => navigate('/create')} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-7 pb-3 pointer-events-auto">
            {[['foryou', 'For You'], ['following', 'Following'], ['trending', 'Trending'], ['latest', 'Latest']].map(([k, l]) => (
              <button key={k} onClick={() => changeTab(k)} aria-pressed={tab === k}
                className="relative py-2 text-[15px] font-bold transition-colors" style={{ color: tab === k ? '#fff' : 'rgba(255,255,255,.6)' }}>
                {l}
                {tab === k && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-5 h-[3px] rounded-full" style={{ background: ACCENT }} />}
              </button>
            ))}
          </div>
        </div>

        {/* loading / error / empty */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white"><Spinner size={30} /></div>
        )}
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
              title={tab === 'following' ? 'No videos from people you follow' : 'No videos yet'}
              text={tab === 'following' ? 'Follow creators to see their videos here, or explore For You.' : 'Be the first to share a video on B-Flash.'}>
              {tab === 'following' && (
                <button onClick={() => setTab('foryou')} className="px-5 py-2.5 rounded-xl text-white font-bold bg-white/10">Explore For You</button>
              )}
              <button onClick={() => navigate('/create')} className="px-5 py-2.5 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Post a video</button>
            </EmptyState>
          </div>
        )}

        {/* SplitView comments: the video stays visible above */}
        {commentsPost && (
          <div className="absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-3xl border-t border-[#E4E6EB] flex flex-col" style={{ height: '62%' }}>
            <div className="flex items-center justify-center pt-2.5 pb-1.5 flex-shrink-0 relative">
              <div className="w-10 h-1 rounded-full bg-white/25" />
              <button onClick={() => setCommentsId(null)} aria-label="Close comments" className="absolute right-1 top-0 w-11 h-11 flex items-center justify-center text-[#8E8C88]">
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

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-40 bg-black/85 text-white text-[13px] font-semibold px-4 py-2 rounded-full whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>

      {shareFor && <ShareSheet post={shareFor} onClose={() => setShareFor(null)} onDone={(m) => { setShareFor(null); if (m) say(m); }} />}

      {morePost && (
        <Sheet onClose={() => setMoreFor(null)} title={morePost.user_id === user?.id ? 'Manage your video' : 'Video options'}>
          {morePost.user_id === user?.id ? (
            <>
              <SheetRow icon={Pencil} label="Edit caption and publishing details" onClick={() => { setMoreFor(null); navigate('/create?edit=' + morePost.id); }} />
              <SheetRow icon={Copy} label="Copy video link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + '/flash/watch/' + morePost.id); say('Video link copied'); } catch { say('Could not copy link'); } setMoreFor(null); }} />
              <SheetRow icon={Trash2} label="Delete video" danger onClick={async () => {
                setMoreFor(null);
                if (!window.confirm('Delete this video? This cannot be undone.')) return;
                const { error: delError } = await supabase.from('posts').delete().eq('id', morePost.id).eq('user_id', user.id);
                if (delError) { say(delError.message || 'Could not delete video'); return; }
                removeFromFeed((p) => p.id === morePost.id); say('Video deleted');
              }} />
            </>
          ) : (
            <>
              <SheetRow icon={Gauge} label="Playback speed" onClick={() => { setMoreFor(null); setSettingsOpen(true); }} />
              <SheetRow icon={Copy} label="Copy video link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + '/flash/watch/' + morePost.id); say('Video link copied'); } catch { say('Could not copy link'); } setMoreFor(null); }} />
              <SheetRow icon={UserRound} label="View creator profile" onClick={() => { setMoreFor(null); openProfile(morePost); }} />
              <SheetRow icon={EyeOff} label="Not interested" onClick={() => { hidePost(morePost.id); removeFromFeed((p) => p.id === morePost.id); setMoreFor(null); say('We’ll show fewer videos like this'); }} />
              <SheetRow icon={UserX} label={isUserMuted(morePost.user_id) ? 'Unmute creator' : 'Mute creator'} onClick={() => { if (isUserMuted(morePost.user_id)) { unmuteUser(morePost.user_id); say('Creator unmuted'); } else { muteUser(morePost.user_id); removeFromFeed((p) => p.user_id === morePost.user_id); say('Creator muted on this device'); } setMoreFor(null); }} />
              <SheetRow icon={Ban} label="Block creator" danger onClick={async () => {
                setMoreFor(null);
                if (!window.confirm('Block this creator? Their content will be hidden from you.')) return;
                const { error: blockError } = await supabase.rpc('block_user', { p_target_id: morePost.user_id });
                if (blockError) { say(blockError.message || 'Could not block creator'); return; }
                removeFromFeed((p) => p.user_id === morePost.user_id); say('Creator blocked');
              }} />
              <SheetRow icon={Flag} label="Report video" danger onClick={() => { setReportFor(morePost.id); setMoreFor(null); }} />
            </>
          )}
          <SheetRow icon={SlidersHorizontal} label="Playback settings" onClick={() => { setMoreFor(null); setSettingsOpen(true); }} />
        </Sheet>
      )}

      {reportFor && <ReportModal target={{ type: 'post', id: reportFor }} userId={user?.id} onClose={() => setReportFor(null)} />}

      {settingsOpen && (
        <Sheet onClose={() => setSettingsOpen(false)} title="Playback">
          <Toggle label="Autoplay videos" desc="Start each video as soon as it’s on screen."
            on={!!prefs.autoplay_videos} onChange={(v) => setPrefs({ autoplay_videos: v })} />
          <Toggle label="Auto-scroll" desc="Move to the next video when one finishes. Off: the video repeats."
            on={fp.autoscroll} onChange={(v) => setFlashPref({ autoscroll: v })} />
          <Toggle label="Pause while commenting" desc="Stop the video when the comments are open."
            on={fp.pauseOnComments} onChange={(v) => setFlashPref({ pauseOnComments: v })} />
          <Toggle label="Data saver" desc="Lower video quality and no preloading. Autoplay stays off."
            on={saver} onChange={(v) => setPrefs({ data_saver: v })} />
          <div className="px-5 py-3">
            <label className="block text-white text-sm font-semibold mb-2">Playback speed</label>
            <div className="flex flex-wrap gap-2">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button key={rate} onClick={() => setPlaybackSpeed(rate)} className="px-3 py-2 rounded-full text-sm font-semibold"
                  style={{ background: playbackSpeed === rate ? ACCENT : 'rgba(255,255,255,.1)', color: '#fff' }}>{rate}×</button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
