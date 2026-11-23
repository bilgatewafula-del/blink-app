import { useState, useEffect } from 'react';
import { IconTile } from '../../components/ui';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Wallet, Clock, Bell, TrendingUp, Gift, Star, Send, Banknote, Landmark, BarChart3, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { goBack } from '../../lib/nav';

const WalletPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notified, setNotified] = useState(false);
  const [tipsReceived, setTipsReceived] = useState(0);
  const [tipsSent, setTipsSent] = useState(0);

  useEffect(() => {
    fetchTipStats();
  }, []);

  const fetchTipStats = async () => {
    const { count: received } = await supabase
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', user.id);
    const { count: sent } = await supabase
      .from('tips')
      .select('id', { count: 'exact', head: true })
      .eq('from_user_id', user.id);
    setTipsReceived(received || 0);
    setTipsSent(sent || 0);
  };

  const handleNotify = async () => {
    if (!notifyEmail.trim()) return;
    setNotified(true);
  };

  const upcomingFeatures = [
    { icon: Send, title: 'M-Pesa Tips', desc: 'Send and receive tips directly via M-Pesa', eta: 'Q2 2025' },
    { icon: Banknote, title: 'Creator Earnings', desc: 'Earn from your content and followers', eta: 'Q2 2025' },
    { icon: Landmark, title: 'Withdrawals', desc: 'Withdraw earnings to your M-Pesa number', eta: 'Q3 2025' },
    { icon: Gift, title: 'Gift Subscriptions', desc: 'Gift premium access to other users', eta: 'Q3 2025' },
    { icon: BarChart3, title: 'Revenue Analytics', desc: 'Track your earnings with detailed charts', eta: 'Q4 2025' },
    { icon: ShoppingBag, title: 'Creator Shop', desc: 'Sell digital products to your followers', eta: 'Q1 2026' },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center gap-4">
        <button onClick={() => goBack(navigate, '/')} className="text-[#64748B] hover:text-[#202938]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[#202938] font-bold text-lg">Wallet</h1>
      </div>

      {/* Coming Soon hero */}
      <div className="mx-4 mt-6">
        <div className="bg-gradient-to-br from-[#F97316]/20 via-[#F97316]/20 to-[#FFB020]/10 border border-[#F97316]/30 rounded-3xl p-6 text-center">
          <div className="w-20 h-20 bg-[#F97316] rounded-full flex items-center justify-center mx-auto mb-4  ">
            <Wallet size={36} className="text-[#202938]" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={16} className="text-[#B45309]" />
            <span className="bg-[#FFD700]/20 text-[#B45309] text-xs font-bold px-3 py-1 rounded-full">Coming Soon</span>
          </div>
          <h2 className="text-[#202938] font-bold text-2xl mb-2">B-Link Wallet</h2>
          <p className="text-[#64748B] text-sm leading-relaxed">
            We're building a powerful creator economy platform with M-Pesa integration. Support your favorite creators and earn from your content.
          </p>
        </div>
      </div>

      {/* Your current stats */}
      <div className="px-4 mt-4">
        <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-3">Your Activity</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-[#2ECC71]">{tipsReceived}</p>
            <p className="text-[#64748B] text-xs mt-1">Tips Received</p>
            <p className="text-[#64748B] text-[10px]">Once wallet launches</p>
          </div>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-[#EA580C]">{tipsSent}</p>
            <p className="text-[#64748B] text-xs mt-1">Tips Sent</p>
            <p className="text-[#64748B] text-[10px]">Once wallet launches</p>
          </div>
        </div>
      </div>

      {/* Profile earnings potential */}
      <div className="px-4 mt-4">
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#FFD700]/20 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-[#B45309]" />
            </div>
            <div>
              <p className="text-[#202938] font-bold text-sm">Your Earnings Potential</p>
              <p className="text-[#64748B] text-xs">Based on your current followers</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[#64748B] text-sm">Followers</p>
              <p className="text-[#202938] font-semibold">{profile?.follower_count || 0}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[#64748B] text-sm">Est. monthly tips</p>
              <p className="text-[#2ECC71] font-semibold">
                KES {Math.floor((profile?.follower_count || 0) * 2.5).toLocaleString()}+
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[#64748B] text-sm">Creator tier</p>
              <p className="text-[#B45309] font-semibold">
                {(profile?.follower_count || 0) >= 1000 ? 'Gold' :
                 (profile?.follower_count || 0) >= 100 ? 'Silver' : 'Bronze'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming features */}
      <div className="px-4 mt-4">
        <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-3">What's Coming</p>
        <div className="space-y-2">
          {upcomingFeatures.map((f) => (
            <div key={f.title} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 flex items-center gap-3">
              <IconTile icon={f.icon} size={40} iconSize={20} />
              <div className="flex-1 min-w-0">
                <p className="text-[#202938] font-semibold text-sm">{f.title}</p>
                <p className="text-[#64748B] text-xs">{f.desc}</p>
              </div>
              <span className="bg-[#F97316]/20 text-[#EA580C] text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0">
                {f.eta}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notify me */}
      <div className="px-4 mt-4">
        <div className="bg-gradient-to-r from-[#F97316]/10 to-[#F97316]/10 border border-[#F97316]/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-[#EA580C]" />
            <p className="text-[#202938] font-bold text-sm">Get Notified at Launch</p>
          </div>
          {notified ? (
            <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/20 rounded-xl p-3 text-center">
              <p className="text-[#2ECC71] font-semibold text-sm inline-flex items-center gap-1.5"><CheckCircle2 size={16} /> You're on the list!</p>
              <p className="text-[#64748B] text-xs mt-1">We'll notify you when the wallet launches.</p>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder={user?.email || 'your@email.com'}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-3 px-4 text-[#202938] placeholder-[#94A3B8] text-sm focus:outline-none focus:border-[#F97316] mb-3"
              />
              <button
                onClick={handleNotify}
                className="w-full bg-[#F97316] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                Notify Me at Launch
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-[#64748B] text-xs px-4 mt-4 pb-4">
        Your earnings will be 100% secure with Safaricom M-Pesa integration
      </p>
    </div>
  );
};

export default WalletPage;