// src/components/post/Comments.js
// Compact, Instagram/TikTok-style comments: opens as a bottom sheet from the
// feed (CommentsSheet) or inline on the post page (CommentsPanel).
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Heart, MoreHorizontal, Reply, Copy, Pencil, Trash2, EyeOff, Eye, Pin, PinOff, Flag, X, Send, ChevronDown, MessageSquareOff, ArrowDown, Smile, Keyboard,
} from 'lucide-react';
import Avatar from '../Avatar';
import EmojiPanel from '../EmojiPanel';
import VerifiedBadge from '../VerifiedBadge';
import { Spinner } from '../ui';
import useViewport from '../../lib/useViewport';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  fetchComments, addComment, editComment, hideComment, pinComment, deleteComment, toggleCommentLike,
} from '../../lib/posts';

const friendly = (e, fallback) => (/does not exist|could not find|schema cache/i.test(e?.message || '') ? 'This needs the latest database update.' : (e?.message && e.message.length < 90 ? e.message : fallback));
const QUICK_EMOJI = ['❤️', '😂', '🔥', '😍', '👏', '😮', '😢', '🙌'];
const MAX_LEN = 1000;
const PAGE = 20;
const REPORT_REASONS = ['Spam or scam', 'Harassment or bullying', 'Hate speech', 'Inappropriate content', 'Something else'];

function RichText({ text, onTag, onMention }) {
  return text.split(/(#\w+|@\w+)/g).map((p, i) => {
    if (p.startsWith('#') && p.length > 1) return <button key={i} onClick={() => onTag(p.slice(1))} className="text-[#FF5A1F] font-medium">{p}</button>;
    if (p.startsWith('@') && p.length > 1) return <button key={i} onClick={() => onMention(p.slice(1))} className="text-[#FF5A1F] font-medium">{p}</button>;
    return <span key={i}>{p}</span>;
  });
}

