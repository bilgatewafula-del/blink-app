import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatNumber';
import { getActivePlan, PLANS } from '../utils/paymentUtils';
import VerifiedBadge from './VerifiedBadge';
import {
  X, Home, Compass, Bell, MessageCircle, User,
  Settings, HelpCircle, Info, Bookmark, Zap,
  Shield, DollarSign, CheckCircle, Building2,
  Coins, Star, LogOut, ChevronRight, Bot,
} from 'lucide-react';

export default function Drawer({ isOpen, onClose }) {
  const navigate          = useNavigate();
  const { profile, signOut } = useAuth();

  const activePlan  = getActivePlan(profile);
  const planInfo    = PLANS[activePlan];
  const isAdmin     = ['blink','admin','moderator'].includes(profile?.role);
  const isBlink     = profile?.role === 'blink';

  const go = (path) => { navigate(path); onClose(); };

  const handleSignOut = async () => {
    onClose();
    await signOut();
  };

  /* ── Nav sections ── */
  const MAIN = [
    { icon: Home,         label: 'Home',           path: '/'              },
    { icon: Compass,      label: 'Discover',        path: '/discover'      },
    { icon: Zap,          label: 'Vibes',           path: '/vibes'         },
    { icon: MessageCircle,label: 'Chats',           path: '/chats'         },
    { icon: Bell,         label: 'Notifications',   path: '/notifications' },
    { icon: User,         label: 'My Profile',      path: '/profile'       },
    { icon: Bookmark,     label: 'Saved Posts',     path: '/saved'         },
    { icon: Bot,          label: 'B-Link AI',       path: '/ai'            },
  ];

  const MONETISE = [
    { icon: Star,         label: 'B-Link Premium',  path: '/premium'       },
    { icon: Coins,        label: 'My Coins',         path: '/coins',
      badge: formatNumber(profile?.coins_balance || 0) + ' 🪙'             },
    { icon: CheckCircle,  label: 'Get Verified',     path: '/verification',
      badge: profile?.is_verified ? '✓ Active' : null                       },
    { icon: Building2,    label: 'Business Page',   path: '/business-page',
      badge: profile?.is_business ? 'Active' : null                         },
  ];

  const ADMIN_ITEMS = [
    { icon: Shield,       label: 'Admin Panel',     path: '/admin'          },
    { icon: DollarSign,   label: 'Payments',        path: '/admin/payments' },
  ];

  const SUPPORT = [
    { icon: Settings,     label: 'Settings',        path: '/settings'      },
    { icon: HelpCircle,   label: 'Help Center',     path: '/help'          },
    { icon: Info,         label: 'About B-Link',    path: '/about'         },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-[#0d1f3c] border-r border-white/10 shadow-2xl"
        style={{ width: 'min(85vw, 320px)', animation: 'slideInLeft 0.22s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Profile header ── */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-white/[0.08]">
          <button
            onClick={() => go('/profile')}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {profile?.display_name?.[0]?.toUpperCase() || 'B'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-white font-bold text-[15px] truncate">{profile?.display_name || 'B-Link User'}</p>
                {profile?.is_verified && <VerifiedBadge size={14} />}
                {profile?.role === 'blink' && <span className="text-[13px]">👑</span>}
              </div>
              <p className="text-[#6B7280] text-xs truncate">@{profile?.username || 'user'}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-white/50 text-[11px]">
                  <span className="text-white/80 font-semibold">{formatNumber(profile?.followers_count || 0)}</span> followers
                </span>
                <span className="text-white/50 text-[11px]">
                  <span className="text-white/80 font-semibold">{formatNumber(profile?.posts_count || 0)}</span> posts
                </span>
              </div>
            </div>
          </button>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white p-1 flex-shrink-0 ml-2">
            <X size={20} />
          </button>
        </div>

        {/* ── Plan badge ── */}
        {activePlan !== 'free' && (
          <div
            className="mx-4 mt-3 px-3 py-2 rounded-xl flex items-center gap-2"
            style={{ background: planInfo?.color + '15', border: '1px solid ' + planInfo?.color + '30' }}
          >
            <span className="text-base">{planInfo?.badge}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[13px]">{planInfo?.label} Plan</p>
              {profile?.subscription_expires_at && (
                <p className="text-[#6B7280] text-[10px]">
                  expires {new Date(profile.subscription_expires_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Scrollable nav ── */}
        <div className="flex-1 overflow-y-auto py-2 scrollbar-none">

          {/* Main nav */}
          <div className="px-2 mb-1">
            {MAIN.map(item => (
              <NavItem key={item.path} item={item} onPress={() => go(item.path)} />
            ))}
          </div>

          {/* Monetisation */}
          <SectionLabel label="Premium & Earnings" />
          <div className="px-2 mb-1">
            {MONETISE.map(item => (
              <NavItem key={item.path} item={item} onPress={() => go(item.path)} />
            ))}
          </div>

          {/* Admin */}
          {isAdmin && (
            <>
              <SectionLabel label="Administration" />
              <div className="px-2 mb-1">
                {ADMIN_ITEMS.map(item => (
                  <NavItem key={item.path} item={item} onPress={() => go(item.path)} admin />
                ))}
              </div>
            </>
          )}

          {/* Support */}
          <SectionLabel label="Support" />
          <div className="px-2 mb-2">
            {SUPPORT.map(item => (
              <NavItem key={item.path} item={item} onPress={() => go(item.path)} />
            ))}
          </div>
        </div>

        {/* ── Sign out ── */}
        <div className="border-t border-white/[0.07] px-4 py-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={18} />
            <span className="font-semibold text-[14px]">Sign Out</span>
          </button>
          <p className="text-white/20 text-[10px] text-center mt-2">B-Link v2.0 · Made for Africa 🌍</p>
        </div>
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* ── Sub-components ── */
function SectionLabel({ label }) {
  return (
    <p className="text-[#6B7280] text-[10px] font-bold uppercase tracking-widest px-5 pt-3 pb-1">
      {label}
    </p>
  );
}

function NavItem({ item, onPress, admin }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onPress}
      className={'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left active:scale-[0.98] ' +
        (admin ? 'hover:bg-red-500/10' : 'hover:bg-white/[0.06]')}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${admin ? 'bg-red-500/15' : 'bg-white/[0.06]'}`}>
        <Icon size={16} className={admin ? 'text-red-400' : 'text-[#6B7280]'} />
      </div>
      <span className={`flex-1 font-semibold text-[14px] ${admin ? 'text-red-300' : 'text-white/80'}`}>
        {item.label}
      </span>
      {item.badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E6FFF]/20 text-[#1E6FFF] border border-[#1E6FFF]/30 flex-shrink-0">
          {item.badge}
        </span>
      )}
      <ChevronRight size={14} className="text-[#6B7280] flex-shrink-0" />
    </button>
  );
}