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
    fetch: fetchWithTimeout,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  db: {
    schema: 'public',
  },
});

/* ── Connection health check — used by screens that want to show
   "you're offline" instead of a stuck spinner ── */
export async function checkConnection() {
  try {
    await fetchWithTimeout(SUPABASE_URL + '/rest/v1/', { method: 'HEAD' });
    return true;
  } catch {
    return navigator.onLine;
  }
}