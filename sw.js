/* sw.js — CACHE KILL + SELF-UNREGISTER (v21.6)
   Fix for stale/broken cached assets where UI renders but taps/buttons don't work.
*/
const VERSION = "v21.6-kill";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}

    try { await self.registration.unregister(); } catch (e) {}

    try {
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        try { c.postMessage({ type: "SW_KILLED", version: VERSION }); } catch (e) {}
      }
    } catch (e) {}
  })());
});

// No fetch handler -> network default
