
async function setLastReceiptFromFile(file){
  if(!file) return;
  lastReceiptBlob = file;
}

let lastReceiptBlob = null;

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
  //  BUILD / CACHE BUST (prevents "old version" tap-block issues)
  // =====================
  // IMPORTANT: bump this on every release so the app auto-clears stale caches
  // (prevents "tap does nothing" / old JS issues in PWA/APK wrappers)
  const BUILD_ID = "v34.3";
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
    const d=new Date(dateISO);
    if(isNaN(d)) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
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
  const settings = loadSettings();
  settings.isPro = !!settings.isPro;
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  settings.viewMode = settings.viewMode || "list"; // list | timeline
  settings.budgetByMonth = settings.budgetByMonth || {}; // { "YYYY-MM": cents }
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
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{ URL.revokeObjectURL(url); resolve(img); };
      img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("Immagine non valida")); };
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

    let list = all.slice();
    if(m) list = list.filter(x=>x.month===m);
    if(c) list = list.filter(x=>x.category===c);
    if(q) list = list.filter(x =>
      (x.note||"").toLowerCase().includes(q) ||
      (x.category||"").toLowerCase().includes(q)
    );

    list.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    return list;
  }

  function cafBadgeHtml(cat){
    return isCaf(cat) ? `<span class="badge caf">⭐ Detraibile</span>` : "";
  }

  function calcStats(){
    const mNow=monthNow();
    const yNow=String(new Date().getFullYear());
    const monthTotal = all.filter(x=>x.month===mNow).reduce((s,x)=>s+(+x.amount||0),0);
    const yearTotal  = all.filter(x=>(x.date||"").startsWith(yNow+"-")).reduce((s,x)=>s+(+x.amount||0),0);
    $("#statMonth").textContent = euro(monthTotal);
    $("#statYear").textContent = euro(yearTotal);
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
    $("#viewTimeline").classList.toggle("active", !listMode);
    if(listMode) renderList(); else renderTimeline();
  }

  async function refresh(){
    all = await dbGetAll();
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
  const $langSelect  = $("#langSelect");
  const $btnSaveSettings = $("#btnSaveSettings");
  const $btnResetApp = $("#btnResetApp");
  const $btnTestOcrKey = $("#btnTestOcrKey");
  const $ocrKeyTestStatus = $("#ocrKeyTestStatus");

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
  
function hideAllModals(){
  document.querySelectorAll('.modal').forEach(m=>{
    m.classList.remove('show');
    m.setAttribute('aria-hidden','true');
  });
  document.body.classList.remove('modal-open');
}

function openAdd(){
    editId=null;
    previewPhoto=null;
    scanImg=null;
    $("#addTitle").textContent="➕ Aggiungi spesa";
    $("#inAmount").value="";
    $("#inDate").value=todayISO();
    $("#inCategory").value="Alimentari";
    $("#inNote").value="";
    $("#inPhoto").value="";
    setPhotoPreview(null);
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

  function openDetails(id){
    const x=all.find(e=>e.id===id);
    if(!x) return;
    modalCurrentId=id;
    $("#mTitle").textContent = `${x.note||"Spesa"} • ${euro(x.amount)}`;
    $("#mMeta").textContent = `${x.date} • ${x.category}${isCaf(x.category) ? " • Detraibile (CAF)" : ""} • ${x.month}`;
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
    $("#inPhoto").value="";
    setPhotoPreview(x.photo || null);

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
      if(x.month !== month) continue;
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

    let list = all.filter(x=>x.month===targetMonth);
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

    const fileName = mode==="caf" ? `Report_CAF_${targetMonth}.pdf` : `Report_Mese_${targetMonth}.pdf`;
    doc.save(fileName);
    toast("PDF creato ✅");
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
        budgetByMonth: settings.budgetByMonth
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
    $("#btnClearFilters").addEventListener("click", ()=>{
      $("#fMonth").value = monthNow();
      $("#fCategory").value = "";
      $("#fSearch").value = "";
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

    $("#inPhoto").addEventListener("change", async (e)=>{
      const file = e.target.files && e.target.files[0];
      previewPhoto=null;
      if(!file){
        scanImg=null;
        setPhotoPreview(null);
        if(window.__sspReceipt){
          window.__sspReceipt.file = null;
          window.__sspReceipt.getLastFile = () => null;
        }
        return;
      }
      try{
        scanImg = await fileToImage(file);
        const quick = await imageToDataUrl(scanImg, 0, null, 1.0, 0);
        setPhotoPreview(quick);
        previewPhoto = quick;
        if(window.__sspReceipt){
          window.__sspReceipt.file = file;
          window.__sspReceipt.getLastFile = () => file;
        }
        toast("Foto caricata ✅");

        // OCR: parte una sola volta e solo dopo che la foto è pronta.
        // (Evita il problema "devo fare la foto due volte" su Android)
        try{ await window.__sspReceipt?.handle?.(file, "select"); }catch(_){ }
      }catch{
        scanImg=null;
        setPhotoPreview(null);
        toast("Foto non valida");
      }
    });

    // Camera input (capture) + dedicated button
    const inPhotoCam = $("#inPhotoCam");
    const btnReceiptCamera = $("#btnReceiptCamera");
    if(btnReceiptCamera && inPhotoCam){
      btnReceiptCamera.addEventListener("click", ()=> { inPhotoCam.value=""; inPhotoCam.click(); });
      inPhotoCam.addEventListener("change", async (e)=>{
        const file = e.target.files && e.target.files[0];
        previewPhoto=null;
        if(!file){
          scanImg=null;
          setPhotoPreview(null);
          if(window.__sspReceipt){
            window.__sspReceipt.file = null;
            window.__sspReceipt.getLastFile = () => null;
          }
          return;
        }
        try{
          scanImg = await fileToImage(file);
          const quick = await imageToDataUrl(scanImg, 0, null, 1.0, 0);
          setPhotoPreview(quick);
          previewPhoto = quick;
          if(window.__sspReceipt){
            window.__sspReceipt.file = file;
            window.__sspReceipt.getLastFile = () => file;
          }
          toast("Foto caricata ✅");

          // OCR: parte una sola volta e solo dopo che la foto è pronta.
          try{ await window.__sspReceipt?.handle?.(file, "select"); }catch(_){ }
        }catch{
          scanImg=null;
          setPhotoPreview(null);
          toast("Foto non valida");
        }
      });
    }

    // Gallery button (uses the normal file input)
    const btnReceiptGallery = $("#btnReceiptGallery");
    if(btnReceiptGallery && $("#inPhoto")){
      btnReceiptGallery.addEventListener("click", ()=> { const inp=$("#inPhoto"); if(inp) inp.value=""; inp.click(); });
    }

    // Remove photo (support both legacy id and current button id)
    const btnRemove = $("#removePhoto") || $("#btnRemovePhoto");
    if(btnRemove) btnRemove.addEventListener("click", ()=>{
      $("#inPhoto").value="";
      if($("#inPhotoCam")) $("#inPhotoCam").value="";
      previewPhoto=null;
      scanImg=null;
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
    $("#applyScan").addEventListener("click", applyScanner);

    $("#btnSave").addEventListener("click", onSave);
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

    $("#btnBackup").addEventListener("click", exportBackup);
    $("#inRestore").addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importBackup(f);
      e.target.value="";
    });

    $("#btnWipeAll").addEventListener("click", wipeAll);
  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js?v=34.0").catch(()=>{}));
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
    
  })();

})();



// ===============================
// Receipt capture + attach (v26) - SAFE PATCH
// Adds two buttons: camera-only + gallery, saves image, tries OCR (optional) to prefill amount/date.
// Never throws: wrapped in try/catch.
// ===============================

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
  const fileCam = $id("inPhotoCam");
  const fileGal = $id("inPhoto");

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

    // Sanitarie / detraibili (CAF)
    const isMedical =
      /(DENTIST|ODONTO|STUDIO\s+DENTIST|PRESTAZIONE\s+SANIT|SANITAR|RICEVUTA|FATTURA|TICKET|ASL|MEDIC|FARMAC|PARAFARMAC|RICETTA|SPESE\s+SANIT|CODICE\s+FISCALE|P\.?\s*IVA|PARTITA\s+IVA|MARCA\s+DA\s+BOLLO|BOLLO|VISITA\s+SPECIAL|ANALISI\s+CLINIC|LABORATORIO|POLIAMBULATORIO)/i.test(up) ||
      /(DENTIST|ODONTO|FARMAC|PARAFARMAC|MEDIC|ASL|POLIAMB)/i.test(m);

    if(isMedical) return "Farmacia / Mediche";

    // Animali
    if(/(VETERIN|VET\b|PET\s*SHOP|MANGIME|CROCC|TOELETTATURA|ZOOTECN|ANIMALI)/i.test(up) || /(VETERIN|PET)/i.test(m)){
      return "Animali";
    }

    // Trasporti / carburante
    if(/(BENZIN|DIESEL|CARBUR|RIFORN|POMPA|STAZIONE\s+SERVIZIO|IP\b|Q8\b|ENI\b|ESSO\b|TAMOIL\b|SHELL\b)/i.test(up) || /(Q8|ENI|ESSO|TAMOIL|IP|SHELL)/i.test(m)){
      return "Benzina";
    }

    // Casa (ferramenta, arredi, manutenzione)
    if(/(FERRAMENT|BRICO|OBI\b|LEROY\s*MERLIN|CASA\s*E\s*GIARDINO|ARRED|MOBIL|IDRAUL|ELETTRICIST|VERNIC|MATERIALI\s+EDILI)/i.test(up) || /(LEROY|BRICO|OBI)/i.test(m)){
      return "Casa";
    }

    // Bollette (utenze)
    if(/(BOLLETT|ENEL|ENI\s+PLENITUDE|PLENITUDE|ACEA|HERA|IREN|A2A|GAS\b|LUCE\b|ACQUA\b|TELECOM|TIM\b|VODAFONE|WINDTRE|FASTWEB|SKY\b)/i.test(up)){
      return "Bollette";
    }

    // Ristorante/Bar
    if(/(BAR\b|CAFF[EÈ]|RISTOR|PIZZER|TRATTOR|GELAT|PASTICCER|TAVOLA\s+CALDA|PANINOTEC|PUB\b)/i.test(up)){
      return "Ristorante / Bar";
    }

    // Viaggi / trasporti (biglietti)
    if(/(TRENITALIA|ITALO|ALITALIA|RYANAIR|EASYJET|VOLO|AEROPORTO|HOTEL|B&B|BOOKING|AIRBNB|AUTOSTRADA|PEDAGGIO|TELEPASS)/i.test(up)){
      return "Viaggi";
    }

    // Alimentari (supermercati)
    if(/(EUROSPIN|LIDL|CONAD|COOP|MD\b|DESPAR|PAM\b|CARREFOUR|ESSELUNGA|ALDI|SPAR\b|SIGMA|IN\'S|PENNY)/i.test(up)){
      return "Alimentari";
    }

    // Se non riconosce, non forzare
    return null;
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
      setOcrStatus("Analisi scontrino in corso...");
      // Timeout/abort: never block UI forever
      const ac = new AbortController();
      __ocrAbort = ac;

      // UI progress (fake but useful): avoid "stuck" feeling, especially on APK/WebView
      let __pct = 1;
      __pctTimer = setInterval(()=>{
        __pct = Math.min(99, __pct + (__pct<90 ? (Math.floor(Math.random()*7)+1) : 1));
        try{ setOcrStatus(__pct>=90 ? `Finalizzazione… ${__pct}%` : `Analisi scontrino… ${__pct}%`); }catch{}

        // If we reach 99% and stay there, it usually means the provider response/parsing is stuck.
        // Add a short watchdog that aborts and lets the retry logic kick in.
        if(__pct >= 99 && !__finalizeWatch){
          __finalizeWatch = setTimeout(()=>{
            try{ ac.abort(); }catch{}
          }, 9000);
        }
      }, 450);

      toast("Analisi scontrino in corso...");
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