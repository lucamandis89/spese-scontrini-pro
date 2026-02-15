async function setLastReceiptFromFile(file){
  if(!file) return;
  lastReceiptBlob = file;
}

let lastReceiptBlob = null;

// =====================
// DETRAIBILE (STRICT)
// =====================
function isDetraibileStrict(cat, ocrText){
  const c = String(cat||"").toLowerCase();
  if(c.includes("farmacia") || c.includes("mediche") || c.includes("sanitar")) return true;

  const s = String(ocrText||"").toLowerCase();

  // Strong medical keywords only (avoid false positives like "IVA" on normal receipts)
  const strong = [
    "farmacia","ticket","studio dentist","dentist","odontoiatr",
    "visita","prestazione sanitaria","sanitaria","asl","ssn",
    "codice fiscale","cf:", "ricetta", "medico", "ambulator"
  ];
  return strong.some(k => s.includes(k));
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'btnCopyOcr'){
    const el = document.querySelector('#ocrResultText');
    const txt = el ? el.value : '';
    if(txt) navigator.clipboard?.writeText(txt);
  }
  if(e.target && e.target.id === 'btnDownloadOcr'){
    const el = document.querySelector('#ocrResultText');
    const txt = el ? el.value : '';
    const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ocr_scontrino.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  }
});

