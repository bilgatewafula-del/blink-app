import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, Mail, Lock, User, Globe, ArrowLeft } from 'lucide-react';

const COUNTRIES = [
  {code:'KE',name:'Kenya 🇰🇪'},{code:'NG',name:'Nigeria 🇳🇬'},{code:'GH',name:'Ghana 🇬🇭'},
  {code:'UG',name:'Uganda 🇺🇬'},{code:'TZ',name:'Tanzania 🇹🇿'},{code:'ZA',name:'South Africa 🇿🇦'},
  {code:'ET',name:'Ethiopia 🇪🇹'},{code:'RW',name:'Rwanda 🇷🇼'},{code:'GB',name:'UK 🇬🇧'},
  {code:'US',name:'USA 🇺🇸'},{code:'CA',name:'Canada 🇨🇦'},{code:'OTHER',name:'Other 🌍'},
];

const RESERVED = ['admin','administrator','ceo','owner','superadmin','support','system',
  'blink','blinksupport','blinkofficial','moderator','mod','root','staff','team'];

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

  const validateStep1 = () => {
    if (!email.trim())                     return 'Enter your email.';
    if (!/\S+@\S+\.\S+/.test(email))       return 'Enter a valid email.';
    if (password.length < 8)               return 'Password must be at least 8 characters.';
    if (password !== confirm)              return 'Passwords do not match.';
    return null;
  };

  const validateStep2 = () => {
    if (!displayName.trim())               return 'Enter your display name.';
    if (!username.trim())                  return 'Choose a username.';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return 'Username: 3-20 chars, letters/numbers/underscores only.';
    if (RESERVED.includes(username.toLowerCase())) return 'That username is reserved.';
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

    // Check username
    const { data: existing } = await supabase.from('users')
      .select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
    if (existing) { setError('Username taken. Choose another.'); setBusy(false); return; }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim(), username: username.trim().toLowerCase() } },
    });

    if (authErr) { setError(authErr.message); setBusy(false); return; }

    const uid = authData?.user?.id;
    if (uid) {
      await supabase.from('users').upsert({
        id: uid, email: email.trim().toLowerCase(),
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        country, role: 'user',
        is_banned: false, is_restricted: false,
        followers_count: 0, posts_count: 0,
      }, { onConflict: 'id' });
    }

    // Auth state change will redirect automatically
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={() => step === 2 ? setStep(1) : navigate('/login')}
          className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-white font-bold text-[15px] leading-none">
            {step === 1 ? 'Create Account' : 'Your Profile'}
          </p>
          <p className="text-[#6B7280] text-xs mt-0.5">Step {step} of 2</p>
        </div>
        {/* Step dots */}
        <div className="flex gap-1.5 ml-auto">
          {[1,2].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#1E6FFF]' : 'bg-white/15'}`}
              style={{ width: s === step ? 20 : 8 }} />
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center pt-4 pb-6 px-6">
        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 mb-3">
          <span className="text-white font-black text-2xl">B</span>
        </div>
        <h2 className="text-white font-black text-2xl">
          {step === 1 ? 'Join B-Link' : 'Who are you?'}
        </h2>
        <p className="text-white/40 text-sm text-center mt-1">
          {step === 1 ? 'Free forever. No credit card needed.' : 'How should the community know you?'}
        </p>
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="flex flex-col gap-3 px-5">
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="Email address" autoComplete="email" inputMode="email"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Password (min 8 chars)" autoComplete="new-password"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="Confirm password" autoComplete="new-password"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

          <button onClick={handleNext}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] active:scale-[0.98] transition-all mt-1"
            style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}>
            Continue →
          </button>

          <p className="text-center text-[#6B7280] text-sm mt-2">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-[#1E6FFF] font-bold">Sign In</button>
          </p>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <form onSubmit={handleSignUp} className="flex flex-col gap-3 px-5">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            <input type="text" value={displayName} onChange={e => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Display name" maxLength={40} autoComplete="name"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] font-bold text-[15px] pointer-events-none">@</span>
            <input type="text" value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')); setError(''); }}
              placeholder="username" maxLength={20} autoComplete="username"
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-9 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
          </div>
          <p className="text-[#6B7280] text-[11px] -mt-1 pl-1">Letters, numbers and _ only · 3-20 chars</p>

          <div className="relative">
            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none z-10" />
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] focus:outline-none focus:border-[#1E6FFF]/60 appearance-none transition-all"
              style={{ WebkitAppearance:'none' }}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} style={{ background:'#0d1f3c' }}>{c.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
            style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}>
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