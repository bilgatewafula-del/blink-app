import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Mail, Phone, User, AtSign, Calendar, Globe, Trash2, AlertTriangle } from 'lucide-react';
import { COUNTRIES } from '../../utils/constants';

const AccountSettings = () => {
  const { profile, user, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    display_name: profile?.display_name || '',
    username: profile?.username || '',
    email: user?.email || '',
    phone: profile?.phone || '',
    country: profile?.country || 'KE',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.from('users').update({
      display_name: form.display_name,
      username: form.username.toLowerCase(),
      phone: form.phone,
      country: form.country,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender,
    }).eq('id', user.id);

    if (error) { setError(error.message); }
    else { await fetchProfile(user.id); setSuccess('Account updated successfully!'); }
    setLoading(false);
  };

  const fields = [
    { icon: User, label: 'Display Name', key: 'display_name', placeholder: 'Your full name', type: 'text' },
    { icon: AtSign, label: 'Username', key: 'username', placeholder: 'yourhandle', type: 'text' },
    { icon: Mail, label: 'Email', key: 'email', placeholder: 'email@example.com', type: 'email', disabled: true },
    { icon: Phone, label: 'Phone Number', key: 'phone', placeholder: '+254 7XX XXX XXX', type: 'tel' },
    { icon: Calendar, label: 'Date of Birth', key: 'date_of_birth', placeholder: '', type: 'date' },
  ];

  return (
    <div className="min-h-screen bg-[#11152E] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/settings')} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Account Information</h1>
        <button
          onClick={handleSave}
          disabled={loading}
          className="text-[#1E6FFF] font-bold text-sm disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"><p className="text-red-400 text-sm">{error}</p></div>}
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3"><p className="text-green-400 text-sm">{success}</p></div>}

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {fields.map((f, idx) => (
            <div key={f.key} className={`px-4 py-3 ${idx < fields.length - 1 ? 'border-b border-white/5' : ''}`}>
              <label className="text-[#6B7280] text-xs mb-1.5 flex items-center gap-1.5">
                <f.icon size={12} />
                {f.label}
              </label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                disabled={f.disabled}
                className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-[#6B7280] disabled:opacity-50"
              />
            </div>
          ))}
          <div className="px-4 py-3">
            <label className="text-[#6B7280] text-xs mb-1.5 flex items-center gap-1.5">
              <Globe size={12} /> Country
            </label>
            <select
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full bg-transparent text-white text-sm focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#11152E]">
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="px-4 py-3 border-t border-white/5">
            <label className="text-[#6B7280] text-xs mb-1.5 block">Gender</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full bg-transparent text-white text-sm focus:outline-none"
            >
              <option value="" className="bg-[#11152E]">Prefer not to say</option>
              <option value="male" className="bg-[#11152E]">Male</option>
              <option value="female" className="bg-[#11152E]">Female</option>
              <option value="other" className="bg-[#11152E]">Other</option>
            </select>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-6">
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Danger Zone</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowDeactivate(true)}
              className="w-full flex items-center gap-4 px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-colors"
            >
              <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <AlertTriangle size={18} className="text-yellow-400" />
              </div>
              <div className="text-left">
                <p className="text-white text-sm font-semibold">Deactivate Account</p>
                <p className="text-[#6B7280] text-xs">Temporarily disable your account</p>
              </div>
            </button>
            <button className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-500/5 transition-colors">
              <div className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div className="text-left">
                <p className="text-red-400 text-sm font-semibold">Delete Account</p>
                <p className="text-[#6B7280] text-xs">Permanently delete all your data</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;