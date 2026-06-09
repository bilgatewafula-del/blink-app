import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Search, X, TrendingUp, Users, Hash,
  Compass, Flame, Globe, ChevronRight
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatNumber } from '../../utils/formatNumber';
import { DiscoverSkeleton } from '../../components/Skeleton';

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

const Discover = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('people');
  const [searchResults, setSearchResults] = useState({ users: [], posts: [], hashtags: [] });
  const [suggested, setSuggested] = useState([]);
  const [trending, setTrending] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [followingIds, setFollowingIds] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const inputRef = useRef();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchFollowing(),
      fetchAllUsers(),
      fetchTrending(),
      fetchTrendingPosts(),
    ]);
    setLoading(false);
  };

  const fetchFollowing = async () => {
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    setFollowingIds(data?.map((f) => f.following_id) || []);
  };

  const fetchAllUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .neq('id', user.id)
      .order('follower_count', { ascending: false })
      .limit(50);
    setAllUsers(data || []);
    setSuggested((data || []).slice(0, 10));
  };

  const fetchTrending = async () => {
    const { data } = await supabase
      .from('hashtags')
      .select('*')
      .order('post_count', { ascending: false })
      .limit(20);
    setTrending(data || []);
  };

  const fetchTrendingPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id, username, display_name, avatar_url, is_verified, country)')
      .eq('is_draft', false)
      .eq('audience', 'public')
      .order('likes_count', { ascending: false })
      .limit(18);
    setTrendingPosts(data || []);
  };

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setSearchResults({ users: [], posts: [], hashtags: [] });
      return;
    }
    setSearching(true);

    // Search users — case insensitive, partial match
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .or(
        'username.ilike.%' + q + '%,' +
        'display_name.ilike.%' + q + '%,' +
        'bio.ilike.%' + q + '%'
      )
      .neq('id', user.id)
      .order('follower_count', { ascending: false })
      .limit(20);

    // Search posts
    const { data: postsData } = await supabase
      .from('posts')
      .select('*, users(id, username, display_name, avatar_url, is_verified, country)')
      .ilike('caption', '%' + q + '%')
      .eq('is_draft', false)
      .eq('audience', 'public')
      .order('likes_count', { ascending: false })
      .limit(15);

    // Search hashtags
    const { data: hashtagsData } = await supabase
      .from('hashtags')
      .select('*')
      .ilike('tag', '%' + q + '%')
      .order('post_count', { ascending: false })
      .limit(15);

    setSearchResults({
      users: usersData || [],
      posts: postsData || [],
      hashtags: hashtagsData || [],
    });
    setSearching(false);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => handleSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  const handleFollow = async (targetId) => {
    if (followingIds.includes(targetId)) {
      setFollowingIds((prev) => prev.filter((id) => id !== targetId));
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', targetId);
      await supabase.from('users')
        .update({ follower_count: supabase.rpc('decrement') })
        .eq('id', targetId);
    } else {
      setFollowingIds((prev) => [...prev, targetId]);
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetId,
        status: 'accepted',
      });
      await supabase.from('notifications').insert({
        user_id: targetId,
        from_user_id: user.id,
        type: 'follow',
        message: 'started following you',
        is_read: false,
      });
    }
  };

  const isSearching = query.trim().length > 0;

  const tabs = [
    { key: 'people', icon: Users, label: 'People', count: searchResults.users.length },
    { key: 'posts', icon: TrendingUp, label: 'Posts', count: searchResults.posts.length },
    { key: 'tags', icon: Hash, label: 'Tags', count: searchResults.hashtags.length },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, posts, hashtags..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-10 pr-10 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white"
            >
              <X size={16} />
            </button>
          ) : (
            <Compass size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          )}
        </div>

        {/* Search tabs */}
        {isSearching && (
          <div className="flex gap-1 mt-3 bg-white/5 rounded-xl p-1">
            {tabs.map(({ key, icon: Icon, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                  (activeTab === key ? 'bg-[#1E6FFF] text-white' : 'text-[#6B7280]')
                }
              >
                <Icon size={12} />
                {label}
                {count > 0 && (
                  <span className={'text-[10px] rounded-full px-1 ' + (activeTab === key ? 'bg-white/20' : 'bg-white/10')}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search results */}
      {isSearching ? (
        <div className="px-4 py-3">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
              <p className="text-[#6B7280] text-sm">Searching...</p>
            </div>
          ) : (
            <>
              {/* People results */}
              {activeTab === 'people' && (
                <div className="space-y-2">
                  {searchResults.users.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">👤</p>
                      <p className="text-white font-bold">No users found</p>
                      <p className="text-[#6B7280] text-sm mt-1">Try a different name or username</p>
                    </div>
                  ) : (
                    searchResults.users.map((u) => (
                      <UserCard
                        key={u.id}
                        user={u}
                        isFollowing={followingIds.includes(u.id)}
                        onFollow={() => handleFollow(u.id)}
                        onNavigate={() => navigate('/profile/' + u.username)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Posts results */}
              {activeTab === 'posts' && (
                searchResults.posts.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">📝</p>
                    <p className="text-white font-bold">No posts found</p>
                    <p className="text-[#6B7280] text-sm mt-1">Try different keywords</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-0.5">
                    {searchResults.posts.map((post) => (
                      <PostThumb key={post.id} post={post} onClick={() => navigate('/post/' + post.id)} />
                    ))}
                  </div>
                )
              )}

              {/* Hashtag results */}
              {activeTab === 'tags' && (
                <div className="space-y-2">
                  {searchResults.hashtags.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">#</p>
                      <p className="text-white font-bold">No hashtags found</p>
                    </div>
                  ) : (
                    searchResults.hashtags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => navigate('/hashtag/' + tag.tag)}
                        className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 hover:bg-white/8 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#1E6FFF]/20 flex items-center justify-center flex-shrink-0">
                          <Hash size={18} className="text-[#1E6FFF]" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-white font-semibold text-sm">#{tag.tag}</p>
                          <p className="text-[#6B7280] text-xs">{formatNumber(tag.post_count)} posts</p>
                        </div>
                        <ChevronRight size={16} className="text-[#6B7280]" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Default discover view */
        loading ? (
          <DiscoverSkeleton />
        ) : (
          <div>
            {/* Trending hashtags */}
            {trending.length > 0 && (
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Flame size={16} className="text-[#FF6B35]" />
                  <h2 className="text-white font-bold text-base">Trending</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trending.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => navigate('/hashtag/' + tag.tag)}
                      className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 hover:bg-[#1E6FFF]/20 hover:border-[#1E6FFF]/40 transition-all"
                    >
                      <span className="text-[#1E6FFF] text-xs font-semibold">#{tag.tag}</span>
                      <span className="text-[#6B7280] text-xs ml-1">{formatNumber(tag.post_count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested people */}
            {suggested.length > 0 && (
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-[#7B2FFF]" />
                    <h2 className="text-white font-bold text-base">People to Follow</h2>
                  </div>
                  <button
                    onClick={() => { setQuery(' '); setTimeout(() => setQuery(''), 100); }}
                    className="text-[#1E6FFF] text-xs font-semibold"
                  >
                    See all
                  </button>
                </div>

                {/* Horizontal scroll for suggested */}
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {suggested.map((u) => (
                    <div
                      key={u.id}
                      className="flex-shrink-0 w-36 bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col items-center gap-2"
                    >
                      <button onClick={() => navigate('/profile/' + u.username)}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.display_name} className="w-14 h-14 rounded-full object-cover" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl">
                            {u.display_name?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </button>
                      <div className="text-center w-full">
                        <p className="text-white font-bold text-xs truncate">{u.display_name}</p>
                        <p className="text-[#6B7280] text-[10px] truncate">@{u.username}</p>
                        <p className="text-[#6B7280] text-[10px]">{formatNumber(u.follower_count || 0)} followers</p>
                      </div>
                      <button
                        onClick={() => handleFollow(u.id)}
                        className={
                          'w-full py-1.5 rounded-full text-xs font-bold transition-all ' +
                          (followingIds.includes(u.id)
                            ? 'bg-white/10 text-white/60'
                            : 'bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white')
                        }
                      >
                        {followingIds.includes(u.id) ? 'Following' : '+ Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All users list */}
            {allUsers.length > 0 && (
              <div className="px-4 pt-2 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={16} className="text-[#00D4C8]" />
                  <h2 className="text-white font-bold text-base">All Members</h2>
                  <span className="text-[#6B7280] text-xs">({allUsers.length})</span>
                </div>
                <div className="space-y-2">
                  {allUsers.map((u) => (
                    <UserCard
                      key={u.id}
                      user={u}
                      isFollowing={followingIds.includes(u.id)}
                      onFollow={() => handleFollow(u.id)}
                      onNavigate={() => navigate('/profile/' + u.username)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Trending posts grid */}
            {trendingPosts.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center gap-2 mb-3 px-4">
                  <TrendingUp size={16} className="text-[#1E6FFF]" />
                  <h2 className="text-white font-bold text-base">Trending Posts</h2>
                </div>
                <div className="grid grid-cols-3 gap-0.5">
                  {trendingPosts.map((post) => (
                    <PostThumb
                      key={post.id}
                      post={post}
                      onClick={() => navigate('/post/' + post.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {allUsers.length === 0 && trending.length === 0 && (
              <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
                <div className="text-5xl">🔍</div>
                <h2 className="text-white font-bold text-xl text-center">Discover B-Link</h2>
                <p className="text-[#6B7280] text-sm text-center">
                  Search for people, posts and hashtags above.
                </p>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

const UserCard = ({ user, isFollowing, onFollow, onNavigate }) => (
  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 hover:bg-white/8 transition-colors">
    <button onClick={onNavigate} className="flex items-center gap-3 flex-1 min-w-0">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt={user.display_name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {user.display_name?.[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <p className="text-white font-bold text-sm truncate">{user.display_name}</p>
          {user.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[8px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
          )}
          <span className="flex-shrink-0 text-sm">
            {flagMap[user.country] || '🌍'}
          </span>
        </div>
        <p className="text-[#6B7280] text-xs truncate">@{user.username}</p>
        {user.bio && <p className="text-[#6B7280] text-xs truncate">{user.bio}</p>}
        <p className="text-[#6B7280] text-xs">{formatNumber(user.follower_count || 0)} followers</p>
      </div>
    </button>
    <button
      onClick={onFollow}
      className={
        'ml-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ' +
        (isFollowing
          ? 'bg-white/10 border border-white/20 text-white hover:bg-red-500/10 hover:text-red-400'
          : 'bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white shadow-lg shadow-[#1E6FFF]/20')
      }
    >
      {isFollowing ? 'Following' : '+ Follow'}
    </button>
  </div>
);

const PostThumb = ({ post, onClick }) => (
  <div
    onClick={onClick}
    className="aspect-square cursor-pointer relative overflow-hidden group bg-[#111827]"
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
    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
      <span className="text-white text-xs font-bold">❤️ {post.likes_count || 0}</span>
      <span className="text-white text-xs font-bold">💬 {post.comments_count || 0}</span>
    </div>
  </div>
);

export default Discover;