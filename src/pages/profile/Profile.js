import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import PostCard from '../../components/PostCard';
import ImageViewer from '../../components/ImageViewer';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getActivePlan, PLANS } from '../../utils/paymentUtils';
import {
  ArrowLeft, Settings, UserPlus, UserCheck, Users2,
  Grid, List, MoreHorizontal, MessageCircle,
  Coins, ChevronRight, X, UserMinus,
} from 'lucide-react';

const POST_SELECT = `
  id, caption, media_urls, video_url, post_type, likes_count,
  comments_count, reposts_count, views_count, is_repost,
  quoted_post_id, created_at, user_id, status, is_draft,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

// Own profile can see every field about itself. Someone else's
// profile must NOT — the original code did `select('*')` for both
// branches, which meant viewing any other user's profile returned
// their coins_balance, subscription plan/expiry, ban/restriction
// status and reason, posts_today, and every other privileged column
// straight into the browser's network response, regardless of
// whether the UI displayed it. This list is exactly what the public
// profile view actually renders — nothing more.
const OWN_PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country, is_verified,
  role, is_business, is_banned, is_restricted, created_at,
  followers_count, following_count, posts_count,
  subscription_plan, subscription_expires_at, coins_balance
`.trim();

const PUBLIC_PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country, is_verified,
  role, is_business, created_at,
  followers_count, following_count, posts_count
