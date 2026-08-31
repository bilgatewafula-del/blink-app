// public/service-worker.js
// B-Link Service Worker — Network First strategy

const CACHE_NAME = 'blink-v2.1.2';
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
          const cacheResponse = res.clone();

          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) =>
                cache.put(event.request, cacheResponse)
              )
          );

          return res;
        })
        .catch(() => caches.match(OFFLINE_FALLBACK))
    );

    return;
  }

  // JS/CSS/assets — network first, cache fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          // IMPORTANT:
          // Clone synchronously while the response body is still unused.
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