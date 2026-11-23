import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Hash } from 'lucide-react';
import PostCard from '../../components/PostCard';
import { PostCardSkeleton } from '../../components/Skeleton';
import { formatNumber } from '../../utils/formatNumber';
import { goBack } from '../../lib/nav';

const HashtagFeed = () => {
  const { tag } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hashtagInfo, setHashtagInfo] = useState(null);
  const [activeSort, setActiveSort] = useState('recent');

  useEffect(() => {
    fetchHashtag();
    fetchPosts('recent');
  }, [tag]);

  const fetchHashtag = async () => {
    const { data } = await supabase
      .from('hashtags')
      .select('*')
      .eq('tag', tag.toLowerCase())
      .single();
    setHashtagInfo(data);
  };

  const fetchPosts = async (sort) => {
    setLoading(true);
    let query = supabase
      .from('posts')
      .select('*, users(id, username, display_name, avatar_url, country, is_verified)')
      .is('video_url', null)                      // videos are in B-Flash, not here
      .eq('is_draft', false)
      .eq('audience', 'public')
      .contains('hashtags', [tag.toLowerCase()]);

    if (sort === 'recent') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'top') {
      query = query.order('likes_count', { ascending: false });
    }

    const { data } = await query.limit(30);
    setPosts(data || []);
    setLoading(false);
  };

  const handleSort = (sort) => {
    setActiveSort(sort);
    fetchPosts(sort);
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E2E8F0] px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => goBack(navigate, '/discover')} className="text-[#64748B] hover:text-[#202938] transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#F97316]/20 rounded-full flex items-center justify-center">
                <Hash size={16} className="text-[#EA580C]" />
              </div>
              <h1 className="text-[#202938] font-bold text-xl">#{tag}</h1>
            </div>
            {hashtagInfo && (
              <p className="text-[#64748B] text-xs mt-0.5 ml-10">
                {formatNumber(hashtagInfo.post_count)} posts
              </p>
            )}
          </div>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1 bg-[#F8FAFC] rounded-xl p-1">
          {[
            { key: 'recent', label: '🕐 Recent' },
            { key: 'top', label: '🔥 Top' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleSort(tab.key)}
              className={
                'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                (activeSort === tab.key
                  ? 'bg-[#F97316] text-white  '
                  : 'text-[#64748B] hover:text-white')
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        <div>
          {Array(3).fill(0).map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-20 gap-4 px-6">
          <div className="w-16 h-16 bg-[#F97316]/20 rounded-full flex items-center justify-center">
            <Hash size={28} className="text-[#EA580C]" />
          </div>
          <h2 className="text-[#202938] font-bold text-xl text-center">No posts yet</h2>
          <p className="text-[#64748B] text-sm text-center">
            Be the first to use #{tag} in a post.
          </p>
          <button
            onClick={() => navigate('/create')}
            className="bg-[#F97316] text-white px-6 py-3 rounded-full font-bold text-sm  "
          >
            Create Post
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={user}
              onRefresh={() => fetchPosts(activeSort)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HashtagFeed;