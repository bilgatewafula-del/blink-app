// src/components/stories/StoryViewer.js
// Full-screen status viewer: smooth playback, friends-only reactions and
// replies (delivered to chat), live view counts for the owner.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { X, Send, Eye, Trash2, Share2, Heart, Plus, ChevronUp, Check } from 'lucide-react';
import Avatar from '../Avatar';
import VerifiedBadge from '../VerifiedBadge';
import { Spinner } from '../ui';
import useViewport from '../../lib/useViewport';
import { bgCss, textSizeFor, textDuration } from '../../lib/storyPalette';
import { feedImageUrl } from '../../lib/imageUtils';
import {
  STORY_REACTIONS, recordStoryView, reactToStory, replyToStory, fetchStoryViewers, shareStory,
  deleteStory, firstUnviewedIndex, timeAgo,
} from '../../lib/stories';

const IMAGE_MS = 6000;

function Sheet({ onClose, children }) {
  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-[#171614] rounded-t-3xl border-t border-white/10 pb-[max(14px,env(safe-area-inset-bottom))] max-h-[75%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />
        {children}
      </div>
    </div>
  );
}

export default function StoryViewer({ groups, startGroup = 0, onClose, onViewed, onDeleted, onAdd }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const me = user?.id;
  const vp = useViewport();

  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(() => firstUnviewedIndex(groups[startGroup], me));
  const [loaded, setLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [hold, setHold] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState(false);
  const [pop, setPop] = useState(null);
  const [toast, setToast] = useState(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [counts, setCounts] = useState(() => {
    const o = {};
    groups.forEach((g) => g.stories.forEach((s) => { o[s.id] = { views: s.views_count || 0, reactions: s.reactions_count || 0 }; }));
    return o;
  });
  const [mine, setMine] = useState(() => {
    const o = {};
    groups.forEach((g) => g.stories.forEach((s) => { if (s.my_reaction) o[s.id] = s.my_reaction; }));
    return o;
  });

  const bar = useRef(null);
  const elapsed = useRef(0);
  const gesture = useRef({ x: 0, y: 0, t: 0, timer: null, held: false });
  const toastTimer = useRef(null);

  const group = groups[gi];
  const story = group?.stories[si];
  const isOwner = story?.user_id === me;
  const isText = story?.story_type === 'text';
  const durationMs = story ? (isText ? textDuration((story.text_content || '').length) * 1000 : IMAGE_MS) : IMAGE_MS;
  const paused = hold || hidden || replying || tray || viewersOpen || shareOpen || confirmDel || !!toast?.sticky;

  const showToast = useCallback((text, extra = {}) => {
    setToast({ text, ...extra });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), extra.sticky ? 4500 : 2400);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ── move between statuses and friends ── */
  const next = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(firstUnviewedIndex(groups[gi + 1], me)); }
    else onClose();
  }, [group, si, gi, groups, me, onClose]);

  const prev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
    else { elapsed.current = 0; }
  }, [si, gi, groups]);

  useEffect(() => { if (!story) onClose(); }, [story, onClose]);

  /* ── reset when the status changes ── */
  useEffect(() => {
    if (!story) return;
    elapsed.current = 0;
    if (bar.current) bar.current.style.transform = 'scaleX(0)';
    setLoaded(isText);
    setImgFailed(false);
    setReply(''); setTray(false); setViewersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  /* ── progress (written straight to the DOM, no re-render per frame) ── */
  useEffect(() => {
    if (!story || !loaded || paused) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / durationMs);
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, loaded, paused, durationMs, next]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ── record the view (never blocks playback) + warm up what comes next ── */
  useEffect(() => {
    if (!story) return;
    let live = true;
    recordStoryView(story.id).then((n) => {
      if (!live) return;
      if (isOwner && typeof n === 'number') setCounts((c) => ({ ...c, [story.id]: { ...c[story.id], views: n } }));
      if (!isOwner) onViewed?.(story.id);
    }).catch(() => {});

    const upcoming = [group.stories[si + 1], group.stories[si + 2], groups[gi + 1]?.stories[0]].filter(Boolean);
    upcoming.forEach((s) => { if (s.story_type === 'image' && s.media_url) { const img = new window.Image(); img.src = feedImageUrl(s.media_url, 1080); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  /* ── live numbers for the owner ── */
  useEffect(() => {
    const ownIds = new Set(groups.filter((g) => g.userId === me).flatMap((g) => g.stories.map((s) => s.id)));
    if (ownIds.size === 0) return undefined;
    const ch = supabase.channel('story-live:' + me + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_views' }, (p) => {
        const sid = p.new?.story_id;
        if (!ownIds.has(sid)) return;
        setCounts((c) => ({ ...c, [sid]: { ...(c[sid] || { reactions: 0 }), views: ((c[sid]?.views) || 0) + 1 } }));
        setViewers((v) => (v === null ? v : null)); // refetched below when the list is open
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_reactions' }, (p) => {
        const sid = (p.new?.story_id) || (p.old?.story_id);
        if (!ownIds.has(sid)) return;
        if (p.eventType === 'INSERT') setCounts((c) => ({ ...c, [sid]: { ...(c[sid] || { views: 0 }), reactions: ((c[sid]?.reactions) || 0) + 1 } }));
        if (p.eventType === 'DELETE') setCounts((c) => ({ ...c, [sid]: { ...(c[sid] || { views: 0 }), reactions: Math.max(0, ((c[sid]?.reactions) || 1) - 1) } }));
        setViewers((v) => (v === null ? v : null));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [groups, me]);

  const loadViewers = useCallback(async () => {
    if (!story) return;
    try { setViewers(await fetchStoryViewers(story.id)); } catch { setViewers([]); }
  }, [story]);

  useEffect(() => { if (viewersOpen && viewers === null) loadViewers(); }, [viewersOpen, viewers, loadViewers]);
  useEffect(() => { setViewers(null); }, [story?.id]);

  /* ── gestures ── */
  const onDown = (e) => {
    const g = gesture.current;
    g.x = e.clientX; g.y = e.clientY; g.t = Date.now(); g.held = false;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => { g.held = true; setHold(true); }, 220);
  };
  const onUp = (e) => {
    const g = gesture.current;
    clearTimeout(g.timer);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.held) { setHold(false); g.held = false; if (Math.abs(dy) < 80) return; }
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    if (dy < -80 && Math.abs(dy) > Math.abs(dx)) { if (isOwner) setViewersOpen(true); else setTray(true); return; }
    if (Math.abs(dx) > 70) { dx < 0 ? next() : prev(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    if ((e.clientX - rect.left) / rect.width < 0.33) prev(); else next();
  };
  const onCancel = () => { clearTimeout(gesture.current.timer); setHold(false); };

  /* ── actions ── */
  const react = async (emoji) => {
    setTray(false);
    const before = mine[story.id] || null;
    const after = before === emoji ? null : emoji;
    setMine((m) => { const n = { ...m }; if (after) n[story.id] = after; else delete n[story.id]; return n; });
    if (after) { setPop(after); setTimeout(() => setPop(null), 900); }
    try {
      const r = await reactToStory(story.id, emoji);
      setMine((m) => { const n = { ...m }; if (r.my_reaction) n[story.id] = r.my_reaction; else delete n[story.id]; return n; });
      if (after) showToast(`Sent ${emoji} to chat`);
    } catch (err) {
      setMine((m) => { const n = { ...m }; if (before) n[story.id] = before; else delete n[story.id]; return n; });
      showToast(/friend/i.test(err.message || '') ? 'Only friends can react to this status' : "Couldn't react. Try again.");
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const chatId = await replyToStory(story.id, text);
      setReply(''); setReplying(false);
      document.activeElement?.blur?.();
      showToast('Reply sent to chat', { sticky: true, action: 'Open chat', onAction: () => { onClose(); navigate('/chats/' + chatId); } });
    } catch (err) {
      showToast(/friend/i.test(err.message || '') ? 'Only friends can reply to this status' : "Couldn't send. Try again.");
    }
    setSending(false);
  };

  const doDelete = async () => {
    setConfirmDel(false);
    const id = story.id;
    try {
      await deleteStory(id);
      onDeleted?.(id);
    } catch { showToast("Couldn't delete. Try again."); }
  };

  if (!story) return null;

  const c = counts[story.id] || { views: 0, reactions: 0 };
  const myEmoji = mine[story.id];

  return (
    <div className="fixed left-0 right-0 z-[80] bg-black flex justify-center" style={{ top: vp.top, height: vp.h }}>
      <div className="relative w-full max-w-[460px] h-full flex flex-col bg-black overflow-hidden">
        {/* progress + header */}
        <div className="absolute top-0 left-0 right-0 z-20 pt-2 px-2 bg-gradient-to-b from-black/60 to-transparent pb-8 pointer-events-none">
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 bg-white/30 rounded-full overflow-hidden">
                <div ref={i === si ? bar : null} className="h-full bg-white origin-left rounded-full"
                  style={{ transform: i < si ? 'scaleX(1)' : 'scaleX(0)' }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 mt-2.5 pointer-events-auto">
            <Avatar url={group.user.avatar_url} name={group.user.display_name} size={9} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-white font-bold text-[14px] truncate">{isOwner ? 'Your status' : group.user.display_name}</p>
                {group.user.is_verified && !isOwner && <VerifiedBadge size={13} />}
              </div>
              <p className="text-white/70 text-[12px]">{timeAgo(story.created_at)}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-white"><X size={22} /></button>
          </div>
        </div>

        {/* stage */}
        <div className="relative flex-1 min-h-0 touch-none select-none"
          onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onCancel} onPointerLeave={() => { if (!gesture.current.held) clearTimeout(gesture.current.timer); }}>
          {isText ? (
            <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: bgCss(story.bg_style) }}>
              <p className="text-white text-center font-extrabold whitespace-pre-wrap break-words"
                style={{ fontSize: textSizeFor((story.text_content || '').length), lineHeight: 1.25, textShadow: '0 2px 12px rgba(0,0,0,.18)' }}>
                {story.text_content}
              </p>
            </div>
          ) : (
            <>
              <img src={feedImageUrl(story.media_url, 120)} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-60" />
              <img key={story.id} src={feedImageUrl(story.media_url, 1080)} alt="Status"
                onLoad={() => setLoaded(true)} onError={() => { setImgFailed(true); setLoaded(true); }}
                className="absolute inset-0 w-full h-full object-contain" draggable={false} decoding="async" />
              {!loaded && <div className="absolute inset-0 flex items-center justify-center text-white"><Spinner size={30} /></div>}
              {imgFailed && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">This photo could not be loaded</div>}
              {story.caption && (
                <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-14 bg-gradient-to-t from-black/75 to-transparent pointer-events-none">
                  <p className="text-white text-[15px] text-center leading-snug whitespace-pre-wrap break-words">{story.caption}</p>
                </div>
              )}
            </>
          )}
          {pop && <span className="pointer-events-none absolute left-1/2 top-1/2 text-7xl" style={{ animation: 'heartPop .9s ease-out forwards' }}>{pop}</span>}
        </div>

        {/* footer */}
        {isOwner ? (
          <div className="flex-shrink-0 bg-black flex items-center justify-between px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => setViewersOpen(true)} className="flex items-center gap-2 text-white min-w-0">
              <Eye size={19} />
              <span className="font-bold tabular-nums">{c.views}</span>
              <span className="text-white/60 text-[13px]">{c.views === 1 ? 'view' : 'views'}</span>
              {c.reactions > 0 && <span className="text-white/60 text-[13px]">· {c.reactions} {c.reactions === 1 ? 'reaction' : 'reactions'}</span>}
              <ChevronUp size={16} className="text-white/50" />
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => setShareOpen(true)} aria-label="Share to chat" className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"><Share2 size={20} /></button>
              <button onClick={() => { onClose(); onAdd?.(); }} aria-label="Add status" className="w-10 h-10 rounded-full flex items-center justify-center text-white active:bg-white/10"><Plus size={22} /></button>
              <button onClick={() => setConfirmDel(true)} aria-label="Delete status" className="w-10 h-10 rounded-full flex items-center justify-center text-red-400 active:bg-white/10"><Trash2 size={20} /></button>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 bg-black px-3 pt-2.5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {tray && (
              <div className="flex justify-between px-1 pb-2.5">
                {STORY_REACTIONS.map((e) => (
                  <button key={e} onClick={() => react(e)}
                    className={'text-[28px] w-10 h-10 rounded-full flex items-center justify-center active:scale-125 transition-transform ' + (myEmoji === e ? 'bg-white/20' : '')}>{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                value={reply} maxLength={500} enterKeyHint="send"
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => { setReplying(true); setTray(false); }}
                onBlur={() => setReplying(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } }}
                placeholder={`Reply to ${group.user.display_name?.split(' ')[0] || 'friend'}`}
                className="flex-1 min-w-0 bg-white/[0.12] border border-white/15 rounded-full px-4 py-3 text-white text-[16px] outline-none placeholder-white/50"
              />
              {reply.trim() ? (
                <button onMouseDown={(e) => e.preventDefault()} onClick={sendReply} disabled={sending} aria-label="Send reply"
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0"
                  style={{ background: '#F97316' }}>{sending ? <Spinner size={16} /> : <Send size={18} />}</button>
              ) : (
                <button onClick={() => setTray((t) => !t)} aria-label="React"
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-white/[0.12] text-white text-[22px]">
                  {myEmoji ? myEmoji : <Heart size={22} />}
                </button>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute left-3 right-3 z-50 bg-white text-black rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-xl" style={{ bottom: 96 }}>
            <span className="text-[14px] font-semibold flex items-center gap-2"><Check size={16} className="text-[#2ECC71]" />{toast.text}</span>
            {toast.action && <button onClick={toast.onAction} className="text-[#F97316] font-bold text-[14px]">{toast.action}</button>}
          </div>
        )}

        {viewersOpen && (
          <Sheet onClose={() => setViewersOpen(false)}>
            <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2 flex items-center gap-2"><Eye size={17} /> Viewed by {c.views}</p>
            {viewers === null && <div className="flex justify-center py-8 text-[#F97316]"><Spinner size={22} /></div>}
            {viewers && viewers.length === 0 && <p className="text-[#8E8C88] text-sm text-center px-6 py-8">No views yet. Friends who watch will appear here instantly.</p>}
            {(viewers || []).map((v) => (
              <div key={v.user_id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar url={v.avatar_url} name={v.display_name} size={10} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[15px] font-semibold truncate">{v.display_name}</p>
                  <p className="text-[#8E8C88] text-[12px]">{timeAgo(v.viewed_at)}</p>
                </div>
                {v.reaction && <span className="text-[22px]">{v.reaction}</span>}
              </div>
            ))}
          </Sheet>
        )}

        {shareOpen && <ShareSheet storyId={story.id} onClose={() => setShareOpen(false)} onDone={(n) => { setShareOpen(false); showToast(`Shared to ${n} chat${n === 1 ? '' : 's'}`); }} onError={(t) => showToast(t)} />}

        {confirmDel && (
          <Sheet onClose={() => setConfirmDel(false)}>
            <div className="px-5 pt-3 text-center">
              <p className="text-white font-bold text-base">Delete this status?</p>
              <p className="text-[#8E8C88] text-sm mt-1">It disappears for everyone and the view count is removed.</p>
            </div>
            <div className="px-5 pt-4 space-y-2">
              <button onClick={doDelete} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Delete</button>
              <button onClick={() => setConfirmDel(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold">Cancel</button>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}

function ShareSheet({ storyId, onClose, onDone, onError }) {
  const [chats, setChats] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.rpc('get_my_chats').then(({ data }) => setChats(data || [])); }, []);

  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try { onDone(await shareStory(storyId, picked)); }
    catch { onError("Couldn't share. Try again."); setBusy(false); }
  };

  return (
    <Sheet onClose={onClose}>
      <p className="text-white font-bold text-[15px] px-5 pt-2 pb-2">Share status to</p>
      {chats === null && <div className="flex justify-center py-8 text-[#F97316]"><Spinner size={22} /></div>}
      {chats && chats.length === 0 && <p className="text-[#8E8C88] text-sm text-center py-8">No chats yet</p>}
      {(chats || []).map((c) => {
        const on = picked.includes(c.chat_id);
        return (
          <button key={c.chat_id} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.chat_id) : [...p, c.chat_id]))}
            className="w-full flex items-center gap-3 px-5 py-2.5 active:bg-white/[0.05]">
            <Avatar url={c.other_avatar_url} name={c.other_display_name} size={10} />
            <span className="flex-1 text-left text-white text-[15px] font-semibold truncate">{c.other_display_name}</span>
            <span className={'w-6 h-6 rounded-full border-2 flex items-center justify-center ' + (on ? 'bg-[#F97316] border-[#F97316]' : 'border-white/30')}>{on && <Check size={14} className="text-white" />}</span>
          </button>
        );
      })}
      <div className="px-5 pt-3">
        <button onClick={send} disabled={!picked.length || busy}
          className="w-full py-3.5 rounded-xl text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: '#F97316' }}>
          {busy ? <Spinner size={16} /> : <Send size={16} />} Send{picked.length ? ` (${picked.length})` : ''}
        </button>
      </div>
    </Sheet>
  );
}
