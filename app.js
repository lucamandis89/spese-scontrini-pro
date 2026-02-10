(() => {
  "use strict";

  const APP = {
    dbName: "spese_scontrini_pro_db",
    dbVersion: 2,
    store: "expenses",
    settingsKey: "ssp_settings_v7",
    freeLimitExpenses: 30,
    freeLimitPdfPerMonth: 3,
    photoMaxSide: 1600,
    photoJpegQuality: 0.78
  };

  const CATEGORIES = [
    "Alimentari","Benzina","Casa","Bollette","Farmacia / Mediche","Bambini",
    "Animali","Lavoro","Ristorante / Bar","Viaggi","Scuola","Assicurazioni","Altro"
  ];


  const INCOME_CATEGORIES = [
    "Stipendio","Assegno","Bonus","Vendita","Rimborso","Altro"
  ];

  const DOC_CATEGORIES = [
    "Assicurazioni","Bollette","ISEE / CAF","Garanzie","Casa","Auto","Scuola","Lavoro","Salute","Altro"
  ];


  const CAF_CATEGORIES = new Set([
    "Farmacia / Mediche", "Scuola", "Bambini", "Assicurazioni", "Casa", "Bollette"
  ]);

  const PROFILES = ["Tutti","Io","Casa","Bambini","Lavoro","Altro"];

  const QUICK_PRESETS = [
    {label:"🍝 Alimentari", amount:10, category:"Alimentari"},
    {label:"⛽ Benzina", amount:20, category:"Benzina"},
    {label:"🏠 Casa", amount:15, category:"Casa"},
    {label:"💡 Bollette", amount:30, category:"Bollette"},
    {label:"💊 Farmacia", amount:15, category:"Farmacia / Mediche"},
    {label:"👶 Bambini", amount:10, category:"Bambini"}
  ];


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
    const v = String(s ?? "").trim().replace(/\./g,"").replace(",",".");
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
    return String(s ?? "").replace(/[&<>"']/g, (m)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }
  function haptic(ms=10){ try{ navigator.vibrate && navigator.vibrate(ms); }catch{} }
  function isCaf(category){ return CAF_CATEGORIES.has(category); }

  async function sha256Hex(str){
    if(window.crypto && crypto.subtle){
      const enc = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
    }
    // fallback (non-criptografico, ma evita crash)
    let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))>>>0; }
    return "fallback_"+h.toString(16);
  }

  function isUnlocked(){
    try{ return sessionStorage.getItem("ssp_unlocked")==="1"; }catch{ return false; }
  }
  function setUnlocked(v){
    try{ sessionStorage.setItem("ssp_unlocked", v ? "1":"0"); }catch{}
  
  // ---------------- BIOMETRIA (WebAuthn/Passkey) ----------------
  function b64urlFromBuf(buf){
    const bytes = new Uint8Array(buf);
    let str = "";
    for(const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function bufFromB64url(b64url){
    const b64 = b64url.replace(/-/g,"+").replace(/_/g,"/");
    const pad = "===".slice((b64.length + 3) % 4);
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function bioSupported(){
    return (typeof PublicKeyCredential !== "undefined") && navigator.credentials && window.isSecureContext;
  }
  async function enableBiometrics(){
    if(!bioSupported()){
      alert("Impronta non supportata su questo dispositivo/browser.\nSuggerimento: usa HTTPS (GitHub Pages) e un browser moderno.");
      return;
    }
    try{
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const publicKey = {
        rp: { name: "Spese & Scontrini PRO" },
        user: { id: userId, name: "utente", displayName: "Utente" },
        challenge,
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { userVerification: "required" },
        timeout: 60000,
        attestation: "none"
      };
      const cred = await navigator.credentials.create({ publicKey });
      if(!cred || !cred.rawId) throw new Error("Credenziale non creata");
      settings.bioCredId = b64urlFromBuf(cred.rawId);
      settings.bioEnabled = true;
      saveSettings();
      toast("Impronta attivata ✅");
    }catch(e){
      console.warn(e);
      toast("Impronta non attivata");
    }
  }
  async function disableBiometrics(){
    settings.bioEnabled = false;
    settings.bioCredId = "";
    saveSettings();
    toast("Impronta disattivata");
  }
  async function unlockWithBiometrics(){
    if(!settings.bioEnabled || !settings.bioCredId){
      toast("Impronta non attiva");
      return;
    }
    if(!bioSupported()){
      toast("Impronta non supportata");
      return;
    }
    try{
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const publicKey = {
        challenge,
        allowCredentials: [{ type:"public-key", id: bufFromB64url(settings.bioCredId) }],
        userVerification: "required",
        timeout: 60000
      };
      const assertion = await navigator.credentials.get({ publicKey });
      if(!assertion) throw new Error("No assertion");
      setUnlocked(true);
      hideLock();
      toast("Sbloccato con impronta ✅");
    }catch(e){
      console.warn(e);
      toast("Impronta fallita");
      haptic(25);
    }
  }

  // ---------------- PREFERITI CATEGORIE ----------------
  function renderFavCats(){
    const wrap = $("#favCats");
    if(!wrap) return;
    const fav = new Set((settings.favCategories||[]).filter(c=>CATEGORIES.includes(c)));
    wrap.innerHTML = CATEGORIES.map(c=>`
      <label class="prefItem">
        <input type="checkbox" data-fav="${escapeHtml(c)}" ${fav.has(c)?"checked":""}>
        <span>${escapeHtml(c)}</span>
      </label>
    `).join("");
  }

  function saveFavCatsFromUI(){
    const checks = Array.from(document.querySelectorAll('#favCats [data-fav]'));
    const fav = checks.filter(i=>i.checked).map(i=>i.getAttribute("data-fav"));
    // limite: max 8 per mantenere UI pulita
    settings.favCategories = fav.slice(0,8);
    saveSettings();
    fillCategories();
    renderQuickAdd();
    toast("Preferiti salvati ✅");
  }

  function resetFavCats(){
    settings.favCategories = ["Alimentari","Benzina","Farmacia / Mediche","Casa"];
    saveSettings();
    fillCategories();
    renderQuickAdd();
    renderFavCats();
    toast("Preferiti ripristinati");
  }
}

  function disableAppUI(dis){
    document.querySelectorAll(".navBtn, #fabAdd, #goArchive, #goReport, #btnProToggle").forEach(el=>{
      if(!el) return;
      el.disabled = !!dis;
      el.style.opacity = dis ? ".55" : "";
      el.style.pointerEvents = dis ? "none" : "";
    });
  }

  function showLock(){
    const m = $("#modalLock");
    if(!m) return;
    m.classList.add("show");
    m.setAttribute("aria-hidden","false");
    disableAppUI(true);
    $("#lockPin").value = "";
    const b = $("#btnUnlockBio");
    if(b){ b.style.display = (settings.bioEnabled && settings.bioCredId) ? "inline-flex" : "none"; }
        if(settings.bioEnabled && settings.bioCredId && !settings.pinHash){ $("#btnUnlockBio")?.focus(); }
    else { $("#lockPin").focus(); }
  }
  function hideLock(){
    const m = $("#modalLock");
    if(!m) return;
    m.classList.remove("show");
    m.setAttribute("aria-hidden","true");
    disableAppUI(false);
  }


  function normProfile(p){
    p = String(p||"").trim();
    if(!p) return "Io";
    if(!PROFILES.includes(p)) return "Io";
    return p;
  }
  function activeProfile(){
    const p = normProfile(settings.activeProfile);
    return p;
  }
  function isAllProfiles(){
    return activeProfile() === "Tutti";
  }

  // ---------------- SETTINGS ----------------
  function loadSettings(){
    try { return JSON.parse(localStorage.getItem(APP.settingsKey)||"{}"); }
    catch { return {}; }
  }
  const settings = loadSettings();
  settings.isPro = !!settings.isPro;
  settings.pdfCountByMonth = settings.pdfCountByMonth || {};
  settings.viewMode = settings.viewMode || "list"; // list | timeline
  settings.budgetByMonth = settings.budgetByMonth || {}; // legacy { "YYYY-MM": cents }
  settings.profileBudgets = settings.profileBudgets || {}; // { profile: { "YYYY-MM": cents } }
  settings.activeProfile = typeof settings.activeProfile === "string" ? settings.activeProfile : "Io";
  settings.favCategories = Array.isArray(settings.favCategories) ? settings.favCategories : ["Alimentari","Benzina","Farmacia / Mediche","Casa"];
  settings.bioEnabled = !!settings.bioEnabled;
  settings.bioCredId = typeof settings.bioCredId === "string" ? settings.bioCredId : "";

  settings.wallets = Array.isArray(settings.wallets) && settings.wallets.length
    ? settings.wallets
    : [{ id:"w_cash", name:"Contanti", initialCents:0 }, { id:"w_card", name:"Carta", initialCents:0 }];

  

  settings.partnerName = typeof settings.partnerName === "string" && settings.partnerName.trim() ? settings.partnerName.trim() : "Partner";
  settings.defaultSplit = typeof settings.defaultSplit === "string" ? settings.defaultSplit : "mine"; // mine|partner|half|custom
  settings.defaultSplitMinePct = Number.isFinite(settings.defaultSplitMinePct) ? settings.defaultSplitMinePct : 50;

  settings.rules = Array.isArray(settings.rules) ? settings.rules : [];
settings.docNotifyDays = Number.isFinite(settings.docNotifyDays) ? settings.docNotifyDays : 30;
  settings.bankImportEnabled = !!settings.bankImportEnabled;
  settings.bankShareEnabled = !!settings.bankShareEnabled;


  // MIGRAZIONE: se esiste budgetByMonth (vecchio) e non ci sono budget profili, spostalo su "Io"
  if(Object.keys(settings.budgetByMonth||{}).length && Object.keys(settings.profileBudgets||{}).length===0){
    settings.profileBudgets["Io"] = Object.assign({}, settings.budgetByMonth);
  }
  saveSettings();

  function saveSettings(){
    localStorage.setItem(APP.settingsKey, JSON.stringify(settings));
  }


  function updatePartnerLabels(){
    const name = settings.partnerName || "Partner";
    ["#partnerLabel1","#partnerLabel2","#partnerLabel3","#partnerLabel4"].forEach(id=>{
      const el = $(id);
      if(el) el.textContent = name;
    });
  }

  function setSplitMode(mode){
    splitMode = (mode === "partner" || mode === "half" || mode === "custom") ? mode : "mine";
    updateSplitUI();
  }

  function updateSplitUI(){
    const bMine = $("#splitMine"), bPar = $("#splitPartner"), bHalf = $("#splitHalf"), bCus = $("#splitCustom");
    if(!bMine) return;
    bMine.classList.toggle("active", splitMode==="mine");
    bPar.classList.toggle("active", splitMode==="partner");
    bHalf.classList.toggle("active", splitMode==="half");
    bCus.classList.toggle("active", splitMode==="custom");

    const row = $("#splitCustomRow");
    if(row) row.style.display = (splitMode==="custom") ? "grid" : "none";

    const mine = $("#splitMinePct");
    const par = $("#splitPartnerPct");
    if(mine && par){
      const m = Math.max(0, Math.min(100, Number(splitMinePct)||0));
      mine.value = String(m);
      par.value = String(100 - m);
    }
  }

  function setSplitFromSettings(){
    setSplitMode(settings.defaultSplit || "mine");
    splitMinePct = Number.isFinite(settings.defaultSplitMinePct) ? settings.defaultSplitMinePct : 50;
    if(splitMode !== "custom") splitMinePct = (splitMode==="half") ? 50 : splitMinePct;
    updateSplitUI();
  }

  function applyRules(note, current){
    // current: {category, walletId, profile}
    const rules = Array.isArray(settings.rules) ? settings.rules : [];
    if(!note || !rules.length) return current;
    const n = note.toLowerCase();

    // define defaults
    const defaultCategory = "Alimentari";
    const defaultWallet = (settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash";
    const defaultProfile = isAllProfiles() ? "Io" : activeProfile();

    let out = {...current};

    for(const r of rules){
      if(!r || !r.enabled) continue;
      const key = String(r.key||"").trim().toLowerCase();
      if(!key) continue;
      if(!n.includes(key)) continue;

      const safe = !!r.safe; // apply only if default
      if(r.category){
        if(!safe || out.category === defaultCategory) out.category = r.category;
      }
      if(r.walletId){
        if(!safe || out.walletId === defaultWallet) out.walletId = r.walletId;
      }
      if(r.profile){
        if(!safe || out.profile === defaultProfile) out.profile = r.profile;
      }
      // first match wins? keep applying but last can override; ok.
    }
    return out;
  }

  function renderRulesList(){
    const box = $("#rulesList");
    if(!box) return;
    const rules = Array.isArray(settings.rules) ? settings.rules : [];
    if(!rules.length){
      box.innerHTML = `<div class="hint">Nessuna regola. Esempio: keyword “q8” → categoria Benzina.</div>`;
      return;
    }
    box.innerHTML = rules.map((r, i)=>`
      <div class="ruleItem">
        <div class="top">
          <div class="k">${escapeHtml(r.key||"")}</div>
          <button class="btn small bad" data-delrule="${i}" type="button">🗑️</button>
        </div>
        <div class="meta">
          ${r.enabled ? "Attiva" : "Disattivata"} • ${r.safe ? "Safe" : "Sovrascrive"} •
          Cat: ${escapeHtml(r.category||"—")} • Port: ${escapeHtml(walletName(r.walletId)||"—")} • Profilo: ${escapeHtml(r.profile||"—")}
        </div>
      </div>
    `).join("");
    box.querySelectorAll("[data-delrule]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-delrule"));
        if(!Number.isFinite(idx)) return;
        if(!confirm("Eliminare questa regola?")) return;
        settings.rules.splice(idx,1);
        saveSettings();
        renderRulesList();
        toast("Regola eliminata");
      });
    });
  }

  function walletName(id){
    const w = (settings.wallets||[]).find(x=>x.id===id);
    return w ? w.name : "";
  }

  function renderCoupleSummary(){
    const month = $("#rMonth")?.value || monthNow();
    const profileFilter = $("#rProfile")?.value || "Tutti";
    const partner = settings.partnerName || "Partner";

    const mineEl = $("#minePaidForPartner");
    const parEl  = $("#partnerPaidForMe");
    const netEl  = $("#coupleNet");
    const whoEl  = $("#coupleWho");

    if(!mineEl || !parEl || !netEl || !whoEl) return;

    let list = all.filter(x=>x.month===month && x.type==="expense");
    if(profileFilter && profileFilter !== "Tutti"){
      list = list.filter(x=>x.profile===profileFilter);
    }

    let minePaidForPartner = 0;
    let partnerPaidForMe = 0;

    for(const x of list){
      const amount = Number(x.amount)||0;
      const mode = x.splitMode || "mine";
      const minePct = Number.isFinite(x.splitMinePct) ? x.splitMinePct : 50;

      if(mode === "partner"){
        partnerPaidForMe += amount;
      } else if(mode === "half"){
        minePaidForPartner += amount * 0.5;
      } else if(mode === "custom"){
        const m = Math.max(0, Math.min(100, minePct));
        minePaidForPartner += amount * ((100 - m)/100);
      }
    }

    mineEl.textContent = euro(minePaidForPartner);
    parEl.textContent = euro(partnerPaidForMe);

    const net = minePaidForPartner - partnerPaidForMe;
    if(net > 0.009){
      netEl.textContent = `${partner} ti deve ${euro(net)}`;
      whoEl.textContent = `${partner} → deve`;
    } else if(net < -0.009){
      netEl.textContent = `Tu devi ${euro(Math.abs(net))} a ${partner}`;
      whoEl.textContent = `Tu → devi`;
    } else {
      netEl.textContent = "Siete pari ✅";
      whoEl.textContent = "Pari";
    }
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
        name==="report" ? "Report • PDF + Analisi categorie" :
        name==="docs" ? "Documenti • Scadenze • Garanzie" :
        "Impostazioni • Sicurezza • Preferiti";
    }
    if(name==="archive") renderArchive();
    if(name==="report") renderAnalysis();
    if(name==="docs") renderDocs();
    if(name==="settings"){ renderFavCats(); }

    if(name==="settings"){
      renderRulesList();
      updatePartnerLabels();
    }
  }


  // ---------------- DB ----------------
  let db=null;
  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(APP.dbName, APP.dbVersion);
      req.onupgradeneeded=()=>{
        const _db=req.result;

        // movements
        if(!_db.objectStoreNames.contains(APP.store)){
          const st=_db.createObjectStore(APP.store,{keyPath:"id"});
          st.createIndex("by_date","date",{unique:false});
          st.createIndex("by_month","month",{unique:false});
          st.createIndex("by_category","category",{unique:false});
          st.createIndex("by_profile","profile",{unique:false});
          st.createIndex("by_wallet","walletId",{unique:false});
          st.createIndex("by_type","type",{unique:false});
        } else {
          // ensure indexes exist (best-effort, no crash)
          try{
            const st=req.transaction.objectStore(APP.store);
            if(!st.indexNames.contains("by_profile")) st.createIndex("by_profile","profile",{unique:false});
            if(!st.indexNames.contains("by_wallet")) st.createIndex("by_wallet","walletId",{unique:false});
            if(!st.indexNames.contains("by_type")) st.createIndex("by_type","type",{unique:false});
          }catch{}
        }

        // documents
        if(!_db.objectStoreNames.contains("docs")){
          const ds=_db.createObjectStore("docs",{keyPath:"id"});
          ds.createIndex("by_due","due",{unique:false});
          ds.createIndex("by_warranty","warranty",{unique:false});
          ds.createIndex("by_category","category",{unique:false});
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

  // ---------------- DOCS DB ----------------
  function txDocs(mode="readonly"){
    return db.transaction("docs", mode).objectStore("docs");
  }
  function docsGetAll(){
    return new Promise((resolve,reject)=>{
      const req=txDocs("readonly").getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
    });
  }
  function docsPut(item){
    return new Promise((resolve,reject)=>{
      const req=txDocs("readwrite").put(item);
      req.onsuccess=()=>resolve(true);
      req.onerror=()=>reject(req.error);
    });
  }
  function docsDelete(id){
    return new Promise((resolve,reject)=>{
      const req=txDocs("readwrite").delete(id);
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
  let currentType = "expense";
  let modalCurrentId=null;

  // scanner state
  let scanImg=null;
  let scanRotate=0;
  let scanContrast=1.15;
  let scanBright=8;
  let cropMargins={l:2,r:2,t:2,b:2};
  let previewPhoto=null;
  // couple split (for expenses)
  let splitMode = "mine"; // mine|partner|half|custom
  let splitMinePct = 50;

  function fillCategories(){
    // profiles
    const profiles = Array.isArray(settings.profiles) && settings.profiles.length ? settings.profiles : ["Io","Casa","Bambini","Lavoro","Altro"];
    $("#inProfile").innerHTML = profiles.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    $("#activeProfile").innerHTML = `<option value="__ALL__">Tutti</option>` + profiles.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    $("#rProfile").innerHTML = `<option value="__ALL__">Tutti</option>` + profiles.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

    // categories (expense)
    const fav = (settings.favCategories||[]).filter(c=>CATEGORIES.includes(c));
    const rest = CATEGORIES.filter(c=>!fav.includes(c));
    const ordered = fav.concat(rest);
    $("#inCategory").innerHTML = ordered.map(c=>`<option value="${escapeHtml(c)}">${fav.includes(c) ? "⭐ " : ""}${escapeHtml(c)}</option>`).join("");
    $("#fCategory").innerHTML = `<option value="">Tutte</option>` + CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

    // wallets
    const ws = settings.wallets || [];
    $("#inWallet").innerHTML = ws.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");


    // bank import selects (if present)
    if($("#bankProfile")) $("#bankProfile").innerHTML = profiles.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    if($("#bankCategory")) $("#bankCategory").innerHTML = CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if($("#bankWallet")) $("#bankWallet").innerHTML = ws.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join("");

    // docs categories
    $("#dCategory").innerHTML = `<option value="">Tutte</option>` + DOC_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("#dCatIn").innerHTML = DOC_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function fillProfiles(){
    const optsAll = PROFILES.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    const optsNoAll = PROFILES.filter(p=>p!=="Tutti").map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

    const selActive = $("#activeProfile");
    if(selActive){
      selActive.innerHTML = optsAll;
      selActive.value = activeProfile();
    }

    const selIn = $("#inProfile");
    if(selIn){
      selIn.innerHTML = optsNoAll;
      selIn.value = isAllProfiles() ? "Io" : activeProfile();
    }

    const selF = $("#fProfile");
    if(selF){
      selF.innerHTML = optsAll;
      selF.value = activeProfile();
    }

    const selR = $("#rProfile");
    if(selR){
      selR.innerHTML = optsAll;
      selR.value = activeProfile();
    }

    const selAna = $("#anaProfile");
    if(selAna){
      selAna.innerHTML = optsAll;
      selAna.value = activeProfile();
    }
  }


  function applyFilters(){
    const m = $("#fMonth").value || "";
    const c = $("#fCategory").value || "";
    const p = $("#fProfile")?.value || activeProfile();
    const q = ($("#fSearch").value || "").trim().toLowerCase();

    let list = all.slice();
    if(m) list = list.filter(x=>x.month===m);
    if(c) list = list.filter(x=>x.category===c);
    if(p && p!=="Tutti") list = list.filter(x=>normProfile(x.profile)===p);
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

  function setMoveType(t){
    currentType = (t === "income") ? "income" : "expense";
    $("#typeExpense").classList.toggle("active", currentType==="expense");
    $("#typeIncome").classList.toggle("active", currentType==="income");
    // swap category list
    const sel = $("#inCategory");
    if(currentType==="income"){
      sel.innerHTML = INCOME_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    } else {
      const fav = (settings.favCategories||[]).filter(c=>CATEGORIES.includes(c));
      const rest = CATEGORIES.filter(c=>!fav.includes(c));
      const ordered = fav.concat(rest);
      sel.innerHTML = ordered.map(c=>`<option value="${escapeHtml(c)}">${fav.includes(c) ? "⭐ " : ""}${escapeHtml(c)}</option>`).join("");
    }

    const sb = $("#splitBlock");
    if(sb) sb.style.display = (currentType==="expense") ? "block" : "none";
  }

  function calcStats(){
    const mNow=monthNow();
    const yNow=String(new Date().getFullYear());
    const ap = activeProfile();
    const monthList = all.filter(x=>x.month===mNow && (ap==="Tutti" || normProfile(x.profile)===ap));
    const yearList  = all.filter(x=>(x.date||"").startsWith(yNow+"-") && (ap==="Tutti" || normProfile(x.profile)===ap));
    const monthTotal = monthList.reduce((s,x)=>s+(+x.amount||0),0);
    const yearTotal  = yearList.reduce((s,x)=>s+(+x.amount||0),0);
    $("#statMonth").textContent = euro(monthTotal);
    $("#statYear").textContent = euro(yearTotal);
    renderBudgetHome(monthTotal, mNow, ap);
    renderWalletsHome();
    renderDocsHomeSoon();
    renderAssistant(monthList, mNow, ap);
  }

  function renderAssistant(monthList, month, profile){
    const box = $("#assistBody");
    const sub = $("#assistSub");
    if(!box || !sub) return;

    const pr = normProfile(profile || activeProfile());
    if(pr==="Tutti"){
      box.textContent = "Seleziona un profilo per vedere l'assistente risparmio (serve un budget dedicato).";
      sub.textContent = "Suggerimento: imposta un profilo (Io/Casa/...)";
      return;
    }

    const total = monthList.reduce((s,x)=>s+(+x.amount||0),0);
    const bc = getBudgetCents(month, pr);
    const today = new Date();
    const day = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();

    const dailyAvg = day>0 ? (total / day) : total;
    const projected = dailyAvg * daysInMonth;

    let msg = `Finora questo mese (${month}) nel profilo ${pr} hai speso ${euro(total)}.`;
    const kpis = [];

    kpis.push(`<span class="chip">Media/giorno: <b>${euro(dailyAvg)}</b></span>`);
    kpis.push(`<span class="chip">Stima fine mese: <b>${euro(projected)}</b></span>`);

    if(bc){
      const budget = bc/100;
      const remaining = budget - total;
      const pct = budget>0 ? Math.round((total/budget)*100) : 0;
      kpis.push(`<span class="chip">Budget: <b>${euro(budget)}</b></span>`);
      kpis.push(`<span class="chip">${remaining>=0 ? "Restano" : "Sforato"}: <b>${euro(Math.abs(remaining))}</b></span>`);
      kpis.push(`<span class="chip">Uso: <b>${pct}%</b></span>`);

      if(projected > budget){
        msg += ` ⚠️ Con l'andamento attuale rischi di chiudere a ${euro(projected)} (sopra budget).`;
      } else {
        msg += ` ✅ Con l'andamento attuale sei dentro budget.`;
      }
    } else {
      msg += " Imposta un budget per avere avvisi e previsioni.";
    }

    sub.textContent = "Offline • Nessun login • Consigli basati sui tuoi dati";
    box.innerHTML = `${msg}<div class="kpi">${kpis.join("")}</div>`;
  }

  function getQuickPresets(){
    const icon = {
      "Alimentari":"🍝",
      "Benzina":"⛽",
      "Casa":"🏠",
      "Bollette":"💡",
      "Farmacia / Mediche":"💊",
      "Bambini":"👶",
      "Ristorante / Bar":"🍽️",
      "Viaggi":"✈️",
      "Assicurazioni":"🛡️",
      "Lavoro":"💼",
      "Animali":"🐾",
      "Scuola":"🎓",
      "Altro":"⭐"
    };
    const defAmount = {
      "Alimentari":10,
      "Benzina":20,
      "Casa":15,
      "Bollette":30,
      "Farmacia / Mediche":15,
      "Bambini":10,
      "Ristorante / Bar":15,
      "Viaggi":30,
      "Assicurazioni":25,
      "Lavoro":10,
      "Animali":10,
      "Scuola":15,
      "Altro":10
    };
    const fav = (settings.favCategories||[]).filter(c=>CATEGORIES.includes(c));
    const base = fav.length ? fav.slice(0,6) : ["Alimentari","Benzina","Casa","Bollette","Farmacia / Mediche","Bambini"];
    return base.map(c=>({
      label:`${icon[c]||"⭐"} ${c.replace(" / Mediche","").replace("Ristorante / Bar","Ristorante")}`,
      amount: defAmount[c] ?? 10,
      category: c
    }));
  }

  function renderQuickAdd(){
    const grid = $("#quickGrid");
    if(!grid) return;

    const presets = getQuickPresets();

    grid.innerHTML = presets.map((p,i)=>`
      <button class="qbtn" type="button" data-q="${i}">
        <div class="qTop">
          <div class="qLabel">${escapeHtml(p.label)}</div>
          <div class="qAmt">${euro(p.amount)}</div>
        </div>
        <div class="qSub">${escapeHtml(settings.activeProfile || "Io")} • ${escapeHtml(p.category)}</div>
      </button>
    `).join("");

    grid.querySelectorAll("[data-q]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const i = Number(btn.getAttribute("data-q"));
        const p = presets[i];
        if(!p) return;
        await quickAdd(p);
      });
    });
  }

  function showTips(){
    const ap = activeProfile();
    if(ap==="Tutti"){ toast("Scegli un profilo per i consigli"); return; }
    const mNow = monthNow();
    const list = all.filter(x=>x.month===mNow && normProfile(x.profile)===ap);
    const total = list.reduce((s,x)=>s+(+x.amount||0),0);
    const bc = getBudgetCents(mNow, ap);
    const budget = bc ? bc/100 : null;

    const byCat = new Map();
    for(const x of list){
      const k=x.category||"Altro";
      byCat.set(k,(byCat.get(k)||0)+(+x.amount||0));
    }
    const top = [...byCat.entries()].sort((a,b)=>b[1]-a[1])[0];

    let tip = "💡 Consiglio: ";
    if(top) tip += `la categoria più alta è "${top[0]}" (${euro(top[1])}). `;
    if(budget){
      if(total > budget) tip += `Hai superato il budget di ${euro(total-budget)}. Prova a fissare un tetto settimanale.`;
      else tip += `Se vuoi risparmiare, prova a ridurre del 5–10% "${top?top[0]:"una categoria"}".`;
    } else {
      tip += "imposta un budget per avere avvisi automatici e previsioni fine mese.";
    }
    toast(tip, 2600);
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
          <div class="title">${escapeHtml(x.note|| (x.type==="income" ? "Entrata" : "Spesa"))}${cafBadgeHtml(x.category)}</div>
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
          <div class="title">${escapeHtml(x.note|| (x.type==="income" ? "Entrata" : "Spesa"))}${cafBadgeHtml(x.category)}</div>
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
            <div class="title">${escapeHtml(x.note|| (x.type==="income" ? "Entrata" : "Spesa"))}${cafBadgeHtml(x.category)}</div>
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
    try{ docsAll = await docsGetAll(); }catch{ docsAll = []; }
    // normalizza profilo per compatibilità con vecchi dati
    all = all.map(x=>({ ...x, profile: normProfile(x.profile) }));
    setProUI();
    calcStats();
    renderRecent();
    renderArchive();
    renderAnalysis();
  }

  // ---------------- MODALS ----------------
  function showModal(id){ const m=$(id); m.classList.add("show"); m.setAttribute("aria-hidden","false"); }
  function hideModal(id){ const m=$(id); m.classList.remove("show"); m.setAttribute("aria-hidden","true"); }

  function openAdd(){
    editId=null;
    previewPhoto=null;
    scanImg=null;
    $("#addTitle").textContent="➕ Nuovo movimento";
    setMoveType("expense");
    $("#inAmount").value="";
    $("#inDate").value=todayISO();
    $("#inProfile").value = isAllProfiles() ? "Io" : activeProfile();
    $("#inCategory").value="Alimentari";
    $("#inWallet").value = (settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash";
    $("#inNote").value="";
    $("#inPhoto").value="";
    updatePartnerLabels();
    setSplitFromSettings();

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
    const pr = normProfile(x.profile);
    $("#mMeta").textContent = `${x.date} • ${x.category}${isCaf(x.category) ? " • Detraibile (CAF)" : ""} • ${x.month} • ${pr}`;
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

    $("#addTitle").textContent="✏️ Modifica movimento";
    setMoveType(x.type || "expense");
    $("#inAmount").value=String(x.amount).replace(".",",");
    $("#inDate").value=x.date;
    $("#inProfile").value = normProfile(x.profile);
    $("#inCategory").value=x.category;
    $("#inWallet").value = x.walletId || ((settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash");
    $("#inNote").value=x.note||"";
    $("#inPhoto").value="";
    updatePartnerLabels();
    splitMode = x.splitMode || "mine";
    splitMinePct = Number.isFinite(x.splitMinePct) ? x.splitMinePct : 50;
    updateSplitUI();

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
  function getBudgetCents(month, profile){
    profile = normProfile(profile || activeProfile());
    if(profile==="Tutti") return null;
    const map = settings.profileBudgets[profile] || {};
    const v = map[month];
    return Number.isFinite(v) ? v : null;
  }
  function setBudgetCents(month, profile, cents){
    profile = normProfile(profile || activeProfile());
    if(profile==="Tutti") return;
    settings.profileBudgets[profile] = settings.profileBudgets[profile] || {};
    if(cents == null) delete settings.profileBudgets[profile][month];
    else settings.profileBudgets[profile][month] = cents;
    saveSettings();
  }

  function renderBudgetHome(monthTotal, month, profile){
    const bc = getBudgetCents(month, profile);
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
    const pr = normProfile(profile || activeProfile());
    sub.textContent = `Mese ${month} • Profilo: ${pr} • Budget: ${euro(budget)}`;
    left.textContent = remaining >= 0 ? `Restano: ${euro(remaining)}` : `Sforato: ${euro(Math.abs(remaining))}`;
    pct.textContent = `${percent}%`;

    if(used > budget) toast("⚠️ Budget superato", 1200);
  }

  function openBudgetModal(){
    const ap = activeProfile();
    if(ap==="Tutti"){ toast("Scegli un profilo (non Tutti) per impostare il budget"); return; }
    const m = $("#fMonth")?.value || monthNow();
    const bc = getBudgetCents(m, ap);
    $("#budgetInput").value = bc ? String((bc/100).toFixed(2)).replace(".",",") : "";
    showModal("#modalBudget");
  }
  function closeBudgetModal(){ hideModal("#modalBudget"); }

  // ---------------- ANALISI (GRAFICO) ----------------
  function groupByCategoryForMonth(month, profile, onlyCaf){
    profile = normProfile(profile || activeProfile());
    const map = new Map();
    for(const x of all){
      if(x.month !== month) continue;
      if(profile!=="Tutti" && normProfile(x.profile)!==profile) continue;
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

    const month = $("#rMonth")?.value || monthNow();
    const onlyCaf = !!$("#anaOnlyCaf")?.checked;
    const profile = $("#anaProfile")?.value || $("#rProfile")?.value || activeProfile();

    const map = groupByCategoryForMonth(month, profile, onlyCaf);
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

    renderCoupleSummary();
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
    const profile = normProfile($("#inProfile")?.value || (isAllProfiles() ? "Io" : activeProfile()));
    const category = $("#inCategory").value;
    const note = ($("#inNote").value || "").trim();

    // Auto-regole: applica solo su nuove SPESE
    if(!editId && type==="expense"){
      const applied = applyRules(note, { category, walletId, profile });
      if(applied.category) $("#inCategory").value = applied.category;
      if(applied.walletId) $("#inWallet").value = applied.walletId;
      if(applied.profile) $("#inProfile").value = applied.profile;
    }
    const file = $("#inPhoto").files && $("#inPhoto").files[0];

    const type = currentType;
    const walletId = $("#inWallet")?.value || ((settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash");

    if(!Number.isFinite(amount) || amount<=0){ toast("Importo non valido"); haptic(18); return; }
    if(!date){ toast("Seleziona una data"); haptic(18); return; }

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
      type,
      walletId,
      profile,
      category,
      note: note || category,
      splitMode: (type==="expense" ? splitMode : "mine"),
      splitMinePct: (type==="expense" ? (splitMode==="half" ? 50 : (splitMode==="custom" ? Math.max(0, Math.min(100, Number(splitMinePct)||50)) : (splitMode==="partner" ? 0 : 100))) : 100),
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

  async function generatePdf(mode, targetMonth, profile){
    profile = normProfile(profile || activeProfile());
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert("PDF non disponibile (jsPDF non caricato).");
      return;
    }
    if(!canGeneratePdf()) return;

    let list = all.filter(x=>x.month===targetMonth && (profile==="Tutti" || normProfile(x.profile)===profile));
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
        budgetByMonth: settings.budgetByMonth,
        profileBudgets: settings.profileBudgets,
        activeProfile: settings.activeProfile
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
          profile:normProfile(x.profile),
          category:String(x.category||"Altro"),
          note:String(x.note||""),
          photo: x.photo ? String(x.photo) : null
        });
        added++;
      }

      if(payload.settings){
        if(typeof payload.settings.viewMode === "string") settings.viewMode = payload.settings.viewMode;
        if(payload.settings.budgetByMonth && typeof payload.settings.budgetByMonth==="object") settings.budgetByMonth = payload.settings.budgetByMonth;
        if(payload.settings.profileBudgets && typeof payload.settings.profileBudgets==="object") settings.profileBudgets = payload.settings.profileBudgets;
        if(typeof payload.settings.activeProfile === "string") settings.activeProfile = payload.settings.activeProfile;
        if(payload.settings.pdfCountByMonth && typeof payload.settings.pdfCountByMonth==="object") settings.pdfCountByMonth = payload.settings.pdfCountByMonth;
        saveSettings();
      }

      toast(`Import OK (+${added}) ✅`);
      await refresh();
    }catch{
      alert("Errore import: file non valido.");
    }
  }


  // ---------------- RICORRENTI ----------------
  function recurringExists(month, recId){
    return all.some(x => x.month===month && x.recurringId===recId);
  }

  async function applyRecurringForMonth(month){
    const recs = (settings.recurring||[]).filter(r=>r && r.enabled!==false);
    if(recs.length===0) return;

    let created = 0;
    for(const r of recs){
      if(!r.id) continue;
      if(recurringExists(month, r.id)) continue;

      const day = Math.max(1, Math.min(28, Number(r.day)||1));
      const date = `${month}-${String(day).padStart(2,"0")}`;

      const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const item = {
        id,
        amount: Number(r.amount)||0,
        date,
        month,
        category: r.category || "Altro",
        note: (r.title || "Ricorrente") + " (Ricorrente)",
        photo: null,
        profile: r.profile || "Io",
        recurringId: r.id
      };
      await dbPut(item);
      created++;
    }
    if(created>0) toast(`Ricorrenti generate: +${created} ✅`, 1700);
  }

  function renderRecurringList(){
    const el = $("#recList");
    if(!el) return;
    const recs = settings.recurring || [];
    if(recs.length===0){
      el.innerHTML = `<div class="hint">Nessuna ricorrente. Aggiungine una sopra.</div>`;
      return;
    }
    el.innerHTML = recs.map(r=>{
      const on = r.enabled!==false;
      return `
        <div class="item">
          <div class="thumb">🔁</div>
          <div class="meta">
            <div class="title">${escapeHtml(r.title||"Ricorrente")}</div>
            <div class="sub">${escapeHtml(r.profile||"Io")} • ${escapeHtml(r.category||"Altro")} • Giorno ${escapeHtml(r.day||"1")}</div>
          </div>
          <div class="amt">
            ${euro(Number(r.amount)||0)}
            <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end">
              <button class="btn small ${on?'':'bad'}" data-rectoggle="${escapeHtml(r.id)}" type="button">${on?'ON':'OFF'}</button>
              <button class="btn small bad" data-recdel="${escapeHtml(r.id)}" type="button">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    el.querySelectorAll("[data-rectoggle]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id=b.getAttribute("data-rectoggle");
        const r = (settings.recurring||[]).find(x=>x.id===id);
        if(!r) return;
        r.enabled = !(r.enabled!==false);
        saveSettings();
        renderRecurringList();
      });
    });
    el.querySelectorAll("[data-recdel]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id=b.getAttribute("data-recdel");
        if(!confirm("Eliminare questa ricorrente?")) return;
        settings.recurring = (settings.recurring||[]).filter(x=>x.id!==id);
        saveSettings();
        renderRecurringList();
      });
    });
  }

  function openRecurring(){
    // fill selects
    $("#recCategory").innerHTML = CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("#recProfile").innerHTML = PROFILES.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    $("#recAmount").value="";
    $("#recDay").value="1";
    $("#recTitle").value="";
    $("#recCategory").value="Casa";
    $("#recProfile").value="Casa";
    showModal("#modalRecurring");
    renderRecurringList();
  }
  function closeRecurring(){ hideModal("#modalRecurring"); }

  async function addRecurring(){
    const amount = parseEuro($("#recAmount").value);
    const day = Number($("#recDay").value);
    const title = ($("#recTitle").value||"").trim();
    const category = $("#recCategory").value;
    const profile = $("#recProfile").value;

    if(!Number.isFinite(amount) || amount<=0){ toast("Importo ricorrente non valido"); return; }
    if(!Number.isFinite(day) || day<1 || day>28){ toast("Giorno 1-28"); return; }
    if(!title){ toast("Inserisci descrizione"); return; }

    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    settings.recurring = settings.recurring || [];
    settings.recurring.push({ id, amount, day, title, category, profile, enabled:true });
    saveSettings();
    toast("Ricorrente aggiunta ✅");
    renderRecurringList();

    // genera subito per il mese corrente se manca
    await applyRecurringForMonth(monthNow());
    await refresh();
  }

  // ---------------- CSV EXPORT ----------------
  function csvEscape(v){
    const s = String(v ?? "");
    if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }
  function downloadTextFile(name, content, mime="text/plain"){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv(mode, targetMonth, profile){
    let list = all.filter(x=>x.month===targetMonth);
    if(profile && profile!=="Tutti") list = list.filter(x=>(x.profile||"Io")===profile);
    if(mode==="caf") list = list.filter(x=>isCaf(x.category));

    if(list.length===0){ toast("Nessuna spesa per CSV"); return; }
    list.sort((a,b)=>(a.date||"").localeCompare(b.date||""));

    const header = ["Data","Profilo","Categoria","Descrizione","Importo"];
    const lines = [header.join(",")];
    for(const x of list){
      lines.push([
        csvEscape(x.date),
        csvEscape(x.profile||"Io"),
        csvEscape(x.category),
        csvEscape(x.note||""),
        csvEscape(Number(x.amount||0).toFixed(2))
      ].join(","));
    }
    const fname = `Spese_${mode==="caf"?"CAF":"Mese"}_${targetMonth}_${profile||"Tutti"}.csv`;
    downloadTextFile(fname, lines.join("\n"), "text/csv;charset=utf-8");
    toast("CSV esportato ✅");
  }

  // ---------------- PIN ----------------
  function updatePinUI(){
    const hint = $("#pinStateHint");
    if(!hint) return;
    hint.textContent = settings.pinHash ? "PIN: impostato ✅" : "PIN: non impostato";
  }

  function openPinModal(){
    $("#pinTitle").textContent = settings.pinHash ? "🔒 Modifica PIN" : "🔒 Imposta PIN";
    $("#pinCurrentWrap").style.display = settings.pinHash ? "block" : "none";
    $("#pinCurrent").value = "";
    $("#pinNew").value = "";
    $("#pinNew2").value = "";
    showModal("#modalPin");
  }
  function closePinModal(){ hideModal("#modalPin"); }

  async function savePin(){
    const cur = $("#pinCurrent").value.trim();
    const p1 = $("#pinNew").value.trim();
    const p2 = $("#pinNew2").value.trim();

    if(settings.pinHash){
      if(!cur){ toast("Inserisci PIN attuale"); return; }
      const h = await sha256Hex(cur);
      if(h !== settings.pinHash){ toast("PIN attuale errato"); return; }
    }

    if(!/^\d{4,8}$/.test(p1)){ toast("PIN: 4-8 cifre"); return; }
    if(p1 !== p2){ toast("PIN non coincide"); return; }

    settings.pinHash = await sha256Hex(p1);
    saveSettings();
    updatePinUI();
    setUnlocked(true);
    hideLock();
    closePinModal();
    toast("PIN salvato ✅");
  }

  async function removePin(){
    if(!settings.pinHash){ toast("PIN non impostato"); return; }
    if(!confirm("Rimuovere il PIN?")) return;
    settings.pinHash = null;
    saveSettings();
    setUnlocked(true);
    hideLock();
    updatePinUI();
    toast("PIN rimosso");
  }

  async function unlock(){
    const pin = $("#lockPin").value.trim();
    if(!/^\d{4,8}$/.test(pin)){ toast("PIN non valido"); return; }
    const h = await sha256Hex(pin);
    if(h !== settings.pinHash){
      toast("PIN errato");
      haptic(25);
      return;
    }
    setUnlocked(true);
    hideLock();
    toast("Sbloccato ✅");
  }

  
  // ---------------- NFC SHORTCUTS (Web NFC) ----------------
  function isWebNfcSupported(){
    return (typeof window !== "undefined") && ("NDEFReader" in window);
  }

  function buildPrefillLink(data){
    // base URL without search/hash
    const u = new URL(window.location.href);
    u.search = "";
    u.hash = "";

    u.searchParams.set("action", "add");
    if(data.page) u.searchParams.set("page", data.page);

    if(data.type) u.searchParams.set("type", data.type); // expense|income
    if(data.amount) u.searchParams.set("amount", data.amount);

    if(data.wallet) u.searchParams.set("wallet", data.wallet);
    if(data.profile) u.searchParams.set("profile", data.profile);
    if(data.category) u.searchParams.set("cat", data.category);
    if(data.note) u.searchParams.set("note", data.note);

    if(data.split) u.searchParams.set("split", data.split);
    if(data.minePct) u.searchParams.set("minePct", data.minePct);
    if(data.partnerPct) u.searchParams.set("partnerPct", data.partnerPct);

    return u.toString();
  }

  function syncNfcCategoryOptions(){
    const t = ($("#nfcType")?.value || "expense");
    const sel = $("#nfcCategory");
    if(!sel) return;

    if(t === "income"){
      sel.innerHTML = INCOME_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      $("#nfcSplitWrap").style.display = "none";
    }else{
      sel.innerHTML = EXPENSE_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      $("#nfcSplitWrap").style.display = "block";
    }
  }

  function updateNfcLink(){
    const type = ($("#nfcType")?.value || "expense");
    const amount = ($("#nfcAmount")?.value || "").trim();
    const wallet = $("#nfcWallet")?.value || "";
    const profile = $("#nfcProfile")?.value || "";
    const category = $("#nfcCategory")?.value || "";
    const note = ($("#nfcNote")?.value || "").trim();

    const split = $("#nfcSplit")?.value || "mine";
    const minePct = ($("#nfcMinePct")?.value || "").trim();
    const partnerPct = ($("#nfcPartnerPct")?.value || "").trim();

    const link = buildPrefillLink({
      type,
      amount,
      wallet,
      profile,
      category,
      note,
      split: type==="expense" ? split : "",
      minePct: (type==="expense" && split==="custom") ? minePct : "",
      partnerPct: (type==="expense" && split==="custom") ? partnerPct : "",
    });

    const out = $("#nfcLink");
    if(out) out.value = link;
  }

  function openNfcModal(){
    // clone current app selects so values match current configuration
    const w = $("#inWallet");
    const p = $("#inProfile");
    if(w && $("#nfcWallet")) $("#nfcWallet").innerHTML = w.innerHTML;
    if(p && $("#nfcProfile")) $("#nfcProfile").innerHTML = p.innerHTML;

    syncNfcCategoryOptions();

    // default values
    $("#nfcType").value = "expense";
    $("#nfcAmount").value = "";
    $("#nfcNote").value = "";
    $("#nfcSplit").value = "mine";
    $("#nfcMinePct").value = "";
    $("#nfcPartnerPct").value = "";

    // pick current selected wallet/profile if available
    if(w) $("#nfcWallet").value = w.value;
    if(p) $("#nfcProfile").value = p.value;

    updateNfcLink();

    const hint = $("#nfcSupportHint");
    if(hint){
      hint.textContent = isWebNfcSupported()
        ? "Avvicina un tag NFC vuoto quando premi “Scrivi tag NFC”."
        : "Web NFC non supportato su questo browser: usa “Copia link” e crea una scorciatoia sulla Home.";
    }

    showModal("#modalNfc");
  }

  async function writeNfcTag(){
    if(!isWebNfcSupported()){
      alert("Web NFC non supportato su questo dispositivo/browser. Usa “Copia link”.");
      return;
    }
    const link = $("#nfcLink").value;
    try{
      const ndef = new NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: link }] });
      toast("Tag NFC scritto ✅");
      haptic(10);
      hideModal("#modalNfc");
    }catch(e){
      alert("Impossibile scrivere il tag NFC. Assicurati di usare un tag NFC compatibile e riprova.\n\nDettagli: " + (e?.message || e));
    }
  }

  async function copyText(t){
    try{
      await navigator.clipboard.writeText(t);
      toast("Copiato ✅");
      return;
    }catch{}
    // fallback
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); toast("Copiato ✅"); }
    catch{ alert("Copia non riuscita. Seleziona e copia manualmente."); }
    finally{ ta.remove(); }
  }

  function handleDeepLink(){
    const u = new URL(window.location.href);
    const p = u.searchParams;

    const page = p.get("page");
    const action = p.get("action");

    if(page){
      if(page === "documents") showPage("docs");
      if(page === "report") showPage("report");
      if(page === "archive") showPage("archive");
      if(page === "settings") showPage("settings");
      if(page === "home") showPage("home");
    setTimeout(handleDeepLink, 50);
    }

    if(action === "add"){
      openAdd();

      const type = p.get("type") || "expense";
      setMoveType(type);

      const amount = p.get("amount");
      const wallet = p.get("wallet");
      const profile = p.get("profile");
      const cat = p.get("cat");
      const note = p.get("note");

      if(amount) $("#inAmount").value = amount;
      if(wallet) $("#inWallet").value = wallet;
      if(profile) $("#inProfile").value = profile;
      if(cat) $("#inCategory").value = cat;
      if(note) $("#inNote").value = note;

      // split (only for expenses)
      if(type !== "income"){
        const split = p.get("split") || "mine";
        setSplitMode(split);
        if(split === "custom"){
          const minePct = Number(p.get("minePct"));
          const partnerPct = Number(p.get("partnerPct"));
          if(Number.isFinite(minePct)) splitMinePct = minePct;
          if(Number.isFinite(partnerPct)) splitPartnerPct = partnerPct;
          // refresh UI
          setSplitMode("custom");
        }
      }
    }


    // shared text import (manual) e.g. ?sharedText=...
    const sharedText = p.get("sharedText") || p.get("shareText") || p.get("text");
    if(sharedText){
      showPage("settings");
      openBankImportModal(sharedText);
    }


    // clean URL to avoid repeated triggers
    if(u.search){
      u.search = "";
      window.history.replaceState({}, "", u.toString());
    }
  }

// ---------------- EVENTS ----------------
  
  // ---------------- WALLETS (computed) ----------------
  function walletCurrentBalance(walletId){
    const w = (settings.wallets||[]).find(x=>x.id===walletId);
    const init = w ? (Number(w.initialCents)||0)/100 : 0;
    let delta = 0;
    for(const m of all){
      if((m.walletId||"") !== walletId) continue;
      const amt = Number(m.amount)||0;
      delta += (m.type==="income") ? amt : -amt;
    }
    return init + delta;
  }

  function renderWalletsHome(){
    const box = $("#walletsHome");
    if(!box) return;
    const ws = settings.wallets || [];
    if(!ws.length){
      box.innerHTML = `<div class="hint">Nessun portafoglio. Creane uno in Impostazioni.</div>`;
      return;
    }
    const total = ws.reduce((s,w)=>s+walletCurrentBalance(w.id),0);
    box.innerHTML =
      `<div class="anaLine"><div><b>Totale</b></div><div class="muted">${euro(total)}</div></div>` +
      ws.map(w=>`<div class="anaLine"><div><b>${escapeHtml(w.name)}</b></div><div class="muted">${euro(walletCurrentBalance(w.id))}</div></div>`).join("");
  }

  // ---------------- DOCS ----------------
  let docsAll = [];
  function daysUntil(dateISO){
    if(!dateISO) return null;
    const d = new Date(dateISO+"T00:00:00");
    if(isNaN(d)) return null;
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d - a) / (1000*60*60*24));
  }
  function docBadge(doc){
    const limit = settings.docNotifyDays || 30;
    const du = daysUntil(doc.due);
    const wa = daysUntil(doc.warranty);
    if(du!=null && du>=0 && du<=limit) return `<span class="dueBadge">⏰ ${du}g</span>`;
    if(wa!=null && wa>=0 && wa<=limit) return `<span class="dueBadge warrantyBadge">🛡️ ${wa}g</span>`;
    return "";
  }
  function renderDocsHomeSoon(){
    const box = $("#docsSoonHome");
    if(!box) return;
    const limit = settings.docNotifyDays || 30;
    const soon = docsAll
      .map(d=>{
        const du = daysUntil(d.due);
        const wa = daysUntil(d.warranty);
        const best = (du!=null && du>=0) ? du : (wa!=null && wa>=0 ? wa : null);
        return {d, best};
      })
      .filter(x=>x.best!=null && x.best<=limit)
      .sort((a,b)=>a.best-b.best)
      .slice(0,5);

    if(!soon.length){
      box.innerHTML = `<div class="hint">Nessuna scadenza nei prossimi ${limit} giorni.</div>`;
      return;
    }
    box.innerHTML = soon.map(x=>{
      const d=x.d;
      const when = x.best;
      return `<div class="anaLine"><div><b>${escapeHtml(d.name||"Documento")}</b><div class="muted">${escapeHtml(d.category||"Altro")}</div></div><div class="muted">${when}g</div></div>`;
    }).join("");
  }

  function renderDocs(onlySoon=false){
    const el = $("#docList");
    if(!el) return;

    const cat = $("#dCategory").value || "";
    const q = ($("#dSearch").value||"").trim().toLowerCase();
    const limit = settings.docNotifyDays || 30;

    let list = docsAll.slice();
    if(cat) list = list.filter(d=>d.category===cat);
    if(q) list = list.filter(d=>(d.name||"").toLowerCase().includes(q));
    if(onlySoon){
      list = list.filter(d=>{
        const du = daysUntil(d.due);
        const wa = daysUntil(d.warranty);
        return (du!=null && du>=0 && du<=limit) || (wa!=null && wa>=0 && wa<=limit);
      });
    }
    list.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));

    $("#docCountLabel").textContent = `${list.length} documenti`;
    const soonN = docsAll.filter(d=>{
      const du = daysUntil(d.due);
      const wa = daysUntil(d.warranty);
      return (du!=null && du>=0 && du<=limit) || (wa!=null && wa>=0 && wa<=limit);
    }).length;
    $("#docSoonLabel").textContent = `${soonN} in scadenza (≤ ${limit}g)`;

    if(!list.length){
      el.innerHTML = `<div class="hint">Nessun documento. Premi “Nuovo”.</div>`;
      return;
    }
    el.innerHTML = list.map(d=>`
      <div class="item" data-doc="${escapeHtml(d.id)}">
        <div class="thumb">${d.file ? "📄" : "—"}</div>
        <div class="meta">
          <div class="title">${escapeHtml(d.name||"Documento")}${docBadge(d)}</div>
          <div class="sub">${escapeHtml(d.category||"Altro")} • ${escapeHtml(d.date||"")}</div>
        </div>
        <div class="amt">›</div>
      </div>
    `).join("");
    el.querySelectorAll("[data-doc]").forEach(r=>r.addEventListener("click",()=>openDoc(r.getAttribute("data-doc"))));
  }

  let docEditId = null;
  function openDoc(id){
    const d = docsAll.find(x=>x.id===id);
    if(!d) return;
    docEditId = id;
    $("#docTitle").textContent = "📁 Modifica documento";
    $("#dName").value = d.name||"";
    $("#dCatIn").value = d.category||"Altro";
    $("#dDate").value = d.date||todayISO();
    $("#dDue").value = d.due||"";
    $("#dWarranty").value = d.warranty||"";
    $("#dFile").value = "";
    $("#docDelete").style.display="inline-flex";
    showModal("#modalDoc");
  }

function wire(){
    document.querySelectorAll(".navBtn").forEach(b=>{
      b.addEventListener("click", ()=>{
        haptic(6);
        showPage(b.getAttribute("data-nav"));
      });
    });

    
    // type toggle
    $("#typeExpense").addEventListener("click", ()=>{ setMoveType("expense"); });
    $("#typeIncome").addEventListener("click", ()=>{ setMoveType("income"); });

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
    $("#fProfile")?.addEventListener("change", ()=>{
      settings.activeProfile = $("#fProfile").value;
      saveSettings();
      fillProfiles();
      refresh();
    });
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
      const m = $("#fMonth")?.value || monthNow();
      const v = parseEuro($("#budgetInput").value);
      if(!Number.isFinite(v) || v<=0){ toast("Budget non valido"); return; }
      const ap = activeProfile();
      setBudgetCents(m, ap, Math.round(v*100));
      closeBudgetModal();
      toast("Budget salvato ✅");
      calcStats();
      renderArchive();
    });
    $("#budgetClear").addEventListener("click", ()=>{
      const m = $("#fMonth")?.value || monthNow();
      const ap = activeProfile();
      setBudgetCents(m, ap, null);
      $("#budgetInput").value="";
      closeBudgetModal();
      toast("Budget rimosso");
      calcStats();
      renderArchive();
    });

    $("#activeProfile")?.addEventListener("change", ()=>{
      settings.activeProfile = $("#activeProfile").value;
      saveSettings();
      fillProfiles();
      refresh();
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
    $("#anaProfile")?.addEventListener("change", renderAnalysis);
    $("#anaOnlyCaf").addEventListener("change", renderAnalysis);

    $("#btnTips")?.addEventListener("click", showTips);

    $("#btnMakePdf").addEventListener("click", ()=>{
      const mode = $("#rMode").value || "month";
      const m = $("#rMonth").value || monthNow();
      const profile = $("#rProfile")?.value || activeProfile();
      generatePdf(mode, m, profile);
    });


    $("#btnExportCsv").addEventListener("click", ()=>{
      const mode = $("#rMode").value || "month";
      const m = $("#rMonth").value || monthNow();
      const p = $("#rProfile").value || "Tutti";
      exportCsv(mode, m, p);
    });

    $("#btnManageRecurring").addEventListener("click", openRecurring);
    $("#recClose").addEventListener("click", closeRecurring);
    $("#modalRecurring").addEventListener("click",(e)=>{ if(e.target===$("#modalRecurring")) closeRecurring(); });
    $("#recAdd").addEventListener("click", addRecurring);

    $("#btnSetPin").addEventListener("click", openPinModal);
    $("#btnRemovePin").addEventListener("click", removePin);
    $("#pinClose").addEventListener("click", closePinModal);
    $("#modalPin").addEventListener("click",(e)=>{ if(e.target===$("#modalPin")) closePinModal(); });
    $("#pinSave").addEventListener("click", savePin);

    // Impostazioni (pagina)
    $("#btnSavePin")?.addEventListener("click", async ()=>{
      const p1 = ($("#setPin")?.value || "").trim();
      const p2 = ($("#setPin2")?.value || "").trim();
      if(!/^\d{4,8}$/.test(p1)){ toast("PIN: 4-8 cifre"); return; }
      if(p1 !== p2){ toast("PIN non coincide"); return; }
      settings.pinHash = await sha256Hex(p1);
      saveSettings();
      $("#setPin").value = ""; $("#setPin2").value = "";
      updatePinUI();
      toast("PIN salvato ✅");
    });
    $("#btnRemovePin")?.addEventListener("click", removePin);

    
  // =====================
  //  BANK IMPORT (TEXT)
  // =====================
  function normalizeBankText(t){
    return String(t||"")
      .replace(/\u00A0/g," ")
      .replace(/[ \t]+/g," ")
      .trim();
  }
  function parseAmountFromText(t){
    const s = normalizeBankText(t).toLowerCase();
    // patterns like 12,50€ or €12.50 or 12.50 eur
    const m = s.match(/(?:€\s*)?(-?\d{1,6}(?:[.,]\d{2})?)(?:\s*€|\s*eur|\s*euro)?/i);
    if(!m) return null;
    const num = Number(m[1].replace(".", "").replace(",", "."));
    if(!Number.isFinite(num)) return null;
    return num;
  }
  function guessTypeFromText(t){
    const s = normalizeBankText(t).toLowerCase();
    const incomeHints = ["accredito","accreditato","bonifico ricevuto","entrata","incasso","stipendio","rimborso","ricevuto","pagamento ricevuto"];
    const expenseHints = ["pagamento","acquisto","prelievo","addebito","pos","carta","spesa","uscita","transazione"];
    if(incomeHints.some(w=>s.includes(w))) return "income";
    if(expenseHints.some(w=>s.includes(w))) return "expense";
    return "expense";
  }
  function guessMerchantFromText(t){
    const s = normalizeBankText(t);
    const m1 = s.match(/\b(?:a|presso|da)\s+([A-Za-z0-9 .&'_-]{3,40})/i);
    if(m1) return m1[1].trim().replace(/\s{2,}/g," ");
    const caps = s.match(/\b([A-Z][A-Z0-9&'_-]{2,})(?:\s+[A-Z][A-Z0-9&'_-]{2,}){0,3}\b/);
    if(caps) return caps[0].trim();
    return "";
  }

  function openBankImportModal(prefillText=""){
    if(!settings.bankImportEnabled){
      toast("Attiva prima l’import da testo nelle Impostazioni");
      return;
    }
    $("#bankText").value = prefillText || "";
    fillCategories();
    $("#bankType").value = "expense";
    $("#bankAmount").value = "";
    $("#bankNote").value = "";
    $("#bankWallet").value = (settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash";
    $("#bankProfile").value = isAllProfiles() ? "Io" : activeProfile();
    $("#bankCategory").value = "Alimentari";
    showModal("#modalBankImport");
  }
  function closeBankImportModal(){ hideModal("#modalBankImport"); }

  function analyzeBankText(){
    const raw = $("#bankText").value;
    const t = normalizeBankText(raw);
    if(!t){ toast("Incolla un testo"); return; }
    const amt = parseAmountFromText(t);
    const type = guessTypeFromText(t);
    const merchant = guessMerchantFromText(t);

    $("#bankType").value = type;
    if(amt!=null) $("#bankAmount").value = String(amt.toFixed(2)).replace(".", ",");
    $("#bankNote").value = merchant || t.slice(0,60);

    const noteForRules = $("#bankNote").value;
    const suggested = applyRules(noteForRules, {
      category: $("#bankCategory").value || "Alimentari",
      walletId: $("#bankWallet").value || ((settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash"),
      profile: $("#bankProfile").value || (isAllProfiles() ? "Io" : activeProfile())
    });

    if(suggested.walletId) $("#bankWallet").value = suggested.walletId;
    if(suggested.profile) $("#bankProfile").value = suggested.profile;
    if(suggested.category) $("#bankCategory").value = suggested.category;

    toast("Analisi completata");
    haptic(6);
  }

  function bankToMove(){
    if(!settings.bankImportEnabled){ toast("Import da testo disattivato"); return; }
    const amt = centsFromEuro($("#bankAmount").value);
    if(!amt || amt<=0){ toast("Importo non valido"); return; }

    openAdd();
    setMoveType($("#bankType").value);
    $("#inAmount").value = (amt/100).toFixed(2).replace(".", ",");
    $("#inWallet").value = $("#bankWallet").value;
    $("#inProfile").value = $("#bankProfile").value;
    $("#inCategory").value = $("#bankCategory").value;
    $("#inNote").value = $("#bankNote").value;

    closeBankImportModal();
    haptic(10);
  }

  function bankHelp(){
    alert(
`Formati supportati (esempi):
• Pagamento 12,50€ a CONAD con carta
• Addebito POS 25,00 EUR presso Q8
• Accredito stipendio 1500,00€
Suggerimento: dopo l’analisi puoi modificare i campi prima di salvare.`
    );
  }

$("#btnEnableBio")?.addEventListener("click", enableBiometrics);
    $("#btnDisableBio")?.addEventListener("click", disableBiometrics);

    $("#btnSaveFavCats")?.addEventListener("click", saveFavCatsFromUI);
    $("#btnResetFavCats")?.addEventListener("click", resetFavCats);


    // bank import toggles + modal
    const bt = $("#bankImportToggle");
    if(bt){
      bt.checked = !!settings.bankImportEnabled;
      bt.addEventListener("change", ()=>{ settings.bankImportEnabled = !!bt.checked; saveSettings(); toast(settings.bankImportEnabled ? "Import da testo attivato" : "Import da testo disattivato"); });
    }
    const bs = $("#bankShareToggle");
    if(bs){
      bs.checked = !!settings.bankShareEnabled;
      bs.addEventListener("change", ()=>{ settings.bankShareEnabled = !!bs.checked; saveSettings(); toast(settings.bankShareEnabled ? "Condividi attivo" : "Condividi disattivato"); });
    }
    $("#btnBankImportOpen")?.addEventListener("click", ()=>openBankImportModal(""));
    $("#btnBankImportHelp")?.addEventListener("click", bankHelp);
    $("#bankClose")?.addEventListener("click", closeBankImportModal);
    $("#bankAnalyze")?.addEventListener("click", analyzeBankText);
    $("#bankClear")?.addEventListener("click", ()=>{ $("#bankText").value=""; $("#bankAmount").value=""; $("#bankNote").value=""; haptic(4); });
    $("#bankToMove")?.addEventListener("click", bankToMove);


    $("#btnRepairCache")?.addEventListener("click", async ()=>{
      try{
        if("serviceWorker" in navigator){
          const regs = await navigator.serviceWorker.getRegistrations();
          for(const r of regs) await r.unregister();
        }
        if(window.caches){
          const keys = await caches.keys();
          await Promise.all(keys.map(k=>caches.delete(k)));
        }
        toast("Cache ripulita ✅");
        setTimeout(()=>location.reload(), 400);
      }catch(e){
        console.warn(e);
        toast("Riparazione non riuscita");
      }
    });

    $("#btnFactoryReset")?.addEventListener("click", ()=>{
      if(!confirm("Reset configurazione? (NON cancella le spese)")) return;
      const keep = { isPro: settings.isPro, pdfCountByMonth: settings.pdfCountByMonth };
      localStorage.removeItem(APP.settingsKey);
      Object.assign(settings, keep, loadSettings());
      // reapply defaults
      settings.isPro = !!settings.isPro;
      settings.pdfCountByMonth = settings.pdfCountByMonth || {};
      settings.viewMode = settings.viewMode || "list";
      settings.profileBudgets = settings.profileBudgets || {};
      settings.activeProfile = typeof settings.activeProfile==="string" ? settings.activeProfile : "Io";
      settings.favCategories = Array.isArray(settings.favCategories) ? settings.favCategories : ["Alimentari","Benzina","Farmacia / Mediche","Casa"];
      settings.bioEnabled = !!settings.bioEnabled;
      settings.bioCredId = typeof settings.bioCredId==="string" ? settings.bioCredId : "";
      saveSettings();
      fillCategories(); renderQuickAdd(); renderFavCats(); updatePinUI();
      toast("Configurazione ripristinata ✅");
    });

    $("#btnUnlock").addEventListener("click", unlock);
    $("#btnUnlockBio")?.addEventListener("click", unlockWithBiometrics);
    $("#lockPin").addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlock(); });

    $("#btnBackup").addEventListener("click", exportBackup);
    $("#inRestore").addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importBackup(f);
      e.target.value="";
    });

    
    
    // NFC shortcuts
    const btnNfcOpen = $("#btnNfcOpen");
    if(btnNfcOpen) btnNfcOpen.addEventListener("click", openNfcModal);

    const btnNfcTest = $("#btnNfcTest");
    if(btnNfcTest) btnNfcTest.addEventListener("click", async ()=>{
      const link = buildPrefillLink({
        type:"expense",
        category:"Benzina",
        note:"Q8",
        amount:"20,00"
      });
      await copyText(link);
    });

    const nfcClose = $("#nfcClose");
    if(nfcClose) nfcClose.addEventListener("click", ()=>hideModal("#modalNfc"));
    const modalNfc = $("#modalNfc");
    if(modalNfc) modalNfc.addEventListener("click", (e)=>{ if(e.target===modalNfc) hideModal("#modalNfc"); });

    const nfcType = $("#nfcType");
    if(nfcType) nfcType.addEventListener("change", ()=>{ syncNfcCategoryOptions(); updateNfcLink(); });

    ["nfcAmount","nfcWallet","nfcProfile","nfcCategory","nfcNote","nfcSplit","nfcMinePct","nfcPartnerPct"].forEach(id=>{
      const el = $("#"+id);
      if(el) el.addEventListener("input", updateNfcLink);
      if(el) el.addEventListener("change", updateNfcLink);
    });

    const btnNfcWrite = $("#btnNfcWrite");
    if(btnNfcWrite) btnNfcWrite.addEventListener("click", writeNfcTag);

    const btnNfcCopy = $("#btnNfcCopy");
    if(btnNfcCopy) btnNfcCopy.addEventListener("click", async ()=>{ await copyText($("#nfcLink").value); });

// docs
    $("#btnAddDoc").addEventListener("click", ()=>{
      docEditId = null;
      $("#docTitle").textContent = "📁 Nuovo documento";
      $("#dName").value = "";
      $("#dCatIn").value = DOC_CATEGORIES[0];
      $("#dDate").value = todayISO();
      $("#dDue").value = "";
      $("#dWarranty").value = "";
      $("#dFile").value = "";
      $("#docDelete").style.display="none";
      showModal("#modalDoc");
    });
    $("#docClose").addEventListener("click", ()=>hideModal("#modalDoc"));
    $("#modalDoc").addEventListener("click",(e)=>{ if(e.target===$("#modalDoc")) hideModal("#modalDoc"); });

    $("#dCategory").addEventListener("change", ()=>renderDocs(false));
    $("#dSearch").addEventListener("input", ()=>{
      clearTimeout(window.__ds);
      window.__ds=setTimeout(()=>renderDocs(false), 120);
    });
    let docSoonMode=false;
    $("#btnDocSoon").addEventListener("click", ()=>{
      docSoonMode = !docSoonMode;
      $("#btnDocSoon").classList.toggle("primary", docSoonMode);
      renderDocs(docSoonMode);
    });

    $("#docSave").addEventListener("click", async ()=>{
      const name = ($("#dName").value||"").trim();
      const category = $("#dCatIn").value || "Altro";
      const date = $("#dDate").value || todayISO();
      const due = $("#dDue").value || "";
      const warranty = $("#dWarranty").value || "";
      const f = $("#dFile").files && $("#dFile").files[0];

      let fileData = null;
      if(f){
        fileData = await new Promise((res,rej)=>{
          const r = new FileReader();
          r.onload=()=>res(String(r.result));
          r.onerror=()=>res(null);
          r.readAsDataURL(f);
        });
      } else if(docEditId){
        fileData = docsAll.find(x=>x.id===docEditId)?.file || null;
      }

      const id = docEditId || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
      await docsPut({ id, name: name || "Documento", category, date, due, warranty, file: fileData });
      hideModal("#modalDoc");
      toast(docEditId ? "Documento aggiornato ✅" : "Documento salvato ✅");
      await refresh();
      renderDocs(docSoonMode);
    });

    $("#docDelete").addEventListener("click", async ()=>{
      if(!docEditId) return;
      if(!confirm("Eliminare questo documento?")) return;
      await docsDelete(docEditId);
      hideModal("#modalDoc");
      toast("Documento eliminato ✅");
      docEditId=null;
      await refresh();
      renderDocs(docSoonMode);
    });


    // ---------------- Coppia: divisione spesa ----------------
    ["#splitMine","#splitPartner","#splitHalf","#splitCustom"].forEach(id=>{
      const el = $(id); if(!el) return;
      el.addEventListener("click", ()=>{
        if(id==="#splitMine"){ splitMode="mine"; splitMinePct=100; }
        if(id==="#splitPartner"){ splitMode="partner"; splitMinePct=0; }
        if(id==="#splitHalf"){ splitMode="half"; splitMinePct=50; }
        if(id==="#splitCustom"){ splitMode="custom"; splitMinePct = Number($("#splitMinePct")?.value)||50; }
        updateSplitUI();
      });
    });
    $("#splitMinePct") && $("#splitMinePct").addEventListener("input", ()=>{
      splitMinePct = Number($("#splitMinePct").value)||0;
      updateSplitUI();
    });

    // ---------------- Impostazioni: coppia ----------------
    const partnerNameIn = $("#partnerName");
    const defSplitSel = $("#defaultSplit");
    const defMinePct = $("#defaultSplitMinePct");
    const defRow = $("#defaultSplitCustomRow");

    if(partnerNameIn) partnerNameIn.value = settings.partnerName || "Partner";
    if(defSplitSel) defSplitSel.value = settings.defaultSplit || "mine";
    if(defMinePct) defMinePct.value = String(Number.isFinite(settings.defaultSplitMinePct) ? settings.defaultSplitMinePct : 50);

    const syncDefPct = ()=>{
      if(!defMinePct) return;
      const m = Math.max(0, Math.min(100, Number(defMinePct.value)||0));
      if($("#defaultSplitPartnerPct")) $("#defaultSplitPartnerPct").value = String(100-m);
    };
    if(defSplitSel){
      const upd = ()=>{
        if(defRow) defRow.style.display = (defSplitSel.value==="custom") ? "grid" : "none";
        if(defSplitSel.value==="half" && defMinePct){ defMinePct.value="50"; }
        syncDefPct();
      };
      defSplitSel.addEventListener("change", upd);
      upd();
    }
    defMinePct && defMinePct.addEventListener("input", syncDefPct);

    $("#btnSavePartner") && $("#btnSavePartner").addEventListener("click", ()=>{
      settings.partnerName = (partnerNameIn?.value||"").trim() || "Partner";
      settings.defaultSplit = defSplitSel ? defSplitSel.value : "mine";
      const mp = Number(defMinePct?.value);
      settings.defaultSplitMinePct = Number.isFinite(mp) ? Math.max(0, Math.min(100, mp)) : 50;
      saveSettings();
      updatePartnerLabels();
      toast("Salvato ✅");
    });

    // ---------------- Impostazioni: regole ----------------
    const ruleKey = $("#ruleKey");
    const ruleSafe = $("#ruleSafe");
    const ruleCat = $("#ruleCategory");
    const ruleWal = $("#ruleWallet");
    const rulePro = $("#ruleProfile");
    const ruleEn  = $("#ruleEnabled");

    $("#btnAddRule") && $("#btnAddRule").addEventListener("click", ()=>{
      const key = (ruleKey?.value||"").trim();
      if(!key){ toast("Inserisci una parola chiave"); return; }
      const r = {
        key,
        safe: (ruleSafe?.value||"1")==="1",
        enabled: (ruleEn?.value||"1")==="1",
        category: (ruleCat?.value||"") || "",
        walletId: (ruleWal?.value||"") || "",
        profile: (rulePro?.value||"") || ""
      };
      settings.rules = Array.isArray(settings.rules) ? settings.rules : [];
      settings.rules.push(r);
      saveSettings();
      if(ruleKey) ruleKey.value = "";
      renderRulesList();
      toast("Regola aggiunta ✅");
    });

    $("#btnResetRules") && $("#btnResetRules").addEventListener("click", ()=>{
      if(!confirm("Eliminare tutte le regole?")) return;
      settings.rules = [];
      saveSettings();
      renderRulesList();
      toast("Regole ripristinate");
    });


$("#btnWipeAll").addEventListener("click", wipeAll);
  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  (async function start(){
    fillCategories();
    fillProfiles();
    renderRulesList();
    updatePartnerLabels();
    renderQuickAdd();
    $("#inDate").value = todayISO();
    $("#fMonth").value = monthNow();
    setProUI();

    await openDB();
    await applyRecurringForMonth(monthNow());
    await refresh();
    wire();
    updatePinUI();
    showPage("home");
    setTimeout(handleDeepLink, 50);

    if((settings.pinHash || (settings.bioEnabled && settings.bioCredId)) && !isUnlocked()){
      setUnlocked(false);
      showLock();
    }

    toast("Pronto ✅", 1100);
  })();

})();
