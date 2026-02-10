(() => {
  "use strict";

  // ----------------------------
  // CONFIG
  // ----------------------------
  const APP = {
    dbName: "spese_scontrini_pro_db",
    dbVersion: 1,
    store: "expenses",
    settingsKey: "ssp_settings_v1",
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

  function euro(n){
    const v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(".", ",");
  }
  function parseEuro(s){
    const v = String(s ?? "").trim().replace(/\./g,"").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function yyyymm(d){
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}`;
  }
  function todayISO(){
    const dt = new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  }
  function monthNow(){
    const dt = new Date();
    return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}`;
  }
  function loadSettings(){
    try{ return JSON.parse(localStorage.getItem(APP.settingsKey) || "{}"); }
    catch{ return {}; }
  }
  function saveSettings(s){
    localStorage.setItem(APP.settingsKey, JSON.stringify(s || {}));
  }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  // ----------------------------
  // SETTINGS (FREE / PRO)
  // ----------------------------
  const settings = loadSettings();
  settings.isPro = !!settings.isPro; // toggle test
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  saveSettings(settings);

  function setProUI(){
    $("#proState").textContent = settings.isPro ? "PRO" : "FREE";
    $("#proPill").style.borderColor = settings.isPro ? "rgba(61,220,151,.5)" : "rgba(255,204,102,.35)";
    $("#freeHint").style.display = settings.isPro ? "none" : "block";
  }

  // ----------------------------
  // INDEXEDDB
  // ----------------------------
  let db;

  function openDB(){
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

      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function txStore(mode="readonly"){
    return db.transaction(APP.store, mode).objectStore(APP.store);
  }

  function dbGetAll(){
    return new Promise((resolve, reject) => {
      const req = txStore("readonly").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(item){
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(id){
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function dbClear(){
    return new Promise((resolve, reject) => {
      const req = txStore("readwrite").clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ----------------------------
  // PHOTO COMPRESS
  // ----------------------------
  async function fileToCompressedDataURL(file){
    if(!file) return null;

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

  function fileToImage(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non valida")); };
      img.src = url;
    });
  }

  // ----------------------------
  // UI INIT
  // ----------------------------
  function fillCategories(){
    const sel = $("#inCategory");
    sel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");

    const f = $("#fCategory");
    f.innerHTML = `<option value="">Tutte</option>` + CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
  }

  function initDefaults(){
    $("#inDate").value = todayISO();
    $("#fMonth").value = monthNow();
    $("#inCategory").value = "Alimentari";
  }

  // ----------------------------
  // RENDER
  // ----------------------------
  let all = [];

  function applyFilters(){
    const m = $("#fMonth").value || "";
    const c = $("#fCategory").value || "";
    const q = ($("#fSearch").value || "").trim().toLowerCase();

    let list = all.slice();

    if(m) list = list.filter(x => x.month === m);
    if(c) list = list.filter(x => x.category === c);
    if(q){
      list = list.filter(x =>
        (x.note || "").toLowerCase().includes(q) ||
        (x.category || "").toLowerCase().includes(q)
      );
    }

    list.sort((a,b) => (b.date||"").localeCompare(a.date||""));
    return list;
  }

  function calcStats(){
    const mNow = monthNow();
    const yNow = String(new Date().getFullYear());

    const monthTotal = all
      .filter(x => x.month === mNow)
      .reduce((s,x) => s + (Number(x.amount)||0), 0);

    const yearTotal = all
      .filter(x => (x.date || "").startsWith(yNow + "-"))
      .reduce((s,x) => s + (Number(x.amount)||0), 0);

    $("#statMonth").textContent = euro(monthTotal);
    $("#statYear").textContent = euro(yearTotal);
  }

  function renderList(){
    const list = applyFilters();
    const el = $("#list");
    el.innerHTML = "";

    const total = list.reduce((s,x) => s + (Number(x.amount)||0), 0);
    $("#countLabel").textContent = `${list.length} spese (totale in app: ${all.length})`;
    $("#sumLabel").textContent = `Totale filtro: ${euro(total)}`;

    if(list.length === 0){
      el.innerHTML = `<div class="hint">Nessuna spesa nei filtri selezionati. Premi <b>➕ Aggiungi spesa</b> a sinistra.</div>`;
      return;
    }

    for(const x of list){
      const item = document.createElement("div");
      item.className = "item";

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      if(x.photo){
        const img = document.createElement("img");
        img.src = x.photo;
        img.alt = "scontrino";
        thumb.appendChild(img);
      } else {
        thumb.textContent = "—";
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${escapeHtml(x.note || "Spesa")}</div>
        <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
        <div class="tag">${escapeHtml(x.month)}</div>
      `;

      const right = document.createElement("div");
      right.innerHTML = `
        <div class="amt">${euro(x.amount)}</div>
        <div style="height:6px"></div>
        <button class="btn small" data-open="${x.id}">👁️ Dettagli</button>
      `;

      item.appendChild(thumb);
      item.appendChild(meta);
      item.appendChild(right);
      el.appendChild(item);
    }

    el.querySelectorAll("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => openModal(btn.getAttribute("data-open")));
    });
  }

  // ----------------------------
  // CRUD
  // ----------------------------
  async function refresh(){
    all = await dbGetAll();
    calcStats();
    renderList();
    setProUI();
  }

  async function onSave(){
    const amount = parseEuro($("#inAmount").value);
    const date = $("#inDate").value;
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();
    const file = $("#inPhoto").files && $("#inPhoto").files[0];

    if(!Number.isFinite(amount) || amount <= 0){
      alert("Inserisci un importo valido (es: 12,50).");
      return;
    }
    if(!date){
      alert("Seleziona una data.");
      return;
    }

    if(!settings.isPro){
      if(all.length >= APP.freeLimitExpenses){
        alert(`Versione FREE: massimo ${APP.freeLimitExpenses} spese. Attiva PRO per spese illimitate.`);
        return;
      }
    }

    let photo = null;
    try{
      if(file) photo = await fileToCompressedDataURL(file);
    }catch{
      alert("Foto non supportata o danneggiata. Riprova con un'immagine diversa.");
      return;
    }

    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : String(Date.now()) + "_" + Math.random().toString(16).slice(2);

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

    $("#inAmount").value = "";
    $("#inNote").value = "";
    $("#inPhoto").value = "";

    await refresh();
  }

  async function onWipeAll(){
    const ok = confirm("Confermi RESET TOTALE? Cancella tutte le spese e le foto salvate.");
    if(!ok) return;
    await dbClear();
    settings.pdfCountByMonth = {};
    saveSettings(settings);
    await refresh();
  }

  // ----------------------------
  // MODAL
  // ----------------------------
  let modalCurrentId = null;

  function openModal(id){
    const x = all.find(e => e.id === id);
    if(!x) return;

    modalCurrentId = id;
    $("#mTitle").textContent = `${x.note || "Spesa"} • ${euro(x.amount)}`;
    $("#mImg").src = x.photo || "";
    $("#mImg").style.display = x.photo ? "block" : "none";
    $("#modal").classList.add("show");
  }

  function closeModal(){
    $("#modal").classList.remove("show");
    modalCurrentId = null;
  }

  async function deleteCurrent(){
    if(!modalCurrentId) return;
    const ok = confirm("Eliminare questa spesa?");
    if(!ok) return;
    await dbDelete(modalCurrentId);
    closeModal();
    await refresh();
  }

  // ----------------------------
  // PDF
  // ----------------------------
  function canGeneratePdf(){
    if(settings.isPro) return true;

    const m = monthNow();
    const used = Number(settings.pdfCountByMonth[m] || 0);
    if(used >= APP.freeLimitPdfPerMonth){
      alert(`Versione FREE: massimo ${APP.freeLimitPdfPerMonth} PDF nel mese. Attiva PRO per illimitato.`);
      return false;
    }
    return true;
  }

  function incPdfCount(){
    const m = monthNow();
    settings.pdfCountByMonth[m] = Number(settings.pdfCountByMonth[m] || 0) + 1;
    saveSettings(settings);
  }

  async function generatePdf(mode){
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert("PDF non disponibile (jsPDF non caricato). Se vuoi offline 100%, metti jsPDF in locale.");
      return;
    }
    if(!canGeneratePdf()) return;

    const targetMonth = $("#fMonth").value || monthNow();

    let list = all.filter(x => x.month === targetMonth);
    if(mode === "caf") list = list.filter(x => CAF_CATEGORIES.has(x.category));

    if(list.length === 0){
      alert("Nessuna spesa trovata per questo PDF (controlla mese/filtri).");
      return;
    }

    list.sort((a,b) => (a.date||"").localeCompare(b.date||""));
    const total = list.reduce((s,x) => s + (Number(x.amount)||0), 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    let y = margin;

    const title = mode === "caf" ? "Report CAF/ISEE" : "Report Mensile";
    const subtitle = `Mese: ${targetMonth} • Voci: ${list.length}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Spese & Scontrini PRO", margin, y); y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(title, margin, y); y += 16;

    doc.setFontSize(10);
    doc.text(subtitle, margin, y); y += 14;
    doc.text(`Totale: ${euro(total)}`, margin, y); y += 18;

    if(!settings.isPro){
      doc.setFontSize(46);
      doc.setTextColor(200);
      doc.text("VERSIONE GRATUITA", pageW/2, pageH/2, { align:"center", angle: -25 });
      doc.setTextColor(0);
      doc.setFontSize(10);
    }

    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.text("Data", margin, y);
    doc.text("Categoria", margin + 90, y);
    doc.text("Descrizione", margin + 220, y);
    doc.text("Importo", pageW - margin, y, {align:"right"});
    y += 10;

    doc.setFont("helvetica","normal");
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    for(const x of list){
      if(y > pageH - 120){
        doc.addPage();
        y = margin;
      }
      doc.text(String(x.date), margin, y);
      doc.text(String(x.category).slice(0,18), margin + 90, y);
      doc.text(String(x.note || "").slice(0,35), margin + 220, y);
      doc.text(euro(x.amount), pageW - margin, y, {align:"right"});
      y += 14;
    }

    doc.addPage();
    y = margin;
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text("Foto scontrini", margin, y); y += 14;
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text("Nota: le foto sono compresse per ridurre peso e migliorare stabilità su APK.", margin, y); y += 14;

    const pics = list.filter(x => !!x.photo);
    if(pics.length === 0){
      doc.text("Nessuna foto allegata.", margin, y);
    } else {
      const colW = (pageW - margin*2 - 10) / 2;
      const imgH = 220;
      let col = 0;

      for(const x of pics){
        if(y + imgH > pageH - margin){
          doc.addPage();
          y = margin;
          col = 0;
        }

        const xPos = margin + (col === 0 ? 0 : colW + 10);
        const yPos = y;

        doc.setFont("helvetica","bold"); doc.setFontSize(10);
        doc.text(`${x.date} • ${x.category} • ${euro(x.amount)}`, xPos, yPos);
        doc.setFont("helvetica","normal"); doc.setFontSize(9);
        doc.text(String(x.note || "").slice(0,45), xPos, yPos + 12);

        try{
          doc.addImage(x.photo, "JPEG", xPos, yPos + 22, colW, imgH, undefined, "FAST");
        }catch{
          doc.text("Immagine non inseribile nel PDF.", xPos, yPos + 40);
        }

        col = 1 - col;
        if(col === 0) y += (imgH + 40);
      }
    }

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Generato con Spese & Scontrini PRO • Offline", margin, pageH - 18);
    doc.setTextColor(0);

    if(!settings.isPro) incPdfCount();

    const fileName = mode === "caf" ? `Report_CAF_${targetMonth}.pdf` : `Report_Mese_${targetMonth}.pdf`;
    doc.save(fileName);
  }

  // ----------------------------
  // BACKUP / RESTORE
  // ----------------------------
  async function exportBackup(){
    const payload = {
      app: "Spese&ScontriniPRO",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      expenses: all
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_spese_scontrini_${monthNow()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file){
    try{
      const txt = await file.text();
      const payload = JSON.parse(txt);

      if(!payload || !Array.isArray(payload.expenses)){
        alert("Backup non valido.");
        return;
      }

      const ok = confirm("Importare backup? Questa operazione unisce le spese (non cancella automaticamente quelle esistenti).");
      if(!ok) return;

      const existing = new Set(all.map(x => x.id));
      let added = 0;

      for(const x of payload.expenses){
        if(!x || !x.id) continue;
        if(existing.has(x.id)) continue;

        const item = {
          id: String(x.id),
          amount: Number(x.amount)||0,
          date: String(x.date||""),
          month: String(x.month||yyyymm(x.date||todayISO())),
          category: String(x.category||"Altro"),
          note: String(x.note||""),
          photo: x.photo ? String(x.photo) : null
        };
        await dbPut(item);
        added++;
      }

      if(payload.settings && typeof payload.settings === "object"){
        settings.pdfCountByMonth = payload.settings.pdfCountByMonth || settings.pdfCountByMonth;
        saveSettings(settings);
      }

      await refresh();
      alert(`Backup importato. Nuove spese aggiunte: ${added}`);
    }catch{
      alert("Errore import backup: file non valido.");
    }
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  $("#btnSave").addEventListener("click", onSave);
  $("#btnClear").addEventListener("click", () => {
    $("#inAmount").value = "";
    $("#inNote").value = "";
    $("#inPhoto").value = "";
  });
  $("#btnWipeAll").addEventListener("click", onWipeAll);

  $("#fMonth").addEventListener("change", renderList);
  $("#fCategory").addEventListener("change", renderList);
  $("#fSearch").addEventListener("input", () => {
    clearTimeout(window.__t);
    window.__t = setTimeout(renderList, 120);
  });

  $("#btnClearFilters").addEventListener("click", () => {
    $("#fMonth").value = monthNow();
    $("#fCategory").value = "";
    $("#fSearch").value = "";
    renderList();
  });
  $("#btnToday").addEventListener("click", () => {
    $("#inDate").value = todayISO();
  });

  $("#btnPdfMonth").addEventListener("click", () => generatePdf("month"));
  $("#btnPdfCAF").addEventListener("click", () => generatePdf("caf"));

  $("#btnBackup").addEventListener("click", exportBackup);
  $("#inRestore").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if(f) importBackup(f);
    e.target.value = "";
  });

  $("#mClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => {
    if(e.target === $("#modal")) closeModal();
  });
  $("#mDelete").addEventListener("click", deleteCurrent);

  $("#btnProToggle").addEventListener("click", () => {
    const ok = confirm(settings.isPro ? "Disattivare PRO (test)?" : "Attivare PRO (test) sul dispositivo?");
    if(!ok) return;
    settings.isPro = !settings.isPro;
    saveSettings(settings);
    setProUI();
  });

  // ----------------------------
  // SERVICE WORKER
  // ----------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ----------------------------
  // START
  // ----------------------------
  (async function start(){
    fillCategories();
    initDefaults();
    setProUI();
    await openDB();
    await refresh();
  })();

})();
