import { useState, useEffect, useRef, useCallback } from 'react';
import VerifiedBadge from '../../components/VerifiedBadge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import { Search, X, ChevronRight, UserPlus, UserCheck, Hash, Users } from 'lucide-react';
import PostCard from '../../components/PostCard';

const POSTS_PER_PAGE = 15;

const POST_SELECT = `
  id, caption, media_urls, video_url, post_type, likes_count,
  comments_count, reposts_count, views_count, is_repost, is_boosted,
  quoted_post_id, created_at, user_id, status, is_draft, audience,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

const normalise = p => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users || null });

function PostSkeleton() {
  return (
    <div className="border-b border-white/[0.07] px-4 py-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 bg-white/10 rounded-full w-32" />
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
        <div className="h-3 bg-white/10 rounded-full w-28" />
        <div className="h-2.5 bg-white/10 rounded-full w-20" />
      </div>
      <div className="w-20 h-8 bg-white/10 rounded-full flex-shrink-0" />
    </div>
  );
}

/* ── People card — ALWAYS uses u.username for navigation (not current user) ── */
function PeopleCard({ u, currentUserId }) {
  const navigate = useNavigate();
  const [following,  setFollowing]  = useState(u.is_following || false);
  const [fLoading,   setFLoading]   = useState(false);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (fLoading || u.id === currentUserId) return;
    setFLoading(true);

    if (following) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId).eq('following_id', u.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').upsert(
        { follower_id: currentUserId, following_id: u.id, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      );
      // Notify target user
      await supabase.from('notifications').upsert(
        { user_id: u.id, from_user_id: currentUserId, type: 'follow', message: 'started following you', is_read: false },
        { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
      );
      setFollowing(true);
    }
    setFLoading(false);
  };

  // CRITICAL FIX: navigate to u.username (target user), never to current user
  const goToProfile = () => navigate('/profile/' + u.username);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] cursor-pointer transition-colors"
      onClick={goToProfile}
    >
      <div className="relative flex-shrink-0" onClick={goToProfile}>
        {u.avatar_url
          ? <img src={u.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
          : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-lg">
              {u.display_name?.[0]?.toUpperCase()}
            </div>
        }
        {u.role === 'blink'     && <span className="absolute -bottom-0.5 -right-0.5 text-sm">👑</span>}
        {u.role === 'admin'     && <span className="absolute -bottom-0.5 -right-0.5 text-sm">🛡️</span>}
      </div>

      <div className="flex-1 min-w-0" onClick={goToProfile}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-white font-bold text-[14px] truncate max-w-[150px]">{u.display_name}</p>
          {u.is_verified && <VerifiedBadge size={15} />}
        </div>
        <p className="text-[#8E8C88] text-[12px]">@{u.username}</p>
        {u.bio && <p className="text-white/40 text-[11px] mt-0.5 truncate">{u.bio}</p>}
        <p className="text-[#8E8C88] text-[11px] mt-0.5">
          <span className="text-white/60 font-semibold">{formatNumber(u.followers_count||0)}</span> followers ·{' '}
          <span className="text-white/60 font-semibold">{formatNumber(u.posts_count||0)}</span> posts
        </p>
      </div>

      {u.id !== currentUserId && (
        <button
          onClick={handleFollow}
          disabled={fLoading}
          className={'flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all flex-shrink-0 ' +
            (following
              ? 'bg-white/[0.08] text-white border border-white/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
              : 'bg-[#FF5A1F] text-white hover:bg-[#d9480f] shadow-md shadow-[#FF5A1F]/30')}
        >
          {fLoading
            ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : following ? <><UserCheck size={12} /> Following</> : <><UserPlus size={12} /> Follow</>
          }
        </button>
      )}
    </div>
  );
}

function HashtagRow({ tag, count, rank }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/hashtag/' + tag)}
      className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors w-full text-left group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: rank <= 3 ? 'rgba(255,107,53,0.15)' : 'rgba(255,90,31,0.10)' }}>
          {rank <= 3
            ? <span className="font-black text-sm" style={{ color:'#FF6B35' }}>#{rank}</span>
            : <Hash size={16} className="text-[#FF5A1F]" />}
        </div>
        <div>
          <p className="text-white font-bold text-[14px]">#{tag}</p>
          <p className="text-[#8E8C88] text-[12px]">{formatNumber(count)} posts</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-[#8E8C88] group-hover:text-white transition-colors" />
    </button>
  );
}

export default function Discover() {
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [mainTab,   setMainTab]   = useState('trending');
  const [posts,     setPosts]     = useState([]);
  const [people,    setPeople]    = useState([]);
  const [hashtags,  setHashtags]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [hasMore,   setHasMore]   = useState(true);
  const [page,      setPage]      = useState(0);
  const [fetchError,setFetchError]= useState('');
  const [search,    setSearch]    = useState('');
  const [searching, setSearching] = useState(false);
  const [results,   setResults]   = useState({ posts:[], users:[], hashtags:[] });

  const loadMoreRef  = useRef();
  const observerRef  = useRef();
  const searchTimer  = useRef();

  useEffect(() => {
    setPosts([]); setPage(0); setHasMore(true); setFetchError('');
    setLoading(true);
    if (mainTab === 'people')   fetchPeople();
    else if (mainTab === 'hashtags') fetchHashtags();
    else fetchPosts(mainTab, 0, true);
  }, [mainTab]);

  useEffect(() => {
    if (!['trending','new','foryou'].includes(mainTab)) return;
    observerRef.current = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) handleLoadMore(); },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, page, mainTab]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setSearching(false); setResults({ posts:[], users:[], hashtags:[] }); return; }
    searchTimer.current = setTimeout(() => runSearch(search.trim()), 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchPosts = async (tab, pageNum, reset = false) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to   = from + POSTS_PER_PAGE - 1;

    const base = () => supabase.from('posts').select(POST_SELECT)
      .eq('is_draft', false).eq('audience','public').neq('status','deleted').neq('status','hidden');

    let q;
    if (tab === 'trending') {
      q = base().order('is_boosted', { ascending:false })
                .order('likes_count', { ascending:false })
                .order('comments_count', { ascending:false })
                .order('created_at', { ascending:false }).range(from, to);
    } else if (tab === 'new') {
      q = base().order('created_at', { ascending:false }).range(from, to);
    } else {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
      const ids = (follows||[]).map(f => f.following_id);
      if (ids.length > 0) {
        q = base().in('user_id', ids).order('created_at', { ascending:false }).range(from, to);
      } else {
        q = base().order('likes_count', { ascending:false }).order('created_at', { ascending:false }).range(from, to);
      }
    }

    const { data, error } = await q;
    if (error) { setFetchError(error.message); setLoading(false); setLoadingMore(false); return; }

    const rows = (data||[]).map(normalise);
    if (reset) setPosts(rows);
    else setPosts(prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...rows.filter(p => !ids.has(p.id))]; });

    setHasMore(rows.length === POSTS_PER_PAGE);
    setFetchError('');
    setLoading(false);
    setLoadingMore(false);
  };

  const handleLoadMore = useCallback(() => {
    const next = page + 1; setPage(next); setLoadingMore(true);
    fetchPosts(mainTab, next, false);
  }, [page, mainTab]);

  const fetchPeople = async () => {
    const { data, error } = await supabase.from('users')
      .select('id,username,display_name,avatar_url,bio,is_verified,role,followers_count,posts_count')
      .neq('is_banned', true).neq('id', user.id)
      .order('followers_count', { ascending:false }).limit(50);
    if (error) { console.error('fetchPeople:', error.message); setLoading(false); return; }

    const { data: myFollows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    const followSet = new Set((myFollows||[]).map(f => f.following_id));
    setPeople((data||[]).map(u => ({ ...u, is_following: followSet.has(u.id) })));
    setLoading(false);
  };

  const fetchHashtags = async () => {
    const { data } = await supabase.from('posts')
      .select('hashtags').eq('is_draft',false).neq('status','deleted')
      .not('hashtags','is',null).limit(500);
    const countMap = {};
    (data||[]).forEach(p => (p.hashtags||[]).forEach(tag => { if (tag) countMap[tag] = (countMap[tag]||0)+1; }));
    setHashtags(Object.entries(countMap).sort(([,a],[,b]) => b-a).slice(0,30).map(([tag,count]) => ({tag,count})));
    setLoading(false);
  };

  const runSearch = async (q) => {
    setSearching(true);
    const [usersRes, postsRes] = await Promise.all([
      supabase.from('users').select('id,username,display_name,avatar_url,is_verified,followers_count,posts_count,bio,role')
        .neq('is_banned',true).or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(10),
      supabase.from('posts').select(POST_SELECT)
        .eq('is_draft',false).neq('status','deleted').eq('audience','public')
        .ilike('caption','%'+q+'%').order('likes_count',{ascending:false}).limit(10),
    ]);
    setResults({
      users: usersRes.data || [],
      posts: (postsRes.data||[]).map(normalise),
      hashtags: hashtags.filter(h => h.tag?.toLowerCase().includes(q.toLowerCase())).slice(0,5),
    });
    setSearching(false);
  };

  const TABS = [
    { key:'trending',  label:'🔥 Trending' },
    { key:'foryou',    label:'✨ For You'  },
    { key:'new',       label:'🆕 New'      },
    { key:'hashtags',  label:'# Tags'      },
    { key:'people',    label:'👥 People'   },
  ];

  const isSearching = search.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-20">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07]">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-[#8E8C88] flex-shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search posts, people, hashtags..."
              className="flex-1 bg-transparent text-white text-[15px] placeholder-[#8E8C88] focus:outline-none" />
            {search && <button onClick={() => setSearch('')} className="text-[#8E8C88] hover:text-white flex-shrink-0"><X size={16} /></button>}
          </div>
        </div>

        {!isSearching && (
          <div className="flex overflow-x-auto scrollbar-none px-2 pb-0 gap-0">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setMainTab(tab.key)}
                className={'flex-shrink-0 px-3 py-2.5 text-[13px] font-semibold relative transition-all ' +
                  (mainTab === tab.key ? 'text-white' : 'text-[#8E8C88] hover:text-white/70')}>
                {tab.label}
                {mainTab === tab.key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#FF5A1F] rounded-full" style={{width:'70%'}} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search results */}
      {isSearching && (
        searching ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {results.users.length > 0 && (
              <div>
                <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">People</p>
                {results.users.map(u => (
                  // CRITICAL FIX: navigate to u.username (searched user), NOT current user
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.025] cursor-pointer"
                    onClick={() => navigate('/profile/' + u.username)}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold flex-shrink-0">{u.display_name?.[0]?.toUpperCase()}</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
                        {u.is_verified && <VerifiedBadge size={15} />}
                      </div>
                      <p className="text-[#8E8C88] text-[12px]">@{u.username} · {formatNumber(u.followers_count||0)} followers</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {results.hashtags.length > 0 && (
              <div>
                <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Hashtags</p>
                {results.hashtags.map((h,i) => <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i+1} />)}
              </div>
            )}

            {results.posts.length > 0 && (
              <div>
                <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Posts</p>
                {results.posts.map(post => <PostCard key={post.id} post={post} currentUser={user} />)}
              </div>
            )}

            {!results.users.length && !results.posts.length && !results.hashtags.length && (
              <div className="text-center py-20 px-6">
                <p className="text-5xl mb-3">🔍</p>
                <p className="text-white font-bold text-lg">No results for "{search}"</p>
                <p className="text-[#8E8C88] text-sm mt-1">Try a different term</p>
              </div>
            )}
          </>
        )
      )}

      {/* Main content */}
      {!isSearching && (
        <>
          {mainTab === 'people' && (
            <div>
              {loading
                ? Array(8).fill(0).map((_,i) => <UserSkeleton key={i} />)
                : people.length === 0
                  ? <div className="text-center py-16 px-6"><p className="text-4xl mb-2">👥</p><p className="text-white font-bold">No members found</p></div>
                  : people.map(u => <PeopleCard key={u.id} u={u} currentUserId={user?.id} />)
              }
            </div>
          )}

          {mainTab === 'hashtags' && (
            <div>
              <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Trending Hashtags</p>
              {loading
                ? Array(8).fill(0).map((_,i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-white/10 rounded-full w-28" />
                        <div className="h-2.5 bg-white/10 rounded-full w-16" />
                      </div>
                    </div>
                  ))
                : hashtags.length === 0
                  ? <div className="text-center py-16"><p className="text-4xl mb-2">#️⃣</p><p className="text-white font-bold">No hashtags yet</p></div>
                  : hashtags.map((h,i) => <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i+1} />)
              }
            </div>
          )}

          {['trending','foryou','new'].includes(mainTab) && (
            <div>
              {fetchError && !loading && (
                <div className="mx-4 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <p className="text-red-400 text-sm font-semibold">Could not load posts</p>
                  <p className="text-red-300/70 text-xs mt-1">{fetchError}</p>
                  <button onClick={() => fetchPosts(mainTab,0,true)} className="mt-2 text-xs font-bold text-[#FF5A1F]">Try again</button>
                </div>
              )}
              {loading
                ? Array(5).fill(0).map((_,i) => <PostSkeleton key={i} />)
                : posts.length === 0 && !fetchError
                  ? (
                    <div className="text-center py-20 px-6">
                      <p className="text-5xl mb-3">{mainTab==='trending'?'🔥':'✨'}</p>
                      <p className="text-white font-bold text-lg">No posts yet</p>
                      <div className="flex justify-center gap-3 mt-4">
                        <button onClick={() => navigate('/create')} className="bg-[#FF5A1F] text-white px-5 py-2.5 rounded-full font-bold text-sm">Create post</button>
                      </div>
                    </div>
                  )
                  : (
                    <>
                      {posts.map(post => <PostCard key={post.id} post={post} currentUser={user} />)}
                      <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]">
                        {loadingMore && <div className="flex items-center gap-2 text-[#8E8C88]"><div className="w-5 h-5 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading more...</span></div>}
                        {!hasMore && !loadingMore && posts.length > 0 && <p className="text-[#8E8C88] text-xs">You've seen it all! 🎉</p>}
                      </div>
                    </>
                  )
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}