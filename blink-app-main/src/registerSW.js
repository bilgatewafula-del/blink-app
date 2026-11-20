// src/registerSW.js
// Smart service worker registration with automatic update detection.
// Import this once in src/index.js

const SW_URL = '/service-worker.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, {
        // updateViaCache: 'none' forces the browser to ALWAYS check the network
        // for a new service worker — never serve the SW from browser cache.
        // This is what prevents stale JS after deployment.
        updateViaCache: 'none',
      });

      console.log('[SW] Registered:', registration.scope);

      // Check for updates immediately and then every 60 seconds
      registration.update();
      setInterval(() => registration.update(), 60000);

      // Timers freeze while an installed PWA is suspended in the background.
      // Re-check for a new version every time the app is brought back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update();
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — tell the new SW to activate immediately
            // and then force-reload all tabs to get the fresh bundle
            console.log('[SW] New version available — activating...');
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // When a new SW takes over, reload the page so users get fresh JS
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] Controller changed — reloading for fresh bundle...');
          window.location.reload();
        }
      });

    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });
}

// Unregister all service workers and clear all caches.
// Call this from Settings or when users report stale content.
export async function clearAllCaches() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  console.log('[SW] All caches cleared');
}