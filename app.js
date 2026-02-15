// === app.js - Versione semplificata per test su telefono ===
(function() {
  "use strict";

  // Helper per selezionare elementi in modo sicuro
  const $ = (s) => document.querySelector(s);

  // Mostra un messaggio temporaneo
  function toast(msg, ms = 2000) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Funzioni minime di utilità
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // Variabili di stato
  let scanImg = null;         // per lo scanner (non usato ora)
  let selectedPhotos = [];    // anteprime

  // Mostra anteprime (semplificata)
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

  // Gestione file selezionato
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
        // Dopo 1 secondo simula OCR
        setTimeout(() => {
          const amount = $('#inAmount');
          const date = $('#inDate');
          if (amount) amount.value = '47,53';
          if (date) date.value = '2026-02-02';
          toast('OCR completato: importo e data inseriti');
        }, 1000);
      };
      img.src = url;
    } catch (e) {
      toast('Errore nel caricamento');
    }
  }

  // === Attacco eventi dopo il caricamento del DOM ===
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM pronto');

    // Apri modale aggiunta
    $('#fabAdd')?.addEventListener('click', () => {
      console.log('Apri modale');
      editId = null;
      selectedPhotos = [];
      scanImg = null;
      setPhotoPreview(null);
      $('#inAmount').value = '';
      $('#inDate').value = todayISO();
      $('#inCategory').value = 'Alimentari';
      $('#inNote').value = '';
      $('#modalAdd')?.classList.add('show');
    });

    // Chiudi modale
    $('#addClose')?.addEventListener('click', () => {
      $('#modalAdd')?.classList.remove('show');
    });

    // Pulsante fotocamera
    $('#btnReceiptCamera')?.addEventListener('click', () => {
      $('#inPhotoCam')?.click();
    });

    $('#inPhotoCam')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    // Pulsante galleria
    $('#btnReceiptGallery')?.addEventListener('click', () => {
      $('#inPhoto')?.click();
    });

    $('#inPhoto')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    // Pulsante OCR (offline)
    $('#btnOpenScanner')?.addEventListener('click', () => {
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      // Simula OCR (in realtà i campi sono già stati riempiti)
      toast('OCR eseguito manualmente');
    });

    // Pulsante Migliora foto
    $('#btnEnhancePhoto')?.addEventListener('click', () => {
      if (!scanImg) {
        toast('Prima seleziona una foto');
        return;
      }
      toast('Apertura scanner (simulato)');
    });

    // Pulsante Salva
    $('#btnSave')?.addEventListener('click', () => {
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
    });

    // Pulsante Pulisci
    $('#btnClear')?.addEventListener('click', () => {
      $('#inAmount').value = '';
      $('#inNote').value = '';
      $('#inPhoto').value = '';
      $('#inPhotoCam').value = '';
      setPhotoPreview(null);
      selectedPhotos = [];
      scanImg = null;
      toast('Campi puliti');
    });

    // Rimuovi foto
    $('#removePhoto')?.addEventListener('click', () => {
      $('#inPhoto').value = '';
      $('#inPhotoCam').value = '';
      setPhotoPreview(null);
      selectedPhotos = [];
      scanImg = null;
      toast('Foto rimossa');
    });

    // Toast di avvio
    setTimeout(() => toast('App pronta', 1500), 500);
  });
})();
