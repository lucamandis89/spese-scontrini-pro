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
    dbVersion: 1,
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

  const CATEGORIES = [
    "Alimentari","Benzina","Casa","Bollette","Farmacia / Mediche","Bambini",
    "Animali","Lavoro","Ristorante / Bar","Viaggi","Scuola","Assicurazioni","Altro"
  ];

  const CAF_CATEGORIES = new Set([
    "Farmacia / Mediche", "Scuola", "Bambini", "Assicurazioni", "Casa", "Bollette"
  ]);

  // =====================
  // BUILD / UPDATE (SAFE per TWA/PlayStore)
  // =====================
  const BUILD_ID = "v37.8_20260216120000";

  (async () => {
    try {
      const prev = localStorage.getItem("__ssp_build_id") || "";
      if (prev !== BUILD_ID) {
        localStorage.setItem("__ssp_build_id", BUILD_ID);

        // NIENTE wipe totale: chiedi solo l’update del Service Worker e ricarica UNA volta
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          try { await reg?.update(); } catch(_) {}

          // Se c'è una versione in waiting, falla attivare
          if (reg?.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }

        // Anti-loop reload (evita reload multipli in race condition)
        const last = sessionStorage.getItem("__ssp_last_reload");
        const now = Date.now();
        if (!last || (now - parseInt(last, 10)) > 8000) {
          sessionStorage.setItem("__ssp_last_reload", String(now));
          location.reload();
        }
      }
    } catch (e) {
      console.warn("build update skipped", e);
    }
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

  function euro(n){
    const v = Number(n||0);
    if(isNaN(v)) return "€ 0,00";
    return "€ " + v.toFixed(2).replace(".", ",");
  }

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
  // Nuova opzione auto-save
  settings.autoSaveAfterPhoto = settings.autoSaveAfterPhoto || false;
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
          if(!_db.objectStoreNames.contains(APP.store)){
            const st=_db.createObjectStore(APP.store,{keyPath:"id"});
            st.createIndex("by_date","date",{unique:false});
            st.createIndex("by_month","month",{unique:false});
            st.createIndex("by_category","category",{unique:false});
          }
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
  function dbGet(id){
    return new Promise((resolve,reject)=>{
      const req=txStore("readonly").get(id);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
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

  // Soft-delete (Cestino)
  const TRASH_DAYS = 30;
  function isTrashed(x){ return !!(x && (x.deletedAt || x.deleted)); }
  function activeList(list){ return (list||[]).filter(x=>!isTrashed(x)); }
  function trashList(list){ return (list||[]).filter(x=>isTrashed(x)); }

  async function purgeOldTrash(){
    try{
      const cutoff = Date.now() - TRASH_DAYS*24*60*60*1000;
      const items = await dbGetAll();
      const old = items.filter(x=>x && x.deletedAt && Number(x.deletedAt) < cutoff);
      for(const x of old){ try{ await dbDelete(x.id); }catch(e){} }
    }catch(e){}
  }

  async function moveToTrash(id){
    const it = await dbGet(id);
    if(!it) return false;
    it.deletedAt = Date.now();
    it.deleted = true;
    await dbPut(it);
    return true;
  }

  async function restoreFromTrash(id){
    const it = await dbGet(id);
    if(!it) return false;
    delete it.deletedAt;
    delete it.deleted;
    await dbPut(it);
    return true;
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
  let editId=null;
  let modalCurrentId=null;

  // scanner state
  let scanImg=null;
  let scanRotate=0;
  let scanContrast=1.15;
  let scanBright=8;
  let cropMargins={l:2,r:2,t:2,b:2};
  let previewPhoto=null;

  function fillCategories(){
    $("#inCategory").innerHTML = CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("#fCategory").innerHTML = `<option value="">Tutte</option>` + CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function applyFilters(){
    const m = $("#fMonth").value || "";
    const c = $("#fCategory").value || "";
    const q = ($("#fSearch").value || "").trim().toLowerCase();

    // Extra "smart" filters (safe & optional)
    const only730 = !!$("#fDetraibili")?.checked;
    const from = ($("#fFrom")?.value || "").trim();
    const to   = ($("#fTo")?.value || "").trim();
    const minV = Number(($("#fMin")?.value || "").replace(",", ".")); // tolerate comma
    const maxV = Number(($("#fMax")?.value || "").replace(",", "."));

    let list = activeList(all).slice();
    if(m) list = list.filter(x=>x.month===m);
    if(c) list = list.filter(x=>x.category===c);
    if(only730) list = list.filter(x=>isCaf(x.category));
    if(from) list = list.filter(x=>(x.date||"") >= from);
    if(to)   list = list.filter(x=>(x.date||"") <= to);
    if(Number.isFinite(minV) && ($("#fMin")?.value||"").trim()!=="") list = list.filter(x=>(+x.amount||0) >= minV);
    if(Number.isFinite(maxV) && ($("#fMax")?.value||"").trim()!=="") list = list.filter(x=>(+x.amount||0) <= maxV);

    if(q) list = list.filter(x =>
      (x.note||"").toLowerCase().includes(q) ||
      (x.category||"").toLowerCase().includes(q)
    );

    const sortKey = ($("#fSort")?.value || localStorage.getItem("ssp_sort_key") || "new");
    try{ localStorage.setItem("ssp_sort_key", sortKey); }catch(e){}

    // Advanced sorting (safe)
    switch(sortKey){
      case "old":
        list.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
        break;
      case "amt_desc":
        list.sort((a,b)=>(+b.amount||0)-(+a.amount||0) || (b.date||"").localeCompare(a.date||""));
        break;
      case "amt_asc":
        list.sort((a,b)=>(+a.amount||0)-(+b.amount||0) || (b.date||"").localeCompare(a.date||""));
        break;
      case "det_first":
        list.sort((a,b)=>(isCaf(b.category)?1:0)-(isCaf(a.category)?1:0) || (b.date||"").localeCompare(a.date||""));
        break;
      case "cat_az":
        list.sort((a,b)=>(a.category||"").localeCompare(b.category||"") || (b.date||"").localeCompare(a.date||""));
        break;
      case "new":
      default:
        list.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
        break;
    }

    return list;
  }

  function cafBadgeHtml(cat){
    return isCaf(cat) ? `<span class="badge">⭐ Detraibile (730)</span>` : "";
  }

  function calcStats(){
    const mNow=monthNow();
    const yNow=String(new Date().getFullYear());
    const monthTotal = all.filter(x=>!isTrashed(x) && x.month===mNow).reduce((s,x)=>s+(+x.amount||0),0);
    const yearTotal  = all.filter(x=>!isTrashed(x) && (x.date||"").startsWith(yNow+"-")).reduce((s,x)=>s+(+x.amount||0),0);
    $("#statMonth").textContent = euro(monthTotal);
    $("#statYear").textContent = euro(yearTotal);
    renderBudgetHome(monthTotal, mNow);
  }

  function renderRecent(){
    const el=$("#recentList");
    const list=activeList(all).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,6);
    if(list.length===0){
      el.innerHTML = `<div class="hint">Ancora nessuna spesa. Premi “＋” per aggiungerne una.</div>`;
      return;
    }
    el.innerHTML = list.map(x=>`
      <div class="item" data-open="${escapeHtml(x.id)}">
        <div class="thumb">${x.photo?`<img src="${x.photo}" alt="scontrino">`:"—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
          <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
        </div>
        <div class="amt">${euro(x.amount)}</div>
      </div>
    `).join("");
    el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
  }

  function renderList(){
    const el=$("#list");
    const list=applyFilters();
    const total=list.reduce((s,x)=>s+(+x.amount||0),0);
    $("#countLabel").textContent = `${list.length} spese (totale in app: ${all.length})`;
    $("#sumLabel").textContent = `Totale filtro: ${euro(total)}`;

    if(list.length===0){
      el.innerHTML = `<div class="hint">Nessuna spesa con questi filtri. Premi “＋” per aggiungere.</div>`;
      return;
    }
    el.innerHTML = list.map(x=>`
      <div class="item" data-open="${escapeHtml(x.id)}">
        <div class="thumb">${x.photo?`<img src="${x.photo}" alt="scontrino">`:"—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
          <div class="sub">${escapeHtml(x.date)} • ${escapeHtml(x.category)}</div>
        </div>
        <div class="amt">${euro(x.amount)}</div>
      </div>
    `).join("");
    el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
  }

  function renderTimeline(){
    const el=$("#timeline");
    const list=applyFilters();
    if(list.length===0){
      el.innerHTML = `<div class="hint">Nessuna spesa con questi filtri. Premi “＋” per aggiungere.</div>`;
      return;
    }

    const map=new Map();
    for(const x of list){
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
          <div class="thumb" style="width:60px;height:60px">${x.photo?`<img src="${x.photo}" alt="scontrino">`:"—"}</div>
          <div class="meta">
            <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category)}</div>
            <div class="sub">${escapeHtml(x.category)}</div>
          </div>
          <div class="amt">${euro(x.amount)}</div>
        </div>
      `).join("");

      return `
        <div class="dayGroup">
          <div class="dayHead">
            <div class="d">${escapeHtml(date)}</div>
            <div class="t">${euro(tot)}</div>
          </div>
          <div class="dayBody">${rows}</div>
        </div>
      `;
    }).join("");

    el.querySelectorAll("[data-open]").forEach(r=>r.addEventListener("click",()=>openDetails(r.getAttribute("data-open"))));
  }

  function renderArchive(){
    const listMode = settings.viewMode === "list";
    $("#list").style.display = listMode ? "flex" : "none";
    $("#timeline").style.display = listMode ? "none" : "flex";
    $("#viewList").classList.toggle("active", listMode);

    // init sort selector (safe)
    const sk = localStorage.getItem("ssp_sort_key") || "new";
    if($("#fSort") && !$("#fSort").value) $("#fSort").value = sk;
    if($("#fSort")) $("#fSort").value = $("#fSort").value || sk;
    $("#viewTimeline").classList.toggle("active", !listMode);
    if(listMode) renderList(); else renderTimeline();
  }

  async function refresh(){
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
    renderDashboard();
    try{ window.dispatchEvent(new CustomEvent('ssp_refresh_done')); }catch(e){}
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
  const $ocrKeyTestStatus = $("#ocrKeyStatus");
  const $autoSaveAfterPhotoToggle = $("#autoSaveAfterPhotoToggle");

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
    if($autoSaveAfterPhotoToggle) $autoSaveAfterPhotoToggle.checked = !!settings.autoSaveAfterPhoto;
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
      if($autoSaveAfterPhotoToggle) settings.autoSaveAfterPhoto = $autoSaveAfterPhotoToggle.checked;
      saveSettings();
      applyLang();
      toast(settings.lang==="en" ? "Settings saved" : "Impostazioni salvate");
    });
  }

  
  // Test OCR.Space API key (non invia foto reali: usa un'immagine di test generata)
  if($btnTestOcrKey){
    $btnTestOcrKey.addEventListener("click", async ()=>{
      try{
        if($ocrKeyTestStatus) $ocrKeyTestStatus.textContent = "Verifica in corso...";
        const r = await testOcrSpaceKey();
        if(r && r.ok){
          if($ocrKeyTestStatus) $ocrKeyTestStatus.textContent = "OK ✅";
          toast("API key OCR.Space valida ✅");
        }else{
          const msg = (r && r.error) ? r.error : "Non valida";
          if($ocrKeyTestStatus) $ocrKeyTestStatus.textContent = "Errore";
          toast("API key non valida: " + msg);
        }
      }catch(e){
        if($ocrKeyTestStatus) $ocrKeyTestStatus.textContent = "Errore";
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

// ---------------- MODALS ----------------
  

function openAdd(){
    editId=null;
    previewPhoto=null;
    scanImg=null;
    $("#addTitle").textContent="➕ Aggiungi spesa";
    $("#inAmount").value="";
    $("#inDate").value=todayISO();
    $("#inCategory").value="Alimentari";
    $("#inNote").value="";
    // Pulisci input unificato
    const unified = $("#inPhotoUnified");
    if(unified) unified.value = "";
    setPhotoPreview(null);
    showModal("#modalAdd");
    haptic(8);
  }
  function closeAdd(){ hideModal("#modalAdd"); }

  function setPhotoPreview(dataUrl){
    const wrap=$("#photoPreview");
    const im=$("#photoPreviewImg");
    if(!dataUrl){
      wrap.style.display="none";
      im.src="";
      return;
    }
    im.src=dataUrl;
    wrap.style.display="block";
  }

  function openDetails(id){
    const x=all.find(e=>e.id===id);
    if(!x) return;
    modalCurrentId=id;
    $("#mTitle").textContent = `${x.note||"Spesa"} • ${euro(x.amount)}`;
    $("#mMeta").textContent = `${x.date} • ${x.category}${isCaf(x.category) ? " • Detraibile (730)" : ""} • ${x.month}`;
    const img=$("#mImg");
    if(x.photo){
      img.src=x.photo;
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
    const unified = $("#inPhotoUnified");
    if(unified) unified.value = "";
    setPhotoPreview(x.photo || null);

    closeDetails();
    showModal("#modalAdd");
  }

  async function deleteCurrent(){
    if(!modalCurrentId) return;
    if(!confirm("Eliminare questa spesa?")) return;
    await moveToTrash(modalCurrentId);
    scheduleAutoBackup();
    closeDetails();
    toast("Eliminata ✅");
    await refresh();
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
    sub.textContent = `Mese ${month} • Budget: ${euro(budget)}`;
    left.textContent = remaining >= 0 ? `Restano: ${euro(remaining)}` : `Sforato: ${euro(Math.abs(remaining))}`;
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
          <div class="muted" style="text-align:right">${euro(r.total)}</div>
        </div>
      `;
    }).join("");

    list.innerHTML = rows.map(r=>{
      const pct = grand > 0 ? Math.round((r.total/grand)*100) : 0;
      return `
        <div class="anaLine">
          <div><b>${escapeHtml(r.cat)}</b> <span class="muted">${pct}%</span></div>
          <div class="muted">${euro(r.total)}</div>
        </div>
      `;
    }).join("");
  }

  // ---------------- DASHBOARD (mensile) ----------------
  function groupByNoteForMonth(month){
    const map = new Map();
    for(const x of all){
      const xm = x.month || yyyymm(x.date);
      if(xm !== month) continue;
      const k = (x.note || "Senza descrizione").trim() || "Senza descrizione";
      map.set(k, (map.get(k) || 0) + (Number(x.amount) || 0));
    }
    return map;
  }

  function totalsForMonth(month){
    let total=0, caf=0, non=0, n=0;
    for(const x of all){
      const xm = x.month || yyyymm(x.date);
      if(xm !== month) continue;
      const a = Number(x.amount) || 0;
      total += a; n++;
      if(isCaf(x.category)) caf += a; else non += a;
    }
    return {total, caf, non, n};
  }

  function renderDashboard(){
    const elTotal = $("#dashTotal");
    const elCaf = $("#dashCaf");
    const elNon = $("#dashNonCaf");
    const elPct = $("#dashPct");
    const elBars = $("#dashCatBars");
    const elTop = $("#dashTopNotes");
    const elSub = $("#dashSubtitle");
    if(!elTotal || !elCaf || !elNon || !elPct || !elBars || !elTop) return;

    const month = $("#rMonth")?.value || monthNow();
    const t = totalsForMonth(month);

    elTotal.textContent = euro(t.total);
    elCaf.textContent = euro(t.caf);
    elNon.textContent = euro(t.non);
    elPct.textContent = t.total > 0 ? `${Math.round((t.caf / t.total) * 100)}%` : "0%";
    if(elSub) elSub.textContent = t.n ? `${t.n} spese nel mese` : "Nessuna spesa nel mese";

    // Top categorie (max 6)
    const mapCat = groupByCategoryForMonth(month, false);
    const cats = Array.from(mapCat.entries()).map(([cat,total])=>({cat,total}));
    cats.sort((a,b)=>b.total-a.total);

    if(cats.length === 0){
      elBars.innerHTML = `<div class="hint">Nessuna spesa per questo mese.</div>`;
    } else {
      const max = cats[0].total || 1;
      elBars.innerHTML = cats.slice(0,6).map(r=>{
        const w = Math.round((r.total / max) * 100);
        return `
          <div class="barRow">
            <div class="muted"><b>${escapeHtml(r.cat)}</b></div>
            <div class="barTrack"><div class="barFill" style="width:${w}%"></div></div>
            <div class="muted" style="text-align:right">${euro(r.total)}</div>
          </div>
        `;
      }).join("");
    }

    // Top descrizioni (max 5)
    const mapNote = groupByNoteForMonth(month);
    const notes = Array.from(mapNote.entries()).map(([note,total])=>({note,total}));
    notes.sort((a,b)=>b.total-a.total);

    if(notes.length === 0){
      elTop.innerHTML = "";
    } else {
      const grand = notes.reduce((s,r)=>s+r.total,0);
      elTop.innerHTML = notes.slice(0,5).map(r=>{
        const pct = grand>0 ? Math.round((r.total/grand)*100) : 0;
        return `
          <div class="anaLine">
            <div><b>${escapeHtml(r.note)}</b> <span class="muted">${pct}%</span></div>
            <div class="muted">${euro(r.total)}</div>
          </div>
        `;
      }).join("");
    }
  }


  // ---------------- SCANNER ----------------
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
    setPhotoPreview(previewPhoto);
    toast("Scanner applicato ✅");
    closeScanner();
  }

  // ---------------- AUTO-SAVE AFTER PHOTO ----------------
  let autoSaveTimer = null;
  function scheduleAutoSaveAfterPhoto() {
    if (!settings.autoSaveAfterPhoto) return;
    const modal = document.getElementById('modalAdd');
    if (!modal || !modal.classList.contains('show') || editId) return; // solo in aggiunta, non modifica

    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      if (!modal.classList.contains('show')) return;
      // Verifica che ci sia almeno una foto
      const hasPhoto = previewPhoto || (window.__sspReceipt && window.__sspReceipt.file);
      if (!hasPhoto) return;
      const btn = document.getElementById('btnSave');
      if (btn) btn.click();
    }, 2000); // attende 2 secondi per dare tempo all'OCR
  }

  // ---------------- SAVE / RESET ----------------
  async function onSave(){
    let amountVal = parseEuro($("#inAmount").value);
    let dateVal = $("#inDate").value;
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();
    const unified = $("#inPhotoUnified");
    // Usa l'ultimo file selezionato (già gestito da __sspReceipt)
    const file = window.__sspReceipt?.file || (unified?.files && unified.files[0]);

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

    let photo = base ? (base.photo || null) : null;

    if(previewPhoto){
      photo = previewPhoto;
    } else if(file){
      const img = await fileToImage(file);
      photo = await imageToDataUrl(img, 0, null, 1.0, 0);
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
    scheduleAutoBackup();

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
    scheduleAutoBackup();
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
    doc.text(`Totale: ${euro(total)}`, margin, y); y+=18;

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
      doc.text(euro(x.amount), pageW-margin, y, {align:"right"});
      y+=14;
    }

    doc.addPage(); y=margin;
    doc.setFont("helvetica","bold"); doc.setFontSize(12);
    doc.text("Foto scontrini", margin, y); y+=14;
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text("Foto ottimizzate (scanner/compresse) per stabilità in APK.", margin, y); y+=14;

    const pics = list.filter(x=>!!x.photo);
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
        doc.text(`${x.date} • ${x.category} • ${euro(x.amount)}`, xPos, yPos);

        try{ doc.addImage(x.photo, "JPEG", xPos, yPos+14, colW, imgH, undefined, "FAST"); }
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
    doc.text(`Voci: ${list.length} • Totale: ${euro(total)}`, margin, y); y+=18;

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

    let list = all.filter(x => !isTrashed(x) && inRangeISO(x.date, fromISO, toISO));
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

  
  // ---------------- AUTO-BACKUP (LOCALE, LEGGERO) ----------------
  const AUTO_BK_KEY = "__ssp_autobackup_light_v1";
  const AUTO_BK_PREV_KEY = "__ssp_autobackup_light_prev_v1";
  let __autoBkTimer = null;

  function buildLightBackupPayload(){
    // Important: exclude photos to avoid exceeding localStorage limits
    const lightExpenses = (all||[]).map(x=>({
      id:x.id,
      amount:x.amount,
      date:x.date,
      month:x.month,
      category:x.category,
      note:x.note,
      hasPhoto: !!x.photo
    }));
    return {
      app:"Spese&ScontriniPRO",
      kind:"light",
      version:1,
      exportedAt:new Date().toISOString(),
      settings:{
        isPro: !!settings.isPro,
        viewMode: settings.viewMode || "list",
        budgetByMonth: settings.budgetByMonth || {},
        autoSaveAfterPhoto: !!settings.autoSaveAfterPhoto
      },
      expenses: lightExpenses
    };
  }

  function writeAutoBackupNow(){
    try{
      const payload = buildLightBackupPayload();
      const raw = JSON.stringify(payload);
      const prev = localStorage.getItem(AUTO_BK_KEY);
      if(prev && prev !== raw){
        localStorage.setItem(AUTO_BK_PREV_KEY, prev);
      }
      localStorage.setItem(AUTO_BK_KEY, raw);
      updateAutoBackupInfo();
    }catch(e){
      console.warn("Auto-backup fallito:", e);
    }
  }

  function scheduleAutoBackup(){
    clearTimeout(__autoBkTimer);
    __autoBkTimer = setTimeout(writeAutoBackupNow, 900);
  }

  function readAutoBackup(){
    try{
      const raw = localStorage.getItem(AUTO_BK_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  }

  function updateAutoBackupInfo(){
    const el = $("#autoBackupInfo");
    if(!el) return;
    const bk = readAutoBackup();
    if(!bk || !Array.isArray(bk.expenses)){
      el.textContent = "Auto-backup locale: non disponibile";
      return;
    }
    const dt = (bk.exportedAt||"").slice(0,19).replace("T"," ");
    el.textContent = `Auto-backup locale: ${bk.expenses.length} spese • ultimo: ${dt} (senza foto)`;
  }

  async function restoreAutoBackup(){
    const bk = readAutoBackup();
    if(!bk || !Array.isArray(bk.expenses) || bk.expenses.length===0){
      alert("Nessun auto-backup disponibile.");
      return;
    }
    if(!confirm("Ripristinare dall’auto-backup locale?\nUnisce le spese mancanti (non cancella).\nNota: le foto NON sono incluse.")) return;

    const existing = new Set((all||[]).map(x=>x.id));
    let added = 0;

    for(const x of bk.expenses){
      if(!x || !x.id || existing.has(x.id)) continue;
      // restore without photo
      await dbPut({
        id:x.id,
        amount:Number(x.amount)||0,
        date:x.date || todayISO(),
        month:x.month || yyyymm(x.date || todayISO()),
        category:x.category || "Altro",
        note:x.note || x.category || "Spesa",
        photo:null
      });
      added++;
    }

    toast(added ? `Ripristino completato ✅ (+${added})` : "Niente da ripristinare");
    await refresh();
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
        autoSaveAfterPhoto: settings.autoSaveAfterPhoto
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
          amount:Number(x.amount)||0,
          date:String(x.date||""),
          month:String(x.month||yyyymm(x.date||todayISO())),
          category:String(x.category||"Altro"),
          note:String(x.note||""),
          photo: x.photo ? String(x.photo) : null
        });
        added++;
      }

      if(payload.settings){
        if(typeof payload.settings.viewMode === "string") settings.viewMode = payload.settings.viewMode;
        if(payload.settings.budgetByMonth && typeof payload.settings.budgetByMonth==="object") settings.budgetByMonth = payload.settings.budgetByMonth;
        if(payload.settings.pdfCountByMonth && typeof payload.settings.pdfCountByMonth==="object") settings.pdfCountByMonth = payload.settings.pdfCountByMonth;
        if(payload.settings.hasOwnProperty('autoSaveAfterPhoto')) settings.autoSaveAfterPhoto = !!payload.settings.autoSaveAfterPhoto;
        saveSettings();
      }

      toast(`Import OK (+${added}) ✅`);
      await refresh();
    }catch{
      alert("Errore import: file non valido.");
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
    $("#fSort")?.addEventListener("change", renderArchive);
    // Extra filters
    ["fDetraibili","fFrom","fTo","fMin","fMax"].forEach(id=>{
      const el = $("#"+id);
      if(!el) return;
      const ev = (id==="fDetraibili" || id==="fFrom" || id==="fTo") ? "change" : "input";
      el.addEventListener(ev, ()=>{ 
        clearTimeout(window.__ft2);
        window.__ft2=setTimeout(renderArchive, 120);
      });
    });

    $("#btnClearFilters").addEventListener("click", ()=>{
      $("#fMonth").value = monthNow();
      $("#fCategory").value = "";
      $("#fSearch").value = "";
      const d=$("#fDetraibili"); if(d) d.checked=false;
      const f=$("#fFrom"); if(f) f.value="";
      const t=$("#fTo"); if(t) t.value="";
      const mn=$("#fMin"); if(mn) mn.value="";
      const mx=$("#fMax"); if(mx) mx.value="";
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

    // UNIFIED FILE INPUT HANDLING
    const unifiedFileInput = $("#inPhotoUnified");

    const ACCEPT_ALL = "image/*,application/pdf";
    const ACCEPT_IMG = "image/*";
    const ACCEPT_PDF = "application/pdf";

    // Pulsante "Scatta foto"
    $("#btnReceiptCamera").addEventListener("click", ()=>{
      unifiedFileInput.setAttribute("accept", ACCEPT_IMG);
      unifiedFileInput.setAttribute("capture", "environment");
      unifiedFileInput.value = "";
      unifiedFileInput.click();
    });

    // Pulsante "Galleria"
    $("#btnReceiptGallery").addEventListener("click", ()=>{
      unifiedFileInput.setAttribute("accept", ACCEPT_ALL);
      unifiedFileInput.removeAttribute("capture");
      unifiedFileInput.value = "";
      unifiedFileInput.click();
    });

    // Pulsante "Importa PDF"
    $("#btnReceiptPdf").addEventListener("click", ()=>{
      unifiedFileInput.setAttribute("accept", ACCEPT_PDF);
      unifiedFileInput.removeAttribute("capture");
      unifiedFileInput.value = "";
      unifiedFileInput.click();
    })

    // ===========================
    // Batch Scanner (multi foto)
    // ===========================
    let batchQueue = [];
    let batchRunning = false;
    let batchStopRequested = false;

    function showBatchStatus(show){
      const box = $("#batchStatus");
      if(!box) return;
      box.style.display = show ? "block" : "none";
    }

    function setBatchProgress(done, total){
      const t = $("#batchText");
      const fill = $("#batchBarFill");
      if(t) t.textContent = `Batch: ${done}/${total}`;
      if(fill){
        const pct = total ? Math.round((done/total)*100) : 0;
        fill.style.width = pct + "%";
      }
    }

    
    async function saveBatchItem(){
      // Salvataggio batch DIRETTO: non dipende dal FileList dell'input (che può cambiare/azzerarsi)
      // e non usa timer. Prende i valori correnti e salva subito.
      let amountVal = parseEuro($("#inAmount").value);
      let dateVal = $("#inDate").value;
      const category = $("#inCategory").value;
      const note = ($("#inNote").value || "").trim();

      // Se OCR non compila, salva comunque come "Da completare"
      if(!Number.isFinite(amountVal) || amountVal < 0) amountVal = 0;
      if(!dateVal) dateVal = todayISO();

      // Foto: usa previewPhoto (dataURL) generata da handleUnifiedFile
      let photo = null;
      if(previewPhoto){
        photo = previewPhoto;
      }else{
        // fallback: prova a prendere l'immagine già mostrata in preview
        try{
          const im = $("#photoPreviewImg");
          if(im && im.src && im.src.startsWith("data:image")) photo = im.src;
        }catch(e){}
      }

      let finalNote = note || category;
      if(amountVal === 0 && (!note || !note.trim())) finalNote = "Da completare";

      const id = ((crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
      const item = { id, amount: amountVal, date: dateVal, month: yyyymm(dateVal), category, note: finalNote, photo };

      await dbPut(item);
      scheduleAutoBackup();

      // reset campi per prossima foto, SENZA chiudere modal
      previewPhoto = null;
      scanImg = null;
      setPhotoPreview(null);

      // Non azzerare il FileList (alcuni browser fanno cose strane in batch)
      try{
        if(window.__sspReceipt){ window.__sspReceipt.file = null; window.__sspReceipt.getLastFile = () => null; }
      }catch(e){}

      $("#inAmount").value = "";
      $("#inDate").value = todayISO();
      $("#inNote").value = "";

      return true;
    }
async function processBatchQueue(){
      if(batchRunning) return;
      batchRunning = true;
      batchStopRequested = false;

      showBatchStatus(true);

      const total = batchQueue.length;
      let done = 0;
      setBatchProgress(done, total);

      while(batchQueue.length){
        if(batchStopRequested) break;

        const file = batchQueue.shift();
        try{
          // Riusa lo stesso handler di analisi già esistente
          await handleUnifiedFile(file);
          // salva SUBITO l'elemento per non perdere l'anteprima
          await saveBatchItem();
        }catch(err){
          console.warn("Batch item failed", err);
        }

        done++;
        setBatchProgress(done, total);

        // Micro pausa per evitare freeze su telefoni medi
        await new Promise(r=>setTimeout(r, 50));
      }

      // Reset
      batchQueue = [];
      batchRunning = false;
      batchStopRequested = false;

      // refresh UNA volta sola (home/archivio)
      try{ await refresh(); }catch{}

      // Chiudi status dopo 1s
      setTimeout(()=>showBatchStatus(false), 900);
    }

    const btnBatch = $("#btnReceiptBatch");
    if(btnBatch){
      btnBatch.addEventListener("click", ()=>{
        unifiedFileInput.setAttribute("accept", ACCEPT_IMG);
        unifiedFileInput.removeAttribute("capture");
        unifiedFileInput.value = "";
        unifiedFileInput.click();
      });
    }

    const btnBatchStop = $("#btnBatchStop");
    if(btnBatchStop){
      btnBatchStop.addEventListener("click", ()=>{
        batchStopRequested = true;
      });
    }
;
    async function handleUnifiedFile(file){
      previewPhoto = null;
      scanImg = null;
      if (!file) {
        setPhotoPreview(null);
        if (window.__sspReceipt) {
          window.__sspReceipt.file = null;
          window.__sspReceipt.getLastFile = () => null;
        }
        return;
      }

      // Se è un PDF, converti prima pagina in immagine
      let imageFile = file;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          toast("Importo PDF…");
          imageFile = await pdfFirstPageToImageFile(file);
        } catch (err) {
          toast("PDF non valido");
          return;
        }
      }

      try {
        scanImg = await fileToImage(imageFile);
        const quick = await imageToDataUrl(scanImg, 0, null, 1.0, 0);
        setPhotoPreview(quick);
        previewPhoto = quick;
        if (window.__sspReceipt) {
          window.__sspReceipt.file = imageFile;
          window.__sspReceipt.getLastFile = () => imageFile;
        }
        toast("Foto caricata ✅");

        // OCR
        try {
          await window.__sspReceipt?.handle?.(imageFile, "select");
        } catch (_) {}

        // Programma auto-save (disabilitato in batch)
        if(!batchRunning) scheduleAutoSaveAfterPhoto();

      } catch {
        scanImg = null;
        setPhotoPreview(null);
        toast("Foto non valida");
      }
    }

unifiedFileInput.addEventListener('change', async (e) => {
      const files = (e.target.files ? Array.from(e.target.files) : []);
      if(!files.length){
        await handleUnifiedFile(null);
        return;
      }

      // Se selezioni più foto => batch
      if(files.length > 1){
        batchQueue = files;
        processBatchQueue();
        return;
      }

      await handleUnifiedFile(files[0]);
    });

    // Rimozione foto
    const btnRemove = $("#removePhoto") || $("#btnRemovePhoto");
    if(btnRemove) btnRemove.addEventListener("click", ()=>{
      unifiedFileInput.value = "";
      previewPhoto = null;
      scanImg = null;
      setPhotoPreview(null);
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
      const file = (window.__sspReceipt?.getLastFile && window.__sspReceipt.getLastFile()) || (unifiedFileInput.files && unifiedFileInput.files[0]);
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
      unifiedFileInput.value = "";
      previewPhoto=null;
      scanImg=null;
      setPhotoPreview(null);
      toast("Pulito");
    });

    $("#mClose").addEventListener("click", closeDetails);
    $("#modalDetails").addEventListener("click",(e)=>{ if(e.target===$("#modalDetails")) closeDetails(); });
    $("#mEdit").addEventListener("click", openEdit);
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
    renderDashboard();
    $("#rMonth").addEventListener("change", ()=>{ renderDashboard(); renderAnalysis(); });
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
    $("#inRestore").addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importBackup(f);
      e.target.value="";
    });

    // Auto-backup (ripristino rapido)
    const abr = $("#btnAutoRestore");
    if(abr) abr.addEventListener("click", restoreAutoBackup);
    updateAutoBackupInfo();


    // --- Export + Cestino (SAFE) ---
    const btnExportCsv = $("#btnExportCsv");
    const btnExportExcel = $("#btnExportExcel");
    const btnOpenTrash = $("#btnOpenTrash");
    const trashModal = $("#trashModal");
    const btnTrashClose = $("#btnTrashClose");
    const btnTrashEmpty = $("#btnTrashEmpty");

    function updateTrashCount(){
      try{
        const n = trashList(all).length;
        const el = $("#trashCount");
        if(el) el.textContent = String(n);
      }catch(e){}
    }

    function downloadBlob(blob, filename){
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 800);
    }

    function exportAllCsv(){
      const list = activeList(all).slice().sort((a,b)=>(String(a.date||"").localeCompare(String(b.date||""))));
      if(list.length===0){ toast("Nessuna spesa da esportare"); return; }
      const csvText = buildCsv(list);
      const blob = new Blob(["\ufeff"+csvText], {type:"text/csv;charset=utf-8"});
      const stamp = new Date().toISOString().slice(0,10);
      downloadBlob(blob, `Spese_${stamp}.csv`);
      toast("CSV esportato ✅");
    }

    function excelXmlEscape(s){
      return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function exportAllExcel(){
      const list = activeList(all).slice().sort((a,b)=>(String(a.date||"").localeCompare(String(b.date||""))));
      if(list.length===0){ toast("Nessuna spesa da esportare"); return; }

      // Spreadsheet 2003 XML (Excel apre senza librerie)
      const rows = list.map(x=>{
        const det = isDetraibileStrict(x.category, x.note) ? "SI" : "NO";
        const attach = x.photo ? "Foto" : "";
        const cells = [
          x.date||"",
          (typeof x.amount==="number" ? x.amount.toFixed(2) : String(x.amount||"")),
          x.category||"",
          x.note||"",
          det,
          attach
        ].map(v=>`<Cell><Data ss:Type="String">${excelXmlEscape(v)}</Data></Cell>`).join("");
        return `<Row>${cells}</Row>`;
      }).join("");

      const header = ["Data","Importo","Categoria","Note","Detraibile","Allegato"]
        .map(v=>`<Cell><Data ss:Type="String">${excelXmlEscape(v)}</Data></Cell>`).join("");
      const xml =
`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Spese">
  <Table>
   <Row>${header}</Row>
   ${rows}
  </Table>
 </Worksheet>
</Workbook>`;

      const blob = new Blob([xml], {type:"application/vnd.ms-excel;charset=utf-8"});
      const stamp = new Date().toISOString().slice(0,10);
      downloadBlob(blob, `Spese_${stamp}.xls`);
      toast("Excel esportato ✅");
    }

    function openTrash(){
      if(!trashModal) return;
      renderTrash();
      trashModal.classList.add("show");
      trashModal.setAttribute("aria-hidden","false");
    }
    function closeTrash(){
      if(!trashModal) return;
      trashModal.classList.remove("show");
      trashModal.setAttribute("aria-hidden","true");
    }

    async function emptyTrash(){
      if(!confirm("Svuotare il cestino? (Eliminazione definitiva)")) return;
      const list = trashList(all);
      for(const x of list){ try{ await dbDelete(x.id); }catch(e){} }
      toast("Cestino svuotato ✅");
      await refresh();
      renderTrash();
    }

    function renderTrash(){
      const el = $("#trashList");
      if(!el) return;
      const list = trashList(all).slice().sort((a,b)=>(Number(b.deletedAt||0)-Number(a.deletedAt||0)));
      if(list.length===0){
        el.innerHTML = `<div class="hint">Il cestino è vuoto.</div>`;
        return;
      }
      const esc = (s)=>String(s??"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
      el.innerHTML = list.map(x=>{
        const d = x.date ? `<div class="text-muted">${esc(x.date)}</div>` : "";
        const t = esc(x.note || x.category || "Spesa");
        const a = euro(+x.amount||0);
        return `
          <div class="row-card" style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin:8px 0; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:12px;">
            <div style="min-width:0;">
              <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t}</div>
              ${d}
              <div>${a}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
              <button class="btn btn-sm" data-restore="${esc(x.id)}">Ripristina</button>
              <button class="btn btn-danger btn-sm" data-del="${esc(x.id)}">Elimina</button>
            </div>
          </div>
        `;
      }).join("");

      el.querySelectorAll("[data-restore]").forEach(b=>b.addEventListener("click", async ()=>{
        const id=b.getAttribute("data-restore");
        await restoreFromTrash(id);
        toast("Ripristinata ✅");
        await refresh();
        renderTrash();
      }));
      el.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", async ()=>{
        const id=b.getAttribute("data-del");
        if(!confirm("Eliminare definitivamente?")) return;
        await dbDelete(id);
        toast("Eliminata definitivamente ✅");
        await refresh();
        renderTrash();
      }));
    }

    if(btnExportCsv) btnExportCsv.addEventListener("click", exportAllCsv);
    if(btnExportExcel) btnExportExcel.addEventListener("click", exportAllExcel);
    if(btnOpenTrash) btnOpenTrash.addEventListener("click", openTrash);
    if(btnTrashClose) btnTrashClose.addEventListener("click", closeTrash);
    if(trashModal) trashModal.addEventListener("click", (e)=>{ if(e.target===trashModal) closeTrash(); });
    if(btnTrashEmpty) btnTrashEmpty.addEventListener("click", emptyTrash);

    // update counter now + on refresh
    updateTrashCount();
    window.addEventListener('ssp_refresh_done', ()=>updateTrashCount());

    $("#btnWipeAll").addEventListener("click", wipeAll);
  
    // ===========================
    // SAFE: PIN LOCK (privacy)
    // ===========================
    const PIN_KEY = "ssp_pin_code_v1";
    const PIN_ENABLED_KEY = "ssp_pin_enabled_v1";
    let isUnlocked = false;

    function getPin(){ return localStorage.getItem(PIN_KEY) || ""; }
    function pinEnabled(){ return localStorage.getItem(PIN_ENABLED_KEY) === "1"; }

    function showPinOverlay(show, hint=""){
      const ov = $("#pinOverlay");
      if(!ov) return;
      ov.style.display = show ? "flex" : "none";
      const h = $("#pinHint");
      if(h) h.textContent = hint || "";
      const input = $("#pinEntry");
      if(input){
        input.value = "";
        if(show) setTimeout(()=>input.focus(), 50);
      }
    }

    function lockNow(){
      isUnlocked = false;
      showPinOverlay(true);
    }

    function unlockIfOk(code){
      const real = getPin();
      if(code === real && code.length === 4){
        isUnlocked = true;
        showPinOverlay(false);
        return true;
      }
      showPinOverlay(true, "PIN errato");
      return false;
    }

    function applyPinUi(){
      const t = $("#pinLockToggle");
      const setRow = $("#pinSetRow");
      const chRow = $("#pinChangeRow");
      if(!t) return;
      t.checked = pinEnabled();
      const hasPin = !!getPin();
      if(setRow) setRow.style.display = (!hasPin && t.checked) ? "block" : "none";
      if(chRow) chRow.style.display = (hasPin && t.checked) ? "block" : "none";
    }

    const pinToggle = $("#pinLockToggle");
    if(pinToggle){
      pinToggle.addEventListener("change", ()=>{
        if(pinToggle.checked){
          localStorage.setItem(PIN_ENABLED_KEY, "1");
          // se non c'è PIN, chiedi di impostarlo
          applyPinUi();
          if(!getPin()){
            toast("Imposta un PIN a 4 cifre");
            const inp = $("#pinSetInput");
            if(inp) setTimeout(()=>inp.focus(), 50);
          }else{
            lockNow();
          }
        }else{
          localStorage.setItem(PIN_ENABLED_KEY, "0");
          isUnlocked = true;
          showPinOverlay(false);
          applyPinUi();
        }
      });
    }

    const btnSetPin = $("#btnSetPin");
    if(btnSetPin){
      btnSetPin.addEventListener("click", ()=>{
        const v = ($("#pinSetInput")?.value || "").trim();
        if(!/^\d{4}$/.test(v)){ toast("PIN non valido (4 cifre)"); return; }
        localStorage.setItem(PIN_KEY, v);
        localStorage.setItem(PIN_ENABLED_KEY, "1");
        toast("PIN salvato ✅");
        lockNow();
        applyPinUi();
      });
    }

    const btnChangePin = $("#btnChangePin");
    if(btnChangePin){
      btnChangePin.addEventListener("click", ()=>{
        const v = ($("#pinChangeInput")?.value || "").trim();
        if(!/^\d{4}$/.test(v)){ toast("PIN non valido (4 cifre)"); return; }
        localStorage.setItem(PIN_KEY, v);
        toast("PIN aggiornato ✅");
        lockNow();
        applyPinUi();
      });
    }

    const btnRemovePin = $("#btnRemovePin");
    if(btnRemovePin){
      btnRemovePin.addEventListener("click", ()=>{
        localStorage.removeItem(PIN_KEY);
        localStorage.setItem(PIN_ENABLED_KEY, "0");
        isUnlocked = true;
        toast("PIN rimosso");
        showPinOverlay(false);
        applyPinUi();
      });
    }

    const btnUnlock = $("#btnPinUnlock");
    if(btnUnlock){
      btnUnlock.addEventListener("click", ()=>{
        const code = ($("#pinEntry")?.value || "").trim();
        unlockIfOk(code);
      });
    }
    const pinEntry = $("#pinEntry");
    if(pinEntry){
      pinEntry.addEventListener("keydown", (e)=>{
        if(e.key === "Enter"){
          const code = (pinEntry.value || "").trim();
          unlockIfOk(code);
        }
      });
    }

    // Lock on start if enabled and pin exists
    applyPinUi();
    if(pinEnabled() && getPin()){
      lockNow();
    }else{
      isUnlocked = true;
    }

    // Block interactions when locked (safe, doesn't alter state)
    document.addEventListener("click", (e)=>{
      if(!isUnlocked && pinEnabled()){
        const ov = $("#pinOverlay");
        if(ov && !ov.contains(e.target)){
          e.stopPropagation();
          e.preventDefault();
        }
      }
    }, true);

    // ===========================
    // SAFE: UNDO DELETE (5s)
    // ===========================
    let lastDeleted = null;
    let undoTimer = null;

    function showUndoToast(){
      // usa il toast esistente + un bottone minimal
      const host = $("#toastHost") || document.body;
      const el = document.createElement("div");
      el.className = "toast undo-toast";
      el.innerHTML = `<div>Eliminata</div><button class="btn btn-secondary btn-small" id="btnUndoDel">ANNULLA</button>`;
      host.appendChild(el);

      const btn = el.querySelector("#btnUndoDel");
      if(btn){
        btn.addEventListener("click", async ()=>{
          if(!lastDeleted) return;
          try{
            await dbPut(lastDeleted);
            lastDeleted = null;
            toast("Ripristinata ✅");
            await refresh();
          }catch(e){ toast("Errore ripristino"); }
          el.remove();
          if(undoTimer){ clearTimeout(undoTimer); undoTimer=null; }
        });
      }

      undoTimer = setTimeout(()=>{
        el.remove();
        undoTimer=null;
        lastDeleted=null;
      }, 5000);
    }

    // intercetta delete buttons con data-action="delete" o classe .btnDel (compatibile)
    document.addEventListener("click", async (e)=>{
      const t = e.target;
      if(!t) return;
      const delBtn = t.closest?.('[data-action="delete"], .btnDel, .btn-delete');
      if(!delBtn) return;
      const id = delBtn.getAttribute("data-id") || delBtn.dataset?.id;
      if(!id) return;

      // trova item corrente
      const all = (window.__sspAllItems || []);
      const item = all.find(x => x && x.id === id);
      if(!item) return;

      // lascia che la logica esistente faccia il delete, ma teniamo una copia per undo
      lastDeleted = {...item};

      // dopo un tick, mostra undo
      setTimeout(()=>showUndoToast(), 0);
    }, true);

  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  (async function start(){
    fillCategories();
    $("#inDate").value = todayISO();
    $("#fMonth").value = monthNow();
    setProUI();
    syncSettingsForm(); // sincronizza checkbox auto-save

    await openDB();
    await purgeOldTrash();
    await refresh();
    wire();
    showPage("home");
    
  })();

})();



