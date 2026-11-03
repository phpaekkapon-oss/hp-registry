/*
 * Service worker: makes the app installable and lets the shell open offline.
 *
 * Privacy rule: /api/* is NEVER cached or intercepted. Patient data only ever comes
 * from the network (and the app's own sign-out clears what it keeps on the device).
 * This worker stores static files only (HTML shell, JS/CSS, fonts, icons).
 *
 * Bump CACHE_VERSION to force clients to drop old caches.
 */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `his-static-${CACHE_VERSION}`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

// Build output files carry a content hash in the name, so they can be cached forever
const HASHED_ASSET = /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('his-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only, never stored

  // Page loads: network first (always the newest app), fall back to the cached shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  // Hashed build files and fonts: cache first
  if (HASHED_ASSET.test(url.pathname) || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else that is static (icons, manifest): serve cached, refresh in the background
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
