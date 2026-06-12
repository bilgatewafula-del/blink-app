import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Plus, Zap } from 'lucide-react';
import VibePlayer from './VibePlayer';

export default function VibesFeed() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [vibes, setVibes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('foryou');
  const [showComments, setShowComments] = useState(false);
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);

  useEffect(() => { fetchVibes(); }, [activeTab]);

  const fetchVibes = async () => {
    setLoading(true);

    const { data: notInterested } = await supabase
      .from('vibe_not_interested').select('vibe_id').eq('user_id', user.id);
    const excludeIds = (notInterested || []).map((n) => n.vibe_id);

    let q = supabase
      .from('vibes')
      .select('*, users:user_id(id,username,display_name,avatar_url,is_verified,country)')
      .eq('audience', 'public')
      .gt('expires_at', new Date().toISOString())
      .limit(30);

    if (excludeIds.length > 0) q = q.not('id', 'in', '(' + excludeIds.join(',') + ')');

    if (activeTab === 'following') {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted');
      const ids = (follows || []).map((f) => f.following_id);
      if (ids.length > 0) q = q.in('user_id', ids);
      q = q.order('created_at', { ascending: false });
    } else if (activeTab === 'trending') {
      q = q.order('fires_count', { ascending: false }).order('views_count', { ascending: false });
    } else {
      q = q.order('created_at', { ascending: false });
    }

    const { data } = await q;
    setVibes(data || []);
    setActiveIdx(0);
    setLoading(false);
  };

  // ── FIX: safely remove a vibe from the feed without breaking the
  // currently-mounted <video> element (avoids "play() interrupted"
  // black screen error) ─────────────────────────────────────────────
  const removeVibeFromFeed = (vibeId) => {
    setVibes((prev) => {
      const removedIdx = prev.findIndex((v) => v.id === vibeId);
      if (removedIdx === -1) return prev;

      const filtered = prev.filter((v) => v.id !== vibeId);

      // Adjust activeIdx BEFORE the list shrinks so React doesn't try
      // to keep rendering+playing the now-removed video element.
      setActiveIdx((curIdx) => {
        if (filtered.length === 0) return 0;
        // If we removed something before or at the active index,
        // shift the active index back by one (but not below 0)
        if (removedIdx <= curIdx) {
          return Math.max(0, Math.min(curIdx - 1 >= 0 ? curIdx : 0, filtered.length - 1));
        }
        // If removed item was after the active one, index stays the same
        return Math.min(curIdx, filtered.length - 1);
      });

      return filtered;
    });
  };

  const onTouchStart = (e) => {
    if (showComments) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };
  const onTouchMove = () => {};
  const onTouchEnd = (e) => {
    if (showComments) return;
    if (!touchStartY.current) return;
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    const elapsed = Date.now() - touchStartTime.current;
    if (Math.abs(diff) > 50 && elapsed < 500) {
      if (diff > 0 && activeIdx < vibes.length - 1) { setActiveIdx((i) => i + 1); setShowComments(false); }
      else if (diff < 0 && activeIdx > 0)           { setActiveIdx((i) => i - 1); setShowComments(false); }
    }
    touchStartY.current = null;
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown' && activeIdx < vibes.length - 1) { setActiveIdx((i) => i + 1); setShowComments(false); }
      if (e.key === 'ArrowUp' && activeIdx > 0)                  { setActiveIdx((i) => i - 1); setShowComments(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, vibes.length]);

  if (loading) return (
    <div style={{ height: '100dvh', background: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B35, #FFD700, #1E6FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 1s infinite' }}>
        <Zap size={28} color="white" />
      </div>
      <p style={{ color: 'white', fontWeight: 700, fontSize: '18px' }}>Loading Vibes...</p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>🔥 Africa's hottest content</p>
    </div>
  );

  if (vibes.length === 0) return (
    <div style={{ height: '100dvh', background: 'black', display: 'flex', flexDirection: 'column' }}>
      <TabRow activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
        <p style={{ fontSize: '64px' }}>🎬</p>
        <h2 style={{ color: 'white', fontWeight: 700, fontSize: '22px', textAlign: 'center' }}>No Vibes Yet</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center' }}>
          {activeTab === 'following' ? 'Follow creators to see their Vibes' : 'Be the first to post a Vibe!'}
        </p>
        <button
          onClick={() => navigate('/vibes/upload')}
          style={{ background: 'linear-gradient(135deg, #FF6B35, #FFD700)', color: 'white', fontWeight: 700, padding: '14px 32px', borderRadius: '99px', fontSize: '15px', border: 'none', cursor: 'pointer' }}
        >
          🔥 Post First Vibe
        </button>
      </div>
    </div>
  );

  // Clamp activeIdx defensively (handles edge case after deletion)
  const safeIdx = Math.min(activeIdx, vibes.length - 1);
  const currentVibe = vibes[safeIdx];

  return (
    <div
      style={{ position: 'relative', height: '100dvh', background: 'black', overflow: 'hidden' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {currentVibe && (
        <VibePlayer
          // Use vibe.id as key so React fully remounts the <video> element
          // for a new vibe — prevents stale play() promises from firing
          // against a removed/replaced element.
          key={currentVibe.id}
          vibe={currentVibe}
          isActive={true}
          onNext={() => { if (safeIdx < vibes.length-1) { setActiveIdx(safeIdx + 1); setShowComments(false); } }}
          onPrev={() => { if (safeIdx > 0) { setActiveIdx(safeIdx - 1); setShowComments(false); } }}
          onRemoveFromFeed={removeVibeFromFeed}
          showComments={showComments}
          setShowComments={setShowComments}
        />
      )}

      {!showComments && <TabRow activeTab={activeTab} setActiveTab={setActiveTab} />}

      {/* Upload FAB */}
      {!showComments && (
        <button
          onClick={() => navigate('/vibes/upload')}
          style={{
            position: 'absolute', right: '16px', bottom: '90px', zIndex: 15,
            width: '46px', height: '46px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF6B35, #FFD700)',
            border: '2px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(255,107,53,0.5)',
            cursor: 'pointer',
          }}
        >
          <Plus size={22} color="white" />
        </button>
      )}

      {/* Swipe hint */}
      {vibes.length > 1 && safeIdx === 0 && !showComments && (
        <div style={{
          position: 'absolute', bottom: '110px', left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          pointerEvents: 'none', zIndex: 10,
          animation: 'bounce 2s infinite',
        }}>
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.3)' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Swipe up for next Vibe</p>
        </div>
      )}
    </div>
  );
}

function TabRow({ activeTab, setActiveTab }) {
  const tabs = [
    { key: 'foryou', label: 'For You' },
    { key: 'following', label: 'Following' },
    { key: 'trending', label: 'Trending' },
  ];

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        paddingTop: '28px',
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        display: 'flex', gap: '2px',
        background: '#0d1f3c',
        borderRadius: '99px',
        padding: '4px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '7px 18px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 700,
              background: activeTab === tab.key ? '#1E6FFF' : 'transparent',
              color: activeTab === tab.key ? 'white' : 'rgba(255,255,255,0.55)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === tab.key ? '0 2px 8px rgba(30,111,255,0.5)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}