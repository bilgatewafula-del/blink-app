// src/lib/authSecurity.js
// Everything the sign-in / sign-up screens share: validation, phone
// formatting, friendly errors, attempt throttling and inactivity rules.

/* ── inactivity policy ─────────────────────────────────────── */
export const INACTIVITY_DAYS = 30;               // keep equal to auth_policy.inactivity_days in the database
export const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

const LAST_ACTIVE_KEY = 'blink_last_active';
const NOTICE_KEY = 'blink_auth_notice';
const REMEMBER_KEY = 'blink_last_account';

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const markActive = () => ls.set(LAST_ACTIVE_KEY, String(Date.now()));
export const getLastActive = () => Number(ls.get(LAST_ACTIVE_KEY) || 0);
export const isIdleTooLong = () => {
  const last = getLastActive();
  return last > 0 && Date.now() - last > INACTIVITY_MS;
};

// A one-time message shown on the sign-in screen after a forced sign-out.
export const setAuthNotice = (kind, extra) => ls.set(NOTICE_KEY, JSON.stringify({ kind, extra: extra || null, t: Date.now() }));
export const takeAuthNotice = () => {
  const raw = ls.get(NOTICE_KEY);
  if (!raw) return null;
  ls.del(NOTICE_KEY);
  try { const n = JSON.parse(raw); return Date.now() - n.t < 10 * 60 * 1000 ? n : null; } catch { return null; }
};

// "Welcome back, Brian" card (never stores a password)
export const rememberAccount = (acc) => ls.set(REMEMBER_KEY, JSON.stringify(acc));
export const getRememberedAccount = () => { try { return JSON.parse(ls.get(REMEMBER_KEY)); } catch { return null; } };
export const forgetAccount = () => ls.del(REMEMBER_KEY);

export function maskIdentifier(id = '') {
  if (id.includes('@')) {
    const [name, domain] = id.split('@');
    return name.slice(0, 2) + '•••@' + domain;
  }
  return id.length > 6 ? id.slice(0, 4) + '••••' + id.slice(-3) : id;
}

/* ── email ─────────────────────────────────────────────────── */
const DISPOSABLE = new Set((
  'mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org sharklasers.com grr.la 10minutemail.com 10minutemail.net ' +
  'tempmail.com temp-mail.org temp-mail.io tempmailo.com tempail.com tempr.email yopmail.com yopmail.net yopmail.fr trashmail.com ' +
  'trashmail.net trashmail.io getnada.com nada.email dispostable.com maildrop.cc fakeinbox.com throwawaymail.com mintemail.com ' +
  'mohmal.com emailondeck.com spamgourmet.com moakt.com burnermail.io mailnesia.com inboxkitten.com discard.email discardmail.com ' +
  'mailcatch.com mytemp.email mailtemp.net tmpmail.org tmpmail.net tmails.net throwam.com mail-temp.com spambox.us spam4.me ' +
  'fakemail.net fakemailgenerator.com emailfake.com email-fake.com crazymailing.com cuvox.de dayrep.com einrot.com fleckens.hu ' +
  'gustr.com jourrapide.com rhyta.com superrito.com teleworm.us armyspy.com cool.fr.nf jetable.org nospam.ze.tc mailforspam.com ' +
  'harakirimail.com 33mail.com anonbox.net byom.de dropmail.me emlhub.com mailpoof.com minuteinbox.com luxusmail.org ' +
  'tempinbox.com spamex.com gettempmail.com one-time.email owlymail.com sogetthis.com wegwerfmail.de wegwerfmail.net ' +
  'yoggm.com vomoto.com mvrht.com tmail.ws tmailor.com internxt.com ibolinva.com getairmail.com inboxbear.com ' +
  'moncourrier.fr.nf monemail.fr.nf monmail.fr.nf nowmymail.com yopmail.cf yopmail.gq trbvm.com mailbox.in.ua zeroe.ml').split(/\s+/));

const TYPOS = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'icloud.con': 'icloud.com',
};

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/i;