function Row({ c, isReply, me, postOwnerId, replies, onLike, onReply, onMenu, onToggleReplies, onTag, onMention, onProfile }) {
  const timer = useRef(null);
  const user = c.user || {};
  const mine = c.user_id === me;
  const press = () => { timer.current = setTimeout(() => { navigator.vibrate?.(10); onMenu(c); }, 450); };
  const cancel = () => clearTimeout(timer.current);

  return (
    <div className={isReply ? 'pl-11' : ''}>
      <div className={'flex gap-2.5 px-4 py-2 ' + (c._pending ? 'opacity-60 ' : '') + (c.is_hidden ? 'bg-[#F1F2F4]' : '')}
        onTouchStart={press} onTouchEnd={cancel} onTouchMove={cancel} onTouchCancel={cancel}
        onContextMenu={(e) => { e.preventDefault(); onMenu(c); }}>
        <button onClick={() => onProfile(user.username)} className="flex-shrink-0 mt-0.5" aria-label={`${user.display_name} profile`}>
          <Avatar url={user.avatar_url} name={user.display_name} size={isReply ? 7 : 8} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
            <button onClick={() => onProfile(user.username)} className="text-[#1C1E21] font-bold">{user.username || user.display_name}</button>
            {user.is_verified && <VerifiedBadge size={12} />}
            {c.user_id === postOwnerId && <span className="bg-[#FF5A1F]/20 text-[#FF5A1F] text-[9px] px-1.5 py-[1px] rounded-full font-bold">Author</span>}
            <span className="text-[#65676B]">{formatTime(c.created_at)}</span>
            {c.is_pinned && <span className="inline-flex items-center gap-0.5 text-[#65676B]"><Pin size={10} /> Pinned</span>}
            {c.is_hidden && <span className="inline-flex items-center gap-0.5 text-[#65676B]"><EyeOff size={10} /> Hidden</span>}
          </div>
          <p className="text-[#1C1E21] text-[14px] leading-snug break-words whitespace-pre-wrap mt-0.5">
            <RichText text={c.body} onTag={onTag} onMention={onMention} />
            {c.edited && <span className="text-[#65676B] text-[11px]"> (edited)</span>}
          </p>
          <div className="flex items-center gap-4 mt-1">
            <button onClick={() => onReply(c)} className="text-[#65676B] text-[12px] font-semibold active:text-[#1C1E21]">Reply</button>
            {!isReply && c.reply_count > 0 && (
              <button onClick={() => onToggleReplies(c)} className="text-[#65676B] text-[12px] font-semibold inline-flex items-center gap-1">
                <span className="w-5 h-px bg-[#CED0D4]" />
                {replies?.loading ? 'Loading…' : replies?.open ? 'Hide replies' : `View ${c.reply_count} ${c.reply_count === 1 ? 'reply' : 'replies'}`}
                <ChevronDown size={12} className={replies?.open ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
          <button onClick={() => onLike(c)} aria-label={c.my_reaction ? 'Unlike comment' : 'Like comment'} className="p-1 active:scale-125 transition-transform">
            <Heart size={16} className={c.my_reaction ? 'text-[#EF4444]' : 'text-[#65676B]'} fill={c.my_reaction ? '#EF4444' : 'none'} />
          </button>
          {c.reaction_count > 0 && <span className="text-[11px] text-[#65676B] tabular-nums">{formatNumber(c.reaction_count)}</span>}
          <button onClick={() => onMenu(c)} aria-label="Comment options" className="p-1 text-[#65676B]"><MoreHorizontal size={15} /></button>
        </div>
      </div>

      {!isReply && replies?.open && (
        <div>
          {(replies.items || []).map((r) => (
            <Row key={r.id} c={r} isReply me={me} postOwnerId={postOwnerId} replies={null}
              onLike={onLike} onReply={onReply} onMenu={onMenu} onToggleReplies={onToggleReplies} onTag={onTag} onMention={onMention} onProfile={onProfile} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sheet({ onClose, children }) {
  return (
    <div className="absolute inset-0 z-30 bg-black/55 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl border-t border-[#E4E6EB] pb-[max(14px,env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#CED0D4] mx-auto mt-2.5 mb-1" />
        {children}
      </div>
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, red }) {
  return (
    <button onClick={onClick} className={'w-full flex items-center gap-3.5 px-5 py-3.5 text-left active:bg-[#F1F2F4] ' + (red ? 'text-red-400' : 'text-[#1C1E21]')}>
      <Icon size={19} className={red ? 'text-red-400' : 'text-[#65676B]'} /> <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}

export function CommentsPanel({ post, count, onCountChange, onNavigate, onEmojiToggle, inline = false }) {
  const { user, profile } = useAuth();
  const me = user?.id;
  const postId = post.id;
  const postOwnerId = post.user_id || post.users?.id;
  const isPostOwner = me === postOwnerId;
  const staff = ['blink', 'admin', 'moderator'].includes(profile?.role);
  const disabled = !!post.comments_disabled && !isPostOwner;

  const [sort, setSort] = useState('top');
  const [items, setItems] = useState([]);
  const [replies, setReplies] = useState({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [fresh, setFresh] = useState(0);
  const inputRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // keep the box a comfortable size: grows with the text, up to ~5 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 124) + 'px';
  }, [text]);
  useEffect(() => { if (onEmojiToggle) onEmojiToggle(emojiOpen); }, [emojiOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const caretRef = useRef(null);
  const addEmoji = (emoji) => {
    const el = inputRef.current;
    const a = el ? el.selectionStart : text.length;
    const b = el ? el.selectionEnd : text.length;
    const pos = a + emoji.length;
    caretRef.current = pos;
    setText((t) => t.slice(0, a) + emoji + t.slice(b));
    requestAnimationFrame(() => { if (el) { try { el.setSelectionRange(pos, pos); } catch { /* not focusable */ } } });
  };
  const backspaceEmoji = () => {
    const el = inputRef.current;
    const a = el ? el.selectionStart : text.length;
    const b = el ? el.selectionEnd : text.length;
    let from = a;
    if (a === b) {
      const before = text.slice(0, a);
      const parts = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(before), (x) => x.segment)
        : Array.from(before);
      parts.pop();
      from = parts.join('').length;
    }
    caretRef.current = from;
    setText((t) => t.slice(0, from) + t.slice(b));
    requestAnimationFrame(() => { if (el) { try { el.setSelectionRange(from, from); } catch { /* not focusable */ } } });
  };
  const openEmoji = () => { if (inputRef.current) inputRef.current.blur(); setEmojiOpen(true); };
  const closeEmoji = () => { setEmojiOpen(false); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); };
  const toastT = useRef(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(toastT.current); }; }, []);
  const say = useCallback((t, error = false) => { setToast({ t, error }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 2400); }, []);

  const load = useCallback(async (reset = true) => {
    if (reset) setLoading(true); else setMoreBusy(true);
    try {
      const rows = await fetchComments({ postId, sort, offset: reset ? 0 : items.length, limit: PAGE });
      if (!alive.current) return;
      setItems((prev) => (reset ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setMore(rows.length === PAGE);
      if (reset) setFresh(0);
    } catch (e) { say("Couldn't load comments", true); }
    if (alive.current) { setLoading(false); setMoreBusy(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, sort, items.length]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [postId, sort]);

  // other people's comments appear live
  useEffect(() => {
    const ch = supabase.channel('comments:' + postId + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: 'post_id=eq.' + postId }, (p) => {
        const r = p.new;
        if (!r || r.user_id === me) return;
        if (r.parent_id) setItems((prev) => prev.map((c) => (c.id === r.parent_id ? { ...c, reply_count: (c.reply_count || 0) + 1 } : c)));
        else setFresh((n) => n + 1);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, (p) => {
        const id = p.old?.id;
        if (id) setItems((prev) => prev.filter((c) => c.id !== id));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [postId, me]);

  /* ── actions ── */
  const patchItem = (id, patch) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setReplies((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k]?.items) next[k] = { ...next[k], items: next[k].items.map((c) => (c.id === id ? { ...c, ...patch } : c)) }; });
      return next;
    });
  };

  const like = async (c) => {
    const was = !!c.my_reaction;
    patchItem(c.id, { my_reaction: was ? null : '❤️', reaction_count: Math.max(0, (c.reaction_count || 0) + (was ? -1 : 1)) });
    try {
      const r = await toggleCommentLike(c.id, was);
      patchItem(c.id, { my_reaction: r.liked ? '❤️' : null, reaction_count: r.count });
    } catch (e) { patchItem(c.id, { my_reaction: c.my_reaction, reaction_count: c.reaction_count }); say(friendly(e, "Couldn't update like. Try again."), true); }
  };

  const toggleReplies = async (c) => {
    const cur = replies[c.id];
    if (cur?.open) { setReplies((p) => ({ ...p, [c.id]: { ...cur, open: false } })); return; }
    if (cur?.items) { setReplies((p) => ({ ...p, [c.id]: { ...cur, open: true } })); return; }
    setReplies((p) => ({ ...p, [c.id]: { loading: true, open: false, items: [] } }));
    try {
      const rows = await fetchComments({ postId, parentId: c.id, limit: 50 });
      setReplies((p) => ({ ...p, [c.id]: { loading: false, open: true, items: rows } }));
    } catch { setReplies((p) => ({ ...p, [c.id]: { loading: false, open: false, items: [] } })); say("Couldn't load replies", true); }
  };

  const startReply = (c) => {
    setEditing(null);
    setReplyTo(c);
    setText(`@${c.user?.username || ''} `);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    if (body.length > MAX_LEN) { say(`Comments can be up to ${MAX_LEN} characters`, true); return; }

    if (editing) {
      setSending(true);
      try {
        const row = await editComment(editing.id, body);
        patchItem(editing.id, { body: row?.body || body, edited: true });
        setEditing(null); setText('');
      } catch (e) { say(friendly(e, "Couldn't save the edit"), true); }
      setSending(false);
      return;
    }

    setSending(true);
    const tempId = 'tmp-' + Date.now();
    const temp = {
      id: tempId, post_id: postId, parent_id: replyTo ? (replyTo.parent_id || replyTo.id) : null, user_id: me, body,
      created_at: new Date().toISOString(), reaction_count: 0, reply_count: 0, my_reaction: null, _pending: true,
      user: { id: me, username: profile?.username, display_name: profile?.display_name, avatar_url: profile?.avatar_url, is_verified: profile?.is_verified },
    };
    const parentId = replyTo ? (replyTo.parent_id || replyTo.id) : null;
    const target = replyTo;
    setText(''); setReplyTo(null);
    if (parentId) {
      setReplies((p) => ({ ...p, [parentId]: { loading: false, open: true, items: [...(p[parentId]?.items || []), temp] } }));
    } else setItems((prev) => { const pinned = prev.filter((c) => c.is_pinned).length; const n = [...prev]; n.splice(pinned, 0, temp); return n; });
    onCountChange?.(1);

    try {
      const row = await addComment(postId, body, target ? target.id : null);
      const swap = (list) => list.map((c) => (c.id === tempId ? row : c));
      if (parentId) {
        setReplies((p) => ({ ...p, [parentId]: { ...p[parentId], items: swap(p[parentId]?.items || []) } }));
        setItems((prev) => prev.map((c) => (c.id === parentId ? { ...c, reply_count: (c.reply_count || 0) + 1 } : c)));
      } else setItems(swap);
    } catch (e) {
      const drop = (list) => list.filter((c) => c.id !== tempId);
      if (parentId) setReplies((p) => ({ ...p, [parentId]: { ...p[parentId], items: drop(p[parentId]?.items || []) } })); else setItems(drop);
      onCountChange?.(-1);
      setText(body);
      say(friendly(e, "Couldn't post. Try again."), true);
    }
    setSending(false);
  };

  const doDelete = async (c) => {
    setConfirmDel(null);
    const removed = 1 + (c.reply_count || 0);
    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== c.id));
    setReplies((p) => { const n = { ...p }; if (c.parent_id && n[c.parent_id]) n[c.parent_id] = { ...n[c.parent_id], items: n[c.parent_id].items.filter((x) => x.id !== c.id) }; return n; });
    if (c.parent_id) setItems((prev) => prev.map((x) => (x.id === c.parent_id ? { ...x, reply_count: Math.max(0, (x.reply_count || 1) - 1) } : x)));
    onCountChange?.(-(c.parent_id ? 1 : removed));
    try { await deleteComment(c.id); } catch (e) { setItems(snapshot); onCountChange?.(c.parent_id ? 1 : removed); say(friendly(e, "Couldn't delete"), true); }
  };

  const doHide = async (c) => {
    setMenu(null);
    const hide = !c.is_hidden;
    patchItem(c.id, { is_hidden: hide });
    try { await hideComment(c.id, hide); say(hide ? 'Comment hidden from others' : 'Comment visible again'); }
    catch (e) { patchItem(c.id, { is_hidden: !hide }); say(friendly(e, "Couldn't update"), true); }
  };

  const doPin = async (c) => {
    setMenu(null);
    const pin = !c.is_pinned;
    try { await pinComment(c.id, pin); say(pin ? 'Comment pinned' : 'Comment unpinned'); load(true); }
    catch (e) { say(friendly(e, "Couldn't pin"), true); }
  };

  const doReport = async (reason) => {
    const c = reportFor; setReportFor(null);
    const { error } = await supabase.rpc('report_user', { p_target_id: c.user_id, p_reason: 'Comment: ' + reason, p_details: c.body.slice(0, 200) });
    say(error ? "Couldn't send report" : 'Report sent. Thank you.', !!error);
  };

  const copy = async (c) => { setMenu(null); try { await navigator.clipboard.writeText(c.body); say('Copied'); } catch { say("Couldn't copy", true); } };

  const profileGo = (u) => { if (u) onNavigate?.('/profile/' + u); };
  const tagGo = (t) => onNavigate?.('/hashtag/' + t);

  const m = menu;
  const mMine = m?.user_id === me;
  const canDelete = mMine || staff;   // the post owner can HIDE, only the author (or moderators) can delete

  return (
    <div className={'relative flex flex-col ' + (inline ? '' : 'h-full min-h-0')}>
      <div className="flex items-center justify-between px-4 pt-1 pb-2.5 flex-shrink-0 border-b border-[#E4E6EB]">
        <p className="text-[#1C1E21] font-bold text-[15px]">{formatNumber(Math.max(0, count ?? items.length))} comments</p>
        <div className="flex bg-[#F1F2F4] rounded-full p-0.5">
          {[['top', 'Top'], ['new', 'Newest']].map(([k, l]) => (
            <button key={k} onClick={() => setSort(k)} className={'px-3 py-1 rounded-full text-[12px] font-bold ' + (sort === k ? 'bg-[#1C1E21] text-white' : 'text-[#65676B]')}>{l}</button>
          ))}
        </div>
      </div>

      <div className={inline ? '' : 'flex-1 min-h-0 overflow-y-auto'} style={{ overscrollBehavior: 'contain' }}>
        {fresh > 0 && (
          <button onClick={() => load(true)} className="sticky top-2 z-10 mx-auto flex items-center gap-1.5 bg-[#FF5A1F] text-white text-[12px] font-bold rounded-full px-3.5 py-1.5 shadow-lg mt-2">
            <ArrowDown size={13} /> {fresh} new comment{fresh === 1 ? '' : 's'}
          </button>
        )}
        {loading ? (
          <div className="flex justify-center py-12 text-[#FF5A1F]"><Spinner size={22} /></div>
        ) : items.length === 0 ? (
          <div className="text-center px-8 py-12">
            <p className="text-[#1C1E21] font-bold">No comments yet</p>
            <p className="text-[#65676B] text-sm mt-1">{disabled ? 'Comments are turned off for this post.' : 'Start the conversation.'}</p>
          </div>
        ) : (
          <>
            {items.map((c) => (
              <Row key={c.id} c={c} me={me} postOwnerId={postOwnerId} replies={replies[c.id]}
                onLike={like} onReply={startReply} onMenu={setMenu} onToggleReplies={toggleReplies}
                onTag={tagGo} onMention={profileGo} onProfile={profileGo} />
            ))}
            {more && (
              <button onClick={() => load(false)} disabled={moreBusy} className="w-full py-4 text-[#FF5A1F] text-[13px] font-bold">
                {moreBusy ? 'Loading…' : 'Load more comments'}
              </button>
            )}
          </>
        )}
      </div>

      {/* composer */}
      <div className={'flex-shrink-0 border-t border-[#E4E6EB] bg-white ' + (inline ? 'sticky bottom-0 z-10' : '')} style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        {disabled ? (
          <p className="text-[#65676B] text-sm text-center py-4 flex items-center justify-center gap-2"><MessageSquareOff size={15} /> Comments are turned off</p>
        ) : (
          <>
            {(replyTo || editing) && (
              <div className="flex items-center gap-2.5 px-4 pt-2.5">
                <div className="w-[3px] self-stretch bg-[#FF5A1F] rounded-full" />
                <p className="flex-1 min-w-0 text-[12px] text-[#65676B] truncate">
                  {editing ? 'Editing your comment' : <>Replying to <span className="text-[#FF5A1F] font-bold">@{replyTo.user?.username}</span></>}
                </p>
                <button onClick={() => { setReplyTo(null); setEditing(null); setText(''); }} aria-label="Cancel" className="text-[#65676B] p-1"><X size={16} /></button>
              </div>
            )}
            {(focused || emojiOpen) && (
              <div className="flex gap-1 px-3 pt-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }} onPointerDown={(e) => e.preventDefault()}>
                {QUICK_EMOJI.map((e) => (
                  <button key={e} onClick={() => addEmoji(e)} aria-label={'Add ' + e}
                    className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-[26px] rounded-full active:scale-125 active:bg-[#F1F2F4] transition-transform">{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2.5 px-3 pt-2 pb-1">
              <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
              <div className="flex-1 min-w-0 bg-[#F1F2F4] border border-[#E4E6EB] rounded-[26px] pl-4 pr-1 flex items-end focus-within:border-[#FF5A1F]/50 transition-colors" style={{ minHeight: 52 }}>
                <textarea
                  ref={inputRef} value={text} rows={1} maxLength={MAX_LEN + 20} enterKeyHint="send"
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => { setFocused(true); setEmojiOpen(false); }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); submit(); } }}
                  placeholder={replyTo ? 'Add a reply…' : 'Add a comment…'}
                  className="flex-1 min-w-0 bg-transparent text-[#1C1E21] outline-none resize-none placeholder-[#65676B]"
                  style={{ fontSize: 16, lineHeight: '22px', maxHeight: 124, padding: '15px 0' }}
                />
                <button type="button" onClick={emojiOpen ? closeEmoji : openEmoji} aria-label={emojiOpen ? 'Show keyboard' : 'Show emojis'} aria-pressed={emojiOpen}
                  className="w-11 h-11 mb-1 flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform"
                  style={{ color: emojiOpen ? '#FF5A1F' : '#65676B' }}>
                  {emojiOpen ? <Keyboard size={24} strokeWidth={1.8} /> : <Smile size={24} strokeWidth={1.8} />}
                </button>
              </div>
              {(text.trim() || sending) && (
                <button onClick={submit} disabled={!text.trim() || sending} aria-label="Post comment"
                  className="w-12 h-12 mb-0.5 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-60 active:scale-90 transition-transform text-white"
                  style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF2D78)', animation: 'bfSendIn .18s ease-out' }}>
                  {sending ? <Spinner size={16} /> : <Send size={20} className="-ml-0.5" />}
                </button>
              )}
            </div>
            <style>{'@keyframes bfSendIn{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}'}</style>
            {emojiOpen && <EmojiPanel onPick={addEmoji} onBackspace={backspaceEmoji} height={244} />}
          </>
        )}
      </div>

      {toast && (
        <div className={'absolute left-4 right-4 z-40 rounded-2xl px-4 py-3 text-[13px] font-semibold text-center shadow-xl ' + (toast.error ? 'bg-red-500 text-white' : 'bg-[#1C1E21] text-white')} style={{ bottom: 150 }}>{toast.t}</div>
      )}

      {m && (
        <Sheet onClose={() => setMenu(null)}>
          <MenuRow icon={Reply} label="Reply" onClick={() => { setMenu(null); startReply(m); }} />
          <MenuRow icon={Copy} label="Copy text" onClick={() => copy(m)} />
          {mMine && <MenuRow icon={Pencil} label="Edit" onClick={() => { setMenu(null); setReplyTo(null); setEditing(m); setText(m.body); setTimeout(() => inputRef.current?.focus(), 60); }} />}
          {isPostOwner && !m.parent_id && <MenuRow icon={m.is_pinned ? PinOff : Pin} label={m.is_pinned ? 'Unpin comment' : 'Pin to top'} onClick={() => doPin(m)} />}
          {(isPostOwner || staff) && !mMine && <MenuRow icon={m.is_hidden ? Eye : EyeOff} label={m.is_hidden ? 'Unhide comment' : 'Hide comment'} onClick={() => doHide(m)} />}
          {!mMine && <MenuRow icon={Flag} label="Report" red onClick={() => { setReportFor(m); setMenu(null); }} />}
          {canDelete && <MenuRow icon={Trash2} label="Delete" red onClick={() => { setConfirmDel(m); setMenu(null); }} />}
        </Sheet>
      )}

      {confirmDel && (
        <Sheet onClose={() => setConfirmDel(null)}>
          <div className="px-5 pt-3 text-center">
            <p className="text-[#1C1E21] font-bold text-base">Delete this comment?</p>
            <p className="text-[#65676B] text-sm mt-1">{confirmDel.reply_count > 0 ? 'Its replies are removed too.' : 'This cannot be undone.'}</p>
          </div>
          <div className="px-5 pt-4 space-y-2">
            <button onClick={() => doDelete(confirmDel)} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30">Delete</button>
            <button onClick={() => setConfirmDel(null)} className="w-full py-3 rounded-xl bg-[#F1F2F4] text-[#1C1E21] font-bold">Cancel</button>
          </div>
        </Sheet>
      )}

      {reportFor && (
        <Sheet onClose={() => setReportFor(null)}>
          <p className="text-[#1C1E21] font-bold text-[15px] px-5 pt-2 pb-1">Report this comment</p>
          {REPORT_REASONS.map((r) => <button key={r} onClick={() => doReport(r)} className="w-full text-left px-5 py-3.5 text-[#1C1E21] text-[15px] active:bg-[#F1F2F4]">{r}</button>)}
        </Sheet>
      )}
    </div>
  );
}

export function CommentsSheet({ post, count, onCountChange, onClose, onNavigate }) {
  const vp = useViewport();
  const [emoji, setEmoji] = useState(false);          // taller sheet while the emoji keyboard is open
  return (
    <div className="fixed left-0 right-0 z-[70] bg-black/60 flex items-end justify-center" style={{ top: vp.top, height: vp.h }} onClick={onClose}>
      <div className="relative w-full max-w-[620px] bg-white rounded-t-3xl border-t border-[#E4E6EB] flex flex-col"
        style={{ height: Math.min(Math.round(vp.h * (emoji ? 0.94 : 0.8)), vp.h - 24), transition: 'height .2s ease' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between h-12 px-2 flex-shrink-0 border-b border-[#E4E6EB]">
          <span className="w-11" />
          <div className="w-10 h-1 rounded-full bg-[#CED0D4]" />
          <button onClick={onClose} aria-label="Close comments" className="w-11 h-11 flex items-center justify-center text-[#65676B] active:scale-90 transition-transform"><X size={22} /></button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <CommentsPanel post={post} count={count} onCountChange={onCountChange} onEmojiToggle={setEmoji}
            onNavigate={(path) => { onClose(); onNavigate?.(path); }} />
        </div>
      </div>
    </div>
  );
}
