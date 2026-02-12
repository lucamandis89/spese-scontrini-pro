const CACHE_NAME = 'ssp-cache-v32.9-test';
/* UI_XL_BUILD: 2026-02-12 v30.0 CLEAN-PRO */
/* UI_XL_BUILD: 2026-02-12 ICONS-XXL */
/* UI_XL_BUILD: 2026-02-11 */
/* sw.js — BASE OFFLINE (v21.9)
   Caches only the app shell (safe for APK/PWA Builder).
*/
const VERSION = "32.9-test";
const CACHE = `ssp-shell-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/logo.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k.startsWith("ssp-shell-") && k !== CACHE) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

function isStaticAsset(url) {
  const p = url.pathname;
  return p.endsWith(".css") || p.endsWith(".js") || p.endsWith(".png") || p.endsWith(".jpg") ||
         p.endsWith(".jpeg") || p.endsWith(".svg") || p.endsWith(".webp") || p.endsWith(".ico") ||
         p.endsWith(".json") || p.endsWith(".webmanifest");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, fallback to cached index
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match("./index.html")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Static: cache-first + background update
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const cache = await caches.open(CACHE);

      const update = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      const fresh = await update;
      return fresh || new Response("", { status: 504 });
    })());
    return;
  }

  // Everything else: network-only (safer)
});
