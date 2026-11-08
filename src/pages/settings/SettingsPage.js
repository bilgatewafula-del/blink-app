import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, ChevronRight, X, Check, User, Mail, Smartphone, KeyRound, MessageCircle, MessagesSquare, UserPlus, Ban,
  VolumeX, EyeOff, Bell, Heart, Users, AtSign, Moon, Type, Play, Gauge, ImageIcon, Zap, ShieldCheck, LogOut,
  Download, Trash2, PauseCircle, LifeBuoy, Info, Share2, Copy, Laptop, Lock,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import Captcha, { captchaEnabled } from '../../components/auth/Captcha';
import VerifyCode from '../../components/auth/VerifyCode';
import { Spinner } from '../../components/ui';
import { usePrefs, setPrefs, adoptServerSettings } from '../../lib/prefs';
import { getMutedUserIds, unmuteUser, hiddenPostCount, clearHiddenPosts } from '../../lib/posts';
import {
  PHONE_COUNTRIES, normalisePhone, checkPassword, friendlyAuthError, lockState, recordFailure, recordSuccess, formatWait, maskIdentifier, submitGuard,
} from '../../lib/authSecurity';
import { APP_NAME } from '../../config/appInfo';

let settingsCache = null;
const NOTIF = [
  { key: 'notif_likes', label: 'Likes and reactions', Icon: Heart },
  { key: 'notif_comments', label: 'Comments and replies', Icon: MessagesSquare },
  { key: 'notif_followers', label: 'New followers', Icon: Users },
  { key: 'notif_messages', label: 'Messages', Icon: MessageCircle },
  { key: 'notif_mentions', label: 'Mentions', Icon: AtSign },
  { key: 'notif_system', label: 'Announcements', Icon: Bell },
];
const WHO = [{ key: 'everyone', label: 'Everyone' }, { key: 'followers', label: 'People who follow me' }, { key: 'nobody', label: 'Nobody' }];
const LABEL = {
  everyone: 'Everyone', followers: 'People who follow me', nobody: 'Nobody', auto: 'Auto', high: 'High', medium: 'Medium', low: 'Low (saves data)',
  small: 'Small', large: 'Large', dark: 'Dark', amoled: 'AMOLED black',
};

