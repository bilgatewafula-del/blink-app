import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('email'); // email | phone
  const [form, setForm] = useState({ email: '', phone: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    if (error) {
      setError(
        error.message.includes('Invalid login credentials')
          ? 'Wrong email or password. Please try again.'
          : error.message.includes('Email not confirmed')
          ? 'Email not confirmed. Please check your inbox.'
          : error.message
      );
      setLoading(false);
      return;
    }
    if (data.session) navigate('/');
  };

  const handlePhoneSendOtp = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) { setError('Enter your phone number.'); return; }
    setLoading(true);
    setError('');
    let phone = form.phone.trim();
    if (!phone.startsWith('+')) phone = '+254' + phone.replace(/^0/, '');
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) { setError(error.message); setLoading(false); return; }
    setOtpSent(true);
    setLoading(false);
  };

  const handlePhoneVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    let phone = form.phone.trim();
    if (!phone.startsWith('+')) phone = '+254' + phone.replace(/^0/, '');
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#1E6FFF]/20 flex-col justify-between p-12 border-r border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">B</div>
          <span className="text-white font-bold text-xl">B-Link</span>
        </div>
        <div>
          <h1 className="text-white text-4xl font-bold leading-tight mb-4">
            Africa's Social<br />Platform for<br />
            <span className="text-[#1E6FFF]">GenZ</span>
          </h1>
          <p className="text-[#6B7280] mb-8">Built from the ground up for African connectivity, cultures and communities.</p>
          <div className="space-y-4">
            {[
              { icon: '🔒', text: 'Privacy-first platform' },
              { icon: '📶', text: 'Low data consumption' },
              { icon: '🌍', text: 'African community focus' },
              { icon: '💰', text: 'Creator earnings built-in' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-white/80 text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[#6B7280] text-xs">🔐 Your data stays yours. Always.</p>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xl">B</div>
            <span className="text-white font-bold text-2xl">B-Link</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-white text-2xl font-bold mb-1">Welcome back</h2>
            <p className="text-[#6B7280] text-sm mb-4">Sign in to your B-Link account</p>

            {/* Mode toggle */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
              <button
                onClick={() => { setMode('email'); setOtpSent(false); setError(''); }}
                className={
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ' +
                  (mode === 'email' ? 'bg-[#1E6FFF] text-white' : 'text-[#6B7280]')
                }
              >
                <Mail size={13} /> Email
              </button>
              <button
                onClick={() => { setMode('phone'); setOtpSent(false); setError(''); }}
                className={
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ' +
                  (mode === 'phone' ? 'bg-[#1E6FFF] text-white' : 'text-[#6B7280]')
                }
              >
                <Phone size={13} /> Phone
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Email login */}
            {mode === 'email' && (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Email address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      type="email" name="email" value={form.email}
                      onChange={handleChange} placeholder="you@example.com" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      type={showPassword ? 'text' : 'password'} name="password"
                      value={form.password} onChange={handleChange}
                      placeholder="Enter your password" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Link to="/forgot-password" className="text-[#1E6FFF] text-xs hover:underline">Forgot password?</Link>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* Phone login */}
            {mode === 'phone' && !otpSent && (
              <form onSubmit={handlePhoneSendOtp} className="space-y-4">
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Phone number</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      type="tel" name="phone" value={form.phone}
                      onChange={handleChange} placeholder="+254 7XX XXX XXX" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                    />
                  </div>
                  <p className="text-[#6B7280] text-xs mt-1">We'll send you a verification code via SMS</p>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                  {loading ? 'Sending code...' : 'Send Verification Code'}
                </button>
              </form>
            )}

            {/* Phone OTP verify */}
            {mode === 'phone' && otpSent && (
              <form onSubmit={handlePhoneVerifyOtp} className="space-y-4">
                <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-xl p-3">
                  <p className="text-[#1E6FFF] text-xs font-semibold">Code sent to {form.phone}</p>
                </div>
                <div>
                  <label className="text-white/70 text-xs mb-1 block">6-digit verification code</label>
                  <input
                    type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter code" maxLength={6} required
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] text-center text-xl tracking-widest"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
                <button type="button" onClick={() => setOtpSent(false)}
                  className="w-full text-[#6B7280] text-sm hover:text-white transition-colors">
                  ← Change phone number
                </button>
              </form>
            )}

            <p className="text-center text-[#6B7280] text-sm mt-6">
              Don't have an account?{' '}
              <Link to="/signup" className="text-[#1E6FFF] font-semibold hover:underline">Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;