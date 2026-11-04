import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Mail, Lock, User, Globe, ArrowLeft, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import { validateUsername, validateDisplayName } from '../../utils/usernameValidation';

const COUNTRIES = [
  {code:'KE',name:'Kenya 🇰🇪'},{code:'NG',name:'Nigeria 🇳🇬'},{code:'GH',name:'Ghana 🇬🇭'},
  {code:'UG',name:'Uganda 🇺🇬'},{code:'TZ',name:'Tanzania 🇹🇿'},{code:'ZA',name:'South Africa 🇿🇦'},
  {code:'ET',name:'Ethiopia 🇪🇹'},{code:'RW',name:'Rwanda 🇷🇼'},{code:'GB',name:'UK 🇬🇧'},
  {code:'US',name:'USA 🇺🇸'},{code:'CA',name:'Canada 🇨🇦'},{code:'OTHER',name:'Other 🌍'},
];

// Signup-specific error sanitization. Reuses the spirit of
// securityUtils.js's sanitiseAuthError but covers the messages that
// are actually reachable during sign-up (Login's version is tuned for
// sign-in failures and doesn't handle "already registered" — the
// original code showed authErr.message directly here, which for
// Supabase's default signUp behavior confirms whether an email is
// already in use, the same F11 enumeration issue fixed in Login.jsx).
function sanitiseSignupError(error) {
  if (!error) return null;
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
    return 'Something went wrong creating your account. If you already have an account, try signing in instead.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }
  if (msg.includes('password')) {
    return error.message; // password-strength feedback is safe and useful to show as-is
  }
  return 'Something went wrong. Please try again.';
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SignUp() {
  const navigate = useNavigate();
  const [step,        setStep]        = useState(1);
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [country,     setCountry]     = useState('KE');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken'

  const debouncedUsername = useDebouncedValue(username, 450);

  // Live availability check as the user types — previously this only
  // happened once, on final submit, after filling the whole form.
  useEffect(() => {
    const clean = debouncedUsername.trim().toLowerCase();
    if (clean.length < 3 || validateUsername(clean)) { setUsernameStatus(null); return; }

    let cancelled = false;
    setUsernameStatus('checking');
    supabase.from('users').select('id').eq('username', clean).maybeSingle()
      .then(({ data }) => { if (!cancelled) setUsernameStatus(data ? 'taken' : 'available'); });
    return () => { cancelled = true; };
  }, [debouncedUsername]);

  const validateStep1 = () => {
    if (!email.trim())                     return 'Enter your email.';
    if (!/\S+@\S+\.\S+/.test(email))       return 'Enter a valid email.';
    if (password.length < 8)               return 'Password must be at least 8 characters.';
    if (password !== confirm)              return 'Passwords do not match.';
    return null;
  };

  const validateStep2 = () => {
    const nameErr = validateDisplayName(displayName);
    if (nameErr) return nameErr;
    const userErr = validateUsername(username);
    if (userErr) return userErr;
    if (usernameStatus === 'taken') return 'Username taken. Choose another.';
    return null;
  };

  const handleNext = () => {
    const err = validateStep1(); if (err) { setError(err); return; }
    setError(''); setStep(2);
  };

  const handleSignUp = async (e) => {
    e?.preventDefault();
    const err = validateStep2(); if (err) { setError(err); return; }
    setBusy(true); setError('');

    // Final authoritative check right before submit — the live
    // indicator above is a UX nicety, this is the actual gate. Still
    // has the same TOCTOU race a concurrent signup could hit; the
    // real guarantee needs a UNIQUE constraint on users.username at
    // the database level (see 09_EditProfile_notes.md, same issue,
    // same fix — add it once and it covers both signup and profile
    // edits).
    const cleanUsername = username.trim().toLowerCase();
    const { data: existing } = await supabase.from('users')
      .select('id').eq('username', cleanUsername).maybeSingle();
    if (existing) { setError('Username taken. Choose another.'); setBusy(false); return; }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: displayName.trim(),
          username: cleanUsername,
          country, // included so a DB-side auto-provisioning trigger
                   // (see SQL notes) can persist it even if the
                   // client-side upsert below never runs
        },
      },
    });

    if (authErr) { setError(sanitiseSignupError(authErr)); setBusy(false); return; }

    const uid = authData?.user?.id;
    if (uid) {
      // Was: fire-and-forget, result never checked. If this failed —
      // network drop right after signUp resolved, RLS misconfig,
      // whatever — the person ended up with a working login and NO
      // row in public.users at all, silently soft-locked out of the
      // app with no visible error. Now surfaced clearly, and a DB
      // trigger (see SQL notes) provides a safety net that creates a
      // minimal profile row regardless of whether this call runs.
      const { error: profileErr } = await supabase.from('users').upsert({
        id: uid, email: email.trim().toLowerCase(),
        display_name: displayName.trim(),
        username: cleanUsername,
        country, role: 'user',
        is_banned: false, is_restricted: false,
        followers_count: 0, posts_count: 0,
      }, { onConflict: 'id' });

      if (profileErr) {
        console.error('Profile creation error:', profileErr.message);
        setError('Your account was created, but we couldn\u2019t finish setting up your profile. Please try signing in — if this keeps happening, contact support.');
        setBusy(false);
        return;
      }
    }

    setBusy(false);
    // Auth state change will redirect automatically
  };

  return (
    <div className="min-h-screen bg-[#0D0C0B] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>

      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={() => step === 2 ? setStep(1) : navigate('/login')}
          aria-label="Back"
          className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-[#8E8C88] hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold text-[15px] leading-none">
            {step === 1 ? 'Create Account' : 'Your Profile'}
          </p>
          <p className="text-[#8E8C88] text-xs mt-0.5">Step {step} of 2</p>
        </div>
        <div className="flex gap-1.5 ml-auto">
          {[1,2].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#FF5A1F]' : 'bg-white/15'}`}
              style={{ width: s === step ? 20 : 8 }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center pt-4 pb-6 px-6">
        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center shadow-xl shadow-[#FF5A1F]/40 mb-3">
          <span className="text-white font-black text-2xl">B</span>
        </div>
        <h2 className="text-white font-black text-2xl">
          {step === 1 ? 'Join B-Link' : 'Who are you?'}
        </h2>
        <p className="text-white/40 text-sm text-center mt-1">
          {step === 1 ? 'Free forever. No credit card needed.' : 'How should the community know you?'}
        </p>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3 px-5">
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="Email address" autoComplete="email" inputMode="email"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all" />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Password (min 8 chars)" autoComplete="new-password"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all" />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8C88] hover:text-white">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="Confirm password" autoComplete="new-password"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all" />
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

          <button onClick={handleNext}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] active:scale-[0.98] transition-all mt-1"
            style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
            Continue →
          </button>

          <p className="text-center text-[#8E8C88] text-sm mt-2">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-[#FF5A1F] font-bold">Sign In</button>
          </p>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSignUp} className="flex flex-col gap-3 px-5">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type="text" value={displayName} onChange={e => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Display name" maxLength={40} autoComplete="name"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all" />
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] font-bold text-[15px] pointer-events-none">@</span>
            <input type="text" value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')); setError(''); }}
              placeholder="username" maxLength={20} autoComplete="username"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-9 pr-10 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all" />
            {usernameStatus === 'checking' && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            )}
            {usernameStatus === 'available' && (
              <CheckCircle size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#2ECC71]" />
            )}
            {usernameStatus === 'taken' && (
              <XCircle size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400" />
            )}
          </div>
          <p className={`text-[11px] -mt-1 pl-1 ${usernameStatus === 'taken' ? 'text-red-400' : usernameStatus === 'available' ? 'text-[#2ECC71]' : 'text-[#8E8C88]'}`}>
            {usernameStatus === 'taken' ? 'That username is already taken' :
             usernameStatus === 'available' ? 'Username is available' :
             'Letters, numbers and _ only · 3-20 chars'}
          </p>

          <div className="relative">
            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none z-10" />
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-10 py-4 text-white text-[15px] focus:outline-none focus:border-[#FF5A1F]/60 appearance-none transition-all"
              style={{ WebkitAppearance:'none' }}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} style={{ background:'#171614' }}>{c.name}</option>
              ))}
            </select>
            {/* Was missing entirely — appearance-none removes the
                native arrow with nothing replacing it, so the field
                didn't visibly read as a dropdown at all. */}
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
            style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
            {busy
              ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account...</>
              : '🚀 Create My Account'
            }
          </button>

          <p className="text-center text-white/25 text-[11px] mt-1">
            By signing up you agree to our Terms & Privacy Policy.
          </p>
        </form>
      )}
    </div>
  );
}