/* ── building blocks ── */
function Toggle({ value, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={!!value} onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      className={'relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ' + (value ? 'bg-[#FF5A1F]' : 'bg-white/20')}>
      <span className={'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ' + (value ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

function Row({ icon: Icon, label, sub, onPress, right, danger, toggle }) {
  const Tag = onPress || toggle ? 'button' : 'div';
  return (
    <Tag onClick={toggle ? () => toggle.onChange(!toggle.value) : onPress}
      className={'w-full flex items-center gap-3 px-4 py-3.5 text-left ' + ((onPress || toggle) ? 'active:bg-white/[0.06] ' : '')}>
      {Icon && (
        <span className={'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ' + (danger ? 'bg-red-500/15' : 'bg-[#FF5A1F]/10')}>
          <Icon size={17} className={danger ? 'text-red-400' : 'text-[#FF8A5C]'} />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={'block text-[14px] font-semibold ' + (danger ? 'text-red-400' : 'text-white/90')}>{label}</span>
        {sub && <span className="block text-[#8E8C88] text-[12px] mt-0.5 truncate">{sub}</span>}
      </span>
      {toggle ? <Toggle value={toggle.value} onChange={toggle.onChange} /> : right || (onPress && <ChevronRight size={16} className="text-[#8E8C88] flex-shrink-0" />)}
    </Tag>
  );
}

const Divider = () => <div className="h-px bg-white/[0.06] ml-16 mr-4" />;

function Section({ title, children }) {
  return (
    <div className="mb-1">
      <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest px-5 pt-5 pb-2">{title}</p>
      <div className="bg-white/[0.035] border border-white/[0.07] rounded-2xl mx-4 overflow-hidden">
        {(Array.isArray(children) ? children.filter(Boolean) : [children]).map((c, i, arr) => (
          <div key={i}>{c}{i < arr.length - 1 && <Divider />}</div>
        ))}
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(20px,env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5" />
        <div className="flex items-center justify-between px-5 pt-3 pb-3">
          <p className="text-white font-bold text-[16px]">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-[#8E8C88] p-1"><X size={20} /></button>
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60';
const Label = ({ children }) => <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">{children}</label>;
const Err = ({ text }) => (text ? <p className="text-red-400 text-sm mt-2">{text}</p> : null);
const GradBtn = ({ busy, children, ...p }) => (
  <button {...p} disabled={busy || p.disabled}
    className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
    style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF2D78)' }}>
    {busy ? <Spinner size={17} /> : children}
  </button>
);

function SelectSheet({ title, options, value, onSelect, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-2 pb-2">
        {options.map((o) => (
          <button key={o.key} onClick={() => { onSelect(o.key); onClose(); }}
            className={'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border ' +
              (value === o.key ? 'bg-[#FF5A1F]/15 border-[#FF5A1F]/40 text-white' : 'bg-white/[0.03] border-white/[0.07] text-white/80')}>
            <span className="font-semibold text-[14px]">{o.label}</span>
            {value === o.key && <Check size={16} className="text-[#FF5A1F]" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* re-enter the password before sensitive changes */
async function checkCurrentPassword(user, password, captchaToken) {
  const lk = lockState('reauth:' + user.id);
  if (lk.locked) return { message: `Too many attempts. Try again in ${formatWait(lk.remainingMs)}.` };
  const creds = user.email ? { email: user.email, password } : { phone: user.phone?.startsWith('+') ? user.phone : '+' + user.phone, password };
  const { error } = await supabase.auth.signInWithPassword({ ...creds, options: captchaToken ? { captchaToken } : undefined });
  if (error) {
    const f = friendlyAuthError(error);
    if (f.kind === 'credentials') { recordFailure('reauth:' + user.id); return { message: 'Your current password is incorrect.' }; }
    return { message: f.message };
  }
  recordSuccess('reauth:' + user.id);
  return null;
}

function PasswordGate({ user, password, setPassword, captcha, setCaptcha, resetKey }) {
  return (
    <>
      <Label>Current password</Label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm it's you" autoComplete="current-password" className={inputCls} />
      {captchaEnabled && <div className="mt-3"><Captcha onToken={setCaptcha} resetKey={resetKey} /></div>}
    </>
  );
}

function ChangePasswordSheet({ user, onClose, onDone }) {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('');
  const [captcha, setCaptcha] = useState(''); const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    const c = checkPassword(next);
    if (!cur) return setErr('Enter your current password.');
    if (!c.ok) return setErr(c.error);
    if (next !== again) return setErr('The new passwords do not match.');
    if (next === cur) return setErr('Choose a password you have not used just now.');
    if (captchaEnabled && !captcha) return setErr('Please complete the security check.');
    setBusy(true); setErr('');
    const bad = await checkCurrentPassword(user, cur, captcha);
    if (captchaEnabled) { setCaptcha(''); setReset((n) => n + 1); }
    if (bad) { setErr(bad.message); setBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) { setErr(friendlyAuthError(error).message); setBusy(false); return; }
    try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* best effort */ }
    onDone('Password updated. Other devices were signed out.');
  };
  return (
    <Sheet title="Change password" onClose={onClose}>
      <PasswordGate user={user} password={cur} setPassword={(v) => { setCur(v); setErr(''); }} captcha={captcha} setCaptcha={setCaptcha} resetKey={reset} />
      <div className="mt-3"><Label>New password</Label>
        <input type="password" value={next} onChange={(e) => { setNext(e.target.value); setErr(''); }} placeholder="At least 8 characters" autoComplete="new-password" className={inputCls} /></div>
      <div className="mt-3"><Label>Confirm new password</Label>
        <input type="password" value={again} onChange={(e) => { setAgain(e.target.value); setErr(''); }} placeholder="Repeat it" autoComplete="new-password" className={inputCls} /></div>
      <Err text={err} />
      <GradBtn onClick={submit} busy={busy}>Update password</GradBtn>
    </Sheet>
  );
}

function EmailSheet({ user, onClose, onDone }) {
  const [pw, setPw] = useState(''); const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState(''); const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    const v = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setErr('Enter a valid email address.');
    if (!pw) return setErr('Enter your current password.');
    if (captchaEnabled && !captcha) return setErr('Please complete the security check.');
    setBusy(true); setErr('');
    const bad = await checkCurrentPassword(user, pw, captcha);
    if (captchaEnabled) { setCaptcha(''); setReset((n) => n + 1); }
    if (bad) { setErr(bad.message); setBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ email: v });
    if (error) { setErr(friendlyAuthError(error).message); setBusy(false); return; }
    onDone(`Confirmation sent to ${v}. Open the email to finish.`);
  };
  return (
    <Sheet title={user.email ? 'Change email' : 'Add an email'} onClose={onClose}>
      {user.email && <div className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 mb-3"><p className="text-[#8E8C88] text-[11px] font-bold uppercase">Current email</p><p className="text-white text-[14px] mt-0.5">{user.email}</p></div>}
      <Label>New email</Label>
      <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="you@example.com" inputMode="email" autoCapitalize="none" className={inputCls} />
      <div className="mt-3"><PasswordGate user={user} password={pw} setPassword={(v) => { setPw(v); setErr(''); }} captcha={captcha} setCaptcha={setCaptcha} resetKey={reset} /></div>
      <Err text={err} />
      <GradBtn onClick={submit} busy={busy}>Send confirmation</GradBtn>
    </Sheet>
  );
}

function PhoneSheet({ user, onClose, onDone }) {
  const [country, setCountry] = useState('KE'); const [phone, setPhone] = useState('');
  const [step, setStep] = useState('enter'); const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async () => {
    const p = normalisePhone(country, phone);
    if (!p.ok) return setErr(p.error);
    if (!submitGuard(2500)) return;
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ phone: p.e164 });
    setBusy(false);
    if (error) { const f = friendlyAuthError(error); return setErr(f.kind === 'server' || f.kind === 'other' ? "We couldn't send the text. Phone numbers may not be switched on yet." : f.message); }
    setTarget(p.e164); setStep('verify');
  };
  if (step === 'verify') {
    return (
      <Sheet title="Verify your number" onClose={onClose}>
        <VerifyCode kind="phone" target={target} hint="Enter the 6-digit code we sent to"
          onVerify={async (code) => { const r = await supabase.auth.verifyOtp({ phone: target, token: code, type: 'phone_change' }); if (!r.error) onDone('Phone number saved.'); return r; }}
          onResend={() => supabase.auth.updateUser({ phone: target })}
          onBack={() => setStep('enter')} backLabel="Change number" />
      </Sheet>
    );
  }
  return (
    <Sheet title={user.phone ? 'Change phone number' : 'Add a phone number'} onClose={onClose}>
      {user.phone && <p className="text-[#8E8C88] text-sm mb-3">Current number: <span className="text-white">{maskIdentifier('+' + String(user.phone).replace(/^\+/, ''))}</span></p>}
      <Label>New phone number</Label>
      <div className="flex gap-2">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country code" className="bg-white/[0.07] border border-white/10 rounded-xl px-3 text-white text-[14px]" style={{ WebkitAppearance: 'none', width: 100 }}>
          {PHONE_COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#171614' }}>{c.code} +{c.dial}</option>)}
        </select>
        <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErr(''); }} placeholder="712 345 678" inputMode="tel" className={inputCls} />
      </div>
      <p className="text-[#8E8C88] text-[12px] mt-2">We will text you a code to confirm it is yours.</p>
      <Err text={err} />
      <GradBtn onClick={send} busy={busy}>Send code</GradBtn>
    </Sheet>
  );
}

function TwoStepSheet({ onClose, onDone }) {
  const [factors, setFactors] = useState(null);
  const [enroll, setEnroll] = useState(null);   // { id, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true); setErr('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'B-Link ' + Math.random().toString(36).slice(2, 7) });
    setBusy(false);
    if (error) return setErr('Two-step verification is not available right now.');
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const cancelEnroll = async () => { if (enroll) { try { await supabase.auth.mfa.unenroll({ factorId: enroll.id }); } catch { /* ignore */ } } setEnroll(null); setCode(''); };
  const confirm = async () => {
    if (code.length !== 6) return setErr('Enter the 6-digit code from your app.');
    setBusy(true); setErr('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) return setErr('That code is not right. Check the time on your phone and try again.');
    onDone('Two-step verification is on.');
  };
  const disable = async () => {
    setBusy(true); setErr('');
    for (const f of (factors || [])) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) { setErr("Couldn't turn it off. Sign in again and retry."); setBusy(false); return; }
    }
    onDone('Two-step verification is off.');
  };

  const active = (factors || []).filter((f) => f.status === 'verified');
  return (
    <Sheet title="Two-step verification" onClose={() => { cancelEnroll(); onClose(); }}>
      {factors === null ? <div className="flex justify-center py-8 text-[#FF5A1F]"><Spinner size={22} /></div>
        : enroll ? (
          <>
            <p className="text-white/70 text-[13px] mb-3">1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) and scan this code.</p>
            <div className="bg-white rounded-2xl p-3 w-fit mx-auto"><img src={enroll.qr} alt="Scan with your authenticator app" width={176} height={176} /></div>
            <p className="text-[#8E8C88] text-[12px] text-center mt-3">Can't scan? Enter this key:</p>
            <button onClick={() => navigator.clipboard?.writeText(enroll.secret)} className="mx-auto mt-1 flex items-center gap-2 text-white font-mono text-[13px] bg-white/[0.07] rounded-lg px-3 py-2">
              {enroll.secret} <Copy size={13} className="text-[#8E8C88]" /></button>
            <p className="text-white/70 text-[13px] mt-4 mb-2">2. Enter the 6-digit code it shows.</p>
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }} inputMode="numeric" placeholder="123456" className={inputCls + ' text-center tracking-[6px] text-lg'} />
            <Err text={err} />
            <GradBtn onClick={confirm} busy={busy}>Turn on</GradBtn>
            <button onClick={cancelEnroll} className="w-full text-[#8E8C88] text-sm font-semibold py-3">Cancel</button>
          </>
        ) : active.length > 0 ? (
          <>
            <div className="flex items-center gap-3 bg-[#2ECC71]/10 border border-[#2ECC71]/30 rounded-2xl p-4">
              <ShieldCheck size={22} className="text-[#2ECC71]" />
              <p className="text-white text-[14px] font-semibold">Two-step verification is on</p>
            </div>
            <p className="text-[#8E8C88] text-[13px] mt-3">Signing in needs your password and a code from your authenticator app.</p>
            <Err text={err} />
            <button onClick={disable} disabled={busy} className="w-full mt-4 py-3 rounded-xl bg-red-500/15 text-red-400 font-bold border border-red-500/30 disabled:opacity-50">{busy ? 'Working…' : 'Turn off'}</button>
          </>
        ) : (
          <>
            <p className="text-white/70 text-[14px] leading-relaxed">Add a second lock to your account. Even if someone learns your password they cannot sign in without the code from your phone.</p>
            <Err text={err} />
            <GradBtn onClick={start} busy={busy}>Set up</GradBtn>
          </>
        )}
    </Sheet>
  );
}

function PeopleSheet({ title, ids, empty, actionLabel, onAction, onClose }) {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    if (!ids.length) { setUsers([]); return; }
    supabase.from('users').select('id,username,display_name,avatar_url').in('id', ids.slice(0, 100)).then(({ data }) => setUsers(data || []));
  }, []); // eslint-disable-line
  return (
    <Sheet title={title} onClose={onClose}>
      {users === null ? <div className="flex justify-center py-8 text-[#FF5A1F]"><Spinner size={22} /></div>
        : users.length === 0 ? <p className="text-[#8E8C88] text-sm text-center py-8">{empty}</p>
        : users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06]">
            <Avatar url={u.avatar_url} name={u.display_name} size={10} />
            <div className="flex-1 min-w-0"><p className="text-white font-bold text-[14px] truncate">{u.display_name}</p><p className="text-[#8E8C88] text-[12px]">@{u.username}</p></div>
            <button onClick={async () => { await onAction(u.id); setUsers((l) => l.filter((x) => x.id !== u.id)); }}
              className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#FF5A1F]/15 text-[#FF5A1F] border border-[#FF5A1F]/30">{actionLabel}</button>
          </div>
        ))}
    </Sheet>
  );
}

function DangerSheet({ title, text, confirmWord, button, onConfirm, onClose }) {
  const [word, setWord] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ok = !confirmWord || word.trim().toUpperCase() === confirmWord;
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-white/70 text-[14px] leading-relaxed">{text}</p>
      {confirmWord && <><p className="text-[#8E8C88] text-[12px] mt-4 mb-1.5">Type <span className="text-white font-bold">{confirmWord}</span> to confirm</p>
        <input value={word} onChange={(e) => setWord(e.target.value)} className={inputCls} autoCapitalize="characters" /></>}
      <Err text={err} />
      <button disabled={!ok || busy} onClick={async () => { setBusy(true); setErr(''); try { await onConfirm(); } catch (e) { setErr(e.message || 'Something went wrong.'); setBusy(false); } }}
        className="w-full mt-4 py-3.5 rounded-2xl bg-red-500/15 text-red-400 font-bold border border-red-500/30 disabled:opacity-40">{busy ? 'Working…' : button}</button>
      <button onClick={onClose} className="w-full mt-2 py-3 rounded-2xl bg-white/[0.07] text-white font-bold">Cancel</button>
    </Sheet>
  );
}

