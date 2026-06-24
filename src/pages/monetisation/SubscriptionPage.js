import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { MPESA, PLANS, formatKES, generateReference, getActivePlan } from '../../utils/paymentUtils';
import { ArrowLeft, Check, X, Crown, Copy, CheckCircle, Clock, AlertCircle } from 'lucide-react';

/* ── M-Pesa payment instruction modal ──────── */
function PaymentModal({ plan, onClose, onSubmitted }) {
  const { user } = useAuth();
  const [ref]         = useState(generateReference);
  const [mpesaPhone,  setMpesaPhone]  = useState('');
  const [copied,      setCopied]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState('');
  const p = PLANS[plan];

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleSubmit = async () => {
    if (!mpesaPhone.trim()) { setError('Enter the M-Pesa number you paid from.'); return; }
    const phone = mpesaPhone.replace(/\s/g, '');
    if (!/^(07|01|\+254|254)\d{8,9}$/.test(phone)) { setError('Enter a valid M-Pesa number e.g. 0712345678'); return; }
    setSubmitting(true); setError('');

    // Create payment record
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error: dbErr } = await supabase.from('payments').insert({
      user_id:       user.id,
      payment_type:  'subscription',
      plan,
      amount:        p.price,
      reference_code: ref,
      mpesa_number:  phone,
      status:        'pending',
      service_granted: false,
      expires_at:    expiresAt.toISOString(),
      notes:         `Subscription upgrade to ${p.label} plan`,
    });

    if (dbErr) { setError('Failed to submit. Try again.'); setSubmitting(false); return; }

    // Notify admins
    const { data: admins } = await supabase.from('users')
      .select('id').in('role', ['blink', 'admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id,
          from_user_id: user.id,
          type: 'admin_action',
          message: `💰 Payment pending: ${ref} — ${p.label} plan (${formatKES(p.price)})`,
          is_read: false,
        }))
      );
    }

    setSubmitted(true);
    setSubmitting(false);
    onSubmitted?.();
  };

  if (submitted) return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#0d1f3c] rounded-t-3xl p-6 pb-10 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <h2 className="text-white font-black text-xl mb-2">Payment Submitted! ✅</h2>
        <p className="text-white/60 text-sm mb-1">Reference: <span className="text-white font-bold">{ref}</span></p>
        <p className="text-white/50 text-sm mb-4">Your {p.label} plan will be activated within a few minutes after verification.</p>
        <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-4 mb-5 text-left">
          <p className="text-[#1E6FFF] font-bold text-sm mb-1">⏱ What happens next?</p>
          <p className="text-white/60 text-xs leading-relaxed">Our team will verify your payment on M-Pesa. Once confirmed, your {p.label} features will activate automatically. This usually takes 5–30 minutes.</p>
        </div>
        <button onClick={onClose}
          className="w-full py-4 rounded-2xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)' }}>
          Got it, I'll wait
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-black text-lg">Pay via M-Pesa</h2>
            <p className="text-white/50 text-sm">{p.label} Plan — {formatKES(p.price)}/month</p>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><X size={22} /></button>
        </div>

        {/* Step 1 */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-3">
          <p className="text-white font-bold text-sm mb-3">Step 1 — Send M-Pesa to Till Number</p>

          <div className="space-y-3">
            {[
              { label: 'Till Number', value: MPESA.till },
              { label: 'Till Name',   value: MPESA.name },
              { label: 'Amount',      value: formatKES(p.price) },
              { label: 'Reference',   value: ref, hint: 'Use this as your M-Pesa reference/reason' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[#6B7280] text-[11px] font-semibold uppercase tracking-wider">{item.label}</p>
                  <p className="text-white font-bold text-[15px] truncate">{item.value}</p>
                  {item.hint && <p className="text-yellow-400 text-[10px] mt-0.5">{item.hint}</p>}
                </div>
                <button
                  onClick={() => copy(item.value, item.label)}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0"
                >
                  {copied === item.label
                    ? <><CheckCircle size={12} className="text-green-400" /><span className="text-green-400 text-xs font-bold">Copied</span></>
                    : <><Copy size={12} className="text-white/60" /><span className="text-white/60 text-xs">Copy</span></>
                  }
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-4">
          <p className="text-white font-bold text-sm mb-3">Step 2 — Enter your M-Pesa number</p>
          <p className="text-white/50 text-xs mb-3">The number you paid from, so we can verify quickly.</p>
          <input
            type="tel"
            value={mpesaPhone}
            onChange={e => { setMpesaPhone(e.target.value); setError(''); }}
            placeholder="e.g. 0712 345 678"
            inputMode="tel"
            className="w-full bg-white/[0.07] border border-white/15 rounded-xl px-4 py-3 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60"
          />
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        {/* Warning */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4 flex gap-2">
          <AlertCircle size={15} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-400/80 text-[11px] leading-relaxed">
            Only submit after completing the M-Pesa payment. Fake submissions will be rejected and your account flagged.
          </p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}
        >
          {submitting
            ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
            : '✅ I have paid — Submit'
          }
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SUBSCRIPTION PAGE
═══════════════════════════════════════════════ */
export default function SubscriptionPage() {
  const navigate          = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [selected,   setSelected]   = useState(null);
  const [myPayments, setMyPayments] = useState([]);
  const [tab,        setTab]        = useState('plans'); // plans | history

  const activePlan = getActivePlan(profile);

  useEffect(() => {
    fetchMyPayments();
    // Poll every 30s for activation
    const interval = setInterval(() => { fetchMyPayments(); refreshProfile(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMyPayments = async () => {
    const { data } = await supabase.from('payments')
      .select('*').eq('payment_type', 'subscription')
      .order('created_at', { ascending: false }).limit(10);
    setMyPayments(data || []);
  };

  const planKeys = ['free', 'pro', 'creator', 'business'];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors"><ArrowLeft size={22} /></button>
        <div>
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Subscription</h1>
          <p className="text-[#6B7280] text-xs mt-0.5">Current: <span className="text-[#1E6FFF] font-bold capitalize">{activePlan}</span>
            {profile?.subscription_expires_at && activePlan !== 'free' && (
              <span> · expires {new Date(profile.subscription_expires_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-5 bg-white/[0.05] rounded-2xl p-1">
        {[['plans','Plans'],['history','My Payments']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (tab === k ? 'bg-[#1E6FFF] text-white shadow-lg shadow-[#1E6FFF]/30' : 'text-white/50')}>
            {l}
          </button>
        ))}
      </div>

      {/* ── PLANS ── */}
      {tab === 'plans' && (
        <div className="px-4 space-y-3">
          {planKeys.map(key => {
            const p       = PLANS[key];
            const isActive = activePlan === key;
            const isCurrent= profile?.subscription_plan === key;
            return (
              <div
                key={key}
                className="rounded-2xl border overflow-hidden transition-all"
                style={{
                  borderColor: isActive ? p.color + '60' : 'rgba(255,255,255,0.08)',
                  background:  isActive ? p.color + '10' : 'rgba(255,255,255,0.03)',
                }}
              >
                {/* Plan header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {p.badge && <span className="text-xl">{p.badge}</span>}
                      <div>
                        <p className="text-white font-black text-lg leading-none">{p.label}</p>
                        {p.price > 0
                          ? <p className="text-white/50 text-xs mt-0.5">{formatKES(p.price)} / month</p>
                          : <p className="text-white/50 text-xs mt-0.5">Always free</p>
                        }
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: p.color + '25', color: p.color, border: '1px solid ' + p.color + '40' }}>
                          ✓ Active
                        </span>
                      )}
                      {p.price > 0 && !isActive && (
                        <button
                          onClick={() => setSelected(key)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                          style={{ background: p.color, boxShadow: '0 4px 16px ' + p.color + '40' }}
                        >
                          Upgrade
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-1.5">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check size={12} style={{ color: p.color, flexShrink: 0 }} />
                        <span className="text-white/70 text-[12px]">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Info */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 mt-2">
            <p className="text-white/60 text-xs leading-relaxed">
              💡 All subscriptions are billed monthly. Pay via M-Pesa to Till <strong className="text-white">4766037</strong> (BILGATE WAFULA MUKHAYO). Your plan activates within minutes of payment confirmation.
            </p>
          </div>
        </div>
      )}

      {/* ── PAYMENT HISTORY ── */}
      {tab === 'history' && (
        <div className="px-4 space-y-2">
          {myPayments.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">💳</p>
              <p className="text-white font-bold">No payments yet</p>
              <p className="text-[#6B7280] text-sm mt-1">Your subscription payments will appear here</p>
            </div>
          ) : myPayments.map(pay => (
            <div key={pay.id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white font-bold text-[14px] capitalize">{PLANS[pay.plan]?.label || pay.plan} Plan</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      pay.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                      pay.status === 'pending'   ? 'bg-yellow-500/20 text-yellow-400' :
                      pay.status === 'failed'    ? 'bg-red-500/20 text-red-400' :
                      'bg-[#6B7280]/20 text-[#6B7280]'}`}>
                      {pay.status === 'confirmed' ? '✓ Confirmed' :
                       pay.status === 'pending'   ? '⏳ Pending'  :
                       pay.status === 'failed'    ? '✗ Failed'    : pay.status}
                    </span>
                    {pay.service_granted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E6FFF]/20 text-[#1E6FFF]">Active</span>}
                  </div>
                  <p className="text-white/60 text-xs">Ref: <span className="text-white font-mono font-semibold">{pay.reference_code}</span></p>
                  <p className="text-white/40 text-xs mt-0.5">{new Date(pay.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>
                  {pay.status === 'pending' && (
                    <p className="text-yellow-400/80 text-[11px] mt-1">⏱ Verification in progress — usually 5–30 minutes</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold">{formatKES(pay.amount)}</p>
                  {pay.mpesa_number && <p className="text-[#6B7280] text-[11px] mt-0.5">{pay.mpesa_number}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment modal */}
      {selected && (
        <PaymentModal
          plan={selected}
          onClose={() => setSelected(null)}
          onSubmitted={() => { fetchMyPayments(); }}
        />
      )}
    </div>
  );
}