self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first by default. A fetch listener also makes the app installable
// as a PWA in browsers that still require one.
self.addEventListener("fetch", () => {});
