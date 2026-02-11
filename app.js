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
  const BUILD_ID = "v28.2";
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
    const amount = parseEuro($("#inAmount").value);
    const date = $("#inDate").value;
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();
    const file = (window.__sspReceipt?.file) || ($("#inPhoto").files && $("#inPhoto").files[0]);

    // Auto-OCR: se c'è una foto e importo/data non sono validi, prova prima di salvare
    if((!Number.isFinite(amount) || amount<=0 || !date) && file && window.__sspReceipt?.handle){
      try{ await window.__sspReceipt.handle(file, "autosave"); }catch(e){}
    }

    // Rilegge i campi dopo eventuale OCR
    const amountFinal = parseEuro($("#inAmount").value);
    const dateFinal = $("#inDate").value;

    if(!Number.isFinite(amountFinal) || amountFinal<=0){ toast("Importo non valido"); haptic(18); return; }
    if(!dateFinal){ toast("Seleziona una data"); haptic(18); return; }

    const amount = amountFinal;
    const date = dateFinal;


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

    $("#fabAdd").addEventListener("click", ()=>{
      openAdd();
      toast("Aggiungi spesa");
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

    $("#btnOpenScanner").addEventListener("click", openScanner);

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
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js?v=28.2").catch(()=>{}));
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
    toast("Pronto ✅", 1100);
  })();

})();



