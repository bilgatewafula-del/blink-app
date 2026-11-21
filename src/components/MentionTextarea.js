// src/components/MentionTextarea.js
// A caption box where @mentions and #hashtags turn colour as you type, with a
// people list while typing "@name" and tag ideas while typing "#tag".
// The list closes as soon as you pick someone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import { tokenize, MENTION_COLOR, TAG_COLOR } from './RichText';

const MENTION_AT_CARET = /(^|\s)@([A-Za-z0-9_]{1,20})$/;
const TAG_AT_CARET = /(^|\s)#([\p{L}\p{N}_]{0,40})$/u;

export default function MentionTextarea({
  value, onChange, placeholder, rows = 5, maxLength, textareaRef, hashtagIdeas = [],
  className = 'text-[17px] leading-relaxed', style, onFocus,
}) {
  const innerRef = useRef(null);
  const ref = textareaRef || innerRef;
  const [sug, setSug] = useState(null);     // { kind, query, start, end, items }
  const reqRef = useRef(0);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const detect = useCallback((text, caret) => {
    const before = text.slice(0, caret);
    const m = before.match(MENTION_AT_CARET);
    if (m) {
      const query = m[2];
      const start = caret - query.length - 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const my = ++reqRef.current;
        const { data } = await supabase.from('users')
          .select('id, username, display_name, avatar_url, is_verified')
          .or('username.ilike.' + query + '%,display_name.ilike.' + query + '%')
          .limit(6);
        if (my !== reqRef.current) return;
        setSug((data || []).length ? { kind: 'mention', query, start, end: caret, items: data } : null);
      }, 180);
      return;
    }
    const t = before.match(TAG_AT_CARET);
    if (t && hashtagIdeas.length) {
      const query = t[2].toLowerCase();
      const items = hashtagIdeas.filter((h) => h.toLowerCase().startsWith(query) && h.toLowerCase() !== query).slice(0, 6);
      reqRef.current += 1;
      setSug(items.length ? { kind: 'tag', query, start: caret - query.length - 1, end: caret, items } : null);
      return;
    }
    reqRef.current += 1;
    clearTimeout(timer.current);
    setSug(null);
  }, [hashtagIdeas]);

  const handleChange = (e) => {
    onChange(e.target.value);
    detect(e.target.value, e.target.selectionStart);
  };

  const pick = (item) => {
    if (!sug) return;
    const insert = (sug.kind === 'mention' ? '@' + item.username : '#' + item) + ' ';
    const next = value.slice(0, sug.start) + insert + value.slice(sug.end);
    onChange(next);
    setSug(null);
    const pos = sug.start + insert.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    });
  };

  const common = { padding: 0, border: 0, font: 'inherit', letterSpacing: 'inherit', wordBreak: 'break-word', whiteSpace: 'pre-wrap' };

  return (
    <div className="relative mb-2">
      <div className="grid" style={{ minHeight: rows * 28 }}>
        <div aria-hidden="true" className={'text-white pointer-events-none ' + className} style={{ gridArea: '1 / 1', ...common, ...style }}>
          {tokenize(value).map((p) => (
            <span key={p.key} style={p.kind === 'mention' ? { color: MENTION_COLOR, fontWeight: 700 } : p.kind === 'tag' ? { color: TAG_COLOR, fontWeight: 700 } : undefined}>{p.text}</span>
          ))}
          {'\n'}
        </div>
        {!value && <div aria-hidden="true" className={'text-[#8E8C88] pointer-events-none ' + className} style={{ gridArea: '1 / 1', ...common, ...style }}>{placeholder}</div>}
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onSelect={(e) => detect(e.target.value, e.target.selectionStart)}
          onFocus={onFocus}
          onBlur={() => setTimeout(() => setSug(null), 150)}
          maxLength={maxLength}
          aria-label="Caption"
          className={'bg-transparent focus:outline-none resize-none overflow-hidden ' + className}
          style={{ gridArea: '1 / 1', color: 'transparent', caretColor: '#fff', width: '100%', height: '100%', ...common, ...style }}
        />
      </div>

      {sug && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[#1d1c1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          {sug.items.map((it) => (
            sug.kind === 'mention' ? (
              <button key={it.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it)}
                className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-white/[0.06] text-left">
                <Avatar url={it.avatar_url} name={it.display_name || it.username} size={8} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-white text-[14px] font-bold truncate">{it.display_name || it.username}{it.is_verified && <VerifiedBadge size={13} />}</span>
                  <span className="block text-[#8E8C88] text-[12px] truncate">@{it.username}</span>
                </span>
              </button>
            ) : (
              <button key={it} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it)}
                className="w-full px-4 py-2.5 active:bg-white/[0.06] text-left text-[14px] font-bold" style={{ color: TAG_COLOR }}>#{it}</button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
