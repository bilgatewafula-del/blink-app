import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatNumber';
import { X, Plus, Send, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [viewers,      setViewers]          = useState([]);
  const [showViewers,  setShowViewers]      = useState(false);
  const [sending,      setSending]          = useState(false);
  const [sentFeedback, setSentFeedback]     = useState('');

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

  /* ── Record view ── */
  useEffect(() => {
    if (!story || !user?.id) return;
    recordView();
    fetchMyReaction();
    if (isOwner) fetchViewers();
    else setViewCount(story.views_count || 0);
  }, [currentIndex]);

  /* ── Progress timer ── */
  useEffect(() => {
    startProgress();
    return () => stopProgress();
  }, [currentIndex, paused]);

  const recordView = async () => {
    try {
      await supabase.from('story_views').upsert(
        { story_id: story.id, viewer_id: user.id },
        { onConflict: 'story_id,viewer_id' }
      );
      // Fetch real count
      const { count } = await supabase
        .from('story_views')
        .select('id', { count: 'exact', head: true })
        .eq('story_id', story.id);
      setViewCount(count || 0);
    } catch (_) {}
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

  /* ── Progress control ── */
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
    if (showReactions || replyText) return; // keep paused if typing/reacting
    setPaused(false);
    progressStart.current = Date.now();
    if (videoRef.current) videoRef.current.play().catch(() => {});
  }, [showReactions, replyText]);

  /* ── Navigation ── */
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

  /* ── Touch handlers ── */
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;

    // Hold to pause
    holdTimer.current = setTimeout(() => {
      pauseStory();
    }, 150);
  };

  const handleTouchEnd = (e) => {
    clearTimeout(holdTimer.current);

    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Resume if was holding
    if (paused && !showReactions && !replyText) {
      resumeStory();
    }

    // Swipe left/right for navigation (only if not dragging vertically)
    if (dist > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    // Double tap — show reactions
    if (dist < 10) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTap.current;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Double tap!
        pauseStory();
        setShowReactions(true);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;

      // Single tap — left/right navigation
      const screenW = window.innerWidth;
      const tapX = e.changedTouches[0].clientX;
      if (tapX < screenW * 0.35) goPrev();
      else if (tapX > screenW * 0.65) goNext();
    }
  };

  /* ── Mouse hold (desktop) ── */
  const handleMouseDown = () => {
    holdTimer.current = setTimeout(() => pauseStory(), 150);
  };
  const handleMouseUp = () => {
    clearTimeout(holdTimer.current);
    if (paused && !showReactions && !replyText) resumeStory();
  };

  /* ── Reply ── */
  const handleReplyFocus = () => {
    pauseStory();
  };

  const handleReplyBlur = () => {
    if (!replyText.trim()) resumeStory();
  };

  const sendReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);

    try {
      // Insert reply
      await supabase.from('story_replies').insert({
        story_id:  story.id,
        sender_id: user.id,
        message:   replyText.trim(),
      });

      // Notify story owner
      if (story.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id:      story.user_id,
          from_user_id: user.id,
          type:         'message',
          message:      `${profile?.display_name} replied to your status: "${replyText.slice(0, 60)}"`,
          ref_id:       story.id,
          preview_text: replyText.trim(),
          preview_image: story.media_url,
          is_read:      false,
        });
      }

      setReplyText('');
      setSentFeedback('Reply sent ✓');
      setTimeout(() => {
        setSentFeedback('');
        resumeStory();
      }, 1500);
    } catch (err) {
      console.error('reply error:', err.message);
    }
    setSending(false);
  };

  /* ── Reaction ── */
  const sendReaction = async (emoji) => {
    setShowReactions(false);

    try {
      if (myReaction === emoji) {
        // Toggle off
        await supabase.from('story_reactions')
          .delete().eq('story_id', story.id).eq('user_id', user.id);
        setMyReaction(null);
      } else {
        await supabase.from('story_reactions').upsert(
          { story_id: story.id, user_id: user.id, emoji },
          { onConflict: 'story_id,user_id' }
        );
        setMyReaction(emoji);

        // Notify story owner
        if (story.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id:       story.user_id,
            from_user_id:  user.id,
            type:          'message',
            message:       `${profile?.display_name} reacted ${emoji} to your status`,
            ref_id:        story.id,
            preview_image: story.media_url,
            is_read:       false,
          });
        }

        setSentFeedback(emoji + ' Reaction sent');
        setTimeout(() => {
          setSentFeedback('');
          resumeStory();
        }, 1200);
      }
    } catch (err) {
      console.error('reaction error:', err.message);
    }

    if (!replyText) resumeStory();
  };

  if (!story) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col select-none"
      style={{ touchAction: 'none' }}
    >
      {/* ── Progress bars ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[2.5px] bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width: i < currentIndex ? '100%' : i === currentIndex ? progress + '%' : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Author bar ── */}
      <div className="absolute top-5 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          {story.users?.avatar_url
            ? <img src={story.users.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/50" />
            : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-sm border-2 border-white/50">
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

        <div className="flex items-center gap-3">
          {/* View count — real, only shown to story owner */}
          {isOwner && (
            <button
              onClick={() => { pauseStory(); setShowViewers(true); }}
              className="flex items-center gap-1 bg-black/40 rounded-full px-2.5 py-1"
            >
              <Eye size={13} color="white" />
              <span className="text-white text-[12px] font-semibold">{formatNumber(viewCount)}</span>
            </button>
          )}

          {/* Delete (owner only) */}
          {isOwner && (
            <button
              onClick={async () => {
                if (!window.confirm('Delete this status?')) return;
                await supabase.from('stories').delete().eq('id', story.id);
                if (stories.length <= 1) onClose();
                else goNext();
              }}
              style={{
                background:'rgba(239,68,68,0.25)', border:'1px solid rgba(239,68,68,0.4)',
                borderRadius:8, padding:'4px 10px', cursor:'pointer',
                color:'#EF4444', fontSize:11, fontWeight:700,
              }}
            >
              🗑️ Delete
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40"
          >
            <X size={18} color="white" />
          </button>
        </div>
      </div>

      {/* ── Media — touch area ── */}
      <div
        className="absolute inset-0 z-10"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {story.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={story.media_url}
            className="w-full h-full object-cover"
            autoPlay
            muted={false}
            playsInline
            loop={false}
            onEnded={goNext}
          />
        ) : (
          <img
            src={story.media_url}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Dim overlay when paused */}
        {paused && !showReactions && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <div className="w-4 h-4 border-l-2 border-r-2 border-white" style={{ height:18, borderLeftWidth:4, borderRightWidth:4 }} />
            </div>
          </div>
        )}

        {/* Navigation taps visual */}
        <div className="absolute inset-0 flex">
          <div className="w-1/3 h-full" /> {/* left tap zone */}
          <div className="w-1/3 h-full" /> {/* center */}
          <div className="w-1/3 h-full" /> {/* right tap zone */}
        </div>
      </div>

      {/* ── Caption ── */}
      {story.caption && (
        <div className="absolute bottom-32 left-0 right-0 z-20 px-4">
          <p className="text-white text-[15px] font-medium leading-snug drop-shadow-lg text-center"
            style={{ textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>
            {story.caption}
          </p>
        </div>
      )}

      {/* ── My reaction indicator ── */}
      {myReaction && !showReactions && (
        <div className="absolute bottom-36 right-4 z-20">
          <div className="bg-black/50 rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="text-xl">{myReaction}</span>
            <span className="text-white/70 text-xs">You reacted</span>
          </div>
        </div>
      )}

      {/* ── Sent feedback ── */}
      {sentFeedback && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-black/70 rounded-2xl px-6 py-3">
          <p className="text-white font-bold text-center">{sentFeedback}</p>
        </div>
      )}

      {/* ── REACTION PICKER (double tap) ── */}
      {showReactions && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60"
          onClick={() => { setShowReactions(false); resumeStory(); }}>
          <p className="text-white/80 text-sm font-semibold mb-4 drop-shadow">React to this status</p>
          <div
            className="grid grid-cols-4 gap-3 px-6"
            onClick={e => e.stopPropagation()}
          >
            {STORY_REACTIONS.map(r => (
              <button
                key={r.emoji}
                onClick={() => sendReaction(r.emoji)}
                className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all active:scale-90 ${
                  myReaction === r.emoji ? 'bg-white/30 scale-110' : 'bg-white/15 hover:bg-white/25'
                }`}
              >
                <span className="text-3xl leading-none">{r.emoji}</span>
                <span className="text-white/80 text-[10px] font-medium">{r.label}</span>
              </button>
            ))}
          </div>
          <button
            className="mt-6 text-white/60 text-sm"
            onClick={() => { setShowReactions(false); resumeStory(); }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── VIEWER LIST (owner only) ── */}
      {showViewers && isOwner && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex flex-col"
          onClick={() => { setShowViewers(false); resumeStory(); }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#0d1f3c] rounded-t-3xl max-h-[60vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
              <div>
                <p className="text-white font-bold">Viewed by</p>
                <p className="text-[#6B7280] text-sm">{formatNumber(viewCount)} view{viewCount !== 1 ? 's':''}</p>
              </div>
              <button onClick={() => { setShowViewers(false); resumeStory(); }} className="text-[#6B7280] hover:text-white">
                <X size={20} />
              </button>
            </div>
            {viewers.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">👁️</p>
                <p className="text-[#6B7280] text-sm">No views yet</p>
              </div>
            ) : (
              viewers.map((v, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  {v.user?.avatar_url
                    ? <img src={v.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold flex-shrink-0">{v.user?.display_name?.[0]?.toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[14px]">{v.user?.display_name}</p>
                    <p className="text-[#6B7280] text-[12px]">@{v.user?.username}</p>
                  </div>
                  <p className="text-[#6B7280] text-[11px] flex-shrink-0">
                    {new Date(v.viewed_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── BOTTOM — Reply / React bar — constrained, no overflow ── */}
      {!showReactions && !showViewers && (
        <div
          style={{
            position:'absolute', bottom:0, left:0, right:0, zIndex:20,
            background:'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
            paddingLeft:12, paddingRight:12,
            paddingBottom:'max(24px, env(safe-area-inset-bottom))',
            paddingTop:16,
            boxSizing:'border-box',
            width:'100%',
            maxWidth:'100vw',
            overflow:'hidden',
          }}
        >
          {!isOwner ? (
            /* ── Reply input (non-owner) — fully constrained ── */
            <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%', minWidth:0 }}>
              {/* Quick reactions */}
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                {['❤️','😂','🔥','😮'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    style={{
                      width:36, height:36, borderRadius:'50%',
                      background: myReaction === emoji ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                      border:'none', cursor:'pointer', fontSize:18,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      flexShrink:0, transform: myReaction === emoji ? 'scale(1.15)' : 'scale(1)',
                      transition:'transform 0.15s',
                    }}
                  >{emoji}</button>
                ))}
              </div>

              {/* Text input — flex-1 with min-width:0 to prevent overflow */}
              <div style={{
                flex:'1 1 0', minWidth:0,
                display:'flex', alignItems:'center', gap:6,
                background:'rgba(255,255,255,0.15)',
                border:'1px solid rgba(255,255,255,0.25)',
                borderRadius:24, paddingLeft:14, paddingRight:8, paddingTop:8, paddingBottom:8,
              }}>
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onFocus={handleReplyFocus}
                  onBlur={handleReplyBlur}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } }}
                  placeholder="Reply to status..."
                  style={{
                    flex:'1 1 0', minWidth:0,
                    background:'transparent', border:'none', outline:'none',
                    color:'white', fontSize:14, fontFamily:'inherit',
                    width:'100%',
                  }}
                />
                {replyText.trim() && (
                  <button
                    onClick={sendReply}
                    disabled={sending}
                    style={{
                      width:30, height:30, borderRadius:'50%', flexShrink:0,
                      background:'#1E6FFF', border:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >
                    {sending
                      ? <div style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                      : <Send size={12} color="white" style={{ marginLeft:1 }} />
                    }
                  </button>
                )}
              </div>

              {/* More reactions button */}
              <button
                onClick={() => { pauseStory(); setShowReactions(true); }}
                style={{
                  width:36, height:36, borderRadius:'50%', flexShrink:0,
                  background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer',
                  fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
                }}
              >
                {myReaction || '😊'}
              </button>
            </div>
          ) : (
            /* ── Owner: view count + hint ── */
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12 }}>
              <button
                onClick={() => { pauseStory(); setShowViewers(true); }}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
                  borderRadius:24, padding:'8px 16px', cursor:'pointer',
                }}
              >
                <Eye size={15} color="white" />
                <span style={{ color:'white', fontSize:14, fontWeight:600 }}>
                  {formatNumber(viewCount)} view{viewCount !== 1 ? 's':''}
                </span>
              </button>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:12 }}>Double tap to react</span>
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
function StoryRing({ storyGroup, onPress, isOwn, hasUnviewed }) {
  const u = storyGroup.user;
  return (
    <button
      onClick={onPress}
      className="flex flex-col items-center gap-1 flex-shrink-0"
      style={{ width: 68 }}
    >
      <div className={`w-14 h-14 rounded-full p-[2px] ${
        hasUnviewed
          ? 'bg-gradient-to-tr from-[#FFD700] via-[#FF6B35] to-[#7B2FFF]'
          : 'bg-white/20'
      }`}>
        <div className="w-full h-full rounded-full overflow-hidden bg-[#0A1628] p-[2px]">
          {isOwn && !storyGroup.stories?.length ? (
            /* Add story button */
            <div className="w-full h-full rounded-full bg-[#1E6FFF]/20 flex items-center justify-center border-2 border-dashed border-[#1E6FFF]/60">
              <Plus size={20} className="text-[#1E6FFF]" />
            </div>
          ) : u?.avatar_url ? (
            <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">
              {u?.display_name?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </div>
      <p className="text-white/80 text-[10px] font-medium text-center leading-tight truncate w-full px-1">
        {isOwn ? 'Your Status' : u?.display_name?.split(' ')[0]}
      </p>
    </button>
  );
}

/* ══════════════════════════════════════════════
   CREATE STORY (upload)
══════════════════════════════════════════════ */
export function StoryCreator({ onClose, onCreated }) {
  const { user, profile } = useAuth();
  const fileRef  = useRef();
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error,   setError]   = useState('');

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError('');

    try {
      const isVideo  = file.type.startsWith('video');
      const formData = new FormData();
      formData.append('file', file);
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
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#0d1f3c] rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Add Status</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
        </div>

        {!preview ? (
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-white/20 rounded-2xl py-12 flex flex-col items-center gap-3 hover:border-[#1E6FFF]/50 transition-colors"
            >
              <span className="text-5xl">📷</span>
              <p className="text-white font-bold">Tap to choose photo or video</p>
              <p className="text-[#6B7280] text-sm">Disappears after 24 hours</p>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <div>
            <div className="relative rounded-2xl overflow-hidden mb-4" style={{ aspectRatio:'9/16', maxHeight:360 }}>
              {file?.type.startsWith('video')
                ? <video src={preview} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                : <img src={preview} alt="" className="w-full h-full object-cover" />
              }
              <button
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X size={14} color="white" />
              </button>
            </div>

            <input
              type="text"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Add a caption... (optional)"
              maxLength={150}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-[#6B7280] focus:outline-none mb-4"
            />

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background:'linear-gradient(135deg, #1E6FFF, #7B2FFF)' }}
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading...</>
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
  const navigate = useNavigate();

  const [storyGroups,  setStoryGroups]  = useState([]);
  const [viewerOpen,   setViewerOpen]   = useState(false);
  const [viewerStories,setViewerStories]= useState([]);
  const [viewerStart,  setViewerStart]  = useState(0);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [viewedIds,    setViewedIds]    = useState(new Set());

  useEffect(() => {
    fetchStories();
    fetchViewedIds();

    const ch = supabase.channel('stories:rt')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'stories' }, fetchStories)
      .on('postgres_changes', { event:'DELETE',  schema:'public', table:'stories' }, fetchStories)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const fetchViewedIds = async () => {
    const { data } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', user.id);
    setViewedIds(new Set((data || []).map(r => r.story_id)));
  };

  const fetchStories = async () => {
    // Only fetch non-expired stories
    const { data, error } = await supabase
      .from('stories')
      .select(`
        id, user_id, media_url, media_type, caption, duration,
        views_count, reactions_count, created_at, expires_at,
        users!stories_user_id_fkey(id, username, display_name, avatar_url, is_verified)
      `)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) { console.error('fetchStories:', error.message); return; }

    const rows = (data || []).map(s => ({
      ...s,
      users: s['users!stories_user_id_fkey'] || s.users,
    }));

    // Group by user_id
    const groupMap = {};
    rows.forEach(s => {
      if (!groupMap[s.user_id]) {
        groupMap[s.user_id] = { user: s.users, userId: s.user_id, stories: [] };
      }
      groupMap[s.user_id].stories.push(s);
    });

    // Put own stories first, then others
    const groups = Object.values(groupMap).sort((a, b) => {
      if (a.userId === user.id) return -1;
      if (b.userId === user.id) return 1;
      return 0;
    });

    setStoryGroups(groups);
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
    if (group.userId === user.id) return false; // own stories always grey
    return group.stories.some(s => !viewedIds.has(s.id));
  };

  // Always show own slot (even if no stories yet)
  const ownGroup = storyGroups.find(g => g.userId === user.id) || { userId: user.id, user: null, stories: [] };
  const otherGroups = storyGroups.filter(g => g.userId !== user.id);
  const allGroups = [ownGroup, ...otherGroups];

  return (
    <>
      {/* Story strip */}
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 py-3 border-b border-white/[0.06]"
        style={{ WebkitOverflowScrolling: 'touch' }}>
        {allGroups.map(group => (
          <StoryRing
            key={group.userId}
            storyGroup={group}
            onPress={() => handleStoryRingPress(group)}
            isOwn={group.userId === user.id}
            hasUnviewed={hasUnviewed(group)}
          />
        ))}

        {/* Add status button if no own stories */}
        {!storyGroups.find(g => g.userId === user.id) && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
            style={{ width: 68 }}
          >
            <div className="w-14 h-14 rounded-full bg-[#1E6FFF]/20 border-2 border-dashed border-[#1E6FFF]/50 flex items-center justify-center">
              <Plus size={22} className="text-[#1E6FFF]" />
            </div>
            <p className="text-white/80 text-[10px] font-medium">Add Status</p>
          </button>
        )}
      </div>

      {/* Story viewer */}
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

      {/* Create story sheet */}
     {createOpen && (
  <StoryCreator
    onClose={() => setCreateOpen(false)}
    onCreated={() => { fetchStories(); setCreateOpen(false); }}
  />
)}
    </>
  );
}