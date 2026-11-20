// src/lib/pwa.js — "install the app" support and a clean "get the latest version"
import { useEffect, useState } from 'react';

let deferred = null;
const subs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f(true)); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f(false)); });
}

export const isInstalled = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstallPrompt() {
  const [can, setCan] = useState(!!deferred);
  useEffect(() => { subs.add(setCan); setCan(!!deferred); return () => subs.delete(setCan); }, []);
  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; setCan(false);
    return outcome === 'accepted';
  };
  return { canInstall: can, install };
}

export async function reloadLatest() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
    if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
  } catch { /* reload anyway */ }
  window.location.reload();
}
