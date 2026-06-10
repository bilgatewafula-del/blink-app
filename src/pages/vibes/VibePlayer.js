import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Play, Pause, Volume2, VolumeX,
  Heart, MessageCircle, Share2, Bookmark,
  Music, MoreHorizontal, ChevronDown,
  UserPlus, UserCheck, MapPin, Flag,
  Download, Copy, Repeat2, Scissors,
  Users, AlertCircle, X
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { formatNumber } from '../../utils/formatNumber';
import { formatTime } from '../../utils/formatTime';
import VibeComments from './VibeComments';

const flagMap = {
  KE: '🇰🇪', NG: '🇳🇬', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', ET: '🇪🇹', RW: '🇷🇼',
  GB: '🇬🇧', US: '🇺🇸', CA: '🇨🇦',
};

const CATEGORY_CONFIG = {
  street: { emoji: '🔥', label: 'Street Vibes', color: '#FF6B35' },
  music: { emoji: '🎵', label: 'Music Vibes', color: '#1E6FFF' },
  comedy: { emoji: '😂', label: 'Comedy Vibes', color: '#FFD700' },
  dance: { emoji: '💃', label: 'Dance Vibes', color: '#7B2FFF' },
  food: { emoji: '🍲', label: 'Food Vibes', color: '#2ECC71' },
  sports: { emoji: '⚽', label: 'Sports Vibes', color: '#00D4C8' },
  knowledge: { emoji: '💡', label: 'Knowledge Vibes', color: '#FFD700' },
  faith: { emoji: '🙏', label: 'Faith Vibes', color: '#FF6B35' },
};