// ===============================
// Receipt capture + attach (v26) - SAFE PATCH
// Adds two buttons: camera-only + gallery, saves image, tries OCR (optional) to prefill amount/date.
// Never throws: wrapped in try/catch.
// ===============================
(function receiptPatch(){
  try{
    const $ = (s) => document.querySelector(s);
    const btnCam = $("#btnReceiptCamera");
    const btnGal = $("#btnReceiptGallery");
    const inCam = $("#inPhotoCam");
    const inGal = $("#inPhoto");

    // Common field selectors (best-effort, won't break if missing)
    const selAmount = ["#amount","#importo","#inpAmount","#moveAmount","input[name='amount']","input[name='importo']"];
    const selDate   = ["#date","#data","#inpDate","#moveDate","input[name='date']","input[name='data']"];
    const selTitle  = ["#title","#descrizione","#desc","#merchant","#negozio","#inpTitle","#moveTitle","input[name='title']","input[name='descrizione']"];
    const selNote   = ["#note","#notes","#nota","#inpNote","textarea[name='note']","textarea[name='notes']"];

    function firstSel(list){
      for (const s of list){
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    }

    function setIfEmpty(el, val){
      if (!el) return;
      const cur = (el.value || "").trim();
      if (!cur && val) el.value = val;
      // trigger input event for reactive UIs
      try{ el.dispatchEvent(new Event("input",{bubbles:true})); }catch(e){}
      try{ el.dispatchEvent(new Event("change",{bubbles:true})); }catch(e){}
    }

    // In-memory last image dataUrl (saved alongside movement by existing save routine if it reads this key)
    // We also store to localStorage as fallback, and show preview if app has an <img id="receiptPreview">
    const LS_KEY = "ssp_last_receipt_dataurl";

    async function fileToDataURL(file){
      return await new Promise((res, rej)=>{
        const r = new FileReader();
        r.onload = ()=>res(String(r.result||""));
        r.onerror = ()=>rej(r.error||new Error("read error"));
        r.readAsDataURL(file);
      });
    }

    function guessAmount(text){
      // find patterns like 12,34 or 12.34 near € or TOTAL/TOTALE
      const t = text.replace(/\s+/g," ");
      const candidates = [];
      const re1 = /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2}))/g;
      let m;
      while((m=re1.exec(t))){
        const raw = m[1].replace(/\s/g,"").replace(/\./g,"").replace(",",".");
        const n = Number(raw);
        if (Number.isFinite(n) && n>0) candidates.push(n);
      }
      if (!candidates.length) return "";
      // prefer max value as total
      const best = Math.max.apply(null, candidates);
      return best.toFixed(2).replace(".", ",");
    }

    function guessDate(text){
      const t = text;
      let m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
      if (!m) return "";
      let d = m[1].padStart(2,"0");
      let mo = m[2].padStart(2,"0");
      let y = m[3];
      if (y.length===2) y = "20"+y;
      // Prefer input[type=date] ISO format if possible
      return `${y}-${mo}-${d}`;
    }

    async function tryOCR(dataUrl){
      // Online OCR via OCR.Space (works best on Android, avoids heavy local OCR)
      // Requires an API key in Settings (pre-filled, user can change).
      const key = String((settings && settings.ocrSpaceKey) || "").trim();
      if(!key){ throw new Error("OCR API key mancante"); }

      // Convert dataURL -> Blob
      const blob = await (await fetch(dataUrl)).blob();

      const fd = new FormData();
      fd.append("apikey", key);
      fd.append("language", (settings && settings.ocrLang) ? settings.ocrLang : (settings && settings.lang==="en" ? "eng" : "ita"));
      fd.append("isOverlayRequired", "false");
      fd.append("detectOrientation", "true");
      fd.append("scale", "true");
      fd.append("OCREngine", "2");
      fd.append("file", blob, "receipt.jpg");

      // NOTE: if a browser blocks CORS, we catch and show a clear message.
      const endpoint = (settings && settings.ocrEndpoint) ? settings.ocrEndpoint : "https://api.ocr.space/parse/image";
      const res = await fetch(endpoint, { method:"POST", body: fd });
      if(!res.ok) throw new Error("OCR HTTP " + res.status);

      const j = await res.json();
      if(j && j.IsErroredOnProcessing){
        const msg = (j.ErrorMessage && j.ErrorMessage[0]) ? j.ErrorMessage[0] : (j.ErrorMessage || "Errore OCR");
        throw new Error(msg);
      }
      const parsed = j && j.ParsedResults && j.ParsedResults[0] ? j.ParsedResults[0].ParsedText : "";
      return String(parsed || "").trim();
    }

    async function handleFile(file){
      try{
        if (!file) return;
        // accept only images
        if (!/^image\//.test(file.type || "")) return;

        const dataUrl = await fileToDataURL(file);
        try{ localStorage.setItem(LS_KEY, dataUrl); }catch(e){}
        // If app has a preview element, update it
        const prev = $("#receiptPreview") || document.querySelector("img[data-receipt-preview]");
        if (prev) prev.src = dataUrl;

        // Prefill fields from OCR (best effort)
        const amountEl = firstSel(selAmount);
        const dateEl = firstSel(selDate);
        const titleEl = firstSel(selTitle);
        const noteEl = firstSel(selNote);

        // show lightweight feedback if app has a toast
        const showToast = (msg)=>{
          try{
            const t = document.createElement("div");
            t.textContent = msg;
            t.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:110px;z-index:99999;background:rgba(0,0,0,.75);color:#fff;padding:10px 12px;border-radius:12px;font:14px system-ui;max-width:90%;";
            document.body.appendChild(t);
            setTimeout(()=>t.remove(), 1800);
          }catch(e){}
        };
        showToast("Scontrino caricato ✅");

        // Try OCR, but never block UI if slow
        const text = await tryOCR(dataUrl);
        if (!text) return;

        const amt = guessAmount(text);
        const dt = guessDate(text);

        setIfEmpty(amountEl, amt);
        setIfEmpty(dateEl, dt);

        // Merchant guess: first non-empty line (very rough)
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        if (lines.length){
          const merch = lines[0].slice(0, 40);
          setIfEmpty(titleEl, merch);
        }
        // Put raw OCR into note if empty (optional)
        if (noteEl){
          const cur = (noteEl.value||"").trim();
          if (!cur){
            noteEl.value = "Testo scontrino (OCR):\n" + lines.slice(0,12).join("\n");
            try{ noteEl.dispatchEvent(new Event("input",{bubbles:true})); }catch(e){}
          }
        }
        showToast("Importo/data rilevati (se presenti) ✅");
      }catch(e){}
    }

    function resetInputs(){
      try{ if (inCam) inCam.value=""; }catch(e){}
      try{ if (inGal) inGal.value=""; }catch(e){}
    }

    if (btnCam && inCam){
      btnCam.addEventListener("click", ()=>{ resetInputs(); inCam.click(); }, {passive:true});
      inCam.addEventListener("change", ()=>{ const f=inCam.files && inCam.files[0]; handleFile(f); }, {passive:true});
    }
    if (btnGal && inGal){
      btnGal.addEventListener("click", ()=>{ resetInputs(); inGal.click(); }, {passive:true});
      inGal.addEventListener("change", ()=>{ const f=inGal.files && inGal.files[0]; handleFile(f); }, {passive:true});
    }

    // Expose last receipt for existing save routines if they want it
    window.__sspGetLastReceipt = function(){
      try{ return localStorage.getItem(LS_KEY) || ""; }catch(e){ return ""; }
    };
  }catch(e){}
})();



