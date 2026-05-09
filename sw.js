const CACHE_NAME = 'kandang-azs-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: HTML selalu coba network dulu agar update GitHub/Vercel cepat masuk.
self.addEventListener('fetch', event => {
  const req = event.request;
  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    new URL(req.url).pathname.endsWith('/index.html');

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match(req).then(response => response || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req)
      .then(response => {
        return response || fetch(req);
      })
  );
});
