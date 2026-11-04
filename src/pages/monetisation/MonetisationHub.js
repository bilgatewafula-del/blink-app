// src/pages/monetisation/MonetisationHub.js
// Central hub — all monetisation features in one place
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getActivePlan, formatNumber, PLANS } from '../../utils/paymentUtils';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export default function MonetisationHub() {
  const navigate     = useNavigate();
  const { profile }  = useAuth();
  const activePlan   = getActivePlan(profile);
  const planInfo     = PLANS[activePlan];
  const coins        = profile?.coins_balance || 0;
  const isVerified   = profile?.is_verified;
  const isBusiness   = profile?.is_business;

  const ITEMS = [
    {
      emoji: '⭐',
      title: 'Subscription Plans',
      subtitle: `Current: ${planInfo?.label || 'Free'} plan${activePlan !== 'free' ? ` · ${planInfo?.badge}` : ''}`,
      badge: activePlan !== 'free' ? { label: planInfo?.label, color: planInfo?.color } : null,
      path: '/subscription',
      color: '#FF5A1F',
    },
    {
      emoji: '🪙',
      title: 'B-Link Coins',
      subtitle: `Balance: ${formatNumber(coins)} coins`,
      path: '/coins',
      color: '#FFD700',
    },
    {
      emoji: '⚡',
      title: 'Boost a Post',
      subtitle: 'Promote your content across B-Link',
      path: '/boost',
      color: '#FF6B35',
      disabled: !['pro','creator','business'].includes(activePlan),
      hint: activePlan === 'free' ? 'Requires Pro plan or higher' : null,
    },
    {
      emoji: '✓',
      title: 'Get Verified',
      subtitle: isVerified ? '✓ Your account is verified' : 'One-time KES 500 verification fee',
      path: '/verification',
      color: '#FF5A1F',
      badge: isVerified ? { label: 'Verified', color: '#FF5A1F' } : null,
    },
    {
      emoji: '💼',
      title: 'Business Page',
      subtitle: isBusiness ? 'Your business page is active' : 'KES 2,000/month — for brands & creators',
      path: '/business-page',
      color: '#FFD700',
      badge: isBusiness ? { label: 'Active', color: '#FFD700' } : null,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white"><ArrowLeft size={22} /></button>
        <div>
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Premium</h1>
          <p className="text-[#8E8C88] text-xs mt-0.5">Monetisation & features</p>
        </div>
      </div>

      {/* Current plan card */}
      <div className="mx-4 mt-4 mb-5 rounded-2xl p-4 border"
        style={{ background: planInfo?.color + '10', borderColor: planInfo?.color + '30' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-1">Current Plan</p>
            <p className="text-white font-black text-2xl">
              {planInfo?.badge} {planInfo?.label}
            </p>
            {profile?.subscription_expires_at && activePlan !== 'free' && (
              <p className="text-white/40 text-xs mt-1">
                Renews {new Date(profile.subscription_expires_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-white/50 text-xs">Coins</p>
            <p className="text-yellow-400 font-black text-xl">🪙 {formatNumber(coins)}</p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="px-4 space-y-2">
        {ITEMS.map(item => (
          <button
            key={item.path}
            onClick={() => !item.disabled && navigate(item.path)}
            disabled={item.disabled}
            className={'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left active:scale-[0.98] ' +
              (item.disabled
                ? 'border-white/[0.05] bg-white/[0.02] opacity-50 cursor-not-allowed'
                : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]')}
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: item.color + '15', border: '1px solid ' + item.color + '25' }}>
              {item.emoji}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-bold text-[14px]">{item.title}</p>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: item.badge.color + '20', color: item.badge.color, border:'1px solid '+item.badge.color+'30' }}>
                    {item.badge.label}
                  </span>
                )}
              </div>
              <p className="text-[#8E8C88] text-[12px] mt-0.5">{item.subtitle}</p>
              {item.hint && <p className="text-orange-400 text-[11px] mt-0.5">{item.hint}</p>}
            </div>
            <ChevronRight size={18} className="text-[#8E8C88] flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Footer note */}
      <div className="mx-4 mt-5 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
        <p className="text-white/25 text-[11px] text-center leading-relaxed">
          All payments via M-Pesa Till <strong className="text-white/50">4766037</strong> (BILGATE WAFULA MUKHAYO). Services activate after manual verification by admin within 5–60 minutes.
        </p>
      </div>
    </div>
  );
}