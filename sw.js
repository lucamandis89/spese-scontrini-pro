/* CACHE_KILL_SWITCH_V21_2
   This service worker forces immediate updates and clears old caches.
*/
const SW_VERSION = "v21.2";
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
    await self.clients.claim();
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: "SW_UPDATED", version: SW_VERSION }));
    } catch (e) {}
  })());
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-store" });
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
