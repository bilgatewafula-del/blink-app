import { useState, useEffect } from 'react';
import { PlanIcon } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { PLANS, formatKES, getActivePlan, isSubscriptionActive } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { ArrowLeft, Check, Clock, CheckCircle, XCircle, CreditCard } from 'lucide-react';
import { goBack } from '../../lib/nav';

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payments,     setPayments]     = useState([]);
  const [tab,          setTab]          = useState('plans');

  const activePlan = getActivePlan(profile);
  const isActive   = isSubscriptionActive(profile);

  useEffect(() => {
    fetchPayments();
    // Poll every 20s — when admin confirms, profile updates and user sees it
    const t = setInterval(() => { refreshProfile(); fetchPayments(); }, 20000);
    return () => clearInterval(t);
  }, []);

  const fetchPayments = async () => {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_type', 'subscription')
      .order('created_at', { ascending: false })
      .limit(20);
    setPayments(data || []);
  };

  const planOrder = ['free', 'pro', 'creator', 'business'];

  return (
    <div className="min-h-screen bg-[#F1F3F9] pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Subscription</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize inline-flex items-center gap-1 ${
              activePlan === 'free' ? 'bg-white/10 text-[#CBD5E1]' :
              activePlan === 'pro' ? 'bg-[#7C3AED]/20 text-[#C4B5FD]' :
              activePlan === 'creator' ? 'bg-[#7C3AED]/20 text-[#C4B5FD]' :
              'bg-yellow-500/20 text-yellow-700'
            }`}>
              <PlanIcon plan={activePlan} size={12} /> {activePlan} plan
            </span>
            {isActive && profile?.subscription_expires_at && (
              <span className="text-[#CBD5E1] text-[11px]">
                expires {new Date(profile.subscription_expires_at).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-5 bg-[#F8FAFC] rounded-2xl p-1">
        {[['plans', 'Plans'], ['history', 'Payment History']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (tab === k ? 'bg-[#7C3AED] text-white  ' : 'text-[#64748B]')}>
            {l}
          </button>
        ))}
      </div>

      {/* ── PLANS ── */}
      {tab === 'plans' && (
        <div className="px-4 space-y-3">

          {/* Pending payment notice */}
          {payments.some(p => p.status === 'pending') && (
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex items-start gap-3">
              <Clock size={18} className="text-yellow-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-700 font-bold text-sm">Payment pending verification</p>
                <p className="text-yellow-700/60 text-xs mt-0.5">
                  Your payment is being verified by admin. Your plan will activate automatically once confirmed.
                </p>
              </div>
            </div>
          )}

          {planOrder.map(key => {
            const p         = PLANS[key];
            const isCurrent = activePlan === key;
            const isPending = payments.some(pay => pay.plan === key && pay.status === 'pending');

            return (
              <div
                key={key}
                className="rounded-2xl border overflow-hidden"
                style={{
                  borderColor: isCurrent ? p.color + '60' : '#E2E8F0',
                  background:  isCurrent ? p.color + '08' : '#F8FAFC',
                }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <PlanIcon plan={p.key} size={26} />
                      <div>
                        <p className="text-[#111827] font-black text-[17px] leading-none">{p.label}</p>
                        <p className="text-[#94A3B8] text-xs mt-1">
                          {p.price === 0 ? 'Always free' : `${formatKES(p.price)} / month`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: p.color + '20', color: p.color, border: '1px solid ' + p.color + '40' }}>
                          ✓ Current Plan
                        </span>
                      )}
                      {isPending && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-700 border border-yellow-500/30">
                          ⏳ Pending
                        </span>
                      )}
                      {!isCurrent && !isPending && p.price > 0 && (
                        <button
                          onClick={() => setSelectedPlan(key)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-[#111827] active:scale-95 transition-all"
                          style={{ background: p.color, boxShadow: '0 4px 14px ' + p.color + '40' }}
                        >
                          Upgrade
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check size={12} style={{ color: p.price === 0 ? '#64748B' : p.color, flexShrink: 0 }} />
                        <span className="text-[#64748B] text-[12px]">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
            <p className="text-[#94A3B8] text-[11px] leading-relaxed text-center">
              All subscriptions are paid monthly via M-Pesa Till <strong className="text-[#64748B]">4766037</strong> (BILGATE WAFULA MUKHAYO). Service activates after manual payment verification by admin.
            </p>
          </div>
        </div>
      )}

      {/* ── PAYMENT HISTORY ── */}
      {tab === 'history' && (
        <div className="px-4 space-y-2">
          {payments.length === 0 ? (
            <div className="text-center py-16">
              <CreditCard size={38} className="text-[#64748B] mx-auto mb-3" />
              <p className="text-[#111827] font-bold">No payments yet</p>
              <p className="text-[#64748B] text-sm mt-1">Upgrade your plan to get started</p>
            </div>
          ) : payments.map(pay => (
            <div key={pay.id} className={`border rounded-2xl p-4 ${
              pay.status === 'confirmed' ? 'border-green-500/20 bg-green-500/[0.03]' :
              pay.status === 'pending'   ? 'border-yellow-500/20 bg-yellow-500/[0.03]' :
              'border-red-500/20 bg-red-500/[0.03]'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[#111827] font-bold text-[14px] capitalize">
                      {PLANS[pay.plan]?.label || pay.plan} Plan
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      pay.status === 'confirmed' ? 'bg-green-500/20 text-green-700 border-green-500/30' :
                      pay.status === 'pending'   ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30' :
                      'bg-red-500/20 text-red-600 border-red-500/30'
                    }`}>
                      {pay.status === 'confirmed' ? '✓ Confirmed' :
                       pay.status === 'pending'   ? '⏳ Pending verification' :
                       pay.status === 'rejected'  ? '✗ Rejected' : pay.status}
                    </span>
                    {pay.service_active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7C3AED]/20 text-[#6D28D9] border border-[#7C3AED]/30">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[#64748B] text-[11px] font-mono">Ref: <strong className="text-[#64748B]">{pay.reference_code}</strong></p>
                  <p className="text-[#64748B] text-[11px] mt-0.5">
                    {new Date(pay.created_at).toLocaleString('en-KE', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </p>
                  {pay.status === 'pending' && (
                    <p className="text-yellow-700/70 text-[11px] mt-1">
                      ⏱ Awaiting admin verification — usually 5–60 min
                    </p>
                  )}
                  {pay.rejection_reason && (
                    <p className="text-red-600/70 text-[11px] mt-1">Reason: {pay.rejection_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#111827] font-black text-[16px]">{formatKES(pay.amount_kes)}</p>
                  <p className="text-[#64748B] text-[11px] mt-0.5">{pay.mpesa_phone}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment modal */}
      {selectedPlan && (
        <PaymentModal
          title={`Upgrade to ${PLANS[selectedPlan]?.label}`}
          amount={PLANS[selectedPlan]?.price}
          paymentType="subscription"
          paymentMeta={{ plan: selectedPlan }}
          description={`${PLANS[selectedPlan]?.label} plan — ${formatKES(PLANS[selectedPlan]?.price)}/month`}
          onClose={() => setSelectedPlan(null)}
          onSuccess={() => { fetchPayments(); setSelectedPlan(null); }}
        />
      )}
    </div>
  );
}