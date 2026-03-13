/**
 * Service Worker — aggressive update strategy.
 * 
 * Strategy:
 * - HTML (navigation): NETWORK-FIRST with 3s timeout, fallback to cache
 * - JS/CSS (hashed assets): CACHE-FIRST (immutable, Vite adds content hash)
 * - API calls: NETWORK-ONLY (never cache LLM/OpenRouter)
 * - Images/fonts: STALE-WHILE-REVALIDATE
 * 
 * Update behavior:
 * - skipWaiting() + clients.claim() → activate immediately, no reload prompt
 * - Cache version bumped every build (BUILD_ID injected by Vite)
 * - Old caches deleted on activate
 * - Clients notified via postMessage when update applied
 */

const CACHE_VERSION = '__BUILD_ID__'  // replaced at build time
const CACHE_NAME = `rc-v${CACHE_VERSION}`
const CACHE_ASSETS = `rc-assets-v1`  // hashed assets are immutable

// === INSTALL — precache shell ===
self.addEventListener('install', (event) => {
  console.log(`[SW] Install — ${CACHE_NAME}`)
  // Skip waiting immediately — don't wait for old SW to die
  self.skipWaiting()

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Precache the HTML shell only — JS/CSS are hashed and cached on fetch
      return cache.addAll(['/'])
    })
  )
})

// === ACTIVATE — clean old caches + claim clients ===
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activate — ${CACHE_NAME}`)

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== CACHE_ASSETS)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`)
            return caches.delete(key)
          })
      )
    }).then(() => {
      // Claim all open tabs immediately — no need for user to refresh
      return self.clients.claim()
    }).then(() => {
      // Notify all clients that a new version is active
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION,
          })
        })
      })
    })
  )
})

// === FETCH — strategy per request type ===
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip API calls — never cache LLM responses
  if (url.hostname.includes('openrouter.ai') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('openlibrary.org')) {
    return
  }

  // Skip chrome-extension, data URIs, etc.
  if (!url.protocol.startsWith('http')) return

  // === CDN scripts (pdf.js, epub.js) — cache-first ===
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(event.request, CACHE_ASSETS))
    return
  }

  // === Hashed assets (JS/CSS with content hash) — cache-first (immutable) ===
  if (url.pathname.startsWith('/assets/') && url.pathname.match(/\.[a-f0-9]{8,}\./)) {
    event.respondWith(cacheFirst(event.request, CACHE_ASSETS))
    return
  }

  // === Navigation requests (HTML) — network-first with timeout ===
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(networkFirst(event.request, CACHE_NAME, 3000))
    return
  }

  // === Images, manifest, icons — stale-while-revalidate ===
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|json)$/)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME))
    return
  }

  // === Everything else — network-first ===
  event.respondWith(networkFirst(event.request, CACHE_NAME, 5000))
})

// === Strategies ===

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName)

  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])

    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached || new Response('Offline — pas de cache disponible', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  // Revalidate in background
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  }).catch(() => null)

  // Return cached immediately, or wait for network
  return cached || await fetchPromise || new Response('Offline', { status: 503 })
}

// === Handle messages from clients ===
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'SW_VERSION',
      version: CACHE_VERSION,
    })
  }
})
