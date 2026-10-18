/* Nobody Left Behind: offline service worker.
 * - App shell + built assets are cached so the field app opens with no connection.
 * - Map tiles and fonts are cached as they are viewed, so areas already seen stay usable offline.
 * - API traffic (Supabase, Open-Meteo, Telegram) is NEVER cached: writes go through the IndexedDB outbox instead.
 */
const VERSION = 'nlb-v1'
const SHELL = `${VERSION}-shell`
const TILES = `${VERSION}-tiles`
const ASSETS = `${VERSION}-assets`
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.svg']
const CACHEABLE_CROSS_ORIGIN = ['basemaps.cartocdn.com', 'tile.openstreetmap.org', 'tiles.openfreemap.org', 'fonts.googleapis.com', 'fonts.gstatic.com', 'api.maptiler.com']
const MAX_TILES = 600

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.allSettled(SHELL_URLS.map((u) => c.add(u)))).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && (res.ok || res.type === 'opaque')) {
    cache.put(request, res.clone())
    if (cacheName === TILES) trim(TILES, MAX_TILES)
  }
  return res
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const net = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => hit)
  return hit || net
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS') return
  event.waitUntil(
    caches.open(ASSETS).then((c) => Promise.allSettled((event.data.urls || []).map((u) => c.add(u)))),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin !== self.location.origin) {
    if (CACHEABLE_CROSS_ORIGIN.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
      event.respondWith(cacheFirst(req, url.hostname.includes('fonts') ? ASSETS : TILES).catch(() => Response.error()))
    }
    return // everything else (Supabase, Open-Meteo...) goes straight to the network
  }

  // Page navigations: network first, fall back to the cached shell (single-page app).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()),
    )
    return
  }

  event.respondWith(staleWhileRevalidate(req, ASSETS).then((r) => r || Response.error()))
})