const VibePlayer = ({
  vibe,
  isActive,
  onNext,
  onPrev,
  showComments,
  setShowComments,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fired, setFired] = useState(false);
  const [firesCount, setFiresCount] = useState(vibe.fires_count || 0);
  const [saved, setSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [fireBurst, setFireBurst] = useState(false);
  const [fireBurstPos, setFireBurstPos] = useState({ x: '50%', y: '50%' });
  const [viewRecorded, setViewRecorded] = useState(false);
  const [watchStart, setWatchStart] = useState(null);
  const [quality, setQuality] = useState('Auto');
  const [showQuality, setShowQuality] = useState(false);
  const [rotation, setRotation] = useState(0);
  const lastTapRef = useRef(0);
  const rotationTimer = useRef();

  const author = vibe.users;
  const category = CATEGORY_CONFIG[vibe.category] || CATEGORY_CONFIG.street;

  // Rotating record icon
  useEffect(() => {
    if (playing) {
      rotationTimer.current = setInterval(() => {
        setRotation((r) => (r + 2) % 360);
      }, 30);
    } else {
      clearInterval(rotationTimer.current);
    }
    return () => clearInterval(rotationTimer.current);
  }, [playing]);

  // Auto play/pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => {
        setPlaying(true);
        setWatchStart(Date.now());
      }).catch(() => {
        setPlaying(false);
      });
    } else {
      video.pause();
      setPlaying(false);
      if (watchStart && !viewRecorded) recordView();
    }
  }, [isActive]);

  const recordView = async () => {
    if (!user || viewRecorded) return;
    setViewRecorded(true);
    const watchDuration = watchStart ? Math.floor((Date.now() - watchStart) / 1000) : 0;
    await supabase.from('vibe_views').upsert(
      { vibe_id: vibe.id, viewer_id: user.id, watch_duration: watchDuration },
      { onConflict: 'vibe_id,viewer_id' }
    );
    await supabase.from('vibes')
      .update({ views_count: (vibe.views_count || 0) + 1 })
      .eq('id', vibe.id);
  };

  const checkInitialState = useCallback(async () => {
    const { data: fireData } = await supabase
      .from('vibe_fires').select('id')
      .eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
    if (fireData) setFired(true);

    const { data: saveData } = await supabase
      .from('vibe_saves').select('id')
      .eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
    if (saveData) setSaved(true);

    if (author?.id !== user.id) {
      const { data: followData } = await supabase
        .from('follows').select('id')
        .eq('follower_id', user.id).eq('following_id', author?.id).maybeSingle();
      if (followData) setIsFollowing(true);
    }
  }, [vibe.id, user.id, author?.id]);

  useEffect(() => {
    checkInitialState();
  }, [checkInitialState]);

  const handleVideoTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap — fire burst
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100 + '%';
      const y = ((e.clientY - rect.top) / rect.height) * 100 + '%';
      setFireBurstPos({ x, y });
      setFireBurst(true);
      setTimeout(() => setFireBurst(false), 800);
      if (!fired) handleFire();
    } else {
      togglePlayPause();
    }
    lastTapRef.current = now;
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.play();
      setPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setProgress((video.currentTime / video.duration) * 100);
    if (video.currentTime >= video.duration * 0.8 && !viewRecorded) {
      recordView();
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) setDuration(video.duration);
  };

  const handleVideoEnded = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play();
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video) video.currentTime = pct * video.duration;
  };

  const handleFire = async () => {
    if (fired) {
      setFired(false);
      setFiresCount((c) => Math.max(0, c - 1));
      await supabase.from('vibe_fires').delete()
        .eq('vibe_id', vibe.id).eq('user_id', user.id);
      await supabase.from('vibes')
        .update({ fires_count: Math.max(0, firesCount - 1) })
        .eq('id', vibe.id);
    } else {
      setFired(true);
      setFiresCount((c) => c + 1);
      await supabase.from('vibe_fires').insert({ vibe_id: vibe.id, user_id: user.id });
      await supabase.from('vibes')
        .update({ fires_count: firesCount + 1 })
        .eq('id', vibe.id);
      if (author?.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: author?.id, from_user_id: user.id,
          type: 'like', message: 'fired your Vibe 🔥',
          ref_id: vibe.id, is_read: false,
        });
      }
    }
  };

  const handleSave = async () => {
    if (saved) {
      setSaved(false);
      await supabase.from('vibe_saves').delete()
        .eq('vibe_id', vibe.id).eq('user_id', user.id);
    } else {
      setSaved(true);
      await supabase.from('vibe_saves').insert({ vibe_id: vibe.id, user_id: user.id });
    }
  };

  const handleFollow = async () => {
    if (author?.id === user.id) return;
    if (isFollowing) {
      setIsFollowing(false);
      await supabase.from('follows').delete()
        .eq('follower_id', user.id).eq('following_id', author?.id);
    } else {
      setIsFollowing(true);
      await supabase.from('follows').insert({
        follower_id: user.id, following_id: author?.id, status: 'accepted',
      });
      await supabase.from('notifications').insert({
        user_id: author?.id, from_user_id: user.id,
        type: 'follow', message: 'started following you', is_read: false,
      });
    }
  };

  const handleShare = async (method) => {
    setShowShare(false);
    const url = window.location.origin + '/vibes/' + vibe.id;
    switch (method) {
      case 'copy':
        navigator.clipboard.writeText(url);
        alert('Link copied! 🔗');
        break;
      case 'whatsapp':
        window.open('https://wa.me/?text=' + encodeURIComponent('Check this Vibe on B-Link 🔥 ' + url));
        break;
      case 'download':
        const a = document.createElement('a');
        a.href = vibe.video_url;
        a.download = 'blink-vibe-' + vibe.id + '.mp4';
        a.target = '_blank';
        a.click();
        break;
      case 'story':
        navigate('/');
        break;
      default:
        if (navigator.share) navigator.share({ title: 'Check this Vibe!', url });
    }
    await supabase.from('vibes')
      .update({ shares_count: (vibe.shares_count || 0) + 1 })
      .eq('id', vibe.id);
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  const expiresIn = Math.max(0, Math.ceil(
    (new Date(vibe.expires_at) - new Date()) / (1000 * 3600 * 24)
  ));

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ height: '100dvh' }}>
      {/* Video */}
      <video
        ref={videoRef}
        src={vibe.video_url}
        className="absolute inset-0 w-full h-full object-cover"
        loop={false}
        muted={muted}
        playsInline
        preload="metadata"
        poster={vibe.thumbnail_url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleVideoEnded}
        onClick={handleVideoTap}
        style={{ cursor: 'pointer' }}
      />

      {/* Dark gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10 pointer-events-none" />

      {/* Fire burst animation */}
      {fireBurst && (
        <div
          className="absolute pointer-events-none z-30"
          style={{ left: fireBurstPos.x, top: fireBurstPos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div
            className="text-7xl"
            style={{
              animation: 'fireBurst 0.8s ease-out forwards',
            }}
          >
            🔥
          </div>
        </div>
      )}

      {/* Play/Pause indicator */}
      {!playing && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={36} className="text-white ml-2" fill="white" />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          {/* Category pill */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20"
            style={{ background: category.color + '30' }}
          >
            <span className="text-sm">{category.emoji}</span>
            <span className="text-white text-xs font-bold">{category.label}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Expires badge */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/20 px-2 py-1 rounded-full">
              <span className="text-white/70 text-[10px]">
                {expiresIn === 0 ? 'Expires today' : expiresIn + 'd left'}
              </span>
            </div>

            {/* Quality selector */}
            <div className="relative">
              <button
                onClick={() => setShowQuality(!showQuality)}
                className="bg-black/40 backdrop-blur-sm border border-white/20 px-2 py-1 rounded-full"
              >
                <span className="text-white text-[10px] font-bold">{quality}</span>
              </button>
              {showQuality && (
                <div className="absolute right-0 top-8 bg-black/90 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden z-30 w-24">
                  {['Auto', '1080p', '720p', '480p', '360p'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setQuality(q); setShowQuality(false); }}
                      className={'w-full px-3 py-2 text-xs text-left transition-colors ' + (quality === q ? 'text-[#1E6FFF] bg-[#1E6FFF]/20' : 'text-white hover:bg-white/10')}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mute button */}
            <button
              onClick={() => setMuted(!muted)}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center"
            >
              {muted
                ? <VolumeX size={14} className="text-white" />
                : <Volume2 size={14} className="text-white" />
              }
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE — Action bar */}
      <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center gap-5">
        {/* Creator avatar + follow */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => navigate('/profile/' + author?.username)}
            className="relative"
          >
            <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden shadow-xl">
              {author?.avatar_url ? (
                <img src={author.avatar_url} alt={author.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">
                  {author?.display_name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            {author?.id !== user.id && (
              <button
                onClick={(e) => { e.stopPropagation(); handleFollow(); }}
                className={'absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-black flex items-center justify-center ' + (isFollowing ? 'bg-[#2ECC71]' : 'bg-[#1E6FFF]')}
              >
                {isFollowing
                  ? <UserCheck size={10} className="text-white" />
                  : <UserPlus size={10} className="text-white" />
                }
              </button>
            )}
          </button>
        </div>

        {/* 🔥 Fire (like) */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleFire}
            className={'w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-75 ' + (fired ? 'bg-orange-500/30' : 'bg-black/30 backdrop-blur-sm')}
          >
            <span
              className={'text-2xl transition-all ' + (fired ? 'scale-110' : '')}
              style={{ filter: fired ? 'drop-shadow(0 0 8px #FF6B35)' : 'none' }}
            >
              🔥
            </span>
          </button>
          <span className="text-white text-xs font-bold text-shadow">
            {formatNumber(firesCount)}
          </span>
        </div>

        {/* 💬 Comments */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setShowComments(true)}
            className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <MessageCircle size={24} className="text-white" fill="white" />
          </button>
          <span className="text-white text-xs font-bold">
            {formatNumber(vibe.comments_count || 0)}
          </span>
        </div>

        {/* ↗️ Share */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setShowShare(true)}
            className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Share2 size={24} className="text-white" />
          </button>
          <span className="text-white text-xs font-bold">
            {formatNumber(vibe.shares_count || 0)}
          </span>
        </div>

        {/* 🔖 Save */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleSave}
            className={'w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all ' + (saved ? 'bg-[#FFD700]/30' : 'bg-black/30 backdrop-blur-sm')}
          >
            <Bookmark
              size={24}
              className={'transition-colors ' + (saved ? 'text-[#FFD700] fill-[#FFD700]' : 'text-white')}
            />
          </button>
          <span className="text-white text-xs font-bold">
            {formatNumber(vibe.saves_count || 0)}
          </span>
        </div>

        {/* ⋯ More */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setShowOptions(true)}
            className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <MoreHorizontal size={24} className="text-white" />
          </button>
        </div>

        {/* 🎵 Spinning record */}
        <div className="flex flex-col items-center gap-1 mt-1">
          <div
            className="w-11 h-11 rounded-full border-4 border-white/30 overflow-hidden bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center"
            style={{ transform: 'rotate(' + rotation + 'deg)' }}
          >
            <Music size={16} className="text-white" />
          </div>
        </div>
      </div>

      {/* BOTTOM — Creator info + caption */}
      <div className="absolute bottom-0 left-0 right-16 z-20 px-4 pb-4">
        {/* Creator info */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => navigate('/profile/' + author?.username)}
            className="text-white font-bold text-base hover:underline"
          >
            @{author?.username}
          </button>
          {author?.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
          )}
          <span className="text-base">{flagMap[author?.country] || '🌍'}</span>
          {vibe.location && (
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-full px-2 py-0.5">
              <MapPin size={10} className="text-[#FF6B35]" />
              <span className="text-white/80 text-[10px]">{vibe.location}</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {vibe.caption && (
          <p className="text-white text-sm leading-relaxed mb-2 line-clamp-2">
            {vibe.caption}
          </p>
        )}

        {/* Hashtags */}
        {vibe.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {vibe.hashtags.map((tag) => (
              <span key={tag} className="text-[#00D4C8] text-sm font-semibold">#{tag}</span>
            ))}
          </div>
        )}

        {/* Audio info */}
        <div className="flex items-center gap-2">
          <Music size={12} className="text-white/70" />
          <div className="overflow-hidden">
            <p className="text-white/70 text-xs" style={{
              animation: 'marquee 8s linear infinite',
              whiteSpace: 'nowrap',
            }}>
              🎵 {vibe.audio_title || 'Original Sound — ' + author?.display_name}
            </p>
          </div>
        </div>

        {/* Views + duration */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-white/50 text-xs">👁 {formatNumber(vibe.views_count || 0)} views</span>
          <span className="text-white/50 text-xs">⏱ {formatDuration(duration)}</span>
          <span className="text-white/50 text-xs">📅 {formatTime(vibe.created_at)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-white/20 cursor-pointer" onClick={handleSeek}>
        <div
          className="h-full bg-gradient-to-r from-[#FF6B35] via-[#FFD700] to-[#1E6FFF] transition-all duration-100"
          style={{ width: progress + '%' }}
        />
      </div>

      {/* Share sheet */}
      {showShare && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowShare(false)}>
          <div
            className="w-full bg-black/90 backdrop-blur-md rounded-t-3xl border-t border-white/20 p-5 slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-4">Share Vibe</h3>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { icon: '💬', label: 'Chat', action: 'chat' },
                { icon: '⭕', label: 'Story', action: 'story' },
                { icon: '🔗', label: 'Copy Link', action: 'copy' },
                { icon: '📱', label: 'WhatsApp', action: 'whatsapp' },
                { icon: '⬇️', label: 'Download', action: 'download' },
                { icon: '🔁', label: 'Repost', action: 'repost' },
                { icon: '✂️', label: 'Stitch', action: 'stitch' },
                { icon: '👥', label: 'Duet', action: 'duet' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleShare(item.action)}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl hover:bg-white/20 transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-white/70 text-xs">{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowShare(false)} className="w-full py-3 bg-white/10 rounded-2xl text-white font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Options menu */}
      {showOptions && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowOptions(false)}>
          <div
            className="w-full bg-black/90 backdrop-blur-md rounded-t-3xl border-t border-white/20 p-5 slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
            <div className="space-y-1">
              {[
                { icon: AlertCircle, label: 'Not interested', color: 'text-white/80' },
                { icon: Flag, label: 'Report Vibe', color: 'text-red-400' },
                { icon: Users, label: 'Block @' + author?.username, color: 'text-red-400' },
                { icon: Download, label: 'Download Vibe', color: 'text-[#2ECC71]' },
                { icon: Scissors, label: 'Stitch this Vibe', color: 'text-[#1E6FFF]' },
                { icon: Users, label: 'Duet with this Vibe', color: 'text-[#7B2FFF]' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { setShowOptions(false); if (item.label.includes('Download')) handleShare('download'); }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/10 transition-colors"
                >
                  <item.icon size={20} className={item.color} />
                  <span className={'text-sm font-medium ' + item.color}>{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowOptions(false)} className="w-full mt-3 py-3 bg-white/10 rounded-2xl text-white font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Comments panel */}
      {showComments && (
        <VibeComments
          vibe={vibe}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
};

export default VibePlayer;