/**
 * sw.js — FORCE UPDATE + CLEAR CACHE
 * Versione speciale per GitHub Pages:
 * - Cancella tutte le cache vecchie
 * - Forza sempre il download della versione aggiornata
 * - Evita che la webapp rimanga "bloccata" su grafica vecchia
 */

self.addEventListener("install", (event) => {
  // installazione immediata
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // cancella tutte le cache precedenti
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// NETWORK ONLY: non usa cache, così prende sempre la versione nuova
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
