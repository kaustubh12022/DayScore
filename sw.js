/**
 * DayScore Service Worker
 * Caches all app assets for offline use.
 */

const CACHE_NAME = 'dayscore-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/storage.js',
    '/js/app.js',
    '/js/export.js',
    '/js/firebase-sync.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install: Cache all static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Activate immediately
    self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Serve from cache first, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip Firebase/Firestore API calls — always go to network
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version, but also update cache in background
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            // Not in cache — fetch from network
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return networkResponse;
            });
        })
    );
});
