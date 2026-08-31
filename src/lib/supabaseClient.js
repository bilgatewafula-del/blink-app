// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing Supabase env vars. Check .env file.');
}

/* ── CRITICAL FIX: global request timeout ──────────────────────
   Without this, on weak/dropped mobile connections (the exact
   scenario in the bug reports — low signal bars, voice-muted
   icon, slow networks) a fetch() can hang forever with no error
   ever thrown. That leaves React state stuck in "loading" with
   no way to recover — exactly the "skeleton forever" and
   "spinner forever" bugs.

   This wraps every Supabase HTTP call with a 12-second timeout.
   If the network doesn't respond in time, the request aborts
   and rejects with an error that the app's existing try/catch
   blocks can show + offer a retry button for.
──────────────────────────────────────────────────────────────── */
const REQUEST_TIMEOUT_MS = 12000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return fetch(url, { ...options, signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      return res;
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Network timeout — check your connection and try again.');
      }
      throw err;
    });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         'blink_v2_auth',
  },
  global: {
    headers: {
      'x-app-name': 'blink-v2',
      'Cache-Control': 'no-store',
      'Pragma':        'no-cache',
    },
    // TEMPORARILY REMOVED for diagnosis: `fetch: fetchWithTimeout`.
    // Both getSession() AND the posts query hung identically, with
    // zero network activity, only on the session-RESTORE path (not
    // fresh login). The one thing every single Supabase call shares
    // is this wrapper — and it only actually gets exercised for every
    // request once a session exists to attach, so it's the prime
    // suspect for interacting badly with Supabase's internal session
    // recovery. Testing without it to confirm before deciding on a
    // permanent fix.
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  db: {
    schema: 'public',
  },
});

/* ── Connection health check — used by screens that want to show
   "you're offline" instead of a stuck spinner ──
   Was hitting bare `/rest/v1/` with no headers — Supabase now
   deliberately blocks anon-key access to that exact root/spec path
   as a security change (confirmed current as of this fix — see
   Supabase's "Removing access to OpenAPI spec via the anon key"
   changelog), so it 401s unconditionally regardless of headers. That
   endpoint was never meant to be used as a health check to begin
   with. Pointed at a real, permitted, cheap query instead — HEAD on
   any table with a hard row limit costs almost nothing and actually
   reflects whether the API is reachable and your key works. */
export async function checkConnection() {
  try {
    const res = await fetchWithTimeout(SUPABASE_URL + '/rest/v1/users?select=id&limit=1', {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON },
    });
    return res.ok;
  } catch {
    return navigator.onLine;
  }
}