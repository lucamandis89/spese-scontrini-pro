/* Spese & Scontrini PRO - Service Worker (anti-cache) 20260210185738 */
const CACHE_VERSION = "20260210185738";
const CACHE_NAME = `ssp-cache-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k.startsWith("ssp-cache-") && k !== CACHE_NAME) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;

  const isNav = r.mode === "navigate" || (r.headers.get("accept") || "").includes("text/html");

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(r, { ignoreSearch: isNav });

    const fetchP = fetch(r).then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(r, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      e.waitUntil(fetchP);
      return cached;
    }

    const net = await fetchP;
    if (net) return net;

    if (isNav) {
      const fb = await cache.match("./index.html");
      if (fb) return fb;
    }

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});

self.addEventListener("message", (e) => {
  if (!e.data) return;
  if (e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data.type === "CLEAR_ALL_CACHES") {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
});
