// src/components/VerifiedBadge.jsx
// The B-Link verified badge: the familiar flat blue seal with a white check.
// One shared SVG, used everywhere a verified name is shown.
// Security: ONLY render when profile.is_verified === true from the database.
// Never derive verification from payments, localStorage, or client state.
import { memo } from 'react';

const BLUE = '#2563EB';

// 12-point scalloped seal, built once per size
function sealPath(cx, cy, outer, inner, points) {
  const total = points * 2;
  let d = '';
  for (let i = 0; i < total; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / total;
    const r = i % 2 === 0 ? outer : inner;
    d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2) + ' ';
  }
  return d + 'Z';
}

/**
 * @param {number} size       diameter in px (default 18)
 * @param {string} className  extra classes
 * @param {object} style      inline style overrides
 */
function VerifiedBadge({ size = 18, className = '', style = {} }) {
  const c = size / 2;
  return (
    <svg
      width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}
      xmlns="http://www.w3.org/2000/svg"
      className={'inline-block flex-shrink-0 select-none ' + className}
      style={{ verticalAlign: 'middle', ...style }}
      aria-label="Verified account" role="img"
    >
      <path d={sealPath(c, c, c * 0.98, c * 0.84, 12)} fill={BLUE} strokeLinejoin="round" stroke={BLUE} strokeWidth={size * 0.06} />
      <polyline
        points={[c - size * 0.2, c + size * 0.01, c - size * 0.05, c + size * 0.16, c + size * 0.22, c - size * 0.13].join(',')}
        fill="none" stroke="#FFFFFF" strokeWidth={Math.max(1.6, size * 0.12)} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default memo(VerifiedBadge);
