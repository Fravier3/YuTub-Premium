const CACHE = 'yutu-premium-v1.0.0';
const PRECACHE = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/api.js', 'js/store.js', 'js/icons.js',
  'manifest.webmanifest', 'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API y miniaturas: red directa
  if (url.pathname.endsWith('version.json')) { e.respondWith(fetch(req, { cache: 'no-store' })); return; }
  const networkFirst = req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (networkFirst) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(CACHE).then(x => x.put(req, c)); return n; })));
  }
});
