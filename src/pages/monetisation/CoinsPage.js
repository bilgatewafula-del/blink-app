import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { MPESA, COIN_PACKAGES, formatKES, generateReference } from '../../utils/paymentUtils';
import { ArrowLeft, Coins, Copy, CheckCircle, AlertCircle, X } from 'lucide-react';

function BuyCoinsModal({ pkg, onClose, onSubmitted }) {
  const { user } = useAuth();
  const [ref]        = useState(generateReference);
  const [phone,      setPhone]      = useState('');
  const [copied,     setCopied]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState('');

  const totalCoins = pkg.coins + (pkg.bonus
    ? parseInt(pkg.bonus.replace(/\D/g,'')) : 0);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleSubmit = async () => {
    if (!phone.trim()) { setError('Enter your M-Pesa number.'); return; }
    const p = phone.replace(/\s/g,'');
    if (!/^(07|01|\+254|254)\d{8,9}$/.test(p)) { setError('Enter a valid M-Pesa number.'); return; }
    setSubmitting(true); setError('');

    const { error: dbErr } = await supabase.from('payments').insert({
      user_id:        user.id,
      payment_type:   'coins',
      amount:         pkg.price,
      coins_amount:   totalCoins,
      reference_code: ref,
      mpesa_number:   p,
      status:         'pending',
      service_granted:false,
      notes:          `Purchase ${totalCoins} B-Link Coins`,
    });

    if (dbErr) { setError('Failed. Try again.'); setSubmitting(false); return; }

    // Notify admins
    const { data: admins } = await supabase.from('users').select('id').in('role',['blink','admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id: a.id, from_user_id: user.id,
          type: 'admin_action',
          message: `🪙 Coins payment pending: ${ref} — ${totalCoins} coins (${formatKES(pkg.price)})`,
          is_read: false,
        }))
      );
    }

    setSubmitting(false);
    setDone(true);
    onSubmitted?.();
  };

  if (done) return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#0d1f3c] rounded-t-3xl p-6 pb-10 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🪙</span>
        </div>
        <h3 className="text-white font-black text-xl mb-2">Payment Submitted!</h3>
        <p className="text-white/50 text-sm mb-1">Ref: <span className="text-white font-bold">{ref}</span></p>
        <p className="text-white/40 text-sm mb-5">Your <strong className="text-yellow-400">{totalCoins} coins</strong> will be credited after verification (5–30 mins).</p>
        <button onClick={onClose}
          className="w-full py-4 rounded-2xl font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #FFD700, #FF6B35)' }}>
          Got it!
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-black text-lg">Buy {pkg.label}</h3>
            <p className="text-white/50 text-sm">{formatKES(pkg.price)} · {pkg.bonus ? <span className="text-yellow-400">{pkg.bonus}</span> : 'No bonus'}</p>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
        </div>

        {/* Coin summary */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 mb-4 text-center">
          <p className="text-yellow-400 font-black text-3xl mb-1">🪙 {totalCoins.toLocaleString()}</p>
          <p className="text-yellow-400/70 text-sm">coins will be added to your wallet</p>
        </div>

        {/* Payment details */}
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
          <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setError(''); }}
            placeholder="0712 345 678" inputMode="tel"
            className="w-full bg-white/[0.07] border border-white/15 rounded-xl px-4 py-3 text-white placeholder-[#6B7280] focus:outline-none focus:border-yellow-500/60" />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4 flex gap-2">
          <AlertCircle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-400/80 text-[11px]">Only submit after paying. Coins cannot be transferred or withdrawn.</p>
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #FFD700, #FF6B35)' }}>
          {submitting
            ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
            : '✅ I have paid — Get My Coins'
          }
        </button>
      </div>
    </div>
  );
}

export default function CoinsPage() {
  const navigate        = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [selectedPkg,   setSelectedPkg]   = useState(null);
  const [transactions,  setTransactions]  = useState([]);
  const [tab,           setTab]           = useState('buy'); // buy | history

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(() => { refreshProfile(); fetchTransactions(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTransactions = async () => {
    const { data } = await supabase.from('coin_transactions')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(30);
    setTransactions(data || []);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Coins</h1>
          <p className="text-[#6B7280] text-xs mt-0.5">In-app currency</p>
        </div>
        {/* Balance */}
        <div className="bg-yellow-500/15 border border-yellow-500/25 rounded-2xl px-4 py-2 flex items-center gap-2">
          <span className="text-lg">🪙</span>
          <span className="text-yellow-400 font-black text-[16px]">{(profile?.coins_balance || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-5 bg-white/[0.05] rounded-2xl p-1">
        {[['buy','Buy Coins'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (tab === k ? 'text-white shadow-lg' : 'text-white/50')}
            style={tab === k ? { background:'linear-gradient(135deg,#FFD700,#FF6B35)', boxShadow:'0 4px 16px rgba(255,215,0,0.3)' } : {}}>
            {l}
          </button>
        ))}
      </div>

      {/* BUY */}
      {tab === 'buy' && (
        <div className="px-4">
          {/* What are coins */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 mb-4">
            <p className="text-white font-bold mb-2">🪙 What are B-Link Coins?</p>
            <div className="space-y-1.5 text-white/60 text-sm">
              {['Send reactions on posts','Give digital gifts to creators','Instant 1-hour post boost','Highlight your comment'].map((item,i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-3">Coins have no cash value and cannot be withdrawn.</p>
          </div>

          {/* Packages */}
          <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider mb-3">Choose a Package</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {COIN_PACKAGES.map(pkg => (
              <button
                key={pkg.coins}
                onClick={() => setSelectedPkg(pkg)}
                className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-left active:scale-95 transition-all hover:border-yellow-500/30"
              >
                <p className="text-3xl mb-2">🪙</p>
                <p className="text-white font-black text-lg leading-none">{pkg.coins.toLocaleString()}</p>
                {pkg.bonus && <p className="text-yellow-400 text-[11px] font-bold mt-0.5">{pkg.bonus}</p>}
                <p className="text-white/50 text-xs mt-2">{formatKES(pkg.price)}</p>
              </button>
            ))}
          </div>

          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
            <p className="text-white/50 text-xs leading-relaxed">
              💡 Pay via M-Pesa to Till <strong className="text-white">4766037</strong>. Coins are credited to your wallet within 5–30 minutes of payment verification.
            </p>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <div className="px-4 space-y-2">
          {transactions.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🪙</p>
              <p className="text-white font-bold">No transactions yet</p>
              <p className="text-[#6B7280] text-sm mt-1">Buy coins to get started</p>
            </div>
          ) : transactions.map(tx => (
            <div key={tx.id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${tx.amount > 0 ? 'bg-yellow-500/20' : 'bg-red-500/10'}`}>
                {tx.amount > 0 ? '🪙' : '💸'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-[13px]">{tx.description || tx.transaction_type}</p>
                <p className="text-[#6B7280] text-[11px]">{new Date(tx.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-black text-[15px] ${tx.amount > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </p>
                <p className="text-[#6B7280] text-[11px]">bal: {tx.balance_after?.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buy modal */}
      {selectedPkg && (
        <BuyCoinsModal
          pkg={selectedPkg}
          onClose={() => setSelectedPkg(null)}
          onSubmitted={fetchTransactions}
        />
      )}
    </div>
  );
}