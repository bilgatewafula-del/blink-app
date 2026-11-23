import { useState, useEffect, useRef, useCallback } from 'react';
import VerifiedBadge from '../../components/VerifiedBadge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import { Search, X, ChevronRight, Hash, Users, Flame, Sparkles, Clock, FileText, SearchX } from 'lucide-react';
import PostCard from '../../components/PostCard';
import Avatar from '../../components/Avatar';
import FollowButton from '../../components/FollowButton';
import { EmptyState, RoleIcon, Spinner } from '../../components/ui';
import { fetchRelationships, getFollowingIds, REL } from '../../lib/follows';

const POSTS_PER_PAGE = 15;

const POST_SELECT = `
  id, caption, media_urls, video_url, post_type, likes_count,
  comments_count, reposts_count, views_count, is_repost, is_boosted,
  quoted_post_id, created_at, user_id, status, is_draft, audience,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

const normalise = (p) => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users || null });

// Short-lived caches so switching tabs / coming back is instant.
const CACHE_MS = 60000;
const postsCache = {};            // tab -> { rows, t }
let peopleCache = null;           // { rows, t }
let hashtagCache = null;          // { rows, t }
const fresh = (c) => c && Date.now() - c.t < CACHE_MS;

const TABS = [
  { key: 'trending', label: 'Trending', Icon: Flame },
  { key: 'foryou',   label: 'For You',  Icon: Sparkles },
  { key: 'new',      label: 'New',      Icon: Clock },
  { key: 'hashtags', label: 'Tags',     Icon: Hash },
  { key: 'people',   label: 'People',   Icon: Users },
];

function PostSkeleton() {
  return (
    <div className="border-b border-[#E2E8F0] px-4 py-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-[#F1F5F9] flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 bg-[#F1F5F9] rounded-full w-32" />
          <div className="h-3 bg-[#F1F5F9] rounded-full w-full" />
          <div className="h-3 bg-[#F1F5F9] rounded-full w-3/4" />
        </div>
      </div>
    </div>
  );
}

function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0] animate-pulse">
      <div className="w-12 h-12 rounded-full bg-[#F1F5F9] flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-[#F1F5F9] rounded-full w-28" />
        <div className="h-2.5 bg-[#F1F5F9] rounded-full w-20" />
      </div>
      <div className="w-20 h-8 bg-[#F1F5F9] rounded-full flex-shrink-0" />
    </div>
  );
}

/* One person row — shared by the People tab and search results */
function PersonRow({ u, currentUserId, relationship, compact = false }) {
  const navigate = useNavigate();
  const go = () => navigate('/profile/' + u.username);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F8FAFC] cursor-pointer transition-colors" onClick={go}>
      <Avatar url={u.avatar_url} name={u.display_name} size={compact ? 10 : 12} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[#202938] font-bold text-[14px] truncate max-w-[150px]">{u.display_name}</p>
          {u.is_verified && <VerifiedBadge size={15} />}
          <RoleIcon role={u.role} size={13} />
        </div>
        <p className="text-[#64748B] text-[12px] truncate">
          @{u.username}
          {relationship === REL.FOLLOW_BACK && <span className="ml-1.5 text-[10px] font-bold bg-[#F1F5F9] px-1.5 py-0.5 rounded-full">Follows you</span>}
        </p>
        {!compact && u.bio && <p className="text-[#94A3B8] text-[11px] mt-0.5 truncate">{u.bio}</p>}
        <p className="text-[#64748B] text-[11px] mt-0.5">
          <span className="text-[#64748B] font-semibold">{formatNumber(u.followers_count || 0)}</span> followers
          {!compact && <> · <span className="text-[#64748B] font-semibold">{formatNumber(u.posts_count || 0)}</span> posts</>}
        </p>
      </div>
      {u.id !== currentUserId && (
        <FollowButton
          targetId={u.id}
          initialRelationship={relationship ?? null}
          username={u.username} displayName={u.display_name} avatarUrl={u.avatar_url}
        />
      )}
    </div>
  );
}

function HashtagRow({ tag, count, rank }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate('/hashtag/' + tag)}
      className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors w-full text-left group">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: rank <= 3 ? 'rgba(255,107,53,0.15)' : 'rgba(255,90,31,0.10)' }}>
          {rank <= 3
            ? <span className="font-black text-sm" style={{ color: '#F97316' }}>#{rank}</span>
            : <Hash size={16} className="text-[#EA580C]" />}
        </div>
        <div>
          <p className="text-[#202938] font-bold text-[14px]">#{tag}</p>
          <p className="text-[#64748B] text-[12px]">{formatNumber(count)} posts</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-[#64748B] group-hover:text-[#202938] transition-colors" />
    </button>
  );
}

export default function Discover() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mainTab, setMainTab] = useState('trending');
  const [posts, setPosts] = useState([]);
  const [people, setPeople] = useState([]);
  const [rels, setRels] = useState({});
  const [hashtags, setHashtags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState({ posts: [], users: [], hashtags: [] });
  const [searchRels, setSearchRels] = useState({});

  const loadMoreRef = useRef();
  const observerRef = useRef();
  const searchTimer = useRef();
  const tabRef = useRef(mainTab);
  tabRef.current = mainTab;

  /* ── data ── */
  const fetchPosts = useCallback(async (tab, pageNum, reset = false) => {
    const from = pageNum * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    // videos live only in B-Flash, so Discover never shows them
    const base = () => supabase.from('posts').select(POST_SELECT)
      .is('video_url', null)
      .eq('is_draft', false).eq('audience', 'public').neq('status', 'deleted').neq('status', 'hidden');

    let q;
    if (tab === 'trending') {
      q = base().order('is_boosted', { ascending: false })
        .order('likes_count', { ascending: false })
        .order('comments_count', { ascending: false })
        .order('created_at', { ascending: false }).range(from, to);
    } else if (tab === 'new') {
      q = base().order('created_at', { ascending: false }).range(from, to);
    } else {
      const ids = await getFollowingIds(user.id);
      q = ids.length > 0
        ? base().in('user_id', ids).order('created_at', { ascending: false }).range(from, to)
        : base().order('likes_count', { ascending: false }).order('created_at', { ascending: false }).range(from, to);
    }

    const { data, error } = await q;
    if (tabRef.current !== tab) return; // user already switched tab
    if (error) { setFetchError(error.message); setLoading(false); setLoadingMore(false); return; }

    const rows = (data || []).map(normalise);
    if (reset) { setPosts(rows); postsCache[tab] = { rows, t: Date.now() }; }
    else setPosts((prev) => { const seen = new Set(prev.map((p) => p.id)); return [...prev, ...rows.filter((p) => !seen.has(p.id))]; });

    setHasMore(rows.length === POSTS_PER_PAGE);
    setFetchError('');
    setLoading(false);
    setLoadingMore(false);
  }, [user?.id]);

  const fetchPeople = useCallback(async () => {
    if (fresh(peopleCache)) {
      setPeople(peopleCache.rows); setLoading(false);
      fetchRelationships(user.id, peopleCache.rows.map((u) => u.id)).then(setRels);
      return;
    }
    const { data, error } = await supabase.from('users')
      .select('id,username,display_name,avatar_url,bio,is_verified,role,followers_count,posts_count')
      .neq('is_banned', true).neq('id', user.id)
      .order('followers_count', { ascending: false }).limit(50);
    if (error) { console.error('fetchPeople:', error.message); setLoading(false); return; }
    const rows = data || [];
    peopleCache = { rows, t: Date.now() };
    setPeople(rows);
    setLoading(false);
    fetchRelationships(user.id, rows.map((u) => u.id)).then(setRels);
  }, [user?.id]);

  const fetchHashtags = useCallback(async () => {
    if (fresh(hashtagCache)) { setHashtags(hashtagCache.rows); setLoading(false); return; }
    const { data } = await supabase.from('posts')
      .select('hashtags').is('video_url', null).eq('is_draft', false).neq('status', 'deleted')
      .not('hashtags', 'is', null).limit(500);
    const countMap = {};
    (data || []).forEach((p) => (p.hashtags || []).forEach((tag) => { if (tag) countMap[tag] = (countMap[tag] || 0) + 1; }));
    const rows = Object.entries(countMap).sort(([, a], [, b]) => b - a).slice(0, 30).map(([tag, count]) => ({ tag, count }));
    hashtagCache = { rows, t: Date.now() };
    setHashtags(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    setPage(0); setHasMore(true); setFetchError('');
    if (mainTab === 'people') { setLoading(!fresh(peopleCache)); fetchPeople(); return; }
    if (mainTab === 'hashtags') { setLoading(!fresh(hashtagCache)); fetchHashtags(); return; }
    const cached = postsCache[mainTab];
    if (fresh(cached)) { setPosts(cached.rows); setLoading(false); setHasMore(cached.rows.length === POSTS_PER_PAGE); return; }
    setPosts([]); setLoading(true);
    fetchPosts(mainTab, 0, true);
  }, [mainTab, user?.id, fetchPeople, fetchHashtags, fetchPosts]);

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next); setLoadingMore(true);
    fetchPosts(mainTab, next, false);
  }, [page, mainTab, fetchPosts]);

  useEffect(() => {
    if (!['trending', 'new', 'foryou'].includes(mainTab)) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) handleLoadMore(); },
      { rootMargin: '300px' },
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loadingMore, loading, handleLoadMore, mainTab]);

  /* ── search ── */
  const runSearch = useCallback(async (q) => {
    setSearching(true);
    const safe = q.replace(/[%,()]/g, ' ');
    const [usersRes, postsRes] = await Promise.all([
      supabase.from('users').select('id,username,display_name,avatar_url,is_verified,followers_count,posts_count,bio,role')
        .neq('is_banned', true).or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(10),
      supabase.from('posts').select(POST_SELECT)
        .is('video_url', null)
        .eq('is_draft', false).neq('status', 'deleted').eq('audience', 'public')
        .ilike('caption', '%' + safe + '%').order('likes_count', { ascending: false }).limit(10),
    ]);
    const users = (usersRes.data || []).filter((u) => u.id !== user.id);
    setResults({
      users,
      posts: (postsRes.data || []).map(normalise),
      hashtags: hashtags.filter((h) => h.tag?.toLowerCase().includes(q.toLowerCase())).slice(0, 5),
    });
    setSearching(false);
    fetchRelationships(user.id, users.map((u) => u.id)).then(setSearchRels);
  }, [hashtags, user?.id]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setSearching(false); setResults({ posts: [], users: [], hashtags: [] }); return; }
    searchTimer.current = setTimeout(() => runSearch(search.trim()), 350);
    return () => clearTimeout(searchTimer.current);
  }, [search, runSearch]);

  const isSearching = search.trim().length > 0;
  const TabIcon = TABS.find((t) => t.key === mainTab)?.Icon || FileText;

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-[#64748B] flex-shrink-0" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts, people, hashtags"
              className="flex-1 bg-transparent text-[#202938] text-[15px] placeholder-[#94A3B8] focus:outline-none" />
            {search && <button onClick={() => setSearch('')} aria-label="Clear" className="text-[#64748B] hover:text-[#202938] flex-shrink-0"><X size={16} /></button>}
          </div>
        </div>

        {!isSearching && (
          <div className="flex overflow-x-auto scrollbar-none px-2 gap-0">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setMainTab(key)}
                className={'flex-shrink-0 px-3.5 py-2.5 text-[13px] font-semibold relative transition-all inline-flex items-center gap-1.5 ' +
                  (mainTab === key ? 'text-[#202938]' : 'text-[#64748B] hover:text-[#64748B]')}>
                <Icon size={15} className={mainTab === key ? 'text-[#EA580C]' : ''} /> {label}
                {mainTab === key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#F97316] rounded-full" style={{ width: '70%' }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* search results */}
      {isSearching && (
        searching ? (
          <div className="flex justify-center py-12 text-[#EA580C]"><Spinner size={24} /></div>
        ) : (
          <>
            {results.users.length > 0 && (
              <div>
                <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">People</p>
                {results.users.map((u) => <PersonRow key={u.id} u={u} currentUserId={user?.id} relationship={searchRels[u.id]} compact />)}
              </div>
            )}
            {results.hashtags.length > 0 && (
              <div>
                <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Hashtags</p>
                {results.hashtags.map((h, i) => <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i + 1} />)}
              </div>
            )}
            {results.posts.length > 0 && (
              <div>
                <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Posts</p>
                {results.posts.map((post) => <PostCard key={post.id} post={post} currentUser={user} />)}
              </div>
            )}
            {!results.users.length && !results.posts.length && !results.hashtags.length && (
              <EmptyState icon={SearchX} title={`No results for "${search}"`} text="Try a different name or keyword." />
            )}
          </>
        )
      )}

      {/* main content */}
      {!isSearching && (
        <>
          {mainTab === 'people' && (
            <div>
              {loading
                ? Array(8).fill(0).map((_, i) => <UserSkeleton key={i} />)
                : people.length === 0
                  ? <EmptyState icon={Users} title="No members found" text="Check back soon as more people join B-Link." />
                  : people.map((u) => <PersonRow key={u.id} u={u} currentUserId={user?.id} relationship={rels[u.id]} />)}
            </div>
          )}

          {mainTab === 'hashtags' && (
            <div>
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-4 pt-4 pb-2">Trending hashtags</p>
              {loading
                ? Array(8).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0] animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] flex-shrink-0" />
                      <div className="flex-1 space-y-1.5"><div className="h-3 bg-[#F1F5F9] rounded-full w-28" /><div className="h-2.5 bg-[#F1F5F9] rounded-full w-16" /></div>
                    </div>
                  ))
                : hashtags.length === 0
                  ? <EmptyState icon={Hash} title="No hashtags yet" text="Hashtags used in posts will trend here." />
                  : hashtags.map((h, i) => <HashtagRow key={h.tag} tag={h.tag} count={h.count} rank={i + 1} />)}
            </div>
          )}

          {['trending', 'foryou', 'new'].includes(mainTab) && (
            <div>
              {fetchError && !loading && (
                <div className="mx-4 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <p className="text-red-600 text-sm font-semibold">Could not load posts</p>
                  <p className="text-red-600/70 text-xs mt-1">{fetchError}</p>
                  <button onClick={() => { setLoading(true); fetchPosts(mainTab, 0, true); }} className="mt-2 text-xs font-bold text-[#EA580C]">Try again</button>
                </div>
              )}
              {loading
                ? Array(5).fill(0).map((_, i) => <PostSkeleton key={i} />)
                : posts.length === 0 && !fetchError
                  ? (
                    <EmptyState icon={TabIcon} title="No posts yet"
                      text={mainTab === 'foryou' ? 'Follow people to fill your For You feed.' : 'Be the first to share something.'}>
                      <button onClick={() => navigate('/create')} className="bg-[#F97316] text-white px-5 py-2.5 rounded-full font-bold text-sm">Create post</button>
                    </EmptyState>
                  )
                  : (
                    <>
                      {posts.map((post) => <PostCard key={post.id} post={post} currentUser={user} />)}
                      <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]">
                        {loadingMore && <div className="flex items-center gap-2 text-[#64748B]"><Spinner size={18} className="text-[#EA580C]" /><span className="text-sm">Loading more</span></div>}
                        {!hasMore && !loadingMore && posts.length > 0 && <p className="text-[#64748B] text-xs">You're all caught up</p>}
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