/* ═════════════ the page ═════════════ */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const prefs = usePrefs();
  const [settings, setSettings] = useState(settingsCache);
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState(null);
  const [mutedIds, setMutedIds] = useState(getMutedUserIds());
  const toastTimer = useRef(null);

  const say = useCallback((t) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400); }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let live = true;
    (async () => {
      let { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (!data) { const r = await supabase.from('user_settings').upsert({ user_id: user.id }, { onConflict: 'user_id' }).select().single(); data = r.data; }
      if (live && data) { settingsCache = data; setSettings(data); adoptServerSettings(data); }
    })();
    return () => { live = false; };
  }, [user.id]);

  const save = useCallback(async (key, value) => {
    setSettings((s) => { const n = { ...(s || {}), [key]: value }; settingsCache = n; return n; });
    if (['theme', 'font_size', 'data_saver', 'autoplay_videos', 'video_quality', 'image_quality'].includes(key)) setPrefs({ [key]: value });
    const { error } = await supabase.from('user_settings').update({ [key]: value, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) say("Couldn't save. Check your connection.");
  }, [user.id, say]);

  const get = (k, d) => (settings && settings[k] != null ? settings[k] : d);
  const done = (msg) => { setSheet(null); if (msg) say(msg); };

  const exportData = async () => {
    say('Preparing your data…');
    const ok = (p) => p.then((r) => r.data || []).catch(() => []);
    const [posts, comments, following, followers, saved] = await Promise.all([
      ok(supabase.from('posts').select('id,caption,created_at,audience,post_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000)),
      ok(supabase.from('comments').select('id,post_id,body,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000)),
      ok(supabase.from('follows').select('following_id').eq('follower_id', user.id).limit(5000)),
      ok(supabase.from('follows').select('follower_id').eq('following_id', user.id).limit(5000)),
      ok(supabase.from('saved_posts').select('post_id').eq('user_id', user.id).limit(2000)),
    ]);
    const data = {
      exported_at: new Date().toISOString(),
      account: { username: profile?.username, display_name: profile?.display_name, bio: profile?.bio, country: profile?.country, email: user.email || null, phone: user.phone || null, joined: profile?.created_at },
      settings, posts, comments, following: following.map((r) => r.following_id), followers: followers.map((r) => r.follower_id), saved_posts: saved.map((r) => r.post_id),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${APP_NAME.toLowerCase()}-my-data.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say('Your data was downloaded');
  };

  const shareApp = async () => {
    const url = window.location.origin;
    try { if (navigator.share) await navigator.share({ title: APP_NAME, text: `Join me on ${APP_NAME}`, url }); else { await navigator.clipboard.writeText(url); say('Link copied'); } } catch { /* cancelled */ }
  };

  const unblock = async (id) => save('blocked_users', (get('blocked_users', []) || []).filter((x) => x !== id));
  const unmute = async (id) => { unmuteUser(id); setMutedIds(getMutedUserIds()); };

  const deactivate = async () => {
    const { error } = await supabase.rpc('self_deactivate_account');
    if (error) throw new Error("We couldn't deactivate your account. Try again.");
    say('Account deactivated'); setTimeout(() => signOut(), 1200);
  };
  const deleteAccount = async () => {
    let { error } = await supabase.rpc('delete_my_account');
    if (error && /does not exist|could not find/i.test(error.message || '')) ({ error } = await supabase.rpc('self_delete_account'));
    if (error) throw new Error(error.message || "We couldn't delete your account.");
    await signOut();
  };

  const who = (k) => LABEL[get(k, 'everyone')];
  const phoneShown = user?.phone ? maskIdentifier('+' + String(user.phone).replace(/^\+/, '')) : 'Not added';

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      {toast && <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-white text-black text-[13px] font-semibold rounded-full px-5 py-2.5 shadow-xl max-w-[90vw] text-center">{toast}</div>}

      {sheet === 'password' && <ChangePasswordSheet user={user} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'email' && <EmailSheet user={user} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'phone' && <PhoneSheet user={user} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'twostep' && <TwoStepSheet onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'blocked' && <PeopleSheet title="Blocked accounts" ids={get('blocked_users', []) || []} empty="You have not blocked anyone." actionLabel="Unblock" onAction={unblock} onClose={() => setSheet(null)} />}
      {sheet === 'muted' && <PeopleSheet title="Muted accounts" ids={mutedIds} empty="You have not muted anyone." actionLabel="Unmute" onAction={unmute} onClose={() => setSheet(null)} />}
      {sheet === 'deactivate' && <DangerSheet title="Deactivate account" text="Your profile and posts are hidden until you sign in again. Nothing is deleted." button="Deactivate" onConfirm={deactivate} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && <DangerSheet title="Delete account" text="This permanently erases your profile, posts, comments, chats and followers. It cannot be undone." confirmWord="DELETE" button="Delete everything" onConfirm={deleteAccount} onClose={() => setSheet(null)} />}
      {sheet === 'others' && <DangerSheet title="Sign out other devices" text="Every other phone or browser signed in to your account is signed out. This device stays signed in." button="Sign them out" onConfirm={async () => { const { error } = await supabase.auth.signOut({ scope: 'others' }); if (error) throw new Error("Couldn't sign out other devices."); done('Other devices were signed out.'); }} onClose={() => setSheet(null)} />}
      {sheet?.select && (
        <SelectSheet title={sheet.title} options={sheet.options} value={sheet.current} onSelect={(v) => save(sheet.select, v)} onClose={() => setSheet(null)} />
      )}

      <div className="sticky top-0 z-20 bg-[#0D0C0B]/95 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="text-[#8E8C88] hover:text-white"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-[16px]">Settings</h1>
      </div>

      <button onClick={() => navigate('/edit-profile')} className="w-[calc(100%-2rem)] mx-4 mt-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-3 text-left active:bg-white/[0.07]">
        <Avatar url={profile?.avatar_url} name={profile?.display_name} size={13} />
        <div className="flex-1 min-w-0"><p className="text-white font-bold text-[16px] truncate">{profile?.display_name}</p><p className="text-[#8E8C88] text-[13px]">@{profile?.username}</p></div>
        <span className="text-[#FF5A1F] text-[13px] font-bold">Edit</span>
      </button>

      <Section title="Account">
        <Row icon={Mail} label="Email" sub={user?.email || 'Not added'} onPress={() => setSheet('email')} />
        <Row icon={Smartphone} label="Phone number" sub={phoneShown} onPress={() => setSheet('phone')} />
        <Row icon={KeyRound} label="Change password" onPress={() => setSheet('password')} />
      </Section>

      <Section title="Privacy and safety">
        <Row icon={MessageCircle} label="Who can message you" sub={who('who_can_message')} onPress={() => setSheet({ select: 'who_can_message', title: 'Who can message you', options: WHO, current: get('who_can_message', 'everyone') })} />
        <Row icon={MessagesSquare} label="Who can comment on your posts" sub={who('who_can_comment')} onPress={() => setSheet({ select: 'who_can_comment', title: 'Who can comment on your posts', options: WHO, current: get('who_can_comment', 'everyone') })} />
        <Row icon={UserPlus} label="Who can follow you" sub={get('who_can_follow', 'everyone') === 'nobody' ? 'Nobody (new follows are blocked)' : 'Everyone'} onPress={() => setSheet({ select: 'who_can_follow', title: 'Who can follow you', options: [{ key: 'everyone', label: 'Everyone' }, { key: 'nobody', label: 'Nobody' }], current: get('who_can_follow', 'everyone') })} />
        <Row icon={Ban} label="Blocked accounts" sub={`${(get('blocked_users', []) || []).length} blocked`} onPress={() => setSheet('blocked')} />
        <Row icon={VolumeX} label="Muted accounts" sub={`${mutedIds.length} muted`} onPress={() => { setMutedIds(getMutedUserIds()); setSheet('muted'); }} />
        <Row icon={EyeOff} label="Hidden posts" sub={`${hiddenPostCount()} hidden from your feed`} onPress={() => { if (hiddenPostCount()) { clearHiddenPosts(); say('Hidden posts will show again'); } else say('No hidden posts'); }} />
      </Section>

      <Section title="Notifications">
        {NOTIF.map((n) => <Row key={n.key} icon={n.Icon} label={n.label} toggle={{ value: get(n.key, true), onChange: (v) => save(n.key, v) }} />)}
      </Section>

      <Section title="Appearance">
        <Row icon={Moon} label="Theme" sub={LABEL[prefs.theme]} onPress={() => setSheet({ select: 'theme', title: 'Theme', options: [{ key: 'dark', label: 'Dark' }, { key: 'amoled', label: 'AMOLED black (saves battery on OLED screens)' }], current: prefs.theme })} />
        <Row icon={Type} label="Text size" sub={LABEL[prefs.font_size] || 'Medium'} onPress={() => setSheet({ select: 'font_size', title: 'Text size', options: [{ key: 'small', label: 'Small' }, { key: 'medium', label: 'Medium (default)' }, { key: 'large', label: 'Large' }], current: prefs.font_size })} />
      </Section>

      <Section title="Media and data">
        <Row icon={Play} label="Auto-play videos" sub="Play muted when a video is on screen" toggle={{ value: prefs.autoplay_videos, onChange: (v) => save('autoplay_videos', v) }} />
        <Row icon={Gauge} label="Video quality" sub={LABEL[prefs.video_quality]} onPress={() => setSheet({ select: 'video_quality', title: 'Video quality', options: [{ key: 'auto', label: 'Auto' }, { key: 'high', label: 'High' }, { key: 'medium', label: 'Medium' }, { key: 'low', label: 'Low (saves data)' }], current: prefs.video_quality })} />
        <Row icon={ImageIcon} label="Photo upload quality" sub={LABEL[prefs.image_quality]} onPress={() => setSheet({ select: 'image_quality', title: 'Photo upload quality', options: [{ key: 'high', label: 'High' }, { key: 'medium', label: 'Medium' }, { key: 'low', label: 'Low (smallest uploads)' }], current: prefs.image_quality })} />
        <Row icon={Zap} label="Data saver" sub="Smaller photos and videos, no auto-play" toggle={{ value: prefs.data_saver, onChange: (v) => save('data_saver', v) }} />
      </Section>

      <Section title="Security">
        <Row icon={ShieldCheck} label="Two-step verification" sub="Ask for a code from an authenticator app" onPress={() => setSheet('twostep')} />
        <Row icon={Laptop} label="Sign out other devices" sub="End every other login of this account" onPress={() => setSheet('others')} />
      </Section>

      <Section title="Your data">
        <Row icon={Download} label="Download my data" sub="Profile, posts, comments, connections" onPress={exportData} />
        <Row icon={PauseCircle} label="Deactivate account" sub="Hide your account until you sign in again" onPress={() => setSheet('deactivate')} danger />
        <Row icon={Trash2} label="Delete account" sub="Erase everything permanently" onPress={() => setSheet('delete')} danger />
      </Section>

      <Section title={`About ${APP_NAME}`}>
        <Row icon={LifeBuoy} label="Help Center" sub="FAQ and contact support" onPress={() => navigate('/help')} />
        <Row icon={Info} label={`About ${APP_NAME}`} sub="Version, legal and updates" onPress={() => navigate('/about')} />
        <Row icon={Share2} label={`Invite friends to ${APP_NAME}`} onPress={shareApp} />
      </Section>

      <div className="mx-4 mt-5">
        <button onClick={() => signOut()} className="w-full py-3.5 rounded-2xl font-bold text-red-400 border border-red-500/25 bg-red-500/[0.07] flex items-center justify-center gap-2"><LogOut size={16} /> Sign out</button>
      </div>
      <p className="text-white/20 text-[11px] text-center py-6 flex items-center justify-center gap-1.5"><Lock size={11} /> Your settings are saved to your account</p>
    </div>
  );
}
