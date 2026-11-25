// src/components/ui.js
// Small shared building blocks so icons look consistent app-wide.
import { Crown, ShieldCheck, Shield, Star, Sparkles, Gem } from 'lucide-react';

/* Rounded square icon tile — replaces cartoon emoji in menus/cards */
export function IconTile({ icon: Icon, color = '#7C3AED', size = 40, iconSize = 20, round = 12, className = '' }) {
  return (
    <div
      className={'flex items-center justify-center flex-shrink-0 ' + className}
      style={{ width: size, height: size, borderRadius: round, background: color + '1F', border: '1px solid ' + color + '33' }}
    >
      <Icon size={iconSize} color={color} strokeWidth={2} />
    </div>
  );
}

/* Empty / error state with a proper icon instead of a giant emoji */
export function EmptyState({ icon: Icon, title, text, color = '#7C3AED', children, className = '', dark = false }) {
  return (
    <div className={'flex flex-col items-center text-center px-8 py-14 ' + className}>
      <IconTile icon={Icon} color={color} size={64} iconSize={30} round={20} />
      <p className={'font-bold text-[17px] mt-4 ' + (dark ? 'text-white' : 'text-[#111827]')}>{title}</p>
      {text && <p className={'text-sm mt-1.5 max-w-[280px] leading-snug ' + (dark ? 'text-[#64748B]' : 'text-[#64748B]')}>{text}</p>}
      {children && <div className="mt-5 flex gap-3">{children}</div>}
    </div>
  );
}

/* Role marker next to a name */
export function RoleIcon({ role, size = 15 }) {
  if (role === 'blink')     return <Crown size={size} color="#FFD700" fill="#FFD700" fillOpacity={0.25} aria-label="B-Link team" />;
  if (role === 'admin')     return <ShieldCheck size={size} color="#7C3AED" aria-label="Admin" />;
  if (role === 'moderator') return <Shield size={size} color="#A78BFA" aria-label="Moderator" />;
  return null;
}

/* Plan marker — replaces the ⭐ 🔥 💎 text badges */
const PLAN_ICON = { pro: Star, creator: Sparkles, business: Gem };
export function PlanIcon({ plan, size = 16, color }) {
  const Icon = PLAN_ICON[plan];
  if (!Icon) return null;
  const c = color || { pro: '#7C3AED', creator: '#7C3AED', business: '#FFD700' }[plan];
  return <Icon size={size} color={c} fill={c} fillOpacity={0.2} />;
}

export function Spinner({ size = 16, className = '' }) {
  return (
    <div
      className={'rounded-full animate-spin border-2 border-current border-t-transparent ' + className}
      style={{ width: size, height: size }}
    />
  );
}
