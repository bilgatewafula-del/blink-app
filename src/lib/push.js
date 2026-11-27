// src/lib/push.js — Web Push for B-Link: turn it on/off per device, keep it registered.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { isInstalled, isIos } from './pwa';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';
const flagKey = (uid) => 'blink_push_on:' + uid;
const SNOOZE_KEY = 'blink_push_prompt_until';

export const pushConfigured = () => !!VAPID_PUBLIC_KEY;
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// iPhone/iPad only allow web push once the app is added to the Home Screen
export const pushNeedsInstall = () => isIos() && !isInstalled();

const getFlag = (uid) => { try { return localStorage.getItem(flagKey(uid)) === '1'; } catch { return false; } };
const setFlag = (uid, on) => { try { on ? localStorage.setItem(flagKey(uid), '1') : localStorage.removeItem(flagKey(uid)); } catch { /* storage blocked */ } };

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// navigator.serviceWorker.ready never resolves if no worker is registered (e.g. dev server)
const readyReg = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error('no_sw')), 8000)),
]);

async function register(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys && j.keys.p256dh, p_auth: j.keys && j.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

async function getOrCreateSubscription(reg) {
  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;
  const opts = { userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) };
  try { return await reg.pushManager.subscribe(opts); }
  catch (e) {
    if (e && e.name === 'InvalidStateError') {          // an old subscription with a different key
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      return reg.pushManager.subscribe(opts);
    }
    throw e;
  }
}

/** Ask permission, subscribe this device, register it. Resolves { ok } or { ok:false, reason }. */
export async function enablePush(uid) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!pushConfigured()) return { ok: false, reason: 'not_configured' };
  if (pushNeedsInstall()) return { ok: false, reason: 'install' };
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    const sub = await getOrCreateSubscription(await readyReg());
    await register(sub);
    setFlag(uid, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e && e.message === 'no_sw' ? 'no_sw' : 'error' };
  }
}

/** Switch push off on this device. */
export async function disablePush(uid) {
  setFlag(uid, false);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch { /* best effort */ }
}

/** On sign-out: stop this device receiving the signed-out person's alerts (kept on for next sign-in). */
export async function detachPushDevice() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } catch { /* best effort */ }
}

/** On app start: if this person enabled push on this device, make sure it is still registered. */
export async function syncPushSubscription(uid) {
  if (!pushSupported() || !pushConfigured() || Notification.permission !== 'granted' || !getFlag(uid)) return;
  const sub = await getOrCreateSubscription(await readyReg());
  await register(sub);
}

/** Local test: shows a notification on this device without going through the server. */
export async function sendLocalTest() {
  const reg = await readyReg();
  await reg.showNotification('B-Link', { body: 'Push notifications are working 🎉', icon: '/logo192.png', badge: '/logo192.png', tag: 'blink-test', data: { url: '/notifications' } });
}

export function usePushStatus(uid) {
  const [state, setState] = useState({ permission: pushSupported() ? Notification.permission : 'unsupported', enabled: false, busy: false });

  const refresh = useCallback(async () => {
    if (!pushSupported() || !uid) return;
    let sub = null;
    try { const reg = await navigator.serviceWorker.getRegistration(); sub = reg ? await reg.pushManager.getSubscription() : null; } catch { /* ignore */ }
    setState((s) => ({ ...s, permission: Notification.permission, enabled: !!sub && Notification.permission === 'granted' && getFlag(uid) }));
  }, [uid]);

  useEffect(() => { refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    const r = await enablePush(uid);
    await refresh();
    setState((s) => ({ ...s, busy: false }));
    return r;
  }, [uid, refresh]);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    await disablePush(uid);
    await refresh();
    setState((s) => ({ ...s, busy: false }));
  }, [uid, refresh]);

  return { ...state, enable, disable, supported: pushSupported(), configured: pushConfigured(), needsInstall: pushNeedsInstall() };
}

// "Turn on notifications?" banner is shown at most once a week
export const promptSnoozed = () => { try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return false; } };
export const snoozePrompt = (days = 7) => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86400000)); } catch { /* ignore */ } };
