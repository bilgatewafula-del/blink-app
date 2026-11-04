import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Wallet, Clock, Bell, TrendingUp, Gift, Star } from 'lucide-react';

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
    { icon: '💸', title: 'M-Pesa Tips', desc: 'Send and receive tips directly via M-Pesa', eta: 'Q2 2025' },
    { icon: '💰', title: 'Creator Earnings', desc: 'Earn from your content and followers', eta: 'Q2 2025' },
    { icon: '🏧', title: 'Withdrawals', desc: 'Withdraw earnings to your M-Pesa number', eta: 'Q3 2025' },
    { icon: '🎁', title: 'Gift Subscriptions', desc: 'Gift premium access to other users', eta: 'Q3 2025' },
    { icon: '📊', title: 'Revenue Analytics', desc: 'Track your earnings with detailed charts', eta: 'Q4 2025' },
    { icon: '🛒', title: 'Creator Shop', desc: 'Sell digital products to your followers', eta: 'Q1 2026' },
  ];

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Wallet</h1>
      </div>

      {/* Coming Soon hero */}
      <div className="mx-4 mt-6">
        <div className="bg-gradient-to-br from-[#FF5A1F]/20 via-[#FF2D78]/20 to-[#FFB020]/10 border border-[#FF5A1F]/30 rounded-3xl p-6 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[#FF5A1F]/30">
            <Wallet size={36} className="text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={16} className="text-[#FFD700]" />
            <span className="bg-[#FFD700]/20 text-[#FFD700] text-xs font-bold px-3 py-1 rounded-full">Coming Soon</span>
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">B-Link Wallet</h2>
          <p className="text-[#8E8C88] text-sm leading-relaxed">
            We're building a powerful creator economy platform with M-Pesa integration. Support your favorite creators and earn from your content.
          </p>
        </div>
      </div>

      {/* Your current stats */}
      <div className="px-4 mt-4">
        <p className="text-[#8E8C88] text-xs font-bold uppercase tracking-widest mb-3">Your Activity</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-[#2ECC71]">{tipsReceived}</p>
            <p className="text-[#8E8C88] text-xs mt-1">Tips Received</p>
            <p className="text-[#8E8C88] text-[10px]">Once wallet launches</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-[#FF5A1F]">{tipsSent}</p>
            <p className="text-[#8E8C88] text-xs mt-1">Tips Sent</p>
            <p className="text-[#8E8C88] text-[10px]">Once wallet launches</p>
          </div>
        </div>
      </div>

      {/* Profile earnings potential */}
      <div className="px-4 mt-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#FFD700]/20 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-[#FFD700]" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Your Earnings Potential</p>
              <p className="text-[#8E8C88] text-xs">Based on your current followers</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[#8E8C88] text-sm">Followers</p>
              <p className="text-white font-semibold">{profile?.follower_count || 0}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[#8E8C88] text-sm">Est. monthly tips</p>
              <p className="text-[#2ECC71] font-semibold">
                KES {Math.floor((profile?.follower_count || 0) * 2.5).toLocaleString()}+
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[#8E8C88] text-sm">Creator tier</p>
              <p className="text-[#FFD700] font-semibold">
                {(profile?.follower_count || 0) >= 1000 ? '🌟 Gold' :
                 (profile?.follower_count || 0) >= 100 ? '⭐ Silver' : '🔰 Bronze'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming features */}
      <div className="px-4 mt-4">
        <p className="text-[#8E8C88] text-xs font-bold uppercase tracking-widest mb-3">What's Coming</p>
        <div className="space-y-2">
          {upcomingFeatures.map((f) => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-[#8E8C88] text-xs">{f.desc}</p>
              </div>
              <span className="bg-[#FF5A1F]/20 text-[#FF5A1F] text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0">
                {f.eta}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notify me */}
      <div className="px-4 mt-4">
        <div className="bg-gradient-to-r from-[#FF5A1F]/10 to-[#FF2D78]/10 border border-[#FF5A1F]/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-[#FF5A1F]" />
            <p className="text-white font-bold text-sm">Get Notified at Launch</p>
          </div>
          {notified ? (
            <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/20 rounded-xl p-3 text-center">
              <p className="text-[#2ECC71] font-semibold text-sm">✅ You're on the list!</p>
              <p className="text-[#8E8C88] text-xs mt-1">We'll notify you when the wallet launches.</p>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder={user?.email || 'your@email.com'}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F] mb-3"
              />
              <button
                onClick={handleNotify}
                className="w-full bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                Notify Me at Launch
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-[#8E8C88] text-xs px-4 mt-4 pb-4">
        🔒 Your earnings will be 100% secure with Safaricom M-Pesa integration
      </p>
    </div>
  );
};

export default WalletPage;