// ===============================
// Tap/Touch unblock guard (v26.3) - SAFE
// If an accidental full-screen blocker is present, make it non-interactive.
// ===============================
(function tapUnblockGuard(){
  try{
    function neutralize(el){
      try{
        el.style.pointerEvents = "none";
        el.style.touchAction = "none";
      }catch(e){}
    }
    // Common blocker IDs/classes (best-effort, harmless if not present)
    const ids = ["tapBlocker","blocker","overlayBlock","uiBlocker","freezeLayer"];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (el) neutralize(el);
    });
    document.querySelectorAll(".tap-blocker,.ui-blocker,.freeze-layer,.overlayBlock").forEach(neutralize);

    // If a backdrop exists but modal is not open, ensure it's not blocking
    function sweep(){
      try{
        const backdrops = document.querySelectorAll(".modal-backdrop,.overlay,.backdrop");
        backdrops.forEach(b=>{
          const isShown = b.classList.contains("show") || b.getAttribute("aria-hidden")==="false";
          if (!isShown) neutralize(b);
        });
      }catch(e){}
    }
    sweep();
    setTimeout(sweep, 500);
    setTimeout(sweep, 1500);
  }catch(e){}
})();


// =====================================
// v26.4 receipt handler (camera+gallery) - SAFE
// Fixes: camera shot not attaching + no result on attach
// =====================================
(function receiptV264(){
  try{
    const $ = (sel) => document.querySelector(sel);

    // Inputs (hidden)
    const inCam = $("#inPhotoCam");
    const inGal = $("#inPhoto");

    // Buttons in the Add Expense sheet (they already exist in HTML from v26.1+)
    const btnCam = $("#btnReceiptCamera");
    const btnGal = $("#btnReceiptGallery");

    // UI targets (best-effort)
    const imgPreview = $("#receiptPreviewImg") || $("#imgScontrino") || $(".receipt-preview img") || $("#previewScontrino");
    const hint = $("#receiptHint") || $("#receiptStatus") || $("#ocrHint");

    // Fields to fill
    const fldAmount = $("#inAmount") || $("#amount") || $("#importo") || $('input[name="importo"]');
    const fldDate = $("#inDate") || $("#date") || $("#data") || $('input[name="data"]');
    const fldDesc = $("#inDesc") || $("#desc") || $("#descrizione") || $('input[name="descrizione"]');

    // Existing "Scanner scontrino" button (if present)
    const btnScan = $("#btnScanReceipt") || $("#scanReceipt") || $("#btnOcr") || document.querySelector('[data-action="scan-receipt"]');

    // Keep receipt image accessible to existing code
    window.__sspReceipt = window.__sspReceipt || { file: null, dataUrl: null, objectUrl: null, ocrText: "" };

    function setHint(t){
      try{
        if (hint) hint.textContent = t;
      }catch(e){}
      try{
        // If you have a toast system, try to use it
        if (window.toast && typeof window.toast === "function") window.toast(t);
      }catch(e){}
    }

    function resetInput(inp){
      if (!inp) return;
      try{ inp.value = ""; }catch(e){}
    }

    function fileToDataUrl(file){
      return new Promise((resolve, reject)=>{
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }

    function ensurePreview(url){
      try{
        if (imgPreview) imgPreview.src = url;
      }catch(e){}
    }

    // Robust euro parse
    function normEuro(s){
      s = String(s||"").trim();
      // keep digits, comma, dot
      const m = s.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/);
      return m ? m[1].replace(/\s/g,"") : "";
    }
    function toNumberEuro(s){
      s = String(s||"").trim().replace(/\s/g,"");
      if (!s) return NaN;
      // remove thousand separators
      s = s.replace(/\.(?=\d{3}(\D|$))/g,"");
      s = s.replace(/,(?=\d{3}(\D|$))/g,"");
      s = s.replace(",", ".");
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    }

    function extractFromText(text){
      const t = String(text||"");
      // date: dd/mm/yyyy or dd-mm-yy
      const dm = t.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](\d{2,4})\b/);
      let dateISO = "";
      if (dm){
        let dd = dm[1].padStart(2,"0");
        let mm = dm[2].padStart(2,"0");
        let yy = dm[3];
        if (yy.length===2) yy = "20"+yy;
        dateISO = `${yy}-${mm}-${dd}`;
      }

      // total amount heuristics
      // look for "totale", "total", "importo", "da pagare"
      const lines = t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      let cand = "";
      for (const l of lines){
        if (/totale|total|da\s*pagare|importo/i.test(l)){
          const v = normEuro(l);
          const n = toNumberEuro(v);
          if (Number.isFinite(n)) cand = v;
        }
      }
      if (!cand){
        // fallback: take the largest plausible amount found
        const all = [...t.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))/g)].map(m=>m[1]);
        let best = "";
        let bestN = -1;
        for (const a of all){
          const n = toNumberEuro(a);
          if (Number.isFinite(n) && n > bestN && n < 9999) { bestN = n; best = a; }
        }
        cand = best;
      }

      return { amount: cand, dateISO };
    }

    async function ensureTesseract(){
      if (window.Tesseract) return window.Tesseract;
      return await new Promise((resolve, reject)=>{
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        s.onload = ()=> resolve(window.Tesseract);
        s.onerror = ()=> reject(new Error("tesseract_load_failed"));
        document.head.appendChild(s);
      });
    }

    async function runOcr(file, statusEl){
  // Prefer OCR.Space (fast, lightweight). Fallback to local Tesseract only if needed.
  const setStatus = (t) => { if(statusEl) statusEl.textContent = t; };

  // Get key from settings (stored in localStorage by the app)
  let key = "";
  try{
    const s = loadSettings?.() || {};
    key = String(s.ocrSpaceKey || "").trim();
  }catch(_){}

  // 1) OCR.Space (online)
  if(key){
    try{
      setStatus("OCR online (OCR.Space)...");
      const fd = new FormData();
      fd.append("apikey", key);
      fd.append("language", "ita");
      fd.append("isOverlayRequired", "false");
      fd.append("scale", "true");
      fd.append("OCREngine", "2");
      fd.append("file", file, file.name || "receipt.jpg");

      const resp = await fetch("https://api.ocr.space/parse/image", { method:"POST", body: fd });
      const data = await resp.json();
      const parsed = (data?.ParsedResults?.[0]?.ParsedText || "").trim();
      if(parsed){
        setStatus("Testo rilevato ✅");
        return parsed;
      }
      const err = data?.ErrorMessage || data?.ErrorDetails || "";
      if(err) throw new Error(Array.isArray(err)? err.join(" | ") : String(err));
      throw new Error("Risposta OCR vuota");
    }catch(e){
      console.warn("OCR.Space failed:", e);
      setStatus("OCR online non riuscito, provo OCR offline...");
    }
  }

  // 2) Fallback: Tesseract offline (heavier, may fail on low-memory devices)
  try{
    setStatus("OCR offline (Tesseract)...");
    const Tesseract = window.Tesseract;
    if(!Tesseract) throw new Error("Tesseract non disponibile");
    const worker = await Tesseract.createWorker("ita");
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT_OSD });
    const { data } = await worker.recognize(file);
    await worker.terminate();
    const txt = (data?.text || "").trim();
    if(txt){
      setStatus("Testo rilevato ✅");
      return txt;
    }
  }catch(e){
    console.warn("Tesseract failed:", e);
  }

  setStatus("Nessun testo rilevato.");
  return "";
}

