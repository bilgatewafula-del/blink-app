// deno-lint-ignore-file no-explicit-any
// B-Link identity rules powered by Namespace Guard (https://www.npmjs.com/package/namespace-guard, MIT).
// Pure logic: the Namespace Guard modules and the database lookups are injected, so this file runs
// unchanged in Supabase Edge Functions (Deno) and in the Node/Deno tests.

export type Rule = {
  id: string; kind: 'reserved' | 'protected_name' | 'decoration' | 'blocked_term' | 'allow_term';
  match_type: 'term' | 'exact' | 'substring' | 'regex'; value: string; category: string;
  severity: 'block' | 'review'; applies_to: 'username' | 'display_name' | 'both';
};
export type Overrides = { kind: 'username' | 'display_name'; value: string }[];
export type Deps = { ng: any; profanityEn: any };
export type Ctx = {
  userId: string | null; staff: boolean; overrides: Overrides; rules: Rule[];
  findUsername: (value: string) => Promise<string | null>;
};
export type Verdict = { ok: boolean; field: 'username' | 'display_name'; code?: string; message?: string; normalized?: string; suggestions?: string[] };

export const USERNAME_RE = /^[a-z0-9_.]+$/;
const CONTACT_RE = /https?:|www\.|\.(com|net|org|info|xyz|me|io|ke|co\.ke|app|tv|link|site|online)(\s|$)/i;
const DISPLAY_OK = /^[\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200C\u200D\uFE0F\u20E3\u{E0020}-\u{E007F} '’ʼ\-‐–.,&()!?_]+$/u;
const MIXED_WITH_LATIN = ['cyrillic', 'greek', 'armenian', 'cherokee', 'coptic'];

export function normalizeDisplay(raw: unknown): string {
  return String(raw ?? '').replace(/[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/g, ' ').trim().normalize('NFC');
}
const cpLen = (s: string) => [...s].length;

export function createEngine(deps: Deps, ctx: Ctx) {
  const { ng, profanityEn } = deps;
  const rulesFor = (field: string) => ctx.rules.filter((r) => r.applies_to === 'both' || r.applies_to === field);

  const allow = rulesFor('both').filter((r) => r.kind === 'allow_term').map((r) => r.value);
  const dbWords = (field: string) => rulesFor(field).filter((r) => r.kind === 'blocked_term' && r.match_type !== 'regex' && r.severity === 'block').map((r) => r.value);
  const protectedNames = (field: string) => rulesFor(field).filter((r) => r.kind === 'protected_name' && r.severity === 'block').map((r) => r.value.replace(/[^a-z0-9]/gi, '')).filter((v) => v.length >= 3);

  const invisible = ng.createInvisibleCharacterValidator({ rejectCombiningMarks: false });
  const englishProfanity = profanityEn({ mode: 'evasion', allowlist: allow });

  function profanityValidator(field: string) {
    const words = dbWords(field);
    const custom = words.length ? ng.createProfanityValidator(words, { mode: 'evasion', allowlist: allow, message: 'blocked' }) : null;
    return async (v: string, identifier: string) => {
      for (const check of [englishProfanity, custom]) {
        if (!check) continue;
        const r = await check(v, { identifier });
        if (r && r.available === false) return true;
      }
      return false;
    };
  }

  function buildGuard(field: 'username' | 'display_name', authorized: boolean) {
    const reserved: Record<string, string[]> = {};
    if (!authorized) {
      for (const r of rulesFor(field)) {
        if (r.kind === 'reserved' || (r.kind === 'protected_name' && r.severity === 'block')) {
          const v = field === 'username' ? r.value : r.value.replace(/[^a-z0-9]/gi, '').toLowerCase();
          if (v.length >= 2) (reserved[r.category || 'general'] ||= []).push(v);
        }
      }
    }
    return ng.createNamespaceGuard({
      reserved, sources: [{ name: 'users', column: 'username', idColumn: 'id', scopeKey: 'id' }],
      pattern: /^[a-z0-9_.]{3,20}$/, caseInsensitive: true,
      risk: { includeReserved: true, protect: authorized ? [] : protectedNames(field), leetspeak: true, blockThreshold: 70 },
      suggest: { strategy: ['sequential', 'random-digits', 'suffix-words'], max: 3 },
    }, { findOne: async (_s: unknown, value: string) => { const id = await ctx.findUsername(value); return id ? { id } : null; } });
  }

  const hasOverride = (kind: string, value: string) => ctx.overrides.some((o) => o.kind === kind && o.value === value.toLowerCase());

  async function checkUsername(raw: unknown): Promise<Verdict> {
    const f = 'username' as const; const v = String(raw ?? '');
    const bad = (code: string, message: string, extra: Partial<Verdict> = {}): Verdict => ({ ok: false, field: f, code, message, normalized: n, ...extra });
    const n: string = ng.normalize(v);
    if (!n) return bad('required', 'Enter a username.');
    if ((await invisible(v, { identifier: v })) !== null) return bad('invisible', 'That username contains hidden or invisible characters. Please choose another.');
    if (!USERNAME_RE.test(n)) {
      if (/[^\u0000-\u007f]/.test(n) && USERNAME_RE.test(String(ng.skeleton(n)).toLowerCase()))
        return bad('lookalike', 'That username uses look-alike characters. Use plain letters a–z, numbers, _ or . and choose another.');
      return bad('charset', 'Usernames can only use lowercase letters, numbers, underscores and periods. Please choose another.');
    }
    if (n.length < 3 || n.length > 20) return bad('length', 'Usernames must be 3–20 characters. Please choose another.');
    if (/^\.|\.$/.test(n)) return bad('period_edge', 'A username cannot start or end with a period. Please choose another.');
    if (/\.\./.test(n)) return bad('period_double', 'A username cannot contain two periods in a row. Please choose another.');
    if (/^[0-9_.]+$/.test(n)) return bad('numeric_only', 'A username needs at least one letter. Please choose another.');

    const authorized = ctx.staff || hasOverride(f, n);
    const guard = buildGuard(f, authorized);
    const res = await guard.check(n, ctx.userId ? { id: ctx.userId } : undefined);
    if (!res.available) {
      if (res.reason === 'taken') return bad('taken', 'That username is already taken. Please choose another.', { suggestions: res.suggestions || [] });
      if (res.reason === 'reserved') return bad('reserved', 'That name is reserved for official B-Link accounts. Please choose another.');
      return bad('charset', 'Usernames can only use lowercase letters, numbers, underscores and periods. Please choose another.');
    }
    if (!authorized) {
      const squashed = n.replace(/[._]+/g, '');   // blink_admin / b.link style separators do not hide a reserved name
      if (squashed !== n && squashed.length >= 2) {
        const again = await guard.check(squashed, ctx.userId ? { id: ctx.userId } : undefined);
        if (!again.available && again.reason === 'reserved') return bad('reserved', 'That name is reserved for official B-Link accounts. Please choose another.');
      }
      const risk = guard.enforceRisk(n, { failOn: 'block' });
      if (!risk.allowed) return bad('impersonation', 'That name looks too much like an official or protected account. Please choose another.');
    }
    if (!hasOverride(f, n) && (await profanityValidator(f)(n, n))) return bad('blocked', 'That name contains language that is not allowed on B-Link. Please choose another.');
    return { ok: true, field: f, normalized: n };
  }

  async function checkDisplayName(raw: unknown): Promise<Verdict> {
    const f = 'display_name' as const; const n = normalizeDisplay(raw);
    const bad = (code: string, message: string): Verdict => ({ ok: false, field: f, code, message, normalized: n });
    if (!n) return bad('required', 'Enter your name.');
    // joiners are legitimate inside emoji sequences and Persian/Indic words; anywhere else they are "invisible text" tricks
    const probe = n
      .replace(/(?<=\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)\u200D(?=\p{Extended_Pictographic})/gu, '')
      .replace(/(?<=[\p{L}\p{M}])\u200C(?=\p{L})/gu, '')
      .replace(/(?<=[\p{Extended_Pictographic}\p{N}])\uFE0F/gu, '')
      .replace(/\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}/gu, '');
    if ((await invisible(probe, { identifier: probe })) !== null || (n.match(/[\u200C\u200D]/g) || []).length > 8)
      return bad('invisible', 'That name contains hidden or invisible characters. Please remove them.');
    if (!DISPLAY_OK.test(n)) return bad('chars', 'That name contains characters that are not allowed. Please choose another.');
    if (cpLen(n) < 2 || cpLen(n) > 40) return bad('length', 'Names must be 2–40 characters. Please choose another.');
    if (/\p{M}{5,}/u.test(n)) return bad('chars', 'That name has too many stacked accent marks. Please choose another.');
    if (CONTACT_RE.test(n) || /[0-9]{9,}/.test(n.replace(/[\s.()\-]/g, ''))) return bad('contact_details', 'Names cannot contain links, emails or phone numbers. Please choose another.');

    for (const word of n.split(/[\s\-‐–.,&()!?_'’ʼ]+/).filter(Boolean)) {
      const scripts: string[] = ng.detectCrossScriptRisk(word).scripts || [];
      if (scripts.includes('latin') && scripts.some((s) => MIXED_WITH_LATIN.includes(s)))
        return bad('mixed_script', 'That name mixes letters from different alphabets in a way that looks deceptive. Please use one alphabet per word.');
    }
    if (hasOverride(f, n)) return { ok: true, field: f, normalized: n };
    const compact = n.toLowerCase().replace(/[\s\-‐–.,&()!?_'’ʼ]+/g, '');
    const prof = profanityValidator(f);
    if ((await prof(compact, n)) || (await Promise.all(n.split(/[\s\-‐–.,&()!?_'’ʼ]+/).filter(Boolean).map((w) => prof(w.toLowerCase(), w)))).some(Boolean))
      return bad('blocked', 'That name contains language that is not allowed on B-Link. Please choose another.');
    if (!ctx.staff) {
      const risk = buildGuard(f, false).enforceRisk(compact, { failOn: 'block' });
      if (!risk.allowed) return bad('impersonation', 'That name looks too much like an official or protected account. Please choose another.');
    }
    return { ok: true, field: f, normalized: n };
  }

  return { checkUsername, checkDisplayName };
}