// ===============================
// Receipt capture + attach (v26) - SAFE PATCH
// Adds two buttons: camera-only + gallery, saves image, tries OCR (optional) to prefill amount/date.
// Never throws: wrapped in try/catch.
// ===============================


// DISABLE legacy MULTI BATCH v2 interceptor (conflicts with built-in Batch Scanner)
try{ window.__SSP_MULTI_BATCH_V2 = true; }catch(_){ }
/* ============================================================
   Receipt (Camera/Gallery + OCR.Space) - clean module
   - Uses file inputs with capture attribute (no getUserMedia)
   - Runs OCR on selection + on Save if needed
   - Fills Importo (€) and Data when recognized
   ============================================================ */
(async () => {
  "use strict";

  const SETTINGS_KEY = "ssp_settings_v5";
  const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

  const $id = (id) => document.getElementById(id);

  const toastEl = $id("toast");
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function getOcrKey() {
    const s = getSettings();
  // Default: OCR.Space provides a public demo key "helloworld" for testing.
  // Users can replace it in Impostazioni.
  return (s.ocrSpaceKey || s.ocrKey || s.ocr_api_key || s.ocrApiKey || "").trim() || "helloworld";
  }

  function getOcrMode(){
    const s = getSettings();
    return (s.ocrMode || s.ocrProvider || "offline").toLowerCase();
  }
  function getOcrEndpoint(){
    const s = getSettings();
    const ep = (s.ocrEndpoint || "").trim();
    return ep || OCR_ENDPOINT;
  }

  // Fetch JSON with timeout + retry. Supports an external AbortSignal (so UI can cancel).
  async function fetchJsonWithRetry(url, opts, {timeoutMs=18000, retries=1}={}){
    let lastErr;
    for(let attempt=0; attempt<=retries; attempt++){
      const ac = new AbortController();
      const t = setTimeout(()=>{ try{ ac.abort(); }catch{} }, timeoutMs);

      // If an external signal is provided, propagate cancellation.
      const ext = (opts && opts.signal) ? opts.signal : null;
      let off = null;
      if(ext){
        if(ext.aborted){
          clearTimeout(t);
          throw new Error("OCR annullato");
        }
        off = ()=>{ try{ ac.abort(); }catch{} };
        try{ ext.addEventListener('abort', off, {once:true}); }catch{}
      }

      try{
        // Do not leak external signal into fetch() (we use our controller), but keep all other options.
        const merged = Object.assign({}, opts||{});
        delete merged.signal;
        merged.signal = ac.signal;
        const res = await fetch(url, merged);
        clearTimeout(t);
        if(!res.ok) throw new Error("Errore rete OCR online");

        // res.json() can hang in some WebViews; parse from text instead.
        const txt = await res.text();
        try{
          return JSON.parse(txt);
        }catch(_){
          throw new Error("Risposta OCR non valida");
        }
      }catch(e){
        clearTimeout(t);
        lastErr = e;
        // small backoff
        if(attempt < retries){
          try{ await new Promise(r=>setTimeout(r, 650)); }catch{}
        }
      } finally {
        try{ if(ext && off) ext.removeEventListener('abort', off); }catch{}
      }
    }
    throw lastErr || new Error("OCR online non riuscito");
  }


  const inAmount = $id("inAmount");
  let __userEditedAmount = false;
  if(inAmount){ inAmount.addEventListener('input', ()=>{ __userEditedAmount = true; }, {passive:true}); }

  const inDate = $id("inDate");
  const inDesc = $id("inNote");
  const preview = $id("receiptPreview");

  const ocrPanel = $id("ocrPanel");
  const ocrTextEl = $id("ocrText");
  const btnOcrCopy = $id("btnOcrCopy");
  const btnOcrDownload = $id("btnOcrDownload");
  const ocrStatusEl = $id("ocrStatus");

  function showOcrPanel(show){ if(ocrPanel) ocrPanel.style.display = show ? "block" : "none"; }
  function setOcrText(t){ if(ocrTextEl) ocrTextEl.value = String(t||""); }
  function setOcrStatus(t){ if(ocrStatusEl) ocrStatusEl.textContent = String(t||""); }

  const btnCam = $id("btnReceiptCamera");
  const btnGal = $id("btnReceiptGallery");
  // Non usiamo più i vecchi input, ma il nuovo unificato gestito nell'app principale
  // Quindi qui rimuoviamo i listener sui vecchi input per evitare conflitti.
  // L'OCR verrà attivato dall'evento change dell'input unificato.

  let lastReceiptFile = null;
  // OCR UI actions
  if (btnOcrCopy) {
    btnOcrCopy.addEventListener("click", async () => {
      try{
        const t = (ocrTextEl && ocrTextEl.value) ? ocrTextEl.value : "";
        if(!t.trim()) { toast("Nessun testo da copiare"); return; }
        await navigator.clipboard.writeText(t);
        toast("Testo copiato ✅");
      }catch{ toast("Copia non riuscita"); }
    });
  }
  if (btnOcrDownload) {
    btnOcrDownload.addEventListener("click", () => {
      try{
        const t = (ocrTextEl && ocrTextEl.value) ? ocrTextEl.value : "";
        if(!t.trim()) { toast("Nessun testo da scaricare"); return; }
        const blob = new Blob([t], {type:"text/plain"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ocr_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 1000);
      }catch{ toast("Download non riuscito"); }
    });
  }
  let ocrInFlight = false;
  let lastOcrAt = 0;
  let __ocrAbort = null;

  function setPreviewFromFile(file) {
    if (!preview) return;
    try {
      const url = URL.createObjectURL(file);
      preview.onload = () => { try { URL.revokeObjectURL(url); } catch {} };
      preview.src = url;
      preview.style.display = "block";
    } catch {}
  }

  function normalizeText(t) {
    return String(t || "")
      .replace(/\r/g, "\n")
      .replace(/[\u00A0]/g, " ")
      .replace(/\t/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .trim();
  }

  function parseEuro(str) {
    const m = String(str || "").match(/(\d{1,4}[\.,]\d{2})/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }

  function parseDateFromText(text) {
    const m = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
    if (!m) return null;
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }

  function pickBestTotal(text) {
  // Estrae il TOTALE in modo robusto (scontrini italiani):
  // - riconosce TOTALE/SUBTOTALE/DA PAGARE/IMPORTO PAGATO ecc.
  // - tollera errori OCR (0↔O, 1↔I, spazi, lettere sporche)
  // - se trova più candidati, preferisce quelli più "da fondo scontrino"
  const rawLines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n|\|/)
    .map(l => l.trim())
    .filter(Boolean);

  // PRIORITÀ BUONI/SPENDI E RIPRENDI (es. CRAI): "VALE EUR 5,00" deve vincere su "SPESA MINIMA 30,00"
  // Gestisce OCR sporco: EUR/EURO/EJR ecc, e ritorni a capo.
  const __valeMatch = String(text||"").match(/VALE\s*(?:E[UO]?R|EURO|EJR|EUR)?\s*[:\-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i);
  if(__valeMatch){
    const raw = __valeMatch[1];
    const norm = raw.includes(",") ? raw : raw.replace(".", ",");
    const v = parseEuro(norm);
    if(Number.isFinite(v) && v>0) return v;
  }



  // Normalizza per matching keyword: rimuove spazi, converte cifre "ambigue" in lettere.
  const normKey = (s) => String(s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S");

  const isTotalLine = (s) => {
    const k = normKey(s);
    return /(TOTALE|TOT\b|SUBTOTALE|SUBTOT|TOTALECOMPLESSIVO|IMPORTOPAGATO|IMPORTOTOTALE|DAPAGARE|PAGARE|SALDO|CORRISPETTIVO|PAGAMENTOELETTRONICO|PAGAMENTOCARTA|TOTAL\b)/.test(k);
  };

  const extractAmountsFromLine = (s) => {
    const str = String(s || "");
    // Ignora importi su righe di "SPESA MINIMA" / "MINIMA DI" (non sono totali reali)
    const up = str.toUpperCase();
    if(up.includes("SPESA MINIMA") || up.includes("MINIMA DI") || up.includes("MINIMO")) return [];
    // accetta: 10,96 | 1.234,56 | 1234,56 | 10.96
    const reAmt = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/g;
    const out = [];
    let m;
    while ((m = reAmt.exec(str)) !== null) {
      const raw = m[1];
      // normalizza a virgola decimale
      const norm = raw.includes(",") ? raw : raw.replace(".", ",");
      const n = parseEuro(norm);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  };

  const candidates = [];
  const anyAmounts = [];

  const pushCandidate = (idx, tag, val) => {
    if (!Number.isFinite(val)) return;
    // Più è in basso nello scontrino, più è probabile che sia il totale
    const posBoost = (idx / Math.max(1, rawLines.length - 1)) * 20; // 0..20
    const base =
      tag === "TOTALECOMPLESSIVO" ? 100 :
      tag === "TOTALE" ? 90 :
      tag === "SUBTOTALE" ? 80 :
      tag === "DAPAGARE" ? 85 :
      tag === "IMPORTOPAGATO" ? 88 :
      70;
    candidates.push({ score: base + posBoost + (val/1000), val });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    const amtsHere = extractAmountsFromLine(ln);
    for (const a of amtsHere) anyAmounts.push(a);

    const k = normKey(ln);
    if (/(TOTALECOMPLESSIVO)/.test(k)) {
      if (amtsHere.length) pushCandidate(i, "TOTALECOMPLESSIVO", Math.max(...amtsHere));
      else {
        const next = rawLines[i + 1] || "";
        const amtsNext = extractAmountsFromLine(next);
        if (amtsNext.length) pushCandidate(i + 1, "TOTALECOMPLESSIVO", Math.max(...amtsNext));
      }
      continue;
    }

    if (/(SUBTOTALE|SUBTOT)/.test(k)) {
      if (amtsHere.length) pushCandidate(i, "SUBTOTALE", Math.max(...amtsHere));
      else {
        const next = rawLines[i + 1] || "";
        const amtsNext = extractAmountsFromLine(next);
        if (amtsNext.length) pushCandidate(i + 1, "SUBTOTALE", Math.max(...amtsNext));
      }
      continue;
    }

    if (/(DAPAGARE|PAGARE)/.test(k)) {
      if (amtsHere.length) pushCandidate(i, "DAPAGARE", Math.max(...amtsHere));
      else {
        const next = rawLines[i + 1] || "";
        const amtsNext = extractAmountsFromLine(next);
        if (amtsNext.length) pushCandidate(i + 1, "DAPAGARE", Math.max(...amtsNext));
      }
      continue;
    }

    if (/(IMPORTOPAGATO)/.test(k)) {
      if (amtsHere.length) pushCandidate(i, "IMPORTOPAGATO", Math.max(...amtsHere));
      else {
        const next = rawLines[i + 1] || "";
        const amtsNext = extractAmountsFromLine(next);
        if (amtsNext.length) pushCandidate(i + 1, "IMPORTOPAGATO", Math.max(...amtsNext));
      }
      continue;
    }

    // Catch-all: line contains generic "totale" keywords
    if (isTotalLine(ln)) {
      if (amtsHere.length) pushCandidate(i, "TOTALE", Math.max(...amtsHere));
      else {
        const next = rawLines[i + 1] || "";
        const amtsNext = extractAmountsFromLine(next);
        if (amtsNext.length) pushCandidate(i + 1, "TOTALE", Math.max(...amtsNext));
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0].val;
  }

  // Fallback: massimo importo nell'ultima parte dello scontrino, poi globale
  if (anyAmounts.length) {
    const tail = anyAmounts.slice(-Math.min(anyAmounts.length, 20));
    const tailMax = Math.max(...tail);
    const allMax = Math.max(...anyAmounts);
    // se differiscono, scegli quello più grande (di solito è il totale)
    return Math.max(tailMax, allMax);
  }
  return null;
}

  function detectCategoryFromText(text, merchant){
  const up = String(text||"").toUpperCase();
  const m = String(merchant||"").toUpperCase();

  // Score-based categorization to reduce false positives.
  const score = {
    "Farmacia / Mediche": 0,
    "Alimentari": 0,
    "Benzina": 0,
    "Bollette": 0,
    "Ristorazione": 0,
    "Casa": 0,
    "Viaggi": 0,
    "Animali": 0,
    "Shopping": 0,
    "Altro": 0
  };

  // --- Merchant hints ---
  const merch = (pat, pts, cat) => { if(pat.test(m)) score[cat] += pts; };
  merch(/(EUROSPIN|LIDL|CONAD|COOP|MD\b|CARREFOUR|DESPAR|PAM\b|IPER|AUCHAN|PENNY|SIGMA|SPAR)/i, 6, "Alimentari");
  merch(/(FARMAC|PARAFARM|APOTEK|DR\.MAX|LLOYDS|BENU)/i, 8, "Farmacia / Mediche");
  merch(/(ENI\b|Q8\b|ESSO\b|IP\b|TAMOIL|TOTALERG|SHELL\b)/i, 8, "Benzina");
  merch(/(ENEL|E-DISTRIBUZIONE|A2A|HERA|IREN|TIM\b|VODAFONE|WIND|FASTWEB|POSTE|SKY\b|ILIAD)/i, 7, "Bollette");
  merch(/(TRENITALIA|ITALO|RYANAIR|EASYJET|WIZZAIR|BOOKING|AIRBNB|FLIXBUS)/i, 7, "Viaggi");
  merch(/(LEROY|BRICO|OBI\b|IKEA|MOBILI|ARREDO)/i, 6, "Casa");
  merch(/(VETERIN|PET\s*SHOP|ARCAPLANET|ZOOPLUS)/i, 7, "Animali");
  merch(/(RISTOR|PIZZER|TRATTOR|BAR\b|CAFFE|GELATER|PUB\b)/i, 6, "Ristorazione");

  // --- Text hints (strong medical) ---
  const add = (pat, pts, cat) => { if(pat.test(up)) score[cat] += pts; };

  // Medical strong keywords (avoid "IVA" etc.)
  add(/(STUDIO\s+DENTIST|DENTIST|ODONTO|PRESTAZIONE\s+SANIT|SPESE\s+SANIT|POLIAMBULATORIO|AMBULATORIO|ANALISI\s+CLINIC|LABORATORIO|VISITA\s+SPECIAL|TICKET|ASL|RICETTA|FARMACIA|PARAFARMAC)/i, 10, "Farmacia / Mediche");
  add(/(CODICE\s+FISCALE|CF[:\s]|TESSERA\s+SANITARIA)/i, 6, "Farmacia / Mediche");
  // Marca da bollo helps invoices/receipts; still not always medical, but useful with other hints.
  add(/(MARCA\s+DA\s+BOLLO|BOLLO)\b/i, 2, "Farmacia / Mediche");

  // Alimentari / supermarkets
  add(/(DOCUMENTO\s+COMMERCIALE|CASSA\s+\d+|REPARTO|BANCOMAT|PAGAMENTO\s+ELETTRONICO)/i, 2, "Alimentari");
  add(/(EUROSPIN|LIDL|CONAD|COOP|CARREFOUR|DESPAR|PENNY|MD\b|SPAR)\b/i, 6, "Alimentari");
  add(/(SUB\s*TOTALE|TOTALE\s+COMPLESSIVO|TOTALE)\b/i, 1, "Alimentari"); // present on receipts, weak hint only

  // Benzina
  add(/(BENZIN|DIESEL|GASOLIO|CARBUR|RIFORN|SELF\s*SERVICE|STAZIONE\s+SERVIZIO|POMPA)\b/i, 7, "Benzina");
  add(/\b(ENI|Q8|ESSO|IP|TAMOIL|TOTALERG|SHELL)\b/i, 8, "Benzina");

  // Bollette / utilities
  add(/(FATTURA\s+N\.?|BOLLETTA|POD\b|PDR\b|SCADENZA|CONSUMO|KWH|SMC|UTENZA)\b/i, 7, "Bollette");
  add(/\b(ENEL|TIM|VODAFONE|WIND|FASTWEB|POSTE|ILIAD|SKY)\b/i, 7, "Bollette");

  // Casa
  add(/(FERRAMENTA|BRICOLAGE|VERNICE|MOBILI|ARREDO|FAI\s*DA\s*TE)\b/i, 5, "Casa");

  // Ristorazione
  add(/(RISTORANTE|PIZZERIA|TRATTORIA|BAR|CAFFE|GELATERIA|PUB)\b/i, 6, "Ristorazione");

  // Viaggi
  add(/(BIGLIETTO|IMBARCO|CHECK-?IN|TRATTA|VOLO|TRENO)\b/i, 5, "Viaggi");

  // Animali
  add(/(VETERIN|TOELETTATURA|MANGIME|CROCC|ANIMALI|PET\s*SHOP)\b/i, 6, "Animali");

  // --- Pick winner ---
  let best = "Altro";
  let bestScore = -1;
  let secondScore = -1;
  for(const k in score){
    const v = score[k];
    if(v > bestScore){
      secondScore = bestScore;
      bestScore = v;
      best = k;
    }else if(v > secondScore){
      secondScore = v;
    }
  }

  // If uncertain, default to Alimentari only when supermarket merchant detected; else Altro.
  const uncertain = (bestScore < 6) || (bestScore - secondScore < 3);
  if(uncertain){
    if(/(EUROSPIN|LIDL|CONAD|COOP|MD\b|CARREFOUR|DESPAR|PAM\b|IPER|AUCHAN|PENNY|SIGMA|SPAR)/i.test(m)) return "Alimentari";
    return "Altro";
  }
  return best;
}

function isDetraibileSafe(category, ocrText, merchant){
  const c = String(category||"").toLowerCase();
  const m = String(merchant||"").toLowerCase();
  const s = String(ocrText||"").toLowerCase();

  // Never detraibile for supermarkets/food retailers
  const supermarket = /(eurospin|lidl|conad|coop|carrefour|despar|\bmd\b|penny|spar|pam\b|sigma|auch|iper)/i;
  if(supermarket.test(m) || supermarket.test(s)) return false;

  // Category-based
  if(c.includes("farmacia") || c.includes("mediche") || c.includes("sanitar")) return true;

  // Strong medical keywords (avoid generic 'IVA')
  const strong = [
    "farmacia","parafarm","ticket","studio dentist","dentist","odontoiatr",
    "prestazione sanitaria","spese sanit","visita","asl","ssn",
    "tessera sanitaria","codice fiscale","ricetta","medico","poliambulator"
  ];
  return strong.some(k => s.includes(k));
}


function detectMerchant(text){
    const up = String(text||"").toUpperCase();
    // Normalizzazioni comuni (OCR spesso spezza/sporca)
    const norm = up
      .replace(/\s+/g,' ')
      .replace(/EURO\s*SPIN/g,'EUROSPIN')
      .replace(/L\s*I\s*D\s*L/g,'LIDL');

    const checks = [
      {name:"EUROSPIN", re:/\bEUROSPIN\b/},
      {name:"LIDL", re:/\bLIDL\b/},
      {name:"CONAD", re:/\bCONAD\b/},
      {name:"COOP", re:/\bCOOP\b/},
      {name:"MD", re:/\b\sMD\s|\bMARKET\s*D\b/},
      {name:"DESPAR", re:/\bDESPAR\b/},
      {name:"PAM", re:/\bPAM\b/},
      {name:"CARREFOUR", re:/\bCARREFOUR\b/},
      {name:"ESSELUNGA", re:/\bESSELUNGA\b/},
      {name:"IPER", re:/\bIPER\b/},
      {name:"PENNY", re:/\bPENNY\b/},
      {name:"ALDI", re:/\bALDI\b/}
    ];
    for(const c of checks){
      if(c.re.test(norm) || c.re.test(up)) return c.name;
    }
    return "";
  }

  async function fileToFormData(file, apikey, language) {
    const fd = new FormData();
    fd.append("apikey", apikey);
    fd.append("language", language || "ita");
    fd.append("isOverlayRequired", "false");
    fd.append("OCREngine", "2");
    fd.append("scale", "true");
    fd.append("detectOrientation", "true");
    fd.append("file", file, file.name || "receipt.jpg");
    return fd;
  }

  function isProbablyOnline(){
    return (typeof navigator !== 'undefined') ? (navigator.onLine !== false) : true;
  }

  

  function isAndroidWebView(){
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : "";
    // Common markers for Android WebView/TWA wrappers
    return /Android/i.test(ua) && (/wv/i.test(ua) || /Version\//i.test(ua) || /; wv\)/i.test(ua));
  }

  // =====================
  // PDF IMPORT (via pdf.js)
  // =====================
  async function ensurePdfJsReady(){
    if(window.__sspPdfReady) return;
    if(!window.pdfjsLib) throw new Error("PDF.js non caricato");
    try{
      // worker from CDN (same version)
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }catch(e){}
    window.__sspPdfReady = true;
  }

  async function pdfFirstPageToPngFile(pdfFile){
    await ensurePdfJsReady();
    const buf = await pdfFile.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: buf });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((res)=> canvas.toBlob(res, "image/png", 0.95));
    if(!blob) throw new Error("Render PDF fallito");
    const safeName = String(pdfFile.name||"documento.pdf").replace(/\.pdf$/i,"") + ".png";
    return new File([blob], safeName, { type: "image/png" });
  }

async function ensureTesseractReady(){
    if (window.__sspTessReady) return;
    if (!window.Tesseract) {
      throw new Error("Tesseract non caricato");
    }
    window.__sspTessReady = true;
  }

  function canvasFromFile(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 900; // più veloce su telefoni (resta leggibile per scontrini)
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // aumento contrasto semplice
        try {
          const id = ctx.getImageData(0,0,w,h);
          const d = id.data;
          for (let i=0;i<d.length;i+=4){
            const r=d[i], g=d[i+1], b=d[i+2];
            // luminanza
            let y = 0.299*r + 0.587*g + 0.114*b;
            // soglia morbida
            y = y > 165 ? 255 : (y < 90 ? 0 : y);
            d[i]=d[i+1]=d[i+2]=y;
          }
          ctx.putImageData(id,0,0);
        } catch(_){/* ignore */}
        resolve(c);
      };
      img.onerror = reject;
      const url = URL.createObjectURL(file);
      img.src = url;
      img.dataset.__url = url;
    });
  }

  function withTimeout(promise, ms, onTimeout){
    return new Promise((resolve, reject)=>{
      const t = setTimeout(()=>{
        try{ onTimeout && onTimeout(); }catch{}
        reject(new Error('Timeout'));
      }, ms);
      promise.then((v)=>{ clearTimeout(t); resolve(v); }, (e)=>{ clearTimeout(t); reject(e); });
    });
  }

  async function runLocalOcr(file, signal){
    await ensureTesseractReady();
    const canvas = await canvasFromFile(file);

    // Worker riutilizzabile (molto più veloce dopo la prima volta)
    if(!window.__sspTessWorker){
      const { createWorker } = window.Tesseract;
      let lastToastAt = 0;
      window.__sspTessWorker = await createWorker({
        // Explicit paths for Android WebView reliability (avoid default unpkg lookups)
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
        langPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/lang",
        logger: (m) => {
          // Throttle UI updates (troppi toast rallentano)
          const now = Date.now();
          if(m && typeof m.progress === 'number' && now - lastToastAt > 600){
            lastToastAt = now;
            const pct = Math.round(m.progress * 100);
            setOcrStatus(`OCR ${pct}%...`);
            toast(`OCR ${pct}%...`);
          }
        }
      });
      // Lingue: ita + eng (molti scontrini hanno EN)
      await window.__sspTessWorker.loadLanguage('ita+eng');
      await window.__sspTessWorker.initialize('ita+eng');
      // Parametri veloci per scontrini
      try{
        await window.__sspTessWorker.setParameters({
          // 6 = assume a uniform block of text (ottimo per scontrini)
          tessedit_pageseg_mode: "6",
          // 1 = LSTM only (spesso più veloce/stabile su tesseract.js)
          tessedit_ocr_engine_mode: "1"
        });
      }catch{}
    }

    if(signal && signal.aborted) throw new Error("OCR annullato");
    const res = await window.__sspTessWorker.recognize(canvas);
    return { text: (res && res.data && res.data.text) ? res.data.text : '', raw: res, error: '' };
  }

  
  // Shrink and compress image for OCR.Space.
  // OCR.Space often enforces strict size limits (e.g. 1 MB on some plans).
  // We use a *medium* preset (faster) and ensure we stay under ~900 KB.
  async function shrinkForOnlineOcr(file, targetBytes = 900*1024){
    try{
      if(file && file.size && file.size <= targetBytes) return file;

      const src = await canvasFromFile(file);

      const makeBlob = async (maxW, quality) => {
        const scale = Math.min(1, maxW / src.width);
        const cc = document.createElement('canvas');
        cc.width = Math.max(1, Math.round(src.width * scale));
        cc.height = Math.max(1, Math.round(src.height * scale));
        const ctx = cc.getContext('2d');
        ctx.drawImage(src, 0, 0, cc.width, cc.height);
        const blob = await new Promise(res => cc.toBlob(res, 'image/jpeg', quality));
        return blob;
      };

      // Medium preset: start fairly readable, then tighten if still too big.
      const attempts = [
        {maxW: 1200, q: 0.62},
        {maxW: 1000, q: 0.58},
        {maxW: 900,  q: 0.55},
        {maxW: 800,  q: 0.52},
      ];

      let bestBlob = null;
      for(const a of attempts){
        const blob = await makeBlob(a.maxW, a.q);
        if(!blob) continue;
        bestBlob = blob;
        if(blob.size <= targetBytes) break;
      }

      if(!bestBlob) return file;

      const safeName = (file.name || 'receipt').replace(/\.[^.]+$/, '');
      return new File([bestBlob], safeName + '_ocr.jpg', {type: 'image/jpeg'});
    }catch{
      return file;
    }
  }
async function runOnlineOcr(file, signal){
    const apikey = getOcrKey();
    const endpoint = getOcrEndpoint();
    if(!apikey) throw new Error("API key mancante");

    // Always shrink before upload to avoid OCR.Space plan size limits (often 1MB).
    // Medium preset: fast and typically enough for receipts.
    const uploadFile = await shrinkForOnlineOcr(file, 900*1024);

    const fd = await fileToFormData(uploadFile, apikey, "ita");

    // Use XMLHttpRequest because in some Android WebViews fetch() + FormData can hang forever
    // and ignore AbortController, causing the UI to stay at 99%.
    const j = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let done = false;
      const finish = (err, data) => {
        if(done) return;
        done = true;
        try{ if(signal && onAbort) signal.removeEventListener('abort', onAbort); }catch{}
        if(err) reject(err); else resolve(data);
      };
      const onAbort = () => { try{ xhr.abort(); }catch{} finish(new Error("OCR annullato")); };

      try{
        xhr.open("POST", endpoint, true);
        xhr.timeout = 28000; // hard timeout (prevents 99% freeze)
        xhr.onreadystatechange = () => {
          if(xhr.readyState !== 4) return;
          if(xhr.status >= 200 && xhr.status < 300){
            try{
              const txt = xhr.responseText || "";
              const data = JSON.parse(txt);
              finish(null, data);
            }catch(e){
              finish(new Error("Risposta OCR non valida"));
            }
          } else {
            finish(new Error("Errore rete OCR online"));
          }
        };
        xhr.onerror = () => finish(new Error("Errore rete OCR online"));
        xhr.ontimeout = () => finish(new Error("Timeout OCR online"));
        if(signal){
          if(signal.aborted) return onAbort();
          try{ signal.addEventListener('abort', onAbort, {once:true}); }catch{}
        }
        xhr.send(fd);
      }catch(e){
        finish(e);
      }
    });

    // OCR.Space payload
    const parsed = (j && j.ParsedResults && j.ParsedResults[0] && j.ParsedResults[0].ParsedText) ? j.ParsedResults[0].ParsedText : "";
    const errMsg = (j && j.ErrorMessage) ? String(j.ErrorMessage) : "";
    if(errMsg){
      return { text: parsed, raw: j, error: errMsg };
    }
    return { text: parsed, raw: j, error: "" };
  }

  async function runOcr(file, signal){
    // OCR mode can be changed in Impostazioni:
    // - offline: Tesseract (may fail in some Android WebViews)
    // - online: OCR.Space
    // - auto: offline -> online fallback
    const mode = (getOcrMode() || "offline").toLowerCase();

    const canOnline = true; // do not trust navigator.onLine in WebView; attempt online and handle errors
    const canOffline = !!(window.Tesseract);

    const runOffline = async () => {
      setOcrStatus("OCR offline…");
      return await withTimeout(runLocalOcr(file, signal), 9000, ()=>{ try{ if(window.__sspTessWorker){ window.__sspTessWorker.terminate(); window.__sspTessWorker=null; window.__sspTessReady=false; } }catch{} });
    };
    const runOnline = async () => {
      setOcrStatus("OCR online…");
      try{
        return await runOnlineOcr(file, signal);
      }catch(e){
        const msg = (e && e.message) ? String(e.message) : String(e);
        // Retry once with a smaller image on timeouts/network hiccups
        if(/timeout|network|rete/i.test(msg)){
          const small = await shrinkForOnlineOcr(file);
          toast('OCR online: secondo tentativo (immagine ottimizzata)…');
          return await runOnlineOcr(small, signal);
        }
        throw e;
      }
    };

    // If user explicitly wants ONLINE
    if(mode === "online") return await runOnline();

    // If user explicitly wants OFFLINE
    if(mode === "offline"){
      try{
        if(!canOffline) throw new Error("OCR offline non disponibile");
        return await runOffline();
      }catch(e){
        // Fallback to online if available (so the app never gets stuck)
        try{
          toast('OCR offline non riuscito: uso OCR online');
          setOcrStatus('Fallback OCR online…');
          return await runOnline();
        }catch(e2){
          throw new Error('OCR offline non riuscito e OCR online non disponibile.');
        }
      }
    }

    // AUTO mode:
    // - Prefer offline when possible; in Android WebView offline is often blocked, so we fallback quickly.
    try{
      if(canOffline && !isAndroidWebView()){
        return await runOffline();
      }
      // In WebView, try offline only if explicitly available; otherwise go online directly.
      if(canOffline){
        // quick attempt with a short timeout via AbortController race
        return await runOffline();
      }
    }catch(_){ /* ignore and fallback */ }

    return await runOnline();
  }

  async function tryExtractAndFill(file, reason) {
    const now = Date.now();
    if (ocrInFlight) return false;
    if (now - lastOcrAt < 700 && reason !== "save") return false;
    lastOcrAt = now;
    ocrInFlight = true;
    let __pctTimer=null;
    let __finalizeWatch=null;
    try {
      showOcrPanel(true);
      setOcrStatus("Caricamento immagine...");
      // Timeout/abort: never block UI forever
      const ac = new AbortController();
      __ocrAbort = ac;

      // UI progress (fake but useful): avoid "stuck" feeling, especially on APK/WebView
      let __pct = 1;
      __pctTimer = setInterval(()=>{
        __pct = Math.min(100, __pct + (__pct<90 ? (Math.floor(Math.random()*7)+1) : 1));
        try{ setOcrStatus(__pct>=90 ? `Finalizzazione… ${__pct}%` : `Analisi scontrino… ${__pct}%`); }catch{}

        // If we reach 99% and stay there, it usually means the provider response/parsing is stuck.
        // Add a short watchdog that aborts and lets the retry logic kick in.
        if(__pct >= 99 && !__finalizeWatch){
          __finalizeWatch = setTimeout(()=>{
            try{ ac.abort(); }catch{}
          }, 9000);
        }
      }, 450);

      toast("Caricamento immagine...");
      const tmr = setTimeout(()=>{ try{ ac.abort(); }catch{} }, 42000);
      const ocr = await runOcr(file, ac.signal);
      try{ clearInterval(__pctTimer); setOcrStatus('Analisi completata ✅'); }catch{}

      try{ if(__finalizeWatch) clearTimeout(__finalizeWatch); __finalizeWatch=null; }catch{}

      clearTimeout(tmr);
      __ocrAbort = null;
      if (ocr && ocr.error) { throw new Error(ocr.error); }
      const txt = normalizeText((ocr && ocr.text) ? ocr.text : "");
      setOcrText(txt);
      if (!txt) {
        setOcrStatus("Testo non rilevato. Prova con una foto più nitida.");
        toast("Testo non rilevato. Prova con una foto più nitida.");
        return false;
      }
      const total = pickBestTotal(txt);
      const dateISO = parseDateFromText(txt);

      if (total != null && inAmount) {
        // Imposta sempre il totale rilevato, a meno che l'utente abbia già modificato manualmente l'importo
        const cur = String(inAmount.value || "").trim();
        if(!__userEditedAmount || !cur){
          inAmount.value = total.toFixed(2).replace(".", ",");
        }
      }
      if (dateISO && inDate && (!inDate.value || String(inDate.value).trim() === "")) {
        inDate.value = dateISO;
      }
      if (inDesc && (!inDesc.value || !inDesc.value.trim())) {
        const merchant = detectMerchant(txt);
        if(merchant){
          inDesc.value = merchant;
        } else {
          const firstLine = String(txt || "").split(/\n/).map(s => s.trim()).find(s => /[A-Za-zÀ-ÿ]/.test(s) && s.length >= 3);
          if (firstLine) inDesc.value = firstLine.slice(0, 40);
        }
      }

      // Categoria automatica (senza forzare se l'utente l'ha già cambiata)
      const catEl = $id("inCategory");
      if(catEl){
        const merchantForCat = (inDesc && inDesc.value) ? inDesc.value : "";
        const suggested = detectCategoryFromText(txt, merchantForCat);
        const curCat = String(catEl.value||"").trim();
        if(suggested && (!curCat || curCat === "Alimentari")){
          catEl.value = suggested;
        }
      }

      if (total != null || dateISO) {
        setOcrStatus("Dati scontrino rilevati ✅");
        toast("Dati scontrino rilevati ✅");

        // Auto-salva (antibug): se dopo l'OCR ci sono sia importo che data, notifichiamo l'app.
        // L'app deciderà se salvare automaticamente (toggle in Impostazioni).
        try{
          const amtNow = (()=>{
            const v = String(inAmount?.value || "").trim().replace(/\./g, "").replace(",", ".");
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          })();
          const dateNow = String(inDate?.value || "").trim();
          if(amtNow && amtNow > 0 && dateNow){
            window.dispatchEvent(new CustomEvent('ssp:ocr-filled', {
              detail: { amount: amtNow, date: dateNow, reason: reason || "ocr" }
            }));
          }
        }catch(_){ /* never block */ }

        return true;
      }
      setOcrStatus("Dati non riconosciuti. Inquadra bene totale e data.");
      toast("Dati non riconosciuti. Inquadra bene totale e data.");
      return false;
    } catch (e) {
      console.error("OCR error", e);
      setOcrStatus("Errore OCR: " + (e && e.message ? e.message : e));
      toast("Errore OCR. Riprova con una foto più nitida.");
      return false;
    } finally {
      try{ if(__pctTimer) clearInterval(__pctTimer); __pctTimer=null; }catch{}
      try{ if(__finalizeWatch) clearTimeout(__finalizeWatch); __finalizeWatch=null; }catch{}
      ocrInFlight = false;
    }
  }

  // IMPORTANT:
  // Questa app ha già i suoi listener su camera/gallery (per anteprima + salvataggio).
  // Qui NON aggiungiamo altri listener per evitare doppie aperture/"devo fare la foto due volte" su Android.
  

  async function testOcrSpaceKey(){
    // Lightweight key verification: sends a tiny generated image with text 'TEST'
    try{
      const key = getOcrKey();
      const ep = getOcrEndpoint();
      // build a small canvas image
      const c = document.createElement('canvas');
      c.width = 260; c.height = 80;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle = '#000'; ctx.font = '28px sans-serif';
      ctx.fillText('TEST OCR', 20, 50);
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'test.jpg', {type: 'image/jpeg'});
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(), 20000);
      const res = await runOnlineOcr(file, ctrl.signal);
      clearTimeout(t);
      if(res && (res.error || '').trim()) {
        alert('Chiave OK ma OCR.Space segnala: ' + res.error);
        return;
      }
      if(!res || !String(res.text||'').trim()) {
        alert('Chiave valida, ma nessun testo di test ricevuto. Riprova.');
        return;
      }
      alert('API Key OK ✅\nRisposta: ' + String(res.text).slice(0,120));
    }catch(e){
      alert('Test API Key fallito: ' + (e && e.message ? e.message : e));
    }
  }

