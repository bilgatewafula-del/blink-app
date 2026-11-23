import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Grid, MoreHorizontal,
  UserX, Flag, Link, MessageCircle,
  BadgeCheck, UserCheck, Users
} from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { formatTime } from '../../utils/formatTime';
import SwipeBack from '../../components/SwipeBack';
import { ProfileSkeleton } from '../../components/Skeleton';
import { goBack } from '../../lib/nav';

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

const OtherProfile = () => {
  const { username } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [mutualFollowers, setMutualFollowers] = useState([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState([]);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const fetchProfile = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (!data) { setLoading(false); return; }
    setProfile(data);
    setFollowerCount(data.follower_count || 0);
    setFollowingCount(data.following_count || 0);
    fetchPosts(data.id);
    checkFollowStatus(data.id);
    checkIfFollowingMe(data.id);
    fetchMutualFollowers(data.id);
    fetchSuggested(data.id);
  };

  const fetchPosts = async (userId) => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_draft', false)
      .eq('audience', 'public')
      .order('created_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);
  };

  const checkFollowStatus = async (targetId) => {
    const { data } = await supabase
      .from('follows')
      .select('status')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .single();
    setFollowStatus(data?.status || null);
  };

  const checkIfFollowingMe = async (targetId) => {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', targetId)
      .eq('following_id', user.id)
      .eq('status', 'accepted')
      .single();
    setIsFollowingMe(!!data);
  };

  const fetchMutualFollowers = async (targetId) => {
    const { data: myFollowing } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('status', 'accepted');

    const { data: theirFollowers } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', targetId)
      .eq('status', 'accepted');

    if (!myFollowing || !theirFollowers) return;

    const myFollowingIds = new Set(myFollowing.map((f) => f.following_id));
    const mutualIds = theirFollowers
      .map((f) => f.follower_id)
      .filter((id) => myFollowingIds.has(id))
      .slice(0, 3);

    if (mutualIds.length > 0) {
      const { data: mutualUsers } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .in('id', mutualIds);
      setMutualFollowers(mutualUsers || []);
    }
  };

  const fetchSuggested = async (targetId) => {
    const { data } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, follower_count')
      .neq('id', user.id)
      .neq('id', targetId)
      .order('follower_count', { ascending: false })
      .limit(5);
    setSuggestedUsers(data || []);
  };

  const fetchFollowersList = async () => {
    const { data } = await supabase
      .from('follows')
      .select('follower:follower_id(id, username, display_name, avatar_url, is_verified)')
      .eq('following_id', profile.id)
      .eq('status', 'accepted');
    setFollowers(data?.map((f) => f.follower) || []);
  };

  const fetchFollowingList = async () => {
    const { data } = await supabase
      .from('follows')
      .select('following:following_id(id, username, display_name, avatar_url, is_verified)')
      .eq('follower_id', profile.id)
      .eq('status', 'accepted');
    setFollowing(data?.map((f) => f.following) || []);
  };

  const handleFollow = async () => {
    if (followLoading || !profile) return;
    setFollowLoading(true);

    if (followStatus === 'accepted') {
      // Unfollow
      setFollowStatus(null);
      setFollowerCount((c) => Math.max(0, c - 1));
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', profile.id);
      await supabase.from('users')
        .update({ follower_count: Math.max(0, followerCount - 1) })
        .eq('id', profile.id);
    } else if (followStatus === 'pending') {
      // Cancel request
      setFollowStatus(null);
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', profile.id);
    } else {
      // Follow or request
      const status = profile.is_private ? 'pending' : 'accepted';
      setFollowStatus(status);
      if (status === 'accepted') setFollowerCount((c) => c + 1);
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: profile.id,
        status,
      });
      if (status === 'accepted') {
        await supabase.from('users')
          .update({ follower_count: followerCount + 1 })
          .eq('id', profile.id);
      }
      await supabase.from('notifications').insert({
        user_id: profile.id,
        from_user_id: user.id,
        type: status === 'pending' ? 'follow_request' : 'follow',
        message: status === 'pending' ? 'wants to follow you' : 'started following you',
        is_read: false,
      });
    }
    setFollowLoading(false);
  };

  const handleMessage = async () => {
    const { data: existingChats } = await supabase
      .from('chats')
      .select('id, participants')
      .contains('participants', [user.id]);
    const existing = existingChats?.find((c) => c.participants.includes(profile.id));
    if (existing) { navigate('/chats/' + existing.id); return; }
    const { data } = await supabase
      .from('chats')
      .insert({ participants: [user.id, profile.id] })
      .select().single();
    if (data) navigate('/chats/' + data.id);
  };

  const getFollowButtonContent = () => {
    if (followStatus === 'accepted') {
      return {
        label: isFollowingMe ? '✓ Friends' : '✓ Following',
        style: 'bg-[#F1F5F9] border border-[#E2E8F0] text-[#202938]',
      };
    }
    if (followStatus === 'pending') {
      return { label: 'Requested', style: 'bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]' };
    }
    if (isFollowingMe) {
      return {
        label: 'Follow Back',
        style: 'bg-[#F97316] text-white  ',
      };
    }
    return {
      label: '+ Follow',
      style: 'bg-[#F97316] text-white  ',
    };
  };

  if (loading) return <ProfileSkeleton />;

  if (!profile) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-5xl">👤</p>
      <p className="text-[#202938] font-bold text-xl">User not found</p>
      <button onClick={() => goBack(navigate, '/')} className="text-[#EA580C] text-sm">Go back</button>
    </div>
  );

  const isPrivateAndNotFollowing = profile.is_private && followStatus !== 'accepted';
  const { label: followLabel, style: followStyle } = getFollowButtonContent();

  return (
    <SwipeBack>
      <div className="min-h-screen bg-white pb-24">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between">
          <button onClick={() => goBack(navigate, '/')} className="text-[#64748B] hover:text-[#202938] transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-[#202938] font-bold text-base">@{profile.username}</h1>
            {profile.is_verified && (
              <span className="bg-[#F97316] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="text-[#64748B] hover:text-[#202938] transition-colors"
            >
              <MoreHorizontal size={22} />
            </button>
            {showOptions && (
              <div className="absolute right-0 top-8 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden z-50 w-52 shadow-2xl">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + '/profile/' + profile.username);
                    setShowOptions(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[#202938] hover:bg-[#F8FAFC] text-sm border-b border-[#E2E8F0]"
                >
                  <Link size={16} /> Copy Profile Link
                </button>
                <button
                  onClick={() => setShowOptions(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[#202938] hover:bg-[#F8FAFC] text-sm border-b border-[#E2E8F0]"
                >
                  <Flag size={16} /> Report @{profile.username}
                </button>
                <button
                  onClick={() => setShowOptions(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-500/10 text-sm"
                >
                  <UserX size={16} /> Block @{profile.username}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cover */}
        <div className="relative">
          <div className="h-36 bg-gradient-to-br from-[#F97316]/40 via-[#F97316]/30 to-[#FFB020]/20 overflow-hidden">
            {profile.cover_url && (
              <img src={profile.cover_url} alt="cover" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="absolute -bottom-14 left-4">
            <div className="p-1 bg-[#F8FAFC] rounded-full">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#F97316] flex items-center justify-center text-white font-bold text-3xl">
                  {profile.display_name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile info */}
        <div className="mt-16 px-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[#202938] font-bold text-xl">{profile.display_name}</h2>
                {profile.is_verified && <BadgeCheck size={20} className="text-[#EA580C]" />}
                <span className="text-xl">{flagMap[profile.country] || '🌍'}</span>
                {profile.is_private && (
                  <span className="bg-[#F1F5F9] text-[#64748B] text-[10px] px-2 py-0.5 rounded-full">🔒 Private</span>
                )}
              </div>
              <p className="text-[#64748B] text-sm">@{profile.username}</p>
              {/* Follows you badge */}
              {isFollowingMe && (
                <span className="inline-flex items-center gap-1 bg-[#F1F5F9] text-[#64748B] text-[10px] px-2 py-0.5 rounded-full mt-1">
                  <UserCheck size={10} /> Follows you
                </span>
              )}
            </div>
          </div>

          {profile.bio && (
            <p className="text-[#202938] text-sm mb-2 leading-relaxed">{profile.bio}</p>
          )}

         {profile.bio && (
  <p className="text-[#202938] text-sm mb-2 leading-relaxed">
    {profile.bio}
  </p>
)}

{profile.website && (
  <a
    href={profile.website}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-1.5 text-[#EA580C] text-sm mb-3 hover:underline w-fit"
  >
    🔗 {profile.website.replace('https://', '')}
  </a>
)}

          {/* Mutual followers */}
          {mutualFollowers.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex -space-x-2">
                {mutualFollowers.slice(0, 3).map((mf) => (
                  <div key={mf.id} className="w-5 h-5 rounded-full border border-[#E2E8F0] overflow-hidden bg-[#F97316]">
                    {mf.avatar_url && <img src={mf.avatar_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                ))}
              </div>
              <p className="text-[#64748B] text-xs">
                Followed by <span className="text-[#202938] font-semibold">{mutualFollowers[0]?.display_name}</span>
                {mutualFollowers.length > 1 && ' and ' + (mutualFollowers.length - 1) + ' others you follow'}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-3 mb-4">
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={'flex-1 py-2.5 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-70 ' + followStyle}
            >
              {followLoading ? '...' : followLabel}
            </button>
            <button
              onClick={handleMessage}
              className="flex-1 py-2.5 rounded-full font-bold text-sm bg-[#F1F5F9] border border-[#E2E8F0] text-[#202938] hover:bg-[#E2E8F0] transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Message
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-6 pb-4 border-b border-[#E2E8F0]">
            <div className="text-center">
              <p className="text-[#202938] font-bold text-lg">{posts.length}</p>
              <p className="text-[#64748B] text-xs">Posts</p>
            </div>
            <button
              onClick={() => {
                if (!isPrivateAndNotFollowing) { fetchFollowersList(); setShowFollowers(true); }
              }}
              className="text-center hover:opacity-80 transition-opacity"
            >
              <p className="text-[#202938] font-bold text-lg">{formatNumber(followerCount)}</p>
              <p className="text-[#64748B] text-xs">Followers</p>
            </button>
            <button
              onClick={() => {
                if (!isPrivateAndNotFollowing) { fetchFollowingList(); setShowFollowing(true); }
              }}
              className="text-center hover:opacity-80 transition-opacity"
            >
              <p className="text-[#202938] font-bold text-lg">{formatNumber(followingCount)}</p>
              <p className="text-[#64748B] text-xs">Following</p>
            </button>
          </div>
        </div>

        {/* Tab */}
        <div className="flex border-b border-[#E2E8F0] sticky top-14 bg-white z-20">
          <button className="flex-1 flex items-center justify-center gap-2 py-3.5 border-b-2 border-[#F97316] text-[#EA580C] text-sm font-semibold">
            <Grid size={16} /> Posts
          </button>
        </div>

        {/* Posts grid or private lock */}
        {isPrivateAndNotFollowing ? (
          <div className="flex flex-col items-center justify-center mt-16 gap-4 px-6">
            <div className="w-20 h-20 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center">
              <span className="text-4xl">🔒</span>
            </div>
            <h3 className="text-[#202938] font-bold text-xl">This account is private</h3>
            <p className="text-[#64748B] text-sm text-center">
              Follow @{profile.username} to see their photos and posts.
            </p>
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className="bg-[#F97316] text-white px-8 py-3 rounded-full font-bold text-sm   disabled:opacity-50"
            >
              {followStatus === 'pending' ? 'Request Sent' : '+ Follow'}
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-16 gap-3 px-6">
            <div className="text-5xl">📸</div>
            <h3 className="text-[#202938] font-bold text-lg">No posts yet</h3>
            <p className="text-[#64748B] text-sm text-center">
              {profile.display_name} hasn't posted anything yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate('/post/' + post.id)}
                className="aspect-square cursor-pointer hover:opacity-80 transition-opacity relative overflow-hidden group bg-white"
              >
                {post.media_urls?.length > 0 ? (
                  <img
                    src={post.media_urls[0]}
                    alt="post"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div
                    style={{ background: post.bg_color || '#FFFFFF' }}
                    className="w-full h-full flex items-center justify-center p-2"
                  >
                    <p className="text-[#202938] text-xs text-center font-semibold line-clamp-4 leading-relaxed">
                      {post.caption}
                    </p>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <span className="text-[#202938] text-xs font-bold">❤️ {post.likes_count || 0}</span>
                  <span className="text-[#202938] text-xs font-bold">💬 {post.comments_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggested users */}
        {!isPrivateAndNotFollowing && suggestedUsers.length > 0 && (
          <div className="px-4 mt-6 pb-6">
            <p className="text-[#202938] font-bold text-sm mb-3">👥 People you may know</p>
            <div className="space-y-3">
              {suggestedUsers.map((su) => (
                <div key={su.id} className="flex items-center gap-3">
                  <button onClick={() => navigate('/profile/' + su.username)} className="flex-shrink-0">
                    {su.avatar_url ? (
                      <img src={su.avatar_url} alt={su.display_name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#F97316] flex items-center justify-center text-white font-bold">
                        {su.display_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </button>
                  <button onClick={() => navigate('/profile/' + su.username)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[#202938] font-semibold text-sm truncate">{su.display_name}</p>
                      {su.is_verified && <span className="bg-[#F97316] text-white text-[8px] px-1 py-0.5 rounded-full font-bold">✓</span>}
                    </div>
                    <p className="text-[#64748B] text-xs">@{su.username}</p>
                  </button>
                  <button
                    onClick={() => navigate('/profile/' + su.username)}
                    className="text-xs text-[#EA580C] border border-[#F97316]/40 px-3 py-1.5 rounded-full font-bold hover:bg-[#F97316]/10 transition-colors flex-shrink-0"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Followers modal */}
        {showFollowers && (
          <UserListModal
            title={'Followers · ' + formatNumber(followerCount)}
            users={followers}
            currentUserId={user.id}
            onClose={() => setShowFollowers(false)}
            onNavigate={(uname) => { setShowFollowers(false); navigate('/profile/' + uname); }}
          />
        )}

        {/* Following modal */}
        {showFollowing && (
          <UserListModal
            title={'Following · ' + formatNumber(followingCount)}
            users={following}
            currentUserId={user.id}
            onClose={() => setShowFollowing(false)}
            onNavigate={(uname) => { setShowFollowing(false); navigate('/profile/' + uname); }}
          />
        )}
      </div>
    </SwipeBack>
  );
};

const UserListModal = ({ title, users, currentUserId, onClose, onNavigate }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center">
    <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl max-h-[70vh] overflow-hidden flex flex-col slide-up">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] flex-shrink-0">
        <h2 className="text-[#202938] font-bold text-lg">{title}</h2>
        <button onClick={onClose} className="text-[#64748B] hover:text-[#202938] text-2xl leading-none">✕</button>
      </div>
      <div className="overflow-y-auto flex-1">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-4xl">👥</p>
            <p className="text-[#64748B] text-sm">No users yet</p>
          </div>
        ) : (
          users.map((u) => (
            <button
              key={u.id}
              onClick={() => onNavigate(u.username)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#F8FAFC] transition-colors border-b border-[#E2E8F0]"
            >
              <div className="flex-shrink-0">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={u.display_name} className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[#F97316] flex items-center justify-center text-white font-bold">
                    {u.display_name?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[#202938] font-bold text-sm truncate">{u.display_name}</p>
                  {u.is_verified && (
                    <span className="bg-[#F97316] text-white text-[8px] px-1 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
                  )}
                </div>
                <p className="text-[#64748B] text-xs">@{u.username}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  </div>
);

export default OtherProfile;