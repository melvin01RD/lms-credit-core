/* Only explicitly public assets may enter this cache. Never cache application
   HTML, Next.js RSC payloads, APIs, documents, or user data. No payment queue. */
const CACHE = 'lms-public-v1';
const PUBLIC_ASSETS = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('lms-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) || fetch(request, { cache: 'no-store' })));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.open(CACHE).then((cache) => cache.match('/offline.html'))));
  }
});
