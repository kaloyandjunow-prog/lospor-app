// Minimal service worker — replaces the previous @ducanh2912/next-pwa generated SW.
// Clears all caches from the old SW (which may have cached stale auth redirects)
// and passes every fetch through to the network unchanged.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})
// No fetch handler — all requests go straight to the network.
