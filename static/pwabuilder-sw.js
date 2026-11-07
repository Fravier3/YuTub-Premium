// Service worker de Yutu Premium. Sube VERSION en cada publicación.
const VERSION = '1.0.9'
const CACHE = `yutu-premium-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('index.html').catch(() => {})).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yutu-premium-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // API de Invidious, miniaturas y video: siempre red directa
  if (url.origin !== self.location.origin) return

  const isDocument = req.mode === 'navigate' || /(^|\/)(index\.html)?$/.test(url.pathname) || url.pathname.endsWith('pwabuilder-sw.js')
  if (isDocument) {
    // Red primero; sin conexión, la versión guardada
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    )
    return
  }
  // Recursos con hash y estáticos: caché primero, y se actualizan en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }).catch(() => cached)
      return cached || network
    })
  )
})
