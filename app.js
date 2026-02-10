(() => {
  "use strict";

  // ----------------------------
  // CONFIG
  // ----------------------------
  const APP = {
    dbName: "spese_scontrini_pro_db",
    dbVersion: 1,
    store: "expenses",
    settingsKey: "ssp_settings_v3",
    freeLimitExpenses: 30,
    freeLimitPdfPerMonth: 3,
    photoMaxSide: 1400,
    photoJpegQuality: 0.75
  };

  const CATEGORIES = [
    "Alimentari", "Benzina", "Casa", "Bollette", "Farmacia / Mediche", "Bambini",
    "Animali", "Lavoro", "Ristorante / Bar", "Viaggi", "Scuola", "Assicurazioni", "Altro"
  ];

  const CAF_CATEGORIES = new Set([
    "Farmacia / Mediche", "Scuola", "Bambini", "Assicurazioni", "Casa", "Bollette"
  ]);

  // ----------------------------
  // HELPERS
  // ----------------------------
  const $ = (s) => document.querySelector(s);

  function toast(msg, ms = 1600) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  function haptic(ms = 10) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  function euro(n) {
    const v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(".", ",");
  }

  function parseEuro(s) {
    const v = String(s ?? "").trim().replace(/\./g, "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function monthNow() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function yyyymm(dateISO) {
    const d = new Date(dateISO);
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  // ----------------------------
  // SETTINGS
  // ----------------------------
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(APP.settingsKey) || "{}"); }
    catch { return {}; }
  }
  function saveSettings() {
    localStorage.setItem(APP.settingsKey, JSON.stringify(settings));
  }

  const settings = loadSettings();
  settings.isPro = !!settings.isPro;
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  saveSettings();

  function setProUI() {
    const s = $("#proState");
    if (s) s.textContent = settings.isPro ? "PRO" : "FREE";
    const fh = $("#freeHint");
    if (fh) fh.style.display = settings.isPro ? "none" : "block";
  }

  // ----------------------------
  // NAV
  // ----------------------------
  function showPage(name) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.toggle("active", p.getAttribute("data-page") === name);
    });
    document.querySelectorAll(".navBtn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-nav") === name);
    });

    const sub = $("#headerSubtitle");
    if (sub) {
      sub.textContent =
        name === "home" ? "Offline • PDF • Foto scontrini • Backup" :
        name === "archive" ? "Archivio • filtri e ricerca rapida" :
        "Report • PDF mensile e CAF/ISEE";
    }

    if (name === "archive") renderList();
  }

  // ----------------------------
  // INDEXEDDB
  // ----------------------------
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(APP.dbName, APP.dbVersion);

      req.onupgradeneeded = () => {
        const _db = req.result;
        if (!_db.objectStoreNames.contains(APP.store)) {
          const store = _db.createObjectStore(APP.store, { keyPath: "id" });
          store.createIndex("by_date", "date", { unique: false });
          store.createIndex("by_month", "month", { unique: false });
          store.createIndex("by_category", "category", { unique: false });
        }
      };

      req.onsuccess = () => { db = req.result; resolve(true); };
      req.onerror = () => reject(req.error);
    });
  }

  function txStore(mode = "readonly") {
    return db.transaction(APP.store, mode).objectStore(APP.store);
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const req = txStore("readonly").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(item) {
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(id) {
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function dbClear() {
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ----------------------------
  // PHOTO (compress)
  // ----------------------------
  async function fileToCompressedDataURL(file) {
    if (!file) return null;

    const img = await fileToImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const max = APP.photoMaxSide;
    const scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, cw, ch);

    return canvas.toDataURL("image/jpeg", APP.photoJpegQuality);
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non valida")); };
      img.src = url;
    });
  }

  function setPhotoPreview(dataUrl) {
    const wrap = $("#photoPrev");
    const im = $("#photoPrevImg");
    if (!wrap || !im) return;
    if (!dataUrl) {
      wrap.style.display = "none";
      im.src = "";
      return;
    }
    im.src = dataUrl;
    wrap.style.display = "block";
  }

  // ----------------------------
  // DATA + RENDER
  // ----------------------------
  let all = [];
  let editId = null;
  let previewPhoto = null;

  function fillCategories() {
    const inCat = $("#inCategory");
    const fCat = $("#fCategory");
    if (inCat) inCat.innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (fCat) fCat.innerHTML = `<option value="">Tutte</option>` + CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function calcStats() {
    const mNow = monthNow();
    const yNow = String(new Date().getFullYear());

    const monthTotal = all.filter(x => x.month === mNow).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const yearTotal  = all.filter(x => (x.date || "").startsWith(yNow + "-")).reduce((s, x) => s + (Number(x.amount) || 0), 0);

    const sm = $("#statMonth");
    const sy = $("#statYear");
    if (sm) sm.textContent = euro(monthTotal);
    if (sy) sy.textContent = euro(yearTotal);
  }

  function renderRecent() {
    const el = $("#recentList");
    if (!el) return;

    const list = all.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6);
    if (list.length === 0) {
      el.innerHTML = `<div class="hint">Ancora nessuna spesa. Premi “＋” per aggiungerne una.</div>`;
      return;
    }

    el.innerHTML = list.map(x => `
      <div class="item" data-open="${escapeHtml(x.id)}">
        <div class="thumb">${x.photo ? `<img src="${x.photo}" alt="scontrino">` : "—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(x.note || "Spesa")}</div>
          <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
        </div>
        <div class="amt">${euro(x.amount)}</div>
      </div>
    `).join("");

    el.querySelectorAll("[data-open]").forEach(r => {
      r.addEventListener("click", () => openDetails(r.getAttribute("data-open")));
    });
  }

  function applyFilters() {
    const m = $("#fMonth")?.value || "";
    const c = $("#fCategory")?.value || "";
    const q = ($("#fSearch")?.value || "").trim().toLowerCase();

    let list = all.slice();
    if (m) list = list.filter(x => x.month === m);
    if (c) list = list.filter(x => x.category === c);
    if (q) list = list.filter(x =>
      (x.note || "").toLowerCase().includes(q) ||
      (x.category || "").toLowerCase().includes(q)
    );

    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  }

  function renderList() {
    const el = $("#list");
    if (!el) return;

    const list = applyFilters();
    const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);

    const cl = $("#countLabel");
    const sl = $("#sumLabel");
    if (cl) cl.textContent = `${list.length} spese (totale in app: ${all.length})`;
    if (sl) sl.textContent = `Totale filtro: ${euro(total)}`;

    if (list.length === 0) {
      el.innerHTML = `<div class="hint">Nessuna spesa con questi filtri. Premi “＋” per aggiungere.</div>`;
      return;
    }

    el.innerHTML = list.map(x => `
      <div class="item" data-open="${escapeHtml(x.id)}">
        <div class="thumb">${x.photo ? `<img src="${x.photo}" alt="scontrino">` : "—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(x.note || "Spesa")}</div>
          <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
        </div>
        <div class="amt">${euro(x.amount)}</div>
      </div>
    `).join("");

    el.querySelectorAll("[data-open]").forEach(r => {
      r.addEventListener("click", () => openDetails(r.getAttribute("data-open")));
    });
  }

  async function refresh() {
    all = await dbGetAll();
    setProUI();
    calcStats();
    renderRecent();
    renderList();
  }

  // ----------------------------
  // MODALS
  // ----------------------------
  function showModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
  }
  function hideModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
  }

  function openAddModal() {
    editId = null;
    previewPhoto = null;
    setPhotoPreview(null);

    $("#addTitle").textContent = "➕ Aggiungi spesa";
    $("#inAmount").value = "";
    $("#inDate").value = todayISO();
    $("#inNote").value = "";
    $("#inPhoto").value = "";
    $("#inCategory").value = "Alimentari";

    showModal("#modalAdd");
    haptic(8);
  }

  function closeAddModal() {
    hideModal("#modalAdd");
  }

  let modalCurrentId = null;

  function openDetails(id) {
    const x = all.find(e => e.id === id);
    if (!x) return;
    modalCurrentId = id;

    $("#mTitle").textContent = `${x.note || "Spesa"} • ${euro(x.amount)}`;
    $("#mMeta").textContent = `${x.date} • ${x.category} • ${x.month}`;

    const img = $("#mImg");
    if (img) {
      if (x.photo) {
        img.src = x.photo;
        img.style.display = "block";
      } else {
        img.src = "";
        img.style.display = "none";
      }
    }

    showModal("#modalDetails");
    haptic(8);
  }

  function closeDetails() {
    hideModal("#modalDetails");
    modalCurrentId = null;
  }

  function openEditFromDetails() {
    if (!modalCurrentId) return;
    const x = all.find(e => e.id === modalCurrentId);
    if (!x) return;

    editId = x.id;
    previewPhoto = null;
    setPhotoPreview(null);

    $("#addTitle").textContent = "✏️ Modifica spesa";
    $("#inAmount").value = String(x.amount).replace(".", ",");
    $("#inDate").value = x.date;
    $("#inCategory").value = x.category;
    $("#inNote").value = x.note || "";
    $("#inPhoto").value = "";

    closeDetails();
    showModal("#modalAdd");
    haptic(8);
  }

  // ----------------------------
  // SAVE / DELETE / RESET
  // ----------------------------
  async function onSave() {
    const amount = parseEuro($("#inAmount").value);
    const date = $("#inDate").value;
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();
    const file = $("#inPhoto").files && $("#inPhoto").files[0];

    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Importo non valido");
      haptic(20);
      return;
    }
    if (!date) {
      toast("Seleziona una data");
      haptic(20);
      return;
    }

    if (!settings.isPro && !editId && all.length >= APP.freeLimitExpenses) {
      alert(`Versione FREE: massimo ${APP.freeLimitExpenses} spese. Attiva PRO per illimitate.`);
      return;
    }

    let base = null;
    if (editId) base = all.find(x => x.id === editId) || null;

    let photo = base ? (base.photo || null) : null;
    try {
      if (file) photo = previewPhoto || await fileToCompressedDataURL(file);
    } catch {
      alert("Foto non supportata o danneggiata.");
      return;
    }

    const id = editId || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);

    const item = {
      id,
      amount,
      date,
      month: yyyymm(date),
      category,
      note: note || category,
      photo
    };

    await dbPut(item);

    closeAddModal();
    toast(editId ? "Aggiornato ✅" : "Salvato ✅");
    haptic(12);

    editId = null;
    previewPhoto = null;
    setPhotoPreview(null);

    await refresh();
  }

  async function deleteCurrent() {
    if (!modalCurrentId) return;
    const ok = confirm("Eliminare questa spesa?");
    if (!ok) return;

    await dbDelete(modalCurrentId);
    closeDetails();
    toast("Eliminata ✅");
    haptic(14);
    await refresh();
  }

  async function wipeAll() {
    const ok = confirm("RESET TOTALE: cancella tutte le spese e foto. Confermi?");
    if (!ok) return;
    await dbClear();
    settings.pdfCountByMonth = {};
    saveSettings();
    toast("Reset completato ✅");
    haptic(14);
    await refresh();
  }

  // ----------------------------
  // PDF
  // ----------------------------
  function canGeneratePdf() {
    if (settings.isPro) return true;
    const m = monthNow();
    const used = Number(settings.pdfCountByMonth[m] || 0);
    if (used >= APP.freeLimitPdfPerMonth) {
      alert(`Versione FREE: massimo ${APP.freeLimitPdfPerMonth} PDF nel mese. Attiva PRO per illimitato.`);
      return false;
    }
    return true;
  }

  function incPdfCount() {
    const m = monthNow();
    settings.pdfCountByMonth[m] = Number(settings.pdfCountByMonth[m] || 0) + 1;
    saveSettings();
  }

  async function generatePdf(mode, targetMonth) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF non disponibile (jsPDF non caricato).");
      return;
    }
    if (!canGeneratePdf()) return;

    let list = all.filter(x => x.month === targetMonth);
    if (mode === "caf") list = list.filter(x => CAF_CATEGORIES.has(x.category));

    if (list.length === 0) {
      toast("Nessuna spesa per il PDF");
      return;
    }

    list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    let y = margin;

    const title = mode === "caf" ? "Report CAF/ISEE" : "Report Mensile";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Spese & Scontrini PRO", margin, y); y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(title, margin, y); y += 16;

    doc.setFontSize(10);
    doc.text(`Mese: ${targetMonth} • Voci: ${list.length}`, margin, y); y += 14;
    doc.text(`Totale: ${euro(total)}`, margin, y); y += 18;

    if (!settings.isPro) {
      doc.setFontSize(46);
      doc.setTextColor(200);
      doc.text("VERSIONE GRATUITA", pageW / 2, pageH / 2, { align: "center", angle: -25 });
      doc.setTextColor(0);
      doc.setFontSize(10);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Data", margin, y);
    doc.text("Categoria", margin + 90, y);
    doc.text("Descrizione", margin + 220, y);
    doc.text("Importo", pageW - margin, y, { align: "right" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    for (const x of list) {
      if (y > pageH - 120) {
        doc.addPage();
        y = margin;
      }
      doc.text(String(x.date), margin, y);
      doc.text(String(x.category).slice(0, 18), margin + 90, y);
      doc.text(String(x.note || "").slice(0, 35), margin + 220, y);
      doc.text(euro(x.amount), pageW - margin, y, { align: "right" });
      y += 14;
    }

    // photos page
    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Foto scontrini", margin, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Foto compresse per stabilità su APK.", margin, y); y += 14;

    const pics = list.filter(x => !!x.photo);
    if (pics.length === 0) {
      doc.text("Nessuna foto allegata.", margin, y);
    } else {
      const colW = (pageW - margin * 2 - 10) / 2;
      const imgH = 220;
      let col = 0;

      for (const x of pics) {
        if (y + imgH > pageH - margin) {
          doc.addPage();
          y = margin;
          col = 0;
        }
        const xPos = margin + (col === 0 ? 0 : colW + 10);
        const yPos = y;

        doc.setFont("helvetica", "bold"); doc.setFontSize(10);
        doc.text(`${x.date} • ${x.category} • ${euro(x.amount)}`, xPos, yPos);

        try {
          doc.addImage(x.photo, "JPEG", xPos, yPos + 14, colW, imgH, undefined, "FAST");
        } catch {
          doc.setFont("helvetica", "normal"); doc.setFontSize(10);
          doc.text("Immagine non inseribile.", xPos, yPos + 40);
        }

        col = 1 - col;
        if (col === 0) y += (imgH + 30);
      }
    }

    if (!settings.isPro) incPdfCount();

    const fileName = mode === "caf"
      ? `Report_CAF_${targetMonth}.pdf`
      : `Report_Mese_${targetMonth}.pdf`;

    doc.save(fileName);
    toast("PDF creato ✅");
    haptic(12);
  }

  // ----------------------------
  // BACKUP
  // ----------------------------
  async function exportBackup() {
    const payload = {
      app: "Spese&ScontriniPRO",
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: { isPro: settings.isPro, pdfCountByMonth: settings.pdfCountByMonth },
      expenses: all
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_spese_scontrini_${monthNow()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("Backup esportato ✅");
  }

  async function importBackup(file) {
    try {
      const txt = await file.text();
      const payload = JSON.parse(txt);

      if (!payload || !Array.isArray(payload.expenses)) {
        alert("Backup non valido.");
        return;
      }

      const ok = confirm("Importare backup? Unisce le spese (non cancella quelle esistenti).");
      if (!ok) return;

      const existing = new Set(all.map(x => x.id));
      let added = 0;

      for (const x of payload.expenses) {
        if (!x || !x.id) continue;
        if (existing.has(x.id)) continue;

        const item = {
          id: String(x.id),
          amount: Number(x.amount) || 0,
          date: String(x.date || ""),
          month: String(x.month || yyyymm(x.date || todayISO())),
          category: String(x.category || "Altro"),
          note: String(x.note || ""),
          photo: x.photo ? String(x.photo) : null
        };
        await dbPut(item);
        added++;
      }

      toast(`Importate: ${added} spese ✅`);
      haptic(12);
      await refresh();
    } catch {
      alert("Errore import: file non valido.");
    }
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  function wireUI() {
    // nav
    document.querySelectorAll(".navBtn").forEach(b => {
      b.addEventListener("click", () => {
        haptic(6);
        showPage(b.getAttribute("data-nav"));
      });
    });

    $("#goArchive")?.addEventListener("click", () => showPage("archive"));
    $("#goReport")?.addEventListener("click", () => showPage("report"));

    // FAB / add modal
    $("#fabAdd")?.addEventListener("click", () => {
      openAddModal();
      toast("Aggiungi spesa");
    });

    $("#addClose")?.addEventListener("click", closeAddModal);
    $("#modalAdd")?.addEventListener("click", (e) => {
      if (e.target === $("#modalAdd")) closeAddModal();
    });

    $("#btnSave")?.addEventListener("click", onSave);
    $("#btnClear")?.addEventListener("click", () => {
      $("#inAmount").value = "";
      $("#inNote").value = "";
      $("#inPhoto").value = "";
      previewPhoto = null;
      setPhotoPreview(null);
      toast("Pulito");
    });

    // photo preview
    $("#inPhoto")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) {
        previewPhoto = null;
        setPhotoPreview(null);
        return;
      }
      try {
        previewPhoto = await fileToCompressedDataURL(file);
        setPhotoPreview(previewPhoto);
        toast("Foto pronta ✅");
      } catch {
        previewPhoto = null;
        setPhotoPreview(null);
        toast("Foto non supportata");
      }
    });

    $("#removePhoto")?.addEventListener("click", () => {
      $("#inPhoto").value = "";
      previewPhoto = null;
      setPhotoPreview(null);
      toast("Foto rimossa");
    });

    // details modal
    $("#mClose")?.addEventListener("click", closeDetails);
    $("#modalDetails")?.addEventListener("click", (e) => {
      if (e.target === $("#modalDetails")) closeDetails();
    });
    $("#mDelete")?.addEventListener("click", deleteCurrent);
    $("#mEdit")?.addEventListener("click", openEditFromDetails);

    // filters
    $("#fMonth")?.addEventListener("change", renderList);
    $("#fCategory")?.addEventListener("change", renderList);
    $("#fSearch")?.addEventListener("input", () => {
      clearTimeout(window.__ft);
      window.__ft = setTimeout(renderList, 120);
    });

    $("#btnClearFilters")?.addEventListener("click", () => {
      $("#fMonth").value = monthNow();
      $("#fCategory").value = "";
      $("#fSearch").value = "";
      toast("Filtri puliti");
      renderList();
    });

    $("#btnToday")?.addEventListener("click", () => {
      // scorciatoia: porta a home e apre add con data oggi
      showPage("home");
      openAddModal();
      $("#inDate").value = todayISO();
    });

    // report
    $("#rMonth").value = monthNow();
    $("#btnMakePdf")?.addEventListener("click", () => {
      const mode = $("#rMode")?.value || "month";
      const m = $("#rMonth")?.value || monthNow();
      generatePdf(mode, m);
    });

    // backup + reset
    $("#btnBackup")?.addEventListener("click", exportBackup);
    $("#inRestore")?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = "";
    });

    $("#btnWipeAll")?.addEventListener("click", wipeAll);

    // pro toggle
    $("#btnProToggle")?.addEventListener("click", () => {
      const ok = confirm(settings.isPro ? "Disattivare PRO (test)?" : "Attivare PRO (test) su questo dispositivo?");
      if (!ok) return;
      settings.isPro = !settings.isPro;
      saveSettings();
      setProUI();
      toast(settings.isPro ? "PRO attivo (test)" : "FREE attivo");
      haptic(10);
    });
  }

  // ----------------------------
  // SERVICE WORKER REGISTER
  // ----------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ----------------------------
  // START
  // ----------------------------
  (async function start() {
    fillCategories();

    const inDate = $("#inDate");
    if (inDate) inDate.value = todayISO();

    const fMonth = $("#fMonth");
    if (fMonth) fMonth.value = monthNow();

    setProUI();

    await openDB();
    await refresh();

    wireUI();

    showPage("home");
    toast("Pronto ✅", 1200);
  })();

})();
