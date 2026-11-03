/*
 * Development-only service worker.
 * It exists so the browser treats the app as installable while you develop (the install
 * button and Chrome's install icon appear), but it caches NOTHING: every request goes to
 * the network, so hot reload and fresh code are never affected.
 * The real offline-capable worker is /sw.js, registered only in production builds.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // network only
});
