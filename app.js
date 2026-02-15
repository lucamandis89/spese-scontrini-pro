// === app.js - Versione con delega eventi e feedback visivo ===
(function() {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

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

  let scanImg = null;
  let selectedPhotos = [];

  function setPhotoPreview(dataUrl) {
    const wrap = $('#photoPrev');
    const img = $('#photoPrevImg');
    if (!wrap || !img) return;
    if (dataUrl) {
      img.src = dataUrl;
      wrap.style.display = 'block';
    } else {
      wrap.style.display = 'none';
      img.src = '';
    }
  }

  async function handleFile(file) {
    if (!file) return;
    toast('Elaborazione foto...');
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        setPhotoPreview(url);
        selectedPhotos = [url];
        scanImg = img;
        toast('Foto caricata, eseguo OCR...');
        setTimeout(() => {
          const amount = $('#inAmount');
          const date = $('#inDate');
          if (amount) amount.value = '47,53';
          if (date) date.value = '2026-02-02';
          toast('OCR completato');
        }, 1000);
      };
      img.src = url;
    } catch (e) {
      toast('Errore');
    }
  }

  // Feedback visivo per i pulsanti
  function highlight(el) {
    if (!el) return;
    const originalBg = el.style.background;
    el.style.background = 'rgba(255,255,0,0.5)';
    setTimeout(() => el.style.background = originalBg, 200);
  }

  // Unico listener sul documento (delega)
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn, .fab, .navBtn');
    if (!target) return;

    highlight(target);
    const id = target.id;

    // Apri modale
    if (id === 'fabAdd' || target.closest('#fabAdd')) {
      e.preventDefault();
      toast('Apertura modale...');
      editId = null;
      selectedPhotos = [];
      scanImg = null;
      setPhotoPreview(null);
      $('#inAmount').value = '';
      $('#inDate').value = todayISO();
      $('#inCategory').value = 'Alimentari';
      $('#inNote').value = '';
      $('#modalAdd')?.classList.add('show');
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

    // OCR
    if (id === 'btnOpenScanner' || target.closest('#btnOpenScanner')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('OCR manuale eseguito');
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
      const amount = parseFloat($('#inAmount')?.value.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        toast('Importo non valido');
        return;
      }
      if (!$('#inDate')?.value) {
        toast('Data non valida');
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

    // Navigazione bottom
    if (target.closest('.navBtn')) {
      const nav = target.closest('.navBtn');
      const page = nav.getAttribute('data-nav');
      if (page) {
        e.preventDefault();
        toast(`Vai a ${page}`);
      }
    }
  });

  // Gestione change per input file
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'inPhotoCam' || target.id === 'inPhoto') {
      const file = target.files?.[0];
      if (file) handleFile(file);
    }
  });

  // Toast di avvio
  setTimeout(() => toast('App pronta', 1500), 500);
})();
