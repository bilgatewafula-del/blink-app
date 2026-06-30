// src/components/VerifiedBadge.jsx
// B-Link Premium Verified Badge
// Single shared SVG — use this everywhere, never copy-paste inline SVGs.
// Security: ONLY render when profile.is_verified === true from DB.
// Never derive verification from payments, localStorage, or client state.

/**
 * @param {number}  size   — diameter in px (default 18)
 * @param {string}  className — extra Tailwind / CSS classes
 * @param {string}  style  — inline style overrides
 */
export default function VerifiedBadge({ size = 18, className = '', style = {} }) {
  // Derived dimensions — keep proportions perfect at any size
  const r          = size / 2;           // radius
  const cx         = r;                  // centre-x
  const cy         = r;                  // centre-y

  // Scalloped starburst: 14 soft points
  const points     = 14;
  const outerR     = r * 0.92;
  const innerR     = r * 0.76;
  const starPath   = buildStarPath(cx, cy, outerR, innerR, points);

  // Glow radius
  const glowSpread = size * 0.18;
  const svgSize    = size + glowSpread * 2;
  const offset     = glowSpread;

  // Checkmark proportions
  const ck = {
    x1: cx - size * 0.18 + offset,
    y1: cy + size * 0.02 + offset,
    x2: cx - size * 0.04 + offset,
    y2: cy + size * 0.16 + offset,
    x3: cx + size * 0.18 + offset,
    y3: cy - size * 0.12 + offset,
  };

  const gradId   = 'blk-vbg';
  const rimId    = 'blk-vbr';
  const glowId   = 'blk-vbgl';
  const shadowId = 'blk-vbsh';

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block flex-shrink-0 select-none ${className}`}
      style={{ verticalAlign: 'middle', ...style }}
      aria-label="B-Link Verified"
      role="img"
    >
      <defs>
        {/* Main gradient — deep blue */}
        <radialGradient id={gradId} cx="40%" cy="35%" r="65%" fx="40%" fy="35%">
          <stop offset="0%"   stopColor="#6AA8FF" />
          <stop offset="40%"  stopColor="#1E6FFF" />
          <stop offset="100%" stopColor="#0A3ED4" />
        </radialGradient>

        {/* Rim / outer border gradient */}
        <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0A5FE8" />
          <stop offset="100%" stopColor="#073AAE" />
        </linearGradient>

        {/* Glow filter */}
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={size * 0.08} result="blur" />
          <feFlood floodColor="#1E6FFF" floodOpacity="0.55" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Drop shadow filter */}
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy={size * 0.04}
            stdDeviation={size * 0.06}
            floodColor="#0A3ED4"
            floodOpacity="0.5"
          />
        </filter>
      </defs>

      {/* Glow halo behind badge */}
      <ellipse
        cx={cx + offset}
        cy={cy + offset}
        rx={outerR * 1.1}
        ry={outerR * 1.1}
        fill="#1E6FFF"
        opacity="0.18"
        filter={`url(#${glowId})`}
      />

      {/* Rim (slightly larger star — outer border) */}
      <path
        d={buildStarPath(cx + offset, cy + offset, outerR * 1.07, innerR * 1.07, points)}
        fill={`url(#${rimId})`}
        filter={`url(#${shadowId})`}
      />

      {/* Main star body */}
      <path
        d={buildStarPath(cx + offset, cy + offset, outerR * 0.97, innerR * 1.01, points)}
        fill={`url(#${gradId})`}
      />

      {/* Inner highlight — subtle top-left sheen */}
      <path
        d={buildStarPath(cx + offset, cy + offset, outerR * 0.83, innerR * 0.88, points)}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={size * 0.025}
      />

      {/* White checkmark */}
      <polyline
        points={`${ck.x1},${ck.y1} ${ck.x2},${ck.y2} ${ck.x3},${ck.y3}`}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={size * 0.115}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.97"
      />
    </svg>
  );
}

/* ── Build scalloped starburst SVG path ── */
function buildStarPath(cx, cy, outerR, innerR, numPoints) {
  const totalPoints = numPoints * 2;
  const angleStep   = (Math.PI * 2) / totalPoints;
  // Rotate so a peak is at the top
  const startAngle  = -Math.PI / 2;

  let d = '';
  for (let i = 0; i < totalPoints; i++) {
    const angle = startAngle + i * angleStep;
    const r     = i % 2 === 0 ? outerR : innerR;
    const x     = cx + r * Math.cos(angle);
    const y     = cy + r * Math.sin(angle);
    d += (i === 0 ? 'M' : 'L') + `${x.toFixed(3)},${y.toFixed(3)} `;
  }
  return d + 'Z';
}