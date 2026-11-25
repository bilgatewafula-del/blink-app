import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Lock, Shield, Smartphone,
  Eye, EyeOff, LogOut, Monitor, Trash2
} from 'lucide-react';

const SecuritySettings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [twoFA, setTwoFA] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);

  const handleChangePassword = async () => {
    if (form.newPwd !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.newPwd.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password: form.newPwd });
    if (error) setError(error.message);
    else { setSuccess('Password updated successfully!'); setForm({ current: '', newPwd: '', confirm: '' }); }
    setLoading(false);
  };

  const handleSignOutAll = async () => {
    if (window.confirm('Sign out from all devices?')) {
      await supabase.auth.signOut({ scope: 'global' });
      navigate('/login');
    }
  };

  const sessions = [
    { device: 'Chrome on Windows', location: 'Eldoret, Kenya', current: true, time: 'Active now' },
    { device: 'Safari on iPhone', location: 'Nairobi, Kenya', current: false, time: '2 hours ago' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="text-[#CBD5E1] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Password & Security</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"><p className="text-red-600 text-sm">{error}</p></div>}
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3"><p className="text-green-700 text-sm">{success}</p></div>}

        {/* Change password */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Change Password</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            {[
              { label: 'New Password', key: 'newPwd' },
              { label: 'Confirm Password', key: 'confirm' },
            ].map((f, idx) => (
              <div key={f.key} className={`px-4 py-3 flex items-center gap-3 ${idx < 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
                <Lock size={16} className="text-[#64748B] flex-shrink-0" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.label}
                  className="flex-1 bg-transparent text-[#111827] text-sm focus:outline-none placeholder-[#94A3B8]"
                />
                <button onClick={() => setShowPwd(!showPwd)} className="text-[#64748B]">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="w-full mt-3 bg-[#0284C7] text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>

        {/* Security toggles */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Security</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#0284C7]/20 rounded-xl flex items-center justify-center">
                  <Shield size={18} className="text-[#0284C7]" />
                </div>
                <div>
                  <p className="text-[#111827] text-sm font-semibold">Two-Factor Authentication</p>
                  <p className="text-[#64748B] text-xs">Extra security for your account</p>
                </div>
              </div>
              <button
                onClick={() => setTwoFA(!twoFA)}
                className={`w-12 h-6 rounded-full transition-colors ${twoFA ? 'bg-[#0284C7]' : 'bg-[#E2E8F0]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${twoFA ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#7C3AED]/20 rounded-xl flex items-center justify-center">
                  <Smartphone size={18} className="text-[#6D28D9]" />
                </div>
                <div>
                  <p className="text-[#111827] text-sm font-semibold">Login Alerts</p>
                  <p className="text-[#64748B] text-xs">Get notified of new sign-ins</p>
                </div>
              </div>
              <button
                onClick={() => setLoginAlerts(!loginAlerts)}
                className={`w-12 h-6 rounded-full transition-colors ${loginAlerts ? 'bg-[#0284C7]' : 'bg-[#E2E8F0]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${loginAlerts ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Active sessions */}
        <div>
          <p className="text-[#64748B] text-xs font-bold uppercase tracking-widest mb-2 px-1">Active Sessions</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
            {sessions.map((s, idx) => (
              <div key={idx} className={`flex items-center gap-3 px-4 py-4 ${idx < sessions.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}>
                <div className="w-9 h-9 bg-[#F1F5F9] rounded-xl flex items-center justify-center flex-shrink-0">
                  <Monitor size={18} className="text-[#64748B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[#111827] text-sm font-semibold truncate">{s.device}</p>
                    {s.current && (
                      <span className="bg-[#10B981]/20 text-[#10B981] text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Current</span>
                    )}
                  </div>
                  <p className="text-[#64748B] text-xs">{s.location} · {s.time}</p>
                </div>
                {!s.current && (
                  <button className="text-red-600 hover:text-red-600 transition-colors flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleSignOutAll}
            className="w-full mt-3 bg-red-500/10 border border-red-500/20 text-red-600 font-bold py-3 rounded-xl hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            Sign Out All Devices
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;