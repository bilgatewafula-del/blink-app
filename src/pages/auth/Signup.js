import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  Eye, EyeOff, Mail, Lock, User, Globe, ArrowLeft, ChevronDown, CheckCircle2, XCircle, Smartphone, AlertCircle,
} from 'lucide-react';
import { validateUsername, validateDisplayName } from '../../utils/usernameValidation';
import {
  PHONE_COUNTRIES, checkEmail, normalisePhone, checkPassword, friendlyAuthError, submitGuard, maskIdentifier,
} from '../../lib/authSecurity';
import Captcha, { captchaEnabled } from '../../components/auth/Captcha';
import VerifyCode from '../../components/auth/VerifyCode';
import { Spinner } from '../../components/ui';

// Phone sign-in is switched off for now (SMS costs money). The phone code below is kept on purpose:
// set this to true to show the Phone tab again.
const SHOW_PHONE_SIGNIN = false;

const COUNTRIES = [
  { code: 'KE', name: 'Kenya' }, { code: 'NG', name: 'Nigeria' }, { code: 'GH', name: 'Ghana' },
  { code: 'UG', name: 'Uganda' }, { code: 'TZ', name: 'Tanzania' }, { code: 'ZA', name: 'South Africa' },
  { code: 'ET', name: 'Ethiopia' }, { code: 'RW', name: 'Rwanda' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' }, { code: 'OTHER', name: 'Other' },
];

const inputCls = 'w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-11 pr-4 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60 transition-all';

function useDebounced(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

async function usernameIsFree(name) {
  const { data, error } = await supabase.rpc('username_available', { p_username: name });
  if (!error && typeof data === 'boolean') return data;
  // fallback if the database script has not been installed yet
  const { data: row } = await supabase.from('users').select('id').eq('username', name).maybeSingle();
  return !row;
}

export default function SignUp() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [step, setStep] = useState(1);                    // 1 account · 2 profile · 3 verify
  const [method, setMethod] = useState('email');          // email | phone
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('KE');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('KE');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [uStatus, setUStatus] = useState(null);           // null | checking | available | taken
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [pending, setPending] = useState(null);           // { kind, target, masked } waiting for the code
  const [ambiguous, setAmbiguous] = useState(false);
  const tokenRef = useRef('');
  tokenRef.current = captchaToken;

  const debouncedUsername = useDebounced(username, 450);
  const pwCheck = checkPassword(password);

  useEffect(() => { if (!loading && user) navigate('/', { replace: true }); }, [user, loading, navigate]);

  useEffect(() => {
    const clean = debouncedUsername.trim().toLowerCase();
    if (clean.length < 3 || validateUsername(clean)) { setUStatus(null); return undefined; }
    let cancelled = false;
    setUStatus('checking');
    usernameIsFree(clean).then((free) => { if (!cancelled) setUStatus(free ? 'available' : 'taken'); }).catch(() => { if (!cancelled) setUStatus(null); });
    return () => { cancelled = true; };
  }, [debouncedUsername]);

  const resetCaptcha = () => { setCaptchaToken(''); setCaptchaReset((n) => n + 1); };

  const identity = () => {
    if (method === 'email') {
      const c = checkEmail(email);
      return c.ok ? { ok: true, kind: 'email', value: c.email } : { ok: false, error: c.error, suggestion: c.suggestion };
    }
    const p = normalisePhone(phoneCountry, phone);
    return p.ok ? { ok: true, kind: 'phone', value: p.e164 } : { ok: false, error: p.error };
  };

  const handleNext = () => {
    const id = identity();
    if (!id.ok) { setError(id.error); setHint(id.suggestion || ''); return; }
    if (!pwCheck.ok) { setError(pwCheck.error); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError(''); setHint(''); setStep(2);
  };

  const finish = () => navigate('/', { replace: true });

  const handleSignUp = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const nameErr = validateDisplayName(displayName);
    if (nameErr) { setError(nameErr); return; }
    const userErr = validateUsername(username);
    if (userErr) { setError(userErr); return; }
    if (uStatus === 'taken') { setError('Username taken. Choose another.'); return; }
    const id = identity();
    if (!id.ok) { setError(id.error); setStep(1); return; }
    if (captchaEnabled && !tokenRef.current) { setError('Please complete the security check.'); return; }
    if (!submitGuard(2500)) return;

    setBusy(true); setError(''); setAmbiguous(false);
    const cleanUsername = username.trim().toLowerCase();

    // Last authoritative check (the live indicator is only a hint)
    try {
      if (!(await usernameIsFree(cleanUsername))) { setError('Username taken. Choose another.'); setBusy(false); return; }
    } catch { /* the database enforces uniqueness anyway */ }

    const meta = { display_name: displayName.trim(), username: cleanUsername, country };
    const options = { data: meta, ...(captchaEnabled ? { captchaToken: tokenRef.current } : {}) };
    let res;
    try {
      res = await supabase.auth.signUp(id.kind === 'email'
        ? { email: id.value, password, options: { ...options, emailRedirectTo: window.location.origin + '/login' } }
        : { phone: id.value, password, options: { ...options, channel: 'sms' } });
    } catch (err) { res = { error: err }; }
    if (captchaEnabled) resetCaptcha();

    if (res.error) {
      const f = friendlyAuthError(res.error, 'signup');

      // Unclear failures (dropped connection, server hiccup): find out what really happened
      if (['network', 'server', 'other'].includes(f.kind)) {
        if (!captchaEnabled) {
          const probe = await supabase.auth.signInWithPassword(id.kind === 'email' ? { email: id.value, password } : { phone: id.value, password });
          if (probe.data?.session) { finish(); return; }                       // it WAS created and no verification needed
          const pk = probe.error ? friendlyAuthError(probe.error).kind : '';
          if (pk === 'unconfirmed_email' || pk === 'unconfirmed_phone') {      // created, waiting for the code
            setPending({ kind: id.kind, target: id.value }); setStep(3); setBusy(false); return;
          }
          if (pk === 'credentials') { setError('We could not create your account, and nothing was saved. Please try again.'); setBusy(false); return; }
        }
        setError(f.message);
        setAmbiguous(true);                                                    // offer "I already have a code"
        setBusy(false);
        return;
      }
      setError(f.message);
      setBusy(false);
      return;
    }

    if (res.data?.session) { finish(); return; }                               // verification switched off in Supabase
    setPending({ kind: id.kind, target: id.value });
    setStep(3);
    setBusy(false);
  };

  /* ── step 3: enter the code ── */
  const verifyHandler = (code) => supabase.auth.verifyOtp(
    pending.kind === 'email'
      ? { email: pending.target, token: code, type: 'signup' }
      : { phone: pending.target, token: code, type: 'sms' },
  );

  const resendHandler = async () => {
    if (captchaEnabled && !tokenRef.current) return { error: { code: 'captcha_failed' } };
    const options = captchaEnabled ? { captchaToken: tokenRef.current } : undefined;
    const res = await supabase.auth.resend(
      pending.kind === 'email' ? { type: 'signup', email: pending.target, options } : { type: 'sms', phone: pending.target, options },
    );
    if (captchaEnabled) resetCaptcha();
    return res;
  };

  if (step === 3 && pending) {
    return (
      <div className="min-h-screen bg-[#E6E9F6]" style={{ maxWidth: 480, margin: '0 auto' }}>
        <VerifyCode
          kind={pending.kind}
          target={pending.kind === 'email' ? maskIdentifier(pending.target) : pending.target}
          hint="We sent a 6-digit code to"
          onVerify={verifyHandler}
          onResend={resendHandler}
          onBack={() => { setStep(2); setPending(null); resetCaptcha(); }}
          backLabel="Change details"
        />
        {captchaEnabled && <div className="px-6"><Captcha onToken={setCaptchaToken} resetKey={captchaReset} /></div>}
        <p className="text-center text-[#64748B] text-sm pb-10">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-[#6D28D9] font-bold">Sign in</button>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-4 bg-[#11152E] rounded-b-[24px]" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={() => (step === 2 ? setStep(1) : navigate('/login'))} aria-label="Back"
          className="w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div>
          <p className="text-white font-bold text-[17px] leading-none">{step === 1 ? 'Create account' : 'Your profile'}</p>
          <p className="text-[#C4B5FD] text-xs mt-1">Step {step} of 2</p>
        </div>
        <div className="flex gap-1.5 ml-auto">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#A78BFA]' : 'bg-white/25'}`} style={{ width: s === step ? 20 : 8 }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center pt-4 pb-5 px-6">
        <div className="w-16 h-16 rounded-[20px] bg-[#7C3AED] flex items-center justify-center   mb-3">
          <span className="text-[#111827] font-black text-2xl">B</span>
        </div>
        <h2 className="text-[#111827] font-black text-2xl">{step === 1 ? 'Join B-Link' : 'Who are you?'}</h2>
        <p className="text-[#94A3B8] text-sm text-center mt-1">{step === 1 ? 'Free forever. No credit card needed.' : 'How should the community know you?'}</p>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3 px-5">
          {SHOW_PHONE_SIGNIN && (
          <div className="flex bg-[#F1F5F9] rounded-2xl p-1">
            {[['email', 'Email', Mail], ['phone', 'Phone', Smartphone]].map(([key, label, Icon]) => (
              <button key={key} onClick={() => { setMethod(key); setError(''); setHint(''); }}
                className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2 ' +
                  (method === key ? 'bg-[#7C3AED] text-white' : 'text-[#64748B]')}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          )}

          {method === 'email' ? (
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); setHint(''); }}
                placeholder="Email address" autoComplete="email" inputMode="email" autoCapitalize="none" className={inputCls} />
            </div>
          ) : (
            <div className="flex gap-2">
              <select value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)} aria-label="Country code"
                className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-3 py-4 text-[#111827] text-[14px] focus:outline-none focus:border-[#7C3AED]/60"
                style={{ WebkitAppearance: 'none', width: 104 }}>
                {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#FFFFFF' }}>{c.code} +{c.dial}</option>)}
              </select>
              <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }}
                placeholder="712 345 678" autoComplete="tel-national" inputMode="tel"
                className="flex-1 min-w-0 bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60" />
            </div>
          )}
          {hint && (
            <button onClick={() => { setEmail(hint); setError(''); setHint(''); }} className="text-left text-[13px] text-[#6D28D9] font-semibold -mt-1">
              Use {hint}
            </button>
          )}

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password (8+ characters)" autoComplete="new-password" className={inputCls + ' pr-12'} />
            <button type="button" tabIndex={-1} onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#111827]">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {password && (
            <div className="-mt-1 px-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-1 flex-1 rounded-full"
                    style={{ background: i <= pwCheck.score ? (pwCheck.score >= 3 ? '#10B981' : '#FFB020') : '#F1F5F9' }} />
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: pwCheck.ok ? '#64748B' : '#FF8A5C' }}>
                {pwCheck.ok ? (pwCheck.score >= 3 ? 'Strong password' : 'Good. Longer is stronger.') : pwCheck.error}
              </p>
            </div>
          )}

          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              placeholder="Confirm password" autoComplete="new-password" className={inputCls} />
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>}

          <button onClick={handleNext}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] active:scale-[0.98] transition-all mt-1"
            style={{ background: '#7C3AED', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}>
            Continue
          </button>
          <p className="text-center text-[#64748B] text-sm mt-2 pb-8">
            Already have an account? <button onClick={() => navigate('/login')} className="text-[#6D28D9] font-bold">Sign in</button>
          </p>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSignUp} className="flex flex-col gap-3 px-5 pb-8">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
            <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Display name" maxLength={40} autoComplete="name" className={inputCls} />
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] font-bold text-[15px] pointer-events-none">@</span>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(''); }}
              placeholder="username" maxLength={20} autoComplete="off" autoCapitalize="none"
              className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-9 pr-10 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60 transition-all" />
            {uStatus === 'checking' && <Spinner size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B]" />}
            {uStatus === 'available' && <CheckCircle2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#10B981]" />}
            {uStatus === 'taken' && <XCircle size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-red-600" />}
          </div>
          <p className={`text-[11px] -mt-1 pl-1 ${uStatus === 'taken' ? 'text-red-600' : uStatus === 'available' ? 'text-[#10B981]' : 'text-[#64748B]'}`}>
            {uStatus === 'taken' ? 'That username is already taken' : uStatus === 'available' ? 'Username is available' : 'Letters, numbers and _ only. 3 to 20 characters.'}
          </p>

          <div className="relative">
            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none z-10" />
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-11 pr-10 py-4 text-[#111827] text-[15px] focus:outline-none focus:border-[#7C3AED]/60 appearance-none transition-all"
              style={{ WebkitAppearance: 'none' }}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#FFFFFF' }}>{c.name}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
          </div>

          {captchaEnabled && <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          {ambiguous && (
            <button type="button" onClick={() => { const id = identity(); if (id.ok) { setPending({ kind: id.kind, target: id.value }); setStep(3); } }}
              className="text-[#6D28D9] text-sm font-semibold text-left">
              I already received a code
            </button>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
            style={{ background: '#7C3AED', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}>
            {busy ? <><Spinner size={18} /> Creating account…</> : 'Create my account'}
          </button>
          <p className="text-center text-[#94A3B8] text-[11px] mt-1">By signing up you agree to our Terms and Privacy Policy.</p>
        </form>
      )}
    </div>
  );
}
