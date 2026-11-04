import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatNumber';
import { X, Plus, Send, Eye, Pause, Volume2, VolumeX, Trash2 } from 'lucide-react';

/* ── Story reaction options ─────────────────── */
const STORY_REACTIONS = [
  { emoji: '❤️',  label: 'Love'          },
  { emoji: '😂',  label: 'Haha'          },
  { emoji: '😮',  label: 'Wow'           },
  { emoji: '😢',  label: 'Sad'           },
  { emoji: '🔥',  label: 'Fire'          },
  { emoji: '👏',  label: 'Clap'          },
  { emoji: '🎉',  label: 'Celebrate'     },
  { emoji: '🙏',  label: 'Grateful'      },
  { emoji: '💎',  label: 'Gem'           },
  { emoji: '🥳',  label: 'Party'         },
  { emoji: '🎂',  label: 'Happy Birthday'},
  { emoji: '💪',  label: 'Strong'        },
];

const STORY_DURATION = 5000; // 5 seconds per story
const MAX_STORY_IMAGE_MB = 10;
const MAX_STORY_VIDEO_MB = 50;

/* ── Cloudinary delivery-time optimization — inserts f_auto,q_auto
   into the delivery URL as a safety net on top of client-side
   compression. No-op for non-Cloudinary URLs. ──────────────────── */
function optimizeCloudinaryUrl(url, { width } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const params = ['f_auto', 'q_auto', width ? `w_${width}` : null].filter(Boolean).join(',');
  return url.replace('/upload/', `/upload/${params}/`);
}

/* ── Client-side image compression before upload — mirrors the
   approach already used correctly in CreatePost.jsx. Stories
   previously uploaded the raw, uncompressed file directly, which is
   the root cause of the blur/enlarge/low-quality complaint: a large
   or oddly-sized source image with no resizing, then force-cropped
   full-bleed with `object-cover`. Fixed on two fronts — this
   compresses/caps resolution before upload, and the display layer
   below now uses a contain+blurred-backdrop treatment instead of
   cover-cropping. ─────────────────────────────────────────────── */
async function compressStoryImage(file, maxW = 1080, maxH = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob && blob.size < file.size) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          else resolve(file);
        },
        'image/jpeg', quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ── Shared media display: blurred cover backdrop behind a sharp
   contained foreground. This is the actual fix for "blurred,
   enlarged, fills screen and extends" — any image or video,
   regardless of native resolution or aspect ratio, now displays at
   its correct proportions instead of being force-stretched/cropped
   to fill an arbitrary container. Used by both the full-screen
   viewer and the pre-upload preview so what you see before posting
   matches what viewers will see. ──────────────────────────────── */
