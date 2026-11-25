import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { COIN_PACKAGES, formatKES, formatNumber } from '../../utils/paymentUtils';
import PaymentModal from '../../components/PaymentModal';
import { ArrowLeft, Clock, Coins, Heart, Gift, Zap, Sparkles, ArrowUpRight } from 'lucide-react';
import { goBack } from '../../lib/nav';

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
    <div className="min-h-screen bg-[#E6E9F6] pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white"><ArrowLeft size={22} /></button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-[15px] leading-none">B-Link Coins</h1>
          <p className="text-[#CBD5E1] text-xs mt-0.5">In-app currency — not withdrawable</p>
        </div>
        {/* Balance chip */}
        <div className="bg-yellow-500/15 border border-yellow-500/25 rounded-2xl px-4 py-2 flex items-center gap-2">
          <Coins size={22} className="text-yellow-700" />
          <span className="text-yellow-700 font-black text-[17px]">{formatNumber(balance)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-5 bg-[#F8FAFC] rounded-2xl p-1">
        {[['buy','Buy Coins'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ' +
              (tab === k ? 'text-[#111827] shadow-lg' : 'text-[#64748B]')}
            style={tab === k ? { background:'linear-gradient(135deg,#FBBF24,#D97706)', boxShadow:'0 4px 16px rgba(255,215,0,0.25)' } : {}}>
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
              <Clock size={16} className="text-yellow-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-700 font-bold text-sm">Coins pending verification</p>
                <p className="text-yellow-700/60 text-xs mt-0.5">Your coins will be credited once admin verifies your M-Pesa payment.</p>
              </div>
            </div>
          )}

          {/* What are coins */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
            <p className="text-[#111827] font-bold text-sm mb-3 flex items-center gap-2"><Coins size={16} className="text-yellow-700" /> What are B-Link Coins?</p>
            <div className="space-y-2">
              {[
                { Icon:Heart, text:'React to posts with premium reactions' },
                { Icon:Gift, text:'Send digital gifts to creators' },
                { Icon:Zap, text:'Instant 1-hour post boost' },
                { Icon:Sparkles, text:'Highlight your comments' },
              ].map((item,i) => (
                <div key={i} className="flex items-center gap-3">
                  <item.Icon size={18} className="text-[#6D28D9] flex-shrink-0" />
                  <span className="text-[#64748B] text-sm">{item.text}</span>
                </div>
              ))}
            </div>
            <p className="text-[#94A3B8] text-[11px] mt-3 pt-3 border-t border-[#E2E8F0]">
              Coins are B-Link's internal currency. They have no cash value and cannot be withdrawn or transferred.
            </p>
          </div>

          {/* Packages */}
          <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider">Select Package</p>
          <div className="grid grid-cols-2 gap-3">
            {COIN_PACKAGES.map(pkg => {
              const total = pkg.coins + pkg.bonus;
              return (
                <button
                  key={pkg.coins}
                  onClick={() => setSelectedPkg(pkg)}
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 text-left active:scale-95 transition-all hover:border-yellow-500/30 hover:bg-[#F1F5F9]"
                >
                  <Coins size={30} className="text-yellow-700 mb-2" />
                  <p className="text-[#111827] font-black text-lg leading-none">{formatNumber(pkg.coins)}</p>
                  {pkg.bonus > 0 && (
                    <p className="text-yellow-700 text-[11px] font-bold mt-0.5">+{pkg.bonus} bonus!</p>
                  )}
                  <p className="text-[#94A3B8] text-xs mt-2 border-t border-[#E2E8F0] pt-2">
                    {formatKES(pkg.price)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
            <p className="text-[#94A3B8] text-[11px] text-center leading-relaxed">
              Pay via M-Pesa Till <strong className="text-[#64748B]">4766037</strong>. Coins are credited after admin verification (5–60 min).
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
                <p className="text-yellow-700 font-bold text-[13px]">{formatNumber(pay.coins_amount||0)} coins — pending verification</p>
                <p className="text-yellow-700/50 text-[11px] font-mono mt-0.5">Ref: {pay.reference_code}</p>
                <p className="text-yellow-700/40 text-[11px]">Paid: {formatKES(pay.amount_kes)} · {pay.mpesa_phone}</p>
              </div>
            </div>
          ))}

          {/* Confirmed coin transactions */}
          {transactions.length === 0 ? (
            <div className="text-center py-14">
              <Coins size={38} className="text-yellow-700 mx-auto mb-3" />
              <p className="text-[#111827] font-bold">No transactions yet</p>
              <p className="text-[#64748B] text-sm mt-1">Buy coins to get started</p>
            </div>
          ) : transactions.map(tx => (
            <div key={tx.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${tx.amount > 0 ? 'bg-yellow-500/15' : 'bg-red-500/10'}`}>
                {tx.amount > 0 ? <Coins size={18} className="text-yellow-700" /> : <ArrowUpRight size={18} className="text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#111827] text-[13px] font-semibold truncate">{tx.description || tx.transaction_type}</p>
                <p className="text-[#64748B] text-[11px]">
                  {new Date(tx.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-black text-[15px] ${tx.amount > 0 ? 'text-yellow-700' : 'text-red-600'}`}>
                  {tx.amount > 0 ? '+' : ''}{formatNumber(tx.amount)}
                </p>
                <p className="text-[#64748B] text-[10px]">bal: {formatNumber(tx.balance_after)}</p>
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