(() => {
  "use strict";

  const APP = {
    dbName: "spese_scontrini_pro_db",
    dbVersion: 2,
    store: "expenses",
    settingsKey: "ssp_settings_v5",
    freeLimitExpenses: 30,
    freeLimitPdfPerMonth: 3,
    photoMaxSide: 1600,
    photoJpegQuality: 0.78,
    // TEST BUILD: auto-enable PRO for device/app testing. Set to false for Play Store release.
    devAutoPro: true,
    // Optional URL param to force PRO without touching code: ?devpro=1
    devParamName: "devpro"
  };

  // ===================== FUNZIONI DI ESPORTAZIONE/CONDIVISIONE =====================
  function exportQif() {
    const month = $("#rMonth")?.value || monthNow();
    const list = all.filter(x => (x.month || yyyymm(x.date)) === month && x.type !== "recurring_template");
    if(list.length === 0) { toast("Nessuna spesa per questo mese"); return; }
    list.sort((a,b) => (a.date||"").localeCompare(b.date||""));
    let qif = "!Type:Bank\n";
    list.forEach(x => {
      const date = x.date.replace(/-/g, '/'); // QIF spesso usa / come separatore
      qif += `D${date}\n`;
      qif += `T-${x.amount.toFixed(2)}\n`; // negativo per uscita
      if(x.note) qif += `M${x.note}\n`;
      qif += `P${x.category}\n`;
      qif += "^\n";
    });
    const blob = new Blob([qif], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spese_${month}.qif`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Esportazione QIF completata ✅");
  }

  function exportOfx() {
    const month = $("#rMonth")?.value || monthNow();
    const list = all.filter(x => (x.month || yyyymm(x.date)) === month && x.type !== "recurring_template");
    if(list.length === 0) { toast("Nessuna spesa per questo mese"); return; }
    list.sort((a,b) => (a.date||"").localeCompare(b.date||""));

    const ofxHeader = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}[0:GMT]
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>00000
<ACCTID>123456
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${month}-01
<DTEND>${month}-31
`;

    let transactions = '';
    list.forEach(x => {
      const date = x.date.replace(/-/g, '');
      transactions += `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>${date}
<TRNAMT>-${x.amount.toFixed(2)}
<FITID>${x.id}
<NAME>${x.category}
<MEMO>${x.note || ''}
</STMTTRN>
`;
    });

    const ofxFooter = `</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00
<DTASOF>${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const ofxContent = ofxHeader + transactions + ofxFooter;
    const blob = new Blob([ofxContent], {type: 'application/x-ofx'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spese_${month}.ofx`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Esportazione OFX completata ✅");
  }

  async function shareCurrentReport() {
    const mode = $("#rMode")?.value || "month";
    const month = $("#rMonth")?.value || monthNow();
    if(!canGeneratePdf()) return; // controllo limiti free
    let list = all.filter(x => (x.month || yyyymm(x.date)) === month && x.type !== "recurring_template");
    if(mode === "caf") list = list.filter(x => isCaf(x.category));
    if(list.length === 0) { toast("Nessuna spesa per il report"); return; }
    list.sort((a,b) => (a.date||"").localeCompare(b.date||""));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"a4" });
    // ... (stessa logica di generazione PDF di generatePdf, ma senza salvare)
    // Per brevità, riutilizziamo la funzione buildPdfBlobFromList già esistente
    const title = mode === "caf" ? "Report CAF/ISEE" : "Report Mensile";
    const rangeLabel = `Mese: ${month}`;
    const pdfBlob = await buildPdfBlobFromList(mode, title, rangeLabel, list);
    if(!pdfBlob) { toast("Errore generazione PDF"); return; }

    const fileName = mode === "caf" ? `Report_730_${month}.pdf` : `Report_Mese_${month}.pdf`;
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    try {
      if(navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Report Spese',
          files: [file]
        });
        toast("Report condiviso ✅");
      } else {
        // Fallback: download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast("Report scaricato ✅");
      }
    } catch(e) {
      toast("Condivisione fallita");
    }
  }

  function exportChartImage() {
    const canvas = document.getElementById('anaCanvas');
    if(!canvas) { toast("Grafico non trovato"); return; }
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `grafico_${$("#rMonth")?.value || monthNow()}.png`;
    a.click();
    toast("Grafico esportato ✅");
  }

  // ===================== STUB PER FUNZIONI MANCANTI (ora implementate) =====================
  // (Le funzioni sopra sostituiscono gli stub, quindi possiamo rimuovere le dichiarazioni precedenti o sovrascriverle)
  // Per evitare conflitti, commentiamo le vecchie definizioni.
  // function exportQif() { toast("Esportazione QIF non ancora implementata"); }
  // function exportOfx() { toast("Esportazione OFX non ancora implementata"); }
  // function shareCurrentReport() { toast("Condivisione report non ancora implementata"); }
  // function exportChartImage() { toast("Esportazione grafico non ancora implementata"); }

  // Manteniamo la funzione calcTax invariata
  function calcTax() {
    const revenue = parseFloat($("#taxRevenue")?.value || 0);
    const coeff = parseFloat($("#taxCoeff")?.value || 78) / 100;
    const rate = parseFloat($("#taxRate")?.value || 15) / 100;
    const inps = parseFloat($("#taxInps")?.value || 0) / 100;
    const taxable = revenue * coeff;
    const tax = taxable * rate;
    const inpsContrib = taxable * inps;
    const total = tax + inpsContrib;
    $("#taxOut").textContent = `Imponibile: ${euro(taxable)} | Imposta: ${euro(tax)} | INPS: ${euro(inpsContrib)} | Totale: ${euro(total)}`;
  }

  const CATEGORIES = [
    "Alimentari","Benzina","Casa","Bollette","Farmacia / Mediche","Bambini",
    "Animali","Lavoro","Ristorante / Bar","Viaggi","Scuola","Assicurazioni","Altro"
  ];

  const CAF_CATEGORIES = new Set([
    "Farmacia / Mediche", "Scuola", "Bambini", "Assicurazioni", "Casa", "Bollette"
  ]);

  // =====================
  //  BUILD / CACHE BUST (prevents "old version" tap-block issues)
  // =====================
  // IMPORTANT: bump this on every release so the app auto-clears stale caches
  // (prevents "tap does nothing" / old JS issues in PWA/APK wrappers)
  const BUILD_ID = "v37.3_20260214120000";
  (async () => {
    try{
      const prev = localStorage.getItem("__ssp_build_id") || "";
      if(prev !== BUILD_ID){
        localStorage.setItem("__ssp_build_id", BUILD_ID);

        // Kill old service workers + caches that may keep serving stale JS/CSS
        if("serviceWorker" in navigator){
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if(window.caches){
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }

        // reload once
        if(!sessionStorage.getItem("__ssp_reloaded_once")){
          sessionStorage.setItem("__ssp_reloaded_once","1");
          location.reload();
        }
      }
    }catch(e){ console.warn("cache-bust skipped", e); }
  })();

  const $ = (s) => document.querySelector(s);
  // Safe event binder (anti-bug): if element is missing, it won't crash the app
  const on = (sel, ev, fn, opts) => {
    try{
      const el = $(sel);
      if(el) el.addEventListener(ev, fn, opts);
    }catch(e){ /* never block */ }
  };
// =====================
//  PRO (Free + Pro) framework
//  NOTE: Payment via Google Play Billing will be wired in the Android wrapper (TWA).
//  This app keeps working offline; PRO status is stored locally.
// =====================
const PRO_SKU = "scontrini_facili_pro_one_time";
const PRO_PRICE_LABEL = "4,99€";
function isPro(){
  // Single source of truth: settings.isPro (persisted under APP.settingsKey).
  // Back-compat: also read legacy localStorage("isPro") if settings isn't ready yet.
  try{
    if(typeof settings !== 'undefined' && settings && typeof settings.isPro !== 'undefined'){
      return !!settings.isPro;
    }
  }catch(_){ /* ignore */ }
  return localStorage.getItem("isPro") === "true";
}
function setPro(v){
  const on = !!v;
  // Persist both ways for maximum compatibility.
  localStorage.setItem("isPro", on ? "true" : "false");
  try{
    if(typeof settings !== 'undefined' && settings){
      settings.isPro = on;
      if(typeof saveSettings === 'function') saveSettings();
      if(typeof setProUI === 'function') setProUI();
    }
  }catch(_){ /* ignore */ }
  renderProBadges();
}
function renderProBadges(){
  const el = document.querySelector("#proStatus");
  if(el) el.textContent = isPro() ? "PRO ✅" : "FREE";
  document.querySelectorAll("[data-pro-only]").forEach(n=>{
    n.classList.toggle("locked", !isPro());
  });
}
function requirePro(reason){
  if(isPro()) return true;
  // show upgrade modal if present, else toast
  const m = document.querySelector("#modalPro");
  if(m){
    const r = document.querySelector("#proReason");
    if(r) r.textContent = reason || "Funzione Premium";
    showModal("#modalPro");
  } else {
    try{ toast("Funzione Premium: passa a PRO", 1200); }catch(e){}
  }
  return false;
}

function normalizeText(text){
  // Preserve line breaks for display; trim each line.
  return String(text ?? '')
    .replace(/\r\n/g,'\n')
    .replace(/\r/g,'\n')
    .split('\n')
    .map(l => l.replace(/\s+$/,'').trim())
    .join('\n')
    .trim();
}
function normalizeForRegex(text){
  // Flatten for regex extraction (date/total)
  return normalizeText(text).replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
}

function parseTags(s){
  const raw = String(s||"").trim();
  if(!raw) return [];
  const tags = raw.split(/[,;]+/g).map(t=>t.trim()).filter(Boolean).slice(0,20);
  // keep a global tag list for suggestions
  try{
    const set = new Set([...(settings.tagsList||[]), ...tags]);
    settings.tagsList = Array.from(set).slice(0,200);
  }catch(_){ }
  return tags;
}

function setOcrResult(rawText){
  const t = String(rawText ?? "");
  const panel = document.querySelector('#ocrResultPanel') || document.querySelector('.ocr-result') || null;
  if(panel) panel.style.display = '';
  const el = document.querySelector('#ocrResultText') || document.querySelector('#ocrText') || document.querySelector('#ocrOut') || document.querySelector('#ocrOutput') || document.querySelector('#ocrResult');
  if(!el) return;
  if('value' in el) el.value = t;
  else el.textContent = t;
}

function hideAllModals(){
  document.querySelectorAll('.modal').forEach(m=>{
    m.classList.remove('show');
    m.setAttribute('aria-hidden','true');
  });
  document.body.classList.remove('modal-open');
}

function showModal(id){
  hideAllModals();
  const m = typeof id === 'string' ? document.querySelector(id) : id;
  if(!m) return;
  m.classList.add('show');
  m.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
}

function hideModal(id){
  const m = typeof id === 'string' ? document.querySelector(id) : id;
  if(!m) return;
  m.classList.remove('show');
  m.setAttribute('aria-hidden','true');
  // if none open, unlock body
  const anyOpen = !!document.querySelector('.modal.show');
  if(!anyOpen) document.body.classList.remove('modal-open');
}

function toast(msg, ms=1600){
    const t = $("#toast");
    if(!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(()=>t.classList.remove("show"), ms);
  }

  function currencySymbol(code){
    const c = String(code||"EUR").toUpperCase();
    const map = { EUR:"€", USD:"$", GBP:"£", CHF:"CHF", JPY:"¥" };
    return map[c] || c;
  }
  function money(n, currency){
    const v = Number(n||0);
    const c = String(currency||settings?.baseCurrency||"EUR").toUpperCase();
    const sym = currencySymbol(c);
    if(isNaN(v)) return `${sym} 0,00`;
    return `${sym} ` + v.toFixed(2).replace(".", ",");
  }
  function euro(n){ return money(n, "EUR"); }

  function parseEuro(s){
    const v = String(s || "").trim().replace(/\./g,"").replace(",",".");
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function pad2(n){ return String(n).padStart(2,"0"); }
  function todayISO(){
    const d=new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function monthNow(){
    const d=new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  }
  function yyyymm(dateISO){
    if(!dateISO) return "";
    const d = new Date(dateISO);
    if(isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  }

  // Chrome-safe month normalization/extraction from strings (accepts "2026-2", ISO, dd/mm/yyyy, etc.)
  function monthNorm(s){
    try {
      s = String(s||"").trim();
      if(!s) return "";
      
      if(/^\d{4}-\d{1,2}$/.test(s)) {
        const [y,m] = s.split('-');
        return `${y}-${pad2(m)}`;
      }
      
      if(/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.substring(0,7);
      }
      
      const m = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
      if(m) return `${m[3]}-${pad2(m[2])}`;
      
      const d = new Date(s);
      return isNaN(d) ? "" : `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
    } catch(e) {
      return "";
    }
  }
  function escapeHtml(s){
    return String(s || "").replace(/[&<>"']/g, (m)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  function haptic(ms=10){ try{ navigator.vibrate && navigator.vibrate(ms); }catch{} }
  function isCaf(category){ return CAF_CATEGORIES.has(category); }

  // ---------------- SETTINGS ----------------
  function loadSettings(){
    try { return JSON.parse(localStorage.getItem(APP.settingsKey)||"{}"); }
    catch { return {}; }
  }
  let settings = loadSettings();
  settings.isPro = !!settings.isPro;
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  settings.viewMode = settings.viewMode || "list"; // list | timeline
  settings.budgetByMonth = settings.budgetByMonth || {}; // { "YYYY-MM": cents }
  // Custom tags (user-defined)
  settings.tagsList = Array.isArray(settings.tagsList) ? settings.tagsList : [];
  // Currency
  settings.baseCurrency = settings.baseCurrency || "EUR";
  // Save originals (can increase storage usage)
  settings.saveOriginals = (settings.saveOriginals !== false);
  // Fast mode default
  settings.fastModeDefault = !!settings.fastModeDefault;
  // Auto geo capture when adding
  settings.autoGeo = !!settings.autoGeo;
  saveSettings();
  // =====================
  //  DEV / TEST PRO AUTO-ENABLE
  // =====================
  (function(){
    try{
      const p = new URLSearchParams(location.search || "");
      const disable = p.get("nopro") === "1";
      const hasParam = p.get(APP.devParamName) === "1" || p.get("pro") === "1";
      if(!disable && (APP.devAutoPro || hasParam)){
        if(localStorage.getItem("ssp_dev_autopro_done") !== "1"){
          // First run in this build: enable PRO and reset PDF counter for the current month.
          setPro(true);
          const ym = new Date().toISOString().slice(0,7);
          settings.pdfCountByMonth = settings.pdfCountByMonth || {};
          settings.pdfCountByMonth[ym] = 0;
          localStorage.setItem("ssp_dev_autopro_done","1");
          saveSettings();
        } else {
          // Keep PRO on for tests
          setPro(true);
        }
      }
    }catch(_){ /* ignore */ }
  })();


  function saveSettings(){
    localStorage.setItem(APP.settingsKey, JSON.stringify(settings));
    // Ricarica le impostazioni per assicurarsi che siano sincronizzate
    try {
      Object.assign(settings, JSON.parse(localStorage.getItem(APP.settingsKey)||"{}"));
    } catch(_) {}
  }

  function setProUI(){
    $("#proState").textContent = settings.isPro ? "PRO" : "FREE";
    const fh = $("#freeHint");
    if(fh) fh.style.display = settings.isPro ? "none" : "block";
  }
// ---------------- NAV ----------------
function showPage(name){
  // Modalità semplice: blocca Archivio/Report (resta Home + Camera)
  const __simpleOn = (()=>{ try{return localStorage.getItem("__sspSimpleMode")==="1";}catch(_){return false;} })();
  if(__simpleOn && (name==="archive" || name==="report")){
    try{ if(typeof toast==="function") toast("Modalità semplice: disponibili solo Home e Foto 📷"); }catch(_){ }
    name = "home";
  }

  document.querySelectorAll(".page").forEach(p=>{
    p.classList.toggle("active", p.getAttribute("data-page")===name);
  });
  document.querySelectorAll(".navBtn").forEach(b=>{
    b.classList.toggle("active", b.getAttribute("data-nav")===name);
  });
  const sub=$("#headerSubtitle");
  if(sub){
    sub.textContent =
      name==="home" ? "Offline • PDF • Foto scontrini • Backup" :
      name==="archive" ? "Archivio • Lista o Timeline" :
      "Report • PDF + Analisi categorie";
  }
  if(name==="archive") renderArchive();
  if(name==="report") renderAnalysis();
}

// ---------------- DB ----------------
let db=null;
function openDB(){
  return new Promise((resolve,reject)=>{
    try {
      const req=indexedDB.open(APP.dbName, APP.dbVersion);
      req.onupgradeneeded=()=>{
        const _db=req.result;
        let st;
        if(!_db.objectStoreNames.contains(APP.store)){
          st=_db.createObjectStore(APP.store,{keyPath:"id"});
        } else {
          st = req.transaction.objectStore(APP.store);
        }
        // indexes (idempotent)
        try{ if(!st.indexNames.contains("by_date")) st.createIndex("by_date","date",{unique:false}); }catch(_){}
        try{ if(!st.indexNames.contains("by_month")) st.createIndex("by_month","month",{unique:false}); }catch(_){}
        try{ if(!st.indexNames.contains("by_category")) st.createIndex("by_category","category",{unique:false}); }catch(_){}
        try{ if(!st.indexNames.contains("by_amount")) st.createIndex("by_amount","amount",{unique:false}); }catch(_){}
        try{ if(!st.indexNames.contains("by_type")) st.createIndex("by_type","type",{unique:false}); }catch(_){}
      };
      req.onsuccess=()=>{ db=req.result; resolve(true); };
      req.onerror=()=>reject(req.error);
    } catch(e) {
      console.error("Errore apertura DB:", e);
      resolve(false);
    }
  });
}
function txStore(mode="readonly"){
  return db.transaction(APP.store, mode).objectStore(APP.store);
}
function dbGetAll(){
  return new Promise((resolve,reject)=>{
    const req=txStore("readonly").getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
function dbPut(item){
  return new Promise((resolve,reject)=>{
    const req=txStore("readwrite").put(item);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error);
  });
}
function dbDelete(id){
  return new Promise((resolve,reject)=>{
    const req=txStore("readwrite").delete(id);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error);
  });
}
function dbClear(){
  return new Promise((resolve,reject)=>{
    const req=txStore("readwrite").clear();
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error);
  });
}

// ---------------- PHOTO / SCANNER ----------------
async function fileToImage(file){
  const url = URL.createObjectURL(file);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{ 
      URL.revokeObjectURL(url); 
      resolve(img); 
    };
    img.onerror=()=>{ 
      URL.revokeObjectURL(url); 
      reject(new Error("Immagine non valida")); 
    };
    img.src=url;
  });
}

async function imageToDataUrl(img, rotateDeg=0, crop=null, contrast=1.0, bright=0){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  let sx=0, sy=0, sw=w, sh=h;
  if(crop){
    sx = Math.max(0, Math.min(w-1, crop.x));
    sy = Math.max(0, Math.min(h-1, crop.y));
    sw = Math.max(1, Math.min(w - sx, crop.w));
    sh = Math.max(1, Math.min(h - sy, crop.h));
  }

  const base = document.createElement("canvas");
  base.width = sw; base.height = sh;
  const bctx = base.getContext("2d", { willReadFrequently:true });
  bctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const imgData = bctx.getImageData(0,0,sw,sh);
  const d = imgData.data;
  const c = contrast;
  const br = bright;
  for(let i=0;i<d.length;i+=4){
    let r=d[i], g=d[i+1], b=d[i+2];
    r = (r - 128) * c + 128 + br;
    g = (g - 128) * c + 128 + br;
    b = (b - 128) * c + 128 + br;
    d[i]   = Math.max(0, Math.min(255, r));
    d[i+1] = Math.max(0, Math.min(255, g));
    d[i+2] = Math.max(0, Math.min(255, b));
  }
  bctx.putImageData(imgData,0,0);

  const rad = (rotateDeg % 360) * Math.PI / 180;
  const rot90 = (Math.abs(rotateDeg) % 180) === 90;
  const out = document.createElement("canvas");
  out.width = rot90 ? sh : sw;
  out.height = rot90 ? sw : sh;
  const octx = out.getContext("2d");
  octx.translate(out.width/2, out.height/2);
  octx.rotate(rad);
  octx.drawImage(base, -sw/2, -sh/2);

  const ow=out.width, oh=out.height;
  const max=APP.photoMaxSide;
  const scale=Math.min(1, max/Math.max(ow,oh));
  const rw=Math.max(1, Math.round(ow*scale));
  const rh=Math.max(1, Math.round(oh*scale));

  const fin=document.createElement("canvas");
  fin.width=rw; fin.height=rh;
  const fctx=fin.getContext("2d");
  fctx.drawImage(out, 0,0, ow,oh, 0,0, rw,rh);

  return fin.toDataURL("image/jpeg", APP.photoJpegQuality);
}

function dataURLtoFile(dataurl){
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], "scan.jpg", {type:mime});
}
// ---------------- DATA + UI ----------------
let all=[];
let archiveLimit=80;
let __lastFilterKey="";
let editId=null;
let modalCurrentId=null;

// scanner state
let scanImg=null;
let scanRotate=0;
let scanContrast=1.15;
let scanBright=8;
let cropMargins={l:2,r:2,t:2,b:2};
let previewPhoto=null;
let selectedPhotos=[]; // compressed previews (dataURL)
let selectedOriginals=[]; // originals (dataURL)
let selectedGeo=null; // {lat,lon,acc,ts}

function fillCategories(){
  $("#inCategory").innerHTML = CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("#fCategory").innerHTML = `<option value="">Tutte</option>` + CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function applyFilters(){
  const m = ($("#fMonth")?.value || "").trim();
  const c = ($("#fCategory")?.value || "").trim();
  const q = ($("#fSearch")?.value || "").trim().toLowerCase();

  const from = $("#fFrom")?.value || "";
  const to   = $("#fTo")?.value || "";
  const minV = parseEuro($("#fMin")?.value || "");
  const maxV = parseEuro($("#fMax")?.value || "");
  const hasP = ($("#fHasPhoto")?.value || "");
  const tagQ = ($("#fTag")?.value || "").trim().toLowerCase();

  const __key = [m,c,q,from,to,String(minV),String(maxV),hasP,tagQ].join("|");
  if(__key !== __lastFilterKey){ __lastFilterKey = __key; archiveLimit = 80; }

  let list = all.slice();

  // Exclude recurring templates from normal views
  list = list.filter(x=>String(x.type||"expense")!=="recurring_template");

  if(m) list = list.filter(x=>(x.month||yyyymm(x.date||""))===m);
  if(c) list = list.filter(x=>x.category===c);
  if(q) list = list.filter(x =>
    (x.note||"").toLowerCase().includes(q) ||
    (x.category||"").toLowerCase().includes(q) ||
    (Array.isArray(x.tags)? x.tags.join(" ").toLowerCase().includes(q) : false)
  );

  if(from) list = list.filter(x=> (x.date||"") >= from);
  if(to)   list = list.filter(x=> (x.date||"") <= to);

  if(Number.isFinite(minV)) list = list.filter(x=>(+x.amount||0) >= minV);
  if(Number.isFinite(maxV) && maxV>0) list = list.filter(x=>(+x.amount||0) <= maxV);

  if(hasP==="1") list = list.filter(x=>hasAnyPhoto(x));
  if(hasP==="0") list = list.filter(x=>!hasAnyPhoto(x));

  if(tagQ){
    list = list.filter(x=>{
      const t = Array.isArray(x.tags) ? x.tags : [];
      return t.some(z=>String(z||"").toLowerCase().includes(tagQ));
    });
  }

  list.sort((a,b)=>(String(b.date||"").localeCompare(String(a.date||""))));
  return list;
}

function cafBadgeHtml(cat){
  return isCaf(cat) ? `<span class="badge caf">⭐ Detraibile (730)</span>` : "";
}

function primaryPhoto(x){
  try{
    return x && (x.photo || (Array.isArray(x.photos) ? x.photos[0] : null)) || null;
  }catch(_){ return null; }
}
function hasAnyPhoto(x){
  try{
    return !!(primaryPhoto(x) || (Array.isArray(x.photos) && x.photos.length));
  }catch(_){ return false; }
}

function calcStats(){
  const mNow=monthNow();
  const yNow=String(new Date().getFullYear());
  const monthTotal = all.filter(x=>String(x.type||"expense")!=="recurring_template" && x.month===mNow).reduce((s,x)=>s+(+x.amount||0),0);
  const yearTotal  = all.filter(x=>String(x.type||"expense")!=="recurring_template" && (x.date||"").startsWith(yNow+"-")).reduce((s,x)=>s+(+x.amount||0),0);
  $("#statMonth").textContent = money(monthTotal, settings.baseCurrency);
  $("#statYear").textContent = money(yearTotal, settings.baseCurrency);
  renderBudgetHome(monthTotal, mNow);
}

function renderRecent(){
  const el=$("#recentList");
  const list=all.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,6);
  if(list.length===0){
    el.innerHTML = `<div class="hint">Ancora nessuna spesa. Premi “＋” per aggiungerne una.</div>`;
    return;
  }
  el.innerHTML = list.map(x=>`
    <div class="item" data-open="${escapeHtml(x.id)}">
      <div class="thumb">${primaryPhoto(x)?`<img src="${primaryPhoto(x)}" alt="scontrino">`:"—"}</div>
      <div class="meta">
        <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
        <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
      </div>
      <div class="amt">${money(x.amount, x.currency||settings.baseCurrency)}</div>
    </div>
  `).join("");
  // Se vuoi il bottone "Carica altre", scommentare:
  // if(list.length > 6){
  //   const more = document.createElement("button");
  //   more.className = "btn";
  //   more.type = "button";
  //   more.textContent = `Carica altre (${list.length - 6})`;
  //   more.addEventListener("click", ()=>{ archiveLimit += 80; renderArchive(); });
  //   el.appendChild(more);
  // }
  el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
}

function renderList(){
  const el=$("#list");
  const list=applyFilters();
  const shown = list.slice(0, archiveLimit);
  const total=list.reduce((s,x)=>s+(+x.amount||0),0);
  $("#countLabel").textContent = `${list.length} spese (totale in app: ${all.length})`;
  $("#sumLabel").textContent = `Totale filtro: ${money(total, settings.baseCurrency)}`;

  if(list.length===0){
    el.innerHTML = `<div class="hint">Nessuna spesa con questi filtri. Premi “＋” per aggiungere.</div>`;
    return;
  }
  el.innerHTML = shown.map(x=>`
    <div class="item" data-open="${escapeHtml(x.id)}">
      <div class="thumb">${primaryPhoto(x)?`<img src="${primaryPhoto(x)}" alt="scontrino">`:"—"}</div>
      <div class="meta">
        <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
        <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
      </div>
      <div class="amt">${money(x.amount, x.currency||settings.baseCurrency)}</div>
    </div>
  `).join("");
  el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
}

function renderTimeline(){
  const el=$("#timeline");
  const list=applyFilters();
  const shown = list.slice(0, archiveLimit);
  if(list.length===0){
    el.innerHTML = `<div class="hint">Nessuna spesa con questi filtri. Premi “＋” per aggiungere.</div>`;
    return;
  }

  const map=new Map();
  for(const x of shown){
    const k=x.date || "—";
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }

  const keys=[...map.keys()].sort((a,b)=>b.localeCompare(a));
  el.innerHTML = keys.map(date=>{
    const items=map.get(date);
    const tot=items.reduce((s,x)=>s+(+x.amount||0),0);
    const rows = items.map(x=>`
      <div class="item" data-open="${escapeHtml(x.id)}" style="border-radius:16px">
        <div class="thumb" style="width:60px;height:60px">${primaryPhoto(x)?`<img src="${primaryPhoto(x)}" alt="scontrino">`:"—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
          <div class="sub">${escapeHtml(x.category)}</div>
        </div>
        <div class="amt">${money(x.amount, x.currency||settings.baseCurrency)}</div>
      </div>
    `).join("");

    return `
      <div class="dayGroup">
        <div class="dayHead">
          <div class="d">${escapeHtml(date)}</div>
          <div class="t">${money(tot, settings.baseCurrency)}</div>
        </div>
        <div class="dayBody">${rows}</div>
      </div>
    `;
  }).join("");
  if(list.length > shown.length){
    const more = document.createElement("button");
    more.className="btn";
    more.type="button";
    more.textContent = `Carica altre (${list.length - shown.length})`;
    more.addEventListener("click", ()=>{ archiveLimit += 80; renderArchive(); });
    el.appendChild(more);
  }

  el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
}

function renderArchive(){
  const listMode = settings.viewMode === "list";
  $("#list").style.display = listMode ? "flex" : "none";
  $("#timeline").style.display = listMode ? "none" : "flex";
  $("#viewList").classList.toggle("active", listMode);
  $("#viewTimeline").classList.toggle("active", !listMode);
  if(listMode) renderList(); else renderTimeline();
}


async function materializeRecurringForCurrentPeriod(){
  // Create real expenses from recurring templates (monthly/yearly) for the current period only.
  const now = new Date();
  const curMonth = monthNow(); // YYYY-MM
  const curYear = String(now.getFullYear());

  const templates = all.filter(x=>String(x.type||"") === "recurring_template" && x.recurring && x.recurring.freq);
  if(!templates.length) return;

  let created = 0;
  for(const t of templates){
    try{
      const start = isoToDate(t.recurring.startDate || t.date);
      if(!start) continue;

      let targetDate;
      if(t.recurring.freq === "monthly"){
        const [y,m] = curMonth.split("-").map(Number);
        const day = start.getDate();
        const lastDay = new Date(y, m, 0).getDate();
        targetDate = new Date(y, m-1, Math.min(day, lastDay));
      }else if(t.recurring.freq === "yearly"){
        const y = Number(curYear);
        const m = start.getMonth();
        const day = start.getDate();
        const lastDay = new Date(y, m+1, 0).getDate();
        targetDate = new Date(y, m, Math.min(day, lastDay));
      }else{
        continue;
      }

      const iso = targetDate.toISOString().slice(0,10);
      if(iso > todayISO()) continue; // do not pre-create future

      const already = all.some(x=>x.recurringParentId===t.id && x.date===iso && String(x.type||"expense")!=="recurring_template");
      if(already) continue;

      const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const inst = {
        id,
        type:"expense",
        recurringParentId: t.id,
        amount: +t.amount || 0,
        currency: t.currency || settings.baseCurrency || "EUR",
        date: iso,
        month: yyyymm(iso),
        category: t.category || "Altro",
        note: t.note || t.category || "Spesa",
        tags: Array.isArray(t.tags) ? t.tags.slice() : [],
        geo: t.geo || null,
        photo: null,
        photos: [],
        photosOriginal: []
      };
      await dbPut(inst);
      created++;
    }catch(e){ console.warn("recurring create failed", e); }
  }
  if(created) toast(`Ricorrenze create: ${created} ✅`, 1200);
}

async function refresh(){
  all = await dbGetAll();
  // build instances from recurring templates (idempotent)
  try{ await materializeRecurringForCurrentPeriod(); }catch(e){}
  all = await dbGetAll();
  // migrate old entries missing 'month'
  try{
    let changed=false;
    for(const x of all){
      if(!x.month && x.date){ x.month = yyyymm(x.date); changed=true; }
      if(typeof x.amount !== 'number') x.amount = Number(x.amount)||0;
    }
    if(changed){
      // write back only updated items
      for(const x of all){ if(x.month && x.id) await dbPut(x); }
    }
  }catch(e){}
  setProUI();
  calcStats();
  renderRecent();
  renderArchive();
  renderAnalysis();
}
// ---------------- SETTINGS UI ----------------
const $ocrKeyInput = $("#ocrKeyInput");
const $ocrProviderSelect = $("#ocrProviderSelect");
const $ocrEndpointInput = $("#ocrEndpointInput");
const $ocrAutoSaveToggle = $("#ocrAutoSaveToggle");
const $langSelect  = $("#langSelect");
const $btnSaveSettings = $("#btnSaveSettings");
const $btnResetApp = $("#btnResetApp");
const $btnTestOcrKey = $("#btnTestOcrKey");
const $ocrKeyStatus = $("#ocrKeyStatus");

function applyLang(){
  const lang = settings.lang || "it";
  document.documentElement.setAttribute("lang", lang);
  // minimal nav labels
  document.querySelectorAll(".navBtn span").forEach(sp=>{
    const txt = sp.textContent.trim();
    if(lang==="en"){
      if(txt==="Archivio") sp.textContent="Archive";
      if(txt==="Report") sp.textContent="Reports";
      if(txt==="Impostazioni") sp.textContent="Settings";
    } else {
      if(txt==="Archive") sp.textContent="Archivio";
      if(txt==="Reports") sp.textContent="Report";
      if(txt==="Settings") sp.textContent="Impostazioni";
    }
  });
}
applyLang();

function syncSettingsForm(){
  if($ocrKeyInput) $ocrKeyInput.value = settings.ocrSpaceKey || "";
  if($ocrProviderSelect) $ocrProviderSelect.value = (settings.ocrMode || "offline");
  if($ocrEndpointInput) $ocrEndpointInput.value = (settings.ocrEndpoint || "");
  if($ocrAutoSaveToggle) $ocrAutoSaveToggle.checked = !!settings.ocrAutoSave;
  if($langSelect)  $langSelect.value = settings.lang || "it";
}

if($btnSaveSettings){
  $btnSaveSettings.addEventListener("click", ()=>{
    const key = ($ocrKeyInput?.value || "").trim();
    if(key) settings.ocrSpaceKey = key;
    const mode = ($ocrProviderSelect?.value || "offline").toLowerCase();
    settings.ocrMode = mode;
    const ep = ($ocrEndpointInput?.value || "").trim();
    settings.ocrEndpoint = ep;
    settings.ocrAutoSave = !!($ocrAutoSaveToggle && $ocrAutoSaveToggle.checked);
    settings.lang = $langSelect?.value || "it";
    saveSettings();
    applyLang();
    toast(settings.lang==="en" ? "Settings saved" : "Impostazioni salvate");
  });
}


// Test OCR.Space API key (non invia foto reali: usa un'immagine di test generata)
if($btnTestOcrKey){
  $btnTestOcrKey.addEventListener("click", async ()=>{
    try{
      if($ocrKeyStatus) $ocrKeyStatus.textContent = "Verifica in corso...";
      const r = await testOcrSpaceKey();
      if(r && r.ok){
        if($ocrKeyStatus) $ocrKeyStatus.textContent = "OK ✅";
        toast("API key OCR.Space valida ✅");
      }else{
        const msg = (r && r.error) ? r.error : "Non valida";
        if($ocrKeyStatus) $ocrKeyStatus.textContent = "Errore";
        toast("API key non valida: " + msg);
      }
    }catch(e){
      if($ocrKeyStatus) $ocrKeyStatus.textContent = "Errore";
      toast("Test key fallito: " + (e && e.message ? e.message : e));
    }
  });
}

if($btnResetApp){
  $btnResetApp.addEventListener("click", ()=>{
    if(!confirm(settings.lang==="en" ? "Reset all app data?" : "Resettare tutti i dati dell'app?")) return;
    localStorage.clear();
    location.reload();
  });
}

// ===================== UNIFICAZIONE MODALITÀ SEMPLICE =====================
function setSimpleMode(on) {
  try {
    localStorage.setItem('__sspSimpleMode', on ? '1' : '0');
    document.body.classList.toggle('ssp-simple', on);
    const fab = document.getElementById('sspSimpleFabV2');
    if (fab) fab.textContent = on ? 'Semplice ON' : 'Semplice OFF';
    const chk = document.getElementById('sspSimpleChkV2');
    if (chk) chk.checked = on;
    const activePage = document.querySelector('.page.active')?.getAttribute('data-page');
    if (activePage === 'home' || activePage === 'archive' || activePage === 'report') {
      showPage(activePage);
    }
    toast(on ? 'Modalità semplice attivata' : 'Modalità semplice disattivata');
  } catch (e) {}
}

// Inizializza la modalità semplice all'avvio
(function initSimpleMode() {
  const on = localStorage.getItem('__sspSimpleMode') === '1';
  setSimpleMode(on);
})();

// Aggiungi listener per il toggle nelle impostazioni (se presente)
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'sspSimpleChkV2') {
    setSimpleMode(e.target.checked);
  }
});

// ===================== NUOVA FOTOCAMERA AUTOMATICA =====================
let autoCamStream = null;
let autoCamAnalyzing = false;
let autoCamGoodFrames = 0;
const AUTO_CAM_THRESHOLD = 5; // numero di frame consecutivi "buoni" per scattare

function startAutoCamera() {
  const video = document.getElementById('camAutoVideo');
  if (!video) return;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        autoCamStream = stream;
        video.srcObject = stream;
        video.play();
        autoCamAnalyzing = true;
        autoCamGoodFrames = 0;
        requestAnimationFrame(analyzeAutoFrame);
      })
      .catch(err => {
        toast("Errore fotocamera: " + err.message);
      });
  } else {
    toast("Fotocamera non supportata");
  }
}

function analyzeAutoFrame() {
  if (!autoCamAnalyzing) return;
  const video = document.getElementById('camAutoVideo');
  const canvas = document.getElementById('camAutoCanvas');
  const ctx = canvas.getContext('2d');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Analisi semplicistica: varianza dei pixel (contrasto)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      sum += gray;
      sumSq += gray * gray;
    }
    const mean = sum / (canvas.width * canvas.height);
    const variance = sumSq / (canvas.width * canvas.height) - mean * mean;
    const isGood = variance > 2000; // soglia empirica
    document.getElementById('camAutoStatus').textContent = isGood ? "OK" : "Inquadra meglio";
    if (isGood) {
      autoCamGoodFrames++;
      if (autoCamGoodFrames >= AUTO_CAM_THRESHOLD) {
        captureAutoFrame();
        return;
      }
    } else {
      autoCamGoodFrames = 0;
    }
  }
  requestAnimationFrame(analyzeAutoFrame);
}

function captureAutoFrame() {
  autoCamAnalyzing = false;
  if (autoCamStream) {
    autoCamStream.getTracks().forEach(t => t.stop());
    autoCamStream = null;
  }
  const video = document.getElementById('camAutoVideo');
  const canvas = document.getElementById('camAutoCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const file = new File([blob], "auto_capture.jpg", { type: "image/jpeg" });
    // Passa al flusso normale come se fosse una foto selezionata
    handleSelectedImages([file]);
    hideModal('#camAutoModal');
  }, 'image/jpeg', 0.9);
}

function openAutoCamera() {
  showModal('#camAutoModal');
  setTimeout(startAutoCamera, 300);
}

// Funzione per determinare se si può fare autosalvataggio
function canAutoSave() {
  const modal = $("#modalAdd");
  if (!modal || !modal.classList.contains('show')) return false;
  if (editId) return false; // non in modifica
  const amt = parseEuro($("#inAmount")?.value);
  const dt = $("#inDate")?.value;
  return Number.isFinite(amt) && amt > 0 && dt;
}
// ---------------- MODALS ----------------
  

function openAdd(){
    editId=null;
    previewPhoto=null;
    selectedPhotos=[];
    selectedOriginals=[];
    selectedGeo=null;
    scanImg=null;
    renderAttachmentsPreview();
    selectedPhotos=[];
    selectedOriginals=[];
    selectedGeo=null;

    $("#addTitle").textContent="➕ Aggiungi spesa";
    $("#inAmount").value="";
    $("#inDate").value=todayISO();
    $("#inCategory").value="Alimentari";
    $("#inNote").value="";
    const t=$("#inTags"); if(t) t.value="";
    const cur=$("#inCurrency"); if(cur) cur.value = (settings.baseCurrency||"EUR");
    const rec=$("#inRecurring"); if(rec) rec.value="";
    const fm=$("#inFastMode"); if(fm) fm.checked = !!settings.fastModeDefault;
    const gs=$("#geoStatus"); if(gs) gs.textContent = "—";

    $("#inPhoto").value="";
    if($("#inPhotoCam")) $("#inPhotoCam").value="";
    setPhotoPreview(null);
    renderAttachmentsPreview();
    applyFastModeUI();

    // optional auto-geo
    if(settings.autoGeo){ try{ captureGeo(); }catch(_){ } }

    showModal("#modalAdd");
    haptic(8);
  }
  function closeAdd(){ hideModal("#modalAdd"); }

  function setPhotoPreview(dataUrl){
    const wrap=$("#photoPrev");
    const im=$("#photoPrevImg");
    if(!dataUrl){
      wrap.style.display="none";
      im.src="";
      return;
    }
    im.src=dataUrl;
    wrap.style.display="block";
  }


  function renderAttachmentsPreview(){
    const grid = document.getElementById("attachmentsPreview");
    if(!grid) return;
    const has = Array.isArray(selectedPhotos) && selectedPhotos.length>0;
    grid.style.display = has ? "flex" : "none";
    if(!has){ grid.innerHTML=""; return; }
    grid.innerHTML = selectedPhotos.map((u, idx)=>`
      <div class="att" data-idx="${idx}">
        <img src="${u}" alt="Allegato ${idx+1}">
        <button class="x" type="button" aria-label="Rimuovi allegato">✖</button>
      </div>
    `).join("");
    grid.querySelectorAll(".att .x").forEach(btn=>{
      btn.addEventListener("click",(e)=>{
        const att = e.target.closest(".att");
        const i = Number(att?.getAttribute("data-idx"));
        if(Number.isFinite(i)){
          selectedPhotos.splice(i,1);
          if(Array.isArray(selectedOriginals) && selectedOriginals.length>i) selectedOriginals.splice(i,1);
          // keep legacy preview in sync
          previewPhoto = selectedPhotos[0] || null;
          setPhotoPreview(previewPhoto);
          renderAttachmentsPreview();
        }
      });
    });
  }

  function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const r = new FileReader();
      r.onload=()=>resolve(String(r.result||""));
      r.onerror=()=>reject(r.error||new Error("read error"));
      r.readAsDataURL(file);
    });
  }

  async function handleSelectedImages(fileList){
    const files = Array.from(fileList||[]).filter(Boolean);
    if(files.length===0){
      selectedPhotos=[]; selectedOriginals=[];
      previewPhoto=null; scanImg=null;
      setPhotoPreview(null);
      renderAttachmentsPreview();
      if(window.__sspReceipt){
        window.__sspReceipt.file = null;
        window.__sspReceipt.getLastFile = () => null;
      }
      return;
    }

    // Add all selected files (append mode)
    for(const f of files){
      try{
        const img = await fileToImage(f);
        const compressed = await imageToDataUrl(img, 0, null, 1.0, 0);
        selectedPhotos.push(compressed);
        if(settings.saveOriginals){
          try{
            const orig = await fileToDataURL(f);
            selectedOriginals.push(orig);
          }catch(_){
            // if original fails, keep compressed
            selectedOriginals.push(compressed);
          }
        }
      }catch(e){
        console.warn("bad image skipped", e);
      }
    }

    previewPhoto = selectedPhotos[0] || null;
    if(previewPhoto) setPhotoPreview(previewPhoto);
    renderAttachmentsPreview();

    // OCR uses first file only (fast + stable)
    const first = files[0];
    if(first && window.__sspReceipt){
      window.__sspReceipt.file = first;
      window.__sspReceipt.getLastFile = () => first;
    }
    if(first){
      toast(files.length>1 ? `Allegati ${files.length} scontrini ✅` : "Foto caricata ✅");
      try{ await window.__sspReceipt?.handle?.(first, "select"); }catch(_){}
      try{ scanImg = await fileToImage(first); }catch(_){}
    }

    // Autosalvataggio migliorato
    if (settings.ocrAutoSave && canAutoSave()) {
      setTimeout(() => {
        if (canAutoSave() && !editId) {
          $("#btnSave")?.click();
        }
      }, 800);
    }
  }

  function captureGeo(){
    const out = document.getElementById("geoStatus");
    if(!("geolocation" in navigator)){
      if(out) out.textContent = "Non supportato";
      toast("Geolocalizzazione non supportata");
      return;
    }
    if(out) out.textContent = "Acquisizione…";
    navigator.geolocation.getCurrentPosition((pos)=>{
      const c = pos.coords;
      selectedGeo = { lat:c.latitude, lon:c.longitude, acc:c.accuracy, ts: Date.now() };
      if(out) out.textContent = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} (±${Math.round(c.accuracy)}m)`;
      toast("Luogo salvato ✅");
    }, (err)=>{
      console.warn(err);
      if(out) out.textContent = "Permesso negato / errore";
      toast("Impossibile leggere la posizione");
    }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
  }

  function applyFastModeUI(){
    const fm = document.getElementById("inFastMode");
    const on = !!fm?.checked;
    // In fast mode we simply auto-fill some fields and keep UI lean.
    document.body.classList.toggle("fast-mode", on);
  }


  function openDetails(id){
    const x=all.find(e=>e.id===id);
    if(!x) return;
    modalCurrentId=id;
    $("#mTitle").textContent = `${x.note||"Spesa"} • ${money(x.amount, x.currency||settings.baseCurrency)}`;
    $("#mMeta").textContent = `${x.date} • ${x.category}${isCaf(x.category) ? " • Detraibile (730)" : ""} • ${x.month}`;
    const img=$("#mImg");
    const __p = primaryPhoto(x);
    if(__p){
      img.src=__p;
      img.style.display="block";
    }else{
      img.src="";
      img.style.display="none";
    }
    showModal("#modalDetails");
    haptic(8);
  }
  function closeDetails(){ hideModal("#modalDetails"); modalCurrentId=null; }

  function openEdit(){
    if(!modalCurrentId) return;
    const x=all.find(e=>e.id===modalCurrentId);
    if(!x) return;

    editId=x.id;
    previewPhoto=null;
    scanImg=null;

    $("#addTitle").textContent="✏️ Modifica spesa";
    $("#inAmount").value=String(x.amount).replace(".",",");
    $("#inDate").value=x.date;
    $("#inCategory").value=x.category;
    $("#inNote").value=x.note||"";
    const t=$("#inTags"); if(t) t.value = Array.isArray(x.tags)? x.tags.join(", ") : "";
    const cur=$("#inCurrency"); if(cur) cur.value = (x.currency||settings.baseCurrency||"EUR");
    const rec=$("#inRecurring"); if(rec) rec.value = (x.type==="recurring_template" && x.recurring && x.recurring.freq) ? x.recurring.freq : "";
    const fm=$("#inFastMode"); if(fm) fm.checked = false;
    selectedGeo = x.geo || null;
    const gs=$("#geoStatus"); if(gs) gs.textContent = selectedGeo ? `${selectedGeo.lat.toFixed(5)}, ${selectedGeo.lon.toFixed(5)}` : "—";
    $("#inPhoto").value="";
    setPhotoPreview(primaryPhoto(x) || null);
    // preload multi-attachments (legacy photo remains supported)
    selectedPhotos = Array.isArray(x.photos) ? x.photos.slice() : (x.photo ? [x.photo] : []);
    selectedOriginals = Array.isArray(x.photosOriginal) ? x.photosOriginal.slice() : [];
    renderAttachmentsPreview();

    closeDetails();
    showModal("#modalAdd");
  }

  async function deleteCurrent(){
    if(!modalCurrentId) return;
    if(!confirm("Eliminare questa spesa?")) return;
    await dbDelete(modalCurrentId);
    closeDetails();
    toast("Eliminata ✅");
    await refresh();
    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);
  }

  async function duplicateCurrent(){
    if(!modalCurrentId) return;
    const x = all.find(z=>z.id===modalCurrentId);
    if(!x) return;
    closeDetails();
    openAdd();
    // prefill
    $("#inAmount").value = String((+x.amount||0).toFixed(2)).replace(".",",");
    $("#inDate").value = todayISO();
    $("#inCategory").value = x.category || "Alimentari";
    $("#inNote").value = (x.note||"");
    const t=$("#inTags"); if(t) t.value = Array.isArray(x.tags)? x.tags.join(", ") : "";
    const cur=$("#inCurrency"); if(cur) cur.value = (x.currency||settings.baseCurrency||"EUR");
    const rec=$("#inRecurring"); if(rec) rec.value = ""; // duplicata non diventa template
    selectedGeo = x.geo || null;
    const gs=$("#geoStatus"); if(gs) gs.textContent = selectedGeo ? `${selectedGeo.lat.toFixed(5)}, ${selectedGeo.lon.toFixed(5)}` : "—";
    selectedPhotos = Array.isArray(x.photos)? x.photos.slice(): (x.photo?[x.photo]:[]);
    selectedOriginals = Array.isArray(x.photosOriginal)? x.photosOriginal.slice(): [];
    previewPhoto = selectedPhotos[0] || null;
    setPhotoPreview(previewPhoto);
    renderAttachmentsPreview();
    toast("Spesa duplicata: modifica e salva ✅");
  }

  // ---------------- BUDGET ----------------
  function getBudgetCents(month){
    const v = settings.budgetByMonth[month];
    return Number.isFinite(v) ? v : null;
  }
  function setBudgetCents(month, cents){
    if(cents == null) delete settings.budgetByMonth[month];
    else settings.budgetByMonth[month] = cents;
    saveSettings();
  }

  function renderBudgetHome(monthTotal, month){
    const bc = getBudgetCents(month);
    const bar = $("#budgetBar");
    const sub = $("#budgetSub");
    const left = $("#budgetLeft");
    const pct = $("#budgetPct");

    if(!bar || !sub || !left || !pct) return;

    if(!bc){
      bar.style.width = "0%";
      sub.textContent = "Imposta un budget per vedere il progresso";
      left.textContent = "—";
      pct.textContent = "—";
      return;
    }

    const budget = bc / 100;
    const used = monthTotal;
    const ratio = budget <= 0 ? 0 : Math.min(1.2, used / budget);
    const percent = Math.min(100, Math.round(ratio * 100));
    bar.style.width = `${Math.min(100, ratio*100)}%`;

    const remaining = budget - used;
    sub.textContent = `Mese ${month} • Budget: ${money(budget, settings.baseCurrency)}`;
    left.textContent = remaining >= 0 ? `Restano: ${money(remaining, settings.baseCurrency)}` : `Sforato: ${euro(Math.abs(remaining))}`;
    pct.textContent = `${percent}%`;

    if(used > budget) toast("⚠️ Budget superato", 1200);
  }

  function openBudgetModal(){
    const m = $("#fMonth").value || monthNow();
    const bc = getBudgetCents(m);
    $("#budgetInput").value = bc ? String((bc/100).toFixed(2)).replace(".",",") : "";
    showModal("#modalBudget");
  }
  function closeBudgetModal(){ hideModal("#modalBudget"); }

  // ---------------- ANALISI (GRAFICO) ----------------
  function groupByCategoryForMonth(month, onlyCaf){
    const map = new Map();
    for(const x of all){
      const xm = x.month || yyyymm(x.date);
      if(xm !== month) continue;
      if(onlyCaf && !isCaf(x.category)) continue;
      const k = x.category || "Altro";
      map.set(k, (map.get(k) || 0) + (Number(x.amount) || 0));
    }
    return map;
  }

  function renderAnalysisCanvas(rows){
    const c = document.querySelector("#anaCanvas");
    if(!c) return;
    const ctx = c.getContext("2d");
    // Size canvas to current CSS width for crisp export
    const rect = c.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || 600));
    const h = Math.max(1, Math.floor(rect.height || 240));
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);

    // Background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,w,h);

    if(!rows || !rows.length){
      ctx.fillStyle = "#111";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Nessuna spesa per questo mese.", 12, 26);
      return;
    }

    const padL = 10, padR = 10, padT = 14, padB = 18;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const top = rows.slice(0, 8);
    const max = Math.max(1, ...top.map(r=>r.total||0));

    // Axes
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();

    const barGap = 10;
    const barW = Math.max(8, Math.floor((chartW - (top.length-1)*barGap) / top.length));
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#111";

    top.forEach((r,i)=>{
      const v = r.total || 0;
      const bh = Math.round((v / max) * (chartH - 20));
      const x = padL + i*(barW + barGap);
      const y = padT + chartH - bh;

      ctx.fillStyle = "#111";
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x, y, barW, bh);
      ctx.globalAlpha = 1;

      // label (short)
      const lab = String(r.cat||"").slice(0, 10);
      ctx.fillStyle = "#111";
      ctx.globalAlpha = 0.85;
      ctx.fillText(lab, x, padT + chartH + 12);
      ctx.globalAlpha = 1;
    });
  }

  function renderAnalysis(){
    const bars = $("#anaBars");
    const list = $("#anaList");
    if(!bars || !list) return;

    const month = $("#rMonth").value || monthNow();
    const onlyCaf = !!$("#anaOnlyCaf").checked;

    const map = groupByCategoryForMonth(month, onlyCaf);
    const rows = Array.from(map.entries()).map(([cat, total]) => ({cat, total}));
    rows.sort((a,b)=>b.total - a.total);

    const grand = rows.reduce((s,r)=>s+r.total,0);

    if(rows.length === 0){
      bars.innerHTML = `<div class="hint">Nessuna spesa per questo mese.</div>`;
      list.innerHTML = "";
      return;
    }

    const max = rows[0].total || 1;

    bars.innerHTML = rows.slice(0, 8).map(r=>{
      const w = Math.round((r.total / max) * 100);
      return `
        <div class="barRow">
          <div class="muted"><b>${escapeHtml(r.cat)}</b></div>
          <div class="barTrack"><div class="barFill" style="width:${w}%"></div></div>
          <div class="muted" style="text-align:right">${money(r.total, settings.baseCurrency)}</div>
        </div>
      `;
    }).join("");

    list.innerHTML = rows.map(r=>{
      const pct = grand > 0 ? Math.round((r.total/grand)*100) : 0;
      return `
        <div class="anaLine">
          <div><b>${escapeHtml(r.cat)}</b> <span class="muted">${pct}%</span></div>
          <div class="muted">${money(r.total, settings.baseCurrency)}</div>
        </div>
      `;
    }).join("");

    renderAnalysisCanvas(rows);
  }
  // ---------------- SCANNER ----------------

async function autoCropScanner(){
  if(!scanImg) throw new Error("no image");
  // Downscale for speed
  const w0 = scanImg.naturalWidth || scanImg.width;
  const h0 = scanImg.naturalHeight || scanImg.height;
  const maxW = 420;
  const sc = Math.min(1, maxW / Math.max(1,w0));
  const cw = Math.max(1, Math.round(w0*sc));
  const ch = Math.max(1, Math.round(h0*sc));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", {willReadFrequently:true});
  ctx.drawImage(scanImg, 0,0, cw,ch);
  const img = ctx.getImageData(0,0,cw,ch).data;

  // Simple edge detection: find bounding box of "not white" pixels.
  // Threshold tuned for receipts with background/desk.
  const thr = 245;
  let minX=cw, minY=ch, maxX=0, maxY=0;
  for(let y=0;y<ch;y++){
    for(let x=0;x<cw;x++){
      const i=(y*cw+x)*4;
      const r=img[i], g=img[i+1], b=img[i+2];
      // grayscale
      const v = (r*0.299 + g*0.587 + b*0.114);
      if(v < thr){
        if(x<minX) minX=x;
        if(y<minY) minY=y;
        if(x>maxX) maxX=x;
        if(y>maxY) maxY=y;
      }
    }
  }
  // If nothing found, keep defaults
  if(!(minX < maxX && minY < maxY)){
    cropMargins = {l:2,r:2,t:2,b:2};
  } else {
    // Add padding (in scaled pixels)
    const pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(cw-1, maxX + pad);
    maxY = Math.min(ch-1, maxY + pad);

    // Convert to % margins for original image
    const leftPct = (minX / cw) * 100;
    const rightPct = ((cw-1 - maxX) / cw) * 100;
    const topPct = (minY / ch) * 100;
    const botPct = ((ch-1 - maxY) / ch) * 100;

    // Clamp to UI ranges 0..30
    cropMargins = {
      l: Math.max(0, Math.min(30, Math.round(leftPct))),
      r: Math.max(0, Math.min(30, Math.round(rightPct))),
      t: Math.max(0, Math.min(30, Math.round(topPct))),
      b: Math.max(0, Math.min(30, Math.round(botPct))),
    };
  }

  // Reflect in sliders
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value=String(v); };
  set("cropL", cropMargins.l);
  set("cropR", cropMargins.r);
  set("cropT", cropMargins.t);
  set("cropB", cropMargins.b);
}

  function resetScanner(){
    scanRotate = 0;
    scanContrast = 1.15;
    scanBright = 8;
    cropMargins = {l:2,r:2,t:2,b:2};
    $("#scanContrast").value = String(scanContrast);
    $("#scanBright").value = String(scanBright);
    $("#cropL").value = String(cropMargins.l);
    $("#cropR").value = String(cropMargins.r);
    $("#cropT").value = String(cropMargins.t);
    $("#cropB").value = String(cropMargins.b);
  }

  function computeCropRect(img){
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const l = Math.round(w * (cropMargins.l/100));
    const r = Math.round(w * (cropMargins.r/100));
    const t = Math.round(h * (cropMargins.t/100));
    const b = Math.round(h * (cropMargins.b/100));
    const x = Math.max(0, l);
    const y = Math.max(0, t);
    const cw = Math.max(1, w - l - r);
    const ch = Math.max(1, h - t - b);
    return {x,y,w:cw,h:ch};
  }

  async function drawScannerPreview(){
    if(!scanImg) return;
    const c = $("#scanCanvas");
    const ctx = c.getContext("2d");
    const w = scanImg.naturalWidth || scanImg.width;
    const h = scanImg.naturalHeight || scanImg.height;

    const maxW = 900;
    const scale = Math.min(1, maxW / w);
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));

    const crop = computeCropRect(scanImg);
    const dataUrl = await imageToDataUrl(scanImg, scanRotate, crop, scanContrast, scanBright);
    const img = await fileToImage(dataURLtoFile(dataUrl));
    ctx.clearRect(0,0,c.width,c.height);
    ctx.drawImage(img, 0,0, c.width,c.height);
  }

  async function openScanner(){
    if(!scanImg){ toast("Prima seleziona una foto"); return; }
    resetScanner();
    showModal("#modalScanner");
    await drawScannerPreview();
  }
  function closeScanner(){ hideModal("#modalScanner"); }

  async function applyScanner(){
    if(!scanImg) return;
    const crop = computeCropRect(scanImg);
    const dataUrl = await imageToDataUrl(scanImg, scanRotate, crop, scanContrast, scanBright);
    previewPhoto = dataUrl;
    if(Array.isArray(selectedPhotos) && selectedPhotos.length){ selectedPhotos[0]=dataUrl; }
    else { selectedPhotos=[dataUrl]; }
    if(settings.saveOriginals){
      if(Array.isArray(selectedOriginals) && selectedOriginals.length){ selectedOriginals[0]=dataUrl; }
      else { selectedOriginals=[dataUrl]; }
    }
    setPhotoPreview(previewPhoto);
    renderAttachmentsPreview();
    toast("Scanner applicato ✅");
    closeScanner();
  }

  // ---------------- SAVE / RESET ----------------
  async function onSave(){
    let amountVal = parseEuro($("#inAmount").value);
    let dateVal = $("#inDate").value;
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();
    const file = (window.__sspReceipt?.file) || ($("#inPhoto").files && $("#inPhoto").files[0]);

    // Auto-OCR: se c'è una foto e importo/data non sono validi, prova prima di salvare
    if((!Number.isFinite(amountVal) || amountVal<=0 || !dateVal) && file && window.__sspReceipt?.handle){
      try{ await window.__sspReceipt.handle(file, "autosave"); }catch(e){}
    }

    // Rilegge i campi dopo eventuale OCR
    amountVal = parseEuro($("#inAmount").value);
    dateVal = $("#inDate").value;

    if(!Number.isFinite(amountVal) || amountVal<=0){ toast("Importo non valido"); haptic(18); return; }
    if(!dateVal){ toast("Seleziona una data"); haptic(18); return; }

    const amount = amountVal;
    const date = dateVal;


    if(!settings.isPro && !editId && all.length >= APP.freeLimitExpenses){
      alert(`Versione FREE: massimo ${APP.freeLimitExpenses} spese. Attiva PRO per illimitate.`);
      return;
    }

    let base=null;
    if(editId) base = all.find(x=>x.id===editId) || null;

    let photos = base ? (Array.isArray(base.photos) ? base.photos.slice() : (base.photo ? [base.photo] : [])) : [];
    let photosOriginal = base ? (Array.isArray(base.photosOriginal) ? base.photosOriginal.slice() : []) : [];

    // If user selected attachments in this session, they win
    if(Array.isArray(selectedPhotos) && selectedPhotos.length){
      photos = selectedPhotos.slice();
    }else if(previewPhoto){
      photos = [previewPhoto];
    }else if(file){
      const img = await fileToImage(file);
      const u = await imageToDataUrl(img, 0, null, 1.0, 0);
      photos = [u];
    }

    if(settings.saveOriginals && Array.isArray(selectedOriginals) && selectedOriginals.length){
      photosOriginal = selectedOriginals.slice();
    }

    const photo = photos[0] || null;

    const id = editId || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);

    const __fmOn = !!($("#inFastMode") && $("#inFastMode").checked);
    const tags = __fmOn ? [] : parseTags($("#inTags")?.value || "");
    const currency = ($("#inCurrency")?.value || settings.baseCurrency || "EUR").toUpperCase();
    const recurring = __fmOn ? "" : ($("#inRecurring")?.value || "");
    const itemType = recurring ? "recurring_template" : "expense";

    const item = {
      id,
      type: itemType,
      amount,
      currency,
      date,
      month: yyyymm(date),
      category,
      note: note || category,
      tags,
      geo: selectedGeo,
      recurring: recurring ? { freq: recurring, startDate: date } : null,
      photo, // legacy primary photo for backward compat
      photos,
      photosOriginal: (settings.saveOriginals ? photosOriginal : [])
    };

    await dbPut(item);

    closeAdd();
    toast(editId ? "Aggiornato ✅" : "Salvato ✅");
    haptic(10);

    editId=null;
    previewPhoto=null;
    scanImg=null;

    await refresh();
  }

  async function wipeAll(){
    if(!confirm("RESET TOTALE: cancella tutte le spese e foto. Confermi?")) return;
    await dbClear();
    settings.pdfCountByMonth = {};
    saveSettings();
    toast("Reset completato ✅");
    await refresh();
  }

  // ---------------- PDF ----------------
  function canGeneratePdf(){
    if(settings.isPro) return true;
    const m = monthNow();
    const used = Number(settings.pdfCountByMonth[m]||0);
    if(used >= APP.freeLimitPdfPerMonth){
      alert(`Versione FREE: massimo ${APP.freeLimitPdfPerMonth} PDF nel mese. Attiva PRO per illimitato.`);
      return false;
    }
    return true;
  }
  function incPdfCount(){
    const m = monthNow();
    settings.pdfCountByMonth[m] = Number(settings.pdfCountByMonth[m]||0) + 1;
    saveSettings();
  }

  async function generatePdf(mode, targetMonth){
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert("PDF non disponibile (jsPDF non caricato).");
      return;
    }
    if(!canGeneratePdf()) return;

    let list = all.filter(x=>( (x.month || yyyymm(x.date)) === targetMonth ));
    if(mode==="caf") list = list.filter(x=>isCaf(x.category));

    if(list.length===0){ toast("Nessuna spesa per il PDF"); return; }

    list.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    const total = list.reduce((s,x)=>s+(+x.amount||0),0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    let y = margin;

    const title = mode==="caf" ? "Report CAF/ISEE" : "Report Mensile";

    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("Spese & Scontrini PRO", margin, y); y+=18;

    doc.setFont("helvetica","normal"); doc.setFontSize(12);
    doc.text(title, margin, y); y+=16;

    doc.setFontSize(10);
    doc.text(`Mese: ${targetMonth} • Voci: ${list.length}`, margin, y); y+=14;
    doc.text(`Totale: ${money(total, settings.baseCurrency)}`, margin, y); y+=18;

    if(!settings.isPro){
      doc.setFontSize(46);
      doc.setTextColor(200);
      doc.text("VERSIONE GRATUITA", pageW/2, pageH/2, { align:"center", angle:-25 });
      doc.setTextColor(0);
      doc.setFontSize(10);
    }

    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("Data", margin, y);
    doc.text("Categoria", margin+90, y);
    doc.text("Descrizione", margin+220, y);
    doc.text("Importo", pageW-margin, y, {align:"right"});
    y+=10;
    doc.setDrawColor(180);
    doc.line(margin, y, pageW-margin, y);
    y+=14;
    doc.setFont("helvetica","normal");

    for(const x of list){
      if(y > pageH - 120){ doc.addPage(); y=margin; }
      doc.text(String(x.date), margin, y);
      doc.text(String(x.category).slice(0,18), margin+90, y);
      doc.text(String(x.note||"").slice(0,35), margin+220, y);
      doc.text(money(x.amount, x.currency||settings.baseCurrency), pageW-margin, y, {align:"right"});
      y+=14;
    }

    doc.addPage(); y=margin;
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text("Foto scontrini", margin, y); y+=14;
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text("Foto ottimizzate (scanner/compresse) per stabilità in APK.", margin, y); y+=14;

    const pics = list.filter(x=>hasAnyPhoto(x));
    if(pics.length===0){
      doc.text("Nessuna foto allegata.", margin, y);
    } else {
      const colW = (pageW - margin*2 - 10)/2;
      const imgH = 220;
      let col=0;

      for(const x of pics){
        if(y + imgH > pageH - margin){ doc.addPage(); y=margin; col=0; }
        const xPos = margin + (col===0 ? 0 : colW+10);
        const yPos = y;

        doc.setFont("helvetica","bold"); doc.setFontSize(10);
        doc.text(`${x.date} • ${x.category} • ${money(x.amount, x.currency||settings.baseCurrency)}`, xPos, yPos);

        try{ doc.addImage(primaryPhoto(x), "JPEG", xPos, yPos+14, colW, imgH, undefined, "FAST"); }
        catch{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text("Immagine non inseribile.", xPos, yPos+40); }

        col = 1-col;
        if(col===0) y += (imgH + 30);
      }
    }

    if(!settings.isPro) incPdfCount();

    const fileName = mode==="caf" ? `Report_730_${targetMonth}.pdf` : `Report_Mese_${targetMonth}.pdf`;
    doc.save(fileName);
    toast("PDF creato ✅");
  }

  // ---------------- COMMERCIALISTA (PACCHETTO: CSV + PDF + opz. foto) ----------------
  function firstDayOfMonth(ym){
    // ym: YYYY-MM
    const [y,m] = String(ym||'').split('-').map(Number);
    if(!y || !m) return null;
    return `${y}-${pad2(m)}-01`;
  }
  function lastDayOfMonth(ym){
    const [y,m] = String(ym||'').split('-').map(Number);
    if(!y || !m) return null;
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function isoToDate(iso){
    const s = String(iso||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00');
    return isNaN(+d) ? null : d;
  }
  function inRangeISO(iso, fromISO, toISO){
    // inclusive
    const d = isoToDate(iso);
    const f = isoToDate(fromISO);
    const t = isoToDate(toISO);
    if(!d || !f || !t) return false;
    return d >= f && d <= t;
  }
  function moneyCsv(v){
    // Italian-friendly: decimal comma
    const n = Number(v||0);
    return n.toFixed(2).replace('.', ',');
  }
  function csvEscape(v){
    const s = String(v ?? '');
    if(/[";\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }
  function buildCsv(expenses){
    const header = ['Data','Categoria','Descrizione','Importo'];
    const rows = [header.join(';')];
    for(const x of expenses){
      rows.push([
        csvEscape(x.date || ''),
        csvEscape(x.category || ''),
        csvEscape(x.note || ''),
        csvEscape(moneyCsv(x.amount || 0))
      ].join(';'));
    }
    return rows.join('\n');
  }
  function dataUrlToBlob(dataUrl){
    try{
      if(!dataUrl || typeof dataUrl !== 'string') return null;
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if(!m) return null;
      const mime = m[1];
      const b64 = m[2];
      const bin = atob(b64);
      const len = bin.length;
      const buf = new Uint8Array(len);
      for(let i=0;i<len;i++) buf[i] = bin.charCodeAt(i);
      return new Blob([buf], {type:mime});
    }catch(e){ return null; }
  }
  async function buildPdfBlobFromList(mode, titleLabel, rangeLabel, list){
    if(!window.jspdf || !window.jspdf.jsPDF) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 42;
    let y = margin;

    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("Spese & Scontrini PRO", margin, y); y+=18;

    doc.setFont("helvetica","normal"); doc.setFontSize(12);
    doc.text(titleLabel, margin, y); y+=16;

    doc.setFontSize(10);
    doc.text(rangeLabel, margin, y); y+=14;

    const total = list.reduce((s,x)=>s+(+x.amount||0),0);
    doc.text(`Voci: ${list.length} • Totale: ${money(total, settings.baseCurrency)}`, margin, y); y+=18;

    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    doc.text("Data", margin, y);
    doc.text("Categoria", margin+90, y);
    doc.text("Descrizione", margin+220, y);
    doc.text("Importo", pageW-margin, y, {align:"right"});
    y+=10;
    doc.setDrawColor(180);
    doc.line(margin, y, pageW-margin, y);
    y+=14;
    doc.setFont("helvetica","normal");

    for(const x of list){
      if(y > pageH - 120){ doc.addPage(); y=margin; }
      doc.text(String(x.date||''), margin, y);
      doc.text(String(x.category||'').slice(0,18), margin+90, y);
      doc.text(String(x.note||"").slice(0,35), margin+220, y);
      doc.text(euro(x.amount||0), pageW-margin, y, {align:"right"});
      y+=14;
    }

    // return blob
    const blob = doc.output('blob');
    return blob;
  }

  async function shareOrDownloadFiles(files, title){
    // Try native share (Android). If not available, download.
    try{
      if(navigator.share && navigator.canShare){
        const can = navigator.canShare({ files });
        if(can){
          await navigator.share({ title: title||'Pacchetto commercialista', files });
          toast("Condiviso ✅");
          return;
        }
      }
    }catch(e){ /* ignore */ }

    // Fallback: download all
    for(const f of files){
      try{
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name || 'file';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 800);
      }catch(e){ /* ignore */ }
    }
    toast("File pronti ✅");
  }

  async function sendToAccountant(opts){
    if(!requirePro("Invio al commercialista")) return;

    const fromISO = opts?.from;
    const toISO = opts?.to;
    const mode = 'caf'; // 730 automatico: solo detraibili
    const pack = 'zip'; // pacchetto automatico
    const includePhotos = false; // mai includere foto scontrini nel 730

    if(!isoToDate(fromISO) || !isoToDate(toISO)){
      toast("Date non valide");
      return;
    }
    if(isoToDate(fromISO) > isoToDate(toISO)){
      toast("Intervallo non valido");
      return;
    }

    let list = all.filter(x => inRangeISO(x.date, fromISO, toISO));
    if(mode === 'caf') list = list.filter(x=>isCaf(x.category));
    list.sort((a,b)=>(String(a.date||'').localeCompare(String(b.date||''))));
    if(list.length===0){ toast("Nessuna spesa nel periodo"); return; }

    const rangeLabel = `Periodo: ${fromISO} → ${toISO}`;
    const titleLabel = mode === 'caf' ? 'Report 730 (solo detraibili)' : 'Report completo (commercialista)';

    // CSV
    const csvText = buildCsv(list);
    const csvBlob = new Blob(["\ufeff" + csvText], {type:'text/csv;charset=utf-8'});
    const csvFile = new File([csvBlob], `Spese_${fromISO}_${toISO}.csv`, {type: csvBlob.type});

    // PDF
    const pdfBlob = await buildPdfBlobFromList(mode, titleLabel, rangeLabel, list);
    if(!pdfBlob){ toast("PDF non disponibile"); return; }
    const pdfName = mode==='caf' ? `Report_730_${fromISO}_${toISO}.pdf` : `Report_${fromISO}_${toISO}.pdf`;
    const pdfFile = new File([pdfBlob], pdfName, {type:'application/pdf'});

    // ZIP (optional)
    if(pack === 'zip'){
      const JSZip = window.JSZip;
      if(!JSZip){
        toast("ZIP non disponibile (JSZip non caricato). Invio file separati.");
        await shareOrDownloadFiles([csvFile, pdfFile], 'Commercialista');
        return;
      }
      const zip = new JSZip();
      const base = `Commercialista_${fromISO}_${toISO}`;
      zip.file(csvFile.name, csvBlob);
      zip.file(pdfFile.name, pdfBlob);

      if(includePhotos){
        const folder = zip.folder('Scontrini');
        let i = 0;
        for(const x of list){
          if(!x.photo) continue;
          const b = dataUrlToBlob(x.photo);
          if(!b) continue;
          i++;
          const name = `${pad2(i)}_${String(x.date||'').replace(/[^0-9-]/g,'')}_${String(x.category||'Altro').replace(/[^a-z0-9]+/gi,'_').slice(0,18)}.jpg`;
          folder.file(name, b);
        }
      }

      const zipBlob = await zip.generateAsync({type:'blob'});
      const zipFile = new File([zipBlob], `Pacchetto_${fromISO}_${toISO}.zip`, {type:'application/zip'});
      await shareOrDownloadFiles([zipFile], 'Pacchetto commercialista');
      return;
    }

    // Files separati
    await shareOrDownloadFiles([csvFile, pdfFile], 'Commercialista');
  }
  // ---------------- BACKUP ----------------
  async function exportBackup(){
    const payload = {
      app:"Spese&ScontriniPRO",
      version:5,
      exportedAt:new Date().toISOString(),
      settings:{
        isPro: settings.isPro,
        pdfCountByMonth: settings.pdfCountByMonth,
        viewMode: settings.viewMode,
        budgetByMonth: settings.budgetByMonth,
        tagsList: settings.tagsList,
        baseCurrency: settings.baseCurrency,
        saveOriginals: settings.saveOriginals,
        fastModeDefault: settings.fastModeDefault,
        autoGeo: settings.autoGeo
      },
      expenses: all
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`backup_spese_scontrini_${monthNow()}.json`;
    document.body.appendChild(a);
    a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Backup esportato ✅");
  }

  async function importBackup(file){
    try{
      const txt=await file.text();
      const payload=JSON.parse(txt);
      if(!payload || !Array.isArray(payload.expenses)){ alert("Backup non valido."); return; }
      if(!confirm("Importare backup? Unisce le spese (non cancella).")) return;

      const existing=new Set(all.map(x=>x.id));
      let added=0;
      for(const x of payload.expenses){
        if(!x || !x.id) continue;
        if(existing.has(x.id)) continue;
        await dbPut({
          id:String(x.id),
          type: String(x.type||"expense"),
          recurringParentId: x.recurringParentId ? String(x.recurringParentId) : undefined,
          recurring: x.recurring ? x.recurring : null,
          amount:Number(x.amount)||0,
          currency: String(x.currency||settings.baseCurrency||"EUR").toUpperCase(),
          date:String(x.date||""),
          month:String(x.month||yyyymm(x.date||todayISO())),
          category:String(x.category||"Altro"),
          note:String(x.note||""),
          tags: Array.isArray(x.tags)? x.tags.map(z=>String(z)).slice(0,20) : [],
          geo: x.geo ? x.geo : null,
          photo: x.photo ? String(x.photo) : null,
          photos: Array.isArray(x.photos)? x.photos.map(u=>String(u)).slice(0,20) : (x.photo ? [String(x.photo)] : []),
          photosOriginal: Array.isArray(x.photosOriginal)? x.photosOriginal.map(u=>String(u)).slice(0,20) : []
        });
        added++;
      }

      if(payload.settings){
        if(typeof payload.settings.viewMode === "string") settings.viewMode = payload.settings.viewMode;
        if(payload.settings.budgetByMonth && typeof payload.settings.budgetByMonth==="object") settings.budgetByMonth = payload.settings.budgetByMonth;
        if(payload.settings.pdfCountByMonth && typeof payload.settings.pdfCountByMonth==="object") settings.pdfCountByMonth = payload.settings.pdfCountByMonth;
        if(Array.isArray(payload.settings.tagsList)) settings.tagsList = payload.settings.tagsList;
        if(typeof payload.settings.baseCurrency === "string") settings.baseCurrency = payload.settings.baseCurrency;
        if(typeof payload.settings.saveOriginals === "boolean") settings.saveOriginals = payload.settings.saveOriginals;
        if(typeof payload.settings.fastModeDefault === "boolean") settings.fastModeDefault = payload.settings.fastModeDefault;
        if(typeof payload.settings.autoGeo === "boolean") settings.autoGeo = payload.settings.autoGeo;
        saveSettings();
      }

      toast(`Import OK (+${added}) ✅`);
      await refresh();
    }catch{
      alert("Errore import: file non valido.");
    }
  }

  // ===================== OCR MODULE =====================
  window.__sspReceipt = (function() {
    let currentFile = null;
    let abortController = null;
    let lastFile = null;
  
    function getLastFile() { return lastFile; }
    function cancelOcr() { if(abortController) abortController.abort(); }
  
    async function handle(file, reason) {
      if (!file) return;
      currentFile = file;
      lastFile = file;
      abortController = new AbortController();
      const signal = abortController.signal;
  
      try {
        const text = await performOcr(file, signal);
        if (signal.aborted) return;
  
        // Update OCR text panel
        const ocrPanel = document.getElementById('ocrPanel');
        const ocrTextarea = document.getElementById('ocrText');
        if (ocrPanel) ocrPanel.style.display = 'block';
        if (ocrTextarea) ocrTextarea.value = text;
  
        // Parse amount and date
        const normalized = normalizeForRegex(text);
        const amount = parseAmountFromOcr(normalized);
        const date = parseDateFromOcr(normalized);
  
        if (amount && !isNaN(amount) && amount > 0) {
          document.getElementById('inAmount').value = amount.toFixed(2).replace('.', ',');
        }
        if (date) {
          document.getElementById('inDate').value = date;
        }
  
        // Trigger auto-save event if reason allows
        if (reason !== 'manual') {
          window.dispatchEvent(new CustomEvent('ssp:ocr-filled'));
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          toast('OCR fallito: ' + err.message);
        }
      } finally {
        abortController = null;
      }
    }
  
    async function performOcr(file, signal) {
      const mode = settings.ocrMode || 'offline';
      const apiKey = settings.ocrSpaceKey || '';
      const endpoint = settings.ocrEndpoint || 'https://api.ocr.space/parse/image';
  
      if (mode === 'offline' || (mode === 'auto')) {
        try {
          return await performTesseractOcr(file, signal);
        } catch (err) {
          if (mode === 'auto' && apiKey) {
            // fallback to online
            return await performOcrSpace(file, apiKey, endpoint, signal);
          } else {
            throw err;
          }
        }
      } else if (mode === 'online') {
        if (!apiKey) throw new Error('API key mancante');
        return await performOcrSpace(file, apiKey, endpoint, signal);
      } else {
        throw new Error('Modalità OCR sconosciuta');
      }
    }
  
    async function performTesseractOcr(file, signal) {
      if (!window.Tesseract) throw new Error('Tesseract non caricato');
      const worker = await Tesseract.createWorker({
        logger: m => console.log(m),
      });
      signal.addEventListener('abort', () => worker.terminate());
      await worker.loadLanguage('ita+eng');
      await worker.initialize('ita+eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      return text;
    }
  
    async function performOcrSpace(file, apiKey, endpoint, signal) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apikey', apiKey);
      formData.append('language', 'ita');
      formData.append('isOverlayRequired', 'false');
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal,
      });
      const data = await response.json();
      if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage || 'OCR.Space error');
      const text = data.ParsedResults.map(p => p.ParsedText).join('\n');
      return text;
    }
  
    function parseAmountFromOcr(text) {
      // Cerca pattern come "TOTAL: 12,50" o "€ 12.50" o "12.50" con parole chiave
      const patterns = [
        /(?:totale|importo|total|amount|€|eur)\s*[:]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
        /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:€|eur|euro)/i,
        /(\d{1,3}(?:[.,]\d{2})?)(?=\s*$)/m
      ];
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m) {
          let num = m[1].replace(/\./g, '').replace(',', '.');
          return parseFloat(num);
        }
      }
      return NaN;
    }
  
    function parseDateFromOcr(text) {
      // Cerca date in formato dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
      const patterns = [
        /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,
        /(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/,
      ];
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m) {
          if (m[1].length === 4) { // yyyy-mm-dd
            return `${m[1]}-${m[2]}-${m[3]}`;
          } else { // dd-mm-yyyy
            return `${m[3]}-${m[2]}-${m[1]}`;
          }
        }
      }
      return '';
    }
  
    return {
      get lastFile() { return lastFile; },
      get file() { return currentFile; },
      set file(f) { currentFile = f; lastFile = f; },
      getLastFile,
      cancelOcr,
      handle,
    };
  })();

  // ===================== FUNZIONE TEST OCR.SPACE =====================
  async function testOcrSpaceKey() {
    const key = settings.ocrSpaceKey || '';
    if (!key) return { ok: false, error: 'Chiave non inserita' };
    const endpoint = settings.ocrEndpoint || 'https://api.ocr.space/parse/image';
    // Use a tiny test image (base64 of a simple text)
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAOwgAADsIBFShKgAAAABh0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC4zjOaXUAAAANpJREFUOE+lk7ENgzAQRZ2iYAKKjEAHVMxAwzJ0bMAU0LECY7ABW1Ckg4SUiI+7yM6TLSFZ8vf7fufYwTjn3gC2JEmuYRiuxhhjAQCQZdlNCOE7TdMniqIHEKkFANR1beM4/pzHca5pmj4AIIoiG4bhMwzDxzRNH0VRnFLqBWBZFrMsy+fneZ5TSt0YY+2yLMYYY+y2bXae58YYY9d1tXEc2+fzadtg2za7bZudc86u62pzzsYYY23btmY2Y4y1bdtZzszmnL0xxlrrnDXGWOucnZndGGOtdfZf8A1Ny5A6f/Zv1gAAAABJRU5ErkJggg=='; // small receipt icon
    const blob = await (await fetch(testImage)).blob();
    const formData = new FormData();
    formData.append('file', blob, 'test.png');
    formData.append('apikey', key);
    formData.append('language', 'ita');
    try {
      const response = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.IsErroredOnProcessing) {
        return { ok: false, error: data.ErrorMessage || 'Errore' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ---------------- EVENTS ----------------
  function wire(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        haptic(6);
        showPage(b.getAttribute("data-nav"));
      });
    });

    $("#goArchive").addEventListener("click", ()=>showPage("archive"));
    $("#goReport").addEventListener("click", ()=>showPage("report"));

    $("#viewList").addEventListener("click", ()=>{
      settings.viewMode="list"; saveSettings(); renderArchive();
    });
    $("#viewTimeline").addEventListener("click", ()=>{
      settings.viewMode="timeline"; saveSettings(); renderArchive();
    });

    $("#fMonth").addEventListener("change", renderArchive);
    $("#fCategory").addEventListener("change", renderArchive);
    $("#fSearch").addEventListener("input", ()=>{
      clearTimeout(window.__ft);
      window.__ft=setTimeout(renderArchive, 120);
    });

    ["#fFrom","#fTo","#fMin","#fMax","#fHasPhoto","#fTag"].forEach(sel=>{
      const el = document.querySelector(sel);
      if(!el) return;
      const ev = (sel==="#fHasPhoto" || sel==="#fFrom" || sel==="#fTo") ? "change" : "input";
      el.addEventListener(ev, ()=>{
        clearTimeout(window.__ft2);
        window.__ft2=setTimeout(renderArchive, 120);
      });
    });
    $("#btnClearFilters").addEventListener("click", ()=>{
      $("#fMonth").value = monthNow();
      $("#fCategory").value = "";
      $("#fSearch").value = "";
      const ids=["#fFrom","#fTo","#fMin","#fMax","#fHasPhoto","#fTag"];
      ids.forEach(s=>{ const el=document.querySelector(s); if(el){ if(el.tagName==="SELECT") el.value=""; else el.value=""; }});
      toast("Filtri puliti");
      renderArchive();
    });

    $("#fabAdd").addEventListener("click", ()=>{ openAdd(); });

    $("#fabCam").addEventListener("click", ()=>{
      openAdd();
      // open camera chooser inside Add modal
      setTimeout(()=>{ try { $("#btnReceiptCamera").click(); } catch(e){} }, 120);
    });

