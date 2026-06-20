import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import { formatTime } from '../../utils/formatTime';
import {
  Search, TrendingUp, Sparkles, Clock,
  Hash, Users, UserPlus, UserCheck,
  X, RefreshCw, ChevronRight,
} from 'lucide-react';
import PostCard from '../../components/PostCard';
import Avatar from '../../components/Avatar';

const POSTS_PER_PAGE = 15;

/* ── Skeleton loaders ───────────────────────────── */
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
          <div className="h-3 bg-white/10 rounded-full w-3/4" />
        </div>
      </div>
    </div>
  );
}

function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-white/10 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-white/10 rounded-full w-32" />
        <div className="h-2.5 bg-white/10 rounded-full w-20" />
      </div>
      <div className="w-20 h-8 bg-white/10 rounded-full" />
    </div>
  );
}

/* ── Hashtag pill ───────────────────────────────── */
function HashtagPill({ tag, count, navigate }) {
  return (
    <button
      onClick={() => navigate('/hashtag/' + tag)}
      className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors w-full text-left group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#1E6FFF]/15 flex items-center justify-center flex-shrink-0">
          <Hash size={16} className="text-[#1E6FFF]" />
        </div>
        <div>
          <p className="text-white font-bold text-[14px]">#{tag}</p>
          <p className="text-[#6B7280] text-[12px]">{formatNumber(count)} posts</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-[#6B7280] group-hover:text-white transition-colors" />
    </button>
  );
}

/* ── People card ────────────────────────────────── */
function PeopleCard({ u, currentUserId, onFollowChange }) {
  const navigate = useNavigate();
  const [following,   setFollowing]   = useState(u.is_following || false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (loadingFollow) return;
    setLoadingFollow(true);
    if (following) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('following_id', u.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').upsert(
        { follower_id: currentUserId, following_id: u.id, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      );
      // Notify
      if (u.id !== currentUserId) {
        await supabase.from('notifications').upsert(
          { user_id: u.id, from_user_id: currentUserId, type: 'follow', message: 'started following you', is_read: false },
          { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
        );
      }
      setFollowing(true);
    }
    setLoadingFollow(false);
    if (onFollowChange) onFollowChange();
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors cursor-pointer"
      onClick={() => navigate('/profile/' + u.username)}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative">
        <Avatar url={u.avatar_url} name={u.display_name} size={11} />
        {u.role === 'blink' && (
          <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">👑</span>
        )}
        {u.role === 'admin' && (
          <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">🛡️</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
          {u.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
          )}
        </div>
        <p className="text-[#6B7280] text-[12px] truncate">@{u.username}</p>
        {u.bio && <p className="text-white/50 text-[11px] truncate mt-0.5">{u.bio}</p>}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[#6B7280] text-[11px]">{formatNumber(u.followers_count || 0)} followers</span>
          <span className="text-[#6B7280] text-[11px]">{formatNumber(u.posts_count || 0)} posts</span>
        </div>
      </div>

      {/* Follow button */}
      {u.id !== currentUserId && (
        <button
          onClick={handleFollow}
          disabled={loadingFollow}
          className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 ' +
            (following
              ? 'bg-white/[0.08] text-white border border-white/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
              : 'bg-[#1E6FFF] text-white hover:bg-[#1565cc] shadow-md shadow-[#1E6FFF]/30')}
        >
          {loadingFollow
            ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            : following
              ? <><UserCheck size={12} /> Following</>
              : <><UserPlus size={12} /> Follow</>
          }
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN DISCOVER PAGE
═══════════════════════════════════════════════ */
export default function Discover() {
  const navigate      = useNavigate();
  const { user }      = useAuth();

  const [mainTab,     setMainTab]     = useState('trending');   // trending | foryou | new | hashtags | people
  const [peopleSort,  setPeopleSort]  = useState('active');     // active | new | all | suggested
  const [posts,       setPosts]       = useState([]);
  const [people,      setPeople]      = useState([]);
  const [hashtags,    setHashtags]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [page,        setPage]        = useState(0);
  const [search,      setSearch]      = useState('');
  const [searchResults, setSearchResults] = useState({ posts:[], users:[], hashtags:[] });
  const [searching,   setSearching]   = useState(false);
  const [memberCount, setMemberCount] = useState(0);

  const loadMoreRef  = useRef();
  const observerRef  = useRef();
  const searchTimer  = useRef();

  useEffect(() => {
    fetchMemberCount();
  }, []);

  useEffect(() => {
    setPosts([]); setPeople([]); setHashtags([]);
    setPage(0); setHasMore(true);
    setLoading(true);
    if (mainTab === 'people') fetchPeople(peopleSort);
    else if (mainTab === 'hashtags') fetchHashtags();
    else fetchPosts(mainTab, 0, true);
  }, [mainTab]);

  useEffect(() => {
    if (mainTab === 'people') { setLoading(true); fetchPeople(peopleSort); }
  }, [peopleSort]);

  // Infinite scroll
  useEffect(() => {
    if (mainTab === 'people' || mainTab === 'hashtags') return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) handleLoadMore(); },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page, mainTab]);

  // Search debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setSearching(false); setSearchResults({ posts:[], users:[], hashtags:[] }); return; }
    searchTimer.current = setTimeout(() => handleSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchMemberCount = async () => {
    const { count } = await supabase.from('users')
      .select('id', { count:'exact', head:true })
      .eq('is_banned', false);
    setMemberCount(count || 0);
  };

  /* ── Fetch posts by tab ── */
  const fetchPosts = async (tab, pageNum, reset = false) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to   = from + POSTS_PER_PAGE - 1;
    let query;

    if (tab === 'trending') {
      query = supabase.from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
        .eq('status', 'active').eq('is_draft', false).eq('audience', 'public')
        .order('likes_count', { ascending: false })
        .order('comments_count', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
    } else if (tab === 'foryou') {
      // Personalized: posts from followed users + hashtag overlap
      const { data: follows } = await supabase.from('follows')
        .select('following_id').eq('follower_id', user.id).eq('status', 'accepted');
      const ids = (follows || []).map(f => f.following_id);
      if (ids.length > 0) {
        query = supabase.from('posts')
          .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
          .eq('status', 'active').eq('is_draft', false).eq('audience', 'public')
          .in('user_id', ids)
          .order('created_at', { ascending: false })
          .range(from, to);
      } else {
        // fallback to trending
        query = supabase.from('posts')
          .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
          .eq('status', 'active').eq('is_draft', false).eq('audience', 'public')
          .order('likes_count', { ascending: false })
          .range(from, to);
      }
    } else if (tab === 'new') {
      query = supabase.from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified)')
        .eq('status', 'active').eq('is_draft', false).eq('audience', 'public')
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    if (!query) { setLoading(false); return; }
    const { data } = await query;
    const newPosts = data || [];

    if (reset) setPosts(newPosts);
    else setPosts(prev => {
      const ids = new Set(prev.map(p => p.id));
      return [...prev, ...newPosts.filter(p => !ids.has(p.id))];
    });

    setHasMore(newPosts.length === POSTS_PER_PAGE);
    setLoading(false); setLoadingMore(false);
  };

  const handleLoadMore = useCallback(() => {
    const next = page + 1; setPage(next); setLoadingMore(true);
    fetchPosts(mainTab, next, false);
  }, [page, mainTab]);

  /* ── Fetch hashtags ── */
  const fetchHashtags = async () => {
    // Unnest hashtags array and count occurrences
    const { data } = await supabase.rpc('get_trending_hashtags').limit(30);
    if (data) {
      setHashtags(data);
    } else {
      // Fallback: get posts with hashtags and count manually
      const { data: posts } = await supabase.from('posts')
        .select('hashtags').eq('status','active').eq('is_draft',false)
        .not('hashtags','is',null).limit(500);
      const countMap = {};
      (posts || []).forEach(p => {
        (p.hashtags || []).forEach(tag => { countMap[tag] = (countMap[tag] || 0) + 1; });
      });
      const sorted = Object.entries(countMap)
        .sort(([,a],[,b]) => b - a)
        .slice(0, 30)
        .map(([tag, count]) => ({ tag, count }));
      setHashtags(sorted);
    }
    setLoading(false);
  };

  /* ── Fetch people ── */
  const fetchPeople = async (sort) => {
    let query = supabase.from('users')
      .select('id,username,display_name,avatar_url,bio,is_verified,role,followers_count,posts_count,created_at')
      .eq('is_banned', false)
      .neq('id', user.id);

    if (sort === 'active')    query = query.order('followers_count', { ascending: false });
    if (sort === 'new')       query = query.order('created_at', { ascending: false });
    if (sort === 'all')       query = query.order('display_name', { ascending: true });
    if (sort === 'suggested') query = query.order('followers_count', { ascending: false });

    query = query.limit(50);
    const { data } = await query;

    // Check who current user follows
    const { data: follows } = await supabase.from('follows')
      .select('following_id').eq('follower_id', user.id).eq('status','accepted');
    const followingIds = new Set((follows || []).map(f => f.following_id));

    setPeople((data || []).map(u => ({ ...u, is_following: followingIds.has(u.id) })));
    setLoading(false);
  };

  /* ── Search ── */
  const handleSearch = async (q) => {
    setSearching(true);
    const term = q.toLowerCase().trim();

    const [{ data: users }, { data: posts }] = await Promise.all([
      supabase.from('users')
        .select('id,username,display_name,avatar_url,is_verified,followers_count,role')
        .eq('is_banned', false)
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(10),
      supabase.from('posts')
        .select('*, users(id,username,display_name,avatar_url,is_verified)')
        .eq('status','active').eq('is_draft',false).eq('audience','public')
        .ilike('caption', '%' + term + '%')
        .order('likes_count', { ascending: false })
        .limit(10),
    ]);

    // Hashtag search
    const hashtagResults = term.startsWith('#')
      ? hashtags.filter(h => h.tag.includes(term.slice(1)))
      : hashtags.filter(h => h.tag.includes(term));

    setSearchResults({ users: users || [], posts: posts || [], hashtags: hashtagResults.slice(0, 5) });
    setSearching(false);
  };

  const MAIN_TABS = [
    { key:'trending',  label:'🔥 Trending', icon: TrendingUp },
    { key:'foryou',    label:'✨ For You',  icon: Sparkles },
    { key:'new',       label:'🆕 New',      icon: Clock },
    { key:'hashtags',  label:'# Tags',      icon: Hash },
    { key:'people',    label:'👥 People',   icon: Users },
  ];

  const PEOPLE_SORTS = [
    { key:'active',    label:'🔥 Active' },
    { key:'new',       label:'🆕 New' },
    { key:'all',       label:'👤 All' },
    { key:'suggested', label:'🤝 Suggested' },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07]">
        {/* Search bar */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-[#6B7280] flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts, people, hashtags..."
              className="flex-1 bg-transparent text-white text-[15px] placeholder-[#6B7280] focus:outline-none"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSearching(false); }} className="text-[#6B7280] hover:text-white flex-shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex overflow-x-auto scrollbar-none px-2 pb-0 gap-1">
          {MAIN_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setMainTab(tab.key); setSearch(''); }}
              className={'flex-shrink-0 px-3 py-2.5 text-[13px] font-semibold relative transition-all ' +
                (mainTab === tab.key ? 'text-white' : 'text-[#6B7280] hover:text-white/70')}
            >
              {tab.label}
              {mainTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full" style={{ width:'70%' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── SEARCH RESULTS ── */}
      {search.trim() && (
        <div className="px-0">
          {searching ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* Users */}
              {searchResults.users.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-xs font-bold uppercase tracking-wider px-4 py-2 border-b border-white/[0.05]">People</p>
                  {searchResults.users.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => navigate('/profile/' + u.username)}>
                      <Avatar url={u.avatar_url} name={u.display_name} size={10} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
                          {u.is_verified && <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold">✓</span>}
                        </div>
                        <p className="text-[#6B7280] text-[12px]">@{u.username} · {formatNumber(u.followers_count || 0)} followers</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {searchResults.hashtags.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-xs font-bold uppercase tracking-wider px-4 py-2 border-b border-white/[0.05]">Hashtags</p>
                  {searchResults.hashtags.map(h => (
                    <HashtagPill key={h.tag} tag={h.tag} count={h.count} navigate={navigate} />
                  ))}
                </div>
              )}

              {/* Posts */}
              {searchResults.posts.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-xs font-bold uppercase tracking-wider px-4 py-2 border-b border-white/[0.05]">Posts</p>
                  {searchResults.posts.map(post => (
                    <PostCard key={post.id} post={post} currentUser={user} />
                  ))}
                </div>
              )}

              {!searching && !searchResults.users.length && !searchResults.posts.length && !searchResults.hashtags.length && (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">🔍</p>
                  <p className="text-white font-bold">No results for "{search}"</p>
                  <p className="text-[#6B7280] text-sm mt-1">Try a different search term</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MAIN CONTENT (when not searching) ── */}
      {!search.trim() && (
        <>
          {/* ── PEOPLE TAB ── */}
          {mainTab === 'people' && (
            <div>
              {/* Member count banner */}
              <div className="mx-4 mt-4 mb-3 bg-gradient-to-r from-[#1E6FFF]/20 to-[#7B2FFF]/20 border border-[#1E6FFF]/30 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Users size={20} className="text-[#1E6FFF] flex-shrink-0" />
                <div>
                  <p className="text-white font-bold text-[15px]">{formatNumber(memberCount)} members</p>
                  <p className="text-[#6B7280] text-[12px]">in B-Link community</p>
                </div>
              </div>

              {/* Sort tabs */}
              <div className="flex gap-2 px-4 mb-3 overflow-x-auto scrollbar-none pb-1">
                {PEOPLE_SORTS.map(s => (
                  <button key={s.key} onClick={() => setPeopleSort(s.key)}
                    className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                      (peopleSort === s.key ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'text-[#6B7280] border-white/10 hover:border-white/20')}>
                    {s.label}
                  </button>
                ))}
              </div>

              {loading ? (
                Array(6).fill(0).map((_, i) => <UserSkeleton key={i} />)
              ) : people.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">👥</p>
                  <p className="text-white font-bold">No members yet</p>
                </div>
              ) : (
                people.map(u => (
                  <PeopleCard
                    key={u.id}
                    u={u}
                    currentUserId={user?.id}
                    onFollowChange={() => fetchMemberCount()}
                  />
                ))
              )}
            </div>
          )}

          {/* ── HASHTAGS TAB ── */}
          {mainTab === 'hashtags' && (
            <div className="pt-3">
              <p className="text-[#6B7280] text-xs font-bold uppercase tracking-wider px-4 py-2">Trending Hashtags</p>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] animate-pulse">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-white/10 rounded-full w-28" />
                      <div className="h-2.5 bg-white/10 rounded-full w-16" />
                    </div>
                  </div>
                ))
              ) : hashtags.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">#️⃣</p>
                  <p className="text-white font-bold">No hashtags yet</p>
                  <p className="text-[#6B7280] text-sm mt-1">Start posting with hashtags!</p>
                </div>
              ) : (
                hashtags.map((h, i) => (
                  <HashtagPill key={h.tag} tag={h.tag} count={h.count} navigate={navigate} />
                ))
              )}
            </div>
          )}

          {/* ── POSTS TABS (trending / foryou / new) ── */}
          {['trending','foryou','new'].includes(mainTab) && (
            <div>
              {loading ? (
                Array(4).fill(0).map((_, i) => <PostSkeleton key={i} />)
              ) : posts.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <p className="text-5xl mb-3">
                    {mainTab === 'trending' ? '🔥' : mainTab === 'foryou' ? '✨' : '🆕'}
                  </p>
                  <p className="text-white font-bold text-lg">
                    {mainTab === 'trending' ? 'No trending posts yet'
                      : mainTab === 'foryou' ? 'Follow people to see personalized posts'
                      : 'No posts yet'}
                  </p>
                  <p className="text-[#6B7280] text-sm mt-1">Be the first to post something!</p>
                  <button onClick={() => navigate('/create')}
                    className="mt-4 bg-[#1E6FFF] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30">
                    Create Post
                  </button>
                </div>
              ) : (
                <>
                  {posts.map(post => (
                    <PostCard key={post.id} post={post} currentUser={user} />
                  ))}
                  <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]">
                    {loadingMore && (
                      <div className="flex items-center gap-2 text-[#6B7280]">
                        <div className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Loading more...</span>
                      </div>
                    )}
                    {!hasMore && !loadingMore && posts.length > 0 && (
                      <p className="text-[#6B7280] text-xs">You've seen it all! 🎉</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}