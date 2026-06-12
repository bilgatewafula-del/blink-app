import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Volume2, VolumeX, MessageCircle,
  Share2, Bookmark, MoreHorizontal,
  UserPlus, UserCheck, MapPin, Flag,
  Download, Users, AlertCircle,
  Trash2, Play
} from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import VibeComments from './VibeComments';

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

export default function VibePlayer({ vibe, isActive, onNext, showComments, setShowComments }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef();

  const [playing, setPlaying]           = useState(false);
  const [muted, setMuted]               = useState(false);
  const [progress, setProgress]         = useState(0);
  const [fired, setFired]               = useState(false);
  const [firesCount, setFiresCount]     = useState(vibe.fires_count || 0);
  const [saved, setSaved]               = useState(false);
  const [isFollowing, setIsFollowing]   = useState(false);
  const [showOptions, setShowOptions]   = useState(false);
  const [showShare, setShowShare]       = useState(false);
  const [fireBurst, setFireBurst]       = useState(false);
  const [fireBurstPos, setFireBurstPos] = useState({ x: '50%', y: '50%' });
  const [viewRecorded, setViewRecorded] = useState(false);
  const [watchStart, setWatchStart]     = useState(null);
  const lastTapRef = useRef(0);

  const author  = vibe.users;
  const isOwner = author?.id === user?.id;

  const expiresIn = Math.max(0, Math.ceil((new Date(vibe.expires_at) - new Date()) / (1000 * 3600 * 24)));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => { setPlaying(true); setWatchStart(Date.now()); }).catch(() => setPlaying(false));
    } else {
      video.pause(); setPlaying(false);
      if (watchStart && !viewRecorded) recordView();
    }
  }, [isActive]);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from('vibe_fires').select('id').eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
      if (f) setFired(true);
      const { data: s } = await supabase.from('vibe_saves').select('id').eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
      if (s) setSaved(true);
      if (author?.id !== user.id) {
        const { data: fw } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', author?.id).maybeSingle();
        if (fw) setIsFollowing(true);
      }
    })();
  }, [vibe.id]);

  const recordView = async () => {
    if (!user || viewRecorded) return;
    setViewRecorded(true);
    const watchDuration = watchStart ? Math.floor((Date.now() - watchStart) / 1000) : 0;
    await supabase.from('vibe_views').upsert(
      { vibe_id: vibe.id, viewer_id: user.id, watch_duration: watchDuration },
      { onConflict: 'vibe_id,viewer_id' }
    );
    await supabase.from('vibes').update({ views_count: (vibe.views_count || 0) + 1 }).eq('id', vibe.id);
  };

  const handleVideoTap = (e) => {
    if (e.target.closest('button')) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      setFireBurstPos({
        x: ((e.clientX - rect.left) / rect.width) * 100 + '%',
        y: ((e.clientY - rect.top) / rect.height) * 100 + '%',
      });
      setFireBurst(true);
      setTimeout(() => setFireBurst(false), 800);
      if (!fired) handleFire();
    } else {
      togglePlay();
    }
    lastTapRef.current = now;
  };

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (playing) { v.pause(); setPlaying(false); } else { v.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current; if (!v) return;
    setProgress((v.currentTime / v.duration) * 100);
    if (v.currentTime >= v.duration * 0.8 && !viewRecorded) recordView();
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const v    = videoRef.current;
    if (v) v.currentTime = pct * v.duration;
  };

  const handleFire = async () => {
    if (fired) {
      setFired(false); setFiresCount((c) => Math.max(0, c - 1));
      await supabase.from('vibe_fires').delete().eq('vibe_id', vibe.id).eq('user_id', user.id);
      await supabase.from('vibes').update({ fires_count: Math.max(0, firesCount - 1) }).eq('id', vibe.id);
    } else {
      setFired(true); setFiresCount((c) => c + 1);
      await supabase.from('vibe_fires').insert({ vibe_id: vibe.id, user_id: user.id });
      await supabase.from('vibes').update({ fires_count: firesCount + 1 }).eq('id', vibe.id);
      if (author?.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: author?.id, from_user_id: user.id, type: 'like',
          message: 'fired your Vibe 🔥', ref_id: vibe.id, is_read: false,
        });
      }
    }
  };

  const handleSave = async () => {
    if (saved) {
      setSaved(false);
      await supabase.from('vibe_saves').delete().eq('vibe_id', vibe.id).eq('user_id', user.id);
    } else {
      setSaved(true);
      await supabase.from('vibe_saves').insert({ vibe_id: vibe.id, user_id: user.id });
    }
  };

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (isOwner) return;
    if (isFollowing) {
      setIsFollowing(false);
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', author?.id);
    } else {
      setIsFollowing(true);
      await supabase.from('follows').insert({ follower_id: user.id, following_id: author?.id, status: 'accepted' });
      await supabase.from('notifications').insert({
        user_id: author?.id, from_user_id: user.id, type: 'follow',
        message: 'started following you', is_read: false,
      });
    }
  };

  const handleDeleteVibe = async () => {
    if (!window.confirm('Delete this Vibe? This cannot be undone.')) return;
    await supabase.from('vibes').delete().eq('id', vibe.id).eq('user_id', user.id);
    onNext();
  };

  const handleShare = async (method) => {
    setShowShare(false);
    const url = window.location.origin + '/vibes/' + vibe.id;
    if (method === 'copy')      { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    else if (method === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent('Check this Vibe 🔥 ' + url));
    else if (method === 'download') {
      const a = document.createElement('a');
      a.href = vibe.video_url; a.download = 'blink-vibe.mp4'; a.target = '_blank'; a.click();
    }
    await supabase.from('vibes').update({ shares_count: (vibe.shares_count || 0) + 1 }).eq('id', vibe.id);
  };

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100dvh', background: 'black', overflow: 'hidden', userSelect: 'none' }}
      onClick={handleVideoTap}
    >
      <video
        ref={videoRef}
        src={vibe.video_url}
        poster={vibe.thumbnail_url}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        muted={muted}
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); } }}
      />

      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />

      {/* Fire burst */}
      {fireBurst && (
        <div style={{ position: 'absolute', left: fireBurstPos.x, top: fireBurstPos.y, transform: 'translate(-50%,-50%)', zIndex: 30, pointerEvents: 'none' }}>
          <div style={{ animation: 'fireBurst 0.8s ease-out forwards', fontSize: '80px' }}>🔥</div>
        </div>
      )}

      {/* Play indicator */}
      {!playing && isActive && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={28} color="white" fill="white" style={{ marginLeft: '4px' }} />
          </div>
        </div>
      )}

      {/* Mute button — top right, below tab row */}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
        style={{
          position: 'absolute', top: '100px', right: '12px', zIndex: 20,
          width: '34px', height: '34px', borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        {muted ? <VolumeX size={15} color="white" /> : <Volume2 size={15} color="white" />}
      </button>

      {/* Expires badge — top left, below tab row */}
      <div style={{
        position: 'absolute', top: '100px', left: '12px', zIndex: 20,
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '99px', padding: '5px 10px',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px', fontWeight: 600 }}>
          {expiresIn === 0 ? '⏳ Expires today' : '⏳ ' + expiresIn + 'd left'}
        </span>
      </div>

      {/* ── RIGHT ACTION COLUMN — clean icons, no circles, no music ── */}
      <div
        style={{
          position: 'absolute', right: '10px', zIndex: 20,
          top: '160px', bottom: '140px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-evenly',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Creator avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <button onClick={() => navigate('/profile/' + author?.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid white', overflow: 'hidden' }}>
              {author?.avatar_url
                ? <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1E6FFF,#7B2FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>{author?.display_name?.[0]?.toUpperCase()}</div>
              }
            </div>
          </button>
          {!isOwner && (
            <button onClick={handleFollow}
              style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid black', background: isFollowing ? '#2ECC71' : '#1E6FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              {isFollowing ? <UserCheck size={11} color="white" /> : <UserPlus size={11} color="white" />}
            </button>
          )}
        </div>

        {/* Fire — plain icon, no circle */}
        <button
          onClick={(e) => { e.stopPropagation(); handleFire(); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ fontSize: '32px', filter: fired ? 'drop-shadow(0 0 8px #FF6B35)' : 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))', transform: fired ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.2s' }}>🔥</span>
          <span style={{ color: 'white', fontSize: '12px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{formatNumber(firesCount)}</span>
        </button>

        {/* Comments — plain icon */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowComments(true); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <MessageCircle size={30} color="white" fill="white" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }} />
          <span style={{ color: 'white', fontSize: '12px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{formatNumber(vibe.comments_count || 0)}</span>
        </button>

        {/* Share — plain icon */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowShare(true); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Share2 size={30} color="white" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }} />
          <span style={{ color: 'white', fontSize: '12px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{formatNumber(vibe.shares_count || 0)}</span>
        </button>

        {/* Save — plain icon */}
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Bookmark size={30} color={saved ? '#FFD700' : 'white'} fill={saved ? '#FFD700' : 'none'} style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }} />
          <span style={{ color: 'white', fontSize: '12px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{formatNumber(vibe.saves_count || 0)}</span>
        </button>

        {/* More — plain icon */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowOptions(true); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <MoreHorizontal size={30} color="white" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))' }} />
        </button>
      </div>

      {/* ── BOTTOM CREATOR INFO ── */}
      <div
        style={{ position: 'absolute', bottom: '14px', left: '12px', right: '64px', zIndex: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/profile/' + author?.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'white', fontWeight: 700, fontSize: '15px', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            @{author?.username}
          </button>
          {author?.is_verified && <span style={{ background: '#1E6FFF', color: 'white', fontSize: '8px', padding: '2px 5px', borderRadius: '99px', fontWeight: 700 }}>✓</span>}
          <span style={{ fontSize: '14px' }}>{flagMap[author?.country] || '🌍'}</span>
          {vibe.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(0,0,0,0.4)', borderRadius: '99px', padding: '2px 8px' }}>
              <MapPin size={10} color="#FF6B35" />
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '10px' }}>{vibe.location}</span>
            </div>
          )}
        </div>

        {vibe.caption && (
          <p style={{ color: 'white', fontSize: '14px', lineHeight: 1.4, marginBottom: '6px', textShadow: '0 1px 4px rgba(0,0,0,0.6)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {vibe.caption}
          </p>
        )}

        {vibe.hashtags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
            {vibe.hashtags.slice(0, 4).map((tag) => (
              <span key={tag} style={{ color: '#00D4C8', fontSize: '13px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>#{tag}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>👁 {formatNumber(vibe.views_count || 0)}</span>
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.2)', zIndex: 30, cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); handleSeek(e); }}
      >
        <div style={{ height: '100%', background: 'linear-gradient(90deg, #FF6B35, #FFD700, #1E6FFF)', width: progress + '%' }} />
      </div>

      {/* ── SHARE SHEET ── */}
      {showShare && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowShare(false)}>
          <div style={{ width: '100%', background: 'rgba(13,31,60,0.98)', backdropFilter: 'blur(20px)', borderRadius: '24px 24px 0 0', borderTop: '1px solid rgba(255,255,255,0.15)', padding: '20px', animation: 'slideUp 0.25s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', margin: '0 auto 20px' }} />
            <h3 style={{ color: 'white', fontWeight: 700, fontSize: '17px', marginBottom: '16px' }}>Share Vibe</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '18px' }}>
              {[
                { icon: '🔗', label: 'Copy Link', action: 'copy' },
                { icon: '📱', label: 'WhatsApp', action: 'whatsapp' },
                { icon: '⬇️', label: 'Download', action: 'download' },
                { icon: '🔁', label: 'Repost', action: 'repost' },
              ].map((item) => (
                <button key={item.label} onClick={() => handleShare(item.action)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>{item.icon}</div>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowShare(false)} style={{ width: '100%', padding: '13px', background: 'rgba(255,255,255,0.08)', borderRadius: '16px', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── OPTIONS MENU ── */}
      {showOptions && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowOptions(false)}>
          <div style={{ width: '100%', background: 'rgba(13,31,60,0.98)', backdropFilter: 'blur(20px)', borderRadius: '24px 24px 0 0', borderTop: '1px solid rgba(255,255,255,0.15)', padding: '20px', animation: 'slideUp 0.25s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', margin: '0 auto 16px' }} />
            {[
              { icon: AlertCircle, label: 'Not interested', color: 'rgba(255,255,255,0.8)', action: () => setShowOptions(false) },
              { icon: Flag, label: 'Report Vibe', color: '#EF4444', action: () => setShowOptions(false) },
              { icon: Users, label: 'Block @' + author?.username, color: '#EF4444', action: () => setShowOptions(false) },
              { icon: Download, label: 'Download Vibe', color: '#2ECC71', action: () => handleShare('download') },
              ...(isOwner ? [{ icon: Trash2, label: 'Delete my Vibe', color: '#EF4444', action: handleDeleteVibe }] : []),
            ].map((item) => (
              <button key={item.label} onClick={() => { setShowOptions(false); item.action(); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 8px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <item.icon size={20} color={item.color} />
                <span style={{ color: item.color, fontWeight: 600, fontSize: '14px' }}>{item.label}</span>
              </button>
            ))}
            <button onClick={() => setShowOptions(false)} style={{ width: '100%', marginTop: '12px', padding: '13px', background: 'rgba(255,255,255,0.08)', borderRadius: '16px', color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── COMMENTS BOTTOM SHEET ── */}
      {showComments && (
        <VibeComments vibe={vibe} onClose={() => setShowComments(false)} />
      )}
    </div>
  );
}