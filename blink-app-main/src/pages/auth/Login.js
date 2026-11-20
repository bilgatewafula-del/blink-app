import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, Smartphone, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import Avatar from '../../components/Avatar';
import Captcha, { captchaEnabled } from '../../components/auth/Captcha';
import VerifyCode from '../../components/auth/VerifyCode';
import { Spinner } from '../../components/ui';
import {
  PHONE_COUNTRIES, normalisePhone, friendlyAuthError, lockState, recordFailure, recordSuccess,
  formatWait, submitGuard, takeAuthNotice, getRememberedAccount, forgetAccount, maskIdentifier,
} from '../../lib/authSecurity';

const NOTICES = {
  inactive:  { tone: 'info',  text: 'You have been away for a while. For your security, please sign in again.' },
  expired:   { tone: 'info',  text: 'Your session expired. Please sign in again.' },
  banned:    { tone: 'error', text: 'This account has been suspended. Contact support if you think this is a mistake.' },
  suspended: { tone: 'error', text: 'This account is temporarily suspended.' },
};

const inputCls = 'w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all';

export default function Login() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [notice] = useState(() => takeAuthNotice());
  const [remembered, setRemembered] = useState(() => getRememberedAccount());
  const [tab, setTab] = useState('email');               // email | phone
  const [phoneMode, setPhoneMode] = useState('password'); // password | code
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('KE');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(null);             // { kind, target, payload, purpose }
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [, tick] = useState(0);
  const tokenRef = useRef('');
  tokenRef.current = captchaToken;

  useEffect(() => { if (!loading && user) navigate('/', { replace: true }); }, [user, loading, navigate]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const resetCaptcha = () => { setCaptchaToken(''); setCaptchaReset((n) => n + 1); };

  // Which identifier are we signing in with?
  const resolveIdentity = () => {
    if (remembered) {
      return remembered.identifier.includes('@')
        ? { ok: true, kind: 'email', value: remembered.identifier.toLowerCase() }
        : { ok: true, kind: 'phone', value: remembered.identifier };
    }
    if (tab === 'email') {
      const v = email.trim().toLowerCase();
      if (!v.includes('@') || v.length < 5) return { ok: false, error: 'Enter your email address.' };
      return { ok: true, kind: 'email', value: v };
    }
    const p = normalisePhone(country, phone);
    return p.ok ? { ok: true, kind: 'phone', value: p.e164 } : { ok: false, error: p.error };
  };

  const identity = resolveIdentity();
  const lock = identity.ok ? lockState(identity.value) : { locked: false, remainingMs: 0 };

  const needCaptcha = () => {
    if (captchaEnabled && !tokenRef.current) { setError('Please complete the security check.'); return true; }
    return false;
  };

  /* ── password sign-in ── */
  const handleLogin = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const id = resolveIdentity();
    if (!id.ok) { setError(id.error); return; }
    if (!password) { setError('Enter your password.'); return; }
    const l = lockState(id.value);
    if (l.locked) { setError(`Too many attempts. Try again in ${formatWait(l.remainingMs)}.`); return; }
    if (!submitGuard()) return;
    if (needCaptcha()) return;

    setBusy(true); setError('');
    let res;
    try {
      res = await supabase.auth.signInWithPassword({
        [id.kind]: id.value, password,
        options: captchaEnabled ? { captchaToken: tokenRef.current } : undefined,
      });
    } catch (err) { res = { error: err }; }
    if (captchaEnabled) resetCaptcha();

    if (res.error) {
      const f = friendlyAuthError(res.error);
      if (f.kind === 'credentials') {
        const after = recordFailure(id.value);
        setError(after.locked ? `Too many attempts. Try again in ${formatWait(after.remainingMs)}.` : f.message);
      } else if (f.kind === 'unconfirmed_email' || f.kind === 'unconfirmed_phone') {
        // reaching this means the password was right: safe to continue verification
        setVerify({
          kind: id.kind, target: id.value, purpose: 'confirm',
          type: id.kind === 'email' ? 'signup' : 'sms',
        });
        try { await supabase.auth.resend(id.kind === 'email' ? { type: 'signup', email: id.value } : { type: 'sms', phone: id.value }); } catch { /* user can tap Resend */ }
      } else {
        setError(f.message);
      }
      setBusy(false);
      return;
    }
    recordSuccess(id.value);
    setBusy(false);
    // onAuthStateChange sets the user -> effect navigates
  };

  /* ── SMS code sign-in ── */
  const sendLoginCode = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const p = normalisePhone(country, phone);
    if (!p.ok) { setError(p.error); return; }
    if (!submitGuard(2500)) return;
    if (needCaptcha()) return;
    setBusy(true); setError('');
    let res;
    try {
      res = await supabase.auth.signInWithOtp({
        phone: p.e164,
        options: { shouldCreateUser: false, ...(captchaEnabled ? { captchaToken: tokenRef.current } : {}) },
      });
    } catch (err) { res = { error: err }; }
    if (captchaEnabled) resetCaptcha();
    setBusy(false);
    if (res.error) {
      const f = friendlyAuthError(res.error);
      // do not reveal whether the number has an account
      if (['rate', 'network', 'server', 'captcha'].includes(f.kind)) { setError(f.message); return; }
    }
    setVerify({ kind: 'phone', target: p.e164, purpose: 'login', type: 'sms' });
  };

  const verifyHandler = async (code) => {
    const v = verify;
    const res = await supabase.auth.verifyOtp(
      v.kind === 'email' ? { email: v.target, token: code, type: v.type } : { phone: v.target, token: code, type: v.type },
    );
    return res;
  };

  const resendHandler = async () => {
    const v = verify;
    const opts = captchaEnabled ? { captchaToken: tokenRef.current } : undefined;
    if (captchaEnabled && !tokenRef.current) return { error: { code: 'captcha_failed' } };
    let res;
    if (v.purpose === 'login') res = await supabase.auth.signInWithOtp({ phone: v.target, options: { shouldCreateUser: false, ...(opts || {}) } });
    else res = await supabase.auth.resend(v.kind === 'email' ? { type: 'signup', email: v.target, options: opts } : { type: 'sms', phone: v.target, options: opts });
    if (captchaEnabled) resetCaptcha();
    return res;
  };

  if (verify) {
    return (
      <div className="min-h-screen bg-[#0D0C0B]" style={{ maxWidth: 480, margin: '0 auto' }}>
        <VerifyCode
          kind={verify.kind}
          target={verify.kind === 'phone' ? verify.target : maskIdentifier(verify.target)}
          hint={verify.purpose === 'confirm' ? 'Verify your account. We sent a 6-digit code to' : 'Enter the 6-digit code we sent to'}
          onVerify={verifyHandler}
          onResend={resendHandler}
          onBack={() => { setVerify(null); setError(''); resetCaptcha(); }}
          backLabel="Back to sign in"
        />
        {captchaEnabled && <div className="px-6 pb-8"><Captcha onToken={setCaptchaToken} resetKey={captchaReset} /></div>}
      </div>
    );
  }

  const isCodeFlow = !remembered && tab === 'phone' && phoneMode === 'code';
  const submit = isCodeFlow ? sendLoginCode : handleLogin;
  const nt = notice ? NOTICES[notice.kind] : null;
  const suspendedUntil = notice?.kind === 'suspended' && notice.extra
    ? ' until ' + new Date(notice.extra).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="min-h-screen bg-[#0D0C0B] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="flex flex-col items-center pt-12 pb-6 px-6">
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center shadow-2xl shadow-[#FF5A1F]/40 mb-5">
          <span className="text-white font-black text-3xl">B</span>
        </div>
        <h1 className="text-white font-black text-[28px] tracking-tight mb-1">B-Link</h1>
        <p className="text-white/40 text-sm text-center">Africa's GenZ Social Platform</p>
      </div>

      {nt && (
        <div className={'mx-5 mb-4 rounded-2xl px-4 py-3 flex items-start gap-2.5 text-sm ' +
          (nt.tone === 'error' ? 'bg-red-500/10 border border-red-500/25 text-red-300' : 'bg-[#FF5A1F]/10 border border-[#FF5A1F]/25 text-[#FFB08F]')}>
          {nt.tone === 'error' ? <ShieldAlert size={18} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
          <span>{nt.text}{suspendedUntil}</span>
        </div>
      )}

      {remembered ? (
        <div className="mx-5 mb-5 rounded-3xl bg-white/[0.05] border border-white/10 p-5 flex flex-col items-center">
          <Avatar url={remembered.avatar_url} name={remembered.display_name} size={20} />
          <p className="text-white font-bold text-lg mt-3">Welcome back, {remembered.display_name?.split(' ')[0]}</p>
          <p className="text-[#8E8C88] text-sm">{maskIdentifier(remembered.identifier)}</p>
          <button onClick={() => { forgetAccount(); setRemembered(null); setPassword(''); setError(''); }}
            className="text-[#FF5A1F] text-sm font-semibold mt-3">Not you? Use another account</button>
        </div>
      ) : (
        <div className="flex mx-5 mb-5 bg-white/[0.06] rounded-2xl p-1">
          {[['email', 'Email', Mail], ['phone', 'Phone', Smartphone]].map(([key, label, Icon]) => (
            <button key={key} onClick={() => { setTab(key); setError(''); }}
              className={'flex-1 py-3 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2 ' +
                (tab === key ? 'bg-[#FF5A1F] text-white shadow-lg shadow-[#FF5A1F]/40' : 'text-white/50')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3 px-5">
        {!remembered && tab === 'email' && (
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="Email address" autoComplete="username" inputMode="email" autoCapitalize="none" className={inputCls} />
          </div>
        )}

        {!remembered && tab === 'phone' && (
          <div className="flex gap-2">
            <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country code"
              className="bg-white/[0.07] border border-white/10 rounded-2xl px-3 py-4 text-white text-[14px] focus:outline-none focus:border-[#FF5A1F]/60"
              style={{ WebkitAppearance: 'none', width: 104 }}>
              {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#171614' }}>{c.code} +{c.dial}</option>)}
            </select>
            <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }}
              placeholder="712 345 678" autoComplete="tel-national" inputMode="tel"
              className="flex-1 min-w-0 bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
          </div>
        )}

        {!isCodeFlow && (
          <div className="relative">
            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password" autoComplete="current-password" className={inputCls + ' pr-12'} />
            <button type="button" tabIndex={-1} onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8C88] hover:text-white">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between -mt-1">
          {!remembered && tab === 'phone' ? (
            <button type="button" onClick={() => { setPhoneMode(phoneMode === 'password' ? 'code' : 'password'); setError(''); }}
              className="text-[#FF5A1F] text-sm font-semibold">
              {phoneMode === 'password' ? 'Sign in with a text code' : 'Use password instead'}
            </button>
          ) : <span />}
          <button type="button" onClick={() => navigate('/forgot-password', { state: { identifier: remembered?.identifier || (tab === 'email' ? email : '') } })}
            className="text-[#FF5A1F] text-sm font-semibold">Forgot password?</button>
        </div>

        {captchaEnabled && <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />}

        {lock.locked && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/20 text-red-300">
            Too many attempts. Try again in {formatWait(lock.remainingMs)}.
          </div>
        )}
        {!lock.locked && error && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy || lock.locked}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
          {busy ? <><Spinner size={18} /> {isCodeFlow ? 'Sending code…' : 'Signing in…'}</> : isCodeFlow ? 'Send code' : 'Sign in'}
        </button>
      </form>

      <div className="flex items-center gap-3 px-5 my-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/25 text-xs font-semibold">NEW HERE?</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <div className="px-5">
        <button onClick={() => navigate('/signup')}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all">
          Create free account
        </button>
      </div>

      <div className="mt-auto pb-10 px-5 text-center">
        <p className="text-white/20 text-xs inline-flex items-center gap-1.5"><CheckCircle2 size={12} /> Made for Africa</p>
      </div>
    </div>
  );
}
