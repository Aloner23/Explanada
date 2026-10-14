// No-op Service Worker — Replaces any old caching SW.
// On web/mobile, index.html unregisters this immediately.
// On Electron, this stays registered for offline support.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    // Clear all old caches from previous SW versions
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});
// No fetch handler — all requests pass through to network
