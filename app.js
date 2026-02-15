// === app.js - VERSIONE FINALE STABILE ===
(function() {
  "use strict";

  // === CACHE BUSTING: forza il ricaricamento se la build cambia ===
  const BUILD_ID = "v39.0_20260215220000";
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

  // === HELPER ===
  const $ = (s) => document.querySelector(s);

  function toast(msg, ms = 2000) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // === STATO ===
  let scanImg = null;
  let selectedPhotos = [];
  let editId = null;

  // === ANTEPRIMA FOTO ===
  function setPhotoPreview(dataUrl) {
    const wrap = $('#photoPrev');
    const img = $('#photoPrevImg');
    if (!wrap || !img) {
      toast('ERRORE: elementi anteprima mancanti');
      return;
    }
    if (dataUrl) {
      wrap.style.display = 'block';
      img.src = dataUrl;
      img.onload = () => toast('Anteprima OK');
      img.onerror = () => toast('ERRORE caricamento anteprima');
    } else {
      wrap.style.display = 'none';
      img.src = '';
    }
  }

  // === GESTIONE FILE (usando FileReader per dataURL persistente) ===
  async function handleFile(file) {
    toast('Elaborazione file...');
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          setPhotoPreview(dataUrl);
          selectedPhotos = [dataUrl];
          scanImg = img;
          toast('Foto caricata, OCR in corso...');
          // Simula OCR dopo 1 secondo
          setTimeout(() => {
            const amount = $('#inAmount');
            const date = $('#inDate');
            if (amount) amount.value = '47,53';
            if (date) date.value = '2026-02-02';
            toast('OCR completato (simulato)');
          }, 1000);
        };
        img.onerror = () => toast('Immagine non valida');
        img.src = dataUrl;
      };
      reader.onerror = () => toast('Errore lettura file');
      reader.readAsDataURL(file);
    } catch (e) {
      toast('Errore: ' + e.message);
    }
  }

  // === FEEDBACK VISIVO SUI PULSANTI ===
  function highlight(el) {
    if (!el) return;
    const original = el.style.background;
    el.style.background = 'rgba(255,255,0,0.5)';
    setTimeout(() => el.style.background = original, 200);
  }

  // === LISTENER GLOBALE (DELEGA) ===
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn, .fab, .navBtn');
    if (!target) return;

    highlight(target);
    const id = target.id;

    // FAB Aggiungi spesa
    if (id === 'fabAdd' || target.closest('#fabAdd')) {
      e.preventDefault();
      editId = null;
      selectedPhotos = [];
      scanImg = null;
      setPhotoPreview(null);
      $('#inAmount').value = '';
      $('#inDate').value = todayISO();
      $('#inCategory').value = 'Alimentari';
      $('#inNote').value = '';
      $('#modalAdd')?.classList.add('show');
      toast('Modale aperto');
      return;
    }

    // Chiudi modale
    if (id === 'addClose' || target.closest('#addClose')) {
      e.preventDefault();
      $('#modalAdd')?.classList.remove('show');
      return;
    }

    // Pulsante fotocamera
    if (id === 'btnReceiptCamera' || target.closest('#btnReceiptCamera')) {
      e.preventDefault();
      $('#inPhotoCam')?.click();
      return;
    }

    // Pulsante galleria
    if (id === 'btnReceiptGallery' || target.closest('#btnReceiptGallery')) {
      e.preventDefault();
      $('#inPhoto')?.click();
      return;
    }

    // OCR manuale
    if (id === 'btnOpenScanner' || target.closest('#btnOpenScanner')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('OCR manuale eseguito (simulato)');
      return;
    }

    // Migliora foto
    if (id === 'btnEnhancePhoto' || target.closest('#btnEnhancePhoto')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('Apertura scanner (simulato)');
      return;
    }

    // Salva
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

    // Pulisci
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

    // Rimuovi foto
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

    // Navigazione bottom bar
    if (target.closest('.navBtn')) {
      const nav = target.closest('.navBtn');
      const page = nav.getAttribute('data-nav');
      if (page) {
        e.preventDefault();
        toast('Navigazione: ' + page);
      }
    }
  });

  // === GESTIONE SELEZIONE FILE ===
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'inPhotoCam' || target.id === 'inPhoto') {
      const file = target.files?.[0];
      if (file) handleFile(file);
    }
  });

  // === VERIFICA ELEMENTI PRINCIPALI E AVVIO ===
  setTimeout(() => {
    const required = ['fabAdd', 'modalAdd', 'inPhoto', 'inPhotoCam', 'btnSave', 'photoPrev', 'photoPrevImg'];
    required.forEach(id => {
      if (!$(`#${id}`)) console.warn(`Elemento #${id} mancante nel DOM`);
    });
    toast('App pronta');
  }, 1000);
})();
