// src/components/chat/MessageBubble.js
// One chat message. Memoised so typing / scrolling never re-renders the list.
// Gestures: tap-tap = heart, press-and-hold = actions, swipe = reply.
import { memo, useRef } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Ban, Forward, Star, CornerUpLeft, Pin, ImageIcon, CircleDot } from 'lucide-react';
import Avatar from '../Avatar';
import { feedImageUrl, thumbUrl } from '../../lib/imageUtils';
import { bgCss } from '../../lib/storyPalette';

const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, term) {
  if (!term) return text;
  const parts = text.split(new RegExp('(' + escapeRe(term) + ')', 'ig'));
  return parts.map((p, i) => (p.toLowerCase() === term.toLowerCase()
    ? <mark key={i} className="bg-yellow-300 text-black rounded px-0.5">{p}</mark>
    : p));
}

function renderBody(text, term, mine) {
  if (!text) return null;
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 1) {
      const href = /^https?:\/\//i.test(part) ? part : 'https://' + part;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          className={'underline break-all ' + (mine ? 'text-[#243B53]' : 'text-[#0369A1]')}>
          {highlight(part, term)}
        </a>
      );
    }
    return <span key={i}>{highlight(part, term)}</span>;
  });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });

function Ticks({ m }) {
  let icon; let label;
  if (m._failed) { icon = <AlertCircle size={12} className="tick-fail" />; label = 'Not sent'; }
  else if (m._pending) { icon = <Clock size={11} className="tick-dim" />; label = 'Sending'; }
  else if (m.seen_at) { icon = <CheckCheck size={14} strokeWidth={2.8} className="tick-seen" />; label = 'Read'; }
  else if (m.delivered_at) { icon = <CheckCheck size={14} strokeWidth={2.2} className="tick-dim" />; label = 'Delivered'; }
  else { icon = <Check size={13} strokeWidth={2.4} className="tick-dim" />; label = 'Sent'; }
  return (
    <span role="img" aria-label={label} className="tick-pill inline-flex items-center justify-center rounded-full px-1 h-[16px]">
      {icon}
    </span>
  );
}

// "View once" photo: the picture itself is never in the message; it is fetched once, when opened.
function ViewOnceChip({ m, isMine, onOpen }) {
  const opened = !!m.viewed_at;
  const canOpen = !isMine && !opened && !m._pending;
  const label = m._pending ? 'Sending…'
    : isMine ? (opened ? 'Opened' : 'Photo · not opened yet')
    : opened ? 'Opened' : 'Photo · tap to view';
  const Tag = canOpen ? 'button' : 'div';
  return (
    <Tag onClick={canOpen ? (e) => { e.stopPropagation(); onOpen && onOpen(m); } : undefined}
      className={'flex items-center gap-2.5 py-1 pr-3 min-w-[170px] text-left ' + (canOpen ? 'active:opacity-70' : 'opacity-85')}>
      <span className={'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-extrabold flex-shrink-0 border-2 ' +
        (opened ? 'border-solid ' : 'border-dashed ') + (isMine ? 'border-white/80' : 'border-[#0284C7] text-[#0369A1]')}>
        {opened ? <Check size={16} strokeWidth={3} /> : '1'}
      </span>
      <span className={'text-[14px] font-semibold ' + (isMine ? '' : 'text-[#243B53]')}>{label}</span>
    </Tag>
  );
}

