import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Globe } from 'lucide-react';

const COUNTRIES = [
  { code:'KE', name:'Kenya',        flag:'🇰🇪' },
  { code:'NG', name:'Nigeria',      flag:'🇳🇬' },
  { code:'GH', name:'Ghana',        flag:'🇬🇭' },
  { code:'UG', name:'Uganda',       flag:'🇺🇬' },
  { code:'TZ', name:'Tanzania',     flag:'🇹🇿' },
  { code:'ZA', name:'South Africa', flag:'🇿🇦' },
  { code:'ET', name:'Ethiopia',     flag:'🇪🇹' },
  { code:'RW', name:'Rwanda',       flag:'🇷🇼' },
  { code:'GB', name:'UK',           flag:'🇬🇧' },
  { code:'US', name:'USA',          flag:'🇺🇸' },
  { code:'CA', name:'Canada',       flag:'🇨🇦' },
  { code:'OTHER', name:'Other',     flag:'🌍' },
];

const RESERVED = ['admin','administrator','ceo','owner','superadmin','support','system','blink','blinksupport','blinkofficial','moderator','mod','root','staff','team'];

export default function SignUp() {
  const navigate          = useNavigate();
  const [step,        setStep]        = useState(1); // 1=credentials, 2=profile
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username,    setUsername]    = useState('');
  const [country,     setCountry]     = useState('KE');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [visible,     setVisible]     = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  const validateStep1 = () => {
    if (!email.trim())   return 'Enter your email.';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  };

  const validateStep2 = () => {
    if (!displayName.trim()) return 'Enter your display name.';
    if (!username.trim())    return 'Choose a username.';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return 'Username must be 3-20 characters: letters, numbers, underscores only.';
    if (RESERVED.includes(username.toLowerCase())) return 'That username is reserved. Please choose another.';
    return null;
  };

  const handleNext = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    setStep(2);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const err = validateStep2();
    if (err) { setError(err); return; }

    setBusy(true); setError('');

    // Check username taken
    const { data: existing } = await supabase.from('users')
      .select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
    if (existing) { setError('Username already taken. Choose another.'); setBusy(false); return; }

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: displayName.trim(),
          username:     username.trim().toLowerCase(),
        },
      },
    });

    if (authErr) { setError(authErr.message); setBusy(false); return; }

    // Create profile row
    const uid = authData?.user?.id;
    if (uid) {
      await supabase.from('users').upsert({
        id:           uid,
        email:        email.trim().toLowerCase(),
        display_name: displayName.trim(),
        username:     username.trim().toLowerCase(),
        country,
        role:         'user',
        is_banned:    false,
        is_restricted:false,
        followers_count: 0,
        posts_count:     0,
      }, { onConflict: 'id' });
    }

    setBusy(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col px-5 pb-10">

      {/* Back */}
      <button
        onClick={() => step === 2 ? setStep(1) : navigate('/welcome')}
        className="mt-4 self-start flex items-center gap-2 text-[#6B7280] hover:text-white transition-colors py-2"
      >
        <ArrowLeft size={20} />
        {step === 2 && <span className="text-sm">Back</span>}
      </button>

      {/* Header */}
      <div
        className="flex flex-col items-center mt-4 mb-6 transition-all duration-500"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
      >
        <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-xl shadow-[#1E6FFF]/40 mb-3">
          <span className="text-white font-black text-xl">B</span>
        </div>
        <h1 className="text-white font-black text-3xl mb-1">
          {step === 1 ? 'Create account' : 'Your profile'}
        </h1>
        <p className="text-white/50 text-sm text-center">
          {step === 1 ? 'Join millions of young Africans on B-Link' : 'How should people know you?'}
        </p>

        {/* Step indicators */}
        <div className="flex gap-2 mt-4">
          {[1, 2].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-8 bg-[#1E6FFF]' : s < step ? 'w-4 bg-[#1E6FFF]/60' : 'w-4 bg-white/20'}`} />
          ))}
        </div>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div
          className="flex flex-col gap-3 w-full max-w-sm mx-auto transition-all duration-500 delay-100"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)' }}
        >
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

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Password (min 8 characters)"
              autoComplete="new-password"
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-white transition-colors">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="Confirm password"
              autoComplete="new-password"
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleNext}
            className="w-full py-4 rounded-2xl font-bold text-white text-base mt-1 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}
          >
            Continue →
          </button>

          <p className="text-center text-[#6B7280] text-sm mt-2">
            Already have an account?{' '}
            <Link to="/login" className="text-[#1E6FFF] font-bold hover:underline">Sign In</Link>
          </p>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <form
          onSubmit={handleSignUp}
          className="flex flex-col gap-3 w-full max-w-sm mx-auto"
        >
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Display name"
              maxLength={40}
              autoComplete="name"
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
            />
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] font-bold text-base">@</span>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')); setError(''); }}
              placeholder="username"
              maxLength={20}
              autoComplete="username"
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-9 pr-4 py-4 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 focus:bg-white/[0.09] transition-all"
            />
          </div>
          <p className="text-[#6B7280] text-[11px] -mt-1 pl-1">Letters, numbers and underscores only</p>

          {/* Country */}
          <div className="relative">
            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]" />
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] focus:outline-none focus:border-[#1E6FFF]/60 appearance-none"
              style={{ WebkitAppearance: 'none' }}
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} style={{ background:'#0d1f3c' }}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 rounded-2xl font-bold text-white text-base mt-1 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #1E6FFF, #7B2FFF)', boxShadow: '0 8px 24px rgba(30,111,255,0.35)' }}
          >
            {busy
              ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account...</>
              : '🚀 Create My Account'
            }
          </button>

          <p className="text-center text-white/30 text-[11px] mt-1 px-2">
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
      )}
    </div>
  );
}