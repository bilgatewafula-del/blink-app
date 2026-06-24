import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatKES } from '../../utils/paymentUtils';
import { PLANS } from '../../utils/paymentUtils';
import {
  CheckCircle, XCircle, Clock, RefreshCw,
  DollarSign, Zap, Coins, Users, TrendingUp,
  AlertCircle, Search,
} from 'lucide-react';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';

/* ─── Stat card ─────────────────────────────── */
function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-white font-bold text-xl leading-none">{value}</p>
        <p className="text-[#6B7280] text-xs mt-0.5">{label}</p>
        {sub && <p className="text-white/40 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Payment row ───────────────────────────── */
function PaymentRow({ payment, onConfirm, onReject, loading }) {
  const typeIcon = payment.payment_type === 'subscription' ? '⭐' :
                   payment.payment_type === 'boost'        ? '⚡' :
                   payment.payment_type === 'coins'        ? '🪙' : '💳';

  const typeColor = payment.payment_type === 'subscription' ? '#1E6FFF' :
                    payment.payment_type === 'boost'        ? '#FF6B35' :
                    payment.payment_type === 'coins'        ? '#FFD700' : '#6B7280';

  return (
    <div className={`border rounded-2xl p-4 transition-all ${
      payment.status === 'pending'   ? 'border-yellow-500/25 bg-yellow-500/[0.04]' :
      payment.status === 'confirmed' ? 'border-green-500/20 bg-green-500/[0.03]'  :
      payment.status === 'failed'    ? 'border-red-500/20 bg-red-500/[0.03]'      :
      'border-white/[0.07] bg-white/[0.02]'
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-lg">{typeIcon}</span>
            <span className="text-white font-bold text-[14px] capitalize">
              {payment.payment_type === 'subscription'
                ? (PLANS[payment.plan]?.label || payment.plan) + ' Plan'
                : payment.payment_type === 'boost'
                  ? 'Post Boost'
                  : payment.payment_type === 'coins'
                    ? `${(payment.coins_amount || 0).toLocaleString()} Coins`
                    : payment.payment_type}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              payment.status === 'pending'   ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
              payment.status === 'confirmed' ? 'bg-green-500/20 text-green-400 border-green-500/30'   :
              payment.status === 'failed'    ? 'bg-red-500/20 text-red-400 border-red-500/30'         :
              'bg-[#6B7280]/20 text-[#6B7280] border-[#6B7280]/30'
            }`}>
              {payment.status === 'pending'   ? '⏳ Pending'    :
               payment.status === 'confirmed' ? '✓ Confirmed'  :
               payment.status === 'failed'    ? '✗ Rejected'   : payment.status}
            </span>
            {payment.service_granted && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E6FFF]/20 text-[#1E6FFF] border border-[#1E6FFF]/30">
                ✓ Service Active
              </span>
            )}
          </div>

          {/* User info */}
          {payment.user && (
            <p className="text-white/60 text-[12px]">
              <span className="font-semibold text-white/80">{payment.user.display_name}</span>
              {' · '}@{payment.user.username}
            </p>
          )}

          {/* Reference + phone */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[#6B7280] text-[11px] font-mono font-bold">{payment.reference_code}</span>
            {payment.mpesa_number && (
              <span className="text-[#6B7280] text-[11px]">📱 {payment.mpesa_number}</span>
            )}
            <span className="text-[#6B7280] text-[11px]">{formatTime(payment.created_at)}</span>
          </div>

          {payment.notes && (
            <p className="text-white/40 text-[11px] mt-1 italic">"{payment.notes}"</p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-white font-black text-[17px]">{formatKES(payment.amount)}</p>
        </div>
      </div>

      {/* Action buttons — only for pending */}
      {payment.status === 'pending' && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => onConfirm(payment)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #2ECC71, #16A34A)' }}
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><CheckCircle size={14} /> Confirm & Activate</>
            }
          </button>
          <button
            onClick={() => onReject(payment)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm text-white/70 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 active:scale-95 transition-all"
          >
            <XCircle size={14} className="text-red-400" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENTS ADMIN PANEL
   Only accessible by blink/admin role
═══════════════════════════════════════════════ */
export default function PaymentsAdminPanel() {
  const { user, profile } = useAuth();

  const [tab,       setTab]      = useState('pending'); // pending | all | revenue
  const [payments,  setPayments] = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [actionId,  setActionId] = useState(null);  // which payment is being processed
  const [stats,     setStats]    = useState({});
  const [search,    setSearch]   = useState('');
  const [feedback,  setFeedback] = useState('');

  const isAdmin = ['blink','admin'].includes(profile?.role);

  useEffect(() => {
    if (!isAdmin) return;
    fetchPayments();
    fetchStats();

    // Real-time: new payment submitted
    const ch = supabase.channel('payments:admin')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'payments' },
        () => { fetchPayments(); fetchStats(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tab]);

  const fetchPayments = async () => {
    setLoading(true);
    let q = supabase.from('payments')
      .select('*, user:user_id(id,username,display_name,avatar_url)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (tab === 'pending') q = q.eq('status', 'pending');
    else if (tab === 'confirmed') q = q.eq('status', 'confirmed');

    const { data } = await q;
    setPayments(data || []);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [pending, confirmed, totalRevenue, activeSubscriptions, activeBoosts] = await Promise.all([
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','pending'),
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','confirmed'),
      supabase.from('payments').select('amount').eq('status','confirmed'),
      supabase.from('users').select('id',{count:'exact',head:true}).neq('subscription_plan','free'),
      supabase.from('boosts').select('id',{count:'exact',head:true}).eq('status','active'),
    ]);

    const total = (totalRevenue.data || []).reduce((s, p) => s + (p.amount || 0), 0);

    setStats({
      pending:              pending.count             || 0,
      confirmed:            confirmed.count           || 0,
      totalRevenue:         total,
      activeSubscriptions:  activeSubscriptions.count || 0,
      activeBoosts:         activeBoosts.count        || 0,
    });
  };

  /* ── CONFIRM PAYMENT — grants the service ── */
  const handleConfirm = async (payment) => {
    setActionId(payment.id);
    setFeedback('');

    try {
      const now = new Date();

      // 1. Mark payment confirmed
      await supabase.from('payments').update({
        status:           'confirmed',
        service_granted:  true,
        admin_confirmed_by: user.id,
        confirmed_at:     now.toISOString(),
      }).eq('id', payment.id);

      // 2. Grant the service based on type
      if (payment.payment_type === 'subscription') {
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await supabase.from('users').update({
          subscription_plan:       payment.plan,
          subscription_expires_at: expiresAt.toISOString(),
          // Grant verified badge for creator/business
          is_verified: ['creator','business'].includes(payment.plan) ? true : undefined,
        }).eq('id', payment.user_id);

        // Notify user
        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `✅ Your ${PLANS[payment.plan]?.label} subscription is now active! Enjoy your new features. Expires ${expiresAt.toLocaleDateString('en-KE',{day:'numeric',month:'long'})}.`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'boost') {
        const expiresAt = new Date(now);
        // Find the boost record
        const { data: boost } = await supabase.from('boosts')
          .select('*').eq('payment_id', payment.id).maybeSingle();

        if (boost) {
          expiresAt.setDate(expiresAt.getDate() + boost.duration_days);
          await supabase.from('boosts').update({
            status:    'active',
            starts_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          }).eq('id', boost.id);

          // Mark post as boosted
          await supabase.from('posts').update({
            is_boosted:      true,
            boost_expires_at: expiresAt.toISOString(),
          }).eq('id', boost.post_id);
        }

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `⚡ Your post boost is now LIVE! Your post is being promoted across B-Link.`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'coins') {
        const coins = payment.coins_amount || 0;
        const { data: u } = await supabase.from('users').select('coins_balance').eq('id', payment.user_id).maybeSingle();
        const newBalance = (u?.coins_balance || 0) + coins;

        await supabase.from('users').update({ coins_balance: newBalance }).eq('id', payment.user_id);

        // Log coin transaction
        await supabase.from('coin_transactions').insert({
          user_id:          payment.user_id,
          amount:           coins,
          transaction_type: 'purchase',
          payment_id:       payment.id,
          description:      `Purchased ${coins.toLocaleString()} B-Link Coins`,
          balance_after:    newBalance,
        });

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `🪙 ${coins.toLocaleString()} coins have been added to your wallet! New balance: ${newBalance.toLocaleString()} coins.`,
          is_read:      false,
        });
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id:       user.id,
        target_user_id: payment.user_id,
        action:         'confirm_payment',
        details:        `${payment.payment_type} — ${payment.reference_code} — ${formatKES(payment.amount)}`,
      });

      setFeedback('✅ Payment confirmed and service activated!');
      fetchPayments();
      fetchStats();

    } catch (err) {
      console.error('confirm payment error:', err.message);
      setFeedback('❌ Error: ' + err.message);
    }

    setActionId(null);
  };

  /* ── REJECT PAYMENT ── */
  const handleReject = async (payment) => {
    const reason = window.prompt('Rejection reason (shown to user):');
    if (!reason) return;

    setActionId(payment.id);

    await supabase.from('payments').update({
      status:  'failed',
      notes:   (payment.notes || '') + ' | REJECTED: ' + reason,
      admin_confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    }).eq('id', payment.id);

    await supabase.from('notifications').insert({
      user_id:      payment.user_id,
      from_user_id: user.id,
      type:         'admin_action',
      message:      `❌ Your payment (${payment.reference_code}) was not confirmed: ${reason}. Please contact support if you believe this is an error.`,
      is_read:      false,
    });

    await supabase.from('admin_logs').insert({
      admin_id:       user.id,
      target_user_id: payment.user_id,
      action:         'reject_payment',
      details:        `${payment.reference_code} — ${reason}`,
    });

    setFeedback('Payment rejected and user notified.');
    setActionId(null);
    fetchPayments();
    fetchStats();
  };

  const filtered = payments.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.reference_code?.toLowerCase().includes(q) ||
      p.user?.username?.toLowerCase().includes(q) ||
      p.user?.display_name?.toLowerCase().includes(q) ||
      p.mpesa_number?.includes(q);
  });

  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <p className="text-[#6B7280]">Access denied.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
            <DollarSign size={18} className="text-green-400" />
          </div>
          <div>
            <p className="text-white font-bold text-[15px] leading-none">Payments Dashboard</p>
            <p className="text-[#6B7280] text-xs">Till: 4766037 · BILGATE WAFULA MUKHAYO</p>
          </div>
        </div>
        <button onClick={() => { fetchPayments(); fetchStats(); }} className="text-[#6B7280] hover:text-white p-1">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Clock}       label="Pending"       value={stats.pending || 0}             color="#FFD700" />
          <StatCard icon={CheckCircle} label="Confirmed"     value={stats.confirmed || 0}           color="#2ECC71" />
          <StatCard icon={DollarSign}  label="Total Revenue" value={formatKES(stats.totalRevenue||0)} color="#1E6FFF"
            sub="All time" />
          <StatCard icon={Users}       label="Subscribers"   value={stats.activeSubscriptions || 0} color="#7B2FFF" />
          <StatCard icon={Zap}         label="Active Boosts" value={stats.activeBoosts || 0}        color="#FF6B35" />
          <StatCard icon={TrendingUp}  label="This month"    value={formatKES(stats.totalRevenue||0)} color="#2ECC71"
            sub="Revenue" />
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
            feedback.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' :
            feedback.startsWith('❌') ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
            'bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 text-[#1E6FFF]'
          }`}>
            {feedback}
            <button onClick={() => setFeedback('')} className="ml-auto opacity-60 hover:opacity-100"><XCircle size={14} /></button>
          </div>
        )}

        {/* Pending alert */}
        {stats.pending > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-yellow-400 font-bold text-sm">{stats.pending} payment{stats.pending > 1 ? 's' : ''} waiting for confirmation</p>
              <p className="text-yellow-400/60 text-xs">Verify on M-Pesa then confirm below</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-white/[0.05] rounded-2xl p-1 gap-1">
          {[
            { key:'pending',   label:`Pending (${stats.pending||0})` },
            { key:'confirmed', label:'Confirmed' },
            { key:'all',       label:'All' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ' +
                (tab === t.key ? 'bg-[#1E6FFF] text-white shadow-lg shadow-[#1E6FFF]/30' : 'text-[#6B7280] hover:text-white')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3">
          <Search size={15} className="text-[#6B7280] flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by ref, username, phone..."
            className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="text-[#6B7280] hover:text-white"><XCircle size={15} /></button>}
        </div>

        {/* Payment list */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">{tab === 'pending' ? '✅' : '💳'}</p>
            <p className="text-white font-bold">
              {tab === 'pending' ? 'No pending payments' : 'No payments found'}
            </p>
            <p className="text-[#6B7280] text-sm mt-1">
              {tab === 'pending' ? 'You\'re all caught up!' : 'Try a different search'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filtered.map(pay => (
              <PaymentRow
                key={pay.id}
                payment={pay}
                onConfirm={handleConfirm}
                onReject={handleReject}
                loading={actionId === pay.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}