function StoryMediaFrame({ mediaType, mediaUrl, videoRef, muted, onToggleMute, onEnded, className = '' }) {
  return (
    <div className={`relative w-full h-full overflow-hidden bg-black ${className}`}>
      {/* Blurred backdrop fill */}
      {mediaType === 'video' ? (
        <video src={mediaUrl} muted loop autoPlay playsInline
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
      ) : (
        <img src={optimizeCloudinaryUrl(mediaUrl, { width: 100 })} alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" aria-hidden="true" />
      )}

      {/* Sharp foreground, never upscaled beyond its own resolution's
          display size, never cropped */}
      <div className="absolute inset-0 flex items-center justify-center">
        {mediaType === 'video' ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted={muted}
            playsInline
            loop={false}
            onEnded={onEnded}
          />
        ) : (
          <img
            src={optimizeCloudinaryUrl(mediaUrl, { width: 1080 })}
            alt=""
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        )}
      </div>

      {mediaType === 'video' && onToggleMute && (
        <button
          onClick={e => { e.stopPropagation(); onToggleMute(); }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="absolute bottom-3 right-3 z-20 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center"
        >
          {muted ? <VolumeX size={15} color="white" /> : <Volume2 size={15} color="white" />}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   STORY VIEWER
══════════════════════════════════════════════ */
export function StoryViewer({ stories, startIndex = 0, onClose }) {
  const { user, profile } = useAuth();

  const [currentIndex, setCurrentIndex]     = useState(startIndex);
  const [progress,     setProgress]         = useState(0);
  const [paused,       setPaused]           = useState(false);
  const [showReactions,setShowReactions]    = useState(false);
  const [replyText,    setReplyText]        = useState('');
  const [myReaction,   setMyReaction]       = useState(null);
  const [viewCount,    setViewCount]        = useState(0);
  const [reactionsCount,setReactionsCount]  = useState(0);
  const [viewers,      setViewers]          = useState([]);
  const [showViewers,  setShowViewers]      = useState(false);
  const [sending,      setSending]          = useState(false);
  const [sentFeedback, setSentFeedback]     = useState('');
  const [videoMuted,   setVideoMuted]       = useState(true); // was false — likely blocked by browser autoplay policy
  const [actionError,  setActionError]      = useState('');

  const progressTimer  = useRef(null);
  const progressStart  = useRef(null);
  const progressElapsed= useRef(0);
  const replyInputRef  = useRef(null);
  const touchStartX    = useRef(null);
  const touchStartY    = useRef(null);
  const holdTimer      = useRef(null);
  const lastTap        = useRef(0);
  const videoRef       = useRef(null);

  const story   = stories[currentIndex];
  const isOwner = story?.user_id === user?.id;

  useEffect(() => {
    if (!story || !user?.id) return;
    recordView();
    fetchMyReaction();
    setReactionsCount(story.reactions_count || 0);
    if (isOwner) fetchViewers();
    else setViewCount(story.views_count || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  useEffect(() => {
    startProgress();
    return () => stopProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, paused]);

  // Was: upsert + a separate COUNT(*) query, every single view. Now
  // one atomic RPC call — see record_story_view() in the SQL file.
  const recordView = async () => {
    try {
      const { data, error } = await supabase.rpc('record_story_view', { p_story_id: story.id });
      if (error) throw error;
      if (isOwner) setViewCount(data ?? 0);
    } catch (_) { /* view recording failure shouldn't block viewing */ }
  };

  const fetchMyReaction = async () => {
    const { data } = await supabase
      .from('story_reactions')
      .select('emoji')
      .eq('story_id', story.id)
      .eq('user_id', user.id)
      .maybeSingle();
    setMyReaction(data?.emoji || null);
  };

  const fetchViewers = async () => {
    const { data } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at, users!story_views_viewer_id_fkey(id,username,display_name,avatar_url)')
      .eq('story_id', story.id)
      .order('viewed_at', { ascending: false })
      .limit(50);

    const rows = (data || []).map(r => ({
      ...r,
      user: r['users!story_views_viewer_id_fkey'] || r.users,
    }));
    setViewers(rows);
    setViewCount(rows.length);
  };

  const startProgress = useCallback(() => {
    if (paused) return;
    stopProgress();
    progressStart.current = Date.now();

    const duration = STORY_DURATION - progressElapsed.current;
    if (duration <= 0) { goNext(); return; }

    progressTimer.current = setInterval(() => {
      const elapsed = progressElapsed.current + (Date.now() - progressStart.current);
      const pct = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        stopProgress();
        goNext();
      }
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, currentIndex]);

  const stopProgress = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const pauseStory = useCallback(() => {
    setPaused(true);
    stopProgress();
    progressElapsed.current += Date.now() - (progressStart.current || Date.now());
    if (videoRef.current) videoRef.current.pause();
  }, []);

  const resumeStory = useCallback(() => {
    if (showReactions || replyText) return;
    setPaused(false);
    progressStart.current = Date.now();
    if (videoRef.current) videoRef.current.play().catch(() => {});
  }, [showReactions, replyText]);

  const goNext = useCallback(() => {
    stopProgress();
    progressElapsed.current = 0;
    setProgress(0);
    setShowReactions(false);
    setSentFeedback('');
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, stories.length]);

  const goPrev = useCallback(() => {
    stopProgress();
    progressElapsed.current = 0;
    setProgress(0);
    setShowReactions(false);
    setSentFeedback('');
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    holdTimer.current = setTimeout(() => { pauseStory(); }, 150);
  };

  const handleTouchEnd = (e) => {
    clearTimeout(holdTimer.current);

    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (paused && !showReactions && !replyText) {
      resumeStory();
    }

    if (dist > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    if (dist < 10) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTap.current;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        pauseStory();
        setShowReactions(true);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;

      const screenW = window.innerWidth;
      const tapX = e.changedTouches[0].clientX;
      if (tapX < screenW * 0.35) goPrev();
      else if (tapX > screenW * 0.65) goNext();
    }
  };

  const handleMouseDown = () => {
    holdTimer.current = setTimeout(() => pauseStory(), 150);
  };
  const handleMouseUp = () => {
    clearTimeout(holdTimer.current);
    if (paused && !showReactions && !replyText) resumeStory();
  };

  const handleReplyFocus = () => { pauseStory(); };
  const handleReplyBlur = () => { if (!replyText.trim()) resumeStory(); };

  const sendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    setActionError('');
    const text = replyText.trim();

    try {
      const { error } = await supabase.from('story_replies').insert({
        story_id: story.id, sender_id: user.id, message: text,
      });
      if (error) throw error;

      if (story.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: story.user_id, from_user_id: user.id, type: 'message',
          message: `${profile?.display_name} replied to your status: "${text.slice(0, 60)}"`,
          ref_id: story.id, preview_text: text, preview_image: story.media_url, is_read: false,
        });
      }

      setReplyText('');
      setSentFeedback('Reply sent ✓');
      setTimeout(() => { setSentFeedback(''); resumeStory(); }, 1500);
    } catch (err) {
      setActionError('Couldn\u2019t send reply — try again');
      setTimeout(() => setActionError(''), 2500);
    }
    setSending(false);
  };

  // Was a direct table upsert/delete with no rollback and a live
  // recount never persisted anywhere. Now one atomic RPC — see
  // toggle_story_reaction() in the SQL file — with optimistic UI and
  // rollback on failure, consistent with PostCard's like handler.
  const sendReaction = async (emoji) => {
    setShowReactions(false);
    const prevReaction = myReaction, prevCount = reactionsCount;
    const willRemove = myReaction === emoji;

    setMyReaction(willRemove ? null : emoji);
    setReactionsCount(c => willRemove ? Math.max(0, c - 1) : (myReaction ? c : c + 1));

    try {
      const { data, error } = await supabase.rpc('toggle_story_reaction', { p_story_id: story.id, p_emoji: emoji });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setMyReaction(row.my_reaction); setReactionsCount(row.reactions_count); }

      if (!willRemove) {
        setSentFeedback(emoji + ' Reaction sent');
        setTimeout(() => { setSentFeedback(''); resumeStory(); }, 1200);
      }
    } catch (err) {
      setMyReaction(prevReaction); setReactionsCount(prevCount);
      setActionError('Couldn\u2019t react — try again');
      setTimeout(() => setActionError(''), 2500);
    }

    if (!replyText) resumeStory();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this status?')) return;
    try {
      const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('user_id', user.id);
      if (error) throw error;
      if (stories.length <= 1) onClose();
      else goNext();
    } catch (err) {
      setActionError('Delete failed — try again');
      setTimeout(() => setActionError(''), 2500);
    }
  };

  if (!story) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[2.5px] bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{ width: i < currentIndex ? '100%' : i === currentIndex ? progress + '%' : '0%' }}
            />
          </div>
        ))}
      </div>

      <div className="absolute top-5 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          {story.users?.avatar_url
            ? <img src={story.users.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/50" />
            : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-sm border-2 border-white/50">
                {story.users?.display_name?.[0]?.toUpperCase()}
              </div>
          }
          <div>
            <p className="text-white font-bold text-[13px] leading-none drop-shadow">{story.users?.display_name}</p>
            <p className="text-white/70 text-[11px] mt-0.5">
              {new Date(story.created_at).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              onClick={() => { pauseStory(); setShowViewers(true); }}
              aria-label={`${viewCount} views`}
              className="flex items-center gap-1 bg-black/40 rounded-full px-2.5 py-1"
            >
              <Eye size={13} color="white" />
              <span className="text-white text-[12px] font-semibold">{formatNumber(viewCount)}</span>
            </button>
          )}

          {isOwner && (
            <button
              onClick={handleDelete}
              aria-label="Delete status"
              className="flex items-center gap-1.5 bg-red-500/25 border border-red-500/40 rounded-lg px-2.5 py-1 text-red-400 text-[11px] font-bold hover:bg-red-500/35 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}

          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40">
            <X size={18} color="white" />
          </button>
        </div>
      </div>

      <div
        className="absolute inset-0 z-10"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <StoryMediaFrame
          mediaType={story.media_type}
          mediaUrl={story.media_url}
          videoRef={videoRef}
          muted={videoMuted}
          onToggleMute={() => setVideoMuted(m => !m)}
          onEnded={goNext}
        />

        {paused && !showReactions && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <Pause size={20} color="white" fill="white" />
            </div>
          </div>
        )}
      </div>

      {story.caption && (
        <div className="absolute bottom-32 left-0 right-0 z-20 px-4">
          <p className="text-white text-[15px] font-medium leading-snug drop-shadow-lg text-center"
            style={{ textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>
            {story.caption}
          </p>
        </div>
      )}

      {myReaction && !showReactions && (
        <div className="absolute bottom-36 right-4 z-20">
          <div className="bg-black/50 rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="text-xl">{myReaction}</span>
            <span className="text-white/70 text-xs">You reacted</span>
          </div>
        </div>
      )}

      {(sentFeedback || actionError) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-black/70 rounded-2xl px-6 py-3">
          <p className="text-white font-bold text-center">{sentFeedback || actionError}</p>
        </div>
      )}

      {showReactions && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60"
          onClick={() => { setShowReactions(false); resumeStory(); }}>
          <p className="text-white/80 text-sm font-semibold mb-4 drop-shadow">React to this status</p>
          <div className="grid grid-cols-4 gap-3 px-6" onClick={e => e.stopPropagation()}>
            {STORY_REACTIONS.map(r => (
              <button
                key={r.emoji}
                onClick={() => sendReaction(r.emoji)}
                aria-label={r.label}
                className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all active:scale-90 ${
                  myReaction === r.emoji ? 'bg-white/30 scale-110' : 'bg-white/15 hover:bg-white/25'
                }`}
              >
                <span className="text-3xl leading-none">{r.emoji}</span>
                <span className="text-white/80 text-[10px] font-medium">{r.label}</span>
              </button>
            ))}
          </div>
          <button className="mt-6 text-white/60 text-sm" onClick={() => { setShowReactions(false); resumeStory(); }}>
            Cancel
          </button>
        </div>
      )}

      {showViewers && isOwner && (
        <div className="absolute inset-0 z-30 bg-black/80 flex flex-col" onClick={() => { setShowViewers(false); resumeStory(); }}>
          <div className="absolute bottom-0 left-0 right-0 bg-[#171614] rounded-t-3xl max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
              <div>
                <p className="text-white font-bold">Viewed by</p>
                <p className="text-[#8E8C88] text-sm">{formatNumber(viewCount)} view{viewCount !== 1 ? 's':''}</p>
              </div>
              <button onClick={() => { setShowViewers(false); resumeStory(); }} aria-label="Close" className="text-[#8E8C88] hover:text-white">
                <X size={20} />
              </button>
            </div>
            {viewers.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">👁️</p>
                <p className="text-[#8E8C88] text-sm">No views yet</p>
              </div>
            ) : (
              viewers.map((v, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  {v.user?.avatar_url
                    ? <img src={v.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold flex-shrink-0">{v.user?.display_name?.[0]?.toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[14px]">{v.user?.display_name}</p>
                    <p className="text-[#8E8C88] text-[12px]">@{v.user?.username}</p>
                  </div>
                  <p className="text-[#8E8C88] text-[11px] flex-shrink-0">
                    {new Date(v.viewed_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!showReactions && !showViewers && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pt-4"
          style={{
            background:'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
            paddingBottom:'max(24px, env(safe-area-inset-bottom))',
          }}>
          {!isOwner ? (
            <div className="flex items-center gap-2 w-full min-w-0">
              <div className="flex gap-1.5 flex-shrink-0">
                {['❤️','😂','🔥','😮'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    aria-label={'React ' + emoji}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 transition-transform ${
                      myReaction === emoji ? 'bg-white/40 scale-110' : 'bg-white/15 hover:bg-white/25'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full pl-3.5 pr-2 py-1.5">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onFocus={handleReplyFocus}
                  onBlur={handleReplyBlur}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } }}
                  placeholder="Reply to status..."
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-sm placeholder-white/50"
                />
                {replyText.trim() && (
                  <button
                    onClick={sendReply}
                    disabled={sending}
                    aria-label="Send reply"
                    className="w-7 h-7 rounded-full bg-[#FF5A1F] flex items-center justify-center flex-shrink-0 disabled:opacity-60"
                  >
                    {sending
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Send size={12} color="white" className="ml-0.5" />
                    }
                  </button>
                )}
              </div>

              <button
                onClick={() => { pauseStory(); setShowReactions(true); }}
                aria-label="More reactions"
                className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg flex-shrink-0"
              >
                {myReaction || '😊'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { pauseStory(); setShowViewers(true); }}
                className="flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-2"
              >
                <Eye size={15} color="white" />
                <span className="text-white text-sm font-semibold">{formatNumber(viewCount)} view{viewCount !== 1 ? 's':''}</span>
              </button>
              {reactionsCount > 0 && (
                <span className="text-white/70 text-sm">{formatNumber(reactionsCount)} reaction{reactionsCount !== 1 ? 's' : ''}</span>
              )}
              <span className="text-white/45 text-xs hidden sm:inline">Double tap to react</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   STORY RING (thumbnail in home feed)
══════════════════════════════════════════════ */
function StoryRing({ storyGroup, onPress, onAddPress, isOwn, hasUnviewed, hasStories }) {
  const u = storyGroup.user;
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 relative" style={{ width: 68 }}>
      <button onClick={onPress} aria-label={isOwn ? 'Your status' : `${u?.display_name}'s status`} className="relative">
        <div className={`w-14 h-14 rounded-full p-[2px] ${
          hasUnviewed
            ? 'bg-gradient-to-tr from-[#FFD700] via-[#FF6B35] to-[#FF2D78]'
            : 'bg-white/20'
        }`}>
          <div className="w-full h-full rounded-full overflow-hidden bg-[#0D0C0B] p-[2px]">
            {isOwn && !hasStories ? (
              <div className="w-full h-full rounded-full bg-[#FF5A1F]/20 flex items-center justify-center border-2 border-dashed border-[#FF5A1F]/60">
                <Plus size={20} className="text-[#FF5A1F]" />
              </div>
            ) : u?.avatar_url ? (
              <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-lg">
                {u?.display_name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* "+" badge to add another status even when some already
            exist — previously there was no way to do this once you
            had at least one active story; the strip's add-status
            fallback only appeared with zero stories. */}
        {isOwn && hasStories && (
          <span
            onClick={e => { e.stopPropagation(); onAddPress(); }}
            role="button"
            aria-label="Add another status"
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#FF5A1F] border-2 border-[#0D0C0B] flex items-center justify-center"
          >
            <Plus size={11} color="white" strokeWidth={3} />
          </span>
        )}
      </button>
      <p className="text-white/80 text-[10px] font-medium text-center leading-tight truncate w-full px-1">
        {isOwn ? 'Your Status' : u?.display_name?.split(' ')[0]}
      </p>
    </div>
  );
}

function StoryRingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 68 }}>
      <div className="w-14 h-14 rounded-full skeleton" />
      <div className="h-2.5 w-10 rounded-full skeleton" />
    </div>
  );
}

/* ══════════════════════════════════════════════
   CREATE STORY (upload)
══════════════════════════════════════════════ */
export function StoryCreator({ onClose, onCreated }) {
  const { user } = useAuth();
  const fileRef  = useRef();
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error,   setError]   = useState('');
  const CAPTION_LIMIT = 150;

  // Object URLs must be revoked or they leak for the life of the tab.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const isVideo = f.type.startsWith('video');
    const maxBytes = (isVideo ? MAX_STORY_VIDEO_MB : MAX_STORY_IMAGE_MB) * 1024 * 1024;
    if (f.size > maxBytes) {
      setError(`${isVideo ? 'Video' : 'Image'} must be under ${isVideo ? MAX_STORY_VIDEO_MB : MAX_STORY_IMAGE_MB} MB.`);
      e.target.value = '';
      return;
    }

    setError('');
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    setMediaType(isVideo ? 'video' : 'image');
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError('');

    try {
      const isVideo = mediaType === 'video';
      let uploadFile = file;

      if (!isVideo) {
        setCompressing(true);
        uploadFile = await compressStoryImage(file);
        setCompressing(false);
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('upload_preset', 'blink_uploads');
      formData.append('cloud_name', process.env.REACT_APP_CLOUDINARY_CLOUD_NAME);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/${isVideo ? 'video' : 'image'}/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');

      const { error: dbErr } = await supabase.from('stories').insert({
        user_id:    user.id,
        media_url:  data.secure_url,
        media_type: isVideo ? 'video' : 'image',
        caption:    caption.trim() || null,
        duration:   isVideo ? Math.min(Math.ceil(data.duration || 15), 30) : 5,
      });

      if (dbErr) throw new Error(dbErr.message);

      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    setCompressing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Add Status</h3>
          <button onClick={onClose} aria-label="Close" className="text-[#8E8C88] hover:text-white"><X size={20} /></button>
        </div>

        {!preview ? (
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-white/20 rounded-2xl py-12 flex flex-col items-center gap-3 hover:border-[#FF5A1F]/50 transition-colors"
            >
              <span className="text-5xl">📷</span>
              <p className="text-white font-bold">Tap to choose photo or video</p>
              <p className="text-[#8E8C88] text-sm">Disappears after 24 hours</p>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
            {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
          </div>
        ) : (
          <div>
            {/* Preview now uses the same contain+blurred-backdrop
                treatment as the real viewer, at near-fullscreen size —
                previously this was a small object-cover box capped at
                360px, which didn't represent what viewers would
                actually see. */}
            <div className="relative rounded-2xl overflow-hidden mb-4" style={{ aspectRatio:'9/16', maxHeight:420 }}>
              <StoryMediaFrame mediaType={mediaType} mediaUrl={preview} muted={true} />
              <button
                onClick={() => { setFile(null); setPreview(null); setMediaType(null); }}
                aria-label="Remove"
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-30"
              >
                <X size={14} color="white" />
              </button>
            </div>

            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value.slice(0, CAPTION_LIMIT))}
              placeholder="Add a caption... (optional)"
              maxLength={CAPTION_LIMIT}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#8E8C88] focus:outline-none mb-1.5"
            />
            <div className="flex justify-end mb-3">
              <span className="text-[#8E8C88] text-[11px]">{caption.length}/{CAPTION_LIMIT}</span>
            </div>

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background:'linear-gradient(135deg, #FF5A1F, #FF2D78)' }}
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {compressing ? 'Optimising...' : 'Uploading...'}</>
                : '🚀 Share Status'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN STORIES STRIP (shown in Home feed)
══════════════════════════════════════════════ */
export default function Stories() {
  const { user } = useAuth();

  const [storyGroups,  setStoryGroups]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [viewerOpen,   setViewerOpen]   = useState(false);
  const [viewerStories,setViewerStories]= useState([]);
  const [viewerStart,  setViewerStart]  = useState(0);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [viewedIds,    setViewedIds]    = useState(new Set());

  const refetchTimerRef = useRef(null);

  useEffect(() => {
    fetchStories();
    fetchViewedIds();

    // Debounced — previously every INSERT/DELETE from any user
    // triggered an immediate full refetch with no coalescing, so a
    // burst of activity (several people posting stories at once)
    // meant a burst of redundant refetches.
    const debouncedRefetch = () => {
      clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(fetchStories, 800);
    };

    const ch = supabase.channel('stories:rt')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'stories' }, debouncedRefetch)
      .on('postgres_changes', { event:'DELETE',  schema:'public', table:'stories' }, debouncedRefetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(refetchTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchViewedIds = async () => {
    const { data } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', user.id);
    setViewedIds(new Set((data || []).map(r => r.story_id)));
  };

  const fetchStories = async () => {
    const { data, error } = await supabase
      .from('stories')
      .select(`
        id, user_id, media_url, media_type, caption, duration,
        views_count, reactions_count, created_at, expires_at,
        users!stories_user_id_fkey(id, username, display_name, avatar_url, is_verified)
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) { console.error('fetchStories:', error.message); setLoading(false); return; }

    const rows = (data || []).map(s => ({
      ...s,
      users: s['users!stories_user_id_fkey'] || s.users,
    }));

    const groupMap = {};
    rows.forEach(s => {
      if (!groupMap[s.user_id]) {
        groupMap[s.user_id] = { user: s.users, userId: s.user_id, stories: [] };
      }
      groupMap[s.user_id].stories.push(s);
    });

    const groups = Object.values(groupMap).sort((a, b) => {
      if (a.userId === user.id) return -1;
      if (b.userId === user.id) return 1;
      return 0;
    });

    setStoryGroups(groups);
    setLoading(false);
  };

  const openViewer = (group, startIdx = 0) => {
    setViewerStories(group.stories.map(s => ({ ...s, users: group.user })));
    setViewerStart(startIdx);
    setViewerOpen(true);
  };

  const handleStoryRingPress = (group) => {
    if (group.userId === user.id && !group.stories?.length) {
      setCreateOpen(true);
      return;
    }
    openViewer(group, 0);
  };

  const hasUnviewed = (group) => {
    if (group.userId === user.id) return false;
    return group.stories.some(s => !viewedIds.has(s.id));
  };

  const ownGroup = storyGroups.find(g => g.userId === user.id) || { userId: user.id, user: null, stories: [] };
  const otherGroups = storyGroups.filter(g => g.userId !== user.id);
  const allGroups = [ownGroup, ...otherGroups];

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 py-3 border-b border-white/[0.06]"
        style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          Array(6).fill(0).map((_, i) => <StoryRingSkeleton key={i} />)
        ) : (
          allGroups.map(group => (
            <StoryRing
              key={group.userId}
              storyGroup={group}
              onPress={() => handleStoryRingPress(group)}
              onAddPress={() => setCreateOpen(true)}
              isOwn={group.userId === user.id}
              hasStories={group.stories?.length > 0}
              hasUnviewed={hasUnviewed(group)}
            />
          ))
        )}
      </div>

      {viewerOpen && (
        <StoryViewer
          stories={viewerStories}
          startIndex={viewerStart}
          onClose={() => {
            setViewerOpen(false);
            fetchViewedIds();
            fetchStories();
          }}
        />
      )}

      {createOpen && (
        <StoryCreator
          onClose={() => setCreateOpen(false)}
          onCreated={() => { fetchStories(); setCreateOpen(false); }}
        />
      )}
    </>
  );
}