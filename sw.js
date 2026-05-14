const CACHE_NAME = 'kandang-azs-v3';

// Core app shell — always cached
const CORE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// CDN libraries — cached on first successful fetch
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

// ============ INSTALL ============
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Best-effort: jika offline saat install, lewati saja
      return Promise.allSettled(CORE_URLS.map(url => cache.add(url)));
    })
  );
});

// ============ ACTIVATE ============
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ============ FETCH ============
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // hanya cache GET

  const url = new URL(req.url);
  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  // ---- 1. HTML: Network-first with cache fallback ----
  // Penting: HANYA cache response 200, JANGAN 404
  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then(response => {
          // ✅ Hanya cache response 200 OK (bukan 404/5xx)
          if (response && response.status === 200 && response.type !== 'opaque') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
            return response;
          }
          // 404/5xx → coba fallback ke cache
          return caches.match(req)
            .then(cached => cached || caches.match('/index.html'))
            .then(cached => cached || response);
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // ---- 2. CDN Libraries: Cache-first dengan background update ----
  if (CDN_HOSTS.some(host => url.hostname === host)) {
    event.respondWith(
      caches.match(req).then(cached => {
        // Cache-first: kalau ada cache, langsung pakai
        if (cached) {
          // Background refresh (silent)
          fetch(req).then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(req, response.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        // Belum di-cache, fetch & cache untuk next time
        return fetch(req).then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ---- 3. Same-origin static (CSS, JS, images): Cache-first ----
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // ---- 4. Other (Supabase, API): Network-only, NO cache ----
  // Penting: jangan cache Supabase API calls!
  // Default browser fetch — biarkan lewat tanpa intervention
});
