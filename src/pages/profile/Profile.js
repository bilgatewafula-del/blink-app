import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/formatNumber';
import { formatTime } from '../../utils/formatTime';
import PostCard from '../../components/PostCard';
import ImageViewer from '../../components/ImageViewer';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getActivePlan, PLANS, formatKES } from '../../utils/paymentUtils';
import {
  ArrowLeft, Settings, UserPlus, UserCheck,
  Grid, List, MoreHorizontal, MessageCircle,
  Coins, ChevronRight, Zap,
} from 'lucide-react';

const POST_SELECT = `
  id, caption, media_urls, video_url, post_type, likes_count,
  comments_count, reposts_count, views_count, is_repost,
  quoted_post_id, created_at, user_id, status, is_draft,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,country,is_verified,role)
`.trim();

export default function Profile() {
  const { username }     = useParams();
  const navigate         = useNavigate();
  const { user, profile: myProfile } = useAuth();

  const [profile,     setProfile]     = useState(null);
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [postsLoading,setPostsLoading]= useState(true);
  const [following,   setFollowing]   = useState(false);
  const [followLoading,setFollowLoading]= useState(false);
  const [tab,         setTab]         = useState('posts');
  const [viewLayout,  setViewLayout]  = useState('list'); // list | grid
  const [imgViewer,   setImgViewer]   = useState(false);
  const [stats,       setStats]       = useState({ followers: 0, following: 0, posts: 0 });
  const [fetchError,  setFetchError]  = useState('');

  // Are we viewing our own profile?
  const isOwnProfile = !username || username === myProfile?.username;
  const viewedId     = isOwnProfile ? user?.id : null;

  useEffect(() => {
    loadProfile();
  }, [username, user?.id]);

  const loadProfile = async () => {
    setLoading(true);
    setPostsLoading(true);
    setFetchError('');

    // Hard timeout — loading MUST resolve within 8s no matter what
    const hardTimeout = setTimeout(() => {
      setLoading(false);
      setFetchError(prev => prev || 'Taking longer than expected. Pull down or tap retry.');
    }, 8000);

    try {
      let profileData = null;

      if (isOwnProfile) {
        const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        profileData = data;
      } else {
        const { data, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
        if (error) throw error;
        profileData = data;
      }

      if (!profileData) {
        clearTimeout(hardTimeout);
        setLoading(false);
        setPostsLoading(false);
        return;
      }

      setProfile(profileData);

      // Fetch real counts — each wrapped so one failure doesn't block the rest
      const safeCount = async (query) => {
        try { const { count } = await query; return count || 0; }
        catch { return null; }
      };

      const [followers, following, posts, isFollowingRes] = await Promise.all([
        safeCount(supabase.from('follows').select('id', { count:'exact', head:true }).eq('following_id', profileData.id)),
        safeCount(supabase.from('follows').select('id', { count:'exact', head:true }).eq('follower_id', profileData.id)),
        safeCount(supabase.from('posts').select('id', { count:'exact', head:true }).eq('user_id', profileData.id).eq('is_draft', false).neq('status','deleted')),
        !isOwnProfile
          ? supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle().catch(() => ({ data:null }))
          : Promise.resolve({ data: null }),
      ]);

      setStats({
        followers: followers ?? profileData.followers_count ?? 0,
        following: following ?? 0,
        posts:     posts     ?? profileData.posts_count ?? 0,
      });

      if (!isOwnProfile && isFollowingRes?.data) setFollowing(true);

      // Best-effort cache write — never blocks the UI if it fails
      if (followers !== null || posts !== null) {
        supabase.from('users').update({
          ...(followers !== null ? { followers_count: followers } : {}),
          ...(posts     !== null ? { posts_count: posts }         : {}),
        }).eq('id', profileData.id).then(() => {}).catch(() => {});
      }

      clearTimeout(hardTimeout);
      setLoading(false);
      loadPosts(profileData.id);

    } catch (err) {
      console.error('loadProfile error:', err.message);
      clearTimeout(hardTimeout);
      setLoading(false);
      setPostsLoading(false);
      setFetchError(err.message || 'Could not load profile.');
    }
  };

  const loadPosts = async (uid) => {
    setPostsLoading(true);
    const { data, error } = await supabase.from('posts')
      .select(POST_SELECT)
      .eq('user_id', uid)
      .eq('is_draft', false)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) console.error('Profile posts error:', error.message);
    setPosts((data || []).map(p => ({ ...p, users: p['users!posts_user_id_fkey'] || p.users })));
    setPostsLoading(false);
  };

  const handleFollow = async () => {
    if (!profile?.id || followLoading) return;
    setFollowLoading(true);

    if (following) {
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', profile.id);
      setFollowing(false);
      setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
    } else {
      await supabase.from('follows').upsert(
        { follower_id: user.id, following_id: profile.id, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      );
      setFollowing(true);
      setStats(s => ({ ...s, followers: s.followers + 1 }));

      // Notify
      await supabase.from('notifications').insert({
        user_id:      profile.id,
        from_user_id: user.id,
        type:         'follow',
        message:      'started following you',
        is_read:      false,
      });
    }

    setFollowLoading(false);
  };

  const handleMessage = () => navigate('/chats');

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );

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

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* ImageViewer for avatar */}
      {imgViewer && profile.avatar_url && (
        <ImageViewer
          images={[profile.avatar_url]}
          index={0}
          onClose={() => setImgViewer(false)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors flex-shrink-0">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-white font-bold text-[15px] leading-none truncate">{profile.display_name}</p>
          <p className="text-[#6B7280] text-xs mt-0.5">{formatNumber(stats.posts)} posts</p>
        </div>
        {isOwnProfile ? (
          <button onClick={() => navigate('/settings')} className="text-[#6B7280] hover:text-white flex-shrink-0"><Settings size={20} /></button>
        ) : (
          <button className="text-[#6B7280] hover:text-white flex-shrink-0"><MoreHorizontal size={20} /></button>
        )}
      </div>

      {/* Avatar + info */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Avatar — tap to view full screen */}
          <button
            onClick={() => profile.avatar_url && setImgViewer(true)}
            className="relative flex-shrink-0"
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-2 border-white/20"
              />
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

          {/* Stats */}
          <div className="flex-1 flex justify-around">
            {[
              { label:'Posts',     value: stats.posts },
              { label:'Followers', value: stats.followers },
              { label:'Following', value: stats.following },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-white font-black text-xl leading-none">{formatNumber(s.value)}</p>
                <p className="text-[#6B7280] text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Name + badge */}
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-black text-[17px]">{profile.display_name}</p>
            {profile.is_verified && <VerifiedBadge size={16} />}
            {roleIcon && <span className="text-base">{roleIcon}</span>}
            {profile.is_business && (
              <span className="bg-yellow-500/20 text-yellow-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-yellow-500/30">💼 Business</span>
            )}
          </div>
          <p className="text-[#6B7280] text-sm">@{profile.username}</p>
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

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          {isOwnProfile ? (
            <>
              <button
                onClick={() => navigate('/edit-profile')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 transition-colors active:scale-95"
              >
                Edit Profile
              </button>
              <button
                onClick={() => navigate('/premium')}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-[#1E6FFF]/40 bg-[#1E6FFF]/10 hover:bg-[#1E6FFF]/20 transition-colors active:scale-95"
              >
                ⭐ Premium
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={'flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5 ' +
                  (following
                    ? 'border border-white/20 bg-white/[0.06] text-white hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                    : 'text-white bg-[#1E6FFF] hover:bg-[#1565cc] shadow-lg shadow-[#1E6FFF]/30')}
              >
                {followLoading
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : following
                    ? <><UserCheck size={14} /> Following</>
                    : <><UserPlus size={14} /> Follow</>
                }
              </button>
              <button
                onClick={handleMessage}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white border border-white/20 bg-white/[0.06] hover:bg-white/10 transition-colors active:scale-95 flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={14} /> Message
              </button>
            </>
          )}
        </div>

        {/* ── Monetisation panel — own profile only ── */}
        {isOwnProfile && (() => {
          const activePlan = getActivePlan(profile);
          const planInfo    = PLANS[activePlan];
          return (
            <div className="mt-4 rounded-2xl border overflow-hidden"
              style={{ borderColor: planInfo?.color + '30', background: planInfo?.color + '08' }}>

              {/* Plan + coins row */}
              <button
                onClick={() => navigate('/premium')}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.04] transition-colors"
              >
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

              {/* Quick links row */}
              <div className="grid grid-cols-4 border-t border-white/[0.06]">
                {[
                  { icon: '⭐', label: 'Plans',   path: '/subscription'  },
                  { icon: '🪙', label: 'Coins',   path: '/coins'         },
                  { icon: '✓',  label: 'Verify',  path: '/verification', active: profile?.is_verified },
                  { icon: '💼', label: 'Business',path: '/business-page', active: profile?.is_business },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="flex flex-col items-center gap-1 py-3 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06] last:border-r-0"
                  >
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

      {/* Posts tab header */}
      <div className="border-t border-white/[0.07] flex items-center justify-between px-4">
        <div className="flex">
          {['posts','reposts'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={'py-3 px-4 text-sm font-semibold capitalize transition-all relative ' +
                (tab === t ? 'text-white' : 'text-[#6B7280]')}>
              {t}
              {tab === t && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] bg-[#1E6FFF] rounded-full" style={{ width:'70%' }} />
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewLayout('list')} className={`p-2 rounded-lg ${viewLayout==='list' ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280]'}`}><List size={17} /></button>
          <button onClick={() => setViewLayout('grid')} className={`p-2 rounded-lg ${viewLayout==='grid' ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280]'}`}><Grid size={17} /></button>
        </div>
      </div>

      {/* Posts */}
      {postsLoading ? (
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
        <div className="grid grid-cols-3 gap-0.5 border-t border-white/[0.06]">
          {posts.filter(p => tab === 'posts' ? !p.is_repost : p.is_repost).map(post => (
            <button key={post.id} onClick={() => navigate('/post/' + post.id)}
              className="relative bg-white/5 hover:bg-white/10 transition-colors"
              style={{ aspectRatio: '1/1' }}>
              {(post.media_urls||[])[0]
                ? <img src={post.media_urls[0]} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center p-2">
                    <p className="text-white/50 text-[10px] text-center line-clamp-3">{post.caption}</p>
                  </div>
              }
            </button>
          ))}
        </div>
      ) : (
        posts.filter(p => tab === 'posts' ? !p.is_repost : p.is_repost).map(post => (
          <PostCard key={post.id} post={post} currentUser={user} onRefresh={() => loadPosts(profile.id)} />
        ))
      )}
    </div>
  );
}