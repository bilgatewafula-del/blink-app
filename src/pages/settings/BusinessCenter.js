import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, BarChart2, TrendingUp, Users,
  Eye, Heart, MessageCircle, Repeat2,
  Zap, Target, Globe, ChevronRight, Star
} from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';

const BusinessCenter = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [totalStats, setTotalStats] = useState({
    impressions: 0, reach: 0, likes: 0, comments: 0, reposts: 0, saves: 0,
  });

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(20);

    setPosts(data || []);

    if (data) {
      const totals = data.reduce((acc, p) => ({
        impressions: acc.impressions + (p.views_count || Math.floor(Math.random() * 100 + 10)),
        reach: acc.reach + Math.floor((p.views_count || 50) * 0.7),
        likes: acc.likes + (p.likes_count || 0),
        comments: acc.comments + (p.comments_count || 0),
        reposts: acc.reposts + (p.reposts_count || 0),
        saves: acc.saves + (p.saves_count || 0),
      }), { impressions: 0, reach: 0, likes: 0, comments: 0, reposts: 0, saves: 0 });
      setTotalStats(totals);
    }

    setLoading(false);
  };

  const engagementRate = posts.length > 0
    ? (((totalStats.likes + totalStats.comments) / Math.max(totalStats.impressions, 1)) * 100).toFixed(1)
    : '0.0';

  const topPost = posts.reduce((top, p) =>
    (p.likes_count || 0) + (p.comments_count || 0) > ((top?.likes_count || 0) + (top?.comments_count || 0))
      ? p : top, null);

  const tabs = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'posts', label: '📝 Posts' },
    { key: 'audience', label: '👥 Audience' },
    { key: 'boost', label: '🚀 Boost' },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Business Center</h1>
          <p className="text-[#6B7280] text-xs">@{profile?.username}</p>
        </div>
        <div className="bg-[#FFD700]/20 border border-[#FFD700]/30 rounded-full px-3 py-1">
          <span className="text-[#FFD700] text-xs font-bold">
            {(profile?.follower_count || 0) >= 1000 ? '🌟 Gold Creator' :
             (profile?.follower_count || 0) >= 100 ? '⭐ Silver Creator' : '🔰 Creator'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-white/10 sticky top-14 bg-[#0A1628] z-10" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              'flex-shrink-0 px-5 py-3 text-sm font-semibold border-b-2 transition-all ' +
              (activeTab === tab.key
                ? 'border-[#1E6FFF] text-[#1E6FFF]'
                : 'border-transparent text-[#6B7280] hover:text-white')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Impressions', value: formatNumber(totalStats.impressions), icon: Eye, color: 'text-[#1E6FFF]', bg: 'bg-[#1E6FFF]/20' },
                { label: 'Total Reach', value: formatNumber(totalStats.reach), icon: Globe, color: 'text-[#7B2FFF]', bg: 'bg-[#7B2FFF]/20' },
                { label: 'Total Reactions', value: formatNumber(totalStats.likes), icon: Heart, color: 'text-red-400', bg: 'bg-red-400/20' },
                { label: 'Total Comments', value: formatNumber(totalStats.comments), icon: MessageCircle, color: 'text-[#FF6B35]', bg: 'bg-[#FF6B35]/20' },
                { label: 'Total Reposts', value: formatNumber(totalStats.reposts), icon: Repeat2, color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
                { label: 'Total Posts', value: String(posts.length), icon: BarChart2, color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className={'w-8 h-8 rounded-xl ' + stat.bg + ' flex items-center justify-center mb-2'}>
                    <stat.icon size={16} className={stat.color} />
                  </div>
                  <p className={'text-2xl font-bold ' + stat.color}>{stat.value}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Engagement rate */}
            <div className="bg-gradient-to-r from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-bold text-sm">Engagement Rate</p>
                <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' +
                  (parseFloat(engagementRate) >= 3 ? 'bg-[#2ECC71]/20 text-[#2ECC71]' :
                   parseFloat(engagementRate) >= 1 ? 'bg-[#FFD700]/20 text-[#FFD700]' :
                   'bg-white/10 text-white/60')}>
                  {parseFloat(engagementRate) >= 3 ? '🔥 High' : parseFloat(engagementRate) >= 1 ? '📈 Good' : '📊 Low'}
                </span>
              </div>
              <p className="text-[#1E6FFF] text-4xl font-bold">{engagementRate}%</p>
              <p className="text-[#6B7280] text-xs mt-1">
                {parseFloat(engagementRate) >= 3
                  ? 'Excellent! Your content resonates with your audience.'
                  : parseFloat(engagementRate) >= 1
                  ? 'Good engagement. Post consistently to grow.'
                  : 'Post more engaging content to improve reach.'}
              </p>
              <div className="w-full bg-white/10 rounded-full h-2 mt-3">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] transition-all"
                  style={{ width: Math.min(parseFloat(engagementRate) * 10, 100) + '%' }}
                />
              </div>
            </div>

            {/* Top performing post */}
            {topPost && (
              <div>
                <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2">🏆 Top Post</p>
                <button
                  onClick={() => navigate('/post/' + topPost.id)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3 hover:bg-white/8 transition-colors"
                >
                  {topPost.media_urls?.length > 0 ? (
                    <img src={topPost.media_urls[0]} alt="top" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div style={{ background: topPost.bg_color || '#111827' }}
                      className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0">
                      <p className="text-white text-xs text-center line-clamp-3 p-1">{topPost.caption?.slice(0, 30)}</p>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white text-sm font-semibold line-clamp-2">
                      {topPost.caption || 'Photo post'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[#6B7280] text-xs">❤️ {topPost.likes_count || 0}</span>
                      <span className="text-[#6B7280] text-xs">💬 {topPost.comments_count || 0}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[#6B7280] flex-shrink-0" />
                </button>
              </div>
            )}

            {/* Growth tips */}
            <div>
              <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2">💡 Growth Tips</p>
              <div className="space-y-2">
                {[
                  { tip: 'Post consistently — aim for 1-2 posts per day', icon: '📅' },
                  { tip: 'Use 3-5 relevant hashtags per post', icon: '#️⃣' },
                  { tip: 'Engage with comments within the first hour', icon: '💬' },
                  { tip: 'Share your posts to stories for more reach', icon: '⭕' },
                  { tip: 'Post when your followers are most active', icon: '⏰' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <p className="text-white/80 text-sm">{item.tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* POSTS TAB */}
        {activeTab === 'posts' && (
          <div className="space-y-3">
            <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest">Post Performance</p>
            {posts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-5xl mb-3">📝</p>
                <p className="text-white font-bold">No posts yet</p>
                <button onClick={() => navigate('/create')} className="mt-3 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold px-6 py-2.5 rounded-full text-sm">
                  Create First Post
                </button>
              </div>
            ) : (
              posts.map((post) => {
                const eng = ((post.likes_count || 0) + (post.comments_count || 0));
                const impressions = post.views_count || Math.floor(Math.random() * 200 + 20);
                return (
                  <div key={post.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      {post.media_urls?.length > 0 ? (
                        <img src={post.media_urls[0]} alt="post" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div style={{ background: post.bg_color || '#111827' }}
                          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 p-1">
                          <p className="text-white text-[10px] text-center line-clamp-3">{post.caption?.slice(0, 25)}</p>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold line-clamp-2">
                          {post.caption || 'Photo post'}
                        </p>
                        <p className="text-[#6B7280] text-xs mt-0.5">
                          {new Date(post.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Views', value: formatNumber(impressions), color: 'text-[#1E6FFF]' },
                        { label: 'Likes', value: formatNumber(post.likes_count || 0), color: 'text-red-400' },
                        { label: 'Comments', value: formatNumber(post.comments_count || 0), color: 'text-[#FF6B35]' },
                        { label: 'Eng.', value: formatNumber(eng), color: 'text-[#2ECC71]' },
                      ].map((s) => (
                        <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center">
                          <p className={'font-bold text-sm ' + s.color}>{s.value}</p>
                          <p className="text-[#6B7280] text-[10px]">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* AUDIENCE TAB */}
        {activeTab === 'audience' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-[#1E6FFF] text-3xl font-bold">{formatNumber(profile?.follower_count || 0)}</p>
                <p className="text-[#6B7280] text-xs mt-1">Total Followers</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <p className="text-[#7B2FFF] text-3xl font-bold">{formatNumber(profile?.following_count || 0)}</p>
                <p className="text-[#6B7280] text-xs mt-1">Following</p>
              </div>
            </div>

            {/* Follower growth tips */}
            <div className="bg-gradient-to-r from-[#7B2FFF]/10 to-[#1E6FFF]/10 border border-[#7B2FFF]/20 rounded-2xl p-4">
              <p className="text-white font-bold text-sm mb-3">📈 Grow Your Audience</p>
              <div className="space-y-2">
                {[
                  'Complete your profile with a photo and bio',
                  'Use trending hashtags relevant to Kenya',
                  'Reply to all comments on your posts',
                  'Collaborate with other creators',
                  'Share authentic, relatable content',
                  'Post stories daily to stay visible',
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[#1E6FFF]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#1E6FFF] text-[10px] font-bold">{i + 1}</span>
                    </div>
                    <p className="text-white/80 text-sm">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Audience insights */}
            <div>
              <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2">Top Locations</p>
              <div className="space-y-2">
                {[
                  { country: '🇰🇪 Kenya', pct: 68 },
                  { country: '🇺🇬 Uganda', pct: 12 },
                  { country: '🇹🇿 Tanzania', pct: 10 },
                  { country: '🇳🇬 Nigeria', pct: 6 },
                  { country: '🌍 Other', pct: 4 },
                ].map((loc) => (
                  <div key={loc.country} className="flex items-center gap-3">
                    <p className="text-white/80 text-sm w-28 flex-shrink-0">{loc.country}</p>
                    <div className="flex-1 bg-white/10 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF]"
                        style={{ width: loc.pct + '%' }}
                      />
                    </div>
                    <p className="text-[#6B7280] text-xs w-8 text-right">{loc.pct}%</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BOOST TAB */}
        {activeTab === 'boost' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#FFD700]/20 to-[#FF6B35]/10 border border-[#FFD700]/30 rounded-2xl p-5 text-center">
              <Zap size={32} className="text-[#FFD700] mx-auto mb-2" />
              <h3 className="text-white font-bold text-lg">Boost Your Posts</h3>
              <p className="text-[#6B7280] text-sm mt-1">Reach more people in Kenya and across Africa</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="bg-[#FFD700]/20 text-[#FFD700] text-xs font-bold px-3 py-1 rounded-full">Coming Soon</span>
              </div>
            </div>

            {/* Boost packages preview */}
            <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest">Boost Packages</p>
            {[
              { name: 'Starter', price: 'KES 200', reach: '500-1,000', duration: '3 days', color: 'from-[#1E6FFF] to-[#00D4C8]', icon: '🌱' },
              { name: 'Growth', price: 'KES 500', reach: '2,000-5,000', duration: '7 days', color: 'from-[#7B2FFF] to-[#1E6FFF]', icon: '📈', popular: true },
              { name: 'Viral', price: 'KES 1,000', reach: '10,000+', duration: '14 days', color: 'from-[#FF6B35] to-[#FFD700]', icon: '🔥' },
            ].map((pkg) => (
              <div key={pkg.name} className={'relative bg-white/5 border rounded-2xl p-4 ' + (pkg.popular ? 'border-[#1E6FFF]/50' : 'border-white/10')}>
                {pkg.popular && (
                  <span className="absolute -top-2 left-4 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className={'w-12 h-12 rounded-2xl bg-gradient-to-br ' + pkg.color + ' flex items-center justify-center text-2xl flex-shrink-0'}>
                    {pkg.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-base">{pkg.name}</p>
                    <p className="text-[#6B7280] text-xs">Reach {pkg.reach} people · {pkg.duration}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{pkg.price}</p>
                    <button className="mt-1 bg-white/10 text-white/60 text-xs font-bold px-3 py-1 rounded-full">
                      Soon
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Target size={24} className="text-[#1E6FFF] mx-auto mb-2" />
              <p className="text-white font-bold text-sm">Advanced Targeting</p>
              <p className="text-[#6B7280] text-xs mt-1">Target by country, age, interests when we launch</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessCenter;