// Offline support. Bump VERSION whenever you change files, so installed copies refresh.
const VERSION = 'v3';
const CACHE = `daily-plan-${VERSION}`;
const SHELL = [
  '/', '/assets/css/app.css',
  '/assets/js/app.js', '/assets/js/i18n.js', '/assets/js/dates.js', '/assets/js/sync.js',
  '/assets/fonts/vazirmatn-arabic-400-normal.woff2', '/assets/fonts/vazirmatn-arabic-600-normal.woff2', '/assets/fonts/vazirmatn-arabic-800-normal.woff2',
  '/assets/fonts/vazirmatn-latin-400-normal.woff2', '/assets/fonts/vazirmatn-latin-600-normal.woff2', '/assets/fonts/vazirmatn-latin-800-normal.woff2',
  '/assets/fonts/caveat-latin-500-normal.woff2', '/assets/fonts/caveat-latin-700-normal.woff2',
  '/assets/fonts/gloock-latin-400-normal.woff2', '/assets/fonts/lalezar-arabic-400-normal.woff2',
  '/icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const url of SHELL) {
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (r.ok && !r.redirected) await c.put(url, r);
      } catch { /* offline during install: runtime caching will fill in */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first (always the latest version online), cached app as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (url.pathname === '/' && r.ok && !r.redirected) (await caches.open(CACHE)).put('/', r.clone());
        return r;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Static files: cache first, refresh in the background.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(async (r) => {
      if (r.ok && !r.redirected) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    }).catch(() => null);
    return cached || (await net) || Response.error();
  })());
});
