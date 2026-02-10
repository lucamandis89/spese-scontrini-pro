/**
 * sw.js — FORCE UPDATE + CLEAR CACHE
 * Serve per sbloccare GitHub Pages quando rimane la versione vecchia.
 * - Cancella tutte le cache
 * - Attiva subito la nuova versione
 * - Non usa cache (network-only)
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// NETWORK ONLY: sempre online, così vedi subito aggiornamenti
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
