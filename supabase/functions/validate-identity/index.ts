// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: validate-identity
// The authoritative identity check for B-Link usernames and display names.
//   POST { action: 'check' | 'set' | 'complete', username?, display_name?, country? }
// Deploy:  npx supabase functions deploy validate-identity --no-verify-jwt --project-ref <ref>
// (JWTs are verified inside the function, so the public sign-up pre-check also works with the anon key.)
// Secrets used: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase and never leave the server.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as ng from 'npm:namespace-guard@0.23.0';
import { createEnglishProfanityValidator } from 'npm:namespace-guard@0.23.0/profanity-en';
import { createEngine, type Rule } from './identity-core.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// rules are cached for 60 s per warm instance so a burst of keystroke checks costs one query
let cache: { at: number; rules: Rule[] } | null = null;
async function loadRules(): Promise<Rule[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rules;
  const { data, error } = await admin.rpc('identity_rules_snapshot');
  if (error) throw new Error('rules: ' + error.message);
  cache = { at: Date.now(), rules: (data || []) as Rule[] };
  return cache.rules;
}

const str = (v: unknown, max = 100) => (typeof v === 'string' ? v.slice(0, max) : undefined);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, message: 'Invalid request' }, 400); }
  const action = body?.action;
  if (!['check', 'set', 'complete'].includes(action)) return json({ ok: false, message: 'Unknown action' }, 400);
  const username = str(body.username); const displayName = str(body.display_name, 120); const country = str(body.country, 5);

  // who is calling? (the user id ALWAYS comes from the verified token, never from the request body)
  let userId: string | null = null;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }
  if (action !== 'check' && !userId) return json({ ok: false, code: 'auth', message: 'Please sign in again.' }, 401);

  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    const { error: rl } = await admin.rpc('identity_rate_limit', { p_bucket: 'idf:' + (userId || ip), p_max: action === 'check' ? 90 : 20 });
    if (rl) return json({ ok: false, code: 'rate_limit', message: 'Too many attempts. Please wait a minute and try again.' }, 429);

    const [rules, ctxRes] = await Promise.all([loadRules(), userId ? admin.rpc('identity_context', { p_user: userId }) : Promise.resolve({ data: null })]);
    const c: any = ctxRes.data || { staff: false, overrides: [] };
    const engine = createEngine({ ng, profanityEn: createEnglishProfanityValidator }, {
      userId, staff: !!c.staff, overrides: c.overrides || [], rules,
      findUsername: async (v) => { const { data } = await admin.rpc('identity_find_username', { p_value: v }); return (data as string) || null; },
    });

    const results: Record<string, any> = {};
    if (username !== undefined) results.username = await engine.checkUsername(username);
    if (displayName !== undefined) results.display_name = await engine.checkDisplayName(displayName);
    const first = Object.values(results).find((r: any) => !r.ok) as any;

    // the database is the second, independent opinion (configurable rules, impersonation, review flags)
    if (!first) {
      for (const [kind, value] of [['username', username], ['display_name', displayName]] as const) {
        if (value === undefined) continue;
        const { data } = await admin.rpc('identity_evaluate', { p_kind: kind, p_value: value, p_user: userId, p_check_unique: kind === 'username' });
        if (data && data.ok === false) results[kind] = { ok: false, field: kind, code: data.code, message: data.message, normalized: data.normalized };
        else if (data?.flag) results[kind].flagged = true;
      }
    }
    const failed = Object.values(results).find((r: any) => !r.ok) as any;

    if (failed) {
      if (userId && action !== 'check') {
        await admin.rpc('identity_log_decision', { p_user: userId, p_kind: failed.field, p_value: failed.field === 'username' ? username : displayName, p_outcome: 'rejected', p_code: failed.code, p_category: null });
      }
      return json({ ok: false, field: failed.field, code: failed.code, message: failed.message, suggestions: failed.suggestions || [], results });
    }
    if (action === 'check') return json({ ok: true, results });

    const { data: applied, error } = await admin.rpc('identity_apply_profile', {
      p_user: userId, p_username: username ?? null, p_display_name: displayName ?? null, p_country: country ?? null,
      p_mode: action === 'complete' ? 'complete' : 'update',
    });
    if (error) return json({ ok: false, code: 'server', message: 'Could not save your name right now. Please try again.' }, 500);
    if (applied && applied.ok === false) return json({ ok: false, field: applied.field, code: applied.code, message: applied.message, results });
    return json({ ok: true, applied: true, results, username: applied.username, display_name: applied.display_name });
  } catch (e) {
    console.error('validate-identity', e);
    return json({ ok: false, code: 'server', message: 'The name check is unavailable. Please try again.' }, 500);
  }
});