function MessageBubble({
  m, isMine, isFirst, isLast, parent, parentName, otherUser, isStarred, reactions, term,
  pop, flash, onLongPress, onDoubleTap, onReply, onJump, onImage, onRetry, onViewOnce,
}) {
  const wrap = useRef(null);
  const g = useRef({ x: 0, y: 0, timer: null, moved: false, swiped: false, long: false, lastTap: 0, lastLong: 0 });
  const deleted = !!m.is_deleted;
  const dir = isMine ? -1 : 1;

  const clear = () => { clearTimeout(g.current.timer); };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    Object.assign(g.current, { x: t.clientX, y: t.clientY, moved: false, swiped: false, long: false });
    clear();
    g.current.timer = setTimeout(() => {
      if (g.current.moved) return;
      g.current.long = true;
      g.current.lastLong = Date.now();
      if (navigator.vibrate) navigator.vibrate(12);
      onLongPress(m);
    }, 420);
  };

  const onTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - g.current.x;
    const dy = t.clientY - g.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clear();
    if (Math.abs(dy) > Math.abs(dx)) { g.current.moved = true; return; }
    const d = dx * dir;
    if (d > 6 && !deleted && !m._pending) {
      g.current.moved = true;
      const off = Math.min(d, 64);
      if (wrap.current) { wrap.current.style.transition = 'none'; wrap.current.style.transform = `translateX(${off * dir}px)`; }
      g.current.swiped = d > 56;
    }
  };

  const onTouchEnd = () => {
    clear();
    if (wrap.current) { wrap.current.style.transition = 'transform .15s'; wrap.current.style.transform = ''; }
    if (g.current.long) return;
    if (g.current.swiped) { onReply(m); return; }
    if (g.current.moved) return;
    const now = Date.now();
    if (now - g.current.lastTap < 300) { g.current.lastTap = 0; if (!deleted) onDoubleTap(m); }
    else g.current.lastTap = now;
  };

  const radius = isFirst && isLast ? '18px'
    : isMine ? (isFirst ? '18px 5px 18px 18px' : isLast ? '18px 18px 5px 18px' : '18px 5px 5px 18px')
    : (isFirst ? '5px 18px 18px 18px' : isLast ? '18px 18px 18px 5px' : '5px 18px 18px 5px');

  const reactionEntries = Object.entries(reactions || {});

  return (
    <div id={'msg-' + m.id} className={'flex items-end gap-2 ' + (isMine ? 'flex-row-reverse ' : '') + (reactionEntries.length ? 'mb-4' : 'mb-[3px]')}>
      {!isMine && (
        <div className="w-7 flex-shrink-0 mb-1">
          {isLast && <Avatar url={otherUser?.avatar_url} name={otherUser?.display_name} size={7} />}
        </div>
      )}

      <div
        ref={wrap}
        className="relative max-w-[80%] select-none"
        style={{ WebkitTouchCallout: 'none', touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { clear(); if (wrap.current) wrap.current.style.transform = ''; }}
        onDoubleClick={() => !deleted && onDoubleTap(m)}
        onContextMenu={(e) => { e.preventDefault(); if (Date.now() - g.current.lastLong > 700) onLongPress(m); }}
      >
        <div
          className={'relative px-3 py-2 ' + (flash ? 'msg-flash ' : '') +
            (m._failed ? 'border border-red-400 ' : '') +
            (isMine ? 'bubble-mine bg-[#2563EB]' : 'bg-white border border-[#CFE0F5]')}
          style={{
            borderRadius: radius, opacity: deleted ? 0.7 : 1,
            ...(isMine
              ? { background: 'linear-gradient(135deg,#0284C7 0%,#2563EB 55%,#4F46E5 100%)', boxShadow: '0 2px 6px rgba(37,99,235,0.28)' }
              : { boxShadow: '0 1px 3px rgba(15,23,42,0.07)' }),
          }}
          onClick={m._failed ? () => onRetry(m) : undefined}
        >
          {m.forwarded && !deleted && (
            <div className="flex items-center gap-1 mb-1 text-[10px] text-[#64748B]"><Forward size={10} /> Forwarded</div>
          )}

          {m.story_preview && !deleted && (
            <div className={'flex items-stretch gap-2.5 mb-1.5 rounded-xl overflow-hidden ' + (isMine ? 'bg-black/20' : 'bg-[#F1F5F9]')}>
              <div className="w-11 h-14 flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={m.story_preview.type === 'text' ? { background: bgCss(m.story_preview.bg) } : { background: '#222' }}>
                {m.story_preview.type === 'text'
                  ? <span className="text-[#243B53] text-[8px] font-bold leading-tight px-1 line-clamp-4 text-center">{m.story_preview.text}</span>
                  : m.story_preview.url && <img src={thumbUrl(m.story_preview.url, 120)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />}
              </div>
              <div className="py-1.5 pr-3 min-w-0 flex flex-col justify-center">
                <p className="text-[11px] font-bold flex items-center gap-1 text-[#243B53]"><CircleDot size={11} /> Status</p>
                <p className="text-[11px] text-[#64748B] truncate">{m.story_preview.type === 'text' ? m.story_preview.text : 'Photo'}</p>
              </div>
            </div>
          )}

          {m.parent_message_id && !deleted && (
            <button
              onClick={(e) => { e.stopPropagation(); onJump(m.parent_message_id); }}
              className={'block w-full text-left mb-1.5 pl-2.5 pr-2 py-1.5 rounded-lg border-l-[3px] ' +
                (isMine ? 'bg-black/20 border-[#E2E8F0]' : 'bg-[#F1F5F9] border-[#0284C7]')}
            >
              <p className={'text-[11px] font-bold ' + (isMine ? 'text-[#243B53]' : 'text-[#0369A1]')}>{parentName || 'Message'}</p>
              <p className="text-[12px] text-[#64748B] truncate flex items-center gap-1">
                {parent?.message_type === 'image' && <ImageIcon size={11} />}
                {parent ? (parent.is_deleted ? 'Deleted message' : parent.message_type === 'image' ? 'Photo' : parent.body) : 'Original message'}
              </p>
            </button>
          )}

          {deleted ? (
            <p className="text-[13px] italic text-[#64748B] flex items-center gap-1.5"><Ban size={13} /> This message was deleted</p>
          ) : m.view_once ? (
            <ViewOnceChip m={m} isMine={isMine} onOpen={onViewOnce} />
          ) : m.message_type === 'image' && m.media_url ? (
            <div className="relative -mx-1 -mt-0.5">
              <img
                src={m._local ? m.media_url : feedImageUrl(m.media_url, 520)} alt=""
                onClick={(e) => { e.stopPropagation(); if (!m._pending) onImage(m.media_url); }}
                className="rounded-xl block max-w-[240px] w-full cursor-pointer"
                style={{ opacity: m._pending ? 0.55 : 1 }}
                loading="lazy" decoding="async"
              />
            </div>
          ) : (
            <p className="text-[#243B53] text-[15px] leading-[1.38] whitespace-pre-wrap break-words">{renderBody(m.body, term, isMine)}</p>
          )}

          <div className="flex items-center gap-1 justify-end mt-0.5 -mb-0.5 select-none">
            {isStarred && <Star size={10} className="text-yellow-700" fill="#FDE047" />}
            {m.is_pinned && <Pin size={10} className="text-[#64748B]" />}
            {m.edited && !deleted && <span className="text-[10px] text-[#64748B]">edited</span>}
            <span className="text-[10px] text-[#64748B]">{timeOf(m.created_at)}</span>
            {isMine && !deleted && <Ticks m={m} />}
          </div>

          {reactionEntries.length > 0 && (
            <div className={'absolute -bottom-3.5 bg-white border border-[#E2E8F0] rounded-full px-1.5 py-[1px] flex gap-0.5 text-[12px] ' + (isMine ? 'left-2' : 'right-2')}>
              {Object.entries(reactionEntries.reduce((a, [, e]) => { a[e] = (a[e] || 0) + 1; return a; }, {}))
                .map(([e, c]) => <span key={e}>{e}{c > 1 ? c : ''}</span>)}
            </div>
          )}

          {pop && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 text-4xl" style={{ animation: 'heartPop .75s ease-out forwards' }}>❤️</span>
          )}
        </div>

        {m._failed && <p className="text-[10px] text-red-600 text-right mt-0.5 flex items-center justify-end gap-1"><CornerUpLeft size={10} /> Not sent. Tap to retry</p>}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
