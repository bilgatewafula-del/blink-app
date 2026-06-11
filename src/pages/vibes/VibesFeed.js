import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Plus, Zap } from 'lucide-react';
import VibePlayer from './VibePlayer';

const CATS = {
  all:       { emoji: '⚡', label: 'For You' },
  street:    { emoji: '🔥', label: 'Street' },
  music:     { emoji: '🎵', label: 'Music' },
  comedy:    { emoji: '😂', label: 'Comedy' },
  dance:     { emoji: '💃', label: 'Dance' },
  food:      { emoji: '🍲', label: 'Food' },
  sports:    { emoji: '⚽', label: 'Sports' },
  knowledge: { emoji: '💡', label: 'Learn' },
  faith:     { emoji: '🙏', label: 'Faith' },
};

export default function VibesFeed() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [vibes, setVibes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeCat, setActiveCat] = useState('all');
  const [activeTab, setActiveTab] = useState('foryou');
  const [showComments, setShowComments] = useState(false);
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);

  useEffect(() => { fetchVibes(); }, [activeCat, activeTab]);

  const fetchVibes = async () => {
    setLoading(true);
    let q = supabase
      .from('vibes')
      .select('*, users:user_id(id,username,display_name,avatar_url,is_verified,country)')
      .eq('audience', 'public')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    if (activeCat !== 'all') q = q.eq('category', activeCat);

    if (activeTab === 'following') {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted');
      const ids = (follows || []).map((f) => f.following_id);
      if (ids.length > 0) q = q.in('user_id', ids);
    }
    if (activeTab === 'country') q = q.eq('country', profile?.country || 'KE');

    const { data } = await q;
    setVibes(data || []);
    setActiveIdx(0);
    setLoading(false);
  };

  const onTouchStart = (e) => {
    if (showComments) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };
  const onTouchMove = (e) => { /* prevent scroll on feed */ };
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

  const flagMap = { KE:'🇰🇪', NG:'🇳🇬', GH:'🇬🇭', UG:'🇺🇬', TZ:'🇹🇿', ZA:'🇿🇦' };

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
    <div style={{ height: '100dvh', background: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
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
  );

  return (
    <div
      style={{ position: 'relative', height: '100dvh', background: 'black', overflow: 'hidden' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Active vibe */}
      {vibes[activeIdx] && (
        <VibePlayer
          key={vibes[activeIdx].id}
          vibe={vibes[activeIdx]}
          isActive={true}
          onNext={() => { if (activeIdx < vibes.length-1) { setActiveIdx((i) => i+1); setShowComments(false); } }}
          onPrev={() => { if (activeIdx > 0) { setActiveIdx((i) => i-1); setShowComments(false); } }}
          showComments={showComments}
          setShowComments={setShowComments}
        />
      )}

      {/* ── TOP OVERLAY — Tab row + Category row ── */}
      {/* Only show when comments not open */}
      {!showComments && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          {/* Safe area spacer for phone status bar */}
          <div style={{ height: '44px' }} />

          {/* Row 1: For You / Following / KE tabs */}
          <div
            style={{
              display: 'flex', justifyContent: 'center', padding: '0 16px',
              pointerEvents: 'auto',
            }}
          >
            <div style={{
              display: 'flex', gap: '4px',
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
              borderRadius: '99px', padding: '4px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              {[
                { key: 'foryou', label: '⚡ For You' },
                { key: 'following', label: '👥 Following' },
                { key: 'country', label: (flagMap[profile?.country] || '🌍') + ' ' + (profile?.country || 'KE') },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '6px 14px', borderRadius: '99px', fontSize: '12px', fontWeight: 700,
                    background: activeTab === tab.key ? 'white' : 'transparent',
                    color: activeTab === tab.key ? 'black' : 'rgba(255,255,255,0.75)',
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Category pills — 8px gap below tabs */}
          <div
            style={{
              marginTop: '8px', paddingLeft: '12px', paddingRight: '12px',
              display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none',
              pointerEvents: 'auto',
            }}
          >
            {Object.entries(CATS).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setActiveCat(key)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '5px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700,
                  background: activeCat === key ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(8px)',
                  color: activeCat === key ? 'black' : 'rgba(255,255,255,0.85)',
                  border: activeCat === key ? 'none' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress dots — left side, vertically centered */}
      {!showComments && vibes.length > 1 && (
        <div style={{
          position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)',
          zIndex: 20, display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          {vibes.slice(Math.max(0, activeIdx-3), Math.min(vibes.length, activeIdx+4)).map((_, i) => {
            const ri = Math.max(0, activeIdx-3) + i;
            return (
              <div key={ri} style={{
                width: '3px', borderRadius: '99px',
                height: ri === activeIdx ? '20px' : '6px',
                background: ri === activeIdx ? 'white' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.2s',
              }} />
            );
          })}
        </div>
      )}

      {/* Upload FAB — bottom right, ABOVE the spinning music icon */}
      {!showComments && (
        <button
          onClick={() => navigate('/vibes/upload')}
          style={{
            position: 'absolute',
            // 16px from right, 80px above bottom nav (64px nav + 16px gap)
            right: '16px',
            bottom: '80px',
            zIndex: 15,            // BELOW right action bar (zIndex 20) so it doesn't overlap
            width: '44px', height: '44px', borderRadius: '50%',
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
      {vibes.length > 1 && activeIdx === 0 && !showComments && (
        <div style={{
          position: 'absolute', bottom: '100px', left: 0, right: 0,
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