// L'OCR viene avviato dal flusso principale (dopo che la foto è pronta) tramite window.__sspReceipt.handle().

  window.__sspReceipt = {
    handle: async (file, reason = "save") => {
      if (!file) return false;
      lastReceiptFile = file;
      __userEditedAmount = false;
      setPreviewFromFile(file);
      return await tryExtractAndFill(file, reason);
    },
    getLastFile: () => lastReceiptFile,
    cancelOcr: async () => {
      try{ if(__ocrAbort) __ocrAbort.abort(); }catch{}
      try{ if(window.__sspTessWorker){ await window.__sspTessWorker.terminate(); window.__sspTessWorker=null; window.__sspTessReady=false; } }catch{}
      ocrInFlight = false;
      try{ setOcrStatus("OCR annullato"); }catch{}
    }
  };
})();

/* modal backdrop close */
document.addEventListener('click', (e)=>{
  const m = e.target && e.target.classList && e.target.classList.contains('modal') ? e.target : null;
  if(m){
    hideModal(m);
  }
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    hideAllModals();
  }
});

document.addEventListener("click",(e)=>{
  if(e.target && e.target.id==="btnClosePro"){
    hideModal("#modalPro");
  }
  if(e.target && e.target.id==="btnBuyPro"){
    // Placeholder: in APK/TWA we will call Google Play Billing bridge.
    // For now we allow a safe "demo unlock" toggle to test UI.
    setPro(true);
    hideModal("#modalPro");
    try{ toast("PRO attivato (demo) ✅", 1200); }catch(err){}
  }
});
document.addEventListener("DOMContentLoaded", ()=>{ renderProBadges(); });


