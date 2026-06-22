import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, RefreshCw, Feather, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import PostCard from '../../components/PostCard';
import Stories from '../../components/Stories';

const POSTS_PER_PAGE = 15;

/* ── The EXACT select string to use everywhere for posts+author ──
   user_id!inner(...) tells Supabase: use the user_id FK, not
   moderated_by. This fixes the ambiguous relationship error.      */
const POST_SELECT = `
  id, caption, media_urls, video_url, video_duration, video_thumbnail,
  post_type, hashtags, location, bg_color, audience, status, is_draft,
  is_repost, quoted_post_id, likes_count, comments_count, reposts_count,
  views_count, shares_count, created_at, user_id,
  users!posts_user_id_fkey (
    id, username, display_name, avatar_url, country, is_verified, role
  )
`.trim();

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

function PostSkeleton() {
  return (
    <div className="border-b border-white/[0.07] px-4 py-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex gap-2">
            <div className="h-3 bg-white/10 rounded-full w-24" />
            <div className="h-3 bg-white/10 rounded-full w-16" />
          </div>
          <div className="h-3 bg-white/10 rounded-full w-full" />
          <div className="h-3 bg-white/10 rounded-full w-4/5" />
          <div className="h-3 bg-white/10 rounded-full w-3/5" />
          <div className="flex gap-6 mt-2">
            {[1,2,3,4].map(i => <div key={i} className="h-3 bg-white/10 rounded-full w-8" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('foryou');
  const [posts,         setPosts]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [hasMore,       setHasMore]       = useState(true);
  const [page,          setPage]          = useState(0);
  const [unreadNotifs,  setUnreadNotifs]  = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);
  const [pullDistance,  setPullDistance]  = useState(0);
  const [isPulling,     setIsPulling]     = useState(false);
  const [newPostsAvail, setNewPostsAvail] = useState(false);
  const [fetchError,    setFetchError]    = useState('');

  const observerRef  = useRef();
  const loadMoreRef  = useRef();
  const touchStartY  = useRef(null);
  const feedRef      = useRef();
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    setNewPostsAvail(false);
    setPosts([]);
    setPage(0);
    setHasMore(true);
    setFetchError('');
    loadPosts(0, true);
    fetchUnread();
  }, [activeTab]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading)
          handleLoadMore();
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page]);

  useEffect(() => {
    const ch = supabase.channel('home:rt:' + user?.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        if (page === 0 && !loading) setNewPostsAvail(true);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [page, loading]);

  const fetchUnread = async () => {
    if (!user?.id) return;
    const { count } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_read', false);
    setUnreadNotifs(count || 0);
  };

  /* ── Core query — explicit FK hint fixes ambiguity ── */
  const buildQuery = async (pageNum) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to   = from + POSTS_PER_PAGE - 1;

    const base = () => supabase
      .from('posts')
      .select(POST_SELECT)
      .neq('status', 'deleted')
      .eq('is_draft', false)
      .eq('audience', 'public');

    if (activeTab === 'following') {
      const { data: follows } = await supabase
        .from('follows').select('following_id')
        .eq('follower_id', user.id);

      const ids = [...(follows || []).map(f => f.following_id), user.id];

      return base()
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    if (activeTab === 'foryou') {
      return base()
        .order('likes_count',    { ascending: false })
        .order('comments_count', { ascending: false })
        .order('created_at',     { ascending: false })
        .range(from, to);
    }

    if (activeTab === 'country') {
      const { data: cu } = await supabase
        .from('users').select('id')
        .eq('country', profile?.country || 'KE');
      const ids = (cu || []).map(u => u.id);
      if (!ids.length) {
        return base().order('created_at', { ascending: false }).range(from, to);
      }
      return base()
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .range(from, to);
    }
  };

  const loadPosts = async (pageNum, reset = false) => {
    if (reset) {
      setLoading(true);
      setPage(0);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const query = await buildQuery(pageNum);
      if (!query) { setLoading(false); setLoadingMore(false); return; }

      const { data, error } = await query;

      if (error) {
        console.error('Feed error:', error.message);
        setFetchError('Feed could not load: ' + error.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const newPosts = (data || []).map(p => ({
        ...p,
        // Normalise: rename the joined relation to 'users' if Supabase returns it differently
        users: p['users!posts_user_id_fkey'] || p.users || null,
      }));

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
    } catch (err) {
      console.error('loadPosts exception:', err.message);
      setFetchError(err.message);
    }

    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
    setPullDistance(0);
    setIsPulling(false);
    setNewPostsAvail(false);
  };

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    loadPosts(next, false);
  }, [page, activeTab]);

  const handleTouchStart = (e) => {
    if ((feedRef.current?.scrollTop || 0) === 0)
      touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e) => {
    if (!touchStartY.current) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) { setIsPulling(true); setPullDistance(Math.min(diff * 0.5, PULL_THRESHOLD + 30)); }
  };
  const handleTouchEnd = () => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) { setRefreshing(true); loadPosts(0, true); }
    else { setIsPulling(false); setPullDistance(0); }
    touchStartY.current = null;
  };

  const tabs = [
    { key: 'following', label: 'Following' },
    { key: 'foryou',    label: 'For You' },
    { key: 'country',   label: (flagMap[profile?.country || 'KE'] || '🌍') + ' ' + (profile?.country || 'KE') },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={22} className="text-white" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-base shadow-lg shadow-[#1E6FFF]/30">B</div>
            <span className="text-white font-extrabold text-lg tracking-tight">B-Link</span>
          </div>

          <button onClick={() => navigate('/notifications')} className="relative p-1 w-9 h-9 flex items-center justify-center">
            <Bell size={22} className="text-[#6B7280]" />
            {unreadNotifs > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-[#1E6FFF] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
        </div>

        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-sm font-semibold transition-all relative"
              style={{ color: activeTab === tab.key ? 'white' : '#6B7280' }}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full" style={{ width: '60%' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      <Stories />

      {newPostsAvail && !loading && (
        <div className="flex justify-center py-2 sticky top-[106px] z-10">
          <button
            onClick={() => loadPosts(0, true)}
            className="bg-[#1E6FFF] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-[#1E6FFF]/40 flex items-center gap-2 hover:bg-[#1565cc] transition-colors"
          >
            <RefreshCw size={12} /> New posts available
          </button>
        </div>
      )}

      <div
        className="overflow-hidden flex items-center justify-center transition-all"
        style={{ height: isPulling || refreshing ? Math.max(pullDistance, refreshing ? 44 : 0) : 0 }}
      >
        <div className={`flex items-center gap-2 text-sm ${pullDistance >= PULL_THRESHOLD || refreshing ? 'text-[#1E6FFF]' : 'text-[#6B7280]'}`}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      </div>

      <div ref={feedRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {/* Error state */}
        {fetchError && !loading && (
          <div className="mx-4 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <p className="text-red-400 text-sm font-semibold mb-1">Feed failed to load</p>
            <p className="text-red-300/70 text-xs mb-3">{fetchError}</p>
            <button
              onClick={() => loadPosts(0, true)}
              className="text-xs font-bold text-[#1E6FFF] flex items-center gap-1"
            >
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        )}

        {loading ? (
          <>{Array(5).fill(0).map((_, i) => <PostSkeleton key={i} />)}</>
        ) : posts.length === 0 && !fetchError ? (
          <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
            <p className="text-6xl">🐦</p>
            <h2 className="text-white font-bold text-xl text-center">
              {activeTab === 'following' ? 'Nothing in your feed yet' : 'No posts yet'}
            </h2>
            <p className="text-[#6B7280] text-sm text-center">
              {activeTab === 'following' ? 'Follow people to see their posts.' : 'Be the first to post!'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => navigate('/discover')} className="bg-[#1E6FFF] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30">
                Find people
              </button>
              <button onClick={() => navigate('/create')} className="bg-white/10 text-white px-5 py-2.5 rounded-full font-bold text-sm border border-white/20">
                Create post
              </button>
            </div>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard key={post.id} post={post} currentUser={user} onRefresh={() => loadPosts(0, true)} />
            ))}
            <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]">
              {loadingMore && (
                <div className="flex items-center gap-2 text-[#6B7280]">
                  <div className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasMore && !loadingMore && posts.length > 0 && (
                <p className="text-[#6B7280] text-xs">You're all caught up! 🎉</p>
              )}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => navigate('/create')}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-[#1E6FFF] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 hover:bg-[#1565cc] transition-colors z-20"
      >
        <Feather size={22} color="white" />
      </button>
    </div>
  );
}