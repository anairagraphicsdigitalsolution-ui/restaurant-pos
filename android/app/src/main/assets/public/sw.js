const CACHE = "anaira-shell-v22"
const OFFLINE = "/offline.html"
const CORE = ["/", "/login", "/order", "/billing", "/kitchen", "/staff", "/dashboard", "/dashboard/delivery", OFFLINE]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      for (const url of CORE) {
        try {
          const response = await fetch(url, { cache: "no-store" })
          if (response.ok) await cache.put(url, response)
        } catch {}
      }
    })
  )
  self.skipWaiting()
})

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.resolve(self.registration.navigationPreload?.enable()).catch(() => {})
      .then(() => caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith("anaira-shell-") && key !== CACHE).map(key => caches.delete(key))
      )))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("sync", event => {
  if (event.tag === "anaira-mobile-sync") {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: "window" })
        .then(clients => clients.forEach(client => client.postMessage({ type: "ANAIRA_SYNC_REQUEST", reason: "background-sync" })))
    )
  }
})

function sameOrigin(url) { return url.origin === self.location.origin }
function isApi(pathname) { return pathname === "/api" || pathname.startsWith("/api/") }
function isNextAsset(pathname) { return pathname.startsWith("/_next/") }

self.addEventListener("fetch", event => {
  const request = event.request
  const url = new URL(request.url)
  if (!sameOrigin(url)) return

  // POST/PUT/PATCH/DELETE are deliberately passed through. The in-page
  // AndroidOfflineApiBridge handles offline mutations because it can access
  // the same Capacitor local DB layer as the application.
  if (request.method !== "GET") return

  // API reads: network-first, cached response fallback. This preserves the
  // current server behavior while allowing already-seen API responses to be
  // displayed offline for non-mutating pages.
  if (isApi(url.pathname)) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {}))
        return response
      }).catch(() => caches.match(request).then(cached => cached || new Response(JSON.stringify({ success: true, offline: true, orders: [], deliveries: [] }), { status: 200, headers: { "Content-Type": "application/json" } })))
    )
    return
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      (event.preloadResponse ? event.preloadResponse.then(r => r || fetch(request)) : fetch(request)).then(response => {
        if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {}))
        return response
      }).catch(() => caches.match(request).then(cached => cached || caches.match("/").then(root => root || caches.match(OFFLINE))))
    )
    return
  }

  if (isNextAsset(url.pathname) || ["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const refresh = fetch(request).then(response => {
          if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {}))
          return response
        }).catch(() => cached)
        return cached || refresh
      })
    )
    return
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)))
})