$("#addClose").addEventListener("click", closeAdd);
    $("#modalAdd").addEventListener("click", (e)=>{ if(e.target===$("#modalAdd")) closeAdd(); });

    on("#btnGeo","click", ()=>{ try{ captureGeo(); }catch(e){ console.error(e); } });
    on("#inFastMode","change", applyFastModeUI);

    $("#inPhoto").addEventListener("change", async (e)=>{
      try{
        const files = e.target.files;
        // append multi-selection in one shot
        await handleSelectedImages(files);
      }catch(err){
        console.error(err);
        toast("Errore caricamento foto");
      }
    });

    // Camera input (capture) + dedicated button
    const inPhotoCam = $("#inPhotoCam");
    const btnReceiptCamera = $("#btnReceiptCamera");
    if(btnReceiptCamera && inPhotoCam){
      btnReceiptCamera.addEventListener("click", ()=> { inPhotoCam.value=""; inPhotoCam.click(); });
      inPhotoCam.addEventListener("change", async (e)=>{
        try{
          const files = e.target.files;
          await handleSelectedImages(files);
        }catch(err){
          console.error(err);
          toast("Errore caricamento foto");
        }
      });
    }

    // Gallery button (uses the normal file input)
    const btnReceiptGallery = $("#btnReceiptGallery");
    if(btnReceiptGallery && $("#inPhoto")){
      btnReceiptGallery.addEventListener("click", ()=> { const inp=$("#inPhoto"); if(inp) inp.value=""; inp.click(); });
    }


    // PDF import button (renders 1st page → PNG → OCR)
    const btnReceiptPdf = $("#btnReceiptPdf");
    const inPdf = $("#inPdf");
    if(btnReceiptPdf && inPdf){
      btnReceiptPdf.addEventListener("click", ()=> { try{ inPdf.value=""; }catch(e){} inPdf.click(); });
      inPdf.addEventListener("change", async (e)=>{
        const file = e.target.files && e.target.files[0];
        previewPhoto=null;
        if(!file){
          toast("Nessun PDF selezionato");
          return;
        }
        try{
          toast("Importo PDF…");
          const pngFile = await pdfFirstPageToPngFile(file);
          scanImg = await fileToImage(pngFile);
          const quick = await imageToDataUrl(scanImg, 0, null, 1.0, 0);
          setPhotoPreview(quick);
          selectedPhotos = [quick];
          selectedOriginals = settings.saveOriginals ? [quick] : [];
          renderAttachmentsPreview();
          previewPhoto = quick;
          if(window.__sspReceipt){
            window.__sspReceipt.file = pngFile;
            window.__sspReceipt.getLastFile = () => pngFile;
          }
          toast("PDF importato ✅ (1ª pagina)");

          // OCR: una sola volta, dopo import
          try{ await window.__sspReceipt?.handle?.(pngFile, "pdf"); }catch(_){}
        }catch(err){
          console.error(err);
          toast("PDF non valido / non leggibile");
        }
      });
    }


    // Remove photo (support both legacy id and current button id)
    const btnRemove = $("#removePhoto") || $("#btnRemovePhoto");
    if(btnRemove) btnRemove.addEventListener("click", ()=>{
      $("#inPhoto").value="";
      if($("#inPhotoCam")) $("#inPhotoCam").value="";
      previewPhoto=null;
      selectedPhotos=[];
      selectedOriginals=[];
      selectedGeo=null;
      scanImg=null;
      setPhotoPreview(null);
      renderAttachmentsPreview();
      try{ window.__sspReceipt?.cancelOcr && window.__sspReceipt.cancelOcr(); }catch{}
      try{ const p=document.getElementById("ocrPanel"); if(p) p.style.display="none"; }catch{}
      try{ const t=document.getElementById("ocrText"); if(t) t.value=""; }catch{}
      try{ const s=document.getElementById("ocrStatus"); if(s) s.textContent=""; }catch{}
      if(window.__sspReceipt){
        window.__sspReceipt.file = null;
        window.__sspReceipt.getLastFile = () => null;
      }
      toast("Foto rimossa");
    });

    $("#btnOpenScanner").addEventListener("click", async ()=>{
      const file = (window.__sspReceipt?.getLastFile && window.__sspReceipt.getLastFile()) || ($("#inPhoto").files && $("#inPhoto").files[0]) || ($("#inPhotoCam").files && $("#inPhotoCam").files[0]);
      if(!file){ toast("Prima seleziona una foto"); return; }
      try{ await window.__sspReceipt.handle(file, "manual"); }catch(e){ /* handled inside */ }
    });

    // optional: miglioramento foto (scanner) separato
    const btnEnh = $("#btnEnhancePhoto");
    if(btnEnh) btnEnh.addEventListener("click", openScanner);


    $("#scannerClose").addEventListener("click", closeScanner);
    $("#modalScanner").addEventListener("click",(e)=>{ if(e.target===$("#modalScanner")) closeScanner(); });

    $("#rotL").addEventListener("click", async ()=>{ scanRotate=(scanRotate-90)%360; await drawScannerPreview(); });
    $("#rotR").addEventListener("click", async ()=>{ scanRotate=(scanRotate+90)%360; await drawScannerPreview(); });

    const scanInputs = ["scanContrast","scanBright","cropL","cropR","cropT","cropB"];
    scanInputs.forEach(id=>{
      $("#"+id).addEventListener("input", async ()=>{
        scanContrast = parseFloat($("#scanContrast").value);
        scanBright = parseFloat($("#scanBright").value);
        cropMargins.l = parseFloat($("#cropL").value);
        cropMargins.r = parseFloat($("#cropR").value);
        cropMargins.t = parseFloat($("#cropT").value);
        cropMargins.b = parseFloat($("#cropB").value);
        await drawScannerPreview();
      });
    });

    $("#resetScan").addEventListener("click", async ()=>{ resetScanner(); await drawScannerPreview(); });
    on("#autoCrop","click", async ()=>{ try{ await autoCropScanner(); await drawScannerPreview(); toast("Auto ritaglio ✅"); }catch(e){ console.error(e); toast("Auto ritaglio non riuscito"); } });
    $("#applyScan").addEventListener("click", applyScanner);

    $("#btnSave").addEventListener("click", onSave);

    // Auto-salva dopo OCR (antibug): se attivo nelle Impostazioni, quando OCR compila importo+data
    // clicchiamo "Salva" in modo sicuro (solo se il modal è aperto e non siamo in modifica).
    let __autoSaveLock = 0;
    window.addEventListener('ssp:ocr-filled', ()=>{
      try{
        if(!settings || !settings.ocrAutoSave) return;
        const modal = $("#modalAdd");
        if(!modal || !modal.classList || !modal.classList.contains('show')) return;
        if(editId) return; // non auto-salvare in modifica
        const now = Date.now();
        if(now - __autoSaveLock < 2500) return; // anti-doppio-salvataggio

        const amt = parseEuro($("#inAmount")?.value);
        const dt = String($("#inDate")?.value || "").trim();
        if(!Number.isFinite(amt) || amt <= 0) return;
        if(!dt) return;

        __autoSaveLock = now;
        const b = $("#btnSave");
        if(b) b.click();
      }catch(_){ /* never block */ }
    }, {passive:true});
    $("#btnClear").addEventListener("click", ()=>{
      $("#inAmount").value="";
      $("#inNote").value="";
      $("#inPhoto").value="";
      previewPhoto=null;
      scanImg=null;
      setPhotoPreview(null);
      toast("Pulito");
    });

    $("#mClose").addEventListener("click", closeDetails);
    $("#modalDetails").addEventListener("click",(e)=>{ if(e.target===$("#modalDetails")) closeDetails(); });
    $("#mEdit").addEventListener("click", openEdit);
    $("#mDuplicate").addEventListener("click", duplicateCurrent);
    $("#mDelete").addEventListener("click", deleteCurrent);

    $("#btnBudget").addEventListener("click", openBudgetModal);
    $("#budgetClose").addEventListener("click", closeBudgetModal);
    $("#modalBudget").addEventListener("click",(e)=>{ if(e.target===$("#modalBudget")) closeBudgetModal(); });

    $("#budgetSave").addEventListener("click", ()=>{
      const m = $("#fMonth").value || monthNow();
      const v = parseEuro($("#budgetInput").value);
      if(!Number.isFinite(v) || v<=0){ toast("Budget non valido"); return; }
      setBudgetCents(m, Math.round(v*100));
      closeBudgetModal();
      toast("Budget salvato ✅");
      calcStats();
      renderArchive();
    });
    $("#budgetClear").addEventListener("click", ()=>{
      const m = $("#fMonth").value || monthNow();
      setBudgetCents(m, null);
      $("#budgetInput").value="";
      closeBudgetModal();
      toast("Budget rimosso");
      calcStats();
      renderArchive();
    });

    $("#btnProToggle").addEventListener("click", ()=>{
      const ok = confirm(settings.isPro ? "Disattivare PRO (test)?" : "Attivare PRO (test) su questo dispositivo?");
      if(!ok) return;
      settings.isPro = !settings.isPro;
      saveSettings();
      setProUI();
      toast(settings.isPro ? "PRO attivo (test)" : "FREE attivo");
    });

    $("#rMonth").value = monthNow();
    $("#rMonth").addEventListener("change", renderAnalysis);
    $("#anaOnlyCaf").addEventListener("change", renderAnalysis);

    $("#btnMakePdf").addEventListener("click", ()=>{
      const mode = $("#rMode").value || "month";
      const m = $("#rMonth").value || monthNow();
      generatePdf(mode, m);
    });

    // --- Invia al commercialista (pacchetto) ---
    on("#btnSendAccountant", "click", ()=>{
      try{
        const ym = $("#rMonth")?.value || monthNow();
        const from = firstDayOfMonth(ym) || todayISO();
        const to = lastDayOfMonth(ym) || todayISO();
        const f = $("#accFrom");
        const t = $("#accTo");
        if(f) f.value = from;
        if(t) t.value = to;
      }catch(_){ }
      showModal("#modalAccountant");
    });
    on("#accClose", "click", ()=> hideAllModals());
    on("#modalAccountant", "click", (e)=>{ if(e.target === $("#modalAccountant")) hideAllModals(); });
    on("#accPresetThis", "click", ()=>{
      const ym = monthNow();
      const f = $("#accFrom");
      const t = $("#accTo");
      if(f) f.value = firstDayOfMonth(ym) || todayISO();
      if(t) t.value = lastDayOfMonth(ym) || todayISO();
    });
    on("#accPresetPrev", "click", ()=>{
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const ym = `${prev.getFullYear()}-${pad2(prev.getMonth()+1)}`;
      const f = $("#accFrom");
      const t = $("#accTo");
      if(f) f.value = firstDayOfMonth(ym) || todayISO();
      if(t) t.value = lastDayOfMonth(ym) || todayISO();
    });
    on("#accSend", "click", async ()=>{
      const from = $("#accFrom")?.value;
      const to = $("#accTo")?.value;
      // 730 automatico: invia solo CSV+PDF detraibili, senza foto scontrini
      await sendToAccountant({from, to, mode:'caf', pack:'zip', includePhotos:false});
    });

    $("#btnBackup").addEventListener("click", exportBackup);
    on("#btnExportQif","click", exportQif);
    on("#btnExportOfx","click", exportOfx);

    on("#btnShareReport","click", shareCurrentReport);
    on("#btnExportChart","click", exportChartImage);
    on("#btnCalcTax","click", calcTax);
    on("#btnCalcTaxClear","click", ()=>{ ["#taxRevenue","#taxCoeff","#taxRate","#taxInps"].forEach(s=>{ const el=document.querySelector(s); if(el) el.value=""; }); const o=document.querySelector("#taxOut"); if(o) o.textContent=""; });
    $("#inRestore").addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importBackup(f);
      e.target.value="";
    });

    $("#btnWipeAll").addEventListener("click", wipeAll);

    // Nuovi listener per fotocamera automatica
    on("#btnReceiptCameraAuto", "click", openAutoCamera);
    on("[data-cam-auto-close]", "click", () => {
      if (autoCamStream) {
        autoCamStream.getTracks().forEach(t => t.stop());
        autoCamStream = null;
      }
      hideModal('#camAutoModal');
    });
    on("#camAutoShotManual", "click", () => {
      // Scatta manualmente
      captureAutoFrame();
    });
    on("#camAutoSwitch", "click", () => {
      // Cambia camera (semplice toggle tra front/back - implementazione base)
      if (autoCamStream) {
        const track = autoCamStream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities();
          if (capabilities.facingMode) {
            const newMode = track.getSettings().facingMode === 'environment' ? 'user' : 'environment';
            track.applyConstraints({ facingMode: newMode }).catch(console.warn);
          }
        }
      }
    });
  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js?v=37.2").catch(()=>{}));
  }

  (async function start(){
    fillCategories();
    $("#inDate").value = todayISO();
    $("#fMonth").value = monthNow();
    setProUI();

    await openDB();
    await refresh();
    wire();
    showPage("home");
    
    // Onboarding guidato (prima volta)
    if (!localStorage.getItem('onboarding_done')) {
      setTimeout(() => {
        if (typeof window.driver !== 'undefined') {
          const driver = window.driver.js.driver;
          const driverObj = driver({
            showProgress: true,
            steps: [
              { 
                element: '#fabAdd', 
                popover: { 
                  title: '➕ Nuova spesa', 
                  description: 'Tocca qui per inserire una spesa manualmente (importo, categoria, note).', 
                  side: 'top' 
                } 
              },
              { 
                element: '#fabCam', 
                popover: { 
                  title: '📷 Fotografa scontrino', 
                  description: 'Inquadra lo scontrino e l’app leggerà automaticamente importo e data.', 
                  side: 'top' 
                } 
              },
              { 
                element: '.bottomNav .navBtn[data-nav="archive"]', 
                popover: { 
                  title: '📂 Archivio', 
                  description: 'Qui trovi tutte le tue spese, con filtri e vista timeline.', 
                  side: 'top' 
                } 
              },
              { 
                element: '.bottomNav .navBtn[data-nav="report"]', 
                popover: { 
                  title: '📄 Report', 
                  description: 'Genera PDF, analisi categorie, esporta backup e molto altro.', 
                  side: 'top' 
                } 
              }
            ]
          });
          driverObj.drive();
          localStorage.setItem('onboarding_done', 'true');
        } else {
          console.warn('Driver.js not loaded');
        }
      }, 1500);
    }
  })();

})();
