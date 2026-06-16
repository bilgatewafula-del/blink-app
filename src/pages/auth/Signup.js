import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Lock, Mail, User, Phone } from 'lucide-react';
import { COUNTRIES } from '../../utils/constants';

export default function Signup() {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername]       = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [country, setCountry]         = useState('KE');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // Stable handlers — useCallback prevents recreation on every render
  const handleDisplayName = useCallback((e) => setDisplayName(e.target.value), []);
  const handleUsername    = useCallback((e) => setUsername(e.target.value), []);
  const handleEmail       = useCallback((e) => setEmail(e.target.value), []);
  const handlePhone       = useCallback((e) => setPhone(e.target.value), []);
  const handleCountry     = useCallback((e) => setCountry(e.target.value), []);
  const handlePassword    = useCallback((e) => setPassword(e.target.value), []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from('users').select('id').eq('username', username.toLowerCase()).maybeSingle();
    if (existing) {
      setError('Username already taken. Try another one.');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          display_name: displayName,
          phone,
          country,
        },
      },
    });

    if (signUpError) {
      if (signUpError.message?.includes('rate limit') || signUpError.status === 429) {
        setError('Too many attempts. Please use phone signup or wait 1 hour and try again.');
      } else if (signUpError.message?.includes('already registered')) {
        setError('This email is already registered. Try signing in.');
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    if (data.session) { navigate('/'); return; }
    navigate('/verify-otp', { state: { email } });
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex">
      {/* Left panel — desktop only */}
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
            {['✅ Free to join — always','✅ No ads sold on your data','✅ M-Pesa tipping for creators','✅ Low data mode built-in','✅ Your language, your culture'].map((item, i) => (
              <p key={i} className="text-white/80 text-sm">{item}</p>
            ))}
          </div>
        </div>
        <p className="text-[#6B7280] text-xs">🔐 Your data stays yours. Always.</p>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm py-6">
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xl">B</div>
            <span className="text-white font-bold text-2xl">B-Link</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-white text-2xl font-bold mb-1">Create account</h2>
            <p className="text-[#6B7280] text-sm mb-5">Join B-Link today — it's free</p>

            {/* Error — always rendered, never shifts layout */}
            <div style={{ minHeight: '0px', marginBottom: error ? '16px' : '0px', transition: 'margin 0.2s' }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>

            <form onSubmit={handleSignup} className="space-y-4" autoComplete="off">
              {/* Display Name */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Full name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type="text"
                    name="display_name_blink"
                    value={displayName}
                    onChange={handleDisplayName}
                    placeholder="Your full name"
                    required
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] text-sm">@</span>
                  <input
                    type="text"
                    name="username_blink"
                    value={username}
                    onChange={handleUsername}
                    placeholder="yourhandle"
                    required
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Email address</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type="email"
                    name="email_blink"
                    value={email}
                    onChange={handleEmail}
                    placeholder="you@example.com"
                    required
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Phone number <span className="text-[#2ECC71] text-[10px] font-bold">Recommended</span></label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type="tel"
                    name="phone_blink"
                    value={phone}
                    onChange={handlePhone}
                    placeholder="+254 7XX XXX XXX"
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                </div>
              </div>

              {/* Country */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Country</label>
                <select
                  name="country_blink"
                  value={country}
                  onChange={handleCountry}
                  className="w-full bg-[#0A1628] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="text-white/70 text-xs mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password_blink"
                    value={password}
                    onChange={handlePassword}
                    placeholder="Min. 6 characters"
                    required
                    autoComplete="new-password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white transition-colors">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <p className="text-[#6B7280] text-xs text-center">
                By signing up you agree to our{' '}
                <span className="text-[#1E6FFF] cursor-pointer">Terms</span> &{' '}
                <span className="text-[#1E6FFF] cursor-pointer">Privacy Policy</span>
              </p>

              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <p className="text-center text-[#6B7280] text-sm mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-[#1E6FFF] font-semibold hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}