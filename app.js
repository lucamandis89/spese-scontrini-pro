// === app.js - v38.0 FINALE con debug visivo ===
(function() {
  "use strict";

  // === CACHE BUSTING ===
  const BUILD_ID = "v38.0_20260215180000";
  (async () => {
    try {
      const prev = localStorage.getItem("__ssp_build_id") || "";
      if (prev !== BUILD_ID) {
        localStorage.setItem("__ssp_build_id", BUILD_ID);
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if (!sessionStorage.getItem("__ssp_reloaded_once")) {
          sessionStorage.setItem("__ssp_reloaded_once", "1");
          location.reload();
        }
      }
    } catch (e) {}
  })();

  const $ = (s) => document.querySelector(s);

  function toast(msg, ms = 2000) {
    const t = $('#toast');
    if (!t) {
      alert(msg);
      return;
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  let scanImg = null;
  let selectedPhotos = [];
  let editId = null;

  // === ANTEPRIMA CON DEBUG ===
  function setPhotoPreview(dataUrl) {
    const wrap = $('#photoPrev');
    const img = $('#photoPrevImg');
    if (!wrap) {
      toast('ERRORE: #photoPrev mancante');
      return;
    }
    if (!img) {
      toast('ERRORE: #photoPrevImg mancante');
      return;
    }
    if (dataUrl) {
      wrap.setAttribute('style', 
        'display: block !important; ' +
        'background: rgba(255,0,0,0.2) !important; ' +
        'padding: 10px !important; ' +
        'border: 3px solid red !important; ' +
        'margin: 10px 0 !important;'
      );
      img.setAttribute('style',
        'max-width: 100% !important; ' +
        'max-height: 200px !important; ' +
        'display: block !important; ' +
        'margin: 0 auto !important; ' +
        'border: 2px solid green !important;'
      );
      img.src = dataUrl;
      toast('Anteprima impostata (bordo rosso+verde)');
      img.onload = () => {
        toast(`Immagine OK: ${img.naturalWidth}x${img.naturalHeight}`);
      };
      img.onerror = () => {
        toast('ERRORE: immagine non valida');
      };
    } else {
      wrap.style.display = 'none';
      img.src = '';
      toast('Anteprima nascosta');
    }
  }

  // === GESTIONE FILE ===
  async function handleFile(file) {
    toast('handleFile: inizio');
    if (!file) {
      toast('Nessun file');
      return;
    }
    toast(`File: ${file.name}, tipo: ${file.type}, size: ${file.size}`);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        toast(`Immagine caricata: ${img.width}x${img.height}`);
        setPhotoPreview(url);
        selectedPhotos = [url];
        scanImg = img;
        toast('Foto pronta, OCR in 1s');
        setTimeout(() => {
          const amount = $('#inAmount');
          const date = $('#inDate');
          if (amount) amount.value = '47,53';
          if (date) date.value = '2026-02-02';
          toast('OCR simulato: importo e data inseriti');
        }, 1000);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast('Errore nel caricamento dell\'immagine');
      };
      img.src = url;
    } catch (e) {
      toast('Eccezione: ' + e.message);
    }
  }

  function highlight(el) {
    if (!el) return;
    const original = el.style.background;
    el.style.background = 'rgba(255,255,0,0.5)';
    setTimeout(() => el.style.background = original, 200);
  }

  // === LISTENER GLOBALE ===
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn, .fab, .navBtn');
    if (!target) return;

    highlight(target);
    const id = target.id;
    toast(`Click su #${id || 'sconosciuto'}`);

    // FAB AGGIUNGI
    if (id === 'fabAdd' || target.closest('#fabAdd')) {
      e.preventDefault();
      toast('Apertura modale...');
      editId = null;
      selectedPhotos = [];
      scanImg = null;
      setPhotoPreview(null);
      if ($('#inAmount')) $('#inAmount').value = '';
      if ($('#inDate')) $('#inDate').value = todayISO();
      if ($('#inCategory')) $('#inCategory').value = 'Alimentari';
      if ($('#inNote')) $('#inNote').value = '';
      const modal = $('#modalAdd');
      if (modal) {
        modal.classList.add('show');
        toast('Modale aperto');
      } else {
        toast('ERRORE: #modalAdd non trovato');
      }
      return;
    }

    // CHIUDI MODALE
    if (id === 'addClose' || target.closest('#addClose')) {
      e.preventDefault();
      $('#modalAdd')?.classList.remove('show');
      toast('Modale chiuso');
      return;
    }

    // FOTO CAMERA
    if (id === 'btnReceiptCamera' || target.closest('#btnReceiptCamera')) {
      e.preventDefault();
      const input = $('#inPhotoCam');
      if (input) {
        input.click();
        toast('Click su input camera');
      } else {
        toast('ERRORE: #inPhotoCam non trovato');
      }
      return;
    }

    // ALLEGA GALLERIA
    if (id === 'btnReceiptGallery' || target.closest('#btnReceiptGallery')) {
      e.preventDefault();
      const input = $('#inPhoto');
      if (input) {
        input.click();
        toast('Click su input gallery');
      } else {
        toast('ERRORE: #inPhoto non trovato');
      }
      return;
    }

    // OCR (offline)
    if (id === 'btnOpenScanner' || target.closest('#btnOpenScanner')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('OCR manuale eseguito (simulato)');
      return;
    }

    // MIGLIORA FOTO
    if (id === 'btnEnhancePhoto' || target.closest('#btnEnhancePhoto')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('Apertura scanner (simulato)');
      return;
    }

    // SALVA
    if (id === 'btnSave' || target.closest('#btnSave')) {
      e.preventDefault();
      const amountVal = $('#inAmount')?.value;
      if (!amountVal) {
        toast('Importo mancante');
        return;
      }
      const amount = parseFloat(amountVal.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        toast('Importo non valido');
        return;
      }
      if (!$('#inDate')?.value) {
        toast('Data mancante');
        return;
      }
      toast('Spesa salvata (simulato)');
      $('#modalAdd')?.classList.remove('show');
      return;
    }

    // PULISCI
    if (id === 'btnClear' || target.closest('#btnClear')) {
      e.preventDefault();
      $('#inAmount').value = '';
      $('#inNote').value = '';
      $('#inPhoto').value = '';
      $('#inPhotoCam').value = '';
      setPhotoPreview(null);
      selectedPhotos = [];
      scanImg = null;
      toast('Campi puliti');
      return;
    }

    // RIMUOVI FOTO
    if (id === 'removePhoto' || target.closest('#removePhoto')) {
      e.preventDefault();
      $('#inPhoto').value = '';
      $('#inPhotoCam').value = '';
      setPhotoPreview(null);
      selectedPhotos = [];
      scanImg = null;
      toast('Foto rimossa');
      return;
    }

    // NAVIGAZIONE BOTTOM
    if (target.closest('.navBtn')) {
      const nav = target.closest('.navBtn');
      const page = nav.getAttribute('data-nav');
      if (page) {
        e.preventDefault();
        toast('Navigazione: ' + page);
      }
    }
  });

  // === GESTIONE INPUT FILE ===
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'inPhotoCam' || target.id === 'inPhoto') {
      toast('File selezionato (change)');
      const file = target.files?.[0];
      if (file) handleFile(file);
    }
  });

  // === VERIFICA ELEMENTI PRINCIPALI ALL'AVVIO ===
  setTimeout(() => {
    const required = ['fabAdd', 'modalAdd', 'inPhoto', 'inPhotoCam', 'btnSave', 'photoPrev', 'photoPrevImg'];
    required.forEach(id => {
      if (!$(`#${id}`)) toast(`ATTENZIONE: #${id} mancante nel DOM`, 3000);
    });
    toast('App pronta (debug visivo)');
  }, 1000);
})();
