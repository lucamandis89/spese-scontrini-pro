PWA/APK - Spese & Scontrini PRO

CONTENUTO DELLA CARTELLA
- index.html, style.css, app.js  -> app
- manifest.webmanifest          -> manifest PWA (GitHub Pages)
- sw.js                         -> Service Worker anti-cache (offline + update)
- assets/                       -> icone + logo

COME PUBBLICARE SU GITHUB PAGES
1) Carica TUTTI questi file nella root della repo (spese-scontrini-pro)
2) Commit changes
3) GitHub -> Settings -> Pages -> Deploy from branch (main / root)
4) Apri: https://lucamandis89.github.io/spese-scontrini-pro/

PWA BUILDER -> APK (TWA)
1) Vai su PWA Builder
2) Incolla l'URL GitHub Pages
3) Genera Android (TWA)
4) Installa il pacchetto e testa: offline, PDF/CSV download, foto, scanner, documenti.

NOTE CACHE
- sw.js è versionato e cancella cache vecchie.
- Se pubblichi una nuova versione e NON la vedi subito: chiudi e riapri l'app oppure 'sblocca' dal task switcher.
