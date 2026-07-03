// public/service-worker.js
// B-Link Service Worker — Network First strategy
// Bump CACHE_NAME on every deployment to force cache invalidation

const CACHE_NAME = 'blink-v2.1.0';
const OFFLINE_FALLBACK = '/index.html';

const PRECACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API/auth/realtime calls — always go to network
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/realtime/')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML navigation — always network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(OFFLINE_FALLBACK))
    );
    return;
  }

  // JS/CSS — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res?.status === 200) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});