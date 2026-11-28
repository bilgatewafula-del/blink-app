// src/lib/identityClient.js
// Talks to the validate-identity Edge Function (Namespace Guard + database rules).
// Light by design: no heavy Unicode tables ship to the phone — the server does the deep checks.
// If the Edge Function is not reachable (not deployed yet / offline) it falls back to the database
// functions, which enforce the same rules, so sign-up and profile editing never break.
import { supabase } from './supabaseClient';

const FN = 'validate-identity';
const TIMEOUT_MS = 9000;

const withTimeout = (p, ms = TIMEOUT_MS) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Returns the function's JSON answer, or null when the function cannot be reached. */
async function callEdge(body) {
  try {
    const { data, error } = await withTimeout(supabase.functions.invoke(FN, { body }));
    if (data && typeof data === 'object' && 'ok' in data) return data;
    if (error?.context?.json) {
      const j = await error.context.json().catch(() => null);
      if (j && typeof j === 'object' && 'ok' in j) return j;
    }
    return null;
  } catch {
    return null;
  }
}

function fromDbVerdict(v, field) {
  if (!v) return null;
  return v.ok ? { ok: true, field } : { ok: false, field, code: v.code, message: v.message, suggestions: [] };
}

/** Parse the readable message + code a database exception carries. */
export function dbErrorToVerdict(err, field) {
  const message = err?.message || 'That name is not allowed. Please choose another.';
  const code = err?.details || (/taken|duplicate|unique/i.test(message) ? 'taken' : 'blocked');
  return { ok: false, field: field || 'username', code, message: /duplicate|unique/i.test(message) ? 'That username is already taken. Please choose another.' : message, suggestions: [] };
}

/** Pre-check names without saving anything. Works signed-out (sign-up screen). Returns { ok, field, code, message, suggestions, available } or null if no check was possible. */
export async function checkIdentity({ username, displayName } = {}) {
  const body = { action: 'check' };
  if (username !== undefined) body.username = username;
  if (displayName !== undefined) body.display_name = displayName;
  const edge = await callEdge(body);
  if (edge) return edge;

  // fallback: the database pre-check (same rule engine, without the extra Unicode analysis)
  try {
    const { data, error } = await withTimeout(supabase.rpc('identity_precheck', {
      p_username: username === undefined ? null : username, p_display_name: displayName === undefined ? null : displayName,
    }));
    if (error || !data) return null;
    const u = fromDbVerdict(data.username, 'username'); const d = fromDbVerdict(data.display_name, 'display_name');
    return [u, d].find((r) => r && !r.ok) || { ok: true };
  } catch {
    return null;
  }
}

/** Save the signed-in user's own username and/or display name (validated on the server). */
export async function saveIdentity({ username, displayName }) {
  const body = { action: 'set' };
  if (username !== undefined) body.username = username;
  if (displayName !== undefined) body.display_name = displayName;
  const edge = await callEdge(body);
  if (edge) return edge;
  try {
    const { data, error } = await withTimeout(supabase.rpc('identity_set_own', {
      p_username: username === undefined ? null : username, p_display_name: displayName === undefined ? null : displayName,
    }));
    if (error) return dbErrorToVerdict(error, username !== undefined ? 'username' : 'display_name');
    return data || { ok: true };
  } catch (e) {
    return { ok: false, code: 'network', message: 'Could not reach B-Link. Check your connection and try again.' };
  }
}

/** Create the profile for a verified account that has none yet. */
export async function completeIdentity({ username, displayName, country }) {
  const edge = await callEdge({ action: 'complete', username, display_name: displayName, country });
  if (edge) return edge;
  try {
    const { error } = await withTimeout(supabase.rpc('complete_profile', { p_username: username, p_display_name: displayName, p_country: country }));
    if (error) return dbErrorToVerdict(error, 'username');
    return { ok: true };
  } catch {
    return { ok: false, code: 'network', message: 'Could not reach B-Link. Check your connection and try again.' };
  }
}

/** Ask the moderators to review a rejected name. */
export async function submitIdentityAppeal(kind, value, message) {
  const { error } = await supabase.rpc('identity_submit_appeal', { p_kind: kind, p_value: value, p_message: message || null });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** One sentence for the UI: the reason plus up to three alternative usernames. */
export function explain(v) {
  if (!v || v.ok) return '';
  const s = (v.suggestions || []).filter(Boolean).slice(0, 3);
  return s.length ? `${v.message} Try: ${s.join(', ')}` : v.message;
}
