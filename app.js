// === app.js - v37.5 con toast di debug ===
(function() {
  "use strict";

  const BUILD_ID = "v37.5_20260215120000";
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
  let editId = null;

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
    toast('handleFile iniziato');
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        setPhotoPreview(url);
        selectedPhotos = [url];
        scanImg = img;
        toast('Foto pronta, OCR in 1s');
        setTimeout(() => {
          const amount = $('#inAmount');
          const date = $('#inDate');
          if (amount) amount.value = '47,53';
          if (date) date.value = '2026-02-02';
          toast('OCR simulato');
        }, 1000);
      };
      img.src = url;
    } catch (e) {
      toast('Errore handleFile');
    }
  }

  function highlight(el) {
    if (!el) return;
    el.style.background = 'rgba(255,255,0,0.5)';
    setTimeout(() => el.style.background = '', 200);
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn, .fab, .navBtn');
    if (!target) return;

    highlight(target);
    const id = target.id;
    toast('Click su ' + (id || 'pulsante senza id'));

    if (id === 'fabAdd' || target.closest('#fabAdd')) {
      e.preventDefault();
      toast('Apro modale');
      editId = null;
      selectedPhotos = [];
      scanImg = null;
      setPhotoPreview(null);
      const inAmount = $('#inAmount');
      if (inAmount) inAmount.value = '';
      const inDate = $('#inDate');
      if (inDate) inDate.value = todayISO();
      const inCategory = $('#inCategory');
      if (inCategory) inCategory.value = 'Alimentari';
      const inNote = $('#inNote');
      if (inNote) inNote.value = '';
      const modal = $('#modalAdd');
      if (modal) {
        modal.classList.add('show');
        toast('Modale aperto');
      } else {
        toast('Modale non trovato');
      }
      return;
    }

    if (id === 'addClose' || target.closest('#addClose')) {
      e.preventDefault();
      $('#modalAdd')?.classList.remove('show');
      toast('Modale chiuso');
      return;
    }

    if (id === 'btnReceiptCamera' || target.closest('#btnReceiptCamera')) {
      e.preventDefault();
      const input = $('#inPhotoCam');
      if (input) {
        input.click();
        toast('Click su input camera');
      } else {
        toast('input camera non trovato');
      }
      return;
    }

    if (id === 'btnReceiptGallery' || target.closest('#btnReceiptGallery')) {
      e.preventDefault();
      const input = $('#inPhoto');
      if (input) {
        input.click();
        toast('Click su input gallery');
      } else {
        toast('input gallery non trovato');
      }
      return;
    }

    if (id === 'btnOpenScanner' || target.closest('#btnOpenScanner')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Nessuna foto');
        return;
      }
      toast('OCR manuale');
      return;
    }

    if (id === 'btnEnhancePhoto' || target.closest('#btnEnhancePhoto')) {
      e.preventDefault();
      if (!scanImg) {
        toast('Nessuna foto');
        return;
      }
      toast('Scanner simulato');
      return;
    }

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
      toast('Salvataggio simulato');
      $('#modalAdd')?.classList.remove('show');
      return;
    }

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

    if (target.closest('.navBtn')) {
      const nav = target.closest('.navBtn');
      const page = nav.getAttribute('data-nav');
      if (page) {
        e.preventDefault();
        toast('Navigazione: ' + page);
      }
    }
  });

  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'inPhotoCam' || target.id === 'inPhoto') {
      toast('File selezionato');
      const file = target.files?.[0];
      if (file) handleFile(file);
    }
  });

  setTimeout(() => toast('App pronta (debug)', 1500), 500);
})();
