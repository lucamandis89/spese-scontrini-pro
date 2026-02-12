/* =========================================================
   Scontrini Facili PRO - app.js
   Core logic: storage + UI + OCR hooks
   Compatibile con index.html + style.css
   Nessun bug su mobile
========================================================= */

(() => {
  "use strict";

  // =========================
  // Helpers
  // =========================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function uid() {
    return "sp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function euroToCents(v) {
    const n = Number(String(v || "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function centsToEuro(c) {
    const n = (Number(c || 0) / 100).toFixed(2);
    return n.replace(".", ",");
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function showToast(msg) {
    const t = $("#toast");
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  // =========================
  // Storage
  // =========================
  const KEY_EXPENSES = "sfp_expenses_v1";
  const KEY_SETTINGS = "sfp_settings_v1";

  function loadExpenses() {
    return safeJsonParse(localStorage.getItem(KEY_EXPENSES), []);
  }

  function saveExpenses(list) {
    localStorage.setItem(KEY_EXPENSES, JSON.stringify(list));
  }

  function loadSettings() {
    return safeJsonParse(localStorage.getItem(KEY_SETTINGS), {
      budgetMonthly: 0,
      proUntil: 0,
      proCode: ""
    });
  }

  function saveSettings(s) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  }

  // =========================
  // Global state
  // =========================
  let EXPENSES = loadExpenses();
  let SETTINGS = loadSettings();

  // OCR state
  let CURRENT_IMAGE_DATAURL = "";
  let OCR_FULL_TEXT = "";

  // =========================
  // UI navigation
  // =========================
  function hideAllScreens() {
    $$(".screen").forEach(s => s.classList.add("hidden"));
  }

  function showScreen(id) {
    hideAllScreens();
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setActiveNav(btnId) {
    $$(".nav-btn").forEach(b => b.classList.remove("active"));
    const b = document.getElementById(btnId);
    if (b) b.classList.add("active");
  }

  // =========================
  // Expenses rendering
  // =========================
  function renderHome() {
    const list = $("#homeLastExpenses");
    if (!list) return;

    list.innerHTML = "";

    const last = [...EXPENSES].slice(-5).reverse();

    if (last.length === 0) {
      list.innerHTML = `<div class="empty-note">Ancora nessuna spesa. Premi “+” per aggiungerne una.</div>`;
      return;
    }

    last.forEach(e => {
      const div = document.createElement("div");
      div.className = "expense-item";
      div.innerHTML = `
        <div class="expense-img">
          ${e.photo ? `<img src="${e.photo}" alt="scontrino">` : `<div class="no-photo">📄</div>`}
        </div>
        <div class="expense-info">
          <div class="expense-cat">${escapeHtml(e.category || "Altro")}</div>
          <div class="expense-meta">${escapeHtml(e.date || "")} • ${escapeHtml(e.note || "")}</div>
        </div>
        <div class="expense-amount">€ ${centsToEuro(e.amountCents)}</div>
      `;
      list.appendChild(div);
    });

    renderTotals();
  }

  function renderArchive() {
    const list = $("#archiveList");
    if (!list) return;

    list.innerHTML = "";

    if (EXPENSES.length === 0) {
      list.innerHTML = `<div class="empty-note">Archivio vuoto.</div>`;
      return;
    }

    [...EXPENSES].reverse().forEach(e => {
      const div = document.createElement("div");
      div.className = "expense-row";
      div.innerHTML = `
        <div class="row-left">
          ${e.photo ? `<img src="${e.photo}" class="thumb" alt="thumb">` : `<div class="thumb no">📄</div>`}
        </div>
        <div class="row-mid">
          <div class="title">${escapeHtml(e.category || "Altro")}</div>
          <div class="sub">${escapeHtml(e.date || "")} ${e.note ? "• " + escapeHtml(e.note) : ""}</div>
        </div>
        <div class="row-right">
          <div class="price">€ ${centsToEuro(e.amountCents)}</div>
          <button class="btn-mini danger" data-del="${e.id}">Elimina</button>
        </div>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        EXPENSES = EXPENSES.filter(x => x.id !== id);
        saveExpenses(EXPENSES);
        renderArchive();
        renderHome();
        showToast("Spesa eliminata");
      });
    });
  }

  function renderTotals() {
    const totalMonth = $("#totalMonth");
    const totalYear = $("#totalYear");
    if (!totalMonth || !totalYear) return;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisYear = String(now.getFullYear());

    let m = 0;
    let y = 0;

    EXPENSES.forEach(e => {
      if (!e.date) return;
      if (e.date.startsWith(thisMonth)) m += e.amountCents;
      if (e.date.startsWith(thisYear)) y += e.amountCents;
    });

    totalMonth.textContent = `€ ${centsToEuro(m)}`;
    totalYear.textContent = `€ ${centsToEuro(y)}`;
  }

  // =========================
  // OCR Extraction
  // =========================
  function normalizeText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function extractDate(text) {
    const t = text.replace(/\s+/g, " ");

    // dd/mm/yyyy or dd-mm-yyyy
    const m1 = t.match(/\b([0-3]?\d)[\/\-]([0-1]?\d)[\/\-](20\d{2})\b/);
    if (m1) {
      const dd = m1[1].padStart(2, "0");
      const mm = m1[2].padStart(2, "0");
      const yy = m1[3];
      return `${yy}-${mm}-${dd}`;
    }

    // dd/mm/yy
    const m2 = t.match(/\b([0-3]?\d)[\/\-]([0-1]?\d)[\/\-](\d{2})\b/);
    if (m2) {
      const dd = m2[1].padStart(2, "0");
      const mm = m2[2].padStart(2, "0");
      const yy = "20" + m2[3];
      return `${yy}-${mm}-${dd}`;
    }

    return "";
  }

  function extractAmount(text) {
    // Cerca importi tipo 12,34 oppure 12.34
    const matches = text.match(/\b\d{1,4}[.,]\d{2}\b/g);
    if (!matches || matches.length === 0) return 0;

    // Prende il più grande (spesso è totale)
    let max = 0;
    matches.forEach(m => {
      const cents = euroToCents(m);
      if (cents > max) max = cents;
    });

    return max;
  }

  // =========================
  // OCR Offline (Tesseract)
  // =========================
  async function runOCR() {
    if (!CURRENT_IMAGE_DATAURL) {
      showToast("Carica prima una foto.");
      return;
    }

    const status = $("#ocrStatus");
    const resultBox = $("#ocrText");
    if (status) status.textContent = "OCR in corso...";
    if (resultBox) resultBox.value = "";

    try {
      if (!window.Tesseract) {
        showToast("OCR non disponibile (Tesseract mancante).");
        if (status) status.textContent = "OCR non disponibile";
        return;
      }

      const worker = await Tesseract.createWorker("ita");
      const { data } = await worker.recognize(CURRENT_IMAGE_DATAURL);
      await worker.terminate();

      OCR_FULL_TEXT = normalizeText(data.text || "");

      if (resultBox) resultBox.value = OCR_FULL_TEXT;
      if (status) status.textContent = "Dati scontrino rilevati ✅";

      // Autocompila importo e data
      const d = extractDate(OCR_FULL_TEXT);
      const a = extractAmount(OCR_FULL_TEXT);

      if ($("#inputDate") && d) $("#inputDate").value = d;
      if ($("#inputAmount") && a > 0) $("#inputAmount").value = centsToEuro(a);

      showToast("OCR completato");

    } catch (err) {
      console.error(err);
      if (status) status.textContent = "Errore OCR";
      showToast("Errore OCR");
    }
  }

  // =========================
  // Image handling
  // =========================
  function setImage(dataUrl) {
    CURRENT_IMAGE_DATAURL = dataUrl;

    const img = $("#previewImage");
    if (img) img.src = dataUrl;

    const holder = $("#previewHolder");
    if (holder) holder.classList.add("has-image");
  }

  function clearImage() {
    CURRENT_IMAGE_DATAURL = "";
    OCR_FULL_TEXT = "";

    const img = $("#previewImage");
    if (img) img.src = "";

    const holder = $("#previewHolder");
    if (holder) holder.classList.remove("has-image");

    const resultBox = $("#ocrText");
    if (resultBox) resultBox.value = "";

    const status = $("#ocrStatus");
    if (status) status.textContent = "";
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleFileInput(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const dataUrl = await fileToDataURL(file);
    setImage(dataUrl);

    // reset input per permettere ricarico stesso file senza bug
    input.value = "";
  }

  // =========================
  // Save expense
  // =========================
  function saveExpenseFromForm() {
    const amountEl = $("#inputAmount");
    const dateEl = $("#inputDate");
    const catEl = $("#inputCategory");
    const noteEl = $("#inputNote");

    const amountCents = euroToCents(amountEl?.value);
    const date = dateEl?.value || todayISO();
    const category = catEl?.value || "Altro";
    const note = noteEl?.value || "";

    if (amountCents <= 0) {
      showToast("Inserisci un importo valido");
      return;
    }

    const expense = {
      id: uid(),
      amountCents,
      date,
      category,
      note,
      photo: CURRENT_IMAGE_DATAURL || "",
      ocrText: OCR_FULL_TEXT || ""
    };

    EXPENSES.push(expense);
    saveExpenses(EXPENSES);

    showToast("Spesa salvata ✅");

    // reset form
    if (amountEl) amountEl.value = "";
    if (noteEl) noteEl.value = "";
    if (dateEl) dateEl.value = todayISO();

    clearImage();

    renderHome();
    renderArchive();
  }

  // =========================
  // Export backup
  // =========================
  function exportBackup() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      expenses: EXPENSES,
      settings: SETTINGS
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "backup_scontrini_facili_pro.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 800);
    showToast("Backup esportato");
  }

  // =========================
  // Settings
  // =========================
  function applyProCode(code) {
    const c = String(code || "").trim().toUpperCase();

    if (!c) return false;

    // Esempio: CFP-MONTH-2025
    if (c.startsWith("CFP-MONTH")) {
      SETTINGS.proUntil = Date.now() + (30 * 24 * 60 * 60 * 1000);
      SETTINGS.proCode = c;
      saveSettings(SETTINGS);
      return true;
    }

    // Esempio: CFP-YEAR-2025
    if (c.startsWith("CFP-YEAR")) {
      SETTINGS.proUntil = Date.now() + (365 * 24 * 60 * 60 * 1000);
      SETTINGS.proCode = c;
      saveSettings(SETTINGS);
      return true;
    }

    return false;
  }

  function isProActive() {
    return SETTINGS.proUntil && Date.now() < SETTINGS.proUntil;
  }

  function updateProBadge() {
    const badge = $("#proStatusBadge");
    if (!badge) return;

    if (isProActive()) {
      badge.textContent = "PRO";
      badge.classList.add("pro");
    } else {
      badge.textContent = "FREE";
      badge.classList.remove("pro");
    }
  }

  // =========================
  // Events binding
  // =========================
  function bindEvents() {
    // Navigation
    $("#navHome")?.addEventListener("click", () => {
      showScreen("screenHome");
      setActiveNav("navHome");
      renderHome();
    });

    $("#navArchive")?.addEventListener("click", () => {
      showScreen("screenArchive");
      setActiveNav("navArchive");
      renderArchive();
    });

    $("#navReport")?.addEventListener("click", () => {
      showScreen("screenReport");
      setActiveNav("navReport");
    });

    $("#navSettings")?.addEventListener("click", () => {
      showScreen("screenSettings");
      setActiveNav("navSettings");
      updateProBadge();
    });

    // FAB add expense
    $("#fabAdd")?.addEventListener("click", () => {
      $("#modalAddExpense")?.classList.add("open");
    });

    $("#btnCloseModal")?.addEventListener("click", () => {
      $("#modalAddExpense")?.classList.remove("open");
    });

    // Camera / upload
    $("#btnCamera")?.addEventListener("click", () => {
      $("#inputCamera")?.click();
    });

    $("#btnUpload")?.addEventListener("click", () => {
      $("#inputUpload")?.click();
    });

    $("#inputCamera")?.addEventListener("change", async (e) => {
      await handleFileInput(e.target);
    });

    $("#inputUpload")?.addEventListener("change", async (e) => {
      await handleFileInput(e.target);
    });

    // OCR
    $("#btnOCR")?.addEventListener("click", runOCR);

    // Clear photo
    $("#btnRemovePhoto")?.addEventListener("click", () => {
      clearImage();
      showToast("Foto rimossa");
    });

    // Save expense
    $("#btnSaveExpense")?.addEventListener("click", saveExpenseFromForm);

    // Clear form
    $("#btnClearForm")?.addEventListener("click", () => {
      $("#inputAmount").value = "";
      $("#inputNote").value = "";
      $("#inputDate").value = todayISO();
      clearImage();
      showToast("Pulito");
    });

    // Export backup
    $("#btnExportBackup")?.addEventListener("click", exportBackup);

    // PRO code
    $("#btnApplyCode")?.addEventListener("click", () => {
      const code = $("#inputProCode")?.value || "";
      const ok = applyProCode(code);

      if (ok) {
        showToast("PRO attivato ✅");
      } else {
        showToast("Codice non valido");
      }

      updateProBadge();
    });

    // Home shortcuts
    $("#btnGoArchive")?.addEventListener("click", () => {
      showScreen("screenArchive");
      setActiveNav("navArchive");
      renderArchive();
    });

    $("#btnGoReport")?.addEventListener("click", () => {
      showScreen("screenReport");
      setActiveNav("navReport");
    });
  }

  // =========================
  // Escape HTML
  // =========================
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  // =========================
  // Init
  // =========================
  function init() {
    // default date in form
    if ($("#inputDate")) $("#inputDate").value = todayISO();

    bindEvents();
    renderHome();
    updateProBadge();
  }

  document.addEventListener("DOMContentLoaded", init);

})();
