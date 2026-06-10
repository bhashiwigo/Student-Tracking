/**
 * Rajarata Campus Life Manager - PWA Service Worker
 * Implements offline caching of frontend assets
 */

const CACHE_NAME = 'campus-life-cache-v10';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/manifest.json',
  '/assets/logo.png',
  '/js/app.js',
  '/js/database/db.js',
  '/js/services/backup.js',
  '/js/services/notifications.js',
  '/js/modules/academic.js',
  '/js/modules/exams.js',
  '/js/modules/practicals.js',
  '/js/modules/assignments.js',
  '/js/modules/gpa.js',
  '/js/modules/attendance.js',
  '/js/modules/sports.js',
  '/js/modules/study.js',
  '/js/modules/notes.js',
  '/js/modules/analytics.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('SW: Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Offline-first strategy: serve from cache, fallback to network
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Return resource or dynamic caching can occur here if desired
        return networkResponse;
      });
    }).catch(() => {
      // Fallback for HTML index if offline
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
