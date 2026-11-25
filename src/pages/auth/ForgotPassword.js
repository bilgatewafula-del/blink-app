import AuthBanner from '../../components/auth/AuthBanner';
import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Mail, Smartphone, AlertCircle } from 'lucide-react';
import Captcha, { captchaEnabled } from '../../components/auth/Captcha';
import VerifyCode from '../../components/auth/VerifyCode';
import { Spinner } from '../../components/ui';
import { PHONE_COUNTRIES, normalisePhone, friendlyAuthError, submitGuard, maskIdentifier } from '../../lib/authSecurity';

// Phone sign-in is switched off for now (SMS costs money). The phone code below is kept on purpose:
// set this to true to show the Phone tab again.
const SHOW_PHONE_SIGNIN = false;

const inputCls = 'w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-11 pr-4 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60 transition-all';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { startRecovery, clearRecovery } = useAuth();

  const seed = location.state?.identifier || '';
  const [tab, setTab] = useState(seed && !seed.includes('@') && seed.startsWith('+') ? 'phone' : 'email');
  const [email, setEmail] = useState(seed.includes('@') ? seed : '');
  const [country, setCountry] = useState('KE');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);       // { kind, target }
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const tokenRef = useRef('');
  tokenRef.current = captchaToken;

  const resetCaptcha = () => { setCaptchaToken(''); setCaptchaReset((n) => n + 1); };

  const send = async (target, kind) => {
    const options = captchaEnabled ? { captchaToken: tokenRef.current } : undefined;
    if (captchaEnabled && !tokenRef.current) return { error: { code: 'captcha_failed' } };
    let res;
    if (kind === 'email') res = await supabase.auth.resetPasswordForEmail(target, { redirectTo: window.location.origin + '/reset-password', ...(options || {}) });
    else res = await supabase.auth.signInWithOtp({ phone: target, options: { shouldCreateUser: false, ...(options || {}) } });
    if (captchaEnabled) resetCaptcha();
    return res;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    let target; let kind;
    if (tab === 'email') {
      target = email.trim().toLowerCase();
      if (!target.includes('@')) { setError('Enter your email address.'); return; }
      kind = 'email';
    } else {
      const p = normalisePhone(country, phone);
      if (!p.ok) { setError(p.error); return; }
      target = p.e164; kind = 'phone';
    }
    if (!submitGuard(2500)) return;
    if (captchaEnabled && !tokenRef.current) { setError('Please complete the security check.'); return; }

    setBusy(true); setError('');
    let res;
    try { res = await send(target, kind); } catch (err) { res = { error: err }; }
    setBusy(false);
    if (res.error) {
      const f = friendlyAuthError(res.error);
      if (['rate', 'network', 'captcha', 'server'].includes(f.kind)) { setError(f.message); return; }
      // anything else: behave exactly as if it worked (never reveal whether an account exists)
    }
    setSent({ kind, target });
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#E6E9F6]" style={{ maxWidth: 480, margin: '0 auto' }}>
        <VerifyCode
          kind={sent.kind}
          target={sent.kind === 'email' ? maskIdentifier(sent.target) : sent.target}
          title={sent.kind === 'email' ? 'Check your email' : 'Check your phone'}
          hint={sent.kind === 'email'
            ? 'If an account exists we sent a link and code to. Enter the 6-digit code, or tap the link in the email.'
            : 'If an account exists we sent a 6-digit code to'}
          onVerify={async (code) => {
            startRecovery();
            const res = await supabase.auth.verifyOtp(
              sent.kind === 'email' ? { email: sent.target, token: code, type: 'recovery' } : { phone: sent.target, token: code, type: 'sms' },
            );
            if (res.error) { clearRecovery(); return res; }
            navigate('/reset-password', { replace: true });
            return res;
          }}
          onResend={() => send(sent.target, sent.kind)}
          onBack={() => { setSent(null); resetCaptcha(); }}
          backLabel="Use a different account"
        />
        {captchaEnabled && <div className="px-6 pb-8"><Captcha onToken={setCaptchaToken} resetKey={captchaReset} /></div>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <AuthBanner onBack={() => navigate('/login')} title="Reset your password" subtitle="Enter the email or phone number you signed up with and we will send you a code." />
      <div className="h-5" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5">
        {SHOW_PHONE_SIGNIN && (
        <div className="flex bg-[#F1F5F9] rounded-2xl p-1">
          {[['email', 'Email', Mail], ['phone', 'Phone', Smartphone]].map(([key, label, Icon]) => (
            <button type="button" key={key} onClick={() => { setTab(key); setError(''); }}
              className={'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all inline-flex items-center justify-center gap-2 ' + (tab === key ? 'bg-[#7C3AED] text-white' : 'text-[#64748B]')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        )}

        {tab === 'email' ? (
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="Email address" autoComplete="email" inputMode="email" autoCapitalize="none" className={inputCls} />
          </div>
        ) : (
          <div className="flex gap-2">
            <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country code"
              className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-3 py-4 text-[#111827] text-[14px] focus:outline-none"
              style={{ WebkitAppearance: 'none', width: 104 }}>
              {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#FFFFFF' }}>{c.code} +{c.dial}</option>)}
            </select>
            <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }}
              placeholder="712 345 678" autoComplete="tel-national" inputMode="tel"
              className="flex-1 min-w-0 bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60" />
          </div>
        )}

        {captchaEnabled && <Captcha onToken={setCaptchaToken} resetKey={captchaReset} />}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: '#7C3AED', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}>
          {busy ? <><Spinner size={18} /> Sending…</> : 'Send code'}
        </button>
      </form>
    </div>
  );
}
