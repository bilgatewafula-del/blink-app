// src/components/Avatar.js
// Consistent avatar used everywhere
import { avatarUrl } from '../lib/imageUtils';

export default function Avatar({ url, name, size = 10, className = '', onClick }) {
  const px = size * 4; // tailwind unit to px (size-10 = 40px)

  const style = {
    width:  px,
    height: px,
    borderRadius: '50%',
    flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#7C3AED',
    userSelect: 'none',
  };

  if (url) {
    return (
      <img
        src={avatarUrl(url, px)}
        alt={name || ''}
        style={{ ...style, objectFit: 'cover' }}
        className={className}
        onClick={onClick}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const initial = (name || '?')[0]?.toUpperCase();
  const fontSize = Math.max(10, Math.round(px * 0.4));

  return (
    <div style={style} className={className} onClick={onClick}>
      <span style={{ color: 'white', fontWeight: 800, fontSize, lineHeight: 1 }}>
        {initial}
      </span>
    </div>
  );
}