`.trim();

const POSTS_PAGE_SIZE = 15;

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A1628] pb-24 animate-pulse">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="w-20 h-20 rounded-full skeleton flex-shrink-0" />
          <div className="flex-1 flex justify-around">
            {[1,2,3].map(i => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-5 w-8 rounded-full skeleton" />
                <div className="h-2.5 w-12 rounded-full skeleton" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-4 w-32 rounded-full skeleton mt-4" />
        <div className="h-3 w-20 rounded-full skeleton mt-2" />
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-10 rounded-xl skeleton" />
          <div className="flex-1 h-10 rounded-xl skeleton" />
        </div>
      </div>
    </div>
  );
}

// Followers/Following list modal — the report explicitly asks for
// counts to be clickable; previously they were plain, inert text.
function UserListModal({ title, fetcher, currentUserId, onClose, onRemove, canRemove }) {
  const navigate = useNavigate();
  const [users,   setUsers]   = useState(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetcher().then(setUsers).catch(err => setError(err.message));
  }, [fetcher]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 flex-shrink-0">
          <p className="text-white font-bold text-base">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-[#6B7280] hover:text-white"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {error ? (
            <p className="text-red-400 text-sm text-center py-10">{error}</p>
          ) : users === null ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="text-[#6B7280] text-sm text-center py-10">Nobody here yet</p>
          ) : (
            users.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05]">
                <button onClick={() => { onClose(); navigate('/profile/' + u.username); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold flex-shrink-0">{u.display_name?.[0]?.toUpperCase()}</div>
                  }
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-white font-bold text-[14px] truncate">{u.display_name}</p>
                      {u.is_verified && <VerifiedBadge size={13} />}
                    </div>
                    <p className="text-[#6B7280] text-[12px]">@{u.username}</p>
                  </div>
                </button>
                {canRemove && u.id !== currentUserId && (
                  <button
                    onClick={() => onRemove(u.id)}
                    aria-label={`Remove ${u.username}`}
                    className="text-[#6B7280] hover:text-red-400 text-xs font-bold px-2.5 py-1.5 rounded-full hover:bg-red-500/10 flex items-center gap-1 flex-shrink-0"
                  >
                    <UserMinus size={12} /> Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { username }     = useParams();
  const navigate         = useNavigate();
  const { user, profile: myProfile } = useAuth();

  const [profile,       setProfile]       = useState(null);
  const [posts,         setPosts]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [postsLoading,  setPostsLoading]  = useState(true);
  const [postsPage,     setPostsPage]     = useState(0);
  const [postsHasMore,  setPostsHasMore]  = useState(true);
  const [relationship,  setRelationship]  = useState('none'); // none | following | follow_back | friends
  const [followBusy,    setFollowBusy]    = useState(false);
  const [tab,           setTab]           = useState('posts');
  const [viewLayout,    setViewLayout]    = useState('list');
  const [imgViewer,     setImgViewer]     = useState(false);
  const [fetchError,    setFetchError]    = useState('');
  const [listModal,     setListModal]     = useState(null); // 'followers' | 'following' | null

  const isOwnProfile = !username || username === myProfile?.username;

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, user?.id]);

  // Keep relationship state in sync with the database, not just local
  // optimism — realtime on the follows table for this specific pair
  // covers both directions (them following/unfollowing you updates
  // Follow Back / Friends live, without a manual refresh).
  useEffect(() => {
    if (isOwnProfile || !profile?.id || !user?.id) return;
    const ch = supabase.channel('profile:rel:' + user.id + ':' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows',
          filter: `follower_id=eq.${profile.id}` }, refetchRelationship)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows',
          filter: `following_id=eq.${profile.id}` }, refetchRelationship)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, user?.id, isOwnProfile]);

  const refetchRelationship = async () => {
    if (!user?.id || !profile?.id) return;
    const { data } = await supabase.rpc('get_relationship', { p_viewer_id: user.id, p_target_id: profile.id });
    if (data) setRelationship(data);
  };

  const loadProfile = async () => {
    setLoading(true);
    setPostsLoading(true);
    setFetchError('');

    const hardTimeout = setTimeout(() => {
      setLoading(false);
      setFetchError(prev => prev || 'Taking longer than expected. Pull down or tap retry.');
    }, 8000);

    try {
      const fields = isOwnProfile ? OWN_PROFILE_FIELDS : PUBLIC_PROFILE_FIELDS;
      const query = isOwnProfile
        ? supabase.from('users').select(fields).eq('id', user.id).maybeSingle()
        : supabase.from('users').select(fields).eq('username', username).maybeSingle();

      const { data: profileData, error } = await query;
      if (error) throw error;

      if (!profileData) {
        clearTimeout(hardTimeout);
        setLoading(false);
        setPostsLoading(false);
        return;
      }

      setProfile(profileData);

      // Counts now come straight off the users row — maintained
      // atomically by DB triggers (see 28_relationship_and_
      // postdetail_rpcs.sql). Previously this ran 3 extra COUNT
      // queries on every single profile view, then wrote the results
      // back into the users table from the client (which stopped
      // actually working once the privileged-field trigger from
      // earlier in this project silently rejected it, and which
      // let any visitor trigger a write to someone else's row
      // regardless). None of that happens anymore — nothing to fetch.

      if (!isOwnProfile && user?.id) {
        const { data: rel } = await supabase.rpc('get_relationship', { p_viewer_id: user.id, p_target_id: profileData.id });
        if (rel) setRelationship(rel);
      }

      clearTimeout(hardTimeout);
      setLoading(false);
      setPostsPage(0);
      setPostsHasMore(true);
      loadPosts(profileData.id, 0, true);

    } catch (err) {
      console.error('loadProfile error:', err.message);
      clearTimeout(hardTimeout);
      setLoading(false);
      setPostsLoading(false);
      setFetchError(err.message || 'Could not load profile.');
    }
  };

  // Now paginated (15 at a time) instead of pulling up to 50 posts
  // unconditionally on every profile visit.
  const loadPosts = async (uid, page, reset = false) => {
    setPostsLoading(true);
    const from = page * POSTS_PAGE_SIZE;
    const to   = from + POSTS_PAGE_SIZE - 1;
    const { data, error } = await supabase.from('posts')
      .select(POST_SELECT)
      .eq('user_id', uid)
      .eq('is_draft', false)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) console.error('Profile posts error:', error.message);
    const rows = (data || []).map(p => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users }));
    setPosts(prev => reset ? rows : [...prev, ...rows]);
    setPostsHasMore(rows.length === POSTS_PAGE_SIZE);
    setPostsLoading(false);
  };

  const handleLoadMorePosts = () => {
    if (postsLoading || !postsHasMore) return;
    const next = postsPage + 1;
    setPostsPage(next);
    loadPosts(profile.id, next);
  };

  // Atomic RPC, optimistic UI with rollback on failure — was a raw
  // delete/upsert pair with zero error checking, so a failed request
  // silently left the UI showing the wrong state forever.
  const handleFollowToggle = async () => {
    if (!profile?.id || followBusy) return;
    setFollowBusy(true);
    const prev = relationship;

    // Optimistic: flip between the two "I follow / I don't" states.
    // The RPC's actual return value corrects this immediately after,
    // including the Friends/Follow Back nuance the optimistic guess
    // can't know in advance.
    setRelationship(r => (r === 'following' || r === 'friends') ? (r === 'friends' ? 'follow_back' : 'none') : (r === 'follow_back' ? 'friends' : 'following'));

    try {
      const { data, error } = await supabase.rpc('toggle_follow', { p_target_id: profile.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setRelationship(row.relationship);
        setProfile(p => ({ ...p, followers_count: row.target_followers_count }));
      }
    } catch (err) {
      setRelationship(prev);
    }
    setFollowBusy(false);
  };

  const handleRemoveFollower = async (followerId) => {
    try {
      const { error } = await supabase.rpc('remove_follower', { p_follower_id: followerId });
      if (error) throw error;
      setProfile(p => ({ ...p, followers_count: Math.max(0, (p.followers_count || 0) - 1) }));
    } catch (err) {
      console.error('remove_follower:', err.message);
    }
  };

  // Was: navigate('/chats') — always sent you to the chat LIST, never
  // to an actual conversation with the profile you tapped "Message"
  // from. Now uses the same atomic get_or_create_chat() RPC ChatList
  // uses, so it either opens the existing conversation or creates one
  // and goes straight there.
  const [messageBusy, setMessageBusy] = useState(false);
  const handleMessage = async () => {
    if (!profile?.id || messageBusy) return;
    setMessageBusy(true);
    try {
      const { data: chatId, error } = await supabase.rpc('get_or_create_chat', { p_other_id: profile.id });
      if (error) throw error;
      navigate('/chats/' + chatId);
    } catch (err) {
      console.error('handleMessage:', err.message);
    }
    setMessageBusy(false);
  };

  const fetchFollowers = () => supabase
    .from('follows')
    .select('users!follows_follower_id_fkey(id,username,display_name,avatar_url,is_verified)')
    .eq('following_id', profile.id)
    .then(({ data }) => (data || []).map(r => r['users!follows_follower_id_fkey'] || r.users).filter(Boolean));

  const fetchFollowing = () => supabase
    .from('follows')
    .select('users!follows_following_id_fkey(id,username,display_name,avatar_url,is_verified)')
    .eq('follower_id', profile.id)
    .then(({ data }) => (data || []).map(r => r['users!follows_following_id_fkey'] || r.users).filter(Boolean));

  if (loading) return <ProfileSkeleton />;

  if (fetchError && !profile) return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-3 px-6">
      <p className="text-5xl">⚠️</p>
      <p className="text-white font-bold text-lg">Could not load profile</p>
      <p className="text-[#6B7280] text-sm text-center">{fetchError}</p>
      <button onClick={loadProfile} className="mt-2 bg-[#1E6FFF] text-white px-5 py-2.5 rounded-full font-bold text-sm">
        Try again
      </button>
      <button onClick={() => navigate(-1)} className="text-[#6B7280] text-sm">← Go back</button>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-3 px-6">
      <p className="text-5xl">🔍</p>
      <p className="text-white font-bold text-lg">User not found</p>
      <button onClick={() => navigate(-1)} className="text-[#1E6FFF] font-semibold">← Go back</button>
    </div>
  );

  const roleIcon = profile.role === 'blink' ? '👑' : profile.role === 'admin' ? '🛡️' : profile.role === 'moderator' ? '🔵' : null;

  const followButtonConfig = {
    none:        { label: 'Follow',       icon: UserPlus,  cls: 'text-white bg-[#1E6FFF] hover:bg-[#1565cc] shadow-lg shadow-[#1E6FFF]/30' },
    following:   { label: 'Following',    icon: UserCheck, cls: 'border border-white/20 bg-white/[0.06] text-white hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' },
    follow_back: { label: 'Follow Back',  icon: UserPlus,  cls: 'text-white bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] shadow-lg shadow-[#1E6FFF]/30' },
    friends:     { label: 'Friends',      icon: Users2,    cls: 'border border-[#2ECC71]/40 bg-[#2ECC71]/10 text-[#2ECC71] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' },
  }[relationship] || { label: 'Follow', icon: UserPlus, cls: 'text-white bg-[#1E6FFF]' };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {imgViewer && profile.avatar_url && (
        <ImageViewer images={[profile.avatar_url]} index={0} onClose={() => setImgViewer(false)} />
      )}

      {listModal === 'followers' && (
        <UserListModal
          title={`Followers · ${formatNumber(profile.followers_count || 0)}`}
          fetcher={fetchFollowers}
          currentUserId={user?.id}
          canRemove={isOwnProfile}
          onRemove={handleRemoveFollower}
          onClose={() => setListModal(null)}
        />
      )}
      {listModal === 'following' && (
        <UserListModal
          title={`Following · ${formatNumber(profile.following_count || 0)}`}
          fetcher={fetchFollowing}
          currentUserId={user?.id}
          canRemove={false}
          onClose={() => setListModal(null)}
        />
      )}

      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="text-[#6B7280] hover:text-white transition-colors flex-shrink-0">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-white font-bold text-[15px] leading-none truncate">{profile.display_name}</p>
          <p className="text-[#6B7280] text-xs mt-0.5">{formatNumber(profile.posts_count || 0)} posts</p>
        </div>
        {isOwnProfile ? (
          <button onClick={() => navigate('/settings')} aria-label="Settings" className="text-[#6B7280] hover:text-white flex-shrink-0"><Settings size={20} /></button>
        ) : (
          <button aria-label="More options" className="text-[#6B7280] hover:text-white flex-shrink-0"><MoreHorizontal size={20} /></button>
        )}
      </div>

      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <button onClick={() => profile.avatar_url && setImgViewer(true)} aria-label="View profile photo" className="relative flex-shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-white/20" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-black text-2xl border-2 border-white/20">
                {profile.display_name?.[0]?.toUpperCase()}
              </div>
            )}
            {profile.is_verified && (
              <div className="absolute -bottom-1 -right-1 bg-[#0A1628] rounded-full p-0.5">
                <VerifiedBadge size={20} />
              </div>
            )}
          </button>

          <div className="flex-1 flex justify-around">
            <div className="text-center">
              <p className="text-white font-black text-xl leading-none">{formatNumber(profile.posts_count || 0)}</p>
              <p className="text-[#6B7280] text-xs mt-1">Posts</p>
            </div>
            {/* Clickable — previously plain text, no way to see who
                follows this account or who they follow. */}
            <button onClick={() => setListModal('followers')} className="text-center active:opacity-60 transition-opacity">
              <p className="text-white font-black text-xl leading-none">{formatNumber(profile.followers_count || 0)}</p>
              <p className="text-[#6B7280] text-xs mt-1">Followers</p>
            </button>
            <button onClick={() => setListModal('following')} className="text-center active:opacity-60 transition-opacity">
              <p className="text-white font-black text-xl leading-none">{formatNumber(profile.following_count || 0)}</p>
              <p className="text-[#6B7280] text-xs mt-1">Following</p>
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-black text-[17px]">{profile.display_name}</p>
            {profile.is_verified && <VerifiedBadge size={16} />}
            {roleIcon && <span className="text-base">{roleIcon}</span>}
            {profile.is_business && (
              <span className="bg-yellow-500/20 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-yellow-500/30">💼 Business</span>
            )}
            {relationship === 'friends' && !isOwnProfile && (
              <span className="bg-[#2ECC71]/15 text-[#2ECC71] text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-[#2ECC71]/30 flex items-center gap-1">
                <Users2 size={9} /> Friends
              </span>
            )}
          </div>
          <p className="text-[#6B7280] text-sm">@{profile.username}</p>
          {relationship === 'follow_back' && (
            <p className="text-[#1E6FFF] text-xs mt-1 font-semibold">Follows you</p>
          )}
          {profile.bio && (
            <p className="text-white/80 text-[14px] mt-2 leading-snug">{profile.bio}</p>
          )}
          {profile.country && (
            <p className="text-[#6B7280] text-xs mt-1">📍 {profile.country}</p>
          )}
          <p className="text-[#6B7280] text-xs mt-1">
            Joined {new Date(profile.created_at).toLocaleDateString('en-KE',{month:'long',year:'numeric'})}
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          {isOwnProfile ? (
            <>
              <button onClick={() => navigate('/edit-profile')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 transition-colors active:scale-95">
                Edit Profile
              </button>
              <button onClick={() => navigate('/premium')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-[#1E6FFF]/40 bg-[#1E6FFF]/10 hover:bg-[#1E6FFF]/20 transition-colors active:scale-95">
                ⭐ Premium
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollowToggle}
                disabled={followBusy}
                aria-label={followButtonConfig.label}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5 ${followButtonConfig.cls}`}
              >
                {followBusy
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <><followButtonConfig.icon size={14} /> {followButtonConfig.label}</>
                }
              </button>
              <button onClick={handleMessage} disabled={messageBusy}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 transition-colors active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-60">
                {messageBusy
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <><MessageCircle size={14} /> Message</>
                }
              </button>
            </>
          )}
        </div>

        {isOwnProfile && (() => {
          const activePlan = getActivePlan(profile);
          const planInfo    = PLANS[activePlan];
          return (
            <div className="mt-4 rounded-2xl border overflow-hidden"
              style={{ borderColor: planInfo?.color + '30', background: planInfo?.color + '08' }}>
              <button onClick={() => navigate('/premium')}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{planInfo?.badge || '⭐'}</span>
                  <div className="text-left">
                    <p className="text-white font-bold text-[14px]">{planInfo?.label || 'Free'} Plan</p>
                    {activePlan !== 'free' && profile?.subscription_expires_at ? (
                      <p className="text-[#6B7280] text-[11px]">
                        Renews {new Date(profile.subscription_expires_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}
                      </p>
                    ) : (
                      <p className="text-[#6B7280] text-[11px]">Tap to upgrade</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/25 rounded-full px-2.5 py-1">
                    <Coins size={12} className="text-yellow-400" />
                    <span className="text-yellow-400 font-bold text-[12px]">{formatNumber(profile?.coins_balance || 0)}</span>
                  </div>
                  <ChevronRight size={16} className="text-[#6B7280]" />
                </div>
              </button>
              <div className="grid grid-cols-4 border-t border-white/[0.06]">
                {[
                  { icon: '⭐', label: 'Plans',   path: '/subscription'  },
                  { icon: '🪙', label: 'Coins',   path: '/coins'         },
                  { icon: '✓',  label: 'Verify',  path: '/verification', active: profile?.is_verified },
                  { icon: '💼', label: 'Business',path: '/business-page', active: profile?.is_business },
                ].map(item => (
                  <button key={item.path} onClick={() => navigate(item.path)}
                    className="flex flex-col items-center gap-1 py-3 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06] last:border-r-0">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-[10px] font-semibold text-white/60">{item.label}</span>
                    {item.active && <div className="w-1 h-1 rounded-full bg-[#1E6FFF]" />}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="border-t border-white/[0.07] flex items-center justify-between px-4">
        <div className="flex">
          {['posts','reposts'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={'py-3 px-4 text-sm font-semibold capitalize transition-all relative ' +
                (tab === t ? 'text-white' : 'text-[#6B7280]')}>
              {t}
              {tab === t && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full" style={{ width:'70%' }} />}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewLayout('list')} aria-label="List view" className={`p-2 rounded-lg ${viewLayout==='list' ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280]'}`}><List size={17} /></button>
          <button onClick={() => setViewLayout('grid')} aria-label="Grid view" className={`p-2 rounded-lg ${viewLayout==='grid' ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280]'}`}><Grid size={17} /></button>
        </div>
      </div>

      {postsLoading && posts.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.filter(p => tab === 'posts' ? !p.is_repost : p.is_repost).length === 0 ? (
        <div className="text-center py-14 px-6">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-white font-bold">No {tab} yet</p>
          {isOwnProfile && tab === 'posts' && (
            <button onClick={() => navigate('/create')}
              className="mt-4 bg-[#1E6FFF] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-lg shadow-[#1E6FFF]/30">
              Create your first post
            </button>
          )}
        </div>
      ) : viewLayout === 'grid' ? (
        <>
          <div className="grid grid-cols-3 gap-0.5 border-t border-white/[0.06]">
            {posts.filter(p => tab === 'posts' ? !p.is_repost : p.is_repost).map(post => (
              <button key={post.id} onClick={() => navigate('/post/' + post.id)}
                className="relative bg-white/5 hover:bg-white/10 transition-colors" style={{ aspectRatio: '1/1' }}>
                {(post.media_urls||[])[0]
                  ? <img src={post.media_urls[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center p-2"><p className="text-white/50 text-[10px] text-center line-clamp-3">{post.caption}</p></div>
                }
              </button>
            ))}
          </div>
          {postsHasMore && (
            <div className="flex justify-center py-4">
              <button onClick={handleLoadMorePosts} disabled={postsLoading}
                className="text-[#1E6FFF] text-sm font-bold disabled:opacity-50">
                {postsLoading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {posts.filter(p => tab === 'posts' ? !p.is_repost : p.is_repost).map(post => (
            <PostCard key={post.id} post={post} currentUser={user} onRefresh={() => loadPosts(profile.id, 0, true)} />
          ))}
          {postsHasMore && (
            <div className="flex justify-center py-4">
              <button onClick={handleLoadMorePosts} disabled={postsLoading}
                className="text-[#1E6FFF] text-sm font-bold disabled:opacity-50">
                {postsLoading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}