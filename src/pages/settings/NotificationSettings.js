import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Heart, MessageCircle, UserPlus, Repeat2, AtSign, DollarSign, Moon } from 'lucide-react';

const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#2563EB]' : 'bg-[#E2E8F0]'}`}
  >
    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
  </button>
);

const NotificationSettings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    likes: true, comments: true, follows: true,
    reposts: true, mentions: true, tips: true,
    messages: true, system: true,
    email_digest: false, quiet_hours: false,
    quiet_start: '22:00', quiet_end: '07:00',
    push_enabled: true,
  });

  const update = (key, val) => setSettings((s) => ({ ...s, [key]: val }));

  const notifItems = [
    { icon: Heart, key: 'likes', label: 'Likes & Reactions', sub: 'When someone reacts to your post', color: 'text-red-600', bg: 'bg-red-400/20' },
    { icon: MessageCircle, key: 'comments', label: 'Comments', sub: 'When someone comments on your post', color: 'text-[#2563EB]', bg: 'bg-[#2563EB]/20' },
    { icon: UserPlus, key: 'follows', label: 'New Followers', sub: 'When someone follows you', color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
    { icon: Repeat2, key: 'reposts', label: 'Reposts', sub: 'When someone reposts your content', color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20' },
    { icon: AtSign, key: 'mentions', label: 'Mentions', sub: 'When someone tags you', color: 'text-[#7B2FFF]', bg: 'bg-[#7B2FFF]/20' },
    { icon: DollarSign, key: 'tips', label: 'Tips & Payments', sub: 'When you receive an M-Pesa tip', color: 'text-[#B45309]', bg: 'bg-[#FFD700]/20' },
    { icon: MessageCircle, key: 'messages', label: 'Direct Messages', sub: 'New chat messages', color: 'text-[#00B4D8]', bg: 'bg-[#00B4D8]/20' },
    { icon: Bell, key: 'system', label: 'System Alerts', sub: 'B-Link announcements', color: 'text-[#EA580C]', bg: 'bg-[#F97316]/20' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="sticky top-0 z-20 bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="text-[#64748B] hover:text-[#202938]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-[#202938] font-bold text-lg">Notifications</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Master toggle */}
        <div className="bg-gradient-to-r from-[#2563EB]/20 to-[#7B2FFF]/20 border border-[#2563EB]/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={22} className="text-[#2563EB]" />
            <div>
              <p className="text-[#202938] font-bold text-sm">Push Notifications</p>
              <p className="text-[#64748B] text-xs">Enable all push notifications</p>
            </div>
          </div>
          <Toggle value={settings.push_enabled} onChange={(v) => update('push_enabled', v)} />
        </div>

        {/* Per-type toggles */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Notification Types</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            {notifItems.map((item, idx) => (
              <div key={item.key} className={`flex items-center gap-4 px-4 py-3.5 ${idx < notifItems.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
                <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                  <item.icon size={18} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#202938] text-sm font-semibold">{item.label}</p>
                  <p className="text-[#64748B] text-xs">{item.sub}</p>
                </div>
                <Toggle
                  value={settings[item.key]}
                  onChange={(v) => update(item.key, v)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Quiet hours */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Quiet Hours</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-4 border-b border-[#E2E8F0]">
              <div className="w-9 h-9 bg-[#7B2FFF]/20 rounded-xl flex items-center justify-center">
                <Moon size={18} className="text-[#7B2FFF]" />
              </div>
              <div className="flex-1">
                <p className="text-[#202938] text-sm font-semibold">Enable Quiet Hours</p>
                <p className="text-[#64748B] text-xs">Pause notifications at night</p>
              </div>
              <Toggle value={settings.quiet_hours} onChange={(v) => update('quiet_hours', v)} />
            </div>
            {settings.quiet_hours && (
              <div className="flex items-center gap-4 px-4 py-4">
                <div className="flex-1">
                  <p className="text-[#64748B] text-xs mb-2">From</p>
                  <input
                    type="time"
                    value={settings.quiet_start}
                    onChange={(e) => update('quiet_start', e.target.value)}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 text-[#202938] text-sm focus:outline-none w-full"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[#64748B] text-xs mb-2">To</p>
                  <input
                    type="time"
                    value={settings.quiet_end}
                    onChange={(e) => update('quiet_end', e.target.value)}
                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 text-[#202938] text-sm focus:outline-none w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Email */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Email</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[#202938] text-sm font-semibold">Weekly Digest</p>
              <p className="text-[#64748B] text-xs">Summary of your activity each week</p>
            </div>
            <Toggle value={settings.email_digest} onChange={(v) => update('email_digest', v)} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;