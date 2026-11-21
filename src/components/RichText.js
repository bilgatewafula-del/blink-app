// src/components/RichText.js
// Shows @mentions and #hashtags in colour and makes them tappable.
const TOKEN = /(@[A-Za-z0-9_]{3,20}|#[\p{L}\p{N}_]{1,40})/gu;

export const MENTION_COLOR = '#FF8A5C';
export const TAG_COLOR = '#4DB6FF';

export function tokenize(text) {
  return String(text || '').split(TOKEN).map((t, i) => ({
    key: i,
    text: t,
    kind: t.startsWith('@') && t.length > 3 ? 'mention' : t.startsWith('#') && t.length > 1 ? 'tag' : 'text',
  }));
}

export default function RichText({ text, onMention, onHashtag, mentionColor = MENTION_COLOR, tagColor = TAG_COLOR }) {
  if (!text) return null;
  return tokenize(text).map((p) => {
    if (p.kind === 'text') return <span key={p.key}>{p.text}</span>;
    const isMention = p.kind === 'mention';
    return (
      <button
        key={p.key}
        type="button"
        onClick={(e) => { e.stopPropagation(); (isMention ? onMention : onHashtag)?.(p.text.slice(1)); }}
        className="font-bold pointer-events-auto"
        style={{ color: isMention ? mentionColor : tagColor }}
      >
        {p.text}
      </button>
    );
  });
}
