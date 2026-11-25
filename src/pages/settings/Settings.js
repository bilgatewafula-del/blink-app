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
        { icon: User, label: 'Account Information', sub: 'Name, username, email, phone', path: '/settings/account', color: 'text-[#0284C7]', bg: 'bg-[#0284C7]/20' },
        { icon: Lock, label: 'Password & Security', sub: 'Change password, 2FA, sessions', path: '/settings/security', color: 'text-[#6D28D9]', bg: 'bg-[#7C3AED]/20' },
        { icon: Eye, label: 'Privacy', sub: 'Account privacy, blocked users', path: '/settings/privacy', color: 'text-[#7C3AED]', bg: 'bg-[#7C3AED]/20' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: Bell, label: 'Notifications', sub: 'Push, email, quiet hours', path: '/settings/notifications', color: 'text-[#6D28D9]', bg: 'bg-[#7C3AED]/20' },
        { icon: Palette, label: 'Appearance', sub: 'Theme, font size, language', path: '/settings/appearance', color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
        { icon: Globe, label: 'Language & Region', sub: 'English, Swahili + more', path: '/settings/appearance', color: 'text-[#10B981]', bg: 'bg-[#10B981]/20' },
        { icon: Smartphone, label: 'Data Usage', sub: 'Low data mode, cache', path: '/settings/appearance', color: 'text-[#64748B]', bg: 'bg-[#6B7280]/20' },
      ],
    },
    {
      title: 'Creator & Business',
      items: [
        { icon: BadgeCheck, label: 'Verification', sub: 'Apply for blue tick', path: '/verification', color: 'text-[#0284C7]', bg: 'bg-[#0284C7]/20' },
        { icon: Wallet, label: 'Wallet & Payments', sub: 'M-Pesa, tips, earnings', path: '/wallet', color: 'text-[#10B981]', bg: 'bg-[#10B981]/20' },
        { icon: BarChart2, label: 'Analytics', sub: 'Impressions, reach, growth', path: '/profile', color: 'text-[#B45309]', bg: 'bg-[#FFD700]/20' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: Download, label: 'Download Your Data', sub: 'Export your posts and info', path: null, color: 'text-[#64748B]', bg: 'bg-[#6B7280]/20' },
        { icon: HelpCircle, label: 'Help Center', sub: 'FAQ, report a problem', path: null, color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
        { icon: Info, label: 'About B-Link', sub: 'Version, licenses, terms', path: null, color: 'text-[#64748B]', bg: 'bg-[#6B7280]/20' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3">
        <h1 className="text-white font-bold text-xl">Settings</h1>
      </div>

      {/* Profile card */}
      <div
        onClick={() => navigate('/profile/edit')}
        className="mx-4 mt-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-[#F1F5F9] transition-colors active:scale-[0.98]"
      >
        <Avatar url={profile?.avatar_url} name={profile?.display_name} size={14} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[#111827] font-bold text-base truncate">{profile?.display_name}</p>
            {profile?.is_verified && (
              <span className="bg-[#0284C7] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">✓</span>
            )}
          </div>
          <p className="text-[#64748B] text-sm">@{profile?.username}</p>
          <p className="text-[#0284C7] text-xs mt-0.5 font-semibold">Edit Profile →</p>
        </div>
        <ChevronRight size={18} className="text-[#64748B] flex-shrink-0" />
      </div>

      {/* Settings sections */}
      <div className="px-4 mt-5 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">
              {section.title}
            </p>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
              {section.items.map((item, idx) => (
                <button
                  key={item.label}
                  onClick={() => item.path && navigate(item.path)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors ${
                    idx < section.items.length - 1 ? 'border-b border-[#E2E8F0]' : ''
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                    <item.icon size={18} className={item.color} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[#111827] text-sm font-semibold">{item.label}</p>
                    <p className="text-[#64748B] text-xs truncate">{item.sub}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#64748B] flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-3 bg-red-500/10 border border-red-500/20 text-red-600 font-bold py-4 rounded-2xl hover:bg-red-500/20 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>

        {/* Version */}
        <p className="text-center text-[#64748B] text-xs pb-4">
          B-Link v2.0.0 · Built in Africa 🌍
        </p>
      </div>
    </div>
  );
};

export default Settings;