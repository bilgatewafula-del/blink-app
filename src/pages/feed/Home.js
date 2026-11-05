import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, RefreshCw, Feather, Menu, WifiOff, ChevronUp, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import PostCard from '../../components/PostCard';
import Stories from '../../components/Stories';

const POSTS_PER_PAGE = 15;
const LOAD_TIMEOUT_MS = 12000;
const AUTO_REFRESH_MS = 180000;          // 3 min
const SCROLL_TOP_THRESHOLD = 600;        // px scrolled before "back to top" appears
const PREFETCH_MARGIN = '900px';         // start loading next page before user hits bottom

export const FEED_VERSION = '2.2.0';

const POST_SELECT = `
  id, caption, media_urls, video_url, video_duration, video_thumbnail,
  post_type, hashtags, location, bg_color, audience, status, is_draft,
  is_repost, quoted_post_id, likes_count, comments_count, reposts_count,
  views_count, shares_count, is_boosted, boost_expires_at, created_at, user_id,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

const normalise = (p) => ({
  ...p,
  users: p['users!posts_user_id_fkey'] || p.users || null,
});

const flagMap = {
  KE:'🇰🇪', NG:'🇳🇬', GH:'🇬🇭', UG:'🇺🇬',
  TZ:'🇹🇿', ZA:'🇿🇦', ET:'🇪🇹', RW:'🇷🇼',
  GB:'🇬🇧', US:'🇺🇸', CA:'🇨🇦',
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function PostSkeleton() {
  return (
    <div className="border-b border-white/[0.07] px-4 py-3">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full skeleton flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex gap-2">
            <div className="h-3 skeleton rounded-full w-24" />
            <div className="h-3 skeleton rounded-full w-16" />
          </div>
          <div className="h-3 skeleton rounded-full w-full" />
          <div className="h-3 skeleton rounded-full w-4/5" />
          <div className="h-3 skeleton rounded-full w-3/5" />
          <div className="flex gap-6 mt-2">
            {[1,2,3,4].map(i => <div key={i} className="h-3 skeleton rounded-full w-8" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { profile, user }       = useAuth();
  const navigate                = useNavigate();
  const location                = useLocation();
  const reducedMotion           = usePrefersReducedMotion();

  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [activeTab,      setActiveTab]      = useState('foryou');
  const [posts,          setPosts]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [hasMore,        setHasMore]        = useState(true);
  const [page,           setPage]           = useState(0);
  const [unread,         setUnread]         = useState(0);
  const [refreshing,     setRefreshing]     = useState(false);
  const [pullDist,       setPullDist]       = useState(0);
  const [isPulling,      setIsPulling]      = useState(false);
  const [newPostsBanner, setNewPostsBanner] = useState(false);
  const [newPostsCount,  setNewPostsCount]  = useState(0);
  const [fetchError,     setFetchError]     = useState('');
  const [isOffline,      setIsOffline]      = useState(!navigator.onLine);
  const [showScrollTop,  setShowScrollTop]  = useState(false);
  const [fabVisible,     setFabVisible]     = useState(true);
  const [toast,          setToast]          = useState('');

  const loadMoreRef    = useRef();
  const observerRef     = useRef();
  const touchStartY     = useRef(null);
  const loadTimerRef    = useRef(null);
  const toastTimerRef   = useRef(null);
  const lastScrollYRef  = useRef(0);
  const PULL_THRESHOLD  = 70;

  // ── Refs mirroring frequently-changing state ──────────────────
  const loadingRef   = useRef(loading);
  const isOfflineRef = useRef(isOffline);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const idCacheRef = useRef({ following: null, country: null, forTab: null });

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  };

  // ── Optimistic insert when returning from /create ─────────────
  useEffect(() => {
    const incoming = location.state?.newPost;
    if (incoming) {
      setPosts(prev => (prev.some(p => p.id === incoming.id) ? prev : [normalise(incoming), ...prev]));
      showToast('Posted!');
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // ── Offline / online detection ─────────────────────────────────
  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline  = () => {
      setIsOffline(false);
      setPosts([]); setPage(0); setHasMore(true);
      loadPosts(0, true);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Auto-refresh every 3 min when visible — MERGES, never wipes ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !loadingRef.current && !isOfflineRef.current) {
        checkForNewPosts();
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Was: only ever called the lightweight checkForNewPosts() on
  // regaining visibility, and even that was skipped while `loading`
  // was still true. That meant a genuinely STUCK load (the exact
  // scenario reproduced by backgrounding the tab, which browsers
  // throttle/freeze pending requests in) had no way to recover on its
  // own — the only thing that ever unstuck it was accidentally
  // interacting with DevTools, which brings the whole browser window
  // back into focus and un-throttles everything at once. This makes
  // the app do that same recovery automatically, for every user, not
  // just when DevTools happens to be open.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const stuck = posts.length === 0 && (loadingRef.current || !!fetchError);
      if (stuck) {
        setFetchError('');
        setPage(0);
        loadPosts(0, true);
      } else if (!loadingRef.current && !isOfflineRef.current) {
        checkForNewPosts();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchError, posts.length]);

  // ── Reload on tab change ───────────────────────────────────────
  useEffect(() => {

    setNewPostsBanner(false);
    setNewPostsCount(0);
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setFetchError('');
    idCacheRef.current = { following: null, country: null, forTab: null };
    loadPosts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Infinite scroll observer — prefetches before hitting bottom ──
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0, rootMargin: PREFETCH_MARGIN }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page]);

  // ── Realtime new-posts banner ──────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('home:new:' + user?.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter: 'is_draft=eq.false' },
        (payload) => {
          if (!loadingRef.current && payload.new?.audience === 'public') {
            setNewPostsCount(c => c + 1);
            setNewPostsBanner(true);
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Unread notifications badge ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const fetchUnread = async () => {
      try {
        const { count } = await supabase.from('notifications')
          .select('id', { count:'exact', head:true })
          .eq('user_id', user.id).eq('is_read', false);
        setUnread(count || 0);
      } catch (_) {}
    };
    fetchUnread();
    const ch = supabase.channel('nav:unread:' + user.id)
      .on('postgres_changes',
        { event:'*', schema:'public', table:'notifications',
          filter:'user_id=eq.'+user.id },
        fetchUnread
      ).subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  // ── Scroll tracking: back-to-top button + hide FAB on scroll-down ──
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setShowScrollTop(y > SCROLL_TOP_THRESHOLD);
        setFabVisible(y < lastScrollYRef.current || y < 100);
        lastScrollYRef.current = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Resolve the id list for 'following' / 'country' tabs, cached ──
  const resolveTabUserIds = useCallback(async () => {
    const cache = idCacheRef.current;
    if (cache.forTab === activeTab && cache[activeTab]) return cache[activeTab];

    let ids;
    if (activeTab === 'following') {
      const { data, error } = await supabase.from('follows')
        .select('following_id').eq('follower_id', user.id);
      if (error) throw error;
      const followingIds = (data || []).map(f => f.following_id);
      ids = followingIds.length > 0 ? [...followingIds, user.id] : [user.id];
    } else if (activeTab === 'country') {
      const userCountry = profile?.country || 'KE';
      const { data, error } = await supabase.from('users')
        .select('id').eq('country', userCountry);
      if (error) throw error;
      ids = (data || []).map(u => u.id);
    } else {
      return null;
    }

    idCacheRef.current = { ...cache, forTab: activeTab, [activeTab]: ids };
    return ids;
  }, [activeTab, user?.id, profile?.country]);

  // ── Core feed loader ────────────────────────────────────────────
  const loadPosts = useCallback(async (pageNum, reset = false, silent = false) => {

    if (reset && !silent) setLoading(true);
    else if (!reset)      setLoadingMore(true);

    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {

      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      if (!silent) {
        setFetchError(navigator.onLine
          ? 'Feed is taking too long to load. Check your connection and pull down to retry.'
          : 'You appear to be offline. Check your connection and try again.');
      }
    }, LOAD_TIMEOUT_MS);

    try {
      const from = pageNum * POSTS_PER_PAGE;
      const to   = from + POSTS_PER_PAGE - 1;
      let data = null, error = null;

      if (activeTab === 'foryou') {

        const res = await supabase.from('posts')
          .select(POST_SELECT)
          .eq('is_draft', false)
          .eq('audience', 'public')
          .neq('status', 'deleted')
          .neq('status', 'hidden')
          .order('is_boosted',     { ascending: false })
          .order('likes_count',    { ascending: false })
          .order('comments_count', { ascending: false })
          .order('created_at',     { ascending: false })
          .range(from, to);
        data = res.data; error = res.error;


      } else {

        const ids = await resolveTabUserIds();


        const q = supabase.from('posts')
          .select(POST_SELECT)
          .eq('is_draft', false)
          .eq('audience', 'public')
          .neq('status', 'deleted')
          .neq('status', 'hidden')
          .order('created_at', { ascending: false })
          .range(from, to);
        const res = ids && ids.length > 0 ? await q.in('user_id', ids) : await q;
        data = res.data; error = res.error;

      }

      clearTimeout(loadTimerRef.current);

      if (error) {
        console.error('Feed query error:', error.message, error.code);
        if (!silent) {
          setFetchError(
            error.message?.includes('JWT')
              ? 'Session expired — please sign out and sign in again.'
              : error.message?.includes('ambiguous') || error.message?.includes('relationship')
                ? 'A database configuration issue is preventing posts from loading. Contact support.'
                : 'Feed failed to load. Pull down to retry.'
          );
        }
        setLoading(false); setLoadingMore(false); setRefreshing(false);
        return;
      }

      const newPosts = (data || []).map(normalise);

      if (reset) {
        setPosts(newPosts);
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id));
          return [...prev, ...newPosts.filter(p => !ids.has(p.id))];
        });
      }

      setHasMore(newPosts.length === POSTS_PER_PAGE);
      setFetchError('');
      setNewPostsBanner(false);
      setNewPostsCount(0);


    } catch (err) {
      clearTimeout(loadTimerRef.current);
      console.error('loadPosts error:', err.message);

      if (!silent) {
        setFetchError(
          err.message?.includes('timeout') || err.name === 'AbortError'
            ? 'Request timed out. Check your connection and try again.'
            : err.message || 'Feed failed to load. Pull down to retry.'
        );
      }
    } finally {
      clearTimeout(loadTimerRef.current);
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      setPullDist(0);
      setIsPulling(false);
    }
  }, [activeTab, resolveTabUserIds]);

  // ── Silent "are there new posts" check ──
  const checkForNewPosts = useCallback(async () => {
    try {
      let res;
      if (activeTabRef.current === 'foryou') {
        res = await supabase.from('posts')
          .select('id', { head: false })
          .eq('is_draft', false)
          .eq('audience', 'public')
          .neq('status', 'deleted')
          .neq('status', 'hidden')
          .order('created_at', { ascending: false })
          .limit(POSTS_PER_PAGE);
      } else {
        const ids = await resolveTabUserIds();
        const q = supabase.from('posts')
          .select('id')
          .eq('is_draft', false)
          .eq('audience', 'public')
          .neq('status', 'deleted')
          .neq('status', 'hidden')
          .order('created_at', { ascending: false })
          .limit(POSTS_PER_PAGE);
        res = ids && ids.length > 0 ? await q.in('user_id', ids) : await q;
      }
      if (res.error) return;

      setPosts(prev => {
        const currentIds = new Set(prev.map(p => p.id));
        const freshCount = (res.data || []).filter(p => !currentIds.has(p.id)).length;
        if (freshCount > 0) {
          setNewPostsCount(freshCount);
          setNewPostsBanner(true);
        }
        return prev;
      });
    } catch (_) { /* silent by design */ }
  }, [resolveTabUserIds]);

  const refreshFeed = useCallback(() => loadPosts(0, true), [loadPosts]);

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    loadPosts(next, false);
  }, [page, loadPosts]);

  const scrollToTopAndRefresh = () => {
    setPage(0);
    loadPosts(0, true);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e) => {
    if (!touchStartY.current || window.scrollY > 0) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) { setIsPulling(true); setPullDist(Math.min(diff * 0.5, PULL_THRESHOLD + 25)); }
  };
  const handleTouchEnd = () => {
    if (pullDist >= PULL_THRESHOLD && !refreshing) {
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
      setRefreshing(true);
      setPage(0);
      loadPosts(0, true);
    } else {
      setIsPulling(false);
      setPullDist(0);
    }
    touchStartY.current = null;
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) scrollToTopAndRefresh();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { key: 'following', label: 'Following' },
    { key: 'foryou',    label: 'For You'   },
    {
      key: 'country',
      label: (flagMap[profile?.country || 'KE'] || '🌍') + ' ' + (profile?.country || 'KE'),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-20">
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/10 backdrop-blur border border-white/15 rounded-full px-4 py-2 pointer-events-none animate-[fadeIn_0.2s_ease-out]">
          <p className="text-white text-sm font-semibold whitespace-nowrap">{toast}</p>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <Menu size={22} className="text-white" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center shadow-lg shadow-[#FF5A1F]/30">
              <span className="text-white font-black text-base">B</span>
            </div>
            <span className="text-white font-extrabold text-lg tracking-tight">B-Link</span>
          </div>

          <button
            onClick={() => navigate('/notifications')}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            className="relative w-9 h-9 flex items-center justify-center"
          >
            <Bell size={22} className="text-[#8E8C88]" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-[#FF5A1F] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5 animate-pulse">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>

        {/* Feed tabs */}
        <div className="flex" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-sm font-semibold transition-colors relative"
              style={{ color: activeTab === tab.key ? 'white' : '#8E8C88' }}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#FF5A1F] rounded-full transition-all duration-200"
                  style={{ width:'60%' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <Stories />

      {isOffline && (
        <div className="mx-4 mt-3 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
          <WifiOff size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm font-semibold flex-1">You're offline — showing cached content</p>
        </div>
      )}

      {newPostsBanner && !loading && (
        <div className="flex justify-center py-2 sticky top-[106px] z-10">
          <button
            onClick={scrollToTopAndRefresh}
            className="bg-[#FF5A1F] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-[#FF5A1F]/40 flex items-center gap-2 active:scale-95 transition-transform"
          >
            <RefreshCw size={12} />
            {newPostsCount > 0
              ? `${newPostsCount} new post${newPostsCount !== 1 ? 's' : ''} — tap to refresh`
              : 'New posts — tap to refresh'}
          </button>
        </div>
      )}

      <div
        className="overflow-hidden flex items-center justify-center transition-all"
        style={{ height: isPulling || refreshing ? Math.max(pullDist, refreshing ? 44 : 0) : 0 }}
      >
        <div className={`flex items-center gap-2 text-sm ${pullDist >= PULL_THRESHOLD || refreshing ? 'text-[#FF5A1F]' : 'text-[#8E8C88]'}`}>
          <RefreshCw size={14} className={refreshing && !reducedMotion ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : pullDist >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {fetchError && !loading && (
          <div className="mx-4 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <p className="text-red-400 text-sm font-semibold mb-1">Feed couldn't load</p>
            <p className="text-red-300/70 text-xs mb-3 leading-relaxed">{fetchError}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setFetchError(''); setPage(0); loadPosts(0, true); }}
                className="flex items-center gap-1.5 text-xs font-bold text-[#FF5A1F]"
              >
                <RefreshCw size={12} /> Try again
              </button>
              {fetchError.includes('sign') && (
                <button
                  onClick={() => navigate('/login')}
                  className="text-xs font-bold text-orange-400 ml-3"
                >
                  Sign in again →
                </button>
              )}
            </div>
          </div>
        )}

        {loading && (
          <>{Array(5).fill(0).map((_, i) => <PostSkeleton key={i} />)}</>
        )}

        {!loading && !fetchError && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
            <Users size={46} className="text-[#8E8C88] mx-auto" />
            <h2 className="text-white font-bold text-xl text-center">
              {activeTab === 'following' ? 'Nothing in your feed yet' : 'No posts yet'}
            </h2>
            <p className="text-[#8E8C88] text-sm text-center">
              {activeTab === 'following' ? 'Follow people to see their posts here.' : 'Be the first to post!'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => navigate('/discover')}
                className="bg-[#FF5A1F] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-[#FF5A1F]/30 active:scale-95 transition-transform">
                Find people
              </button>
              <button onClick={() => navigate('/create')}
                className="bg-white/10 text-white px-5 py-2.5 rounded-full font-bold text-sm border border-white/20 active:scale-95 transition-transform">
                Create post
              </button>
            </div>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <>
            {posts.map(post => (
              <PostCard key={post.id} post={post} currentUser={user} onRefresh={refreshFeed} />
            ))}
            <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]">
              {loadingMore && (
                <div className="flex items-center gap-2 text-[#8E8C88]">
                  <div className={`w-5 h-5 border-2 border-[#FF5A1F] border-t-transparent rounded-full ${reducedMotion ? '' : 'animate-spin'}`} />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasMore && !loadingMore && (
                <p className="text-[#8E8C88] text-xs">You're all caught up</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Back-to-top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="fixed bottom-40 right-4 w-11 h-11 rounded-full bg-white/10 backdrop-blur border border-white/15 flex items-center justify-center shadow-lg z-20 active:scale-95 transition-transform"
        >
          <ChevronUp size={20} className="text-white" />
        </button>
      )}

      {/* FAB — hides on scroll-down, reappears on scroll-up, for more reading room */}
      <button
        onClick={() => navigate('/create')}
        aria-label="Create post"
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-[#FF5A1F] flex items-center justify-center shadow-xl shadow-[#FF5A1F]/40 hover:bg-[#d9480f] active:scale-95 transition-all z-20"
        style={{
          transform: fabVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.85)',
          opacity: fabVisible ? 1 : 0,
          pointerEvents: fabVisible ? 'auto' : 'none',
        }}
      >
        <Feather size={22} color="white" />
      </button>
    </div>
  );
}