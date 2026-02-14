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
    settingsKey: "ssp_settings_v6",
    freeLimitExpenses: 30,
    freeLimitPdfPerMonth: 3,
    photoMaxSide: 1600,
    photoJpegQuality: 0.78,
    devAutoPro: true,
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
  //  BUILD / CACHE BUST
  // =====================
  const BUILD_ID = "v38.0_20260214180000";
  (async () => {
    try{
      const prev = localStorage.getItem("__ssp_build_id") || "";
      if(prev !== BUILD_ID){
        localStorage.setItem("__ssp_build_id", BUILD_ID);
        if("serviceWorker" in navigator){
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if(window.caches){
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if(!sessionStorage.getItem("__ssp_reloaded_once")){
          sessionStorage.setItem("__ssp_reloaded_once","1");
          location.reload();
        }
      }
    }catch(e){ console.warn("cache-bust skipped", e); }
  })();

  const $ = (s) => document.querySelector(s);
  const on = (sel, ev, fn, opts) => {
    try{
      const el = $(sel);
      if(el) el.addEventListener(ev, fn, opts);
    }catch(e){ /* never block */ }
  };

  // =====================
  // PRO framework
  // =====================
  function isPro(){
    try{
      if(typeof settings !== 'undefined' && settings && typeof settings.isPro !== 'undefined'){
        return !!settings.isPro;
      }
    }catch(_){}
    return localStorage.getItem("isPro") === "true";
  }
  function setPro(v){
    const on = !!v;
    localStorage.setItem("isPro", on ? "true" : "false");
    try{
      if(typeof settings !== 'undefined' && settings){
        settings.isPro = on;
        if(typeof saveSettings === 'function') saveSettings();
        if(typeof setProUI === 'function') setProUI();
      }
    }catch(_){}
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
    return String(text ?? '')
      .replace(/\r\n/g,'\n')
      .replace(/\r/g,'\n')
      .split('\n')
      .map(l => l.replace(/\s+$/,'').trim())
      .join('\n')
      .trim();
  }
  function normalizeForRegex(text){
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

  // Funzione isCaf aggiornata per supportare detraibileForzato
  function isCaf(category, detraibileForzato){
    return detraibileForzato || CAF_CATEGORIES.has(category);
  }

  // ---------------- SETTINGS ----------------
  function loadSettings(){
    try { return JSON.parse(localStorage.getItem(APP.settingsKey)||"{}"); }
    catch { return {}; }
  }
  let settings = loadSettings();
  settings.isPro = !!settings.isPro;
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  settings.viewMode = settings.viewMode || "list";
  settings.budgetByMonth = settings.budgetByMonth || {};
  settings.reminders = settings.reminders || [];
  settings.ocrAutoSave = settings.ocrAutoSave || false; // default
  saveSettings();

  // Applica tema salvato
  if(localStorage.getItem("theme") === "light") document.body.classList.add("light-theme");

  // =====================
  // DEV / TEST PRO AUTO-ENABLE
  // =====================
  (function(){
    try{
      const p = new URLSearchParams(location.search || "");
      const disable = p.get("nopro") === "1";
      const hasParam = p.get(APP.devParamName) === "1" || p.get("pro") === "1";
      if(!disable && (APP.devAutoPro || hasParam)){
        if(localStorage.getItem("ssp_dev_autopro_done") !== "1"){
          setPro(true);
          const ym = new Date().toISOString().slice(0,7);
          settings.pdfCountByMonth = settings.pdfCountByMonth || {};
          settings.pdfCountByMonth[ym] = 0;
          localStorage.setItem("ssp_dev_autopro_done","1");
          saveSettings();
        } else {
          setPro(true);
        }
      }
    }catch(_){}
  })();

  function saveSettings(){
    localStorage.setItem(APP.settingsKey, JSON.stringify(settings));
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
  let editId=null;
  let modalCurrentId=null;
  let chartInstance = null; // per il grafico

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

  function cafBadgeHtml(cat, detraibileForzato){
    return isCaf(cat, detraibileForzato) ? `<span class="badge caf">⭐ Detraibile (730)</span>` : "";
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
          <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category, x.detraibileForzato)}</div>
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
          <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category, x.detraibileForzato)}</div>
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
            <div class="title">${escapeHtml(x.note||"Spesa")}${cafBadgeHtml(x.category, x.detraibileForzato)}</div>
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
    // Migrazione: aggiungi detraibileForzato se manca e altri fix
    try{
      let changed=false;
      for(const x of all){
        if(!x.month && x.date){ x.month = yyyymm(x.date); changed=true; }
        if(typeof x.amount !== 'number') x.amount = Number(x.amount)||0;
        if(x.detraibileForzato === undefined) { x.detraibileForzato = false; changed=true; }
      }
      if(changed){
        for(const x of all){ if(x.id) await dbPut(x); }
      }
    }catch(e){}
    setProUI();
    calcStats();
    renderRecent();
    renderArchive();
    renderAnalysis();
    renderRemindersList(); // aggiorna lista promemoria
  }

  // ---------------- SETTINGS UI ----------------
  const $ocrKeyInput = $("#ocrKeyInput");
  const $ocrProviderSelect = $("#ocrProviderSelect");
  const $ocrEndpointInput = $("#ocrEndpointInput");
  const $ocrAutoSaveToggle = $("#ocrAutoSaveToggle"); // ora presente in HTML
  const $langSelect  = $("#langSelect");
  const $btnSaveSettings = $("#btnSaveSettings");
  const $btnResetApp = $("#btnResetApp");
  const $btnTestOcrKey = $("#btnTestOcrKey");
  const $ocrKeyStatus = $("#ocrKeyStatus"); // corretto id

  function applyLang(){
    const lang = settings.lang || "it";
    document.documentElement.setAttribute("lang", lang);
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
      if($ocrAutoSaveToggle) settings.ocrAutoSave = $ocrAutoSaveToggle.checked;
      settings.lang = $langSelect?.value || "it";
      saveSettings();
      applyLang();
      toast(settings.lang==="en" ? "Settings saved" : "Impostazioni salvate");
    });
  }

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

  // Tema chiaro
  const themeToggle = $("#themeToggle");
  if(themeToggle){
    themeToggle.addEventListener("change", e => {
      document.body.classList.toggle("light-theme", e.target.checked);
      localStorage.setItem("theme", e.target.checked ? "light" : "dark");
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
    $("#inPhoto").value="";
    if($("#inDetraibile")) $("#inDetraibile").checked = false;
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
    $("#mMeta").textContent = `${x.date} • ${x.category}${isCaf(x.category, x.detraibileForzato) ? " • Detraibile (730)" : ""} • ${x.month}`;
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
    if($("#inDetraibile")) $("#inDetraibile").checked = !!x.detraibileForzato;
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
      const xm = x.month || yyyymm(x.date);
      if(xm !== month) continue;
      if(onlyCaf && !isCaf(x.category, x.detraibileForzato)) continue;
      const k = x.category || "Altro";
      map.set(k, (map.get(k) || 0) + (Number(x.amount) || 0));
    }
    return map;
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
    const detraibileForzato = $("#inDetraibile") ? $("#inDetraibile").checked : false;
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
      photo,
      detraibileForzato
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
    if(mode==="caf") list = list.filter(x=>isCaf(x.category, x.detraibileForzato));

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
    const d = isoToDate(iso);
    const f = isoToDate(fromISO);
    const t = isoToDate(toISO);
    if(!d || !f || !t) return false;
    return d >= f && d <= t;
  }
  function moneyCsv(v){
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

    const blob = doc.output('blob');
    return blob;
  }

  async function shareOrDownloadFiles(files, title){
    try{
      if(navigator.share && navigator.canShare){
        const can = navigator.canShare({ files });
        if(can){
          await navigator.share({ title: title||'Pacchetto commercialista', files });
          toast("Condiviso ✅");
          return;
        }
      }
    }catch(e){}

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
      }catch(e){}
    }
    toast("File pronti ✅");
  }

  async function sendToAccountant(opts){
    if(!requirePro("Invio al commercialista")) return;

    const fromISO = opts?.from;
    const toISO = opts?.to;
    const mode = 'caf';
    const pack = 'zip';
    const includePhotos = false;

    if(!isoToDate(fromISO) || !isoToDate(toISO)){
      toast("Date non valide");
      return;
    }
    if(isoToDate(fromISO) > isoToDate(toISO)){
      toast("Intervallo non valido");
      return;
    }

    let list = all.filter(x => inRangeISO(x.date, fromISO, toISO));
    if(mode === 'caf') list = list.filter(x=>isCaf(x.category, x.detraibileForzato));
    list.sort((a,b)=>(String(a.date||'').localeCompare(String(b.date||''))));
    if(list.length===0){ toast("Nessuna spesa nel periodo"); return; }

    const rangeLabel = `Periodo: ${fromISO} → ${toISO}`;
    const titleLabel = mode === 'caf' ? 'Report 730 (solo detraibili)' : 'Report completo (commercialista)';

    const csvText = buildCsv(list);
    const csvBlob = new Blob(["\ufeff" + csvText], {type:'text/csv;charset=utf-8'});
    const csvFile = new File([csvBlob], `Spese_${fromISO}_${toISO}.csv`, {type: csvBlob.type});

    const pdfBlob = await buildPdfBlobFromList(mode, titleLabel, rangeLabel, list);
    if(!pdfBlob){ toast("PDF non disponibile"); return; }
    const pdfName = mode==='caf' ? `Report_730_${fromISO}_${toISO}.pdf` : `Report_${fromISO}_${toISO}.pdf`;
    const pdfFile = new File([pdfBlob], pdfName, {type:'application/pdf'});

    if(pack === 'zip'){
      const JSZip = window.JSZip;
      if(!JSZip){
        toast("ZIP non disponibile (JSZip non caricato). Invio file separati.");
        await shareOrDownloadFiles([csvFile, pdfFile], 'Commercialista');
        return;
      }
      const zip = new JSZip();
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
        reminders: settings.reminders
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
          photo: x.photo ? String(x.photo) : null,
          detraibileForzato: !!x.detraibileForzato
        });
        added++;
      }

      if(payload.settings){
        if(typeof payload.settings.viewMode === "string") settings.viewMode = payload.settings.viewMode;
        if(payload.settings.budgetByMonth && typeof payload.settings.budgetByMonth==="object") settings.budgetByMonth = payload.settings.budgetByMonth;
        if(payload.settings.pdfCountByMonth && typeof payload.settings.pdfCountByMonth==="object") settings.pdfCountByMonth = payload.settings.pdfCountByMonth;
        if(payload.settings.reminders && Array.isArray(payload.settings.reminders)) settings.reminders = payload.settings.reminders;
        saveSettings();
      }

      toast(`Import OK (+${added}) ✅`);
      await refresh();
    }catch{
      alert("Errore import: file non valido.");
    }
  }

  // ---------------- NUOVE FUNZIONI (EXPORT EXCEL, PROMEMORIA, BARCODE, GRAFICO) ----------------

  // ----------------- EXPORT EXCEL -----------------
  async function exportExcel() {
    if(!window.XLSX) { toast("Libreria Excel non caricata"); return; }
    const list = all; // oppure applica gli stessi filtri di renderList se vuoi
    const data = list.map(x => ({
      Data: x.date,
      Categoria: x.category,
      Descrizione: x.note,
      Importo: x.amount,
      Detraibile: isCaf(x.category, x.detraibileForzato) ? "Sì" : "No"
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Spese");
    XLSX.writeFile(wb, `spese_${monthNow()}.xlsx`);
    toast("Excel esportato");
  }

  // ----------------- PROMEMORIA -----------------
  function renderRemindersList() {
    const list = $("#reminderList");
    if(!list) return;
    const reminders = settings.reminders || [];
    list.innerHTML = reminders.map((r, i) => `
      <li>
        <span>${r.date} - ${escapeHtml(r.text)}</span>
        <button class="remove-reminder" data-index="${i}">✖</button>
      </li>
    `).join('');
    list.querySelectorAll('.remove-reminder').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.index;
        settings.reminders.splice(idx, 1);
        saveSettings();
        renderRemindersList();
      });
    });
  }

  function addReminder() {
    const date = $("#reminderDate")?.value;
    const text = $("#reminderText")?.value.trim();
    if(!date || !text) { toast("Data e testo obbligatori"); return; }
    if(!settings.reminders) settings.reminders = [];
    settings.reminders.push({ date, text, notified: false });
    saveSettings();
    $("#reminderDate").value = "";
    $("#reminderText").value = "";
    renderRemindersList();
    toast("Promemoria aggiunto");
  }

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") Notification.requestPermission();
  }

  function checkReminders() {
    const reminders = settings.reminders || [];
    const today = new Date().toISOString().slice(0,10);
    reminders.forEach(r => {
      if(r.date === today && !r.notified) {
        if (Notification.permission === "granted") {
          new Notification("Promemoria scadenza", { body: r.text });
        } else {
          toast(`⏰ Promemoria: ${r.text}`);
        }
        r.notified = true;
      }
    });
    saveSettings();
  }

  // ----------------- SCAN BARCODE -----------------
  function initBarcodeScanner() {
    if (!window.Quagga) { toast("Libreria non caricata"); return; }
    showModal("#modalBarcode");
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: document.querySelector("#barcodeCanvas"),
        constraints: { width: 640, height: 480, facingMode: "environment" }
      },
      decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader"] }
    }, err => {
      if(err) { toast("Errore avvio fotocamera"); hideModal("#modalBarcode"); return; }
      Quagga.start();
    });
    Quagga.onDetected(data => {
      const code = data.codeResult.code;
      toast(`Codice: ${code}`);
      $("#inNote").value = `Prodotto ${code}`;
      Quagga.stop();
      hideModal("#modalBarcode");
    });
  }

  // ----------------- GRAFICO (versione aggiornata) -----------------
  function renderAnalysis(){
    const list = $("#anaList");
    if(!list) return;

    const month = $("#rMonth").value || monthNow();
    const onlyCaf = !!$("#anaOnlyCaf").checked;

    const map = groupByCategoryForMonth(month, onlyCaf);
    const rows = Array.from(map.entries()).map(([cat, total]) => ({cat, total}));
    rows.sort((a,b)=>b.total - a.total);

    const grand = rows.reduce((s,r)=>s+r.total,0);

    // Dettaglio testuale
    if(rows.length === 0){
      list.innerHTML = `<div class="hint">Nessuna spesa per questo mese.</div>`;
    } else {
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

    // Grafico
    const ctx = document.getElementById('catChart')?.getContext('2d');
    if(!ctx) return;
    if(chartInstance) chartInstance.destroy();
    if(rows.length === 0) {
      ctx.canvas.style.display = 'none';
      return;
    }
    ctx.canvas.style.display = 'block';
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.cat),
        datasets: [{
          label: 'Spese (€)',
          data: rows.map(r => r.total),
          backgroundColor: 'rgba(91,140,255,0.6)',
          borderColor: 'rgba(91,140,255,1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // ---------------- NUOVE FUNZIONI AGGIUNTE (OCR, PDF, TEST) ----------------

  // Test API key OCR.Space
  async function testOcrSpaceKey() {
    const key = settings.ocrSpaceKey;
    if (!key) return { ok: false, error: "Nessuna chiave" };
    try {
      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "apikey": key },
        body: new URLSearchParams({ language: "ita", isOverlayRequired: "false", url: "https://www.ocr.space/Content/Images/test_image.png" })
      });
      const data = await response.json();
      if (data && data.IsErroredOnProcessing === false) return { ok: true };
      else return { ok: false, error: data.ErrorMessage || "Errore sconosciuto" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Converti prima pagina PDF in immagine
  async function pdfFirstPageToPngFile(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const blob = dataUrlToBlob(dataUrl);
    return new File([blob], "pdf_page.jpg", { type: "image/jpeg" });
  }

  // Gestore OCR (Tesseract)
  window.__sspReceipt = {
    file: null,
    worker: null,
    getLastFile: function() { return this.file; },
    cancelOcr: function() { if (this.worker) { this.worker.terminate(); this.worker = null; } },
    handle: async function(file, mode) {
      this.file = file;
      const panel = document.getElementById('ocrPanel');
      const textarea = document.getElementById('ocrText');
      const status = document.getElementById('ocrStatus');
      if (panel) panel.style.display = 'block';
      if (status) status.textContent = 'OCR in corso...';
      try {
        this.cancelOcr();
        if (!window.Tesseract) { throw new Error("Tesseract non caricato"); }
        const worker = Tesseract.createWorker({
          logger: m => { if (m.status === 'recognizing text') status.textContent = `Riconoscimento: ${Math.round(m.progress * 100)}%`; }
        });
        this.worker = worker;
        await worker.load();
        await worker.loadLanguage('ita');
        await worker.initialize('ita');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        this.worker = null;
        if (textarea) textarea.value = text;
        if (status) status.textContent = 'OCR completato';
        // Prova a estrarre importo e data
        const amountMatch = text.match(/(?:totale|importo|€|eur(?:o)?)\s*[:\s]*([0-9]+[.,][0-9]{2})/i);
        if (amountMatch) {
          const amountStr = amountMatch[1].replace(',', '.');
          const amount = parseFloat(amountStr);
          if (!isNaN(amount)) {
            document.getElementById('inAmount').value = amount.toFixed(2).replace('.', ',');
          }
        }
        const dateMatch = text.match(/(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4})/);
        if (dateMatch) {
          let dateStr = dateMatch[1].replace(/[\/\-\.]/g, '-');
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            let day, month, year;
            if (parts[2].length === 4) { // dd-mm-yyyy
              day = parts[0];
              month = parts[1];
              year = parts[2];
            } else if (parts[0].length === 4) { // yyyy-mm-dd
              year = parts[0];
              month = parts[1];
              day = parts[2];
            } else { // dd-mm-yy
              day = parts[0];
              month = parts[1];
              year = '20' + parts[2];
            }
            const iso = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
            const d = new Date(iso);
            if (!isNaN(d)) {
              document.getElementById('inDate').value = iso;
            }
          }
        }
        // Auto-salvataggio se richiesto
        if (mode === 'autosave' && settings.ocrAutoSave) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ssp:ocr-filled'));
          }, 100);
        }
      } catch (e) {
        if (status) status.textContent = 'Errore OCR';
        console.error(e);
      }
    }
  };

  // ---------------- TOGGLE MODALITÀ SEMPLICE/AVANZATA ----------------
  function toggleSimpleMode() {
    const current = localStorage.getItem("__sspSimpleMode") === "1";
    const newMode = current ? "0" : "1";
    localStorage.setItem("__sspSimpleMode", newMode);
    toast(`Modalità ${newMode === "1" ? "semplice" : "avanzata"} attivata. Ricarica...`);
    setTimeout(() => location.reload(), 800);
  }

  // ---------------- EVENTI (wire aggiornata) ----------------
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
      setTimeout(()=>{ try { $("#btnReceiptCamera").click(); } catch(e){} }, 120);
    });

    // Nuovo FAB per modalità semplice/avanzata
    const fabSimple = document.getElementById('fabSimpleToggle');
    if (fabSimple) {
      fabSimple.addEventListener('click', toggleSimpleMode);
    }

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

        try{ await window.__sspReceipt?.handle?.(file, "select"); }catch(_){ }
      }catch{
        scanImg=null;
        setPhotoPreview(null);
        toast("Foto non valida");
      }
    });

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

          try{ await window.__sspReceipt?.handle?.(file, "select"); }catch(_){ }
        }catch{
          scanImg=null;
          setPhotoPreview(null);
          toast("Foto non valida");
        }
      });
    }

    const btnReceiptGallery = $("#btnReceiptGallery");
    if(btnReceiptGallery && $("#inPhoto")){
      btnReceiptGallery.addEventListener("click", ()=> { const inp=$("#inPhoto"); if(inp) inp.value=""; inp.click(); });
    }

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
          previewPhoto = quick;
          if(window.__sspReceipt){
            window.__sspReceipt.file = pngFile;
            window.__sspReceipt.getLastFile = () => pngFile;
          }
          toast("PDF importato ✅ (1ª pagina)");

          try{ await window.__sspReceipt?.handle?.(pngFile, "pdf"); }catch(_){}
        }catch(err){
          console.error(err);
          toast("PDF non valido / non leggibile");
        }
      });
    }

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
      try{ await window.__sspReceipt.handle(file, "manual"); }catch(e){}
    });

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

    let __autoSaveLock = 0;
    window.addEventListener('ssp:ocr-filled', ()=>{
      try{
        if(!settings || !settings.ocrAutoSave) return;
        const modal = $("#modalAdd");
        if(!modal || !modal.classList || !modal.classList.contains('show')) return;
        if(editId) return;
        const now = Date.now();
        if(now - __autoSaveLock < 2500) return;

        const amt = parseEuro($("#inAmount")?.value);
        const dt = String($("#inDate")?.value || "").trim();
        if(!Number.isFinite(amt) || amt <= 0) return;
        if(!dt) return;

        __autoSaveLock = now;
        const b = $("#btnSave");
        if(b) b.click();
      }catch(_){}
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
      await sendToAccountant({from, to, mode:'caf', pack:'zip', includePhotos:false});
    });

    $("#btnBackup").addEventListener("click", exportBackup);
    $("#inRestore").addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importBackup(f);
      e.target.value="";
    });

    $("#btnWipeAll").addEventListener("click", wipeAll);

    // NUOVI LISTENER
    on("#btnExportExcel", "click", exportExcel);
    on("#addReminder", "click", addReminder);
    on("#scanBarcode", "click", initBarcodeScanner);
    on("#barcodeClose", "click", ()=>{ 
      if(window.Quagga) Quagga.stop();
      hideModal("#modalBarcode");
    });
  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js?v=38.0").catch(()=>{}));
  }

  (async function start(){
    fillCategories();
    $("#inDate").value = todayISO();
    $("#fMonth").value = monthNow();
    setProUI();
    syncSettingsForm(); // carica valori nelle impostazioni

    await openDB();
    await refresh();
    wire();
    showPage("home");

    // Richiedi permesso notifiche e avvia controllo giornaliero
    requestNotificationPermission();
    checkReminders();
    setInterval(checkReminders, 24 * 60 * 60 * 1000); // ogni giorno
  })();

})();
