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
  /^[^\p{L}\p{N}\s]{3,}$/u,                  // mostly symbols, no letters
  /^\d+$/,                                 // pure numbers as a display name
];

/* ── Profanity / slur baseline list kept intentionally short and
   server-agnostic; extend via admin tools as needed ── */

/**
 * Validates a username at signup or edit time.
 * Returns null if valid, or an error string describing the problem.
 */
export function validateUsername(raw) {
  const username = (raw || '').trim().toLowerCase();

  if (!username) return 'Username is required.';
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    return 'Username must be 3–20 characters: lowercase letters, numbers, underscores and periods.';
  }
  if (/^\.|\.$/.test(username)) return 'A username cannot start or end with a period.';
  if (/\.\./.test(username)) return 'A username cannot contain two periods in a row.';
  if (/^[0-9_.]+$/.test(username)) return 'A username needs at least one letter.';

  // Reserved / impersonation / abusive names are decided by the server (Namespace Guard +
  // the editable rules in Admin → Identity). The old blunt "contains a reserved word" rule
  // blocked ordinary names such as "teamwork", so it was removed.
  if (RESERVED_USERNAMES.includes(username)) {
    return 'That username is reserved and cannot be used.';
  }

  for (const pattern of GIBBERISH_PATTERNS) {
    if (pattern.test(username)) {
      return 'Please choose a real, recognisable username.';
    }
  }

  // abusive words: checked on the server (Scunthorpe-safe) — see identityClient.js

  return null; // valid
}

/**
 * Validates a display name at signup or edit time.
 */
export function validateDisplayName(raw) {
  const name = (raw || '').trim();

  if (!name) return 'Display name is required.';
  const chars = [...name].length;   // count characters, not UTF-16 units (emoji, Arabic, Chinese)
  if (chars < 2) return 'Display name is too short.';
  if (chars > 40) return 'Display name must be under 40 characters.';

  // Impersonation and reserved words in display names are checked by the server (see identityClient.js).

  for (const pattern of AWKWARD_DISPLAY_PATTERNS) {
    if (pattern.test(name.replace(/\s/g, ''))) {
      return 'Please use a real, recognisable name.';
    }
  }

  // Needs at least one letter in ANY script (Arabic, Chinese, Cyrillic, accents… are all fine)
  if (!/\p{L}/u.test(name)) {
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