/* ================================
   PDF IMPORT PHOTO-PERSIST FIX v4 (CHIRURGICO)
   Goal: after PDF import, the saved expense must include the receipt image (thumbnail),
   even if older "robust" handlers are in play.
   - Does NOT remove/alter other features.
   - Ensures window.__sspReceipt.file is set to the rendered image file
     so onSave() will always save photo.
   - Also triggers OCR safely.
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_PDF_PERSIST_V4) return;
  window.__SSP_PDF_PERSIST_V4 = true;

  const log = (...a)=>{ try{ console.log("[PDF PERSIST v4]", ...a); }catch(_){} };
  const toastSafe = (m)=>{ try{ if(typeof toast==="function") toast(m); }catch(_){ try{ alert(m);}catch(_){} } };

  function loadScriptOnce(src){
    window.__sspScripts = window.__sspScripts || {};
    if (window.__sspScripts[src]) return window.__sspScripts[src];
    window.__sspScripts[src] = new Promise((res, rej)=>{
      const s=document.createElement("script");
      s.src=src; s.async=true;
      s.onload=()=>res(true);
      s.onerror=()=>rej(new Error("Load failed: "+src));
      document.head.appendChild(s);
    });
    return window.__sspScripts[src];
  }

  async function ensurePdfJsReady(){
    if (window.pdfjsLib && window.__sspPdfReady) return true;
    if (!window.pdfjsLib){
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
    }
    if (!window.pdfjsLib) throw new Error("PDF.js missing");
    try{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }catch(_){}
    window.__sspPdfReady = true;
    return true;
  }

  async function pdfFirstPageToImageFile(pdfFile){
    await ensurePdfJsReady();
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.6 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha:false, willReadFrequently:true });
    canvas.width  = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((res)=> canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) throw new Error("Render PDF fallito");
    const name = String(pdfFile.name||"documento.pdf").replace(/\.pdf$/i,"") + ".jpg";
    return new File([blob], name, { type:"image/jpeg" });
  }

  // Dedicated input (never destroyed)
  function getInput(){
    let el = document.querySelector("#inPdf__persist_v4");
    if(!el){
      el=document.createElement("input");
      el.type="file";
      el.accept="application/pdf";
      el.id="inPdf__persist_v4";
      el.style.display="none";
      document.body.appendChild(el);
    }
    return el;
  }

  let busy=false;
  async function handlePdf(file){
    if(!file || busy) return;
    busy=true;
    try{
      toastSafe("Importo PDF…");
      const imgFile = await pdfFirstPageToImageFile(file);

      // ✅ CRITICAL: set receipt file so onSave() can persist photo
      window.__sspReceipt = window.__sspReceipt || {};
      window.__sspReceipt.file = imgFile;
      window.__sspReceipt.getLastFile = () => imgFile;

      // Preview (if UI has #photoPrevImg or #receiptPreview)
      try{
        const url = URL.createObjectURL(imgFile);
        const im = document.querySelector("#photoPreviewImg") || document.querySelector("#receiptPreview");
        const wrap = document.querySelector("#photoPreview");
        if(im){
          im.src = url;
          if(wrap) wrap.style.display = "block";
          else im.style.display = "";
        }
      }catch(_){}

      toastSafe("PDF importato ✅");

      // OCR (safe)
      try{
        if(typeof window.__sspReceipt.handle === "function"){
          await window.__sspReceipt.handle(imgFile, "pdf");
        }
      }catch(e){ log("OCR error", e); }
    }catch(err){
      log(err);
      toastSafe("PDF non valido / non leggibile");
    }finally{
      busy=false;
    }
  }

  const input = getInput();

  // Capture click on Importa PDF button (works even on inner icon/text)
  function onPdfBtn(e){
    const btn = e.target && e.target.closest ? e.target.closest("#btnReceiptPdf") : null;
    if(!btn) return;
    try{ input.value=""; }catch(_){}
    // Keep user-gesture: open picker immediately
    try{ input.click(); }catch(_){}
    // Prevent older buggy handlers from hijacking (but we do NOT stopImmediate for safety)
    try{ e.preventDefault(); }catch(_){}
  }

  document.addEventListener("click", onPdfBtn, true);

  input.addEventListener("change", async ()=>{
    const file = input.files && input.files[0];
    await handlePdf(file);
    try{ input.value=""; }catch(_){}
  });

  log("Ready ✅");
})();


/* ================================
   PDF THUMBNAIL GUARANTEE v5 (append-only)
   Fix: after PDF import, autosave sometimes saves without photo because __sspReceipt.file
   is lost/overwritten before btnSave click. This patch:
   - Stores last rendered PDF image in window.__sspPdfLastImageFile
   - Re-injects it into window.__sspReceipt.file right before any save click (capture)
   - Also re-injects on 'ssp:ocr-filled' just before autosave triggers
   No other features touched.
   ================================ */
