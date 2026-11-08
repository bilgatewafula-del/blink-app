// src/components/auth/VerifyCode.js
// 6-digit code entry used for email verification, SMS verification, SMS
// sign-in and password recovery. Handles paste, auto-submit, resend
// cooldown and wrong-code lockout.
import { useEffect, useRef, useState } from 'react';
import { Mail, Smartphone, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { friendlyAuthError, lockState, recordFailure, recordSuccess, formatWait } from '../../lib/authSecurity';

const LEN = 6;
const COOLDOWN = 60;

export default function VerifyCode({ kind = 'email', target, title, hint, onVerify, onResend, onBack, backLabel = 'Back' }) {
  const [digits, setDigits] = useState(Array(LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(COOLDOWN);
  const [, tick] = useState(0);
  const refs = useRef([]);
  const lockKey = 'verify:' + target;
  const lock = lockState(lockKey);

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    const t = setInterval(() => { setCooldown((c) => (c > 0 ? c - 1 : 0)); tick((n) => n + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (code) => {
    if (busy) return;
    const l = lockState(lockKey);
    if (l.locked) { setError(`Too many wrong codes. Try again in ${formatWait(l.remainingMs)}.`); return; }
    setBusy(true); setError(''); setInfo('');
    let res;
    try { res = await onVerify(code); } catch (e) { res = { error: e }; }
    if (res?.error) {
      const f = friendlyAuthError(res.error, 'verify');
      if (f.kind === 'code' || f.kind === 'credentials') recordFailure(lockKey);
      setError(f.message);
      setDigits(Array(LEN).fill(''));
      refs.current[0]?.focus();
    } else {
      recordSuccess(lockKey);
    }
    setBusy(false);
  };

  const setAt = (i, v) => {
    const clean = v.replace(/\D/g, '');
    if (!clean) { const n = [...digits]; n[i] = ''; setDigits(n); return; }
    const n = [...digits];
    if (clean.length > 1) {
      clean.slice(0, LEN).split('').forEach((c, k) => { if (i + k < LEN) n[i + k] = c; });
      setDigits(n);
      const next = Math.min(i + clean.length, LEN - 1);
      refs.current[next]?.focus();
      if (n.every(Boolean)) submit(n.join(''));
      return;
    }
    n[i] = clean;
    setDigits(n);
    if (i < LEN - 1) refs.current[i + 1]?.focus();
    if (n.every(Boolean)) submit(n.join(''));
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(''); setInfo('');
    let res;
    try { res = await onResend(); } catch (e) { res = { error: e }; }
    if (res?.error) setError(friendlyAuthError(res.error).message);
    else { setInfo('A new code is on its way.'); setCooldown(COOLDOWN); }
  };

  const Icon = kind === 'totp' ? ShieldCheck : kind === 'phone' ? Smartphone : Mail;

  return (
    <div className="flex flex-col items-center px-6 pt-6 pb-10">
      <div className="w-16 h-16 rounded-2xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/30 flex items-center justify-center mb-4">
        <Icon size={28} className="text-[#FF5A1F]" />
      </div>
      <h2 className="text-white font-black text-2xl text-center">{title || (kind === 'phone' ? 'Check your phone' : 'Check your email')}</h2>
      <p className="text-[#8E8C88] text-sm text-center mt-2 max-w-[300px]">
        {hint || `We sent a 6-digit code to`}
      </p>
      <p className="text-[#FF5A1F] font-semibold text-sm mt-1 break-all text-center">{target}</p>

      <div className="flex gap-2 justify-center mt-7" onPaste={(e) => { e.preventDefault(); setAt(0, e.clipboardData.getData('text')); }}>
        {digits.map((d, i) => (
          <input
            key={i} ref={(el) => (refs.current[i] = el)}
            value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={LEN}
            disabled={busy || lock.locked}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
            aria-label={`Digit ${i + 1}`}
            className="w-12 h-14 bg-white/[0.07] border border-white/15 rounded-xl text-center text-white text-xl font-bold focus:outline-none focus:border-[#FF5A1F] disabled:opacity-50"
          />
        ))}
      </div>

      <div className="min-h-[44px] mt-4 w-full max-w-[340px]">
        {lock.locked && <p className="text-red-400 text-sm text-center">Too many wrong codes. Try again in {formatWait(lock.remainingMs)}.</p>}
        {!lock.locked && error && <p className="text-red-400 text-sm text-center">{error}</p>}
        {info && !error && <p className="text-[#2ECC71] text-sm text-center">{info}</p>}
        {busy && <p className="text-[#8E8C88] text-sm text-center">Verifying…</p>}
      </div>

      {onResend && (
        <button onClick={resend} disabled={cooldown > 0}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF5A1F] disabled:text-[#8E8C88]">
          <RefreshCw size={14} /> {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      )}

      {onBack && (
        <button onClick={onBack} className="mt-6 inline-flex items-center gap-1.5 text-sm text-[#8E8C88] hover:text-white">
          <ArrowLeft size={14} /> {backLabel}
        </button>
      )}
    </div>
  );
}
