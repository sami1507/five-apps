// Service worker for Hireboard: caches the app so it opens offline.
// Network first (so updates arrive quickly), falling back to the cached copy.
const CACHE = 'job-tracker-783e743837';
const ASSETS = [
  "./app.js",
  "./icons/app.ico",
  "./icons/apple-icon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css",
  "../shared/ui.css",
  "../shared/ui.js",
  "../shared/ai.js",
  "../shared/store.js",
  "../shared/register-sw.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
  );
});