async function handleReceiptFile(file, source){
      if (!file) return;
      // preview using objectURL (fast)
      try{
        if (window.__sspReceipt.objectUrl) URL.revokeObjectURL(window.__sspReceipt.objectUrl);
      }catch(e){}
      const objectUrl = URL.createObjectURL(file);
      window.__sspReceipt.objectUrl = objectUrl;
      window.__sspReceipt.file = file;
      window.__sspReceipt.handle = handleReceiptFile;
      window.__sspReceipt.ocrText = "";
      ensurePreview(objectUrl);
      setHint(source === "cam" ? "Foto acquisita. Analisi in corso…" : "Immagine allegata. Analisi in corso…");

      // Try OCR automatically (best-effort). If it fails, don't break anything.
      let text = "";
      try{
        text = await runOcr(file);
      }catch(e){
        text = "";
      }
      window.__sspReceipt.ocrText = text || "";

      if (!text){
        setHint("Nessun dato rilevato automaticamente. Puoi compilare a mano o riprovare con Scanner scontrino.");
        return;
      }

      const { amount, dateISO } = extractFromText(text);
      let filled = 0;

      if (fldAmount && amount){
        try{
          // Normalize to comma for UI
          const n = toNumberEuro(amount);
          if (Number.isFinite(n)){
            fldAmount.value = String(n.toFixed(2)).replace(".", ",");
            filled++;
          }
        }catch(e){}
      }
      if (fldDate && dateISO){
        try{ fldDate.value = dateISO; filled++; }catch(e){}
      }
      if (fldDesc && !fldDesc.value){
        // small hint if brand/store could be detected (first non-empty line)
        try{
          const first = text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)[0] || "";
          if (first && first.length <= 28) { fldDesc.value = first; filled++; }
        }catch(e){}
      }

      setHint(filled ? "Dati rilevati ✅ Controlla e premi Salva." : "Test letto ma importo/data non riconosciuti. Compila a mano o riprova.");
    }

    // Wire buttons -> trigger inputs
    if (btnCam && inCam){
      btnCam.addEventListener("click", (e)=>{
        e.preventDefault();
        resetInput(inCam);
        try{ inCam.click(); }catch(err){}
      }, { passive:false });
    }
    if (btnGal && inGal){
      btnGal.addEventListener("click", (e)=>{
        e.preventDefault();
        resetInput(inGal);
        try{ inGal.click(); }catch(err){}
      }, { passive:false });
    }

    // Wire change events
    if (inCam){
      inCam.addEventListener("change", async ()=>{
        const f = inCam.files && inCam.files[0];
        await handleReceiptFile(f, "cam");
      });
    }
    if (inGal){
      inGal.addEventListener("change", async ()=>{
        const f = inGal.files && inGal.files[0];
        await handleReceiptFile(f, "gal");
      });
    }

    // If user presses existing scanner button, re-run OCR on last file
    if (btnScan){
      btnScan.addEventListener("click", async (e)=>{
        try{
          const f = window.__sspReceipt.file;
          if (!f){ setHint("Prima allega o fai una foto dello scontrino."); return; }
          await handleReceiptFile(f, "scan");
        }catch(err){}
      });
    }
  }catch(e){}
})();


// =====================================