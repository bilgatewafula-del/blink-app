import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  User, Lock, Shield, Bell, Palette, Globe,
  Download, HelpCircle, Info, LogOut, ChevronRight,
  BadgeCheck, Wallet, BarChart2, Eye, Smartphone
} from 'lucide-react';
import Avatar from '../../components/Avatar';

const Settings = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (window.confirm('Sign out of B-Link?')) {
      await signOut();
      navigate('/login');
    }
  };

  const sections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Account Information', sub: 'Name, username, email, phone', path: '/settings/account', color: 'text-[#1E6FFF]', bg: 'bg-[#1E6FFF]/20' },
        { icon: Lock, label: 'Password & Security', sub: 'Change password, 2FA, sessions', path: '/settings/security', color: 'text-[#FF6B35]', bg: 'bg-[#FF6B35]/20' },
        { icon: Eye, label: 'Privacy', sub: 'Account privacy, blocked users', path: '/settings/privacy', color: 'text-[#7B2FFF]', bg: 'bg-[#7B2FFF]/20' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', sub: 'Push, email, quiet hours', path: '/settings/notifications', color: 'text-[#FF6B35]', bg: 'bg-[#FF6B35]/20' },
        { icon: Palette, label: 'Appearance', sub: 'Theme, font size, language', path: '/settings/appearance', color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
        { icon: Globe, label: 'Language & Region', sub: 'English, Swahili + more', path: '/settings/appearance', color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
        { icon: Smartphone, label: 'Data Usage', sub: 'Low data mode, cache', path: '/settings/appearance', color: 'text-[#6B7280]', bg: 'bg-[#6B7280]/20' },
      ],
    },
    {
      title: 'Creator & Business',
      items: [
        { icon: BadgeCheck, label: 'Verification', sub: 'Apply for blue tick', path: '/verification', color: 'text-[#1E6FFF]', bg: 'bg-[#1E6FFF]/20' },
        { icon: Wallet, label: 'Wallet & Payments', sub: 'M-Pesa, tips, earnings', path: '/wallet', color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
        { icon: BarChart2, label: 'Analytics', sub: 'Impressions, reach, growth', path: '/profile', color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/20' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: Download, label: 'Download Your Data', sub: 'Export your posts and info', path: null, color: 'text-[#6B7280]', bg: 'bg-[#6B7280]/20' },
        { icon: HelpCircle, label: 'Help Center', sub: 'FAQ, report a problem', path: null, color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
        { icon: Info, label: 'About B-Link', sub: 'Version, licenses, terms', path: null, color: 'text-[#6B7280]', bg: 'bg-[#6B7280]/20' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3">
        <h1 className="text-white font-bold text-xl">Settings</h1>
      </div>

      {/* Profile card */}
      <div
        onClick={() => navigate('/profile/edit')}
        className="mx-4 mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/8 transition-colors active:scale-[0.98]"
      >
        <Avatar url={profile?.avatar_url} name={profile?.display_name} size={14} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-bold text-base truncate">{profile?.display_name}</p>
            {profile?.is_verified && (
              <span className="bg-[#1E6FFF] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
            )}
          </div>
          <p className="text-[#6B7280] text-sm">@{profile?.username}</p>
          <p className="text-[#1E6FFF] text-xs mt-0.5 font-semibold">Edit Profile →</p>
        </div>
        <ChevronRight size={18} className="text-[#6B7280] flex-shrink-0" />
      </div>

      {/* Settings sections */}
      <div className="px-4 mt-5 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">
              {section.title}
            </p>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {section.items.map((item, idx) => (
                <button
                  key={item.label}
                  onClick={() => item.path && navigate(item.path)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 transition-colors ${
                    idx < section.items.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                    <item.icon size={18} className={item.color} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-white text-sm font-semibold">{item.label}</p>
                    <p className="text-[#6B7280] text-xs truncate">{item.sub}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#6B7280] flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 font-bold py-4 rounded-2xl hover:bg-red-500/20 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>

        {/* Version */}
        <p className="text-center text-[#6B7280] text-xs pb-4">
          B-Link v2.0.0 · Built in Africa 🌍
        </p>
      </div>
    </div>
  );
};

export default Settings;