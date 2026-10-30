/* Offline cache: app shell is cached on install; cache-first afterwards. Bump VERSION on every release. */
const VERSION = 'wo-v2.0.0';
const ASSETS = [
  './', './index.html', './app.js', './engine.js', './data.js', './prt_tables.js', './programs.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png',
  './fonts/BarlowCondensed-SemiBold.woff2', './fonts/BarlowCondensed-Bold.woff2',
  './fonts/IBMPlexMono-Regular.woff2', './fonts/IBMPlexMono-SemiBold.woff2'
];
/* Install: cache the new shell. Upgrading from v1 (whose pages have no update banner) or a first install → activate at once.
   Upgrading from v2+ → wait until the page's "Update available – tap to reload" banner sends SKIP_WAITING. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache: 'reload'}))))
    .then(() => caches.keys()).then(keys => { if (!keys.some(k => k !== VERSION && /^wo-v([2-9]|\d\d)/.test(k))) return self.skipWaiting(); }));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    })
  );
});
