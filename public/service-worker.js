// public/service-worker.js
// B-Link Service Worker — Network First strategy

const CACHE_NAME = 'blink-v2.2.0';
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