(function(){
  "use strict";
  if(window.__SSP_PDF_THUMB_GUARANTEE_V5) return;
  window.__SSP_PDF_THUMB_GUARANTEE_V5 = true;

  const log=(...a)=>{try{console.log("[PDF THUMB v5]",...a)}catch(_){}};

  // Wrap any existing PDF import handler if present
  // If previous patches set __sspReceipt.file, we additionally persist it.
  function rememberFile(f){
    try{
      if(!f) return;
      window.__sspPdfLastImageFile = f;
      window.__sspReceipt = window.__sspReceipt || {};
      window.__sspReceipt.file = f;
      window.__sspReceipt.getLastFile = () => f;
    }catch(_){}
  }

  // Hook: if some pipeline exposes a callback, we try to patch it
  try{
    // If earlier patch defined pdfFirstPageToImageFile globally
    if(typeof window.pdfFirstPageToImageFile === "function"){
      const orig = window.pdfFirstPageToImageFile;
      window.pdfFirstPageToImageFile = async function(file){
        const out = await orig(file);
        rememberFile(out);
        return out;
      };
    }
  }catch(_){}

  // Capture save button click to guarantee file exists
  document.addEventListener("click", (e)=>{
    const btn = e.target && e.target.closest ? e.target.closest("#btnSave") : null;
    if(!btn) return;
    try{
      if(window.__sspPdfLastImageFile){
        window.__sspReceipt = window.__sspReceipt || {};
        if(!window.__sspReceipt.file){
          window.__sspReceipt.file = window.__sspPdfLastImageFile;
          window.__sspReceipt.getLastFile = () => window.__sspPdfLastImageFile;
          log("Re-injected receipt file before save");
        }
      }
    }catch(_){}
  }, true);

  // Also on OCR-filled, before autosave clicks save
  window.addEventListener("ssp:ocr-filled", ()=>{
    try{
      if(window.__sspPdfLastImageFile){
        window.__sspReceipt = window.__sspReceipt || {};
        if(!window.__sspReceipt.file){
          window.__sspReceipt.file = window.__sspPdfLastImageFile;
          window.__sspReceipt.getLastFile = () => window.__sspPdfLastImageFile;
          log("Re-injected receipt file on ocr-filled");
        }
      }
    }catch(_){}
  }, {passive:true});

  // If a PDF import patch stored file elsewhere, try to sync periodically for a short time
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    try{
      const f = window.__sspReceipt && window.__sspReceipt.file;
      if(f) rememberFile(f);
    }catch(_){}
    if(tries>20) try{clearInterval(t)}catch(_){}
  }, 500);

})();
/* ================================
   MULTI BATCH IMPORT v1 (CHIRURGICO, APPEND-ONLY)
   Goal:
   - Select multiple PHOTOS or multiple PDF in ONE picker open
   - App processes them ALL sequentially (no re-open), creating entries and showing them in Home automatically.
   - A prova di bug: guards against duplicate processing, continues on errors, never touches other features.
   How it works:
   - Forces multiple=true on the existing photo/pdf inputs (if present).
   - Intercepts ONLY multi-selection change events (files.length>1) in CAPTURE phase.
   - Runs a sequential queue:
        photo -> feed to existing pipeline (__sspReceipt.handle / handleReceiptOCR)
        pdf   -> converts page1 -> image then feeds pipeline
   - Triggers safe UI refresh after each item.
   Notes:
   - Requires your existing single-file flow to be working (it is).
   - Does NOT change your "single file" behavior.
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_MULTI_BATCH_V1) return;
  window.__SSP_MULTI_BATCH_V1 = true;

  const log = (...a)=>{ try{ console.log("[MULTI BATCH v1]", ...a); }catch(_){} };

  const toastSafe = (m, ms)=>{
    try{
      if(typeof toast === "function") toast(m, ms||1400);
      else console.log(m);
    }catch(_){}
  };

  // ---------- ensure inputs allow multiple
  function forceMultiInputs(){
    try{
      const inputs = document.querySelectorAll("input[type='file']");
      inputs.forEach(inp=>{
        const acc = String(inp.accept||"").toLowerCase();
        if(acc.includes("image") || acc.includes("pdf")){
          inp.multiple = true;
        }
      });

      // known ids (best effort)
      ["inPhoto__stable_v1","inPhoto__oneTap_v2","inPhoto","inPhotoCam","inReceiptPhoto"].forEach(id=>{
        const el = document.getElementById(id);
        if(el && el.type==="file"){ el.multiple = true; if(!String(el.accept||"").toLowerCase().includes("image")) el.accept="image/*"; }
      });
      ["inPdf__stable_v1","inPdf__multi_v2","inPdf","inReceiptPdf"].forEach(id=>{
        const el = document.getElementById(id);
        if(el && el.type==="file"){ el.multiple = true; if(!String(el.accept||"").toLowerCase().includes("pdf")) el.accept="application/pdf"; }
      });
    }catch(_){}
  }
  document.addEventListener("DOMContentLoaded", forceMultiInputs);
  setTimeout(forceMultiInputs, 700);
  setTimeout(forceMultiInputs, 2000);

  // ---------- pdf helpers
  function loadScriptOnce(src){
    window.__sspScripts = window.__sspScripts || {};
    if(window.__sspScripts[src]) return window.__sspScripts[src];
    window.__sspScripts[src] = new Promise((res, rej)=>{
      const s=document.createElement("script");
      s.src=src; s.async=true;
      s.onload=()=>res(true);
      s.onerror=()=>rej(new Error("Load failed: "+src));
      document.head.appendChild(s);
    });
    return window.__sspScripts[src];
  }
  async function ensurePdfJsReady(){
    if(window.pdfjsLib && window.__sspPdfReady) return true;
    if(!window.pdfjsLib){
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
    }
    if(!window.pdfjsLib) throw new Error("PDF.js missing");
    try{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }catch(_){}
    window.__sspPdfReady = true;
    return true;
  }
  function isPdfFile(f){
    const name = String(f?.name||"").toLowerCase();
    return f?.type === "application/pdf" || name.endsWith(".pdf");
  }
  function isImageFile(f){
    return String(f?.type||"").startsWith("image/");
  }
  async function pdfFirstPageToImage(pdfFile){
    if(typeof window.__sspPdfFirstPageToPngFile === "function"){
      return await window.__sspPdfFirstPageToPngFile(pdfFile);
    }
    if(typeof window.__sspPdfFirstPageToImageFile === "function"){
      return await window.__sspPdfFirstPageToImageFile(pdfFile);
    }
    await ensurePdfJsReady();
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.6 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha:false, willReadFrequently:true });
    canvas.width  = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((res)=>canvas.toBlob(res, "image/jpeg", 0.92));
    if(!blob) throw new Error("PDF render failed");
    const name = String(pdfFile.name||"documento.pdf").replace(/\.pdf$/i,"") + ".jpg";
    return new File([blob], name, { type:"image/jpeg" });
  }

  // ---------- preview + pipeline
  async function showPreview(file){
    try{
      const url = URL.createObjectURL(file);
      const im = document.querySelector("#photoPreviewImg") || document.querySelector("#receiptPreview");
      const wrap = document.querySelector("#photoPreview");
      if(im){
        im.src = url;
        if(wrap) wrap.style.display="block";
        else im.style.display="";
      }
    }catch(_){}
  }

  async function runPipeline(file, kind){
    // Put into the app's expected holder
    window.__sspReceipt = window.__sspReceipt || {};
    window.__sspReceipt.file = file;
    window.__sspReceipt.getLastFile = ()=>file;
    if(kind === "pdf") window.__sspPdfLastImageFile = file;

    await showPreview(file);

    if(window.__sspReceipt && typeof window.__sspReceipt.handle === "function"){
      await window.__sspReceipt.handle(file, kind);
      return true;
    }
    if(typeof window.handleReceiptOCR === "function"){
      await window.handleReceiptOCR(file);
      return true;
    }
    return false;
  }

  function refreshUI(){
    try{
      if(typeof window.__sspForceRefresh === "function") { window.__sspForceRefresh(); return; }
    }catch(_){}
    try{ if(typeof window.renderHome==="function") window.renderHome(); }catch(_){}
    try{ if(typeof window.renderArchive==="function") window.renderArchive(); }catch(_){}
    try{ if(typeof window.renderReport==="function") window.renderReport(); }catch(_){}
    try{ if(typeof window.renderAll==="function") window.renderAll(); }catch(_){}
    try{ if(typeof window.refreshUI==="function") window.refreshUI(); }catch(_){}
    try{ if(typeof window.updateHome==="function") window.updateHome(); }catch(_){}
  }

  // ---------- queue with duplicate guard
  window.__sspMultiProcessedKeys = window.__sspMultiProcessedKeys || {};
  function fileKey(f){
    try{ return [f.name||"", f.size||0, f.lastModified||0, f.type||""].join("::"); }catch(_){ return String(Math.random()); }
  }

  let busy = false;
  async function processBatch(files){
    if(busy) { toastSafe("Elaborazione già in corso…"); return; }
    busy = true;
    try{
      const arr = Array.from(files||[]);
      if(!arr.length) return;

      // detect batch type mix and normalize per file
      const total = arr.length;
      toastSafe(`Elaboro ${total} file…`);

      for(let i=0;i<total;i++){
        const f = arr[i];
        const key = fileKey(f);
        if(window.__sspMultiProcessedKeys[key]) continue;
        window.__sspMultiProcessedKeys[key] = true;

        try{
          if(isPdfFile(f)){
            toastSafe(`Elaboro ${i+1}/${total} (PDF)…`, 1200);
            const img = await pdfFirstPageToImage(f);
            await runPipeline(img, "pdf");
          }else if(isImageFile(f)){
            toastSafe(`Elaboro ${i+1}/${total} (foto)…`, 1200);
            await runPipeline(f, "photo");
          }else{
            // skip unknown
          }
          // Give the app a moment to autosave + render, then refresh UI
          await new Promise(r=>setTimeout(r, 250));
          refreshUI();
          await new Promise(r=>setTimeout(r, 200));
        }catch(err){
          log("batch item error", err);
          // allow re-try for that file if needed
          try{ delete window.__sspMultiProcessedKeys[key]; }catch(_){}
        }
      }

      toastSafe("Batch completato ✅");
      refreshUI();
    } finally {
      busy = false;
    }
  }

  // ---------- intercept only MULTI selections, so single-file flow stays untouched
  /* LEGACY MULTI INTERCEPT DISABLED
  document.addEventListener("change", (e)=>{
    const t = e.target;
    if(!t || t.tagName !== "INPUT" || t.type !== "file") return;
    const files = t.files;
    if(!files || files.length <= 1) return;

    // If user selected multiple, we handle it and block other change handlers for this event
    try{ e.stopImmediatePropagation(); }catch(_){}
    try{ e.stopPropagation(); }catch(_){}

    // IMPORTANT: do NOT reopen picker; just process.
    processBatch(files);

    // reset input so next batch can select same files again
    setTimeout(()=>{ try{ t.value=""; }catch(_){ } }, 120);
  }, true) */;

  log("Ready ✅");
})();
/* ================================
   MULTI BATCH IMPORT v2 (DEFINITIVO, CHIRURGICO, APPEND-ONLY)
   Fix: user can select multiple files, but only the FIRST gets saved.
   Cause: Auto-salva only runs when the Add modal is OPEN; after first save the modal closes,
          subsequent files were processed with modal closed => no autosave => no new entries.
   Solution:
   - When a multi-selection happens (files.length>1), we:
       * process files sequentially
       * for EACH file: openAdd() to open modal, run OCR pipeline, then wait for autosave/save to close modal
       * then continue to next file (no picker re-open)
   Safety:
   - Does NOT modify existing features
   - Works even if autosave is OFF (fallback clicks Save when fields are valid)
   - Continues on errors, never blocks app
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_MULTI_BATCH_V2) return;
  window.__SSP_MULTI_BATCH_V2 = true;

  const log = (...a)=>{ try{ console.log("[MULTI BATCH v2]", ...a); }catch(_){} };
  const toastSafe = (m, ms)=>{ try{ if(typeof toast==="function") toast(m, ms||1400); }catch(_){ } };

  const $ = (s)=>document.querySelector(s);

  // ---- ensure multi is enabled on inputs
  function forceMultiInputs(){
    try{
      document.querySelectorAll("input[type='file']").forEach(inp=>{
        const acc = String(inp.accept||"").toLowerCase();
        if(acc.includes("image") || acc.includes("pdf")) inp.multiple = true;
      });
    }catch(_){}
  }
  document.addEventListener("DOMContentLoaded", forceMultiInputs);
  setTimeout(forceMultiInputs, 800);
  setTimeout(forceMultiInputs, 2000);

  // ---- pdf helpers
  function loadScriptOnce(src){
    window.__sspScripts = window.__sspScripts || {};
    if(window.__sspScripts[src]) return window.__sspScripts[src];
    window.__sspScripts[src] = new Promise((res, rej)=>{
      const s=document.createElement("script");
      s.src=src; s.async=true;
      s.onload=()=>res(true);
      s.onerror=()=>rej(new Error("Load failed: "+src));
      document.head.appendChild(s);
    });
    return window.__sspScripts[src];
  }
  async function ensurePdfJsReady(){
    if(window.pdfjsLib && window.__sspPdfReady) return true;
    if(!window.pdfjsLib){
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
    }
    if(!window.pdfjsLib) throw new Error("PDF.js missing");
    try{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }catch(_){}
    window.__sspPdfReady = true;
    return true;
  }
  function isPdfFile(f){
    const name = String(f?.name||"").toLowerCase();
    return f?.type === "application/pdf" || name.endsWith(".pdf");
  }
  function isImageFile(f){
    return String(f?.type||"").startsWith("image/");
  }
  async function pdfFirstPageToImage(pdfFile){
    if(typeof window.__sspPdfFirstPageToPngFile === "function"){
      return await window.__sspPdfFirstPageToPngFile(pdfFile);
    }
    if(typeof window.__sspPdfFirstPageToImageFile === "function"){
      return await window.__sspPdfFirstPageToImageFile(pdfFile);
    }
    await ensurePdfJsReady();
    const buf = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.6 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha:false, willReadFrequently:true });
    canvas.width  = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((res)=>canvas.toBlob(res, "image/jpeg", 0.92));
    if(!blob) throw new Error("PDF render failed");
    const name = String(pdfFile.name||"documento.pdf").replace(/\.pdf$/i,"") + ".jpg";
    return new File([blob], name, { type:"image/jpeg" });
  }

  // ---- wait helpers
  function modalIsOpen(){
    const m = $("#modalAdd");
    return !!(m && m.classList && m.classList.contains("show"));
  }
  async function waitUntil(cond, timeoutMs){
    const t0 = Date.now();
    while(Date.now() - t0 < timeoutMs){
      if(cond()) return true;
      await new Promise(r=>setTimeout(r, 120));
    }
    return false;
  }
  function amountOk(){
    const el = $("#inAmount");
    if(!el) return false;
    const v = String(el.value||"").trim().replace(".", "").replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }
  function dateOk(){
    const el = $("#inDate");
    return !!(el && String(el.value||"").trim());
  }

  async function runOcrWithFile(file, kind){
    // attach for save pipeline
    window.__sspReceipt = window.__sspReceipt || {};
    window.__sspReceipt.file = file;
    window.__sspReceipt.getLastFile = ()=>file;
    if(kind === "pdf") window.__sspPdfLastImageFile = file;

    if(window.__sspReceipt && typeof window.__sspReceipt.handle === "function"){
      await window.__sspReceipt.handle(file, kind === "pdf" ? "batch-pdf" : "batch-photo");
      return true;
    }
    if(typeof window.handleReceiptOCR === "function"){
      await window.handleReceiptOCR(file);
      return true;
    }
    return false;
  }

  async function ensureSavedOrFallback(){
    // Wait for autosave to close modal
    const closed = await waitUntil(()=>!modalIsOpen(), 8000);
    if(closed) return true;

    // Autosave might be OFF -> click save when valid
    if(amountOk() && dateOk()){
      const b = $("#btnSave");
      if(b) b.click();
      const closed2 = await waitUntil(()=>!modalIsOpen(), 8000);
      return closed2;
    }
    // If still not valid, user probably needs to edit; leave modal open
    return false;
  }

  // ---- batch core
  let busy = false;
  window.__sspMultiProcessedKeys = window.__sspMultiProcessedKeys || {};
  function fileKey(f){
    try{ return [f.name||"", f.size||0, f.lastModified||0, f.type||""].join("::"); }catch(_){ return String(Math.random()); }
  }

  async function processBatch(files){
    if(busy){ toastSafe("Elaborazione già in corso…"); return; }
    busy = true;
    try{
      const arr = Array.from(files||[]);
      const total = arr.length;
      toastSafe(`Batch: ${total} file…`);

      for(let i=0;i<total;i++){
        const raw = arr[i];
        const key = fileKey(raw);
        if(window.__sspMultiProcessedKeys[key]) continue;

        window.__sspMultiProcessedKeys[key] = true;
        try{
          // Open modal for THIS item (autosave requires it)
          if(typeof window.openAdd === "function") window.openAdd();
          await waitUntil(modalIsOpen, 2000);

          toastSafe(`File ${i+1}/${total}…`);

          if(isPdfFile(raw)){
            const img = await pdfFirstPageToImage(raw);
            await runOcrWithFile(img, "pdf");
          }else if(isImageFile(raw)){
            await runOcrWithFile(raw, "photo");
          }else{
            continue;
          }

          // Now wait for save (autosave or fallback)
          const saved = await ensureSavedOrFallback();
          if(!saved){
            // if not saved, stop the batch so user can fix fields
            toastSafe("Completa i campi e salva, poi riprendi il batch.");
            break;
          }

          // small pause to let Home refresh
          await new Promise(r=>setTimeout(r, 250));
          try{ if(typeof window.renderHome==="function") window.renderHome(); }catch(_){}
        }catch(err){
          log("item error", err);
          try{ delete window.__sspMultiProcessedKeys[key]; }catch(_){}
        }
      }

      toastSafe("Batch completato ✅");
      try{ if(typeof window.renderHome==="function") window.renderHome(); }catch(_){}
    } finally {
      busy = false;
    }
  }

  // ---- intercept multi-selection change events
  document.addEventListener("change", (e)=>{
    const t = e.target;
    if(!t || t.tagName !== "INPUT" || t.type !== "file") return;
    const files = t.files;
    if(!files || files.length <= 1) return;

    // Handle multi; prevent other handlers from conflicting for THIS event.
    try{ e.stopImmediatePropagation(); }catch(_){}
    try{ e.stopPropagation(); }catch(_){}

    processBatch(files);

    // reset input so same files can be selected again
    setTimeout(()=>{ try{ t.value=""; }catch(_){ } }, 150);
  }, true);

  log("Ready ✅");
})();
/* ================================
   MULTI BATCH PROGRESS UI v1 (APPEND-ONLY)
   Adds a small progress overlay during multi-batch import (works with MULTI BATCH v2).
   - Shows current file index/total and kind
   - Provides a cancel button (stops after current item)
   - Does NOT touch other features.
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_BATCH_PROGRESS_UI_V1) return;
  window.__SSP_BATCH_PROGRESS_UI_V1 = true;

  const log = (...a)=>{ try{ console.log("[BATCH UI]", ...a); }catch(_){} };

  // state
  window.__sspBatchProgress = window.__sspBatchProgress || { active:false, i:0, total:0, label:"", cancel:false };

  function ensureOverlay(){
    let ov = document.getElementById("sspBatchOverlay");
    if(ov) return ov;

    ov = document.createElement("div");
    ov.id = "sspBatchOverlay";
    ov.style.cssText = [
      "position:fixed",
      "left:12px",
      "right:12px",
      "bottom:12px",
      "z-index:99999",
      "background:rgba(20,20,22,.95)",
      "color:#fff",
      "border:1px solid rgba(255,255,255,.12)",
      "border-radius:16px",
      "padding:12px 14px",
      "box-shadow:0 10px 26px rgba(0,0,0,.35)",
      "display:none",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"
    ].join(";");

    ov.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1">
          <div id="sspBatchTitle" style="font-weight:800;font-size:14px;line-height:1.2">Elaborazione…</div>
          <div id="sspBatchSub" style="opacity:.9;font-size:12px;margin-top:4px">—</div>
          <div style="height:8px;background:rgba(255,255,255,.12);border-radius:999px;margin-top:10px;overflow:hidden">
            <div id="sspBatchBar" style="height:100%;width:0%;background:rgba(255,255,255,.75)"></div>
          </div>
        </div>
        <button id="sspBatchCancel" type="button" style="
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.08);
          color:#fff;
          padding:10px 12px;
          border-radius:12px;
          font-weight:800;
          cursor:pointer;
        ">Stop</button>
      </div>
    `;
    document.body.appendChild(ov);

    const btn = ov.querySelector("#sspBatchCancel");
    btn.addEventListener("click", ()=>{
      try{
        window.__sspBatchProgress.cancel = true;
        ov.querySelector("#sspBatchSub").textContent = "Stop richiesto… finisco il file corrente.";
      }catch(_){}
    });

    return ov;
  }

  function show(i, total, label){
    const ov = ensureOverlay();
    const title = ov.querySelector("#sspBatchTitle");
    const sub = ov.querySelector("#sspBatchSub");
    const bar = ov.querySelector("#sspBatchBar");
    const pct = total ? Math.round((i/total)*100) : 0;

    title.textContent = `Batch: ${i}/${total}`;
    sub.textContent = label || "—";
    bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    ov.style.display = "block";
  }

  function hide(){
    const ov = document.getElementById("sspBatchOverlay");
    if(ov) ov.style.display = "none";
  }

  // Expose helpers for batch runner
  window.__sspBatchUI = window.__sspBatchUI || {};
  window.__sspBatchUI.show = show;
  window.__sspBatchUI.hide = hide;
  window.__sspBatchUI.resetCancel = ()=>{ window.__sspBatchProgress.cancel = false; };

  log("Ready ✅");
})();
/* ================================
   SIMPLE MODE: KEEP MULTI IMPORT v1 (APPEND-ONLY)
   Use with patch_simple_mode_v1.js
   - Ensures in Modalità semplice, multi photo/pdf import buttons stay visible.
   - Does not modify any logic.
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_SIMPLE_MODE_ALLOW_MULTI_V1) return;
  window.__SSP_SIMPLE_MODE_ALLOW_MULTI_V1 = true;

  function inject(){
    if(document.getElementById("sspSimpleAllowMultiCss")) return;
    const css = document.createElement("style");
    css.id = "sspSimpleAllowMultiCss";
    css.textContent = `
      /* In modalità semplice, NON nascondere i bottoni multi */
      body.ssp-simple #btnReceiptPdfMulti,
      body.ssp-simple #btnImportPdfMulti,
      body.ssp-simple #btnImportZipMulti
      { display:inline-flex !important; }

      /* Se hai un bottone multi-foto dedicato, lascialo visibile */
      body.ssp-simple #btnReceiptGalleryMulti,
      body.ssp-simple #btnPhotoMulti
      { display:inline-flex !important; }
    `;
    document.head.appendChild(css);
  }

  document.addEventListener("DOMContentLoaded", inject);
  setTimeout(inject, 600);
})();
/* ================================
   MODALITÀ SEMPLICE v2 (CHIRURGICO, VISIBILE, AUTO-MARK)
   Fix: toggle non evidente / elementi non marcati.
   - Toggle card in Impostazioni (sempre visibile)
   - Mini toggle flottante (sopra la barra in basso)
   - Auto-nasconde voci barra: Archivio + Report + Impostazioni
   - Nasconde blocchi avanzati nelle impostazioni (OCR/endpoint/backup ecc.) in best-effort
   - NON cambia logica: solo UI hide/show
   Persist: localStorage __sspSimpleMode = "1"/"0"
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_SIMPLE_MODE_V2) return;
  window.__SSP_SIMPLE_MODE_V2 = true;

  const LS_KEY="__sspSimpleMode";
  const getOn=()=>{ try{return localStorage.getItem(LS_KEY)==="1";}catch(_){return false;} };
  const setOn=(v)=>{
    try{ localStorage.setItem(LS_KEY, v?"1":"0"); }catch(_){}
    apply();
    try{ if(typeof toast==="function") toast(v?"Modalità semplice: ON":"Modalità semplice: OFF"); }catch(_){}
  };

  function apply(){
    try{
      document.body.classList.toggle("ssp-simple", getOn());
      // Nasconde elementi avanzati anche se non marcati
      try{
        const on = getOn();
        const ep = document.getElementById("ocrEndpointInput");
        if(ep){
          const row = ep.closest(".formRow") || ep.parentElement;
          if(row) row.style.display = on ? "none" : "";
        }
      }catch(_){}

      const chk=document.getElementById("sspSimpleChkV2");
      if(chk) chk.checked=getOn();
      const fab=document.getElementById("sspSimpleFabV2");
      if(fab) fab.textContent=getOn()?"Semplice ON":"Semplice OFF";
    }catch(_){}
  }

  function injectCss(){
    if(document.getElementById("sspSimpleCssV2")) return;
    const s=document.createElement("style");
    s.id="sspSimpleCssV2";
    s.textContent=`
      body.ssp-simple [data-adv="1"]{ display:none !important; }
      body.ssp-simple .ssp-adv-block{ display:none !important; }

      /* NAV/PAGINE: modalità semplice = solo Home + Camera */
      body.ssp-simple .bottomNav .navBtn[data-nav="archive"],
      body.ssp-simple .bottomNav .navBtn[data-nav="report"],
      body.ssp-simple .bottomNav .navBtn[data-nav="settings"]{ display:none !important; }

      body.ssp-simple .page[data-page="archive"],
      body.ssp-simple .page[data-page="report"]{ display:none !important; }

      body.ssp-simple #fabAdd{ display:none !important; } /* resta solo 📷 */

      /* Impostazioni: nasconde endpoint (avanzato) */
      body.ssp-simple #ocrEndpointInput{ display:none !important; }
      body.ssp-simple #ocrEndpointInput + *{ display:none !important; }

      #sspSimpleFabV2{
        position:fixed; right:12px; bottom:86px; z-index:99999;
        padding:10px 12px; border-radius:14px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(30,30,34,.92);
        color:#fff; font-weight:900;
      }
    `;
    document.head.appendChild(s);
  }

  function markBottomNav(){
    try{
      const nav = document.querySelector("nav") || document.querySelector(".bottom-nav") || document.querySelector(".tabbar") || document.body;
      const candidates = nav.querySelectorAll("a,button,div");
      candidates.forEach(el=>{
        const t=(el.textContent||"").trim().toLowerCase();
        if(!t) return;
        if(t==="archivio" || t==="report" || t==="impostazioni"){
          el.dataset.adv="1";
        }
      });
    }catch(_){}
  }

  function markAdvancedSettings(){
    try{
      const settingsPage =
        document.querySelector("#pageSettings") ||
        document.querySelector("#tabSettings") ||
        document.querySelector("#settings") ||
        document.querySelector("[data-page='settings']") ||
        document.querySelector("main") ||
        document.body;

      const keywords = ["api key","endpoint","ocr","test chiave","modalità ocr","backup","reset dati app","esporta","importa"];
      settingsPage.querySelectorAll("section,div,article").forEach(block=>{
        const txt=(block.textContent||"").toLowerCase();
        if(!txt || txt.length<10) return;
        if(keywords.some(k=>txt.includes(k))){
          if(txt.includes("lingua") || txt.includes("salva impostazioni")) return;
          block.classList.add("ssp-adv-block");
        }
      });
    }catch(_){}
  }

  function ensureToggleCard(){
    try{
      if(document.getElementById("sspSimpleCardV2")) return;

      const settings =
        document.querySelector("#pageSettings") ||
        document.querySelector("#tabSettings") ||
        document.querySelector("#settings") ||
        document.querySelector("[data-page='settings']");

      if(!settings) return;

      const card=document.createElement("div");
      card.id="sspSimpleCardV2";
      card.style.cssText="margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(255,255,255,.04);";
      card.innerHTML=`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:900">Modalità semplice</div>
            <div style="opacity:.8;font-size:12px;margin-top:4px">Mostra solo funzioni essenziali. Nasconde funzioni avanzate.</div>
          </div>
          <label style="display:flex;align-items:center;gap:10px;font-weight:900">
            <input id="sspSimpleChkV2" type="checkbox" style="transform:scale(1.2)">
            <span>ON</span>
          </label>
        </div>
      `;
      settings.prepend(card);

      const chk=card.querySelector("#sspSimpleChkV2");
      chk.checked=getOn();
      chk.addEventListener("change", ()=>setOn(chk.checked));
    }catch(_){}
  }

  function ensureFab(){
    try{
      if(document.getElementById("sspSimpleFabV2")) return;
      const b=document.createElement("button");
      b.id="sspSimpleFabV2";
      b.type="button";
      b.textContent=getOn()?"Semplice ON":"Semplice OFF";
      b.addEventListener("click", ()=>setOn(!getOn()));
      document.body.appendChild(b);
    }catch(_){}
  }

  function boot(){
    injectCss();
    ensureFab();
    ensureToggleCard();
    markBottomNav();
    markAdvancedSettings();
    apply();
  }

  document.addEventListener("DOMContentLoaded", boot);
  setTimeout(boot, 700);
  setTimeout(boot, 2000);

  window.__sspSetSimpleMode=setOn;
})();
/* ================================
   SIMPLE MODE BUTTON FIX v1 (CHIRURGICO, APPEND-ONLY)
   Fix: pulsante flottante "Semplice ON/OFF" non prende input (tap) su Chrome.
   Solution:
   - Force pointer-events:auto + touch-action
   - Max z-index + new layer
   - Rebind handlers (click + touchend) in capture phase
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_SIMPLE_BTN_FIX_V1) return;
  window.__SSP_SIMPLE_BTN_FIX_V1 = true;

  const LS_KEY="__sspSimpleMode";
  const getOn=()=>{ try{return localStorage.getItem(LS_KEY)==="1";}catch(_){return false;} };
  const setOn=(v)=>{
    try{ localStorage.setItem(LS_KEY, v?"1":"0"); }catch(_){}
    try{ document.body.classList.toggle("ssp-simple", v); }catch(_){}
    try{
      const fab=document.getElementById("sspSimpleFabV2");
      if(fab) fab.textContent=v?"Semplice ON":"Semplice OFF";
      const chk=document.getElementById("sspSimpleChkV2");
      if(chk) chk.checked=v;
    }catch(_){}
    try{ if(typeof toast==="function") toast(v?"Modalità semplice: ON":"Modalità semplice: OFF"); }catch(_){}
  };

  function hardenFab(){
    const fab = document.getElementById("sspSimpleFabV2");
    if(!fab || !fab.parentNode) return;

    // Always tappable
    fab.style.pointerEvents = "auto";
    fab.style.touchAction = "manipulation";
    fab.style.userSelect = "none";
    fab.style.webkitUserSelect = "none";
    fab.style.zIndex = "2147483647";
    fab.style.transform = "translateZ(0)";
    fab.style.webkitTransform = "translateZ(0)";
    fab.style.position = "fixed";

    // Replace node to drop any broken listeners
    const clone = fab.cloneNode(true);
    fab.parentNode.replaceChild(clone, fab);

    const handler = (ev)=>{
      try{ ev.preventDefault(); }catch(_){}
      try{ ev.stopPropagation(); }catch(_){}
      try{ ev.stopImmediatePropagation(); }catch(_){}
      setOn(!getOn());
      return false;
    };

    // Capture beats overlay handlers
    clone.addEventListener("click", handler, true);
    clone.addEventListener("touchend", handler, {capture:true, passive:false});
  }

  document.addEventListener("DOMContentLoaded", ()=>setTimeout(hardenFab, 50));
  setTimeout(hardenFab, 600);
  setTimeout(hardenFab, 2000);
})();
/* ================================
   HOTFIX v1: (A) SIMPLE BUTTON INPUT + (B) OCR IMPORTO "VALE EUR" PRIORITY
   CHIRURGICO / APPEND-ONLY: non rimuove funzioni esistenti.
   A) Bottone "Semplice ON/OFF" non prende input:
      - aggiunge un listener globale in capture che intercetta tap dentro il rettangolo del bottone
      - forza pointer-events e sposta leggermente il bottone sopra la navbar
   B) OCR: su scontrini/buoni CRAI prende 30€ (spesa minima) invece di 5€ (VALE EUR 5.00)
      - aggiunge una funzione di "post-fix" dell'importo: se trova "VALE EUR" usa quello come importo
      - fallback: ignora "SPESA MINIMA" e simili
   ================================ */
(function(){
  "use strict";
  if (window.__SSP_HOTFIX_SIMPLEBTN_OCR_V1) return;
  window.__SSP_HOTFIX_SIMPLEBTN_OCR_V1 = true;

  /* ----------------
     A) SIMPLE BUTTON INPUT
     ---------------- */
  const LS_KEY="__sspSimpleMode";
  const getOn=()=>{ try{return localStorage.getItem(LS_KEY)==="1";}catch(_){return false;} };
  const setOn=(v)=>{
    try{ localStorage.setItem(LS_KEY, v?"1":"0"); }catch(_){}
    try{ document.body.classList.toggle("ssp-simple", v); }catch(_){}
    try{
      const fab=document.getElementById("sspSimpleFabV2");
      if(fab) fab.textContent=v?"Semplice ON":"Semplice OFF";
      const chk=document.getElementById("sspSimpleChkV2");
      if(chk) chk.checked=v;
    }catch(_){}
    try{ if(typeof toast==="function") toast(v?"Modalità semplice: ON":"Modalità semplice: OFF"); }catch(_){}
  };

  function hardenFab(){
    const fab = document.getElementById("sspSimpleFabV2");
    if(!fab) return;

    // keep above nav and tappable
    fab.style.pointerEvents = "auto";
    fab.style.touchAction = "manipulation";
    fab.style.userSelect = "none";
    fab.style.webkitUserSelect = "none";
    fab.style.zIndex = "2147483647";
    fab.style.position = "fixed";
    // lift it more to avoid bottom bars overlays
    try{
      const nav = document.querySelector("nav") || document.querySelector(".bottom-nav") || document.querySelector(".tabbar");
      const navH = nav ? nav.getBoundingClientRect().height : 70;
      fab.style.bottom = (navH + 18) + "px";
      fab.style.right = "12px";
    }catch(_){}

    // mark for global hit-test
    fab.dataset.sspHit="1";
  }

  // Global capture hit-test (works even if an overlay steals the tap)
  function globalTapCapture(ev){
    try{
      const fab = document.getElementById("sspSimpleFabV2");
      if(!fab) return;
      const r = fab.getBoundingClientRect();
      const x = ("changedTouches" in ev && ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0].clientX : ev.clientX;
      const y = ("changedTouches" in ev && ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0].clientY : ev.clientY;
      if(x==null || y==null) return;

      const inside = x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
      if(!inside) return;

      // If user tapped in button area, toggle no matter what
      ev.preventDefault?.();
      ev.stopPropagation?.();
      ev.stopImmediatePropagation?.();
      setOn(!getOn());
    }catch(_){}
  }

  document.addEventListener("pointerup", globalTapCapture, true);
  document.addEventListener("touchend", globalTapCapture, {capture:true, passive:false});
  document.addEventListener("click", globalTapCapture, true);

  document.addEventListener("DOMContentLoaded", ()=>setTimeout(hardenFab, 50));
  setTimeout(hardenFab, 800);
  setTimeout(hardenFab, 2000);

  /* ----------------
     B) OCR IMPORTO FIX (VALE EUR priority)
     ---------------- */
  function parseEuroNumber(s){
    if(!s) return null;
    let t = String(s).trim();
    // normalize: remove spaces and currency
    t = t.replace(/\s/g,"").replace(/[€]/g,"");
    // accept 5,00 or 5.00 or 5
    // If both . and , exist, assume . thousands and , decimals -> remove dots
    if(t.includes(",") && t.includes(".")) t = t.replace(/\./g,"");
    // convert comma to dot
    t = t.replace(",", ".");
    const n = Number(t);
    if(!Number.isFinite(n)) return null;
    return n;
  }

  function findValeEur(text){
    const T = String(text||"");
    // typical lines: "VALE EUR 5.00" or "VALE EUR 5,00"
    const m = T.match(/VALE\s*EUR\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/i);
    if(m){
      const n = parseEuroNumber(m[1]);
      if(n!=null && n>0) return n;
    }
    return null;
  }

  function looksLikeSpesaMinimaContext(text, amountStrIndex){
    // avoid picking amounts near "SPESA MINIMA"
    const T = String(text||"").toUpperCase();
    const windowStart = Math.max(0, amountStrIndex-40);
    const windowEnd = Math.min(T.length, amountStrIndex+40);
    const around = T.slice(windowStart, windowEnd);
    return around.includes("SPESA MINIMA") || around.includes("MINIMA DI") || around.includes("MINIMO");
  }

  function bestAmountFromText(text){
    const T = String(text||"");
    const vale = findValeEur(T);
    if(vale!=null) return vale;

    // Otherwise pick first "TOTAL" like patterns, and ignore spesa minima
    // Common Italian: "TOTALE", "IMPORTO", "EURO", "TOT"
    const candidates = [];
    const re = /([0-9]{1,6}(?:[.,][0-9]{1,2})?)/g;
    let m;
    while((m = re.exec(T)) !== null){
      const idx = m.index;
      if(looksLikeSpesaMinimaContext(T, idx)) continue;
      const n = parseEuroNumber(m[1]);
      if(n==null || n<=0) continue;
      // heuristic: prefer reasonable receipt values <= 2000
      if(n>20000) continue;
      candidates.push(n);
    }
    if(!candidates.length) return null;

    // Choose the smallest >0 if there is a voucher-like receipt? No.
    // Choose the most frequent or last? We'll choose the last numeric that isn't spesa minima
    return candidates[candidates.length-1];
  }

  // Hook point: if app exposes last OCR text + amount setter, fix it
  // We do this as a "post-processing" wrapper of existing OCR result handler, without touching internals.
  function installOcrPostFix(){
    if(window.__sspOcrPostFixInstalled) return;
    window.__sspOcrPostFixInstalled = true;

    // Wrap a known function if present
    const fnNames = [
      "applyOcrToForm",
      "onOcrResult",
      "handleOcrResult",
      "fillFromOcrText"
    ];

    for(const name of fnNames){
      const orig = window[name];
      if(typeof orig === "function" && !orig.__sspWrapped){
        window[name] = function(...args){
          const res = orig.apply(this, args);
          try{
            // Try locate OCR text from args
            const textArg = args.find(a => typeof a === "string" && a.length>20) || "";
            const fixed = bestAmountFromText(textArg);
            if(fixed!=null){
              // Try set amount input
              const inp = document.querySelector("#amount, #importo, input[name='amount'], input[name='importo'], input[data-field='amount']");
              if(inp){
                // format with comma
                const v = fixed.toFixed(2).replace(".", ",");
                inp.value = v;
                inp.dispatchEvent(new Event("input", {bubbles:true}));
                inp.dispatchEvent(new Event("change", {bubbles:true}));
              }
            }
          }catch(_){}
          return res;
        };
        window[name].__sspWrapped = true;
      }
    }

    // Also, if app stores last OCR text somewhere, expose helper
    window.__sspBestAmountFromText = bestAmountFromText;
  }

  document.addEventListener("DOMContentLoaded", ()=>setTimeout(installOcrPostFix, 200));
  setTimeout(installOcrPostFix, 1200);
})();

/* ================================
   HOTFIX v2: (A) SIMPLE TOGGLE INSTANT + NO DOUBLE TAP  (B) AUTO-SAVE PHOTO IN SIMPLE MODE
   - Fix: il bottone "Semplice ON/OFF" a volte risponde lento o non subito.
     Causa: più listener (click/touch/capture) + scansioni DOM ad ogni toggle.
     Soluzione: usa POINTERDOWN in capture + lock anti-doppio + update UI immediata.
   - Fix: "non carica le foto automaticamente" in modalità semplice.
     Soluzione: quando SIMPLE=ON e selezioni/scatti una foto/PDF:
       * esegue OCR (se disponibile)
       * se importo+data sono validi => auto-click su Salva (anche se l'autosave impostazioni è OFF)
   APPEND-ONLY: non rimuove nulla, ma intercetta prima.
   ================================ */
(function(){
  "use strict";
  if(window.__SSP_HOTFIX_V2_SIMPLE_FAST) return;
  window.__SSP_HOTFIX_V2_SIMPLE_FAST = true;

  const LS_KEY = "__sspSimpleMode";
  const getOn = ()=>{ try{return localStorage.getItem(LS_KEY)==="1";}catch(_){return false;} };
  const setOnFast = (v)=>{
    const on = !!v;
    try{ localStorage.setItem(LS_KEY, on?"1":"0"); }catch(_){ }
    try{ document.body.classList.toggle("ssp-simple", on); }catch(_){ }
    try{
      const fab=document.getElementById("sspSimpleFabV2");
      if(fab) fab.textContent = on?"Semplice ON":"Semplice OFF";
      const chk=document.getElementById("sspSimpleChkV2");
      if(chk) chk.checked = on;
    }catch(_){ }
  };

  // Expose as the canonical setter (other patches may call it)
  window.__sspSetSimpleModeFast = setOnFast;

  // ---------- Fast toggle handler (capture) ----------
  let lastToggleAt = 0;
  function fastToggle(ev){
    const now = Date.now();
    if(now - lastToggleAt < 350) return; // anti doppio tap (touchend+click)
    lastToggleAt = now;
    try{ ev.preventDefault(); }catch(_){ }
    try{ ev.stopPropagation(); }catch(_){ }
    try{ ev.stopImmediatePropagation(); }catch(_){ }
    const next = !getOn();
    setOnFast(next);
    try{ if(typeof toast === 'function') toast(next?"Modalità semplice: ON":"Modalità semplice: OFF", 900); }catch(_){ }
  }

  function bindFastFab(){
    const fab = document.getElementById("sspSimpleFabV2");
    if(!fab) return;

    // Make sure it's always tappable and above overlays
    fab.style.pointerEvents = "auto";
    fab.style.touchAction = "manipulation";
    fab.style.zIndex = "2147483647";
    fab.style.transform = "translateZ(0)";

    // Bind pointerdown in capture so it fires immediately
    // (and before other click/touch handlers)
    fab.addEventListener("pointerdown", fastToggle, true);
  }

  // Global safety net: if tap happens inside FAB rect, toggle anyway.
  function globalHit(ev){
    const fab = document.getElementById("sspSimpleFabV2");
    if(!fab) return;
    const r = fab.getBoundingClientRect();
    const pt = (ev.changedTouches && ev.changedTouches[0]) || ev;
    const x = pt.clientX, y = pt.clientY;
    if(x==null || y==null) return;
    if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom){
      fastToggle(ev);
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{ setOnFast(getOn()); bindFastFab(); }, 50);
  });
  setTimeout(()=>{ setOnFast(getOn()); bindFastFab(); }, 700);

  // capture phase (works even if overlays steal events)
  document.addEventListener("touchstart", globalHit, {capture:true, passive:false});
  document.addEventListener("pointerdown", globalHit, true);

  // ---------- Auto-save in SIMPLE mode when selecting/scanning a receipt ----------
  function parseNum(v){
    const s = String(v||"").trim().replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n)? n : NaN;
  }
  function canAutoSave(){
    const m = document.getElementById("modalAdd");
    if(!m || !m.classList || !m.classList.contains("show")) return false;
    // do not auto-save while editing an existing receipt
    try{ if(typeof window.editId !== 'undefined' && window.editId) return false; }catch(_){ }
    const amt = parseNum(document.getElementById("inAmount")?.value);
    const dt  = String(document.getElementById("inDate")?.value || "").trim();
    return Number.isFinite(amt) && amt>0 && !!dt;
  }

  let autoSaveLock = 0;
  async function tryAutoSaveSoon(){
    if(!getOn()) return; // only in simple mode
    const now = Date.now();
    if(now - autoSaveLock < 2500) return;

    // Wait a bit for OCR to fill fields
    await new Promise(r=>setTimeout(r, 350));
    if(!canAutoSave()){
      // wait a little more (OCR may be slower)
      await new Promise(r=>setTimeout(r, 650));
    }
    if(!canAutoSave()) return;

    autoSaveLock = Date.now();
    const btn = document.getElementById("btnSave");
    if(btn) btn.click();
  }

  // Intercept selection changes on photo/pdf inputs (capture) to schedule auto-save.
  document.addEventListener("change", (e)=>{
    const t = e.target;
    if(!t || t.tagName !== 'INPUT' || t.type !== 'file') return;
    const id = t.id || "";
    // photo/camera/pdf inputs known in this app
    if(id === "inPhoto" || id === "inPhotoCam" || id === "inPdf" || id === "inPdfMulti" || id.includes("Pdf") || id.includes("Photo")){
      // schedule after existing handlers run
      setTimeout(()=>{ tryAutoSaveSoon(); }, 80);
    }
  }, true);

  // Also listen to the app custom event (when present)
  window.addEventListener('ssp:ocr-filled', ()=>{ tryAutoSaveSoon(); }, {passive:true});
})();
