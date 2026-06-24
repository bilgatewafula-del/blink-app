import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Grid,
  Bookmark,
  BarChart2,
  Settings,
  Edit3,
  Plus
} from 'lucide-react';
import { ProfileSkeleton } from '../../components/Skeleton';
import { StoryCreator, StoryViewer } from '../../components/Stories';
import { formatNumber } from '../../utils/formatNumber';

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

const POSTS_PER_PAGE = 12;

const Profile = () => {
  const { profile, user, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [myStories, setMyStories] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [viewingStory, setViewingStory] = useState(false);
  const observerRef = useRef();
  const loadMoreRef = useRef();

  useEffect(() => {
    if (user) {
      loadPosts(0, true);
      fetchSaved();
      fetchMyStories();
    }
  }, [user]);


  // Infinite scroll observer
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && activeTab === 'posts') {
          loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, activeTab, page]);

  const loadPosts = async (pageNum, reset = false) => {
    if (reset) { setLoading(true); setPage(0); setHasMore(true); }
    else setLoadingMore(true);

    const from = pageNum * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (reset) {
      setPosts(data || []);
    } else {
      setPosts((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...(data || []).filter((p) => !ids.has(p.id))];
      });
    }
    setHasMore((data || []).length === POSTS_PER_PAGE);
    setLoading(false);
    setLoadingMore(false);
  };

  const loadMorePosts = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPosts(nextPage, false);
  };

  const fetchSaved = async () => {
    const { data } = await supabase
      .from('saved_posts')
      .select('*, posts(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setSavedPosts(data || []);
  };


  const fetchMyStories = async () => {
    const { data } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    setMyStories(data || []);
  };

  const handleStoryCreated = () => {
    fetchMyStories();
    fetchProfile(user.id);
  };

  if (loading) return <ProfileSkeleton />;

  const totalLikes = posts.reduce((a, p) => a + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((a, p) => a + (p.comments_count || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">@{profile?.username}</h1>
        <button
          onClick={() => navigate('/settings')}
          className="text-[#6B7280] hover:text-white transition-colors"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Cover */}
      <div className="relative">
        <div className="h-36 bg-gradient-to-br from-[#1E6FFF]/50 via-[#7B2FFF]/30 to-[#00D4C8]/20 overflow-hidden">
          {profile?.cover_url && (
            <img src={profile.cover_url} alt="cover" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Avatar with story ring */}
        <div className="absolute -bottom-14 left-4">
          <button
            onClick={() => myStories.length > 0 ? setViewingStory(true) : setShowCreator(true)}
            className="relative p-1 bg-[#0A1628] rounded-full"
          >
            <div className={
              'rounded-full overflow-hidden border-2 ' +
              (myStories.length > 0 ? 'border-[#1E6FFF] story-ring-pulse' : 'border-white/20')
            }>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-3xl">
                  {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                </div>
              )}
            </div>
            {/* Story add/view indicator */}
            <div className={
              'absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#0A1628] ' +
              (myStories.length > 0 ? 'bg-[#1E6FFF]' : 'bg-[#2ECC71]')
            }>
              <Plus size={12} className="text-white" />
            </div>
          </button>
        </div>

        {/* Edit button */}
        <button
          onClick={() => navigate('/profile/edit')}
          className="absolute bottom-3 right-4 flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-white/20 transition-all backdrop-blur-sm"
        >
          <Edit3 size={13} />
          Edit Profile
        </button>
      </div>

      {/* Profile info */}
      <div className="mt-16 px-4">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <h2 className="text-white font-bold text-xl">{profile?.display_name || 'B-Link User'}</h2>
          {profile?.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">✓ Verified</span>
          )}
          <span className="text-xl">{flagMap[profile?.country] || '🌍'}</span>
        </div>
        <p className="text-[#6B7280] text-sm mb-2">@{profile?.username}</p>

        {profile?.bio && (
          <p className="text-white/80 text-sm mb-2 leading-relaxed">{profile.bio}</p>
        )}

    {profile?.website && (
  <a
    href={profile.website}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-1.5 text-[#1E6FFF] text-sm mb-3 hover:underline w-fit"
  >
    🔗 {profile.website.replace('https://', '')}
  </a>
)}
<div className="flex gap-3 mb-4">
  <button
    onClick={() => navigate('/subscription')}
    className="flex-1 bg-gradient-to-r from-[#FFD700] to-[#FFB800] text-[#0A1628] font-bold px-4 py-3 rounded-xl"
  >
    ⭐ Upgrade Plan
  </button>

  <button
    onClick={() => navigate('/coins')}
    className="flex-1 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold px-4 py-3 rounded-xl"
  >
    🪙 Buy Coins
  </button>
</div>
        {/* Story status */}
        {myStories.length > 0 && (
          <button
            onClick={() => setViewingStory(true)}
            className="flex items-center gap-2 bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-full px-3 py-1.5 mb-3 hover:bg-[#1E6FFF]/20 transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-[#1E6FFF] animate-pulse" />
            <span className="text-[#1E6FFF] text-xs font-semibold">
              {myStories.length} active {myStories.length === 1 ? 'story' : 'stories'}
            </span>
          </button>
        )}

        {/* Stats */}
        <div className="flex gap-6 pb-4 border-b border-white/5">
          <div className="text-center">
            <p className="text-white font-bold text-lg">{formatNumber(posts.length)}</p>
            <p className="text-[#6B7280] text-xs">Posts</p>
          </div>
          <button
            onClick={() => navigate('/discover')}
            className="text-center hover:opacity-80 transition-opacity"
          >
            <p className="text-white font-bold text-lg">{formatNumber(profile?.follower_count || 0)}</p>
            <p className="text-[#6B7280] text-xs">Followers</p>
          </button>
          <button
            onClick={() => navigate('/discover')}
            className="text-center hover:opacity-80 transition-opacity"
          >
            <p className="text-white font-bold text-lg">{formatNumber(profile?.following_count || 0)}</p>
            <p className="text-[#6B7280] text-xs">Following</p>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 sticky top-14 bg-[#0A1628] z-20">
        {[
  { key: 'posts', icon: Grid, label: 'Posts' },
  { key: 'saved', icon: Bookmark, label: 'Saved' },
  { key: 'analytics', icon: BarChart2, label: 'Analytics' },
].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={
              'flex-1 flex items-center justify-center gap-2 py-3.5 border-b-2 transition-all text-sm font-semibold ' +
              (activeTab === key
                ? 'border-[#1E6FFF] text-[#1E6FFF]'
                : 'border-transparent text-[#6B7280] hover:text-white')
            }
          >
            <Icon size={16} />
            {label}
            {key === 'posts' && posts.length > 0 && (
              <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{posts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {activeTab === 'posts' && (
        posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-16 gap-3 px-6">
            <div className="text-5xl">📸</div>
            <h3 className="text-white font-bold text-lg">No posts yet</h3>
            <p className="text-[#6B7280] text-sm text-center">Share your first moment with the world.</p>
            <button
              onClick={() => navigate('/create')}
              className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white px-6 py-3 rounded-full font-bold text-sm mt-2 shadow-lg shadow-[#1E6FFF]/30"
            >
              Create First Post
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0.5 mt-0.5">
              {posts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => navigate('/post/' + post.id)}
                  className="aspect-square cursor-pointer hover:opacity-80 transition-opacity relative overflow-hidden group bg-[#111827]"
                >
                  {post.media_urls?.length > 0 ? (
                    <img
                      src={post.media_urls[0]}
                      alt="post"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div
                      style={{ background: post.bg_color || '#111827' }}
                      className="w-full h-full flex items-center justify-center p-2"
                    >
                      <p className="text-white text-xs text-center font-semibold line-clamp-4 leading-relaxed">
                        {post.caption}
                      </p>
                    </div>
                  )}
                  {post.media_urls?.length > 1 && (
                    <div className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-sm rounded-full p-1">
                      <Grid size={10} className="text-white" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <span className="text-white text-xs font-bold">❤️ {post.likes_count || 0}</span>
                    <span className="text-white text-xs font-bold">💬 {post.comments_count || 0}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {loadingMore && (
                <div className="flex items-center gap-2 text-[#6B7280]">
                  <div className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasMore && posts.length > 0 && (
                <p className="text-[#6B7280] text-xs">All posts loaded 🎉</p>
              )}
            </div>
          </>
        )
      )}

      {/* Saved tab */}
      {activeTab === 'saved' && (
        savedPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-16 gap-3 px-6">
            <div className="text-5xl">🔖</div>
            <h3 className="text-white font-bold text-lg">No saved posts</h3>
            <p className="text-[#6B7280] text-sm text-center">Posts you save will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {savedPosts.map((sp) => (
              <div
                key={sp.id}
                onClick={() => navigate('/post/' + sp.post_id)}
                className="aspect-square cursor-pointer hover:opacity-80 transition-opacity relative overflow-hidden group bg-[#111827]"
              >
                {sp.posts?.media_urls?.length > 0 ? (
                  <img
                    src={sp.posts.media_urls[0]}
                    alt="saved"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div
                    style={{ background: sp.posts?.bg_color || '#111827' }}
                    className="w-full h-full flex items-center justify-center p-2"
                  >
                    <p className="text-white text-xs text-center line-clamp-4">{sp.posts?.caption}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="p-4 space-y-3 mt-2">
          {[
            { label: 'Total Posts', value: String(posts.length), icon: '📸', color: 'text-[#1E6FFF]' },
            { label: 'Total Reactions', value: formatNumber(totalLikes), icon: '❤️', color: 'text-red-400' },
            { label: 'Total Comments', value: formatNumber(totalComments), icon: '💬', color: 'text-[#FF6B35]' },
            { label: 'Followers', value: formatNumber(profile?.follower_count || 0), icon: '👥', color: 'text-[#2ECC71]' },
            { label: 'Following', value: formatNumber(profile?.following_count || 0), icon: '🔗', color: 'text-[#7B2FFF]' },
            { label: 'Active Stories', value: String(myStories.length), icon: '⭕', color: 'text-[#00D4C8]' },
            { label: 'Saved Posts', value: String(savedPosts.length), icon: '🔖', color: 'text-[#FFD700]' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{stat.icon}</span>
                <span className="text-white/80 text-sm font-medium">{stat.label}</span>
              </div>
              <span className={'font-bold text-xl ' + stat.color}>{stat.value}</span>
            </div>
          ))}

          {/* Engagement rate */}
          {posts.length > 0 && (
            <div className="bg-gradient-to-r from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-4">
              <p className="text-white font-bold text-sm mb-1">📊 Engagement Rate</p>
              <p className="text-[#1E6FFF] text-2xl font-bold">
                {((totalLikes + totalComments) / Math.max(posts.length, 1)).toFixed(1)}
              </p>
              <p className="text-[#6B7280] text-xs mt-1">avg reactions + comments per post</p>
            </div>
          )}
        </div>
      )}

      {/* Story creator */}
      {showCreator && (
        <StoryCreator
          onClose={() => setShowCreator(false)}
          onCreated={handleStoryCreated}
        />
      )}

      {/* Story viewer */}
     {viewingStory && myStories.length > 0 && (
  <StoryViewer
    stories={myStories.map(story => ({
      ...story,
      users: profile
    }))}
    startIndex={0}
    onClose={() => {
      setViewingStory(false);
      fetchMyStories();
    }}
  />
)}
    </div>
  );
};

export default Profile;