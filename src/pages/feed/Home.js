import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Zap, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import Avatar from '../../components/Avatar';
import PostCard from '../../components/PostCard';
import { PostCardSkeleton } from '../../components/Skeleton';
import Stories from '../../components/Stories';

const POSTS_PER_PAGE = 10;

const Home = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('following');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const observerRef = useRef();
  const loadMoreRef = useRef();
  const touchStartY = useRef(null);
  const feedRef = useRef();
  const PULL_THRESHOLD = 80;

  const flagMap = {
    KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
    TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
    GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
  };

  useEffect(() => {
    loadPosts(0, true);
    fetchUnread();
  }, [activeTab]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page]);

  useEffect(() => {
    const channel = supabase
      .channel('home:realtime:' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
        () => { if (page === 0) loadPosts(0, true); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeTab, page]);

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
    const to = from + POSTS_PER_PAGE - 1;

    if (activeTab === 'following') {
      const { data: follows } = await supabase
        .from('follows').select('following_id')
        .eq('follower_id', user.id).eq('status', 'accepted');
      const ids = [...(follows || []).map((f) => f.following_id), user.id];
      return supabase
        .from('posts')
        .select('*, users(id, username, display_name, avatar_url, country, is_verified)')
        .eq('is_draft', false).eq('audience', 'public')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .range(from, to);
    }
    if (activeTab === 'trending') {
      return supabase
        .from('posts')
        .select('*, users(id, username, display_name, avatar_url, country, is_verified)')
        .eq('is_draft', false).eq('audience', 'public')
        .order('likes_count', { ascending: false })
        .order('comments_count', { ascending: false })
        .range(from, to);
    }
    if (activeTab === 'country') {
      const { data: cu } = await supabase
        .from('users').select('id').eq('country', profile?.country || 'KE');
      const ids = (cu || []).map((u) => u.id);
      return supabase
        .from('posts')
        .select('*, users(id, username, display_name, avatar_url, country, is_verified)')
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
    if (reset) setPosts(newPosts);
    else setPosts((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      return [...prev, ...newPosts.filter((p) => !ids.has(p.id))];
    });
    setHasMore(newPosts.length === POSTS_PER_PAGE);
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
    setPullDistance(0);
    setIsPulling(false);
  };

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPosts(nextPage, false);
  }, [page, activeTab]);

  const handleTouchStart = (e) => {
    if ((feedRef.current?.scrollTop || 0) === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };
  const handleTouchMove = (e) => {
    if (touchStartY.current === null) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) { setIsPulling(true); setPullDistance(Math.min(diff * 0.5, PULL_THRESHOLD + 30)); }
  };
  const handleTouchEnd = () => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) { setRefreshing(true); loadPosts(0, true); }
    else { setIsPulling(false); setPullDistance(0); }
    touchStartY.current = null;
  };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-[#1E6FFF]/30">
              B
            </div>
            <span className="text-white font-bold text-lg">B-Link</span>
          </div>

          {/* Right: Vibes shortcut + Bell + Menu */}
          <div className="flex items-center gap-2">
            {/* Vibes tab — only on Home */}
            <button
              onClick={() => navigate('/vibes')}
              className="flex items-center gap-1.5 bg-gradient-to-r from-[#FF6B35]/20 to-[#FFD700]/20 border border-[#FF6B35]/30 rounded-full px-3 py-1.5 hover:from-[#FF6B35]/30 hover:to-[#FFD700]/30 transition-all active:scale-95"
            >
              <Zap size={14} className="text-[#FF6B35]" />
              <span className="text-[#FF6B35] text-xs font-bold">Vibes</span>
            </button>

            {/* Bell */}
            <button onClick={() => navigate('/notifications')} className="relative p-1">
              <Bell size={22} className="text-[#6B7280]" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#FF6B35] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-0.5">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </button>

            {/* Hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex flex-col items-center justify-center gap-1 shadow-lg shadow-[#1E6FFF]/30 flex-shrink-0"
            >
              <span className="w-4 h-0.5 bg-white rounded-full" />
              <span className="w-4 h-0.5 bg-white rounded-full" />
              <span className="w-3 h-0.5 bg-white rounded-full" />
            </button>
          </div>
        </div>

        {/* Feed tabs */}
        <div className="flex gap-1 mt-3 bg-white/5 rounded-xl p-1">
          {['following', 'trending', 'country'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={
                'flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200 ' +
                (activeTab === tab
                  ? 'bg-[#1E6FFF] text-white shadow-lg shadow-[#1E6FFF]/30'
                  : 'text-[#6B7280] hover:text-white')
              }
            >
              {tab === 'country'
                ? (flagMap[profile?.country || 'KE'] || '🌍') + ' ' + (profile?.country || 'KE')
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <Stories />

      {/* Pull to refresh */}
      <div
        className="overflow-hidden transition-all duration-200 flex items-center justify-center"
        style={{ height: isPulling || refreshing ? Math.max(pullDistance, refreshing ? 48 : 0) : 0 }}
      >
        <div className={'flex items-center gap-2 ' + (pullDistance >= PULL_THRESHOLD || refreshing ? 'text-[#1E6FFF]' : 'text-[#6B7280]')}>
          <RefreshCw
            size={18}
            className={refreshing ? 'animate-spin' : ''}
            style={{ transform: !refreshing ? 'rotate(' + Math.min((pullDistance / PULL_THRESHOLD) * 180, 180) + 'deg)' : undefined }}
          />
          <span className="text-xs font-semibold">
            {refreshing ? 'Refreshing...' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div ref={feedRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {loading ? (
          <div>{Array(3).fill(0).map((_, i) => <PostCardSkeleton key={i} />)}</div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-16 gap-4 px-6">
            <div className="text-5xl">📱</div>
            <h2 className="text-white font-bold text-xl text-center">
              {activeTab === 'following' ? 'Your feed is empty' : 'No posts yet'}
            </h2>
            <p className="text-[#6B7280] text-sm text-center">
              {activeTab === 'following' ? 'Follow people to see their posts here.' : 'Be the first to post!'}
            </p>
            <button
              onClick={() => navigate('/discover')}
              className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30"
            >
              Discover People
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUser={user} onRefresh={() => loadPosts(0, true)} />
              ))}
            </div>
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
    </div>
  );
};

export default Home;