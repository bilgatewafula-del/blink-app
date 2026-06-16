import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode]               = useState('email'); // email | phone
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [password, setPassword]       = useState('');
  const [otp, setOtp]                 = useState('');
  const [otpSent, setOtpSent]         = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // Stable handlers
  const handleEmail    = useCallback((e) => setEmail(e.target.value), []);
  const handlePhone    = useCallback((e) => setPhone(e.target.value), []);
  const handlePassword = useCallback((e) => setPassword(e.target.value), []);
  const handleOtp      = useCallback((e) => setOtp(e.target.value), []);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    navigate('/');
  };

  const handlePhoneSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    if (err) { setError(err.message); setLoading(false); return; }
    setOtpSent(true);
    setLoading(false);
  };

  const handlePhoneVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (err) { setError(err.message); setLoading(false); return; }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-[#1E6FFF]/30">B</div>
          <span className="text-white font-bold text-2xl">B-Link</span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-white text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-[#6B7280] text-sm mb-5">Sign in to your B-Link account</p>

          {/* Error */}
          <div style={{ minHeight: '0px', marginBottom: error ? '16px' : '0px', transition: 'margin 0.2s' }}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
            <button onClick={() => { setMode('phone'); setOtpSent(false); setError(''); }}
              className={'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ' + (mode === 'phone' ? 'bg-[#1E6FFF] text-white' : 'text-[#6B7280]')}>
              <Phone size={13} /> Phone <span className="bg-[#2ECC71] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">Recommended</span>
            </button>
            <button onClick={() => { setMode('email'); setOtpSent(false); setError(''); }}
              className={'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ' + (mode === 'email' ? 'bg-[#1E6FFF] text-white' : 'text-[#6B7280]')}>
              <Mail size={13} /> Email
            </button>
          </div>

          {/* Email form */}
          {mode === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4" autoComplete="off">
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Email address</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type="email"
                    value={email}
                    onChange={handleEmail}
                    placeholder="you@example.com"
                    required
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePassword}
                    placeholder="Your password"
                    required
                    autoComplete="current-password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-[#1E6FFF] text-xs hover:underline">Forgot password?</Link>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Phone form */}
          {mode === 'phone' && !otpSent && (
            <form onSubmit={handlePhoneSendOtp} className="space-y-4" autoComplete="off">
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Phone number</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhone}
                    placeholder="+254 7XX XXX XXX"
                    required
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          )}

          {/* OTP verify */}
          {mode === 'phone' && otpSent && (
            <form onSubmit={handlePhoneVerifyOtp} className="space-y-4" autoComplete="off">
              <p className="text-[#6B7280] text-sm text-center">OTP sent to {phone}</p>
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Enter OTP</label>
                <input
                  type="number"
                  value={otp}
                  onChange={handleOtp}
                  placeholder="6-digit code"
                  required
                  autoComplete="off"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] text-center text-xl tracking-widest transition-colors"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} className="w-full text-[#6B7280] text-sm hover:text-white transition-colors">
                ← Change number
              </button>
            </form>
          )}

          <p className="text-center text-[#6B7280] text-sm mt-5">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#1E6FFF] font-semibold hover:underline">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}