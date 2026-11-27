// public/service-worker.js
// B-Link Service Worker — Network First strategy

const CACHE_NAME = 'blink-v2.5.0';   // bumped: push notifications
const OFFLINE_FALLBACK = '/index.html';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept non-GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Never intercept Supabase, Cloudinary, or API calls.
  // Let the browser handle them directly.
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/realtime/')
  ) {
    return;
  }

  // HTML navigation — network first, cache fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // IMPORTANT:
          // Clone synchronously BEFORE returning the original response.
          if (res && res.status === 200) {
            const cacheResponse = res.clone();

            event.waitUntil(
              caches.open(CACHE_NAME)
                .then((cache) =>
                  cache.put(event.request, cacheResponse)
                )
            );
          }

          return res;
        })
        .catch(() => caches.match(OFFLINE_FALLBACK))
    );

    return;
  }

  // Hashed build files (/static/...) never change, so serve them from the
  // cache first — instant on every open after the first — and only go to
  // the network on a miss. HTML is never stored or served as an asset.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((res) => {
          const type = (res && res.headers.get('content-type')) || '';

          if (res && res.status === 200 && type.includes('text/html')) {
            return new Response('', { status: 404, statusText: 'Not Found' });
          }

          if (res && res.status === 200) {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then(async (cache) => {
                await cache.put(event.request, copy);
                // Keep the cache bounded across many deploys (oldest first).
                const keys = await cache.keys();
                const extra = keys.length - 150;
                for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
              })
            );
          }

          return res;
        });
      })
    );
    return;
  }

  // JS/CSS/assets — network first, cache fallback.
  //
  // Vercel rewrites every unknown path to /index.html with a 200. After a
  // deploy, a stale page asking for an old hashed chunk would therefore get
  // HTML back "successfully", and we would cache it as if it were JS —
  // leaving the app stuck on a blank screen until site data is cleared.
  // So: never cache or pass through an HTML response for a non-navigation
  // request; answer 404 so the page's error handling can recover.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const type = (res && res.headers.get('content-type')) || '';

        if (res && res.status === 200 && type.includes('text/html')) {
          return new Response('', { status: 404, statusText: 'Not Found' });
        }

        if (res && res.status === 200) {
          const cacheResponse = res.clone();

          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) =>
                cache.put(event.request, cacheResponse)
              )
          );
        }

        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((keys) =>
          Promise.all(
            keys.map((key) => caches.delete(key))
          )
        )
    );
  }
});

/* ═══════════════════════════════════════════════
   PUSH NOTIFICATIONS
═══════════════════════════════════════════════ */
const ICON = '/logo192.png';

// Only same-origin paths are ever opened from a notification.
function safeUrl(u) {
  try {
    const url = new URL(u || '/notifications', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : '/notifications';
  } catch (e) { return '/notifications'; }
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }

  event.waitUntil((async () => {
    // Home-screen badge count (supported browsers only)
    try {
      if (typeof data.unread === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
        await (data.unread > 0 ? self.navigator.setAppBadge(data.unread) : self.navigator.clearAppBadge());
      }
    } catch (e) { /* badge is optional */ }

    // If B-Link is open and in front, the app already shows it live — don't double-alert.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible' && c.focused)) return;

    await self.registration.showNotification(String(data.title || 'B-Link').slice(0, 80), {
      body: String(data.body || '').slice(0, 200),
      icon: ICON,
      badge: ICON,
      tag: data.tag || undefined,
      renotify: !!data.renotify && !!data.tag,
      timestamp: data.ts || Date.now(),
      data: { url: safeUrl(data.url) },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);

  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: 'PUSH_NAVIGATE', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// The browser rotated the subscription: tell any open page to re-register it.
// (If no page is open, the app re-registers on its next launch.)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => wins.forEach((c) => c.postMessage({ type: 'PUSH_RESUBSCRIBE' })))
  );
});
