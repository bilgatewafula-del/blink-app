import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { BOOST_PACKAGES, formatKES, getActivePlan } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { X, Zap, Check } from 'lucide-react';

export default function BoostPost({ post, onClose }) {
  const { profile }     = useAuth();
  const [step,          setStep]          = useState(1); // 1=pick, 2=pay
  const [selectedDays,  setSelectedDays]  = useState(null);
  const [showPayment,   setShowPayment]   = useState(false);

  const activePlan = getActivePlan(profile);
  const canBoost   = ['pro','creator','business'].includes(activePlan);
  const selectedPkg = BOOST_PACKAGES.find(b => b.days === selectedDays);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#FF6B35]/20 flex items-center justify-center">
              <Zap size={18} className="text-[#FF6B35]" />
            </div>
            <div>
              <p className="text-white font-black text-[15px] leading-none">Boost Post</p>
              <p className="text-[#8E8C88] text-xs">Reach more people across B-Link</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white"><X size={20} /></button>
        </div>

        {/* Requires paid plan */}
        {!canBoost && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 mb-4">
            <p className="text-yellow-400 font-bold text-sm">Pro plan required</p>
            <p className="text-yellow-400/60 text-xs mt-1">Upgrade to Pro (KES 299/month) or higher to access post boosting.</p>
          </div>
        )}

        {/* Post preview */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 mb-4">
          <p className="text-[#8E8C88] text-[10px] font-bold uppercase tracking-wider mb-1">Boosting this post</p>
          <p className="text-white/80 text-[13px] line-clamp-2">{post.caption || '[No caption]'}</p>
          {(post.media_urls||[])[0] && (
            <img src={post.media_urls[0]} alt="" className="w-full h-16 object-cover rounded-xl mt-2" />
          )}
        </div>

        {/* Package selector */}
        <p className="text-white/50 text-[11px] font-bold uppercase tracking-wider mb-2">Select Duration</p>
        <div className="space-y-2 mb-5">
          {BOOST_PACKAGES.map(pkg => (
            <button
              key={pkg.days}
              onClick={() => canBoost && setSelectedDays(pkg.days)}
              disabled={!canBoost}
              className={'w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all disabled:opacity-40 ' +
                (selectedDays === pkg.days
                  ? 'bg-[#FF6B35]/15 border-[#FF6B35]/50'
                  : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.07]')}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedDays === pkg.days ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-white/30'}`}>
                  {selectedDays === pkg.days && <Check size={11} color="white" strokeWidth={3} />}
                </div>
                <div className="text-left">
                  <p className={`font-bold text-[14px] ${selectedDays === pkg.days ? 'text-white' : 'text-white/80'}`}>
                    {pkg.label}
                  </p>
                  {pkg.tag && <span className="text-[10px] font-bold text-[#FF6B35]">{pkg.tag}</span>}
                </div>
              </div>
              <p className={`font-black text-[15px] ${selectedDays === pkg.days ? 'text-[#FF6B35]' : 'text-white/50'}`}>
                {formatKES(pkg.price)}
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowPayment(true)}
          disabled={!selectedDays || !canBoost}
          className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3D00)', boxShadow: '0 8px 24px rgba(255,107,53,0.3)' }}
        >
          Boost for {selectedPkg ? formatKES(selectedPkg.price) : '—'}
        </button>
      </div>

      {/* Payment modal — no service activation here */}
      {showPayment && selectedPkg && (
        <PaymentModal
          title={`Boost Post — ${selectedPkg.label}`}
          amount={selectedPkg.price}
          paymentType="boost"
          paymentMeta={{ boost_days: selectedPkg.days, post_id: post.id }}
          description={`Boost your post for ${selectedPkg.label} across B-Link feeds`}
          onClose={() => setShowPayment(false)}
          onSuccess={() => { setShowPayment(false); onClose(); }}
        />
      )}
    </div>
  );
}