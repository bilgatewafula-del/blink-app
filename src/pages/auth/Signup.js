import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Lock, Mail, User, Phone } from 'lucide-react';
import { COUNTRIES } from '../../utils/constants';

const Signup = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('email');
  const [form, setForm] = useState({
    display_name: '', username: '', email: '',
    phone: '', password: '', country: 'KE',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const validateCommon = () => {
    if (form.username.length < 3) { setError('Username must be at least 3 characters.'); return false; }
    if (!form.display_name.trim()) { setError('Enter your full name.'); return false; }
    return true;
  };

  const checkUsername = async () => {
    const { data } = await supabase
      .from('users').select('id').eq('username', form.username.toLowerCase()).single();
    if (data) { setError('Username already taken. Try another.'); return false; }
    return true;
  };

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    if (!validateCommon()) return;
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    if (!await checkUsername()) { setLoading(false); return; }

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          username: form.username.toLowerCase(),
          display_name: form.display_name,
          phone: form.phone,
          country: form.country,
        },
      },
    });

    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) { navigate('/'); return; }
    navigate('/verify-otp', { state: { email: form.email } });
  };

  const handlePhoneSendOtp = async (e) => {
    e.preventDefault();
    if (!validateCommon()) return;
    if (!form.phone.trim()) { setError('Enter your phone number.'); return; }
    setLoading(true);
    setError('');
    if (!await checkUsername()) { setLoading(false); return; }

    let phone = form.phone.trim();
    if (!phone.startsWith('+')) phone = '+254' + phone.replace(/^0/, '');

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        data: {
          username: form.username.toLowerCase(),
          display_name: form.display_name,
          country: form.country,
        },
      },
    });

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
      phone, token: otp, type: 'sms',
    });

    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) navigate('/');
  };

  const CommonFields = () => (
    <>
      <div>
        <label className="text-white/70 text-xs mb-1 block">Full name</label>
        <div className="relative">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input type="text" name="display_name" value={form.display_name} onChange={handleChange}
            placeholder="Your full name" required
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
        </div>
      </div>
      <div>
        <label className="text-white/70 text-xs mb-1 block">Username</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] text-sm">@</span>
          <input type="text" name="username" value={form.username} onChange={handleChange}
            placeholder="yourhandle" required
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
        </div>
      </div>
      <div>
        <label className="text-white/70 text-xs mb-1 block">Country</label>
        <select name="country" value={form.country} onChange={handleChange}
          className="w-full bg-[#0A1628] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] flex">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#7B2FFF]/20 flex-col justify-between p-12 border-r border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg">B</div>
          <span className="text-white font-bold text-xl">B-Link</span>
        </div>
        <div>
          <h1 className="text-white text-4xl font-bold leading-tight mb-4">
            Join Africa's<br />fastest growing<br />
            <span className="text-[#7B2FFF]">community</span>
          </h1>
          <p className="text-[#6B7280] mb-8">Connect with millions of Africans and the global diaspora.</p>
          <div className="space-y-3">
            {['✅ Free to join — always', '✅ No ads sold on your data',
              '✅ M-Pesa tipping for creators', '✅ Low data mode built-in',
              '✅ Your language, your culture'].map((item, i) => (
              <p key={i} className="text-white/80 text-sm">{item}</p>
            ))}
          </div>
        </div>
        <p className="text-[#6B7280] text-xs">🔐 Your data stays yours. Always.</p>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm py-6">
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xl">B</div>
            <span className="text-white font-bold text-2xl">B-Link</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-white text-2xl font-bold mb-1">Create account</h2>
            <p className="text-[#6B7280] text-sm mb-4">Join B-Link today — it's free</p>

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

            {/* Email signup */}
            {mode === 'email' && (
              <form onSubmit={handleEmailSignup} className="space-y-4">
                <CommonFields />
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Email address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input type="email" name="email" value={form.email} onChange={handleChange}
                      placeholder="you@example.com" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Phone (optional)</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input type="tel" name="phone" value={form.phone} onChange={handleChange}
                      placeholder="+254 7XX XXX XXX"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input type={showPassword ? 'text' : 'password'} name="password"
                      value={form.password} onChange={handleChange}
                      placeholder="Min. 6 characters" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <p className="text-[#6B7280] text-xs text-center">
                  By signing up you agree to our{' '}
                  <span className="text-[#1E6FFF] cursor-pointer">Terms</span> &{' '}
                  <span className="text-[#1E6FFF] cursor-pointer">Privacy Policy</span>
                </p>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
            )}

            {/* Phone signup — step 1 */}
            {mode === 'phone' && !otpSent && (
              <form onSubmit={handlePhoneSendOtp} className="space-y-4">
                <CommonFields />
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Phone number</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input type="tel" name="phone" value={form.phone} onChange={handleChange}
                      placeholder="+254 7XX XXX XXX" required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors" />
                  </div>
                  <p className="text-[#6B7280] text-xs mt-1">A verification code will be sent via SMS</p>
                </div>
                <p className="text-[#6B7280] text-xs text-center">
                  By signing up you agree to our{' '}
                  <span className="text-[#1E6FFF] cursor-pointer">Terms</span> &{' '}
                  <span className="text-[#1E6FFF] cursor-pointer">Privacy Policy</span>
                </p>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {loading ? 'Sending code...' : 'Send Verification Code'}
                </button>
              </form>
            )}

            {/* Phone signup — step 2 OTP */}
            {mode === 'phone' && otpSent && (
              <form onSubmit={handlePhoneVerifyOtp} className="space-y-4">
                <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-xl p-3 text-center">
                  <p className="text-white font-semibold text-sm">📱 Code sent!</p>
                  <p className="text-[#6B7280] text-xs mt-1">Check SMS on {form.phone}</p>
                </div>
                <div>
                  <label className="text-white/70 text-xs mb-2 block text-center">Enter 6-digit code</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                    placeholder="000000" maxLength={6} required
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] text-center text-2xl tracking-widest font-bold" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {loading ? 'Verifying...' : 'Verify & Create Account'}
                </button>
                <button type="button" onClick={() => setOtpSent(false)}
                  className="w-full text-[#6B7280] text-sm hover:text-white transition-colors">
                  ← Change phone number
                </button>
              </form>
            )}

            <p className="text-center text-[#6B7280] text-sm mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-[#1E6FFF] font-semibold hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;