import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, RefreshCw, Feather } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import PostCard from '../../components/PostCard';
import Stories from '../../components/Stories';

const POSTS_PER_PAGE = 15;

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

function PostSkeleton() {
  return (
    <div className="border-b border-white/8 px-4 py-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex gap-2">
            <div className="h-3 bg-white/10 rounded-full w-24" />
            <div className="h-3 bg-white/10 rounded-full w-16" />
            <div className="h-3 bg-white/10 rounded-full w-10" />
          </div>
          <div className="h-3 bg-white/10 rounded-full w-full" />
          <div className="h-3 bg-white/10 rounded-full w-4/5" />
          <div className="h-3 bg-white/10 rounded-full w-3/5" />
          <div className="h-32 bg-white/10 rounded-2xl w-full mt-2" />
          <div className="flex gap-6 mt-2">
            <div className="h-3 bg-white/10 rounded-full w-8" />
            <div className="h-3 bg-white/10 rounded-full w-8" />
            <div className="h-3 bg-white/10 rounded-full w-8" />
            <div className="h-3 bg-white/10 rounded-full w-8" />
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

  const observerRef  = useRef();
  const loadMoreRef  = useRef();
  const touchStartY  = useRef(null);
  const feedRef      = useRef();
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    setNewPostsAvail(false);
    loadPosts(0, true);
    fetchUnread();
  }, [activeTab]);

  // Infinite scroll observer
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

  // Real-time new posts notification
  useEffect(() => {
    const ch = supabase
      .channel('home:rt:' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        if (page === 0 && !loading) setNewPostsAvail(true);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [activeTab, page, loading]);

  const fetchUnread = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadNotifs(count || 0);
  };

  const buildQuery = async (pageNum) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to   = from + POSTS_PER_PAGE - 1;

    if (activeTab === 'following') {
      const { data: follows } = await supabase
        .from('follows').select('following_id')
        .eq('follower_id', user.id).eq('status', 'accepted');
      const ids = [...(follows || []).map((f) => f.following_id), user.id];
      return supabase
        .from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
        .eq('is_draft', false).eq('audience', 'public')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    if (activeTab === 'foryou') {
      return supabase
        .from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
        .eq('is_draft', false).eq('audience', 'public')
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    if (activeTab === 'country') {
      const { data: cu } = await supabase
        .from('users').select('id').eq('country', profile?.country || 'KE');
      const ids = (cu || []).map((u) => u.id);
      return supabase
        .from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
        .eq('is_draft', false).eq('audience', 'public')
        .in('user_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })
        .range(from, to);
    }
  };

  const loadPosts = async (pageNum, reset = false) => {
    if (reset) { setLoading(true); setPage(0); setHasMore(true); }
    else setLoadingMore(true);

    const query = await buildQuery(pageNum);
    if (!query) { setLoading(false); setLoadingMore(false); return; }

    const { data } = await query;
    const newPosts = data || [];

    if (reset) {
      setPosts(newPosts);
    } else {
      setPosts((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...newPosts.filter((p) => !ids.has(p.id))];
      });
    }

    setHasMore(newPosts.length === POSTS_PER_PAGE);
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

  // Pull-to-refresh
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

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/8">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Profile avatar → opens drawer */}
          <button onClick={() => setDrawerOpen(true)} className="relative">
            <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white/10">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="me" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm">
                    {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                  </div>
              }
            </div>
          </button>

          {/* B-Link logo center */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-base shadow-lg shadow-[#1E6FFF]/30">
              B
            </div>
            <span className="text-white font-extrabold text-lg tracking-tight">B-Link</span>
          </div>

          {/* Notification bell */}
          <button onClick={() => navigate('/notifications')} className="relative p-1">
            <Bell size={22} className="text-[#6B7280]" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#1E6FFF] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
        </div>

        {/* Tabs — Twitter underline style */}
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-sm font-semibold transition-all relative"
              style={{ color: activeTab === tab.key ? 'white' : '#6B7280' }}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full"
                  style={{ width: '60%' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stories row */}
      <Stories />

      {/* New posts pill */}
      {newPostsAvail && !loading && (
        <div className="flex justify-center py-2 sticky top-28 z-10">
          <button
            onClick={() => loadPosts(0, true)}
            className="bg-[#1E6FFF] text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-[#1E6FFF]/40 flex items-center gap-2 hover:bg-[#1565cc] transition-colors"
          >
            <RefreshCw size={12} /> New posts available
          </button>
        </div>
      )}

      {/* Pull indicator */}
      <div
        className="overflow-hidden transition-all flex items-center justify-center"
        style={{ height: isPulling || refreshing ? Math.max(pullDistance, refreshing ? 44 : 0) : 0 }}
      >
        <div className={`flex items-center gap-2 text-sm ${pullDistance >= PULL_THRESHOLD || refreshing ? 'text-[#1E6FFF]' : 'text-[#6B7280]'}`}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <>{Array(5).fill(0).map((_, i) => <PostSkeleton key={i} />)}</>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
            <p className="text-6xl">🐦</p>
            <h2 className="text-white font-bold text-xl text-center">
              {activeTab === 'following' ? 'Nothing in your feed yet' : 'No posts yet'}
            </h2>
            <p className="text-[#6B7280] text-sm text-center">
              {activeTab === 'following'
                ? 'Follow people to see their posts here.'
                : 'Be the first to post something!'}
            </p>
            <button
              onClick={() => navigate('/discover')}
              className="bg-[#1E6FFF] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30"
            >
              Find people to follow
            </button>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={user}
                onRefresh={() => loadPosts(0, true)}
              />
            ))}

            {/* Infinite scroll sentinel */}
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

      {/* Floating compose button */}
      <button
        onClick={() => navigate('/create')}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-[#1E6FFF] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 hover:bg-[#1565cc] transition-colors z-20"
        style={{ maxWidth: 'calc(310px + 0px)' }}
      >
        <Feather size={22} color="white" />
      </button>
    </div>
  );
}