import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { BUSINESS_PAGE_PRICE, formatKES } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { ArrowLeft, Check, Clock, Phone, MessageCircle, BarChart2, Shield, Briefcase } from 'lucide-react';
import { goBack } from '../../lib/nav';

export default function BusinessPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [payments,    setPayments]    = useState([]);

  useEffect(() => {
    fetchPayments();
    const t = setInterval(() => { refreshProfile(); fetchPayments(); }, 20000);
    return () => clearInterval(t);
  }, []);

  const fetchPayments = async () => {
    const { data } = await supabase.from('payments')
      .select('*').eq('payment_type','business_page')
      .order('created_at', { ascending: false }).limit(5);
    setPayments(data || []);
  };

  const isBusiness = profile?.is_business;
  const hasPending  = payments.some(p => p.status === 'pending');

  const FEATURES = [
    { icon: Shield,       text: 'Verified business badge ✓' },
    { icon: Phone,        text: 'Call button on your profile' },
    { icon: MessageCircle,text: 'WhatsApp contact button' },
    { icon: BarChart2,    text: 'Business analytics dashboard' },
    { icon: Check,        text: 'Featured in business directory' },
    { icon: Check,        text: 'Ad creation access' },
    { icon: Check,        text: 'Priority in search results' },
    { icon: Check,        text: '100 posts per day' },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/')} className="text-[#64748B] hover:text-[#202938]"><ArrowLeft size={22} /></button>
        <div>
          <h1 className="text-[#202938] font-bold text-[15px] leading-none">Business Page</h1>
          <p className="text-[#64748B] text-xs mt-0.5">{formatKES(BUSINESS_PAGE_PRICE)} / month</p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">

        {isBusiness && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex items-center gap-3">
            <Briefcase size={24} className="text-[#B45309]" />
            <div>
              <p className="text-[#202938] font-bold">Business Page Active</p>
              <p className="text-[#64748B] text-xs mt-0.5">Your business features are live.</p>
            </div>
          </div>
        )}

        {hasPending && !isBusiness && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex items-start gap-3">
            <Clock size={16} className="text-yellow-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-700 font-bold text-sm">Setup pending verification</p>
              <p className="text-yellow-700/60 text-xs mt-0.5">Your payment is being verified. Business features activate after confirmation.</p>
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-5 text-center">
          <Briefcase size={44} className="text-[#B45309] mb-3" />
          <p className="text-[#202938] font-black text-xl mb-1">B-Link Business</p>
          <p className="text-[#64748B] text-sm mb-3">Grow your brand on Africa's GenZ platform</p>
          <div className="bg-[#F1F5F9] rounded-xl px-4 py-3 inline-block">
            <p className="text-[#64748B] text-xs">Monthly subscription</p>
            <p className="text-[#202938] font-black text-3xl">{formatKES(BUSINESS_PAGE_PRICE)}</p>
            <p className="text-[#94A3B8] text-[11px]">per month</p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-[#202938] font-bold text-sm mb-3">Everything included</p>
          <div className="space-y-2.5">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                  <f.icon size={13} className="text-yellow-700" />
                </div>
                <p className="text-[#64748B] text-[13px]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Who it's for */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-[#202938] font-bold text-sm mb-2">Who should use this?</p>
          <div className="space-y-1.5">
            {['Businesses & brands selling products/services','Content creators monetising their audience','Public figures building their personal brand','NGOs and community organisations'].map((item,i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                <p className="text-[#64748B] text-[12px]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {!isBusiness && !hasPending && (
          <button
            onClick={() => setShowPayment(true)}
            className="w-full py-4 rounded-2xl font-bold text-[#202938] text-[15px] active:scale-[0.98] transition-all"
            style={{ background:'linear-gradient(135deg, #FFD700, #F97316)', boxShadow:'0 8px 24px rgba(255,215,0,0.25)' }}
          >
            Set up Business Page — {formatKES(BUSINESS_PAGE_PRICE)}/mo
          </button>
        )}

        <p className="text-[#94A3B8] text-[11px] text-center px-4 leading-relaxed">
          Billed monthly. Cancel anytime. Service continues until end of paid period.
        </p>
      </div>

      {showPayment && (
        <PaymentModal
          title="Business Page Setup"
          amount={BUSINESS_PAGE_PRICE}
          paymentType="business_page"
          paymentMeta={{}}
          description="B-Link Business Page — monthly subscription"
          onClose={() => setShowPayment(false)}
          onSuccess={() => { fetchPayments(); setShowPayment(false); }}
        />
      )}
    </div>
  );
}