import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import PostCard from '../../components/PostCard';
import ImageViewer from '../../components/ImageViewer';
import VerifiedBadge from '../../components/VerifiedBadge';
import Avatar from '../../components/Avatar';
import FollowButton from '../../components/FollowButton';
import { EmptyState, IconTile, RoleIcon, PlanIcon, Spinner } from '../../components/ui';
import { getActivePlan, PLANS } from '../../utils/paymentUtils';
import {
  REL, iFollowThem, fetchProfileStats, fetchRelationship, fetchRelationships,
  fetchFollowersList, fetchFollowingList, fetchFriendsList, onFollowChange,
} from '../../lib/follows';
import { compressImage, uploadImage, feedImageUrl, thumbUrl } from '../../lib/imageUtils';
import { fetchMyPrivate } from '../../lib/privateProfile';
import {
  ArrowLeft, Settings, MoreHorizontal, MessageCircle, Coins, ChevronRight, X,
  UserMinus, Grid, List, Camera, Link2, MapPin, CalendarDays, Share2, Flag, Ban,
  Copy, Crown, BadgeCheck, Briefcase, Search, FileText, Repeat2, Image as ImageIcon,
  AlertTriangle, UserX, Play, Users2,
} from 'lucide-react';

const POST_SELECT = `
  id, caption, media_urls, video_url, post_type, likes_count,
  comments_count, reposts_count, views_count, is_repost,
  quoted_post_id, created_at, user_id, status, is_draft,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

// Own profile may read its private fields; someone else's profile must not.
const OWN_PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country, is_verified,
  role, is_business, is_banned, is_restricted, created_at,
  followers_count, following_count, posts_count,
  subscription_plan
`.trim();

const PUBLIC_PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country, is_verified,
  role, is_business, created_at,
  followers_count, following_count, posts_count