export function checkEmail(raw) {
  const email = (raw || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Enter your email address.' };
  if (email.length > 254 || !EMAIL_RE.test(email) || email.includes('..') || email.split('@')[0].length > 64) {
    return { ok: false, error: 'That email address does not look right.' };
  }
  const domain = email.split('@')[1];
  if (TYPOS[domain]) return { ok: false, error: `Did you mean ${email.split('@')[0]}@${TYPOS[domain]}?`, suggestion: `${email.split('@')[0]}@${TYPOS[domain]}` };
  if (DISPOSABLE.has(domain)) return { ok: false, error: 'Temporary email addresses are not allowed. Use your real email.' };
  return { ok: true, email };
}

/* ── phone (E.164) ─────────────────────────────────────────── */
export const PHONE_COUNTRIES = [
  { code: 'KE', name: 'Kenya',          dial: '254', len: [9],  start: /^[17]/ },
  { code: 'UG', name: 'Uganda',         dial: '256', len: [9],  start: /^[37]/ },
  { code: 'TZ', name: 'Tanzania',       dial: '255', len: [9],  start: /^[67]/ },
  { code: 'RW', name: 'Rwanda',         dial: '250', len: [9],  start: /^7/ },
  { code: 'ET', name: 'Ethiopia',       dial: '251', len: [9],  start: /^[79]/ },
  { code: 'NG', name: 'Nigeria',        dial: '234', len: [10], start: /^[789]/ },
  { code: 'GH', name: 'Ghana',          dial: '233', len: [9],  start: /^[235]/ },
  { code: 'ZA', name: 'South Africa',   dial: '27',  len: [9],  start: /^[6-8]/ },
  { code: 'GB', name: 'United Kingdom', dial: '44',  len: [10], start: /^7/ },
  { code: 'US', name: 'United States',  dial: '1',   len: [10], start: /^[2-9]/ },
];

export function normalisePhone(countryCode, raw) {
  const text = (raw || '').trim();
  if (!text) return { ok: false, error: 'Enter your phone number.' };
  let country = PHONE_COUNTRIES.find((c) => c.code === countryCode) || PHONE_COUNTRIES[0];
  let digits = text.replace(/[^\d]/g, '');

  if (text.startsWith('+') || text.startsWith('00')) {
    if (text.startsWith('00')) digits = digits.slice(2);
    const hit = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
    if (!hit) return { ok: false, error: 'That country code is not supported yet.' };
    country = hit;
    digits = digits.slice(hit.dial.length);
  } else if (digits.startsWith(country.dial) && digits.length > country.len[0] + 1) {
    digits = digits.slice(country.dial.length);
  }
  digits = digits.replace(/^0+/, '');

  if (!country.len.includes(digits.length) || !country.start.test(digits)) {
    return { ok: false, error: `Enter a valid ${country.name} mobile number.` };
  }
  return { ok: true, e164: '+' + country.dial + digits, country: country.code, display: '+' + country.dial + ' ' + digits };
}

/* ── password ─────────────────────────────────────────────── */
export function checkPassword(pw) {
  if (!pw || pw.length < 8) return { ok: false, error: 'Password must be at least 8 characters.', score: 0 };
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return { ok: false, error: 'Use both letters and numbers.', score: 1 };
  if (/^(.)\1+$/.test(pw) || ['password', '12345678', 'qwerty123', 'password1', 'iloveyou1'].includes(pw.toLowerCase())) {
    return { ok: false, error: 'That password is too easy to guess.', score: 1 };
  }
  let score = 2;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[^a-z0-9]/i.test(pw)) score += 1;
  return { ok: true, score: Math.min(score, 4) };
}

/* ── friendly errors ──────────────────────────────────────── */
export function friendlyAuthError(error, ctx = 'signin') {
  if (!error) return { kind: 'other', message: 'Something went wrong. Please try again.' };
  const code = String(error.code || '').toLowerCase();
  const msg = String(error.message || '').toLowerCase();
  const status = error.status;

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return { kind: 'credentials', message: 'Those details are incorrect. Check them and try again.' };
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return { kind: 'unconfirmed_email', message: 'Please verify your email first.' };
  if (code === 'phone_not_confirmed' || msg.includes('phone not confirmed')) return { kind: 'unconfirmed_phone', message: 'Please verify your phone number first.' };
  if (msg.includes('suspended') || msg.includes('banned')) return { kind: 'suspended', message: error.message };
  if (msg.includes('inactivity')) return { kind: 'expired', message: 'You were away for a while. Please sign in again.' };
  if (code.includes('rate_limit') || status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return { kind: 'rate', message: 'Too many attempts. Please wait a few minutes and try again.' };
  }
  if (code === 'captcha_failed' || msg.includes('captcha')) return { kind: 'captcha', message: 'Security check failed. Please try again.' };
  if (code === 'weak_password' || msg.includes('password should')) return { kind: 'weak_password', message: 'Choose a stronger password (8+ characters with letters and numbers).' };
  if (code === 'same_password') return { kind: 'validation', message: 'Your new password must be different from the old one.' };
  if (['user_already_exists', 'email_exists', 'phone_exists'].includes(code) || msg.includes('already registered')) {
    return { kind: 'exists', message: 'An account with these details may already exist. Try signing in instead.' };
  }
  if (code === 'otp_expired' || msg.includes('expired or is invalid') || msg.includes('token has expired')) {
    return { kind: 'code', message: 'That code is incorrect or has expired. Request a new one.' };
  }
  if (code === 'email_address_not_authorized' || code === 'email_address_invalid' || msg.includes('email address') && msg.includes('invalid')) {
    return { kind: 'email_invalid', message: 'We cannot send email to that address. Check it or use a different one.' };
  }
  if (code === 'sms_send_failed' || (msg.includes('sms') && (status >= 500 || msg.includes('failed')))) {
    return { kind: 'server', message: 'We could not send the text message right now. Please try again shortly.' };
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return { kind: 'server', message: 'New sign-ups are temporarily closed.' };
  if (error.name === 'AuthRetryableFetchError' || status === 0 || msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) {
    return { kind: 'network', message: 'Connection problem. Check your internet and try again.' };
  }
  if (status >= 500 || code === 'unexpected_failure') {
    return { kind: 'server', message: ctx === 'signup' ? 'We could not finish creating your account. Please try again.' : 'Our servers are busy. Please try again in a moment.' };
  }
  return { kind: 'other', message: 'Something went wrong. Please try again.' };
}

/* ── attempt throttling (device side) ───────────────────────
   Stops accidental / scripted hammering from this device. Real
   protection against attackers is Supabase's server rate limits and
   CAPTCHA — this is the polite first layer and keeps the UI honest. */
const LOCK_KEY = 'blink_auth_attempts_v1';
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const readLocks = () => { try { return JSON.parse(ls.get(LOCK_KEY)) || {}; } catch { return {}; } };
const writeLocks = (o) => ls.set(LOCK_KEY, JSON.stringify(o));

export function lockState(identifier) {
  const rec = readLocks()[hash((identifier || '').toLowerCase())];
  const remaining = rec?.until ? rec.until - Date.now() : 0;
  return { locked: remaining > 0, remainingMs: Math.max(0, remaining), fails: rec?.fails || 0 };
}

export function recordFailure(identifier) {
  const all = readLocks();
  const k = hash((identifier || '').toLowerCase());
  const rec = all[k] && Date.now() - (all[k].last || 0) < 60 * 60 * 1000 ? all[k] : { fails: 0 };
  rec.fails += 1;
  rec.last = Date.now();
  const wait = rec.fails < 5 ? 0 : rec.fails === 5 ? 30 : rec.fails === 6 ? 60 : rec.fails === 7 ? 300 : rec.fails === 8 ? 900 : 1800;
  rec.until = wait ? Date.now() + wait * 1000 : 0;
  all[k] = rec;
  writeLocks(all);
  return lockState(identifier);
}

export function recordSuccess(identifier) {
  const all = readLocks();
  delete all[hash((identifier || '').toLowerCase())];
  writeLocks(all);
}

export const formatWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;
};

let lastSubmit = 0;
export function submitGuard(minGapMs = 1200) {
  const now = Date.now();
  if (now - lastSubmit < minGapMs) return false;
  lastSubmit = now;
  return true;
}
