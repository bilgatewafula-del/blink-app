// src/components/PaymentModal.js
// Universal payment modal used by ALL monetisation features
// THIS IS THE ONLY PLACE PAYMENTS ARE CREATED
// NO service is activated here — ONLY a pending payment record is created

import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { MPESA, formatKES, generateReference } from '../utils/paymentUtils';
import {
  X, Copy, CheckCircle, AlertTriangle,
  ChevronRight, Phone, Hash, DollarSign, User,
} from 'lucide-react';

/*
  Props:
    title         string      — e.g. "Upgrade to Pro"
    amount        number      — KES amount
    paymentType   string      — subscription | boost | coins | verification | business_page | microtransaction
    paymentMeta   object      — { plan, coins_amount, boost_days, post_id, ... }
    description   string      — shown to user
    onClose       fn
    onSuccess     fn(payment) — called after pending payment is created
*/
export default function PaymentModal({
  title, amount, paymentType, paymentMeta = {},
  description, onClose, onSuccess,
}) {
  const { user, profile } = useAuth();

  const [step,          setStep]          = useState(1); // 1=instructions, 2=confirm, 3=submitted
  const [mpesaPhone,    setMpesaPhone]    = useState('');
  const [mpesaName,     setMpesaName]     = useState('');
  const [confirmAmount, setConfirmAmount] = useState('');
  const [ref]                             = useState(generateReference);
  const [copied,        setCopied]        = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState('');

  const copy = (text, label) => {
    navigator.clipboard.writeText(String(text));
    setCopied(label);
    setTimeout(() => setCopied(''), 2500);
  };

  const CopyBtn = ({ text, label }) => (
    <button
      type="button"
      onClick={() => copy(text, label)}
      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0"
    >
      {copied === label
        ? <><CheckCircle size={12} className="text-green-400" /><span className="text-green-400 text-xs font-bold">Copied!</span></>
        : <><Copy size={12} className="text-white/50" /><span className="text-white/50 text-xs">Copy</span></>
      }
    </button>
  );

  const validateStep2 = () => {
    const phone = mpesaPhone.replace(/[\s-]/g,'');
    if (!phone) return 'Enter the M-Pesa phone number you paid from.';
    if (!/^(07|01|2547|2541|\+2547|\+2541)\d{7,8}$/.test(phone))
      return 'Enter a valid Kenyan M-Pesa number (e.g. 0712345678).';
    if (!mpesaName.trim()) return 'Enter the name shown on your M-Pesa confirmation SMS.';
    const entered = parseInt(confirmAmount.replace(/,/g,''));
    if (isNaN(entered) || entered !== amount)
      return `Amount must be exactly ${formatKES(amount)}. You entered ${formatKES(entered)||'nothing'}.`;
    return null;
  };

  const handleSubmit = async () => {
    const err = validateStep2();
    if (err) { setError(err); return; }
    setSubmitting(true); setError('');

    try {
      // Create pending payment — NO service granted
      const { data: payment, error: dbErr } = await supabase
        .from('payments')
        .insert({
          user_id:       user.id,
          payment_type:  paymentType,
          plan:          paymentMeta.plan          || null,
          coins_amount:  paymentMeta.coins_amount  || null,
          boost_days:    paymentMeta.boost_days    || null,
          post_id:       paymentMeta.post_id       || null,
          amount_kes:    amount,
          mpesa_till:    MPESA.till,
          mpesa_phone:   mpesaPhone.replace(/[\s-]/g,''),
          mpesa_name:    mpesaName.trim(),
          reference_code: ref,
          status:        'pending',       // STAYS PENDING — admin must confirm
          service_active: false,          // STAYS FALSE until admin confirms
          notes:         description || title,
        })
        .select()
        .single();

      if (dbErr) throw new Error(dbErr.message);

      // Create pending boost record if boost payment
      if (paymentType === 'boost' && paymentMeta.post_id) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (paymentMeta.boost_days || 1));
        await supabase.from('boosts').insert({
          post_id:      paymentMeta.post_id,
          user_id:      user.id,
          payment_id:   payment.id,
          duration_days: paymentMeta.boost_days || 1,
          amount_kes:   amount,
          status:       'pending',   // STAYS PENDING until admin confirms
          expires_at:   expiresAt.toISOString(),
        });
      }

      // Notify admins about new pending payment
      const { data: admins } = await supabase
        .from('users').select('id')
        .in('role', ['blink','admin']);

      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map(a => ({
            user_id:      a.id,
            from_user_id: user.id,
            type:         'admin_action',
            message:      `New payment pending verification — ${ref} · ${formatKES(amount)} · ${paymentType} · from ${mpesaPhone}`,
            is_read:      false,
          }))
        );
      }

      setStep(3);
      onSuccess?.(payment);
    } catch (err) {
      setError('Failed to submit: ' + err.message);
    }
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] bg-[#171614] border-t border-white/10 rounded-t-3xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
          <div>
            <p className="text-white font-black text-[16px]">{title}</p>
            <p className="text-white/40 text-xs">{description}</p>
          </div>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white w-8 h-8 flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        {/* Amount badge */}
        <div className="mx-5 mt-4 bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-[#FF5A1F]" />
            <span className="text-white/60 text-sm">Amount to pay</span>
          </div>
          <span className="text-white font-black text-xl">{formatKES(amount)}</span>
        </div>

        {/* ── STEP 1: M-Pesa instructions ── */}
        {step === 1 && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-white font-bold text-sm mb-4">
              Pay via M-Pesa — Follow these steps exactly
            </p>

            {/* Steps */}
            <div className="space-y-3 mb-5">
              {[
                {
                  n: '1',
                  title: 'Go to M-Pesa on your phone',
                  body: 'Open M-Pesa → Select "Lipa na M-Pesa" → Select "Buy Goods and Services"',
                },
                {
                  n: '2',
                  title: 'Enter Till Number',
                  body: null,
                  field: { label: 'Till Number', value: MPESA.till, key: 'till' },
                },
                {
                  n: '3',
                  title: 'Enter Amount',
                  body: null,
                  field: { label: 'Amount (KES)', value: String(amount), key: 'amount' },
                },
                {
                  n: '4',
                  title: 'Enter Reference / Reason',
                  body: 'Type this code in the M-Pesa "Reference" or "Reason" field — this is how we identify your payment',
                  field: { label: 'Your Reference Code', value: ref, key: 'ref', important: true },
                },
                {
                  n: '5',
                  title: 'Enter your PIN and send',
                  body: 'Confirm payment. You will receive an M-Pesa confirmation SMS.',
                },
              ].map(step => (
                <div key={step.n} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#FF5A1F]/20 text-[#FF5A1F] font-bold text-[13px] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[13px]">{step.title}</p>
                    {step.body && <p className="text-white/50 text-[12px] mt-0.5 leading-snug">{step.body}</p>}
                    {step.field && (
                      <div className={`mt-2 rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${step.field.important ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-white/[0.06] border border-white/10'}`}>
                        <div className="min-w-0">
                          <p className="text-[#8E8C88] text-[10px] font-bold uppercase">{step.field.label}</p>
                          <p className={`font-black text-[16px] font-mono ${step.field.important ? 'text-yellow-400' : 'text-white'}`}>
                            {step.field.value}
                          </p>
                        </div>
                        <CopyBtn text={step.field.value} label={step.field.key} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Till name */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 mb-5">
              <p className="text-[#8E8C88] text-[11px] font-bold uppercase mb-1">Business Name (confirm on M-Pesa screen)</p>
              <p className="text-white font-bold text-[14px]">{MPESA.name}</p>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-2xl font-bold text-white text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.3)' }}
            >
              I Have Paid — Confirm Details <ChevronRight size={18} />
            </button>

            <p className="text-white/30 text-[11px] text-center mt-3 px-2">
              Only proceed after completing the M-Pesa payment above. Fraudulent submissions will result in account suspension.
            </p>
          </div>
        )}

        {/* ── STEP 2: Fill confirmation details ── */}
        {step === 2 && (
          <div className="px-5 pt-4 pb-2">
            <p className="text-white font-bold text-sm mb-1">Confirm your payment details</p>
            <p className="text-white/40 text-xs mb-4">These must match your M-Pesa transaction exactly. Admin will verify against M-Pesa records.</p>

            <div className="space-y-3 mb-4">
              {/* M-Pesa Phone */}
              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">
                  <Phone size={11} className="inline mr-1" />
                  M-Pesa Phone Number You Paid From *
                </label>
                <input
                  type="tel"
                  value={mpesaPhone}
                  onChange={e => { setMpesaPhone(e.target.value); setError(''); }}
                  placeholder="e.g. 0712 345 678"
                  inputMode="tel"
                  className="w-full bg-white/[0.07] border border-white/15 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all"
                />
              </div>

              {/* M-Pesa Name */}
              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">
                  <User size={11} className="inline mr-1" />
                  Name on M-Pesa Confirmation SMS *
                </label>
                <input
                  type="text"
                  value={mpesaName}
                  onChange={e => { setMpesaName(e.target.value); setError(''); }}
                  placeholder="e.g. John Doe"
                  className="w-full bg-white/[0.07] border border-white/15 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all"
                />
              </div>

              {/* Amount confirmation */}
              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">
                  <DollarSign size={11} className="inline mr-1" />
                  Amount You Paid (KES) — must be exactly {formatKES(amount)} *
                </label>
                <input
                  type="number"
                  value={confirmAmount}
                  onChange={e => { setConfirmAmount(e.target.value); setError(''); }}
                  placeholder={String(amount)}
                  inputMode="numeric"
                  className="w-full bg-white/[0.07] border border-white/15 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all"
                />
              </div>

              {/* Reference display */}
              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-yellow-400/70 text-[11px] font-bold uppercase">
                    <Hash size={10} className="inline mr-1" />
                    Your Reference Code
                  </p>
                  <p className="text-yellow-400 font-black text-[18px] font-mono tracking-wider">{ref}</p>
                  <p className="text-yellow-400/50 text-[10px] mt-0.5">Admin uses this to find your payment on M-Pesa</p>
                </div>
                <CopyBtn text={ref} label="ref2" />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Important warning */}
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <AlertTriangle size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-orange-400/80 text-[11px] leading-relaxed">
                Your service will NOT activate immediately. An admin will verify your payment on M-Pesa and activate it manually. This usually takes 5–60 minutes during working hours.
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #2ECC71, #16A34A)', boxShadow: '0 8px 24px rgba(46,204,113,0.3)' }}
            >
              {submitting
                ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                : 'Submit for verification'
              }
            </button>
          </div>
        )}

        {/* ── STEP 3: Submitted ── */}
        {step === 3 && (
          <div className="px-5 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={40} className="text-green-400" />
            </div>
            <h3 className="text-white font-black text-xl mb-2">Payment submitted</h3>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 mb-4 text-left">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#8E8C88] text-sm">Reference</span>
                  <span className="text-white font-black font-mono">{ref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8E8C88] text-sm">Amount</span>
                  <span className="text-white font-bold">{formatKES(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8E8C88] text-sm">Status</span>
                  <span className="text-yellow-400 font-bold">⏳ Pending Verification</span>
                </div>
              </div>
            </div>
            <div className="bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 rounded-2xl p-4 mb-5 text-left">
              <p className="text-[#FF5A1F] font-bold text-sm mb-1">⏱ What happens next?</p>
              <p className="text-white/50 text-xs leading-relaxed">
                An admin will verify your payment on M-Pesa using reference <strong className="text-white">{ref}</strong>. Once confirmed, your service activates automatically and you'll receive a notification. This usually takes 5–60 minutes during business hours.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)' }}
            >
              Done — I'll wait for confirmation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}