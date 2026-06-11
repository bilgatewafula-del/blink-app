import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Play, Pause, Volume2, VolumeX,
  Heart, MessageCircle, Share2, Bookmark,
  Music, MoreHorizontal, ChevronDown,
  UserPlus, UserCheck, MapPin, Flag,
  Download, Copy, Scissors, Users,
  AlertCircle, X, Trash2, Repeat2
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
  street:    { emoji: '🔥', label: 'Street',    color: '#FF6B35' },
  music:     { emoji: '🎵', label: 'Music',     color: '#1E6FFF' },
  comedy:    { emoji: '😂', label: 'Comedy',    color: '#FFD700' },
  dance:     { emoji: '💃', label: 'Dance',     color: '#7B2FFF' },
  food:      { emoji: '🍲', label: 'Food',      color: '#2ECC71' },
  sports:    { emoji: '⚽', label: 'Sports',    color: '#00D4C8' },
  knowledge: { emoji: '💡', label: 'Learn',     color: '#FFD700' },
  faith:     { emoji: '🙏', label: 'Faith',     color: '#FF6B35' },
};

const VibePlayer = ({ vibe, isActive, onNext, onPrev, showComments, setShowComments }) => {
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
  const [rotation, setRotation] = useState(0);
  const [showQuality, setShowQuality] = useState(false);
  const [quality, setQuality] = useState('Auto');
  const lastTapRef = useRef(0);
  const rotationTimer = useRef();

  const author = vibe.users;
  const category = CATEGORY_CONFIG[vibe.category] || CATEGORY_CONFIG.street;
  const isOwner = author?.id === user?.id;

  const expiresIn = Math.max(0, Math.ceil(
    (new Date(vibe.expires_at) - new Date()) / (1000 * 3600 * 24)
  ));

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => {
        setPlaying(true);
        setWatchStart(Date.now());
      }).catch(() => setPlaying(false));
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
    const { data: fd } = await supabase.from('vibe_fires').select('id')
      .eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
    if (fd) setFired(true);

    const { data: sd } = await supabase.from('vibe_saves').select('id')
      .eq('vibe_id', vibe.id).eq('user_id', user.id).maybeSingle();
    if (sd) setSaved(true);

    if (author?.id !== user.id) {
      const { data: fld } = await supabase.from('follows').select('id')
        .eq('follower_id', user.id).eq('following_id', author?.id).maybeSingle();
      if (fld) setIsFollowing(true);
    }
  }, [vibe.id, user.id, author?.id]);

  useEffect(() => { checkInitialState(); }, [checkInitialState]);

  const handleVideoTap = (e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      setFireBurstPos({
        x: ((e.clientX - rect.left) / rect.width * 100) + '%',
        y: ((e.clientY - rect.top) / rect.height * 100) + '%',
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
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else { video.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
    if (video.currentTime >= video.duration * 0.8 && !viewRecorded) recordView();
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) setDuration(video.duration);
  };

  const handleVideoEnded = () => {
    const video = videoRef.current;
    if (video) { video.currentTime = 0; video.play(); }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video && video.duration) video.currentTime = pct * video.duration;
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
          user_id: author?.id, from_user_id: user.id,
          type: 'like', message: 'fired your Vibe 🔥', ref_id: vibe.id, is_read: false,
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

  const handleFollow = async () => {
    if (author?.id === user.id) return;
    if (isFollowing) {
      setIsFollowing(false);
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', author?.id);
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

  const handleDeleteVibe = async () => {
    if (!window.confirm('Delete this Vibe permanently?')) return;
    await supabase.from('vibes').delete().eq('id', vibe.id);
    onNext();
  };

  const handleShare = async (method) => {
    setShowShare(false);
    const url = window.location.origin + '/vibes/' + vibe.id;
    if (method === 'copy') { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    else if (method === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent('Check this Vibe on B-Link 🔥 ' + url));
    else if (method === 'download') {
      const a = document.createElement('a');
      a.href = vibe.video_url; a.download = 'blink-vibe.mp4'; a.target = '_blank'; a.click();
    }
    if (method !== 'cancel') {
      await supabase.from('vibes').update({ shares_count: (vibe.shares_count || 0) + 1 }).eq('id', vibe.id);
    }
  };

  const formatDur = (s) => Math.floor(s / 60) + ':' + (Math.floor(s % 60) < 10 ? '0' : '') + Math.floor(s % 60);

  return (
    <div className="relative w-full bg-black overflow-hidden select-none" style={{ height: '100dvh' }}>

      {/* ── VIDEO ── */}
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

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />

      {/* Fire burst */}
      {fireBurst && (
        <div
          className="absolute pointer-events-none z-30"
          style={{ left: fireBurstPos.x, top: fireBurstPos.y, transform: 'translate(-50%, -50%)' }}
        >
          <div style={{ animation: 'fireBurst 0.8s ease-out forwards', fontSize: '72px' }}>🔥</div>
        </div>
      )}

      {/* Pause indicator */}
      {!playing && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-18 h-18 w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={34} className="text-white ml-2" fill="white" />
          </div>
        </div>
      )}

      {/* ── TOP BAR ── safe area + no overlap */}
      <div
        className="absolute left-0 right-0 z-20 px-3"
        style={{ top: 'max(44px, env(safe-area-inset-top, 44px))' }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Category — left */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm flex-shrink-0"
            style={{ background: category.color + '30', border: '1px solid ' + category.color + '50' }}
          >
            <span className="text-sm leading-none">{category.emoji}</span>
            <span className="text-white text-xs font-bold">{category.label}</span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            {/* Expires badge */}
            <div className="bg-black/50 backdrop-blur-sm border border-white/20 px-2 py-1 rounded-full">
              <span className="text-white/70 text-[10px] font-medium">
                {expiresIn === 0 ? '⏰ Today' : '🗓 ' + expiresIn + 'd'}
              </span>
            </div>

            {/* Quality selector */}
            <div className="relative">
              <button
                onClick={() => setShowQuality(!showQuality)}
                className="bg-black/50 backdrop-blur-sm border border-white/20 px-2 py-1 rounded-full"
              >
                <span className="text-white text-[10px] font-bold">{quality}</span>
              </button>
              {showQuality && (
                <div className="absolute right-0 top-8 bg-black/90 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden z-30 w-24 shadow-xl">
                  {['Auto', '1080p', '720p', '480p', '360p'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setQuality(q); setShowQuality(false); }}
                      className={'w-full px-3 py-2 text-xs text-left transition-colors ' +
                        (quality === q ? 'text-[#1E6FFF] bg-[#1E6FFF]/20' : 'text-white hover:bg-white/10')}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mute */}
            <button
              onClick={() => setMuted(!muted)}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center"
            >
              {muted ? <VolumeX size={13} className="text-white" /> : <Volume2 size={13} className="text-white" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDE ACTION BAR ── */}
      {/* Positioned carefully: starts well below top bar, ends above bottom creator info */}
      <div
        className="absolute right-3 z-20 flex flex-col items-center gap-5"
        style={{ bottom: '140px' }}
      >
        {/* Creator avatar + follow */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => navigate('/profile/' + author?.username)} className="relative">
            <div className="w-11 h-11 rounded-full border-2 border-white overflow-hidden shadow-xl">
              {author?.avatar_url ? (
                <img src={author.avatar_url} alt={author.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">
                  {author?.display_name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </button>
          {author?.id !== user.id && (
            <button
              onClick={handleFollow}
              className={'w-6 h-6 rounded-full border-2 border-black flex items-center justify-center shadow ' +
                (isFollowing ? 'bg-[#2ECC71]' : 'bg-[#FF6B35]')}
            >
              {isFollowing
                ? <UserCheck size={11} className="text-white" />
                : <UserPlus size={11} className="text-white" />
              }
            </button>
          )}
        </div>

        {/* 🔥 Fire */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={handleFire}
            className={'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-75 ' +
              (fired ? 'bg-orange-500/25' : 'bg-black/30 backdrop-blur-sm')}
          >
            <span
              className="text-2xl"
              style={{ filter: fired ? 'drop-shadow(0 0 6px #FF6B35)' : 'none' }}
            >
              🔥
            </span>
          </button>
          <span className="text-white text-xs font-bold drop-shadow-lg">
            {formatNumber(firesCount)}
          </span>
        </div>

        {/* 💬 Comments */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => setShowComments(true)}
            className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <MessageCircle size={22} className="text-white" fill="white" />
          </button>
          <span className="text-white text-xs font-bold drop-shadow-lg">
            {formatNumber(vibe.comments_count || 0)}
          </span>
        </div>

        {/* ↗️ Share */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => setShowShare(true)}
            className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Share2 size={22} className="text-white" />
          </button>
          <span className="text-white text-xs font-bold drop-shadow-lg">
            {formatNumber(vibe.shares_count || 0)}
          </span>
        </div>

        {/* 🔖 Save */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={handleSave}
            className={'w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-all ' +
              (saved ? 'bg-[#FFD700]/25' : 'bg-black/30 backdrop-blur-sm')}
          >
            <Bookmark
              size={22}
              className={'transition-colors ' + (saved ? 'text-[#FFD700] fill-[#FFD700]' : 'text-white')}
            />
          </button>
          <span className="text-white text-xs font-bold drop-shadow-lg">
            {formatNumber(vibe.saves_count || 0)}
          </span>
        </div>

        {/* ⋯ More */}
        <div className="flex flex-col items-center">
          <button
            onClick={() => setShowOptions(true)}
            className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <MoreHorizontal size={22} className="text-white" />
          </button>
        </div>

        {/* 🎵 Spinning record — at very bottom of action bar */}
        <div className="flex flex-col items-center mt-1">
          <div
            className="w-10 h-10 rounded-full border-3 border-white/30 overflow-hidden bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center"
            style={{
              transform: 'rotate(' + rotation + 'deg)',
              border: '3px solid rgba(255,255,255,0.3)',
            }}
          >
            <Music size={14} className="text-white" />
          </div>
        </div>
      </div>

      {/* ── BOTTOM — Creator info + caption ── */}
      {/* Left side, ends before right action bar, above bottom nav */}
      <div
        className="absolute left-0 z-20 px-4"
        style={{
          right: '72px', // clear the right action bar
          bottom: 'max(72px, calc(64px + env(safe-area-inset-bottom)))', // above bottom nav
        }}
      >
        {/* Creator row */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <button
            onClick={() => navigate('/profile/' + author?.username)}
            className="text-white font-bold text-base drop-shadow-lg hover:underline"
          >
            @{author?.username}
          </button>
          {author?.is_verified && (
            <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓</span>
          )}
          <span className="text-base drop-shadow">{flagMap[author?.country] || '🌍'}</span>
          {vibe.location && (
            <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2 py-0.5">
              <MapPin size={9} className="text-[#FF6B35]" />
              <span className="text-white/80 text-[10px]">{vibe.location}</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {vibe.caption && (
          <p className="text-white text-sm leading-relaxed mb-1.5 drop-shadow line-clamp-2">
            {vibe.caption}
          </p>
        )}

        {/* Hashtags */}
        {vibe.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {vibe.hashtags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[#00D4C8] text-sm font-semibold drop-shadow">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Audio */}
        <div className="flex items-center gap-1.5 mb-1">
          <Music size={11} className="text-white/60 flex-shrink-0" />
          <p className="text-white/60 text-xs truncate" style={{ maxWidth: '200px' }}>
            {vibe.audio_title || 'Original Sound — ' + author?.display_name}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-[10px]">👁 {formatNumber(vibe.views_count || 0)}</span>
          <span className="text-white/50 text-[10px]">⏱ {formatDur(duration)}</span>
          <span className="text-white/50 text-[10px]">{formatTime(vibe.created_at)}</span>
        </div>
      </div>

      {/* ── PROGRESS BAR ── at very bottom */}
      <div
        className="absolute left-0 right-0 z-30 h-1 cursor-pointer"
        style={{ bottom: 'max(64px, calc(64px + env(safe-area-inset-bottom)))' }}
        onClick={handleSeek}
      >
        <div className="w-full h-full bg-white/15">
          <div
            className="h-full bg-gradient-to-r from-[#FF6B35] via-[#FFD700] to-[#1E6FFF] transition-all duration-100"
            style={{ width: progress + '%' }}
          />
        </div>
      </div>

      {/* ── SHARE SHEET ── */}
      {showShare && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowShare(false)}>
          <div
            className="w-full bg-black/92 backdrop-blur-xl rounded-t-3xl border-t border-white/20 p-5 slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-4 text-center">Share Vibe 🔥</h3>
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { icon: '🔗', label: 'Copy Link', action: 'copy' },
                { icon: '📱', label: 'WhatsApp', action: 'whatsapp' },
                { icon: '⬇️', label: 'Download', action: 'download' },
                { icon: '🔁', label: 'Repost', action: 'repost' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleShare(item.action)}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl hover:bg-white/20 transition-colors active:scale-95">
                    {item.icon}
                  </div>
                  <span className="text-white/70 text-xs">{item.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowShare(false)}
              className="w-full py-3.5 bg-white/10 rounded-2xl text-white font-semibold hover:bg-white/15 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── MORE OPTIONS ── */}
      {showOptions && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowOptions(false)}>
          <div
            className="w-full bg-black/92 backdrop-blur-xl rounded-t-3xl border-t border-white/20 p-5 slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
            <div className="space-y-1">
              {[
                { icon: AlertCircle, label: 'Not interested', color: 'text-white/80', show: true },
                { icon: Flag, label: 'Report Vibe', color: 'text-red-400', show: !isOwner },
                { icon: Users, label: 'Block @' + author?.username, color: 'text-red-400', show: !isOwner },
                { icon: Download, label: 'Download Vibe', color: 'text-[#2ECC71]', show: true, action: () => handleShare('download') },
                { icon: Scissors, label: 'Stitch this Vibe', color: 'text-[#1E6FFF]', show: !isOwner },
                { icon: Trash2, label: 'Delete my Vibe', color: 'text-red-400', show: isOwner, action: handleDeleteVibe },
              ].filter((item) => item.show).map((item) => (
                <button
                  key={item.label}
                  onClick={() => { setShowOptions(false); item.action?.(); }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/10 transition-colors active:bg-white/15"
                >
                  <item.icon size={20} className={item.color} />
                  <span className={'text-sm font-medium ' + item.color}>{item.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowOptions(false)}
              className="w-full mt-3 py-3.5 bg-white/10 rounded-2xl text-white font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── COMMENTS PANEL ── */}
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