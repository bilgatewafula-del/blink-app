// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing Supabase env vars. Check .env file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         'blink_v2_auth',
  },
  // Disable Supabase's built-in caching that causes stale data in Chrome
  global: {
    headers: {
      'x-app-name': 'blink-v2',
      // Prevent browser caching of API responses
      'Cache-Control': 'no-store',
      'Pragma':        'no-cache',
    },
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  db: {
    schema: 'public',
  },
});