import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import { formatTime } from '../../utils/formatTime';
import {
  Search, TrendingUp, Sparkles, Clock,
  Hash, Users, UserPlus, UserCheck,
  X, RefreshCw, ChevronRight, Zap,
} from 'lucide-react';
import PostCard from '../../components/PostCard';
import Avatar from '../../components/Avatar';

const POSTS_PER_PAGE = 15;

/* ── Skeletons ────────────────────────────────── */
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] animate-pulse">
      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-white/10 rounded-full w-32" />
        <div className="h-2.5 bg-white/10 rounded-full w-20" />
        <div className="h-2 bg-white/10 rounded-full w-40" />
      </div>
      <div className="w-20 h-8 bg-white/10 rounded-full flex-shrink-0" />
    </div>
  );
}

/* ── People card — Twitter style ─────────────── */
function PeopleCard({ u, currentUserId, onFollowToggle }) {
  const navigate = useNavigate();
  const [following,     setFollowing]     = useState(u.is_following || false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (loadingFollow) return;
    setLoadingFollow(true);
    try {
      if (following) {
        await supabase.from('follows').delete()
          .eq('follower_id', currentUserId).eq('following_id', u.id);
        setFollowing(false);
      } else {
        await supabase.from('follows').upsert(
          { follower_id: currentUserId, following_id: u.id, status: 'accepted' },
          { onConflict: 'follower_id,following_id' }
        );
        if (u.id !== currentUserId) {
          await supabase.from('notifications').upsert(
            { user_id: u.id, from_user_id: currentUserId, type: 'follow', message: 'started following you', is_read: false },
            { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
          );
        }
        setFollowing(true);
      }
      if (onFollowToggle) onFollowToggle();
    } catch (err) {
      console.error('follow error:', err.message);
    }
    setLoadingFollow(false);
  };

  const roleIcon = u.role === 'blink' ? '👑' : u.role === 'admin' ? '🛡️' : u.role === 'moderator' ? '🔵' : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors cursor-pointer"
      onClick={() => navigate('/profile/' + u.username)}
    >
      {/* Avatar with role badge */}
      <div className="relative flex-shrink-0">
        {u.avatar_url
          ? <img src={u.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
          : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">
              {u.display_name?.[0]?.toUpperCase()}
            </div>
        }
        {roleIcon && (
          <span className="absolute -bottom-0.5 -right-0.5 text-[13px] leading-none">{roleIcon}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-white font-bold text-[14px] truncate max-w-[150px]">{u.display_name}</p>
          {u.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[7px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
          )}
        </div>
        <p className="text-[#6B7280] text-[12px]">@{u.username}</p>
        {u.bio && (
          <p className="text-white/50 text-[11px] mt-0.5 line-clamp-1">{u.bio}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[#6B7280] text-[11px]">
            <span className="text-white/70 font-semibold">{formatNumber(u.followers_count || 0)}</span> followers
          </span>
          <span className="text-[#6B7280] text-[11px]">
            <span className="text-white/70 font-semibold">{formatNumber(u.posts_count || 0)}</span> posts
          </span>
        </div>
      </div>

      {/* Follow/Unfollow button */}
      {u.id !== currentUserId && (
        <button
          onClick={handleFollow}
          disabled={loadingFollow}
          className={'flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all flex-shrink-0 min-w-[80px] ' +
            (following
              ? 'bg-white/[0.08] text-white border border-white/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
              : 'bg-[#1E6FFF] text-white hover:bg-[#1565cc] shadow-md shadow-[#1E6FFF]/30')}
        >
          {loadingFollow
            ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : following
              ? <><UserCheck size={12} /> Following</>
              : <><UserPlus size={12} /> Follow</>
          }
        </button>
      )}
    </div>
  );
}

/* ── Hashtag row ─────────────────────────────── */
function HashtagRow({ tag, count, rank }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/hashtag/' + tag)}
      className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors w-full text-left group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: rank <= 3 ? 'rgba(255,107,53,0.15)' : 'rgba(30,111,255,0.12)' }}>
          {rank <= 3
            ? <span className="text-base font-bold" style={{ color:'#FF6B35' }}>#{rank}</span>
            : <Hash size={16} className="text-[#1E6FFF]" />
          }
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

/* ═══════════════════════════════════════════════
   MAIN DISCOVER PAGE
═══════════════════════════════════════════════ */
export default function Discover() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Tabs: trending | foryou | new | hashtags | people
  const [mainTab,      setMainTab]      = useState('trending');
  const [peopleSort,   setPeopleSort]   = useState('active');
  const [posts,        setPosts]        = useState([]);
  const [people,       setPeople]       = useState([]);
  const [hashtags,     setHashtags]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(true);
  const [page,         setPage]         = useState(0);
  const [memberCount,  setMemberCount]  = useState(0);

  // Search
  const [search,        setSearch]        = useState('');
  const [searching,     setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState({ posts:[], users:[], hashtags:[] });
  const searchTimer = useRef();

  // Infinite scroll
  const loadMoreRef  = useRef();
  const observerRef  = useRef();

  useEffect(() => {
    fetchMemberCount();

    // Real-time: update member count when new user registers
    const ch = supabase.channel('members:realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'users',
      }, () => {
        fetchMemberCount();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'users',
      }, () => {
        fetchMemberCount();
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    setPosts([]); setPeople([]); setPage(0); setHasMore(true);
    setLoading(true);
    if (mainTab === 'people')   fetchPeople(peopleSort);
    else if (mainTab === 'hashtags') fetchHashtags();
    else fetchPosts(mainTab, 0, true);
  }, [mainTab]);

  useEffect(() => {
    if (mainTab === 'people') { setLoading(true); fetchPeople(peopleSort); }
  }, [peopleSort]);

  // Real-time new posts on discover
  useEffect(() => {
    if (!['trending','foryou','new'].includes(mainTab)) return;
    const ch = supabase.channel('discover:rt')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'posts' }, () => {
        if (mainTab === 'new' && page === 0) fetchPosts('new', 0, true);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [mainTab, page]);

  // Infinite scroll observer
  useEffect(() => {
    if (!['trending','foryou','new'].includes(mainTab)) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading)
          handleLoadMore();
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page, mainTab]);

  // Search debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setSearching(false); setSearchResults({ posts:[], users:[], hashtags:[] }); return; }
    searchTimer.current = setTimeout(() => runSearch(search.trim()), 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  /* ── Member count ── */
  const fetchMemberCount = async () => {
    const { count } = await supabase.from('users')
      .select('id', { count:'exact', head:true })
      .neq('is_banned', true);
    setMemberCount(count || 0);
  };

  /* ── Fetch posts ── */
  const fetchPosts = async (tab, pageNum, reset = false) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to   = from + POSTS_PER_PAGE - 1;

    let query;

    if (tab === 'trending') {
      query = supabase.from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified,role)')
        .eq('is_draft', false)
        .neq('status', 'deleted')
        .eq('audience', 'public')
        .order('likes_count',    { ascending: false })
        .order('comments_count', { ascending: false })
        .order('created_at',     { ascending: false })
        .range(from, to);

    } else if (tab === 'foryou') {
      // Try follows first
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const ids = (follows || []).map(f => f.following_id);

      if (ids.length > 0) {
        query = supabase.from('posts')
          .select('*, users(id,username,display_name,avatar_url,country,is_verified,role)')
          .eq('is_draft', false)
          .neq('status', 'deleted')
          .eq('audience', 'public')
          .in('user_id', ids)
          .order('created_at', { ascending: false })
          .range(from, to);
      } else {
        // Fallback — show all posts sorted by engagement
        query = supabase.from('posts')
          .select('*, users(id,username,display_name,avatar_url,country,is_verified,role)')
          .eq('is_draft', false)
          .neq('status', 'deleted')
          .eq('audience', 'public')
          .order('likes_count', { ascending: false })
          .order('created_at',  { ascending: false })
          .range(from, to);
      }

    } else if (tab === 'new') {
      query = supabase.from('posts')
        .select('*, users(id,username,display_name,avatar_url,country,is_verified,role)')
        .eq('is_draft', false)
        .neq('status', 'deleted')
        .eq('audience', 'public')
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    if (!query) { setLoading(false); return; }

    const { data, error } = await query;
    if (error) console.error('discover posts error:', error.message);

    const newPosts = data || [];
    if (reset) setPosts(newPosts);
    else setPosts(prev => {
      const ids = new Set(prev.map(p => p.id));
      return [...prev, ...newPosts.filter(p => !ids.has(p.id))];
    });

    setHasMore(newPosts.length === POSTS_PER_PAGE);
    setLoading(false);
    setLoadingMore(false);
  };

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    fetchPosts(mainTab, next, false);
  }, [page, mainTab]);

  /* ── Fetch hashtags ── */
  const fetchHashtags = async () => {
    try {
      const { data, error } = await supabase.rpc('get_trending_hashtags');
      if (!error && data?.length) {
        setHashtags(data);
      } else {
        // Manual fallback
        const { data: allPosts } = await supabase
          .from('posts')
          .select('hashtags')
          .eq('is_draft', false)
          .neq('status', 'deleted')
          .not('hashtags', 'is', null)
          .limit(500);

        const countMap = {};
        (allPosts || []).forEach(p => {
          (p.hashtags || []).forEach(tag => {
            if (tag) countMap[tag] = (countMap[tag] || 0) + 1;
          });
        });

        const sorted = Object.entries(countMap)
          .sort(([,a],[,b]) => b - a)
          .slice(0, 30)
          .map(([tag, count]) => ({ tag, count }));

        setHashtags(sorted);
      }
    } catch (err) {
      console.error('hashtags error:', err.message);
    }
    setLoading(false);
  };

  /* ── Fetch people ── */
  const fetchPeople = async (sort) => {
    try {
      let query = supabase
        .from('users')
        .select('id,username,display_name,avatar_url,bio,is_verified,role,followers_count,posts_count,created_at,country')
        .neq('is_banned', true)
        .neq('id', user.id);

      if (sort === 'active' || sort === 'suggested') {
        query = query.order('followers_count', { ascending: false });
      } else if (sort === 'new') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'all') {
        query = query.order('display_name', { ascending: true });
      }

      query = query.limit(60);

      const { data, error } = await query;
      if (error) console.error('people error:', error.message);

      // Check who current user follows
      const { data: myFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followingSet = new Set((myFollows || []).map(f => f.following_id));

      setPeople((data || []).map(u => ({
        ...u,
        is_following: followingSet.has(u.id),
      })));
    } catch (err) {
      console.error('fetchPeople error:', err.message);
    }
    setLoading(false);
  };

  /* ── Search ── */
  const runSearch = async (q) => {
    setSearching(true);
    try {
      const [usersRes, postsRes] = await Promise.all([
        supabase.from('users')
          .select('id,username,display_name,avatar_url,is_verified,followers_count,posts_count,bio,role')
          .neq('is_banned', true)
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(10),

        supabase.from('posts')
          .select('*, users(id,username,display_name,avatar_url,is_verified,role)')
          .eq('is_draft', false)
          .neq('status', 'deleted')
          .eq('audience', 'public')
          .ilike('caption', '%' + q + '%')
          .order('likes_count', { ascending: false })
          .limit(10),
      ]);

      const hashtagResults = hashtags
        .filter(h => h.tag?.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5);

      setSearchResults({
        users:    usersRes.data    || [],
        posts:    postsRes.data    || [],
        hashtags: hashtagResults,
      });
    } catch (err) {
      console.error('search error:', err.message);
    }
    setSearching(false);
  };

  /* ── Tabs config ── */
  const MAIN_TABS = [
    { key:'trending',  label:'🔥 Trending' },
    { key:'foryou',    label:'✨ For You'  },
    { key:'new',       label:'🆕 New'      },
    { key:'hashtags',  label:'# Tags'      },
    { key:'people',    label:'👥 People'   },
  ];

  const PEOPLE_SORTS = [
    { key:'active',    label:'🔥 Active'    },
    { key:'new',       label:'🆕 New'       },
    { key:'all',       label:'👤 All'       },
    { key:'suggested', label:'🤝 Suggested' },
  ];

  const isSearching = search.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07]">
        {/* Search input */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-[#6B7280] flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts, people, hashtags..."
              className="flex-1 bg-transparent text-white text-[15px] placeholder-[#6B7280] focus:outline-none"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSearching(false); setSearchResults({ posts:[], users:[], hashtags:[] }); }}
                className="text-[#6B7280] hover:text-white flex-shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Main tabs */}
        {!isSearching && (
          <div className="flex overflow-x-auto scrollbar-none px-2 pb-0 gap-0">
            {MAIN_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setMainTab(tab.key)}
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
        )}
      </div>

      {/* ══════════════ SEARCH RESULTS ══════════════ */}
      {isSearching && (
        <div>
          {searching ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Users */}
              {searchResults.users.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">People</p>
                  {searchResults.users.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] cursor-pointer"
                      onClick={() => navigate('/profile/' + u.username)}
                    >
                      <div className="relative flex-shrink-0">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">{u.display_name?.[0]?.toUpperCase()}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
                          {u.is_verified && <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold">✓</span>}
                        </div>
                        <p className="text-[#6B7280] text-[12px]">@{u.username} · {formatNumber(u.followers_count||0)} followers</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {searchResults.hashtags.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Hashtags</p>
                  {searchResults.hashtags.map((h, i) => (
                    <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i+1} />
                  ))}
                </div>
              )}

              {/* Posts */}
              {searchResults.posts.length > 0 && (
                <div>
                  <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Posts</p>
                  {searchResults.posts.map(post => (
                    <PostCard key={post.id} post={post} currentUser={user} />
                  ))}
                </div>
              )}

              {/* No results */}
              {!searchResults.users.length && !searchResults.posts.length && !searchResults.hashtags.length && (
                <div className="text-center py-20 px-6">
                  <p className="text-5xl mb-3">🔍</p>
                  <p className="text-white font-bold text-lg">No results for "{search}"</p>
                  <p className="text-[#6B7280] text-sm mt-1">Try a different search term</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════ MAIN CONTENT ══════════════ */}
      {!isSearching && (
        <>

          {/* ── PEOPLE TAB ── */}
          {mainTab === 'people' && (
            <div>
              {/* Banner */}
              <div className="mx-4 mt-4 mb-3 bg-gradient-to-r from-[#1E6FFF]/15 to-[#7B2FFF]/15 border border-[#1E6FFF]/25 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1E6FFF]/20 flex items-center justify-center flex-shrink-0">
                  <Users size={20} className="text-[#1E6FFF]" />
                </div>
                <div>
                  <p className="text-white font-bold text-[15px]">{formatNumber(memberCount)} members</p>
                  <p className="text-[#6B7280] text-[12px]">in the B-Link community</p>
                </div>
              </div>

              {/* Sort tabs */}
              <div className="flex gap-2 px-4 mb-1 overflow-x-auto scrollbar-none pb-2">
                {PEOPLE_SORTS.map(s => (
                  <button key={s.key} onClick={() => setPeopleSort(s.key)}
                    className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                      (peopleSort === s.key ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'text-[#6B7280] border-white/10 hover:border-white/20 hover:text-white/80')}>
                    {s.label}
                  </button>
                ))}
              </div>

              {loading ? (
                Array(8).fill(0).map((_, i) => <UserSkeleton key={i} />)
              ) : people.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <p className="text-4xl mb-2">👥</p>
                  <p className="text-white font-bold">No members found</p>
                  <p className="text-[#6B7280] text-sm mt-1">Be the first to invite friends!</p>
                </div>
              ) : (
                people.map(u => (
                  <PeopleCard
                    key={u.id}
                    u={u}
                    currentUserId={user?.id}
                    onFollowToggle={() => { fetchPeople(peopleSort); fetchMemberCount(); }}
                  />
                ))
              )}
            </div>
          )}

          {/* ── HASHTAGS TAB ── */}
          {mainTab === 'hashtags' && (
            <div>
              <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">
                Trending Hashtags
              </p>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-white/10 rounded-full w-28" />
                      <div className="h-2.5 bg-white/10 rounded-full w-16" />
                    </div>
                  </div>
                ))
              ) : hashtags.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <p className="text-4xl mb-2">#️⃣</p>
                  <p className="text-white font-bold">No hashtags yet</p>
                  <p className="text-[#6B7280] text-sm mt-1">Start posting with #hashtags!</p>
                </div>
              ) : (
                hashtags.map((h, i) => (
                  <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i+1} />
                ))
              )}
            </div>
          )}

          {/* ── POST TABS (trending / foryou / new) ── */}
          {['trending','foryou','new'].includes(mainTab) && (
            <div>
              {loading ? (
                Array(5).fill(0).map((_, i) => <PostSkeleton key={i} />)
              ) : posts.length === 0 ? (
                <div className="text-center py-20 px-6">
                  <p className="text-5xl mb-3">
                    {mainTab === 'trending' ? '🔥' : mainTab === 'foryou' ? '✨' : '🆕'}
                  </p>
                  <p className="text-white font-bold text-lg">
                    {mainTab === 'trending' ? 'No trending posts yet'
                      : mainTab === 'foryou' ? 'Nothing personalised yet'
                      : 'No posts yet'}
                  </p>
                  <p className="text-[#6B7280] text-sm mt-1">
                    {mainTab === 'foryou'
                      ? 'Follow people or create a post to get started'
                      : 'Be the first to post something!'}
                  </p>
                  <div className="flex justify-center gap-3 mt-4">
                    <button onClick={() => setMainTab('people')}
                      className="bg-[#1E6FFF] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30">
                      Find people
                    </button>
                    <button onClick={() => navigate('/create')}
                      className="bg-white/10 text-white px-5 py-2.5 rounded-full font-bold text-sm border border-white/20">
                      Create post
                    </button>
                  </div>
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