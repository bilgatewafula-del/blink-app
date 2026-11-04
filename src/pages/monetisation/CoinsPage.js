import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { COIN_PACKAGES, formatKES, formatNumber } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { ArrowLeft, Clock } from 'lucide-react';

export default function CoinsPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();

  const [selectedPkg,  setSelectedPkg]  = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [tab,          setTab]          = useState('buy');

  useEffect(() => {
    fetchTransactions();
    fetchPayments();
    const t = setInterval(() => { refreshProfile(); fetchTransactions(); fetchPayments(); }, 20000);
    return () => clearInterval(t);
  }, []);

  const fetchTransactions = async () => {
    const { data } = await supabase.from('coin_transactions')
      .select('*').eq('user_id', profile?.id || '')
      .order('created_at', { ascending: false }).limit(30);
    setTransactions(data || []);
  };

  const fetchPayments = async () => {
    const { data } = await supabase.from('payments')
      .select('*').eq('payment_type', 'coins')
      .order('created_at', { ascending: false }).limit(20);
    setPayments(data || []);
  };

  const hasPending = payments.some(p => p.status === 'pending');
  const balance    = profile?.coins_balance || 0;

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Coins</h1>
          <p className="text-[#8E8C88] text-xs mt-0.5">In-app currency — not withdrawable</p>
        </div>
        {/* Balance chip */}
        <div className="bg-yellow-500/15 border border-yellow-500/25 rounded-2xl px-4 py-2 flex items-center gap-2">
          <span className="text-xl">🪙</span>
          <span className="text-yellow-400 font-black text-[17px]">{formatNumber(balance)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-5 bg-white/[0.05] rounded-2xl p-1">
        {[['buy','Buy Coins'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (tab === k ? 'text-white shadow-lg' : 'text-white/50')}
            style={tab === k ? { background:'linear-gradient(135deg,#FFD700,#FF6B35)', boxShadow:'0 4px 16px rgba(255,215,0,0.25)' } : {}}>
            {l}
          </button>
        ))}
      </div>

      {/* BUY TAB */}
      {tab === 'buy' && (
        <div className="px-4 space-y-4">

          {/* Pending notice */}
          {hasPending && (
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-4 flex items-start gap-3">
              <Clock size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-bold text-sm">Coins pending verification</p>
                <p className="text-yellow-400/60 text-xs mt-0.5">Your coins will be credited once admin verifies your M-Pesa payment.</p>
              </div>
            </div>
          )}

          {/* What are coins */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
            <p className="text-white font-bold text-sm mb-3">🪙 What are B-Link Coins?</p>
            <div className="space-y-2">
              {[
                { icon:'❤️', text:'React to posts with premium reactions' },
                { icon:'🎁', text:'Send digital gifts to creators' },
                { icon:'⚡', text:'Instant 1-hour post boost' },
                { icon:'✨', text:'Highlight your comments' },
              ].map((item,i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <span className="text-white/60 text-sm">{item.text}</span>
                </div>
              ))}
            </div>
            <p className="text-white/25 text-[11px] mt-3 pt-3 border-t border-white/[0.06]">
              Coins are B-Link's internal currency. They have no cash value and cannot be withdrawn or transferred.
            </p>
          </div>

          {/* Packages */}
          <p className="text-white/50 text-[11px] font-bold uppercase tracking-wider">Select Package</p>
          <div className="grid grid-cols-2 gap-3">
            {COIN_PACKAGES.map(pkg => {
              const total = pkg.coins + pkg.bonus;
              return (
                <button
                  key={pkg.coins}
                  onClick={() => setSelectedPkg(pkg)}
                  className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-left active:scale-95 transition-all hover:border-yellow-500/30 hover:bg-white/[0.07]"
                >
                  <span className="text-3xl block mb-2">🪙</span>
                  <p className="text-white font-black text-lg leading-none">{formatNumber(pkg.coins)}</p>
                  {pkg.bonus > 0 && (
                    <p className="text-yellow-400 text-[11px] font-bold mt-0.5">+{pkg.bonus} bonus!</p>
                  )}
                  <p className="text-white/40 text-xs mt-2 border-t border-white/[0.06] pt-2">
                    {formatKES(pkg.price)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-white/40 text-[11px] text-center leading-relaxed">
              Pay via M-Pesa Till <strong className="text-white/70">4766037</strong>. Coins are credited after admin verification (5–60 min).
            </p>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div className="px-4 space-y-2">
          {/* Pending payments */}
          {payments.filter(p => p.status === 'pending').map(pay => (
            <div key={pay.id} className="bg-yellow-500/[0.05] border border-yellow-500/20 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">⏳</span>
              <div className="flex-1 min-w-0">
                <p className="text-yellow-400 font-bold text-[13px]">{formatNumber(pay.coins_amount||0)} coins — pending verification</p>
                <p className="text-yellow-400/50 text-[11px] font-mono mt-0.5">Ref: {pay.reference_code}</p>
                <p className="text-yellow-400/40 text-[11px]">Paid: {formatKES(pay.amount_kes)} · {pay.mpesa_phone}</p>
              </div>
            </div>
          ))}

          {/* Confirmed coin transactions */}
          {transactions.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-4xl mb-3">🪙</p>
              <p className="text-white font-bold">No transactions yet</p>
              <p className="text-[#8E8C88] text-sm mt-1">Buy coins to get started</p>
            </div>
          ) : transactions.map(tx => (
            <div key={tx.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${tx.amount > 0 ? 'bg-yellow-500/15' : 'bg-red-500/10'}`}>
                {tx.amount > 0 ? '🪙' : '💸'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13px] font-semibold truncate">{tx.description || tx.transaction_type}</p>
                <p className="text-[#8E8C88] text-[11px]">
                  {new Date(tx.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-black text-[15px] ${tx.amount > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {tx.amount > 0 ? '+' : ''}{formatNumber(tx.amount)}
                </p>
                <p className="text-[#8E8C88] text-[10px]">bal: {formatNumber(tx.balance_after)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment modal */}
      {selectedPkg && (
        <PaymentModal
          title={`Buy ${formatNumber(selectedPkg.coins + selectedPkg.bonus)} Coins`}
          amount={selectedPkg.price}
          paymentType="coins"
          paymentMeta={{ coins_amount: selectedPkg.coins + selectedPkg.bonus }}
          description={`${formatNumber(selectedPkg.coins)} coins${selectedPkg.bonus > 0 ? ' + ' + selectedPkg.bonus + ' bonus' : ''}`}
          onClose={() => setSelectedPkg(null)}
          onSuccess={() => { fetchPayments(); setSelectedPkg(null); }}
        />
      )}
    </div>
  );
}