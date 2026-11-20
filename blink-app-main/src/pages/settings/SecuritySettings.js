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
    <div className="min-h-screen bg-[#0A1628] pb-24">
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Password & Security</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"><p className="text-red-400 text-sm">{error}</p></div>}
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3"><p className="text-green-400 text-sm">{success}</p></div>}

        {/* Change password */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Change Password</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {[
              { label: 'New Password', key: 'newPwd' },
              { label: 'Confirm Password', key: 'confirm' },
            ].map((f, idx) => (
              <div key={f.key} className={`px-4 py-3 flex items-center gap-3 ${idx < 1 ? 'border-b border-white/5' : ''}`}>
                <Lock size={16} className="text-[#6B7280] flex-shrink-0" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.label}
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-[#6B7280]"
                />
                <button onClick={() => setShowPwd(!showPwd)} className="text-[#6B7280]">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleChangePassword}
            disabled={loading}
            className="w-full mt-3 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>

        {/* Security toggles */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Security</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#1E6FFF]/20 rounded-xl flex items-center justify-center">
                  <Shield size={18} className="text-[#1E6FFF]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Two-Factor Authentication</p>
                  <p className="text-[#6B7280] text-xs">Extra security for your account</p>
                </div>
              </div>
              <button
                onClick={() => setTwoFA(!twoFA)}
                className={`w-12 h-6 rounded-full transition-colors ${twoFA ? 'bg-[#1E6FFF]' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${twoFA ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#FF6B35]/20 rounded-xl flex items-center justify-center">
                  <Smartphone size={18} className="text-[#FF6B35]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Login Alerts</p>
                  <p className="text-[#6B7280] text-xs">Get notified of new sign-ins</p>
                </div>
              </div>
              <button
                onClick={() => setLoginAlerts(!loginAlerts)}
                className={`w-12 h-6 rounded-full transition-colors ${loginAlerts ? 'bg-[#1E6FFF]' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${loginAlerts ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Active sessions */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Active Sessions</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {sessions.map((s, idx) => (
              <div key={idx} className={`flex items-center gap-3 px-4 py-4 ${idx < sessions.length - 1 ? 'border-b border-white/5' : ''}`}>
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Monitor size={18} className="text-white/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-semibold truncate">{s.device}</p>
                    {s.current && (
                      <span className="bg-[#2ECC71]/20 text-[#2ECC71] text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Current</span>
                    )}
                  </div>
                  <p className="text-[#6B7280] text-xs">{s.location} · {s.time}</p>
                </div>
                {!s.current && (
                  <button className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleSignOutAll}
            className="w-full mt-3 bg-red-500/10 border border-red-500/20 text-red-400 font-bold py-3 rounded-xl hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
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