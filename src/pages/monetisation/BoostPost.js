import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { MPESA, BOOST_PACKAGES, formatKES, generateReference, getActivePlan } from '../../utils/paymentUtils';
import { X, Copy, CheckCircle, AlertCircle, Zap } from 'lucide-react';

/* ── Boost Post Modal ── called from PostCard/Profile ── */
export default function BoostPost({ post, onClose }) {
  const { user, profile } = useAuth();
  const [step,       setStep]       = useState(1);  // 1=pick, 2=pay, 3=done
  const [selected,   setSelected]   = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [ref]                       = useState(generateReference);
  const [copied,     setCopied]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const activePlan = getActivePlan(profile);
  const canBoost   = ['pro','creator','business'].includes(activePlan);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleSubmit = async () => {
    if (!mpesaPhone.trim()) { setError('Enter your M-Pesa number.'); return; }
    const phone = mpesaPhone.replace(/\s/g,'');
    if (!/^(07|01|\+254|254)\d{8,9}$/.test(phone)) { setError('Enter a valid M-Pesa number.'); return; }
    setSubmitting(true); setError('');

    const pkg = BOOST_PACKAGES.find(b => b.days === selected);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + selected);

    // Insert payment
    const { data: pay, error: payErr } = await supabase.from('payments').insert({
      user_id:       user.id,
      payment_type:  'boost',
      plan:          null,
      amount:        pkg.price,
      reference_code: ref,
      mpesa_number:  phone,
      status:        'pending',
      service_granted: false,
      expires_at:    expiresAt.toISOString(),
      notes:         `Boost post "${(post.caption||'').slice(0,40)}" for ${selected} day(s)`,
    }).select().single();

    if (payErr) { setError('Failed to submit. Try again.'); setSubmitting(false); return; }

    // Insert boost record
    await supabase.from('boosts').insert({
      post_id:      post.id,
      user_id:      user.id,
      payment_id:   pay.id,
      duration_days: selected,
      amount:        pkg.price,
      status:       'pending',
      expires_at:   expiresAt.toISOString(),
    });

    // Notify admins
    const { data: admins } = await supabase.from('users').select('id').in('role',['blink','admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id, from_user_id: user.id,
          type: 'admin_action',
          message: `⚡ Boost payment pending: ${ref} — ${selected} day(s) (${formatKES(pkg.price)})`,
          is_read: false,
        }))
      );
    }

    setSubmitting(false);
    setStep(3);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#FF6B35]/20 flex items-center justify-center">
              <Zap size={18} className="text-[#FF6B35]" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">Boost Post</p>
              <p className="text-[#6B7280] text-xs">Reach more people instantly</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
        </div>

        {/* No plan warning */}
        {!canBoost && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-4">
            <p className="text-yellow-400 font-bold text-sm mb-1">⭐ Pro plan required to boost</p>
            <p className="text-yellow-400/70 text-xs">Upgrade to Pro (KES 299/month) or higher to access boosting.</p>
          </div>
        )}

        {/* Post preview */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3 mb-4">
          <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider mb-1">Boosting</p>
          <p className="text-white text-[13px] line-clamp-2">{post.caption || '[No caption]'}</p>
          {(post.media_urls||[])[0] && (
            <img src={post.media_urls[0]} alt="" className="w-full h-20 object-cover rounded-xl mt-2" />
          )}
        </div>

        {/* STEP 1 — Pick duration */}
        {step === 1 && (
          <>
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-3">Select Duration</p>
            <div className="space-y-2 mb-5">
              {BOOST_PACKAGES.map(pkg => (
                <button
                  key={pkg.days}
                  onClick={() => setSelected(pkg.days)}
                  disabled={!canBoost}
                  className={'w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all disabled:opacity-40 ' +
                    (selected === pkg.days
                      ? 'bg-[#FF6B35]/15 border-[#FF6B35]/50'
                      : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.07]')}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === pkg.days ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-white/30'}`}>
                      {selected === pkg.days && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div className="text-left">
                      <p className={`font-bold text-[14px] ${selected === pkg.days ? 'text-white' : 'text-white/80'}`}>{pkg.label}</p>
                      {pkg.savings && <span className="text-[10px] font-bold text-[#FF6B35]">{pkg.savings}</span>}
                    </div>
                  </div>
                  <p className={`font-black text-[15px] ${selected === pkg.days ? 'text-[#FF6B35]' : 'text-white/60'}`}>{formatKES(pkg.price)}</p>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!selected || !canBoost}
              className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3D00)' }}
            >
              Continue →
            </button>
          </>
        )}

        {/* STEP 2 — Pay */}
        {step === 2 && (() => {
          const pkg = BOOST_PACKAGES.find(b => b.days === selected);
          return (
            <>
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-3">Pay via M-Pesa</p>
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-3 space-y-3">
                {[
                  { label:'Till Number', value: MPESA.till },
                  { label:'Till Name',   value: MPESA.name },
                  { label:'Amount',      value: formatKES(pkg.price) },
                  { label:'Reference',   value: ref, hint:'Use as M-Pesa reference' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#6B7280] text-[11px] font-semibold uppercase">{item.label}</p>
                      <p className="text-white font-bold text-[14px] truncate">{item.value}</p>
                      {item.hint && <p className="text-yellow-400 text-[10px]">{item.hint}</p>}
                    </div>
                    <button onClick={() => copy(item.value, item.label)}
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0">
                      {copied === item.label
                        ? <><CheckCircle size={12} className="text-green-400" /><span className="text-green-400 text-xs font-bold">Copied</span></>
                        : <><Copy size={12} className="text-white/60" /><span className="text-white/60 text-xs">Copy</span></>
                      }
                    </button>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-2">Your M-Pesa Number</p>
                <input type="tel" value={mpesaPhone} onChange={e => { setMpesaPhone(e.target.value); setError(''); }}
                  placeholder="e.g. 0712 345 678" inputMode="tel"
                  className="w-full bg-white/[0.07] border border-white/15 rounded-xl px-4 py-3 text-white placeholder-[#6B7280] focus:outline-none focus:border-[#FF6B35]/60" />
                {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3D00)' }}>
                {submitting
                  ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                  : '✅ I have paid — Activate Boost'
                }
              </button>
            </>
          );
        })()}

        {/* STEP 3 — Done */}
        {step === 3 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-[#FF6B35]/20 flex items-center justify-center mx-auto mb-4">
              <Zap size={30} className="text-[#FF6B35]" />
            </div>
            <h3 className="text-white font-black text-xl mb-2">Boost Submitted! ⚡</h3>
            <p className="text-white/50 text-sm mb-1">Ref: <span className="text-white font-bold">{ref}</span></p>
            <p className="text-white/40 text-sm mb-5">Your post will start boosting after payment verification. Usually takes 5–30 minutes.</p>
            <button onClick={onClose}
              className="w-full py-4 rounded-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3D00)' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}