`.trim();

const PAGE_SIZE = 15;
const REPORT_REASONS = [
  'Spam or scam', 'Harassment or bullying', 'Fake account or impersonation',
  'Inappropriate content', 'Something else',
];

// Stale-while-revalidate: reopening a profile shows instantly, then refreshes.
const profileCache = new Map();

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24 animate-pulse">
      <div className="px-4 pt-5 pb-4">
        <div className="w-20 h-20 rounded-full skeleton" />
        <div className="h-4 w-32 rounded-full skeleton mt-4" />
        <div className="h-3 w-20 rounded-full skeleton mt-2" />
        <div className="grid grid-cols-4 gap-2 mt-5">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl skeleton" />)}
        </div>
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-10 rounded-xl skeleton" />
          <div className="flex-1 h-10 rounded-xl skeleton" />
        </div>
      </div>
    </div>
  );
}

/* Followers / Following / Friends list — every row has a live follow button */
function UserListModal({ title, kind, userId, currentUserId, canRemove, onRemove, onClose }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [rels, setRels] = useState({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    const fetcher = kind === 'followers' ? fetchFollowersList : kind === 'following' ? fetchFollowingList : fetchFriendsList;
    fetcher(userId)
      .then(async (list) => {
        if (!live) return;
        setUsers(list);
        const map = await fetchRelationships(currentUserId, list.map((u) => u.id));
        if (live) setRels(map);
      })
      .catch((err) => live && setError(err.message || 'Could not load this list.'));
    return () => { live = false; };
  }, [kind, userId, currentUserId]);

  const shown = (users || []).filter((u) => {
    const t = q.trim().toLowerCase();
    return !t || u.username?.toLowerCase().includes(t) || u.display_name?.toLowerCase().includes(t);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl h-[78vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
          <p className="text-white font-bold text-base">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-[#8E8C88] hover:text-white"><X size={20} /></button>
        </div>
        {users && users.length > 6 && (
          <div className="px-4 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2 bg-white/[0.07] rounded-xl px-3 py-2">
              <Search size={15} className="text-[#8E8C88]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
                className="flex-1 bg-transparent text-white text-sm placeholder-[#8E8C88] focus:outline-none" />
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1 border-t border-white/[0.06]">
          {error ? (
            <p className="text-red-400 text-sm text-center py-10 px-6">{error}</p>
          ) : users === null ? (
            <div className="flex justify-center py-10 text-[#FF5A1F]"><Spinner size={24} /></div>
          ) : shown.length === 0 ? (
            <EmptyState icon={Users2} title={q ? 'No matches' : 'Nobody here yet'}
              text={q ? 'Try a different name.' : kind === 'friends' ? 'Friends appear when you follow each other.' : undefined} />
          ) : shown.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05]">
              <button onClick={() => { onClose(); navigate('/profile/' + u.username); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <Avatar url={u.avatar_url} name={u.display_name} size={11} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
                    {u.is_verified && <VerifiedBadge size={13} />}
                  </div>
                  <p className="text-[#8E8C88] text-[12px] truncate">@{u.username}</p>
                </div>
              </button>
              {u.id !== currentUserId && (
                <FollowButton targetId={u.id} initialRelationship={rels[u.id] ?? null}
                  username={u.username} displayName={u.display_name} avatarUrl={u.avatar_url} />
              )}
              {canRemove && kind === 'followers' && u.id !== currentUserId && (
                <button
                  onClick={async () => { await onRemove(u.id); setUsers((l) => (l || []).filter((x) => x.id !== u.id)); }}
                  aria-label={`Remove ${u.username}`}
                  className="text-[#8E8C88] hover:text-red-400 p-2 rounded-full hover:bg-red-500/10 flex-shrink-0"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sheet({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function StatBox({ value, label, onClick }) {
  const inner = (
    <>
      <p className="text-white font-black text-[19px] leading-none tabular-nums">{formatNumber(value || 0)}</p>
      <p className="text-[#8E8C88] text-[11px] mt-1.5">{label}</p>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="text-center py-2 rounded-xl active:bg-white/[0.06] transition-colors">{inner}</button>
    : <div className="text-center py-2">{inner}</div>;
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user, profile: myProfile, refreshProfile } = useAuth();

  const isOwnProfile = !username || username.toLowerCase() === myProfile?.username?.toLowerCase();
  const cacheKey = isOwnProfile ? 'own:' + user?.id : 'u:' + (username || '').toLowerCase();

  const [profile, setProfile] = useState(() => profileCache.get(cacheKey)?.profile || null);
  const [stats, setStats] = useState(() => profileCache.get(cacheKey)?.stats || null);
  const [extras, setExtras] = useState(() => profileCache.get(cacheKey)?.extras || { website: null, cover_url: null });
  const [loading, setLoading] = useState(() => !profileCache.get(cacheKey));
  const [fetchError, setFetchError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [relationship, setRelationship] = useState(REL.NONE);
  const relRef = useRef(REL.NONE);
  relRef.current = relationship;

  const [tab, setTab] = useState('posts');            // posts | media | reposts
  const [viewLayout, setViewLayout] = useState('list');
  const [feed, setFeed] = useState({
    posts:   { items: [], page: 0, more: true, loading: true, loaded: false },
    reposts: { items: [], page: 0, more: true, loading: false, loaded: false },
  });

  const [imgViewer, setImgViewer] = useState(false);
  const [listModal, setListModal] = useState(null);   // followers | following | friends
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const avatarInput = useRef(null);
  const toastTimer = useRef(null);
  const sentinel = useRef(null);

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── posts ── */
  const kindOf = (t) => (t === 'reposts' ? 'reposts' : 'posts');

  const loadFeed = useCallback(async (uid, kind, page = 0, reset = false) => {
    setFeed((f) => ({ ...f, [kind]: { ...f[kind], loading: true } }));
    let q = supabase.from('posts').select(POST_SELECT)
      .eq('user_id', uid)
      .or('is_draft.is.null,is_draft.eq.false')
      .or('status.is.null,status.neq.deleted');
    q = kind === 'reposts' ? q.eq('is_repost', true) : q.or('is_repost.is.null,is_repost.eq.false');
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) console.error('Profile posts error:', error.message);
    const rows = (data || []).map((p) => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users }));
    setFeed((f) => ({
      ...f,
      [kind]: {
        items: reset ? rows : [...f[kind].items, ...rows],
        page, more: rows.length === PAGE_SIZE, loading: false, loaded: true,
      },
    }));
  }, []);

  /* ── load profile (instant from cache, then refresh) ── */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const cached = profileCache.get(cacheKey);
    if (cached) {
      setProfile(cached.profile); setStats(cached.stats); setExtras(cached.extras); setLoading(false);
    } else {
      setProfile(null); setStats(null); setExtras({ website: null, cover_url: null }); setLoading(true);
    }
    setFetchError('');
    setTab('posts');
    setRelationship(REL.NONE);
    setFeed({
      posts:   { items: [], page: 0, more: true, loading: true, loaded: false },
      reposts: { items: [], page: 0, more: true, loading: false, loaded: false },
    });

    (async () => {
      try {
        const base = supabase.from('users');
        const { data: pd0, error } = isOwnProfile
          ? await base.select(OWN_PROFILE_FIELDS).eq('id', user.id).maybeSingle()
          : await base.select(PUBLIC_PROFILE_FIELDS).eq('username', username.toLowerCase()).maybeSingle();
        const pd = pd0 && isOwnProfile ? { ...pd0, ...(await fetchMyPrivate(user.id)) } : pd0;
        if (cancelled) return;
        if (error) throw error;
        if (!pd) { setProfile(null); setLoading(false); setFeed((f) => ({ ...f, posts: { ...f.posts, loading: false } })); return; }

        setProfile(pd);
        setLoading(false);
        const quickStats = { followers: pd.followers_count || 0, following: pd.following_count || 0, friends: cached?.stats?.friends || 0, posts: pd.posts_count || 0 };
        setStats((s) => s || quickStats);

        loadFeed(pd.id, 'posts', 0, true);

        const entry = { profile: pd, stats: cached?.stats || quickStats, extras: cached?.extras || { website: null, cover_url: null } };
        profileCache.set(cacheKey, entry);

        // everything else in parallel; each result appears as soon as it lands
        fetchProfileStats(pd.id).then((st) => {
          if (cancelled) return; setStats(st); entry.stats = st;
        }).catch(() => {});

        if (!isOwnProfile) {
          fetchRelationship(user.id, pd.id).then((r) => { if (!cancelled) setRelationship(r); }).catch(() => {});
        }

        // optional columns — tolerate them not existing yet
        Promise.all([
          supabase.from('users').select('website').eq('id', pd.id).maybeSingle(),
          supabase.from('users').select('cover_url').eq('id', pd.id).maybeSingle(),
        ]).then(([w, c]) => {
          if (cancelled) return;
          const ex = { website: w.data?.website || null, cover_url: c.data?.cover_url || null };
          setExtras(ex); entry.extras = ex;
        }).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setFeed((f) => ({ ...f, posts: { ...f.posts, loading: false } }));
        if (!profileCache.get(cacheKey)) setFetchError(err.message || 'Could not load profile.');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, user?.id, isOwnProfile, reloadKey]);

  // keep the cache fresh with the latest numbers
  useEffect(() => {
    const e = profileCache.get(cacheKey);
    if (e && profile) { e.profile = profile; if (stats) e.stats = stats; e.extras = extras; }
  }, [profile, stats, extras, cacheKey]);

  /* ── live counts + relationship ── */
  const refreshStats = useCallback(async () => {
    if (!profile?.id) return;
    try { setStats(await fetchProfileStats(profile.id)); } catch { /* keep current */ }
  }, [profile?.id]);

  const refreshRelationship = useCallback(async () => {
    if (isOwnProfile || !profile?.id || !user?.id) return;
    try { setRelationship(await fetchRelationship(user.id, profile.id)); } catch { /* keep current */ }
  }, [isOwnProfile, profile?.id, user?.id]);

  useEffect(() => {
    if (!profile?.id || !user?.id) return;
    const pid = profile.id;
    let t;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(() => { refreshStats(); refreshRelationship(); }, 450);
    };
    const ch = supabase.channel('profile:' + pid + ':' + Math.random().toString(36).slice(2, 7))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows', filter: `following_id=eq.${pid}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows', filter: `follower_id=eq.${pid}` }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows' }, (p) => {
        const o = p.old || {};
        if ((!o.follower_id && !o.following_id) || o.follower_id === pid || o.following_id === pid) refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `user_id=eq.${pid}` }, () => {
        refresh();
        if (pid === user.id) loadFeed(pid, 'posts', 0, true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, refresh)
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') { refreshStats(); refreshRelationship(); } };
    document.addEventListener('visibilitychange', onVisible);

    // follows made from other screens (Discover, lists, notifications) on this device
    const off = onFollowChange((d) => {
      if (d.me !== user.id) return;
      const wasI = iFollowThem(d.previous), isI = iFollowThem(d.relationship);
      const wasF = d.previous === REL.FRIENDS, isF = d.relationship === REL.FRIENDS;
      if (pid === d.targetId) {
        setRelationship(d.relationship);
        setStats((s) => s && ({ ...s, followers: Math.max(0, s.followers + (isI ? 1 : 0) - (wasI ? 1 : 0)) }));
      } else if (pid === user.id) {
        setStats((s) => s && ({
          ...s,
          following: Math.max(0, s.following + (isI ? 1 : 0) - (wasI ? 1 : 0)),
          friends:   Math.max(0, s.friends + (isF ? 1 : 0) - (wasF ? 1 : 0)),
        }));
      }
      refresh();
    });

    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible); off(); };
  }, [profile?.id, user?.id, refreshStats, refreshRelationship, loadFeed]);

  /* ── tabs + infinite scroll ── */
  useEffect(() => {
    if (!profile?.id) return;
    const kind = kindOf(tab);
    if (kind === 'reposts' && !feed.reposts.loaded && !feed.reposts.loading) loadFeed(profile.id, 'reposts', 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile?.id]);

  const cur = feed[kindOf(tab)];
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !profile?.id) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && cur.more && !cur.loading && cur.loaded) {
        loadFeed(profile.id, kindOf(tab), cur.page + 1);
      }
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cur.more, cur.loading, cur.loaded, cur.page, tab, profile?.id, loadFeed]);

  const refreshPosts = useCallback(() => {
    if (profile?.id) { loadFeed(profile.id, 'posts', 0, true); loadFeed(profile.id, 'reposts', 0, true); refreshStats(); }
  }, [profile?.id, loadFeed, refreshStats]);

  /* ── actions ── */
  const profileLink = profile ? `${window.location.origin}/profile/${profile.username}` : '';

  const shareProfile = async () => {
    setMenuOpen(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${profile.display_name} on B-Link`, text: `Follow @${profile.username} on B-Link`, url: profileLink });
        return;
      }
    } catch (e) { if (e?.name === 'AbortError') return; }
    copyLink();
  };

  const copyLink = async () => {
    setMenuOpen(false);
    try { await navigator.clipboard.writeText(profileLink); showToast('Profile link copied'); }
    catch { showToast('Could not copy the link', 'error'); }
  };

  const handleMessage = async () => {
    if (!profile?.id || messageBusy) return;
    setMessageBusy(true);
    try {
      let chatId = null;
      let rpcErr = null;
      const { data, error } = await supabase.rpc('get_or_create_chat', { p_other_id: profile.id });
      if (error) rpcErr = error;
      else chatId = Array.isArray(data) ? (data[0]?.id ?? data[0]) : (data?.id ?? data);

      if (!chatId) {
        // legacy fallback: look for an existing chat, else create one
        const { data: mine } = await supabase.from('chats').select('id, participants')
          .contains('participants', [user.id]).limit(300);
        const found = (mine || []).find((c) => (c.participants || []).includes(profile.id));
        if (found) chatId = found.id;
        else {
          const { data: created, error: insErr } = await supabase.from('chats')
            .insert({ participants: [user.id, profile.id] }).select('id').single();
          if (!insErr && created) chatId = created.id;
        }
      }

      if (!chatId) {
        const m = (rpcErr?.message || '').toLowerCase();
        if (m.includes('block')) throw new Error("You can't message this person.");
        if (m.includes('does not exist') || m.includes('function')) throw new Error('Messaging is not available right now. Please try again shortly.');
        throw new Error(rpcErr?.message || 'Could not start the conversation.');
      }
      navigate('/chats/' + chatId);
    } catch (err) {
      showToast(err.message || 'Could not open chat', 'error');
    }
    setMessageBusy(false);
  };

  const handleRemoveFollower = async (followerId) => {
    try {
      const { error } = await supabase.rpc('remove_follower', { p_follower_id: followerId });
      if (error) throw error;
      setStats((s) => s && ({ ...s, followers: Math.max(0, s.followers - 1) }));
      refreshStats();
    } catch (err) {
      showToast(err.message || 'Could not remove follower', 'error');
    }
  };

  const doReport = async (reason) => {
    setReportOpen(false);
    try {
      const { error } = await supabase.rpc('report_user', { p_target_id: profile.id, p_reason: reason, p_details: null });
      if (error) throw error;
      showToast('Report sent. Thank you.');
    } catch (err) { showToast(err.message || 'Could not send report', 'error'); }
  };

  const doBlock = async () => {
    setBlockOpen(false);
    try {
      const { error } = await supabase.rpc('block_user', { p_target_id: profile.id });
      if (error) throw error;
      profileCache.delete(cacheKey);
      showToast(`Blocked @${profile.username}`);
      setTimeout(() => navigate(-1), 600);
    } catch (err) { showToast(err.message || 'Could not block user', 'error'); }
  };

  const onPickAvatar = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Please choose an image', 'error'); return; }
    setAvatarBusy(true);
    try {
      const small = await compressImage(f, { maxSize: 640, square: true, quality: 0.86 });
      const url = await uploadImage(small, 'avatars');
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;
      setProfile((p) => ({ ...p, avatar_url: url }));
      refreshProfile?.();
      showToast('Profile photo updated');
    } catch (err) {
      showToast(err.message || 'Could not update photo', 'error');
    }
    setAvatarBusy(false);
  };

  /* ── render ── */
  if (loading) return <ProfileSkeleton />;

  if (fetchError && !profile) return (
    <div className="min-h-screen bg-[#0D0C0B]">
      <EmptyState icon={AlertTriangle} color="#EF4444" title="Could not load profile" text={fetchError}>
        <button onClick={() => setReloadKey((k) => k + 1)} className="bg-[#FF5A1F] text-white px-5 py-2.5 rounded-full font-bold text-sm">Try again</button>
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] font-semibold text-sm px-3">Go back</button>
      </EmptyState>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#0D0C0B]">
      <EmptyState icon={UserX} title="User not found" text="This account may have been renamed or removed.">
        <button onClick={() => navigate(-1)} className="bg-white/10 text-white px-5 py-2.5 rounded-full font-bold text-sm">Go back</button>
      </EmptyState>
    </div>
  );

  const s = stats || { followers: profile.followers_count || 0, following: profile.following_count || 0, friends: 0, posts: profile.posts_count || 0 };
  const items = tab === 'media'
    ? feed.posts.items.filter((p) => (p.media_urls || []).length > 0 || p.video_url)
    : cur.items;
  const websiteHost = extras.website ? extras.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  const websiteHref = extras.website && /^https?:\/\//i.test(extras.website) ? extras.website : extras.website ? 'https://' + extras.website : '';

  const TABS = [
    { key: 'posts', label: 'Posts', Icon: FileText },
    { key: 'media', label: 'Media', Icon: ImageIcon },
    { key: 'reposts', label: 'Reposts', Icon: Repeat2 },
  ];

  const emptyCopy = {
    posts:   { title: 'No posts yet', text: isOwnProfile ? 'Share your first post with the community.' : `@${profile.username} hasn't posted yet.` },
    media:   { title: 'No photos or videos', text: isOwnProfile ? 'Posts with photos or videos show up here.' : 'Nothing to see here yet.' },
    reposts: { title: 'No reposts yet', text: isOwnProfile ? 'Posts you repost appear here.' : 'Nothing to see here yet.' },
  }[tab];

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      {imgViewer && profile.avatar_url && <ImageViewer images={[profile.avatar_url]} index={0} onClose={() => setImgViewer(false)} />}

      {toast && (
        <div className={'fixed top-4 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-sm font-semibold shadow-xl ' +
          (toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-white text-black')}>
          {toast.msg}
        </div>
      )}

      {listModal && (
        <UserListModal
          kind={listModal}
          title={`${listModal === 'followers' ? 'Followers' : listModal === 'following' ? 'Following' : 'Friends'} · ${formatNumber(s[listModal])}`}
          userId={profile.id}
          currentUserId={user?.id}
          canRemove={isOwnProfile}
          onRemove={handleRemoveFollower}
          onClose={() => setListModal(null)}
        />
      )}

      {menuOpen && (
        <Sheet onClose={() => setMenuOpen(false)}>
          {[
            { Icon: Share2, label: 'Share profile', fn: shareProfile },
            { Icon: Copy, label: 'Copy link', fn: copyLink },
            { Icon: Flag, label: 'Report', fn: () => { setMenuOpen(false); setReportOpen(true); }, red: true },
            { Icon: Ban, label: `Block @${profile.username}`, fn: () => { setMenuOpen(false); setBlockOpen(true); }, red: true },
          ].map(({ Icon, label, fn, red }) => (
            <button key={label} onClick={fn}
              className={'w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-white/[0.05] text-left font-semibold text-[15px] ' + (red ? 'text-red-400' : 'text-white')}>
              <Icon size={19} /> {label}
            </button>
          ))}
        </Sheet>
      )}

      {reportOpen && (
        <Sheet onClose={() => setReportOpen(false)}>
          <p className="text-white font-bold text-base px-3 pb-2">Why are you reporting @{profile.username}?</p>
          {REPORT_REASONS.map((r) => (
            <button key={r} onClick={() => doReport(r)} className="w-full text-left px-3 py-3.5 rounded-xl hover:bg-white/[0.05] text-white text-[15px]">{r}</button>
          ))}
        </Sheet>
      )}

      {blockOpen && (
        <Sheet onClose={() => setBlockOpen(false)}>
          <div className="text-center px-2 pb-4">
            <p className="text-white font-bold text-base">Block @{profile.username}?</p>
            <p className="text-[#8E8C88] text-sm mt-1.5">They won't be able to message you, and you'll stop following each other.</p>
          </div>
          <button onClick={doBlock} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold text-sm border border-red-500/30 mb-2">Block</button>
          <button onClick={() => setBlockOpen(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold text-sm">Cancel</button>
        </Sheet>
      )}

      {/* top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/95 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="text-[#8E8C88] hover:text-white flex-shrink-0"><ArrowLeft size={22} /></button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-white font-bold text-[15px] leading-none truncate">{profile.display_name}</p>
          <p className="text-[#8E8C88] text-xs mt-0.5">{formatNumber(s.posts)} posts</p>
        </div>
        {isOwnProfile ? (
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={shareProfile} aria-label="Share profile" className="text-[#8E8C88] hover:text-white"><Share2 size={19} /></button>
            <button onClick={() => navigate('/settings')} aria-label="Settings" className="text-[#8E8C88] hover:text-white"><Settings size={20} /></button>
          </div>
        ) : (
          <button onClick={() => setMenuOpen(true)} aria-label="More options" className="text-[#8E8C88] hover:text-white flex-shrink-0"><MoreHorizontal size={22} /></button>
        )}
      </div>

      {/* cover */}
      {extras.cover_url && (
        <div className="h-28 w-full bg-white/5 overflow-hidden">
          <img src={feedImageUrl(extras.cover_url, 1000)} alt="" className="w-full h-full object-cover" decoding="async" />
        </div>
      )}

      <div className="px-4 pt-5 pb-4">
        <div className={'flex items-end justify-between ' + (extras.cover_url ? '-mt-12' : '')}>
          <div className="relative flex-shrink-0">
            <button onClick={() => profile.avatar_url && setImgViewer(true)} aria-label="View profile photo"
              className="block rounded-full border-[3px] border-[#0D0C0B] bg-[#0D0C0B]">
              <Avatar url={profile.avatar_url} name={profile.display_name} size={22} />
            </button>
            {profile.is_verified && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#0D0C0B] rounded-full p-0.5"><VerifiedBadge size={20} /></div>
            )}
            {isOwnProfile && (
              <>
                <button onClick={() => avatarInput.current?.click()} disabled={avatarBusy} aria-label="Change profile photo"
                  className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-[#FF5A1F] border-2 border-[#0D0C0B] flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-70">
                  {avatarBusy ? <Spinner size={14} /> : <Camera size={14} />}
                </button>
                <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
              </>
            )}
          </div>
          <div className="flex-1 grid grid-cols-4 gap-1 ml-3">
            <StatBox value={s.posts} label="Posts" />
            <StatBox value={s.followers} label="Followers" onClick={() => setListModal('followers')} />
            <StatBox value={s.following} label="Following" onClick={() => setListModal('following')} />
            <StatBox value={s.friends} label="Friends" onClick={() => setListModal('friends')} />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-white font-black text-[18px] leading-tight">{profile.display_name}</p>
            {profile.is_verified && <VerifiedBadge size={16} />}
            <RoleIcon role={profile.role} />
            {profile.is_business && (
              <span className="inline-flex items-center gap-1 bg-yellow-500/15 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-yellow-500/30">
                <Briefcase size={10} /> Business
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-[#8E8C88] text-sm">@{profile.username}</p>
            {!isOwnProfile && relationship === REL.FOLLOW_BACK && (
              <span className="text-[10px] font-bold text-[#8E8C88] bg-white/[0.07] px-2 py-0.5 rounded-full">Follows you</span>
            )}
            {!isOwnProfile && relationship === REL.FRIENDS && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2ECC71] bg-[#2ECC71]/10 border border-[#2ECC71]/30 px-2 py-0.5 rounded-full">
                <Users2 size={10} /> Friends
              </span>
            )}
          </div>

          {profile.bio && <p className="text-white/85 text-[14px] mt-2.5 leading-snug whitespace-pre-line">{profile.bio}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-[#8E8C88] text-xs">
            {profile.country && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {profile.country}</span>}
            {websiteHost && (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-[#FF5A1F] font-semibold max-w-[200px]">
                <Link2 size={13} className="flex-shrink-0" /> <span className="truncate">{websiteHost}</span>
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={13} /> Joined {new Date(profile.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {isOwnProfile ? (
            <>
              <button onClick={() => navigate('/edit-profile')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 active:scale-95 transition-all">
                Edit Profile
              </button>
              <button onClick={() => navigate('/premium')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 hover:bg-[#FF5A1F]/20 active:scale-95 transition-all inline-flex items-center justify-center gap-1.5">
                <Crown size={15} className="text-[#FF5A1F]" /> Premium
              </button>
            </>
          ) : (
            <>
              <FollowButton
                size="lg" targetId={profile.id} initialRelationship={relationship}
                username={profile.username} displayName={profile.display_name} avatarUrl={profile.avatar_url}
                onChange={(r) => setRelationship(r)}
              />
              <button onClick={handleMessage} disabled={messageBusy}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 active:scale-95 transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                {messageBusy ? <Spinner size={15} /> : <><MessageCircle size={15} /> Message</>}
              </button>
            </>
          )}
        </div>

        {isOwnProfile && (() => {
          const activePlan = getActivePlan(profile);
          const planInfo = PLANS[activePlan];
          const actions = [
            { Icon: Crown,      label: 'Plans',    path: '/subscription', active: activePlan !== 'free' },
            { Icon: Coins,      label: 'Coins',    path: '/coins' },
            { Icon: BadgeCheck, label: 'Verify',   path: '/verification', active: profile.is_verified },
            { Icon: Briefcase,  label: 'Business', path: '/business-page', active: profile.is_business },
          ];
          return (
            <div className="mt-4 rounded-2xl border overflow-hidden" style={{ borderColor: (planInfo?.color || '#8E8C88') + '30', background: (planInfo?.color || '#8E8C88') + '08' }}>
              <button onClick={() => navigate('/premium')} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <IconTile icon={Crown} color={planInfo?.color || '#8E8C88'} size={40} iconSize={20} />
                  <div className="text-left">
                    <p className="text-white font-bold text-[14px] flex items-center gap-1.5">{planInfo?.label || 'Free'} Plan <PlanIcon plan={activePlan} size={13} /></p>
                    <p className="text-[#8E8C88] text-[11px]">
                      {activePlan !== 'free' && profile.subscription_expires_at
                        ? 'Renews ' + new Date(profile.subscription_expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
                        : 'Tap to upgrade'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/25 rounded-full px-2.5 py-1">
                    <Coins size={12} className="text-yellow-400" />
                    <span className="text-yellow-400 font-bold text-[12px]">{formatNumber(profile.coins_balance || 0)}</span>
                  </div>
                  <ChevronRight size={16} className="text-[#8E8C88]" />
                </div>
              </button>
              <div className="grid grid-cols-4 border-t border-white/[0.06]">
                {actions.map(({ Icon, label, path, active }) => (
                  <button key={path} onClick={() => navigate(path)}
                    className="relative flex flex-col items-center gap-1.5 py-3 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06] last:border-r-0">
                    <Icon size={19} className={active ? 'text-[#FF5A1F]' : 'text-white/70'} />
                    <span className="text-[10px] font-semibold text-white/60">{label}</span>
                    {active && <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-[#2ECC71]" />}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* tabs */}
      <div className="border-t border-white/[0.07] flex items-center justify-between px-2">
        <div className="flex">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={'py-3 px-3.5 text-[13px] font-semibold transition-all relative inline-flex items-center gap-1.5 ' + (tab === key ? 'text-white' : 'text-[#8E8C88]')}>
              <Icon size={15} /> {label}
              {tab === key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#FF5A1F] rounded-full" style={{ width: '70%' }} />}
            </button>
          ))}
        </div>
        <div className="flex gap-1 pr-2">
          <button onClick={() => setViewLayout('list')} aria-label="List view" className={`p-2 rounded-lg ${viewLayout === 'list' ? 'text-[#FF5A1F] bg-[#FF5A1F]/10' : 'text-[#8E8C88]'}`}><List size={17} /></button>
          <button onClick={() => setViewLayout('grid')} aria-label="Grid view" className={`p-2 rounded-lg ${viewLayout === 'grid' ? 'text-[#FF5A1F] bg-[#FF5A1F]/10' : 'text-[#8E8C88]'}`}><Grid size={17} /></button>
        </div>
      </div>

      {cur.loading && items.length === 0 ? (
        <div className="flex justify-center py-10 text-[#FF5A1F]"><Spinner size={24} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={TABS.find((t) => t.key === tab).Icon} title={emptyCopy.title} text={emptyCopy.text}>
          {isOwnProfile && tab === 'posts' && (
            <button onClick={() => navigate('/create')} className="bg-[#FF5A1F] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-[#FF5A1F]/30">
              Create your first post
            </button>
          )}
        </EmptyState>
      ) : viewLayout === 'grid' || tab === 'media' ? (
        <div className="grid grid-cols-3 gap-0.5 border-t border-white/[0.06]">
          {items.map((post) => (
            <button key={post.id} onClick={() => navigate('/post/' + post.id)}
              className="relative bg-white/5 hover:bg-white/10 transition-colors" style={{ aspectRatio: '1/1' }}>
              {(post.media_urls || [])[0]
                ? <img src={thumbUrl(post.media_urls[0], 360)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : post.video_url
                  ? <div className="w-full h-full flex items-center justify-center bg-black/40"><Play size={22} className="text-white/80" /></div>
                  : <div className="w-full h-full flex items-center justify-center p-2"><p className="text-white/50 text-[10px] text-center line-clamp-3">{post.caption}</p></div>}
              {post.video_url && (post.media_urls || [])[0] && <Play size={14} className="absolute top-1.5 right-1.5 text-white drop-shadow" fill="white" />}
            </button>
          ))}
        </div>
      ) : (
        items.map((post) => <PostCard key={post.id} post={post} currentUser={user} onRefresh={refreshPosts} />)
      )}

      <div ref={sentinel} className="h-10 flex items-center justify-center text-[#FF5A1F]">
        {cur.loading && items.length > 0 && <Spinner size={18} />}
      </div>
    </div>
  );
}
