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
    photoJpegQuality: 0.78
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
  const BUILD_ID = "v30.4";
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
  const $langSelect  = $("#langSelect");
  const $btnSaveSettings = $("#btnSaveSettings");
  const $btnResetApp = $("#btnResetApp");

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
    if($langSelect)  $langSelect.value = settings.lang || "it";
  }

  if($btnSaveSettings){
    $btnSaveSettings.addEventListener("click", ()=>{
      const key = ($ocrKeyInput?.value || "").trim();
      if(key) settings.ocrSpaceKey = key;
      settings.lang = $langSelect?.value || "it";
      saveSettings();
      applyLang();
      toast(settings.lang==="en" ? "Settings saved" : "Impostazioni salvate");
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
  function showModal(id){ const m=$(id); m.classList.add("show"); m.setAttribute("aria-hidden","false"); }
  function hideModal(id){ const m=$(id); m.classList.remove("show"); m.setAttribute("aria-hidden","true"); }

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
        return;
      }
      try{
        scanImg = await fileToImage(file);
        const quick = await imageToDataUrl(scanImg, 0, null, 1.0, 0);
        setPhotoPreview(quick);
        toast("Foto caricata ✅");
      }catch{
        scanImg=null;
        setPhotoPreview(null);
        toast("Foto non valida");
      }
    });

    $("#removePhoto").addEventListener("click", ()=>{
      $("#inPhoto").value="";
      previewPhoto=null;
      scanImg=null;
      setPhotoPreview(null);
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
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js?v=30.4").catch(()=>{}));
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

  const $ = (id) => document.getElementById(id);

  const toastEl = $("toast");
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
    return (s.ocrSpaceKey || s.ocrKey || s.ocr_api_key || s.ocrApiKey || "").trim() || "K84735650588957";
  }

  const inAmount = $("inAmount");
  const inDate = $("inDate");
  const inDesc = $("inNote");
  const preview = $("receiptPreview");

  const ocrPanel = $("ocrPanel");
  const ocrTextEl = $("ocrText");
  const btnOcrCopy = $("btnOcrCopy");
  const btnOcrDownload = $("btnOcrDownload");
  const ocrStatusEl = $("ocrStatus");

  function showOcrPanel(show){ if(ocrPanel) ocrPanel.style.display = show ? "block" : "none"; }
  function setOcrText(t){ if(ocrTextEl) ocrTextEl.value = String(t||""); }
  function setOcrStatus(t){ if(ocrStatusEl) ocrStatusEl.textContent = String(t||""); }

  const btnCam = $("btnReceiptCamera");
  const btnGal = $("btnReceiptGallery");
  const fileCam = $("inPhotoCam");
  const fileGal = $("inPhoto");

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
      .replace(/\s+/g, " ")
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
    const lines = text.split(/\n|\|/).map(l => l.trim()).filter(Boolean);
    const totals = [];
    const anyAmounts = [];
    for (const ln of lines) {
      const upper = ln.toUpperCase();
      const amt = parseEuro(ln);
      if (amt != null) anyAmounts.push(amt);
      if (amt != null && /(TOTALE|TOT\b|TOTALE\s+COMPLESSIVO|IMPORTO\s+PAGATO|PAGAMENTO\s+ELETTRONICO|TOTAL\b)/i.test(upper)) {
        totals.push(amt);
      }
    }
    if (totals.length) return Math.max(...totals);
    if (anyAmounts.length) return Math.max(...anyAmounts);
    return null;
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
    return (typeof navigator !== 'undefined') ? navigator.onLine : true;
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
        const maxW = 1400; // riduce peso e accelera OCR
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

  async function runLocalOcr(file){
    await ensureTesseractReady();
    const canvas = await canvasFromFile(file);
    // lang: ita + eng (molti scontrini hanno EN)
    const lang = 'ita+eng';
    const res = await window.Tesseract.recognize(canvas, lang, {
      logger: (m) => {
        // m.progress 0..1
        if (m && typeof m.progress === 'number') {
          const pct = Math.round(m.progress * 100);
          toast(`OCR ${pct}%...`);
        }
      }
    });
    return { text: (res && res.data && res.data.text) ? res.data.text : '', raw: res, error: '' };
  }

  async function runOnlineOcr(file){
    const apikey = getOcrKey();
    if(!apikey) throw new Error("API key mancante");
    const fd = await fileToFormData(file, apikey, "ita");
    const res = await fetch(OCR_ENDPOINT, { method:"POST", body: fd });
    if(!res.ok) throw new Error("Errore rete OCR online");
    const j = await res.json();
    const parsed = (j && j.ParsedResults && j.ParsedResults[0] && j.ParsedResults[0].ParsedText) ? j.ParsedResults[0].ParsedText : "";
    return { text: parsed, raw: j, error: j && j.ErrorMessage ? String(j.ErrorMessage) : "" };
  }

  async function runOcr(file){
    // Prefer OFFLINE (Tesseract) for stability on Chrome/PWA.
    try{
      return await runLocalOcr(file);
    }catch(e){
      // fallback online only if network available
      if(isProbablyOnline()){
        try{ return await runOnlineOcr(file); }catch(_){ /* ignore */ }
      }
      throw e;
    }
  }

  async function tryExtractAndFill(file, reason) {
    const now = Date.now();
    if (ocrInFlight) return false;
    if (now - lastOcrAt < 700 && reason !== "save") return false;
    lastOcrAt = now;
    ocrInFlight = true;
    try {
      showOcrPanel(true);
      setOcrStatus("Analisi scontrino in corso...");
      toast("Analisi scontrino in corso...");
      const ocr = await runOcr(file);
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

      if (total != null && inAmount && !String(inAmount.value || "").trim()) {
        inAmount.value = total.toFixed(2).replace(".", ",");
      }
      if (dateISO && inDate && (!inDate.value || String(inDate.value).trim() === "")) {
        inDate.value = dateISO;
      }
      if (inDesc && (!inDesc.value || !inDesc.value.trim())) {
        const firstLine = String(txt || "").split(/\n/).map(s => s.trim()).find(s => /[A-Za-zÀ-ÿ]/.test(s) && s.length >= 3);
        if (firstLine) inDesc.value = firstLine.slice(0, 40);
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
      ocrInFlight = false;
    }
  }

  function wireInput(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("change", async () => {
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      lastReceiptFile = file;
      setPreviewFromFile(file);
      await tryExtractAndFill(file, "select");
    });
  }

  if (btnCam && fileCam) {
    btnCam.addEventListener("click", () => {
      try { fileCam.value = ""; } catch {}
      fileCam.click();
    });
  }
  if (btnGal && fileGal) {
    btnGal.addEventListener("click", () => {
      try { fileGal.value = ""; } catch {}
      fileGal.click();
    });
  }
  wireInput(fileCam);
  wireInput(fileGal);

  window.__sspReceipt = {
    handle: async (file, reason = "save") => {
      if (!file) return false;
      lastReceiptFile = file;
      setPreviewFromFile(file);
      return await tryExtractAndFill(file, reason);
    },
    getLastFile: () => lastReceiptFile
  };
})();
