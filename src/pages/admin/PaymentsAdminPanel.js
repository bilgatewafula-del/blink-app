// src/pages/admin/PaymentsAdminPanel.js
// Real payment verification dashboard
// Admin verifies on M-Pesa FIRST, then clicks confirm here
// Confirmation triggers actual service activation in DB

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatKES, PLANS, COIN_PACKAGES } from '../../utils/paymentUtils';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, RefreshCw, CheckCircle, XCircle,
  Search, DollarSign, Clock, TrendingUp,
  Users, Zap, AlertTriangle, Eye,
} from 'lucide-react';
import { goBack } from '../../lib/nav';

/* ── Small stat card ── */
function Stat({ label, value, color, sub }) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
      <p className="text-[#111827] font-black text-xl leading-none">{value}</p>
      <p className="text-[#64748B] text-xs mt-1">{label}</p>
      {sub && <p className="text-[#94A3B8] text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Payment detail modal — shows full info before admin confirms ── */
function PaymentDetailModal({ payment, onClose, onConfirm, onReject, busy }) {
  const typeLabel =
    payment.payment_type === 'subscription'   ? `${PLANS[payment.plan]?.label || payment.plan} Subscription` :
    payment.payment_type === 'boost'          ? `Post Boost (${payment.boost_days} days)` :
    payment.payment_type === 'coins'          ? `${formatNumber(payment.coins_amount || 0)} B-Link Coins` :
    payment.payment_type === 'verification'   ? 'Verified Badge' :
    payment.payment_type === 'business_page'  ? 'Business Page' :
    payment.payment_type;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#111827] font-black text-base">Verify Payment</h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#111827]"><XCircle size={20} /></button>
        </div>

        {/* Admin instruction */}
        <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-2xl p-4 mb-4">
          <p className="text-[#6D28D9] font-bold text-sm mb-1">📱 Before confirming</p>
          <p className="text-[#64748B] text-xs leading-relaxed">
            Open M-Pesa on your phone → Go to <strong className="text-[#111827]">My Account → Statement</strong> or <strong className="text-[#111827]">Transaction History</strong> → Search for reference <strong className="text-yellow-700 font-mono">{payment.reference_code}</strong> and verify the amount is <strong className="text-[#111827]">{formatKES(payment.amount_kes)}</strong> from <strong className="text-[#111827]">{payment.mpesa_phone}</strong>.
          </p>
        </div>

        {/* Payment info */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 mb-4 space-y-3">
          {[
            { label: 'Service',         value: typeLabel },
            { label: 'Amount',          value: formatKES(payment.amount_kes), highlight: true },
            { label: 'Reference Code',  value: payment.reference_code, mono: true, highlight: true },
            { label: 'M-Pesa Phone',    value: payment.mpesa_phone },
            { label: 'M-Pesa Name',     value: payment.mpesa_name || '—' },
            { label: 'User',            value: `${payment.user?.display_name} (@${payment.user?.username})` },
            { label: 'Submitted at',    value: new Date(payment.created_at).toLocaleString('en-KE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <p className="text-[#64748B] text-[12px] flex-shrink-0">{row.label}</p>
              <p className={`text-right text-[13px] font-bold truncate max-w-[200px] ${
                row.highlight ? 'text-yellow-700' : 'text-[#111827]'
              } ${row.mono ? 'font-mono' : ''}`}>
                {row.value}
              </p>
            </div>
          ))}
        </div>

        {/* Confirm / Reject buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => onReject(payment)}
            disabled={busy}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-[#64748B] border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 active:scale-95 transition-all"
          >
            ✗ Reject Payment
          </button>
          <button
            onClick={() => onConfirm(payment)}
            disabled={busy}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-[#111827] disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, #10B981, #16A34A)', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}
          >
            {busy
              ? <div className="w-4 h-4 border-2 border-[#E2E8F0] border-t-white rounded-full animate-spin" />
              : <><CheckCircle size={14} /> Confirm & Activate</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAYMENTS ADMIN PANEL
═══════════════════════════════════════════════ */
export default function PaymentsAdminPanel() {
  const navigate          = useNavigate();
  const { user, profile } = useAuth();

  const [tab,         setTab]         = useState('pending');
  const [payments,    setPayments]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [busy,        setBusy]        = useState(false);
  const [stats,       setStats]       = useState({});
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState(null);
  const [feedback,    setFeedback]    = useState(null); // { type, msg }

  const isAdmin = ['blink','admin'].includes(profile?.role);

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return; }
    fetchPayments();
    fetchStats();

    const ch = supabase.channel('payments:rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' },
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

    if (tab === 'pending')   q = q.eq('status', 'pending');
    if (tab === 'confirmed') q = q.eq('status', 'confirmed');
    if (tab === 'rejected')  q = q.in('status', ['rejected','failed']);

    const { data, error } = await q;
    if (error) console.error('fetchPayments:', error.message);
    setPayments(data || []);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [pending, confirmed, rejected, revenue, subscribers, boosts] = await Promise.all([
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','pending'),
      supabase.from('payments').select('id',{count:'exact',head:true}).eq('status','confirmed'),
      supabase.from('payments').select('id',{count:'exact',head:true}).in('status',['rejected','failed']),
      supabase.from('payments').select('amount_kes').eq('status','confirmed'),
      supabase.from('users').select('id',{count:'exact',head:true}).neq('subscription_plan','free'),
      supabase.from('boosts').select('id',{count:'exact',head:true}).eq('status','active'),
    ]);

    const totalRevenue = (revenue.data || []).reduce((s, p) => s + (p.amount_kes || 0), 0);
    setStats({
      pending:     pending.count     || 0,
      confirmed:   confirmed.count   || 0,
      rejected:    rejected.count    || 0,
      revenue:     totalRevenue,
      subscribers: subscribers.count || 0,
      boosts:      boosts.count      || 0,
    });
  };

  /* ── CONFIRM PAYMENT ──────────────────────────
     This is the ONLY place services are activated.
     Admin must have verified on M-Pesa first.
  ─────────────────────────────────────────────── */
  const handleConfirm = async (payment) => {
    setBusy(true);
    setSelected(null);
    setFeedback(null);

    try {
      const now = new Date();

      // Preferred path: one atomic server function (cannot double-credit, checks the price list).
      const viaServer = await supabase.rpc('admin_confirm_payment', { p_payment_id: payment.id });
      if (!viaServer.error) {
        setFeedback({ type: 'success', msg: `Payment confirmed and service activated for ${payment.user?.display_name}` });
        fetchPayments(); fetchStats(); setBusy(false);
        return;
      }
      if (!/does not exist|could not find|schema cache/i.test(viaServer.error.message || '')) throw new Error(viaServer.error.message);
      // older database without the function: continue with the previous step-by-step method

      // 1. Update payment status to confirmed
      const { error: payErr } = await supabase.from('payments').update({
        status:             'confirmed',
        service_active:     true,
        service_activated_at: now.toISOString(),
        verified_by:        user.id,
        verified_at:        now.toISOString(),
      }).eq('id', payment.id);

      if (payErr) throw new Error('Payment update failed: ' + payErr.message);

      // 2. Grant the actual service based on type
      if (payment.payment_type === 'subscription') {
        // Subscription: 1 month from now
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const updateData = {
          subscription_plan:       payment.plan,
          subscription_expires_at: expiresAt.toISOString(),
        };

        // Grant verified badge for creator/business
        if (['creator', 'business'].includes(payment.plan)) {
          updateData.is_verified = true;
          updateData.verified_at = now.toISOString();
        }
        if (payment.plan === 'business') {
          updateData.is_business = true;
        }

        const { error: subErr } = await supabase.from('users')
          .update(updateData).eq('id', payment.user_id);
        if (subErr) throw new Error('Subscription activation failed: ' + subErr.message);

        // Update service_expires_at on payment
        await supabase.from('payments').update({
          service_expires_at: expiresAt.toISOString(),
        }).eq('id', payment.id);

        // Notify user
        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `✅ Your ${PLANS[payment.plan]?.label} subscription is now ACTIVE! Expires ${expiresAt.toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' })}. Enjoy your premium features!`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'boost') {
        // Boost: activate the pending boost record
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + (payment.boost_days || 1));

        const { data: boost, error: bFetchErr } = await supabase
          .from('boosts').select('*')
          .eq('payment_id', payment.id).maybeSingle();

        if (boost) {
          const { error: boostErr } = await supabase.from('boosts').update({
            status:    'active',
            starts_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          }).eq('id', boost.id);
          if (boostErr) throw new Error('Boost activation failed: ' + boostErr.message);

          // Mark the post as boosted
          const { error: postErr } = await supabase.from('posts').update({
            is_boosted:       true,
            boost_expires_at: expiresAt.toISOString(),
          }).eq('id', boost.post_id);
          if (postErr) throw new Error('Post boost update failed: ' + postErr.message);
        }

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `⚡ Your post boost is now LIVE for ${payment.boost_days} day(s)! Your post is being promoted across B-Link feeds.`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'coins') {
        // Coins: credit user wallet
        const coins = payment.coins_amount || 0;
        const { data: u, error: uFetchErr } = await supabase
          .from('users').select('coins_balance').eq('id', payment.user_id).maybeSingle();
        if (uFetchErr) throw new Error('User fetch failed: ' + uFetchErr.message);

        const balanceBefore = u?.coins_balance || 0;
        const balanceAfter  = balanceBefore + coins;

        const { error: coinsErr } = await supabase.from('users')
          .update({ coins_balance: balanceAfter }).eq('id', payment.user_id);
        if (coinsErr) throw new Error('Coins credit failed: ' + coinsErr.message);

        // Log the transaction
        await supabase.from('coin_transactions').insert({
          user_id:          payment.user_id,
          amount:           coins,
          transaction_type: 'purchase',
          payment_id:       payment.id,
          description:      `Purchased ${formatNumber(coins)} B-Link Coins`,
          balance_before:   balanceBefore,
          balance_after:    balanceAfter,
        });

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `🪙 ${formatNumber(coins)} coins have been credited to your wallet! New balance: ${formatNumber(balanceAfter)} coins.`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'verification') {
        // Per spec: ONLY admin confirmation sets is_verified + verified_at
        const { error: vErr } = await supabase.from('users').update({
          is_verified: true,
          verified_at: now.toISOString(),
        }).eq('id', payment.user_id);
        if (vErr) throw new Error('Verification activation failed: ' + vErr.message);

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `✅ Congratulations! Your account has been verified. Your B-Link verified badge is now live on your profile.`,
          is_read:      false,
        });

      } else if (payment.payment_type === 'business_page') {
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        await supabase.from('users').update({
          is_business:             true,
          is_verified:             true,
          verified_at:             now.toISOString(),
          subscription_plan:       'business',
          subscription_expires_at: expiresAt.toISOString(),
        }).eq('id', payment.user_id);

        await supabase.from('notifications').insert({
          user_id:      payment.user_id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `✅ Your Business Page is now active! Add your contact details in your profile settings.`,
          is_read:      false,
        });
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id:       user.id,
        target_user_id: payment.user_id,
        action:         'confirm_payment',
        details:        `Confirmed ${payment.payment_type} · Ref ${payment.reference_code} · ${formatKES(payment.amount_kes)}`,
      });

      setFeedback({ type: 'success', msg: `✅ Payment confirmed and service activated for ${payment.user?.display_name}` });
      fetchPayments();
      fetchStats();

    } catch (err) {
      console.error('Confirm payment error:', err.message);
      setFeedback({ type: 'error', msg: '❌ Error: ' + err.message });
    }

    setBusy(false);
  };

  /* ── REJECT PAYMENT ── */
  const handleReject = async (payment) => {
    const reason = window.prompt(
      `Reject payment from ${payment.user?.display_name}?\n\nEnter rejection reason (shown to user):`
    );
    if (reason === null) return; // cancelled
    if (!reason.trim()) { alert('Rejection reason is required.'); return; }

    setBusy(true);
    setSelected(null);

    const viaServer = await supabase.rpc('admin_reject_payment', { p_payment_id: payment.id, p_reason: reason.trim() });
    if (!viaServer.error) {
      setFeedback({ type: 'info', msg: 'Payment rejected and user notified.' });
      setBusy(false); fetchPayments(); fetchStats();
      return;
    }
    if (!/does not exist|could not find|schema cache/i.test(viaServer.error.message || '')) {
      setFeedback({ type: 'error', msg: 'Rejection failed: ' + viaServer.error.message });
      setBusy(false);
      return;
    }

    const { error } = await supabase.from('payments').update({
      status:           'rejected',
      rejection_reason: reason.trim(),
      verified_by:      user.id,
      verified_at:      new Date().toISOString(),
    }).eq('id', payment.id);

    if (error) { setFeedback({ type:'error', msg:'Rejection failed: ' + error.message }); setBusy(false); return; }

    await supabase.from('notifications').insert({
      user_id:      payment.user_id,
      from_user_id: user.id,
      type:         'admin_action',
      message:      `❌ Your payment (Ref: ${payment.reference_code}) was not verified: ${reason.trim()}. Contact support if you believe this is an error.`,
      is_read:      false,
    });

    await supabase.from('admin_logs').insert({
      admin_id:       user.id,
      target_user_id: payment.user_id,
      action:         'reject_payment',
      details:        `Rejected ${payment.reference_code} — ${reason.trim()}`,
    });

    setFeedback({ type:'info', msg:`Payment rejected and user notified.` });
    setBusy(false);
    fetchPayments();
    fetchStats();
  };

  const filtered = payments.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.reference_code?.toLowerCase().includes(q) ||
      p.user?.username?.toLowerCase().includes(q)  ||
      p.user?.display_name?.toLowerCase().includes(q) ||
      p.mpesa_phone?.includes(q) ||
      p.mpesa_name?.toLowerCase().includes(q)
    );
  });

  if (!isAdmin) return null;

  const typeIcon = t =>
    t === 'subscription' ? '⭐' : t === 'boost' ? '⚡' :
    t === 'coins' ? '🪙' : t === 'verification' ? '✓' :
    t === 'business_page' ? '💼' : '💳';

  return (
    <div className="min-h-screen bg-[#E6E9F6] pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <div>
            <p className="text-white font-bold text-[15px] leading-none">Payments Dashboard</p>
            <p className="text-[#CBD5E1] text-[11px] mt-0.5">Till: 4766037 · BILGATE WAFULA MUKHAYO</p>
          </div>
        </div>
        <button onClick={() => { fetchPayments(); fetchStats(); }} className="text-[#CBD5E1] hover:text-white p-1">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pending"     value={stats.pending     || 0} color="#FFD700" />
          <Stat label="Confirmed"   value={stats.confirmed   || 0} color="#10B981" />
          <Stat label="Rejected"    value={stats.rejected    || 0} color="#EF4444" />
          <Stat label="Revenue (KES)" value={formatKES(stats.revenue||0).replace('KES ','')} sub="Confirmed only" />
          <Stat label="Subscribers" value={stats.subscribers || 0} />
          <Stat label="Live Boosts" value={stats.boosts      || 0} />
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-700' :
            feedback.type === 'error'   ? 'bg-red-500/10 border border-red-500/20 text-red-600' :
            'bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-[#7C3AED]'
          }`}>
            <span>{feedback.msg}</span>
            <button onClick={() => setFeedback(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
              <XCircle size={16} />
            </button>
          </div>
        )}

        {/* Pending alert */}
        {stats.pending > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-yellow-700 flex-shrink-0" />
            <p className="text-yellow-700 text-sm">
              <strong>{stats.pending}</strong> payment{stats.pending !== 1 ? 's' : ''} waiting. Verify on M-Pesa before confirming.
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex bg-[#F8FAFC] rounded-2xl p-1 gap-1">
          {[
            { key:'pending',   label:`Pending (${stats.pending||0})` },
            { key:'confirmed', label:'Confirmed' },
            { key:'rejected',  label:'Rejected' },
            { key:'all',       label:'All' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={'flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ' +
                (tab === t.key ? 'bg-[#7C3AED] text-white  ' : 'text-[#64748B] hover:text-white')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl px-4 py-2.5">
          <Search size={15} className="text-[#64748B] flex-shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by ref, username, phone, name..."
            className="flex-1 bg-transparent text-[#111827] text-sm placeholder-[#94A3B8] focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="text-[#64748B] hover:text-[#111827] flex-shrink-0"><XCircle size={15} /></button>}
        </div>

        {/* Payment list */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">{tab === 'pending' ? '✅' : '💳'}</p>
            <p className="text-[#111827] font-bold">{tab === 'pending' ? 'No pending payments' : 'No payments found'}</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filtered.map(pay => (
              <div
                key={pay.id}
                className={`border rounded-2xl p-4 transition-all ${
                  pay.status === 'pending'   ? 'border-yellow-500/25 bg-yellow-500/[0.04]' :
                  pay.status === 'confirmed' ? 'border-green-500/15 bg-green-500/[0.02]'   :
                  'border-red-500/15 bg-red-500/[0.02]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">{typeIcon(pay.payment_type)}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-[#111827] font-bold text-[13px] capitalize">
                            {pay.payment_type === 'subscription' ? `${PLANS[pay.plan]?.label} Plan` :
                             pay.payment_type === 'boost' ? `${pay.boost_days}d Boost` :
                             pay.payment_type === 'coins' ? `${formatNumber(pay.coins_amount||0)} Coins` :
                             pay.payment_type}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            pay.status === 'pending'   ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30' :
                            pay.status === 'confirmed' ? 'bg-green-500/20 text-green-700 border-green-500/30' :
                            'bg-red-500/20 text-red-600 border-red-500/30'
                          }`}>
                            {pay.status === 'pending' ? '⏳ Pending' : pay.status === 'confirmed' ? '✓ Confirmed' : '✗ Rejected'}
                          </span>
                        </div>

                        <p className="text-[#64748B] text-[12px]">
                          <strong>{pay.user?.display_name}</strong> · @{pay.user?.username}
                        </p>
                        <p className="text-[#64748B] text-[11px] font-mono mt-0.5">
                          {pay.reference_code} · {pay.mpesa_phone}
                          {pay.mpesa_name ? ` · ${pay.mpesa_name}` : ''}
                        </p>
                        <p className="text-[#64748B] text-[11px] mt-0.5">{formatTime(pay.created_at)}</p>
                        {pay.rejection_reason && (
                          <p className="text-red-600/70 text-[11px] mt-1">Reason: {pay.rejection_reason}</p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-[#111827] font-black text-[16px]">{formatKES(pay.amount_kes)}</p>
                      </div>
                    </div>

                    {pay.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setSelected(pay)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-[#111827] active:scale-95 transition-all"
                          style={{ background: 'linear-gradient(135deg, #10B981, #16A34A)' }}
                        >
                          <Eye size={13} /> Review & Confirm
                        </button>
                        <button
                          onClick={() => handleReject(pay)}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-600 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 active:scale-95 transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <PaymentDetailModal
          payment={selected}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
          onReject={handleReject}
          busy={busy}
        />
      )}
    </div>
  );
}