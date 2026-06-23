import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, ArrowLeft, Mail, Lock } from 'lucide-react';

export default function Login() {
  const navigate          = useNavigate();
  const { user, loading } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [visible,  setVisible]  = useState(false);

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
    setTimeout(() => setVisible(true), 80);
  }, [user, loading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    setBusy(true); setError('');

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authErr) {
      setError(
        authErr.message.includes('Invalid login')
          ? 'Wrong email or password. Please try again.'
          : authErr.message
      );
      setBusy(false);
      return;
    }

    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col px-5">

      {/* Back */}
      <button
        onClick={() => navigate('/welcome')}
        className="mt-4 self-start flex items-center gap-2 text-[#6B7280] hover:text-white transition-colors py-2"
      >
        <ArrowLeft size={20} />
      </button>

      {/* Header */}
      <div
        className="flex flex-col items-center mt-6 mb-8 transition-all duration-500"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
      >
        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 mb-4">
          <span className="text-white font-black text-2xl">B</span>
        </div>
        <h1 className="text-white font-black text-3xl mb-1">Welcome back</h1>
        <p className="text-white/50 text-sm">Sign in to continue to B-Link</p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleLogin}
        className="flex flex-col gap-3 w-full max-w-sm mx-auto transition-all duration-500 delay-100"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
      >
        {/* Email */}
        <div className="relative">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="Email address"
            autoComplete="email"
            className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
          />
        </div>

        {/* Password */}
        <div className="relative">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white transition-colors"
          >
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {/* Forgot */}
        <div className="text-right -mt-1">
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="text-[#1E6FFF] text-sm font-semibold"
          >
            Forgot password?
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-4 rounded-2xl font-bold text-white text-base mt-1 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #1E6FFF 0%, #7B2FFF 100%)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}
        >
          {busy
            ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in...</>
            : 'Sign In'
          }
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/30 text-xs">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Sign up link */}
        <p className="text-center text-[#6B7280] text-sm">
          Don't have an account?{' '}
          <Link to="/signup" className="text-[#1E6FFF] font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </form>
    </div>
  );
}