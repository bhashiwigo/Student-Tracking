/**
 * Rajarata Campus Life Manager - PWA Service Worker
 * Network-first strategy: always fetch fresh, fallback to cache when offline.
 */

// Version bump කරන්නකෝ app update කරද්දී (v11, v12, ...)
const CACHE_NAME = 'campus-life-cache-v11';

// Core shell assets only — dynamic JS modules auto-cached on request
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/manifest.json',
];

// ── Install: core assets pre-cache (fail-safe) ──────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching core assets');
      // addAll ව්‍යර්ථ වෙලා SW install break නොකරන්න Promise.allSettled use කරනවා
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`SW: Failed to cache ${url}:`, err)
          )
        )
      );
    }).then(() => {
      console.log('SW: Install complete, skipping waiting');
      return self.skipWaiting(); // නව SW එක ඕනෑම් activate වෙන්න
    })
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('SW: Purging old cache:', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => {
      console.log('SW: Activated, claiming clients');
      return self.clients.claim(); // open tabs ද නව SW ෙලා switch කරනවා
    })
  );
});

// ── Fetch: Network-first, cache fallback ────────────────────────────────────
self.addEventListener('fetch', (e) => {
  // Chrome extensions හා non-GET requests skip කරනවා
  if (
    e.request.method !== 'GET' ||
    e.request.url.startsWith('chrome-extension://')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Network සාර්ථකනම් — cache update කරලා return කරනවා
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline — cache ෙලා fallback
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('SW: Offline fallback for:', e.request.url);
            return cachedResponse;
          }
          // Navigate requests ට index.html fallback
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

