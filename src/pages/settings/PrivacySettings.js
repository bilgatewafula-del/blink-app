import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Lock, Eye, Heart, Users, MessageCircle, Search } from 'lucide-react';

const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#0284C7]' : 'bg-[#E2E8F0]'}`}
  >
    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
  </button>
);

const PrivacySettings = () => {
  const { profile, user, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    is_private: profile?.is_private || false,
    hide_likes: false,
    hide_followers: false,
    allow_comments: 'everyone',
    allow_messages: 'followers',
    show_activity: true,
    allow_tagging: true,
    show_in_search: true,
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const update = (key, val) => setSettings((s) => ({ ...s, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('users').update({ is_private: settings.is_private }).eq('id', user.id);
    await fetchProfile(user.id);
    setSuccess('Privacy settings saved!');
    setSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const selectOptions = (key, options) => (
    <select
      value={settings[key]}
      onChange={(e) => update(key, e.target.value)}
      className="bg-[#111827] border border-[#E2E8F0] text-[#111827] text-xs rounded-lg px-2 py-1.5 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#F8FAFC]">{o.label}</option>
      ))}
    </select>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/settings')} className="text-[#CBD5E1] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Privacy</h1>
        <button onClick={handleSave} disabled={saving} className="text-[#0284C7] font-bold text-sm disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3"><p className="text-green-700 text-sm">{success}</p></div>}

        {[
          {
            title: 'Account Privacy',
            items: [
              {
                icon: Lock, label: 'Private Account',
                sub: 'Only approved followers see your posts',
                type: 'toggle', key: 'is_private',
                color: 'text-[#7C3AED]', bg: 'bg-[#7C3AED]/20',
              },
              {
                icon: Search, label: 'Show in Search',
                sub: 'Let others find you in search',
                type: 'toggle', key: 'show_in_search',
                color: 'text-[#0284C7]', bg: 'bg-[#0284C7]/20',
              },
              {
                icon: Eye, label: 'Activity Status',
                sub: 'Show when you were last active',
                type: 'toggle', key: 'show_activity',
                color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20',
              },
            ],
          },
          {
            title: 'Interactions',
            items: [
              {
                icon: Heart, label: 'Hide Like Counts',
                sub: 'Others cannot see how many likes your posts get',
                type: 'toggle', key: 'hide_likes',
                color: 'text-red-600', bg: 'bg-red-400/20',
              },
              {
                icon: Users, label: 'Hide Follower Count',
                sub: 'Keep your follower numbers private',
                type: 'toggle', key: 'hide_followers',
                color: 'text-[#10B981]', bg: 'bg-[#10B981]/20',
              },
              {
                icon: Users, label: 'Allow Tagging',
                sub: 'Let others tag you in posts',
                type: 'toggle', key: 'allow_tagging',
                color: 'text-[#B45309]', bg: 'bg-[#FFD700]/20',
              },
            ],
          },
          {
            title: 'Comments & Messages',
            items: [
              {
                icon: MessageCircle, label: 'Who can comment',
                sub: 'Control who comments on your posts',
                type: 'select', key: 'allow_comments',
                color: 'text-[#0284C7]', bg: 'bg-[#0284C7]/20',
                options: [
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'followers', label: 'Followers' },
                  { value: 'nobody', label: 'Nobody' },
                ],
              },
              {
                icon: MessageCircle, label: 'Who can message you',
                sub: 'Control who can send you messages',
                type: 'select', key: 'allow_messages',
                color: 'text-[#00D4C8]', bg: 'bg-[#00D4C8]/20',
                options: [
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'followers', label: 'Followers Only' },
                  { value: 'nobody', label: 'Nobody' },
                ],
              },
            ],
          },
        ].map((section) => (
          <div key={section.title}>
            <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">{section.title}</p>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
              {section.items.map((item, idx) => (
                <div key={item.key} className={`flex items-center gap-4 px-4 py-4 ${idx < section.items.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                    <item.icon size={18} className={item.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#111827] text-sm font-semibold">{item.label}</p>
                    <p className="text-[#64748B] text-xs leading-relaxed">{item.sub}</p>
                  </div>
                  {item.type === 'toggle' ? (
                    <Toggle value={settings[item.key]} onChange={(v) => update(item.key, v)} />
                  ) : (
                    selectOptions(item.key, item.options)
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrivacySettings;