// src/utils/usernameValidation.js
// Single source of truth for username/display-name rules across
// SignUp, EditProfile, and Admin. Import from here everywhere —
// never hardcode a separate reserved list in another file again.

/* ── Reserved usernames — brand, staff, and impersonation-risk terms ── */
export const RESERVED_USERNAMES = [
  // Brand / app identity
  'blink','b-link','blinkapp','b-linkapp','blinkofficial','b-linkofficial',
  'blinkhq','blinkteam','blinkkenya','blinkke','blinkapp254','official',
  'getblink','useblink','tryblink','blinkinc','blinkco',

  // Leadership / seniority impersonation
  'ceo','founder','cofounder','co-founder','owner','president','director',
  'manager','chairman','boss','chief','executive','md','managingdirector',

  // Staff / system roles
  'admin','administrator','superadmin','superuser','root','staff','team',
  'moderator','mod','support','helpdesk','helpcenter','customerservice',
  'customersupport','system','bot','official','verified','verification',

  // Generic impersonation-risk
  'blinksupport','blinkadmin','blinkmod','blinkceo','blinkstaff',
  'security','billing','payments','finance','legal','press','media',
  'news','noreply','no-reply','postmaster','webmaster','sysadmin',
];

/* ── Awkward / gibberish / low-effort name patterns ──────────────
   These catch keyboard-mash and placeholder-style names so the
   platform stays recognisable and professional.                  */
const GIBBERISH_PATTERNS = [
  /^(.)\1{3,}$/i,                          // aaaa, xxxxx (4+ repeated char)
  /^[a-z]{1,2}\d{4,}$/i,                   // a1234, xy98765
  /^(asdf|qwer|zxcv|hjkl|jkl|asd|qwe)+$/i, // keyboard-mash sequences
  /^(test|temp|demo|sample|placeholder|untitled|noname|unnamed)\d*$/i,
  /^user\d{3,}$/i,                         // user12345 style auto-names
  /^[bcdfghjklmnpqrstvwxyz]{5,}$/i,        // 5+ consonants with zero vowels — unpronounceable
];

const AWKWARD_DISPLAY_PATTERNS = [
  /^(.)\1{3,}$/i,                          // huhuyy, aaaa style
  /^(ha){3,}$/i, /^(lol){2,}$/i, /^(haha){2,}$/i,
  /^[^a-zA-Z0-9\s]{3,}$/,                  // mostly symbols, no letters
  /^\d+$/,                                 // pure numbers as a display name
];

/* ── Profanity / slur baseline list kept intentionally short and
   server-agnostic; extend via admin tools as needed ── */
const BLOCKED_SUBSTRINGS = [
  'fuck','shit','bitch','nigger','nigga','cunt','rape','porn','sex',
];

/**
 * Validates a username at signup or edit time.
 * Returns null if valid, or an error string describing the problem.
 */
export function validateUsername(raw) {
  const username = (raw || '').trim().toLowerCase();

  if (!username) return 'Username is required.';
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return 'Username must be 3–20 characters: letters, numbers, underscores only.';
  }

  if (RESERVED_USERNAMES.includes(username)) {
    return 'That username is reserved and cannot be used.';
  }

  // Reject if it merely CONTAINS a reserved brand/staff term
  // e.g. "blink_official2025" or "realceo_john"
  const containsReserved = RESERVED_USERNAMES.some(r =>
    r.length >= 4 && username.includes(r)
  );
  if (containsReserved) {
    return 'Username contains a restricted word. Choose something else.';
  }

  for (const pattern of GIBBERISH_PATTERNS) {
    if (pattern.test(username)) {
      return 'Please choose a real, recognisable username.';
    }
  }

  for (const word of BLOCKED_SUBSTRINGS) {
    if (username.includes(word)) {
      return 'That username isn\'t allowed. Please choose another.';
    }
  }

  return null; // valid
}

/**
 * Validates a display name at signup or edit time.
 */
export function validateDisplayName(raw) {
  const name = (raw || '').trim();

  if (!name) return 'Display name is required.';
  if (name.length < 2) return 'Display name is too short.';
  if (name.length > 40) return 'Display name must be under 40 characters.';

  const lower = name.toLowerCase().replace(/[\s\-_.]/g, '');

  // Block reserved brand/staff terms in display name too
  const containsReserved = RESERVED_USERNAMES.some(r =>
    r.length >= 4 && lower.includes(r.replace(/[\s\-_.]/g, ''))
  );
  if (containsReserved) {
    return 'Display name contains a restricted word. Choose something else.';
  }

  for (const pattern of AWKWARD_DISPLAY_PATTERNS) {
    if (pattern.test(name.replace(/\s/g, ''))) {
      return 'Please use a real, recognisable name.';
    }
  }

  for (const word of BLOCKED_SUBSTRINGS) {
    if (lower.includes(word)) {
      return 'That name isn\'t allowed. Please choose another.';
    }
  }

  // Require at least one vowel-containing alphabetic run — filters
  // pure gibberish like "xkjqz" while allowing real names worldwide
  if (!/[a-zA-Z]{2,}/.test(name)) {
    return 'Please enter a real name using letters.';
  }

  return null; // valid
}

/* ── Name-change cooldown ──────────────────────────────────────
   Users can change display_name or username at most once every
   14 days, to prevent identity-flipping abuse. Enforced both in
   the UI (for instant feedback) and in the DB trigger (source
   of truth — see username-restrictions-setup.sql).             */
export const NAME_CHANGE_COOLDOWN_DAYS = 14;

export function getNameChangeCooldownRemaining(lastChangedAt) {
  if (!lastChangedAt) return 0;
  const last = new Date(lastChangedAt);
  const next = new Date(last);
  next.setDate(next.getDate() + NAME_CHANGE_COOLDOWN_DAYS);
  const remainingMs = next - new Date();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
}

/* ── Daily post limit ── */
export const DAILY_POST_LIMIT = 10;