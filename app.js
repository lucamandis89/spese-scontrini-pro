// === app.js - FINALE CON LISTENER DIRETTI E ALERT ===
(function() {
  "use strict";

  // === CACHE BUSTING ===
  const BUILD_ID = "v40.0_20260215230000";
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
    if (!t) {
      alert('TOAST: ' + msg);
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

  // === STATO ===
  let scanImg = null;
  let selectedPhotos = [];
  let editId = null;

  function setPhotoPreview(dataUrl) {
    const wrap = $('#photoPrev');
    const img = $('#photoPrevImg');
    if (!wrap || !img) {
      toast('ERRORE: #photoPrev o #photoPrevImg mancanti');
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

  // === ATTACCO LISTENER DOPO IL CARICAMENTO DEL DOM ===
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded: inizio attacco listener');
    alert('DOM caricato, attacco listener...');

    // FAB Aggiungi spesa
    const fabAdd = $('#fabAdd');
    if (fabAdd) {
      fabAdd.addEventListener('click', function(e) {
        e.preventDefault();
        alert('FAB ADD cliccato');
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
          toast('ERRORE: #modalAdd non trovato');
        }
      });
    } else {
      console.error('#fabAdd non trovato');
      alert('ERRORE: #fabAdd mancante');
    }

    // Chiudi modale
    const addClose = $('#addClose');
    if (addClose) {
      addClose.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Chiudi modale');
        $('#modalAdd')?.classList.remove('show');
      });
    } else {
      console.error('#addClose non trovato');
    }

    // Pulsante fotocamera
    const btnCamera = $('#btnReceiptCamera');
    const inPhotoCam = $('#inPhotoCam');
    if (btnCamera && inPhotoCam) {
      btnCamera.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante fotocamera cliccato');
        inPhotoCam.click();
      });
      inPhotoCam.addEventListener('change', function(e) {
        const file = e.target.files?.[0];
        if (file) {
          alert('File selezionato da fotocamera');
          handleFile(file);
        }
      });
    } else {
      if (!btnCamera) console.error('#btnReceiptCamera non trovato');
      if (!inPhotoCam) console.error('#inPhotoCam non trovato');
    }

    // Pulsante galleria
    const btnGallery = $('#btnReceiptGallery');
    const inPhoto = $('#inPhoto');
    if (btnGallery && inPhoto) {
      btnGallery.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante galleria cliccato');
        inPhoto.click();
      });
      inPhoto.addEventListener('change', function(e) {
        const file = e.target.files?.[0];
        if (file) {
          alert('File selezionato da galleria');
          handleFile(file);
        }
      });
    } else {
      if (!btnGallery) console.error('#btnReceiptGallery non trovato');
      if (!inPhoto) console.error('#inPhoto non trovato');
    }

    // OCR manuale
    const btnOcr = $('#btnOpenScanner');
    if (btnOcr) {
      btnOcr.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante OCR cliccato');
        if (!scanImg) {
          toast('Prima seleziona una foto');
          return;
        }
        toast('OCR manuale eseguito (simulato)');
      });
    } else {
      console.error('#btnOpenScanner non trovato');
    }

    // Migliora foto
    const btnEnhance = $('#btnEnhancePhoto');
    if (btnEnhance) {
      btnEnhance.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante Migliora foto cliccato');
        if (!scanImg) {
          toast('Prima seleziona una foto');
          return;
        }
        toast('Apertura scanner (simulato)');
      });
    } else {
      console.error('#btnEnhancePhoto non trovato');
    }

    // Salva
    const btnSave = $('#btnSave');
    if (btnSave) {
      btnSave.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante Salva cliccato');
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
      });
    } else {
      console.error('#btnSave non trovato');
    }

    // Pulisci
    const btnClear = $('#btnClear');
    if (btnClear) {
      btnClear.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante Pulisci cliccato');
        $('#inAmount').value = '';
        $('#inNote').value = '';
        $('#inPhoto').value = '';
        $('#inPhotoCam').value = '';
        setPhotoPreview(null);
        selectedPhotos = [];
        scanImg = null;
        toast('Campi puliti');
      });
    } else {
      console.error('#btnClear non trovato');
    }

    // Rimuovi foto
    const btnRemove = $('#removePhoto');
    if (btnRemove) {
      btnRemove.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Pulsante Rimuovi foto cliccato');
        $('#inPhoto').value = '';
        $('#inPhotoCam').value = '';
        setPhotoPreview(null);
        selectedPhotos = [];
        scanImg = null;
        toast('Foto rimossa');
      });
    } else {
      console.error('#removePhoto non trovato');
    }

    // Navigazione bottom (opzionale, non fondamentale per il test)
    const navBtns = document.querySelectorAll('.navBtn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const page = this.getAttribute('data-nav');
        alert('Navigazione verso: ' + page);
        toast('Navigazione: ' + page);
      });
    });

    toast('App pronta (listener diretti)');
    alert('Tutti i listener sono stati attaccati');
  });
})();
