import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Plus, Zap } from 'lucide-react';
import VibePlayer from './VibePlayer';

const CATEGORY_CONFIG = {
  all: { emoji: '⚡', label: 'For You' },
  street: { emoji: '🔥', label: 'Street' },
  music: { emoji: '🎵', label: 'Music' },
  comedy: { emoji: '😂', label: 'Comedy' },
  dance: { emoji: '💃', label: 'Dance' },
  food: { emoji: '🍲', label: 'Food' },
  sports: { emoji: '⚽', label: 'Sports' },
  knowledge: { emoji: '💡', label: 'Learn' },
  faith: { emoji: '🙏', label: 'Faith' },
};

const VibesFeed = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [vibes, setVibes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTab, setActiveTab] = useState('foryou');
  const [showComments, setShowComments] = useState(false);
  const containerRef = useRef();
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    fetchVibes();
  }, [activeCategory, activeTab]);

  const fetchVibes = async () => {
    setLoading(true);
    let query = supabase
      .from('vibes')
      .select('*, users:user_id(id, username, display_name, avatar_url, is_verified, country)')
      .eq('audience', 'public')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    if (activeCategory !== 'all') {
      query = query.eq('category', activeCategory);
    }

    if (activeTab === 'following') {
      const { data: follows } = await supabase
        .from('follows').select('following_id')
        .eq('follower_id', user.id).eq('status', 'accepted');
      const ids = (follows || []).map((f) => f.following_id);
      if (ids.length > 0) query = query.in('user_id', ids);
    }

    if (activeTab === 'country') {
      query = query.eq('country', profile?.country || 'KE');
    }

    const { data } = await query;
    setVibes(data || []);
    setActiveIndex(0);
    setLoading(false);
  };

  // Touch swipe navigation
  const handleTouchStart = (e) => {
    if (showComments) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isScrolling.current = false;
  };

  const handleTouchMove = (e) => {
    if (showComments) return;
    if (!touchStartY.current) return;
    const diff = touchStartY.current - e.touches[0].clientY;
    if (Math.abs(diff) > 10) isScrolling.current = true;
  };

  const handleTouchEnd = (e) => {
    if (showComments) return;
    if (!touchStartY.current) return;
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    const elapsed = Date.now() - touchStartTime.current;
    const isSwipe = Math.abs(diff) > 50 && elapsed < 500;

    if (isSwipe) {
      if (diff > 0 && activeIndex < vibes.length - 1) {
        setActiveIndex((i) => i + 1);
        setShowComments(false);
      } else if (diff < 0 && activeIndex > 0) {
        setActiveIndex((i) => i - 1);
        setShowComments(false);
      }
    }

    touchStartY.current = null;
  };

  // Keyboard navigation (desktop)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowDown' && activeIndex < vibes.length - 1) {
        setActiveIndex((i) => i + 1);
        setShowComments(false);
      }
      if (e.key === 'ArrowUp' && activeIndex > 0) {
        setActiveIndex((i) => i - 1);
        setShowComments(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, vibes.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center bg-black" style={{ height: '100dvh' }}>
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF6B35] via-[#FFD700] to-[#1E6FFF] flex items-center justify-center animate-pulse">
            <Zap size={28} className="text-white" />
          </div>
        </div>
        <p className="text-white font-bold text-lg">Loading Vibes...</p>
        <p className="text-white/50 text-sm mt-1">🔥 Africa's hottest content</p>
      </div>
    );
  }

  if (vibes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-black px-6" style={{ height: '100dvh' }}>
        <div className="text-6xl mb-4">🎬</div>
        <h2 className="text-white font-bold text-2xl text-center mb-2">No Vibes Yet</h2>
        <p className="text-white/60 text-sm text-center mb-6">
          {activeTab === 'following'
            ? 'Follow creators to see their Vibes here'
            : 'Be the first to post a Vibe in this category!'}
        </p>
        <button
          onClick={() => navigate('/vibes/upload')}
          className="bg-gradient-to-r from-[#FF6B35] to-[#FFD700] text-white font-bold px-8 py-4 rounded-full text-base shadow-xl active:scale-95 transition-all"
        >
          🔥 Post First Vibe
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative bg-black overflow-hidden"
      style={{ height: '100dvh' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      ref={containerRef}
    >
      {/* Active vibe */}
      {vibes[activeIndex] && (
        <VibePlayer
          key={vibes[activeIndex].id}
          vibe={vibes[activeIndex]}
          isActive={true}
          onNext={() => { if (activeIndex < vibes.length - 1) { setActiveIndex((i) => i + 1); setShowComments(false); } }}
          onPrev={() => { if (activeIndex > 0) { setActiveIndex((i) => i - 1); setShowComments(false); } }}
          showComments={showComments}
          setShowComments={setShowComments}
        />
      )}

      {/* TOP — Feed tabs */}
      {!showComments && (
        <div className="absolute top-14 left-0 right-0 z-20 flex justify-center">
          <div className="flex gap-1 bg-black/40 backdrop-blur-sm rounded-full p-1 border border-white/20">
            {[
              { key: 'foryou', label: '⚡ For You' },
              { key: 'following', label: '👥 Following' },
              { key: 'country', label: (profile?.country === 'KE' ? '🇰🇪' : '🌍') + ' ' + (profile?.country || 'KE') },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  'px-4 py-1.5 rounded-full text-xs font-bold transition-all ' +
                  (activeTab === tab.key
                    ? 'bg-white text-black'
                    : 'text-white/70 hover:text-white')
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category filter horizontal scroll */}
      {!showComments && (
        <div className="absolute top-28 left-0 right-0 z-20">
          <div className="flex gap-2 px-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {Object.entries(CATEGORY_CONFIG).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ' +
                  (activeCategory === key
                    ? 'bg-white text-black border-white'
                    : 'bg-black/40 backdrop-blur-sm text-white/80 border-white/20 hover:border-white/50')
                }
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress dots — right side */}
      {!showComments && vibes.length > 1 && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
          {vibes.slice(Math.max(0, activeIndex - 3), Math.min(vibes.length, activeIndex + 4)).map((_, i) => {
            const realIndex = Math.max(0, activeIndex - 3) + i;
            const isActive = realIndex === activeIndex;
            return (
              <div
                key={realIndex}
                className={'rounded-full transition-all ' + (isActive ? 'w-1 h-6 bg-white' : 'w-1 h-2 bg-white/30')}
              />
            );
          })}
        </div>
      )}

   {/* Upload button — positioned so it doesn't block the music record icon */}
{!showComments && (
  <button
    onClick={() => navigate('/vibes/upload')}
    className="absolute z-20 w-12 h-12 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FFD700] flex items-center justify-center shadow-xl shadow-[#FF6B35]/40 active:scale-95 transition-all border-2 border-white/30"
    style={{
      right: '16px',
      bottom: 'max(200px, calc(190px + env(safe-area-inset-bottom)))',
    }}
  >
    <Plus size={22} className="text-white" />
  </button>
)}

      {/* Swipe hint (first load) */}
      {vibes.length > 1 && activeIndex === 0 && !showComments && (
        <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center gap-1 animate-bounce">
            <div className="w-px h-8 bg-white/30 rounded-full" />
            <p className="text-white/50 text-xs">Swipe up for next Vibe</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VibesFeed;