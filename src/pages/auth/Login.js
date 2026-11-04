import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { sanitiseAuthError } from '../../utils/securityUtils';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, Wifi, WifiOff } from 'lucide-react';

export default function Login() {
  const navigate          = useNavigate();
  const { user, loading } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [tab,      setTab]      = useState('login'); // login | signup

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) { setError('Fill in all fields.'); return; }
    setBusy(true); setError('');

    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });

    if (err) {
      // F11 fix: was `err.message.includes('Invalid') ? '...' : err.message`
      // — the else-branch leaked raw Supabase error text (e.g. "Email
      // not confirmed"), which tells an attacker the email exists.
      // sanitiseAuthError() (already in securityUtils.js, just unused
      // here before) returns one generic message for every case that
      // would otherwise reveal account existence.
      setError(sanitiseAuthError(err));
      setBusy(false);
    }
    // on success, onAuthStateChange fires → user set → useEffect navigates
  };

  const handleForgot = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + '/login',
    });
    setBusy(false);
    // Always show the same success message regardless of whether the
    // email exists — resetPasswordForEmail itself doesn't reveal
    // existence, but a raw `err.message` here still could.
    if (err) setError(sanitiseAuthError(err));
    else setError('✅ If an account exists for ' + email + ', a reset link has been sent.');
  };

  return (
    <div className="min-h-screen bg-[#0D0C0B] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>

      <div className="flex flex-col items-center pt-14 pb-8 px-6">
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center shadow-2xl shadow-[#FF5A1F]/40 mb-5">
          <span className="text-white font-black text-3xl">B</span>
        </div>
        <h1 className="text-white font-black text-[28px] tracking-tight mb-1">B-Link</h1>
        <p className="text-white/40 text-sm text-center">Africa's GenZ Social Platform</p>
      </div>

      <div className="flex mx-5 mb-6 bg-white/[0.06] rounded-2xl p-1">
        <button
          onClick={() => { setTab('login');  setError(''); }}
          className={'flex-1 py-3 rounded-xl text-sm font-bold transition-all ' +
            (tab === 'login' ? 'bg-[#FF5A1F] text-white shadow-lg shadow-[#FF5A1F]/40' : 'text-white/50')}
        >Sign In</button>
        <button
          onClick={() => navigate('/signup')}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white/50 transition-all"
        >Create Account</button>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-3 px-5">

        <div className="relative">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="Email address"
            autoComplete="email"
            inputMode="email"
            className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all"
          />
        </div>

        <div className="relative">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all"
          />
          <button type="button" tabIndex={-1}
            onClick={() => setShowPass(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8C88] hover:text-white transition-colors">
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="flex justify-end -mt-1">
          <button type="button" onClick={handleForgot}
            className="text-[#FF5A1F] text-sm font-semibold">
            Forgot password?
          </button>
        </div>

        {error && (
          <div className={`rounded-xl px-4 py-3 text-sm ${error.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}
        >
          {busy
            ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in...</>
            : 'Sign In'
          }
        </button>
      </form>

      <div className="flex items-center gap-3 px-5 my-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/25 text-xs font-semibold">NEW HERE?</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <div className="px-5">
        <button
          onClick={() => navigate('/signup')}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all"
        >
          Create Free Account
        </button>
      </div>

      <div className="mt-auto pb-10 px-5 text-center">
        <p className="text-white/20 text-xs">Made with ❤️ for Africa</p>
      </div>
    </div>
  );
}