// src/lib/presence.js
// Accurate online / last-seen.
//
//  • Realtime Presence (ephemeral): someone is online ONLY while their app is
//    open and connected. Closing the app or losing signal removes them within
//    seconds — nothing can get "stuck online".
//  • last_seen is stamped every minute while the app is visible and once more
//    when the app is hidden/closed.
//  • The old `is_online` column is ignored on the client because nothing ever
//    reset it. "Online" = in presence, or last_seen within the last 90 seconds.
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export const ONLINE_WINDOW_MS = 90 * 1000;
const BEAT_MS = 60 * 1000;

let currentUserId = null;
let channel = null;
let timer = null;
let onlineIds = new Set();
let accessToken = null;
let rpcOk = true;
let authSub = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(onlineIds));

async function beat(online) {
  if (!currentUserId) return;
  const now = new Date().toISOString();
  if (rpcOk) {
    const { error } = await supabase.rpc('set_presence', { p_online: online });
    if (!error) return;
    if (/does not exist|could not find/i.test(error.message || '')) rpcOk = false;
  }
  await supabase.from('users').update({ last_seen: now, is_online: online }).eq('id', currentUserId);
}

// Fires while the page is being torn down: keepalive fetch survives unload.
function beatOnUnload() {
  if (!currentUserId || !accessToken) return;
  const base = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!base || !key) return;
  const headers = { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  try {
    if (rpcOk) {
      fetch(`${base}/rest/v1/rpc/set_presence`, { method: 'POST', keepalive: true, headers, body: JSON.stringify({ p_online: false }) });
    } else {
      fetch(`${base}/rest/v1/users?id=eq.${currentUserId}`, {
        method: 'PATCH', keepalive: true, headers,
        body: JSON.stringify({ last_seen: new Date().toISOString(), is_online: false }),
      });
    }
  } catch { /* nothing more we can do while unloading */ }
}

function onVisibility() {
  if (!channel) return;
  if (document.visibilityState === 'visible') {
    channel.track({ online_at: new Date().toISOString() }).catch(() => {});
    beat(true);
  } else {
    channel.untrack().catch(() => {});
    beat(false);
  }
}

export function startPresence(userId) {
  if (!userId || currentUserId === userId) return;
  stopPresence();
  currentUserId = userId;

  supabase.auth.getSession().then(({ data }) => { accessToken = data?.session?.access_token || null; });
  authSub = supabase.auth.onAuthStateChange((_e, session) => { accessToken = session?.access_token || null; });

  channel = supabase.channel('presence:global', { config: { presence: { key: userId } } });
  channel
    .on('presence', { event: 'sync' }, () => {
      onlineIds = new Set(Object.keys(channel.presenceState()));
      emit();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && document.visibilityState === 'visible') {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

  beat(document.visibilityState === 'visible');
  timer = setInterval(() => { if (document.visibilityState === 'visible') beat(true); }, BEAT_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', beatOnUnload);
}

export function stopPresence() {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', beatOnUnload);
  if (authSub?.data?.subscription) authSub.data.subscription.unsubscribe();
  authSub = null;
  if (channel) { supabase.removeChannel(channel); channel = null; }
  onlineIds = new Set();
  currentUserId = null;
  emit();
}

/* React hook: the live set of online user ids */
export function useOnlineIds() {
  const [ids, setIds] = useState(onlineIds);
  useEffect(() => {
    const fn = (next) => setIds(new Set(next));
    listeners.add(fn);
    setIds(new Set(onlineIds));
    return () => listeners.delete(fn);
  }, []);
  return ids;
}

export function isUserOnline(user, ids) {
  if (!user) return false;
  if (ids && user.id && ids.has(user.id)) return true;
  if (!user.last_seen) return false;
  return Date.now() - new Date(user.last_seen).getTime() < ONLINE_WINDOW_MS;
}

/* "Last seen today at 14:05", "yesterday", weekday, or date */
export function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'Offline';
  const d = new Date(lastSeen);
  if (Number.isNaN(d.getTime())) return 'Offline';
  const now = new Date();
  const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return `Last seen today at ${time}`;
  if (days === 1) return `Last seen yesterday at ${time}`;
  if (days < 7) return `Last seen ${d.toLocaleDateString('en-KE', { weekday: 'long' })} at ${time}`;
  return `Last seen ${d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}`;
}
