import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { VERIFICATION_PRICE, formatKES } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { ArrowLeft, Check, Clock } from 'lucide-react';
import VerifiedBadge from '../../components/VerifiedBadge';

export default function VerificationPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [showPayment, setShowPayment]  = useState(false);
  const [payments,    setPayments]     = useState([]);

  useEffect(() => {
    fetchPayments();
    const t = setInterval(() => { refreshProfile(); fetchPayments(); }, 20000);
    return () => clearInterval(t);
  }, []);

  const fetchPayments = async () => {
    const { data } = await supabase.from('payments')
      .select('*').eq('payment_type', 'verification')
      .order('created_at', { ascending: false }).limit(5);
    setPayments(data || []);
  };

  const hasPending  = payments.some(p => p.status === 'pending');
  const isVerified  = profile?.is_verified;

  const REQUIREMENTS = [
    'Your account must be at least 30 days old',
    'You must have at least 50 followers',
    'Your profile must have a real photo and bio',
    'Your account must not have any active violations',
    'You must be a real person, brand, or public figure',
  ];

  const BENEFITS = [
    '✓ Blue verified badge on your profile and posts',
    '✓ Higher visibility in Discover and search',
    '✓ Priority in "People to Follow" suggestions',
    '✓ Verified label in comments and replies',
    '✓ Protection against impersonation',
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white"><ArrowLeft size={22} /></button>
        <div>
          <h1 className="text-white font-bold text-[15px] leading-none">Get Verified</h1>
          <p className="text-[#6B7280] text-xs mt-0.5">One-time verification fee</p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">

        {/* Already verified */}
        {isVerified && (
          <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/25 rounded-2xl p-5 flex flex-col items-center text-center gap-3">
            <VerifiedBadge size={48} />
            <div>
              <p className="text-white font-black text-lg">Verified Account ✓</p>
              <p className="text-[#6B7280] text-xs mt-1">
                Your B-Link verified badge is live and visible on your profile, posts, and comments.
              </p>
              {profile?.verified_at && (
                <p className="text-white/30 text-[11px] mt-2">
                  Verified since {new Date(profile.verified_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 bg-white/[0.05] rounded-xl px-4 py-2.5 mt-1">
              <span className="text-white/70 text-sm font-semibold">{profile?.display_name}</span>
              <VerifiedBadge size={16} />
            </div>
          </div>
        )}

        {/* Pending */}
        {hasPending && !isVerified && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex items-start gap-3">
            <Clock size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-400 font-bold text-sm">Verification pending</p>
              <p className="text-yellow-400/60 text-xs mt-0.5">Your payment is being reviewed. Badge activates after admin confirms.</p>
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="bg-gradient-to-br from-[#1E6FFF]/15 to-[#7B2FFF]/15 border border-[#1E6FFF]/20 rounded-2xl p-5 text-center">
          <div className="flex justify-center mb-3">
            <VerifiedBadge size={56} />
          </div>
          <p className="text-white font-black text-xl mb-1">B-Link Verified Badge</p>
          <p className="text-white/50 text-sm mb-3">One-time fee — badge stays forever</p>
          <div className="bg-white/[0.06] rounded-xl px-4 py-3 inline-block">
            <p className="text-[#6B7280] text-xs">One-time verification fee</p>
            <p className="text-white font-black text-3xl">{formatKES(VERIFICATION_PRICE)}</p>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-3">What you get</p>
          <div className="space-y-2">
            {BENEFITS.map((b,i) => (
              <p key={i} className="text-white/65 text-[13px]">{b}</p>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-3">Requirements</p>
          <div className="space-y-2">
            {REQUIREMENTS.map((r,i) => (
              <div key={i} className="flex items-start gap-2">
                <Check size={12} className="text-[#1E6FFF] flex-shrink-0 mt-0.5" />
                <p className="text-white/60 text-[12px]">{r}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {!isVerified && !hasPending && (
          <button
            onClick={() => setShowPayment(true)}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow:'0 8px 24px rgba(30,111,255,0.3)' }}
          >
            Apply for Verification — {formatKES(VERIFICATION_PRICE)}
          </button>
        )}

        <p className="text-white/25 text-[11px] text-center px-4 leading-relaxed">
          Payment is non-refundable if your application does not meet requirements. Admin reviews all applications manually.
        </p>
      </div>

      {showPayment && (
        <PaymentModal
          title="Get Verified Badge"
          amount={VERIFICATION_PRICE}
          paymentType="verification"
          paymentMeta={{}}
          description="One-time fee for B-Link verified badge (✓)"
          onClose={() => setShowPayment(false)}
          onSuccess={() => { fetchPayments(); setShowPayment(false); }}
        />
      )}
    </div>
  );
}