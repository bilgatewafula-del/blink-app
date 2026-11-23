// src/components/post/TextPost.js — text-only posts shown on a coloured background
import { STORY_BACKGROUNDS, bgCss, textSizeFor } from '../../lib/storyPalette';

export const isColoredTextPost = (post) =>
  STORY_BACKGROUNDS.some((b) => b.key === post.bg_color) && !(post.media_urls && post.media_urls.length) && !post.video_url && !post.quoted_post_id &&
  !!post.caption && post.caption.length <= 280;

export default function TextPost({ text, bg, onHashtag, onMention }) {
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <div className="rounded-3xl px-6 py-8 flex items-center justify-center text-center my-2" style={{ background: bgCss(bg), minHeight: 200 }}>
      <p className="text-[#202938] font-extrabold whitespace-pre-wrap break-words"
        style={{ fontSize: textSizeFor(text.length), lineHeight: 1.25, textShadow: '0 2px 12px rgba(0,0,0,.18)' }}>
        {parts.map((p, i) => {
          if (p.startsWith('#') && p.length > 1) return <button key={i} onClick={(e) => { e.stopPropagation(); onHashtag?.(p.slice(1)); }} className="underline decoration-white/60">{p}</button>;
          if (p.startsWith('@') && p.length > 1) return <button key={i} onClick={(e) => { e.stopPropagation(); onMention?.(p.slice(1)); }} className="underline decoration-white/60">{p}</button>;
          return <span key={i}>{p}</span>;
        })}
      </p>
    </div>
  );
}
