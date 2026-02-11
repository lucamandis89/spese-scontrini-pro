//   // =====================
  //  I18N (IT/EN)
  // =====================
  const I18N = {
    it: {
      nav_home: "Home",
      nav_archive: "Archivio",
      nav_report: "Report",
      nav_settings: "Impostazioni",
      settings_title: "Impostazioni",
      settings_sub: "Configura lingua, OCR e preferenze.",
      lang_title: "Lingua",
      apply: "Applica",
      ocr_title: "OCR scontrino (online)",
      ocr_online: "Usa OCR online per leggere importo e data",
      ocr_key: "API Key OCR.Space",
      ocr_note: "La chiave è salvata solo sul tuo dispositivo. Se è vuota, l’OCR non parte.",
      save: "Salva",
      reset: "Ripristina",
      about_title: "Info",
      btn_camera: "Fai foto scontrino",
      btn_gallery: "Allega scontrino"
    },
    en: {
      nav_home: "Home",
      nav_archive: "Archive",
      nav_report: "Report",
      nav_settings: "Settings",
      settings_title: "Settings",
      settings_sub: "Configure language, OCR and preferences.",
      lang_title: "Language",
      apply: "Apply",
      ocr_title: "Receipt OCR (online)",
      ocr_online: "Use online OCR to read amount and date",
      ocr_key: "OCR.Space API Key",
      ocr_note: "The key is saved only on your device. If empty, OCR won't run.",
      save: "Save",
      reset: "Reset",
      about_title: "About",
      btn_camera: "Take receipt photo",
      btn_gallery: "Attach receipt"
    }
  };

  function t(key){
    const lang = (settings?.lang || "it");
    return (I18N[lang] && I18N[lang][key]) || (I18N.it[key]) || key;
  }

  function applyI18n(){
    document.querySelectorAll("[data-i18n]").forEach(el=>{
      const k = el.getAttribute("data-i18n");
      el.textContent = t(k);
    });
  }

===============================
// Bootstrap debug + safe navigation (v21.3)
// ===============================
(function sspBootstrap(){
  try{
    // Visual ping that JS is executing
    document.addEventListener("DOMContentLoaded", function(){
      try{
        var b = document.getElementById("sspBuildBadge");
        if (b) b.textContent = "SSP v21.3 (JS OK)";
      }catch(e){}
    });

    // Debug overlay helpers
    function showDebug(msg){
      try{
        var ov = document.getElementById("sspDebug");
        var tx = document.getElementById("sspDebugText");
        if (tx) tx.textContent = String(msg || "Errore sconosciuto");
        if (ov){
          ov.classList.add("show");
          ov.setAttribute("aria-hidden","false");
        }
      }catch(e){}
    }
    window.addEventListener("error", function(ev){
      var msg = (ev && (ev.message || ev.error)) || "Error";
      var src = (ev && ev.filename) ? ("\nFile: " + ev.filename + ":" + ev.lineno + ":" + ev.colno) : "";
      showDebug(msg + src);
    });
    window.addEventListener("unhandledrejection", function(ev){
      showDebug("Promise rejection: " + (ev && ev.reason ? ev.reason : ev));
    });

    document.addEventListener("DOMContentLoaded", function(){
      var r = document.getElementById("sspDebugReload");
      var c = document.getElementById("sspDebugClose");
      var x = document.getElementById("sspDebugReset");
      var ov = document.getElementById("sspDebug");
      if (r) r.onclick = function(){ location.reload(); };
      if (c) c.onclick = function(){ if (ov){ ov.classList.remove("show"); ov.setAttribute("aria-hidden","true"); } };
      if (x) x.onclick = function(){
        try{
          localStorage.clear();
          sessionStorage.clear();
        }catch(e){}
        location.reload();
      };

      // Minimal nav fallback (if main app init fails)
      // Map bottom nav buttons by common selectors
      function qsAll(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
      var navBtns = qsAll("[data-page],[data-nav],.navBtn,.tabBtn,nav button, .bottomNav button, .bottom-nav button");
      if (!navBtns.length) return;

      function pages(){ return qsAll(".page,[data-page-panel],section[data-page],main .view"); }
      function activate(name){
        var ps = pages();
        if (!ps.length) return;
        ps.forEach(function(p){
          var pn = p.getAttribute("data-page") || p.id || p.getAttribute("data-page-panel");
          var on = (pn === name);
          if (on){
            p.style.display = "";
            p.classList.add("active","show");
            p.setAttribute("aria-hidden","false");
          } else {
            p.classList.remove("active","show");
            p.setAttribute("aria-hidden","true");
            // keep if app uses grid; but hide safely:
            p.style.display = "none";
          }
        });
      }

      navBtns.forEach(function(btn){
        btn.addEventListener("click", function(){
          var name = btn.getAttribute("data-page") || btn.getAttribute("data-nav");
          if (!name){
            // try infer from text
            var t = (btn.textContent || "").toLowerCase();
            if (t.indexOf("home")>=0) name = "home";
            else if (t.indexOf("mov")>=0) name = "movimenti";
            else if (t.indexOf("arch")>=0) name = "archivio";
            else if (t.indexOf("repo")>=0) name = "report";
            else if (t.indexOf("impo")>=0 || t.indexOf("sett")>=0) name = "impostazioni";
          }
          if (name) activate(name);
        }, {passive:true});
      });
    });
  }catch(e){}
})();

// ==================================
// Unblock guard (v21.2)
// - If an overlay/backdrop gets stuck, remove it on startup
// - Prevent "app frozen" due to hidden full-screen layers
// ==================================
(function unblockGuard(){
  try{
    function $(s){ return document.querySelector(s); }
    function clsOff(el, c){ if(el && el.classList && el.classList.contains(c)) el.classList.remove(c); }
    function styleOff(el, prop){ if(el && el.style) el.style[prop] = ""; }

    function run(){
      var bd = $("#sheetBackdrop");
      var sh = $("#fabSheet");
      var lo = $("#sspLoading");

      clsOff(bd, "open");
      clsOff(sh, "open");
      clsOff(lo, "show");

      if (bd) bd.setAttribute("aria-hidden","true");
      if (lo) lo.setAttribute("aria-hidden","true");

      styleOff(document.body, "overflow");

      if (bd && !bd.classList.contains("open")) bd.style.pointerEvents = "none";
      if (lo && !lo.classList.contains("show")) lo.style.pointerEvents = "none";

      var header = document.querySelector("header, .topbar, .appHeader, .hdr, .header");
      if (header && !header.__sspResetBound){
        header.__sspResetBound = true;
        var t = null;
        header.addEventListener("touchstart", function(){
          t = setTimeout(function(){
            try{
              localStorage.removeItem("ssp_state");
              localStorage.removeItem("ssp_data");
              localStorage.removeItem("ssp_pro");
            }catch(e){}
            location.reload();
          }, 900);
        }, {passive:true});
        header.addEventListener("touchend", function(){ if(t) clearTimeout(t); t=null; }, {passive:true});
        header.addEventListener("touchcancel", function(){ if(t) clearTimeout(t); t=null; }, {passive:true});
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, {once:true});
      window.addEventListener("load", run, {once:true});
    } else {
      run();
      window.addEventListener("load", run, {once:true});
    }
  }catch(e){}
})();

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


  var __el;
const $ = (s) => document.querySelector(s);

  
const safeOn = (sel, ev, fn, opts) => {
  const el = document.querySelector(sel);
  if (!el) return;
  el.addEventListener(ev, fn, opts);
};
const safeAllOn = (sel, ev, fn, opts) => {
  document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn, opts));
};
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
    const v = String(((s)!=null?(s):(""))).trim().replace(/\./g,"").replace(",",".");
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
    return String(((s)!=null?(s):(""))).replace(/[&<>"']/g, (m)=>({
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
        if(settings.bioEnabled && settings.bioCredId && !settings.pinHash){ ((__el=$("#btnUnlockBio"))&&__el.focus()); }
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
  settings.uiMode = (settings.uiMode==="pro" ? "pro" : "simple");
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


  function applyUIMode(){
    const mode = (settings.uiMode==="pro") ? "pro" : "simple";
    document.body.setAttribute("data-ui-mode", mode);

    // In simple mode, block advanced pages
    const active = ((__el=document.querySelector(".page.active"))?__el.getAttribute("data-page");
    if(mode==="simple" && (active==="docs")){
      toast("Modalità Semplice: funzioni avanzate nascoste", 1400);
      showPage("home");
    }

    // Toggle pro-only blocks
    document.querySelectorAll("[data-pro-only]").forEach(el=>{
      el.style.display = (mode==="pro") ? "" : "none";
    });
    document.querySelectorAll("[data-simple-only]").forEach(el=>{
      el.style.display = (mode==="simple") ? "" : "none";
    });
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
    const month = ((__el=$("#rMonth"))?__el.value:undefined) || monthNow();
    const profileFilter = ((__el=$("#rProfile"))?__el.value:undefined) || "Tutti";
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
    if((settings.uiMode!=="pro") && (name==="docs")){
      toast("Attiva Modalità Pro per usare Documenti", 1600);
      name="settings";
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

    // =====================
  //  OCR (online, opzionale)
  // =====================
  function parseReceiptText(txt){
    const text = String(txt||"").replace(/\r/g,"\n");
    let date = "";
    const dm = text.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.](?:\d{2}|\d{4}))\b/);
    if(dm) date = dm[1].replace(/\./g,"/").replace(/\-/g,"/");
    let amount = "";
    const lines = text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const moneyRe = /(\d{1,3}(?:[\.,]\d{3})*[\.,]\d{2})/g;
    const scoreLine = (l)=>{
      const u=l.toUpperCase();
      let s=0;
      if(u.includes("TOTALE")) s+=4;
      if(u.includes("COMPLESS")) s+=3;
      if(u.includes("IMPORTO")) s+=2;
      if(u.includes("PAGATO")) s+=1;
      return s;
    };
    let best={s:-1,v:""};
    for(const l of lines){
      const s=scoreLine(l);
      if(s<=0) continue;
      const ms=[...l.matchAll(moneyRe)].map(m=>m[1]);
      if(ms.length){
        const v=ms[ms.length-1];
        if(s>best.s) best={s,v};
      }
    }
    if(best.v) amount = best.v;
    if(!amount){
      const ms=[...text.matchAll(moneyRe)].map(m=>m[1]);
      if(ms.length) amount = ms[ms.length-1];
    }
    if(amount){
      const norm = amount.replace(/\./g,"").replace(/\s/g,"").replace(/,/g,".");
      const n = Number(norm);
      if(Number.isFinite(n)) amount = String(n.toFixed(2)).replace(".", ",");
    }
    return {amount, date};
  }

  async function runOnlineOCR(file){
    try{
      if(!settings.ocrOnline) return null;
      const key = String(settings.ocrApiKey||"").trim();
      if(!key) return null;

      const form = new FormData();
      form.append("apikey", key);
      form.append("isOverlayRequired", "false");
      form.append("OCREngine", "2");
      form.append("language", settings.lang==="en" ? "eng" : "ita");
      form.append("file", file, file.name || "receipt.jpg");

      const res = await fetch("https://api.ocr.space/parse/image", { method:"POST", body: form });
      const data = await res.json();
      const parsed = data?.ParsedResults?.[0]?.ParsedText || "";
      if(!parsed) return null;
      return parseReceiptText(parsed);
    }catch(e){
      console.warn("OCR error", e);
      return null;
    }
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
    const p = ((__el=$("#fProfile"))?__el.value:undefined) || activeProfile();
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

  // =====================
  //  CENTRAL CALC HELPERS
  //  (keeps totals consistent across the app)
  // =====================
  function isExpenseMov(x){ return (x && (x.type||"expense")) === "expense"; }
  function isIncomeMov(x){ return (x && (x.type||"expense")) === "income"; }

  function listForMonth(month, profile){
    const ap = normProfile(profile || activeProfile());
    return all.filter(x => x.month === month && (ap==="Tutti" || normProfile(x.profile)===ap));
  }

  function calcMonthSummary(month, profile){
    const list = listForMonth(month, profile);
    const expenses = list.filter(isExpenseMov);
    const incomes  = list.filter(isIncomeMov);
    const totalExpenses = expenses.reduce((s,x)=>s+(+x.amount||0),0);
    const totalIncomes  = incomes.reduce((s,x)=>s+(+x.amount||0),0);
    return { list, expenses, incomes, totalExpenses, totalIncomes, net: (totalIncomes - totalExpenses) };
  }



  function calcStats(){
    const mNow=monthNow();
    const yNow=String(new Date().getFullYear());
    const ap = activeProfile();
    const ms = calcMonthSummary(mNow, ap);
    const monthList = ms.expenses;
    const yearList  = all.filter(x=>(x.date||"").startsWith(yNow+"-") && (ap==="Tutti" || normProfile(x.profile)===ap) && isExpenseMov(x));
    const monthTotal = ms.totalExpenses;
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

    const total = (monthList||[]).filter(isExpenseMov).reduce((s,x)=>s+(+x.amount||0),0);
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
      amount: defAmount[c](()!=null?():(10)),
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
    const list = all.filter(x=>x.month===mNow && normProfile(x.profile)===ap && isExpenseMov(x));
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
    applyUIMode();
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
    const m = ((__el=$("#fMonth"))?__el.value:undefined) || monthNow();
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

    const month = ((__el=$("#rMonth"))?__el.value:undefined) || monthNow();
    const onlyCaf = !!((__el=$("#anaOnlyCaf"))?__el.checked:false);
    const profile = ((__el=$("#anaProfile"))?__el.value:undefined) || ((__el=$("#rProfile"))?__el.value:undefined) || activeProfile();

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
    const profile = normProfile(((__el=$("#inProfile"))?__el.value:undefined) || (isAllProfiles() ? "Io" : activeProfile()));
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
    const walletId = ((__el=$("#inWallet"))?__el.value:undefined) || ((settings.wallets && settings.wallets[0]) ? settings.wallets[0].id : "w_cash");

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
    const s = String(((v)!=null?(v):("")));
    if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      // Defaults / nuovi campi
    if(!s.lang) s.lang = "it";
    if(typeof s.ocrOnline === "undefined") s.ocrOnline = true;
    if(!s.ocrApiKey) s.ocrApiKey = "K84735650588957";
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
    const t = (((__el=$("#nfcType"))?__el.value:undefined) || "expense");
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
    const type = (((__el=$("#nfcType"))?__el.value:undefined) || "expense");
    const amount = (((__el=$("#nfcAmount"))?__el.value:undefined) || "").trim();
    const wallet = ((__el=$("#nfcWallet"))?__el.value:undefined) || "";
    const profile = ((__el=$("#nfcProfile"))?__el.value:undefined) || "";
    const category = ((__el=$("#nfcCategory"))?__el.value:undefined) || "";
    const note = (((__el=$("#nfcNote"))?__el.value:undefined) || "").trim();

    const split = ((__el=$("#nfcSplit"))?__el.value:undefined) || "mine";
    const minePct = (((__el=$("#nfcMinePct"))?__el.value:undefined) || "").trim();
    const partnerPct = (((__el=$("#nfcPartnerPct"))?__el.value:undefined) || "").trim();

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
      alert("Impossibile scrivere il tag NFC. Assicurati di usare un tag NFC compatibile e riprova.\n\nDettagli: " + ((e && e.message) || e));
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
    safeOn("#typeExpense", "click", ()=>{ setMoveType("expense"); });
    safeOn("#typeIncome", "click", ()=>{ setMoveType("income"); });

safeOn("#goArchive", "click", ()=>showPage("archive"));
    safeOn("#goReport", "click", ()=>showPage("report"));

    safeOn("#viewList", "click", ()=>{
      settings.viewMode="list"; saveSettings(); renderArchive();
    });
    safeOn("#viewTimeline", "click", ()=>{
      settings.viewMode="timeline"; saveSettings(); renderArchive();
    });

    safeOn("#fMonth", "change", renderArchive);
    safeOn("#fCategory", "change", renderArchive);
    ((__el=$("#fProfile"))&&__el.addEventListener("change", ()=>{
      settings.activeProfile = $("#fProfile").value;
      saveSettings();
      fillProfiles();
      refresh();
    });
    safeOn("#fSearch", "input", ()=>{
      clearTimeout(window.__ft);
      window.__ft=setTimeout(renderArchive, 120);
    });
    safeOn("#btnClearFilters", "click", ()=>{
      $("#fMonth").value = monthNow();
      $("#fCategory").value = "";
      $("#fSearch").value = "";
      toast("Filtri puliti");
      renderArchive();
    });

    
    // ===============================
    // Ultra-native BottomSheet (v18)
    // Mapped 100% to existing actions
    // ===============================
    const sheet = $("#fabSheet");
    const sheetBackdrop = $("#sheetBackdrop");
    const sheetCloseBtn = $("#sheetCloseBtn");

    function openFabSheet(){
      if(!sheet || !sheetBackdrop){ openAdd(); return; } // fallback
      sheetBackdrop.classList.add("open");
      sheet.classList.add("open");
      sheetBackdrop.setAttribute("aria-hidden","false");
      document.body.style.overflow = "hidden";
    }
    function closeFabSheet(){
      if(!sheet || !sheetBackdrop) return;
      sheetBackdrop.classList.remove("open");
      sheet.classList.remove("open");
      sheetBackdrop.setAttribute("aria-hidden","true");
      document.body.style.overflow = "";
    }

    function ensureProMode(){
      if(settings.uiMode === "pro") return true;
      settings.uiMode = "pro";
      saveSettings();
      applyUIMode();
      toast("Modalità PRO attivata");
      return true;
    }

    safeOn("#sheetCloseBtn", "click", closeFabSheet);
    safeOn("#sheetBackdrop", "click", closeFabSheet);
    document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeFabSheet(); });

    safeOn("#sheetAddExpense", "click", ()=>{
      closeFabSheet();
      openAdd();
      setMoveType("expense");
    });
    safeOn("#sheetAddIncome", "click", ()=>{
      closeFabSheet();
      openAdd();
      setMoveType("income");
    });
    safeOn("#sheetAddDoc", "click", ()=>{
      closeFabSheet();
      ensureProMode();
      showPage("documents");
      const b = $("#btnAddDoc");
      if(b) b.click();
    });
    safeOn("#sheetAddRecurring", "click", ()=>{
      closeFabSheet();
      ensureProMode();
      // Open recurring manager/modal
      const b = $("#btnManageRecurring");
      if(b) b.click();
      else openRecurring();
    });

safeOn("#fabAdd", "click", ()=>{ openFabSheet(); });

    safeOn("#addClose", "click", closeAdd);
    safeOn("#modalAdd", "click", (e)=>{ if(e.target===$("#modalAdd")) closeAdd(); });

    safeOn("#inPhoto", "change", async (e)=>{
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

    safeOn("#removePhoto", "click", ()=>{
      $("#inPhoto").value="";
      previewPhoto=null;
      scanImg=null;
      setPhotoPreview(null);
      toast("Foto rimossa");
    });

    safeOn("#btnOpenScanner", "click", openScanner);

    safeOn("#scannerClose", "click", closeScanner);
    safeOn("#modalScanner", "click",(e)=>{ if(e.target===$("#modalScanner")) closeScanner(); });

    safeOn("#rotL", "click", async ()=>{ scanRotate=(scanRotate-90)%360; await drawScannerPreview(); });
    safeOn("#rotR", "click", async ()=>{ scanRotate=(scanRotate+90)%360; await drawScannerPreview(); });

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

    safeOn("#resetScan", "click", async ()=>{ resetScanner(); await drawScannerPreview(); });
    safeOn("#applyScan", "click", applyScanner);

    safeOn("#btnSave", "click", onSave);
    safeOn("#btnClear", "click", ()=>{
      $("#inAmount").value="";
      $("#inNote").value="";
      $("#inPhoto").value="";
      previewPhoto=null;
      scanImg=null;
      setPhotoPreview(null);
      toast("Pulito");
    });

    safeOn("#mClose", "click", closeDetails);
    safeOn("#modalDetails", "click",(e)=>{ if(e.target===$("#modalDetails")) closeDetails(); });
    safeOn("#mEdit", "click", openEdit);
    safeOn("#mDelete", "click", deleteCurrent);

    safeOn("#btnBudget", "click", openBudgetModal);
    safeOn("#budgetClose", "click", closeBudgetModal);
    safeOn("#modalBudget", "click",(e)=>{ if(e.target===$("#modalBudget")) closeBudgetModal(); });

    safeOn("#budgetSave", "click", ()=>{
      const m = ((__el=$("#fMonth"))?__el.value:undefined) || monthNow();
      const v = parseEuro($("#budgetInput").value);
      if(!Number.isFinite(v) || v<=0){ toast("Budget non valido"); return; }
      const ap = activeProfile();
      setBudgetCents(m, ap, Math.round(v*100));
      closeBudgetModal();
      toast("Budget salvato ✅");
      calcStats();
      renderArchive();
    });
    safeOn("#budgetClear", "click", ()=>{
      const m = ((__el=$("#fMonth"))?__el.value:undefined) || monthNow();
      const ap = activeProfile();
      setBudgetCents(m, ap, null);
      $("#budgetInput").value="";
      closeBudgetModal();
      toast("Budget rimosso");
      calcStats();
      renderArchive();
    });

    ((__el=$("#activeProfile"))&&__el.addEventListener("change", ()=>{
      settings.activeProfile = $("#activeProfile").value;
      saveSettings();
      fillProfiles();
      refresh();
    });

    safeOn("#btnProToggle", "click", ()=>{
      const ok = confirm(settings.isPro ? "Disattivare PRO (test)?" : "Attivare PRO (test) su questo dispositivo?");
      if(!ok) return;
      settings.isPro = !settings.isPro;
      saveSettings();
      setProUI();
    applyUIMode();
      toast(settings.isPro ? "PRO attivo (test)" : "FREE attivo");
    });

    $("#rMonth").value = monthNow();
    safeOn("#rMonth", "change", renderAnalysis);
    ((__el=$("#anaProfile"))&&__el.addEventListener("change", renderAnalysis);
    safeOn("#anaOnlyCaf", "change", renderAnalysis);

    ((__el=$("#btnTips"))&&__el.addEventListener("click", showTips);

    safeOn("#btnMakePdf", "click", ()=>{
      const mode = $("#rMode").value || "month";
      const m = $("#rMonth").value || monthNow();
      const profile = ((__el=$("#rProfile"))?__el.value:undefined) || activeProfile();
      generatePdf(mode, m, profile);
    });


    safeOn("#btnExportCsv", "click", ()=>{
      const mode = $("#rMode").value || "month";
      const m = $("#rMonth").value || monthNow();
      const p = $("#rProfile").value || "Tutti";
      exportCsv(mode, m, p);
    });

    safeOn("#btnManageRecurring", "click", openRecurring);
    safeOn("#recClose", "click", closeRecurring);
    safeOn("#modalRecurring", "click",(e)=>{ if(e.target===$("#modalRecurring")) closeRecurring(); });
    safeOn("#recAdd", "click", addRecurring);

    safeOn("#btnSetPin", "click", openPinModal);
    safeOn("#btnRemovePin", "click", removePin);
    safeOn("#pinClose", "click", closePinModal);
    safeOn("#modalPin", "click",(e)=>{ if(e.target===$("#modalPin")) closePinModal(); });
    safeOn("#pinSave", "click", savePin);

    // Impostazioni (pagina)
    ((__el=$("#btnSavePin"))&&__el.addEventListener("click", async ()=>{
      const p1 = (((__el=$("#setPin"))?__el.value:undefined) || "").trim();
      const p2 = (((__el=$("#setPin2"))?__el.value:undefined) || "").trim();
      if(!/^\d{4,8}$/.test(p1)){ toast("PIN: 4-8 cifre"); return; }
      if(p1 !== p2){ toast("PIN non coincide"); return; }
      settings.pinHash = await sha256Hex(p1);
      saveSettings();
      $("#setPin").value = ""; $("#setPin2").value = "";
      updatePinUI();
      toast("PIN salvato ✅");
    });
    ((__el=$("#btnRemovePin"))&&__el.addEventListener("click", removePin);

    
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

((__el=$("#btnEnableBio"))&&__el.addEventListener("click", enableBiometrics);
    ((__el=$("#btnDisableBio"))&&__el.addEventListener("click", disableBiometrics);

    ((__el=$("#btnSaveFavCats"))&&__el.addEventListener("click", saveFavCatsFromUI);
    ((__el=$("#btnResetFavCats"))&&__el.addEventListener("click", resetFavCats);


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
    ((__el=$("#btnBankImportOpen"))&&__el.addEventListener("click", ()=>openBankImportModal(""));
    ((__el=$("#btnBankImportHelp"))&&__el.addEventListener("click", bankHelp);
    ((__el=$("#bankClose"))&&__el.addEventListener("click", closeBankImportModal);
    ((__el=$("#bankAnalyze"))&&__el.addEventListener("click", analyzeBankText);
    ((__el=$("#bankClear"))&&__el.addEventListener("click", ()=>{ $("#bankText").value=""; $("#bankAmount").value=""; $("#bankNote").value=""; haptic(4); });
    ((__el=$("#bankToMove"))&&__el.addEventListener("click", bankToMove);


    ((__el=$("#btnRepairCache"))&&__el.addEventListener("click", async ()=>{
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

    ((__el=$("#btnFactoryReset"))&&__el.addEventListener("click", ()=>{
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

    safeOn("#btnUnlock", "click", unlock);
    ((__el=$("#btnUnlockBio"))&&__el.addEventListener("click", unlockWithBiometrics);
    safeOn("#lockPin", "keydown", (e)=>{ if(e.key==="Enter") unlock(); });

    safeOn("#btnBackup", "click", exportBackup);
    safeOn("#inRestore", "change", (e)=>{
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
    safeOn("#btnAddDoc", "click", ()=>{
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
    safeOn("#docClose", "click", ()=>hideModal("#modalDoc"));
    safeOn("#modalDoc", "click",(e)=>{ if(e.target===$("#modalDoc")) hideModal("#modalDoc"); });

    safeOn("#dCategory", "change", ()=>renderDocs(false));
    safeOn("#dSearch", "input", ()=>{
      clearTimeout(window.__ds);
      window.__ds=setTimeout(()=>renderDocs(false), 120);
    });
    let docSoonMode=false;
    safeOn("#btnDocSoon", "click", ()=>{
      docSoonMode = !docSoonMode;
      $("#btnDocSoon").classList.toggle("primary", docSoonMode);
      renderDocs(docSoonMode);
    });

    safeOn("#docSave", "click", async ()=>{
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
        fileData = ((__el=docsAll.find(x=>x.id===docEditId))?__el.file:null) || null;
      }

      const id = docEditId || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
      await docsPut({ id, name: name || "Documento", category, date, due, warranty, file: fileData });
      hideModal("#modalDoc");
      toast(docEditId ? "Documento aggiornato ✅" : "Documento salvato ✅");
      await refresh();
      renderDocs(docSoonMode);
    });

    safeOn("#docDelete", "click", async ()=>{
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
        if(id==="#splitCustom"){ splitMode="custom"; splitMinePct = Number(((__el=$("#splitMinePct"))?__el.value:undefined))||50; }
        updateSplitUI();
      });
    });
    $("#splitMinePct") && safeOn("#splitMinePct", "input", ()=>{
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

    $("#btnSavePartner") && safeOn("#btnSavePartner", "click", ()=>{
      settings.partnerName = ((partnerNameIn && partnerNameIn.value)||"").trim() || "Partner";
      settings.defaultSplit = defSplitSel ? defSplitSel.value : "mine";
      const mp = Number((defMinePct && defMinePct.value));
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

    $("#btnAddRule") && safeOn("#btnAddRule", "click", ()=>{
      const key = ((ruleKey && ruleKey.value)||"").trim();
      if(!key){ toast("Inserisci una parola chiave"); return; }
      const r = {
        key,
        safe: ((ruleSafe && ruleSafe.value)||"1")==="1",
        enabled: ((ruleEn && ruleEn.value)||"1")==="1",
        category: ((ruleCat && ruleCat.value)||"") || "",
        walletId: ((ruleWal && ruleWal.value)||"") || "",
        profile: ((rulePro && rulePro.value)||"") || ""
      };
      settings.rules = Array.isArray(settings.rules) ? settings.rules : [];
      settings.rules.push(r);
      saveSettings();
      if(ruleKey) ruleKey.value = "";
      renderRulesList();
      toast("Regola aggiunta ✅");
    });

    $("#btnResetRules") && safeOn("#btnResetRules", "click", ()=>{
      if(!confirm("Eliminare tutte le regole?")) return;
      settings.rules = [];
      saveSettings();
      renderRulesList();
      toast("Regole ripristinate");
    });


safeOn("#btnWipeAll", "click", wipeAll);
  }

  // ---------------- START ----------------
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

    // =====================
  //  SETTINGS UI
  // =====================
  function initSettingsUI(){
    const langSel = $("#setLang");
    const btnApply = $("#btnApplyLang");
    const ocrToggle = $("#setOcrOnline");
    const ocrKey = $("#setOcrKey");
    const btnSave = $("#btnSaveSettings");
    const btnReset = $("#btnResetSettings");
    const about = $("#aboutBuild");

    if(langSel) langSel.value = settings.lang || "it";
    if(ocrToggle) ocrToggle.checked = !!settings.ocrOnline;
    if(ocrKey) ocrKey.value = settings.ocrApiKey || "K84735650588957";

    const save = ()=>{
      if(langSel) settings.lang = langSel.value || "it";
      if(ocrToggle) settings.ocrOnline = !!ocrToggle.checked;
      if(ocrKey) settings.ocrApiKey = String(ocrKey.value||"").trim();
      saveSettings(settings);
      applyI18n();
      toast(t("save")+" ✅");
    };

    btnSave?.addEventListener("click", save);
    btnApply?.addEventListener("click", ()=>{
      if(langSel) settings.lang = langSel.value || "it";
      saveSettings(settings);
      applyI18n();
      toast(t("apply")+" ✅");
    });

    btnReset?.addEventListener("click", ()=>{
      const fresh = loadSettings(true);
      Object.keys(fresh).forEach(k=>{ settings[k]=fresh[k]; });
      if(langSel) langSel.value = settings.lang || "it";
      if(ocrToggle) ocrToggle.checked = !!settings.ocrOnline;
      if(ocrKey) ocrKey.value = settings.ocrApiKey || "K84735650588957";
      applyI18n();
      toast(t("reset")+" ✅");
    });

    if(about){
      const v = document.querySelector('meta[name="app-version"]')?.content || "";
      about.textContent = "SSP " + (v || "v") + " • " + (new Date()).toLocaleString();
    }
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
    applyUIMode();

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

    // UI Mode toggle
    const sm = $("#simpleModeToggle");
    if(sm){
      sm.checked = (settings.uiMode !== "pro");
      sm.addEventListener("change", ()=>{
        settings.uiMode = sm.checked ? "simple" : "pro";
        saveSettings();
        applyUIMode();
        toast(sm.checked ? "Modalità Semplice attiva ✅" : "Modalità Pro attiva ✅", 1400);
      });
    }

    // Pro quick links
    const goDocs = $("#goDocs");
    if(goDocs){
      goDocs.addEventListener("click", ()=>{
        haptic(6);
        if(settings.uiMode!=="pro"){ toast("Attiva Modalità Pro", 1400); return; }
        showPage("docs");
      });
    }
    const goRec = $("#goRecurr");
    if(goRec){
      goRec.addEventListener("click", ()=>{
        haptic(6);
        if(settings.uiMode!=="pro"){ toast("Attiva Modalità Pro", 1400); return; }
        openRecurring();
      });
    }

  })();



// =====================
// Material Ripple (safe)
// =====================
(function materialRippleInit(){
  if (window.__sspRippleInit) return;
  window.__sspRippleInit = true;

  function addRipple(el, ev){
    const rect = el.getBoundingClientRect();
    const span = document.createElement("span");
    span.className = "ripple";
    const size = Math.max(rect.width, rect.height);
    span.style.width = span.style.height = size + "px";
    const clientX = (ev && typeof ev.clientX==="number") ? ev.clientX : (rect.left + rect.width/2);
    const x = clientX - rect.left - size/2;
        const clientY = (ev && typeof ev.clientY==="number") ? ev.clientY : (rect.top + rect.height/2);
    const y = clientY - rect.top - size/2;
    span.style.left = x + "px";
    span.style.top = y + "px";
    el.appendChild(span);
    span.addEventListener("animationend", ()=>span.remove(), { once:true });
  }

  document.addEventListener("pointerdown", (e)=>{
    const el = (e.target && e.target.closest && e.target.closest).(".btn, .navBtn, .segBtn, .fab");
    if(!el) return;
    addRipple(el, e);
  }, { passive:true });
})();



// =====================
// v15 BANK UI: Home "Mostra altro" (safe)
// =====================
(function bankHomeLessMore(){
  if (window.__sspBankHomeInit) return;
  window.__sspBankHomeInit = true;

  function ready(fn){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, {once:true});
    else fn();
  }

  ready(function(){
    const home = document.querySelector('[data-page="home"] .card .bd');
    if(!home) return;

    // Identify blocks to keep always visible (stats + quick actions if present)
    // We'll hide everything after the first divider by default on small screens, but allow expand.
    const divider = home.querySelector('.divider');
    if(!divider) return;

    // Create a container for "extra" nodes after divider (except the first immediate block if it's quick spend)
    const extra = document.createElement('div');
    extra.id = 'homeExtra';
    extra.style.marginTop = '12px';

    // Move nodes after divider into extra (keep divider itself)
    let node = divider.nextSibling;
    const toMove = [];
    while(node){
      const next = node.nextSibling;
      // keep empty text nodes out
      if (!(node.nodeType === 3 && !node.textContent.trim())) {
        toMove.push(node);
      }
      node = next;
    }
    toMove.forEach(n => extra.appendChild(n));
    home.appendChild(extra);

    // Insert toggle button right after stats block (before divider)
    const stats = home.querySelector('.stats');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.id = 'btnHomeMore';
    btn.textContent = 'Mostra dettagli';
    btn.style.marginTop = '12px';
    btn.style.width = '100%';

    // place after stats (or at top of bd)
    if (stats && stats.parentNode) stats.parentNode.insertBefore(btn, divider);
    else home.insertBefore(btn, divider);

    // default collapsed on small screens
    function apply(){
      const small = window.matchMedia('(max-width: 520px)').matches;
      if (small){
        extra.hidden = !btn.dataset.open;
        btn.textContent = btn.dataset.open ? 'Nascondi dettagli' : 'Mostra dettagli';
      } else {
        extra.hidden = false;
        btn.textContent = 'Dettagli';
      }
    }
    btn.addEventListener('click', ()=>{
      btn.dataset.open = btn.dataset.open ? '' : '1';
      if (!btn.dataset.open) btn.removeAttribute('data-open');
      apply();
    });

    window.addEventListener('resize', apply, {passive:true});
    apply();
  });
})();

// ===============================
// Ultra-native BottomSheet (v17)
// - FAB opens sheet
// - Safe mapping to existing actions
// ===============================
(function ultraNativeInit(){
  if (window.__sspUltraNativeInit) return;
  window.__sspUltraNativeInit = true;

  const $ = (s) => document.querySelector(s);

  const sheet = $("#fabSheet");
  const backdrop = $("#sheetBackdrop");
  const closeBtn = $("#sheetCloseBtn");

  function openSheet(){
    if (!sheet || !backdrop) return;
    backdrop.classList.add("open");
    sheet.classList.add("open");
    backdrop.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }
  function closeSheet(){
    if (!sheet || !backdrop) return;
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    backdrop.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  // Try to click existing UI elements (multiple fallbacks)
  function clickFirst(selectors){
    for (const sel of selectors){
      const el = document.querySelector(sel);
      if (el){
        el.click();
        return true;
      }
    }
    return false;
  }

  function openAdd(type){
    // Prefer native controls if present
    if (type === "expense"){
      if (clickFirst(["#btnAddExpense","#addExpense","#newExpense","#addMovement","#btnAdd"])) return;
      // Fallback to URL param handled by app (if implemented)
      try{ const u = new URL(location.href); u.searchParams.set("action","add"); u.searchParams.set("type","expense"); history.replaceState({}, "", u.toString()); }catch{}
    }
    if (type === "income"){
      if (clickFirst(["#btnAddIncome","#addIncome","#newIncome","#addMovement","#btnAdd"])) return;
      try{ const u = new URL(location.href); u.searchParams.set("action","add"); u.searchParams.set("type","income"); history.replaceState({}, "", u.toString()); }catch{}
      // If your add modal has a type toggle, try set it
      clickFirst(["#moveTypeIncome","[data-move-type='income']"]);
    }
    if (type === "doc"){
      if (clickFirst(["#btnAddDoc","#addDoc","#newDoc","#btnDocumentsAdd","#docAdd"])) return;
      try{ const u = new URL(location.href); u.searchParams.set("page","documents"); u.searchParams.set("action","adddoc"); history.replaceState({}, "", u.toString()); }catch{}
      clickFirst(["[data-nav='documents']","#tabDocuments",".navBtn[data-page='documents']"]);
    }
    if (type === "rec"){
      if (clickFirst(["#btnAddRecurring","#addRecurring","#newRecurring","#recAdd"])) return;
      try{ const u = new URL(location.href); u.searchParams.set("page","recurring"); u.searchParams.set("action","addrec"); history.replaceState({}, "", u.toString()); }catch{}
    }
  }

  // Hook FAB
  const fab = document.querySelector(".fab");
  if (fab){
    fab.addEventListener("click", (e)=>{
      e.preventDefault();
      openSheet();
    });
  }

  // Sheet buttons
  const aExp = $("#sheetAddExpense");
  const aInc = $("#sheetAddIncome");
  const aDoc = $("#sheetAddDoc");
  const aRec = $("#sheetAddRecurring");

  aExp && aExp.addEventListener("click", ()=>{ closeSheet(); openAdd("expense"); });
  aInc && aInc.addEventListener("click", ()=>{ closeSheet(); openAdd("income"); });
  aDoc && aDoc.addEventListener("click", ()=>{ closeSheet(); openAdd("doc"); });
  aRec && aRec.addEventListener("click", ()=>{ closeSheet(); openAdd("rec"); });

  closeBtn && closeBtn.addEventListener("click", closeSheet);
  backdrop && backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeSheet(); });

  // ===============================
  // Page transitions (safe)
  // ===============================
  function markPages(){
    document.querySelectorAll(".page").forEach(p=>{
      if (!p.classList.contains("animEnter")) p.classList.add("animEnter");
      if (p.classList.contains("active") || p.style.display !== "none") p.classList.add("pageActive");
    });
  }
  markPages();

  // Observe class changes to animate when switching tabs
  const obs = new MutationObserver((mutList)=>{
    let changed = false;
    for (const m of mutList){
      if (m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style")){
        changed = true;
      }
    }
    if (!changed) return;
    document.querySelectorAll(".page").forEach(p=>{
      const isActive = p.classList.contains("active") || p.classList.contains("show") || p.style.display !== "none";
      if (isActive) p.classList.add("pageActive");
      else p.classList.remove("pageActive");
    });
  });
  document.querySelectorAll(".page").forEach(p=>obs.observe(p, { attributes:true, attributeFilter:["class","style"] }));
})();

// ==================================
// Ultra Native Plus (v20)
// - Swipe down to close BottomSheet
// - Haptic feedback
// - Loading overlay for heavy actions
// ==================================
(function ultraNativePlus(){
  if (window.__sspUltraNativePlus) return;
  window.__sspUltraNativePlus = true;

  const $ = (s) => document.querySelector(s);
  const sheet = $("#fabSheet");
  const backdrop = $("#sheetBackdrop");

  // Haptic helper
  function haptic(ms){
    try{
      if (navigator && typeof navigator.vibrate === "function") navigator.vibrate(ms);
    }catch{}
  }

  // Patch open/close to include haptic (if functions exist in v18 mapping)
  function openSheetPlus(){
    if (!sheet || !backdrop) return;
    backdrop.classList.add("open");
    sheet.classList.add("open");
    backdrop.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    haptic(10);
  }
  function closeSheetPlus(){
    if (!sheet || !backdrop) return;
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    backdrop.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
    haptic(8);
  }

  // If FAB exists, override click handler to ensure it opens the sheet cleanly
  const fab = document.querySelector(".fab");
  if (fab){
    fab.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      openSheetPlus();
    }, true);
  }

  // Ensure close on backdrop click uses plus close
  if (backdrop){
    backdrop.addEventListener("click", (e)=>{ e.preventDefault(); closeSheetPlus(); }, true);
  }

  // Swipe down gesture
  if (sheet){
    let startY = 0;
    let curY = 0;
    let dragging = false;

    function onDown(ev){
      if (!sheet.classList.contains("open")) return;
      dragging = true;
      startY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
      curY = startY;
      sheet.style.transition = "none";
    }
    function onMove(ev){
      if (!dragging) return;
      curY = (ev.touches ? ev.touches[0].clientY : ev.clientY);
      const dy = Math.max(0, curY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
      if (dy > 4) ev.preventDefault();
    }
    function onUp(){
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, curY - startY);
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (dy > 110){
        closeSheetPlus();
      }
    }

    sheet.addEventListener("touchstart", onDown, { passive:true });
    sheet.addEventListener("touchmove", onMove, { passive:false });
    sheet.addEventListener("touchend", onUp, { passive:true });
    sheet.addEventListener("pointerdown", onDown, { passive:true });
    sheet.addEventListener("pointermove", onMove, { passive:false });
    sheet.addEventListener("pointerup", onUp, { passive:true });
  }

  // Loading overlay
  const overlay = $("#sspLoading");
  const tTitle = $("#sspLoadingTitle");
  const tSub = $("#sspLoadingSub");
  let hideTimer = null;

  function showLoading(title, sub, autoHideMs){
    if (!overlay) return;
    if (tTitle) tTitle.textContent = title || "Operazione in corso…";
    if (tSub) tSub.textContent = sub || "Attendi un momento";
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden","false");
    if (hideTimer) clearTimeout(hideTimer);
    const ms = Number.isFinite(autoHideMs) ? autoHideMs : 12000;
    hideTimer = setTimeout(hideLoading, ms);
  }
  function hideLoading(){
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden","true");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }

  // Safety: never leave the UI blocked by a stuck loader
  window.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{ try{ hideLoading(); }catch(e){} }, 1500);
  });


  // Hide loader when app becomes visible again (safety)
  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden) hideLoading();
  });

  // Hook common heavy-action buttons by id/text (safe, no crashes)
  function hookBtn(selList, title, sub){
    selList.forEach((sel)=>{
      const el = document.querySelector(sel);
      if (!el) return;
      el.addEventListener("click", ()=>{
        showLoading(title, sub, 15000);
        haptic(12);
        // If the underlying action ends quickly, overlay can be closed by a "download" or by navigation.
        // As a safe fallback we auto-hide after 15s.
      }, { passive:true });
    });
  }

  hookBtn(["#btnPdf","#btnMakePdf","#exportPdf","#reportPdf","#pdfBtn"], "Generazione PDF…", "Sto preparando il report");
  hookBtn(["#btnCsv","#btnExportCsv","#exportCsv","#reportCsv","#csvBtn"], "Esportazione CSV…", "Sto preparando il file");
  hookBtn(["#btnScan","#scannerBtn","#scanBtn"], "Scansione…", "Elaborazione immagine");
  hookBtn(["#btnBackupExport","#backupExport","#exportBackup"], "Backup…", "Sto preparando l’esportazione");
  hookBtn(["#btnBackupImport","#backupImport","#importBackup"], "Import…", "Sto caricando i dati");

  // Allow any existing code to close overlay by dispatching event
  window.addEventListener("ssp:loading:hide", hideLoading);
  window.__sspLoading = { show: showLoading, hide: hideLoading };
})();

// ==================================
// Badges + Tab Slide (v21) - safe UI
// ==================================
(function badgesAndTabs(){
  if (window.__sspBadgesTabs) return;
  window.__sspBadgesTabs = true;

  function addBadge(el){
    if (!el || el.querySelector(".proBadge")) return;
    const b = document.createElement("span");
    b.className = "proBadge small";
    b.textContent = "PRO";
    // Try to place nicely:
    // If element has a title row, append to the right; else append at end
    if (el.classList.contains("sheetAction")){
      // For bottom sheet actions, append into text area
      const text = el.querySelector(".saText");
      if (text){
        const wrap = document.createElement("div");
        wrap.className = "proTag";
        // keep existing title/sub layout
        // Move children into wrap if possible
        const t = text.querySelector(".saTitle");
        if (t){
          // Insert badge on title line
          t.style.display = "flex";
          t.style.alignItems = "center";
          t.style.gap = "8px";
          t.appendChild(b);
          return;
        }
      }
    }
    el.appendChild(b);
  }

  // Mark some advanced features as PRO visually (you can tune later with Billing)
  // BottomSheet: Documento + Pagamento fisso are "advanced"
  addBadge(document.querySelector("#sheetAddDoc"));
  addBadge(document.querySelector("#sheetAddRecurring"));

  // Settings: look for items by id (if present) and mark
  const proSelectors = [
    "#settingsNfc", "#settingsBankImport", "#settingsRules", "#settingsCouple",
    "#settingsDocs", "#settingsRecurring", "#settingsBackup", "#settingsPdf", "#settingsCsv"
  ];
  proSelectors.forEach(sel => addBadge(document.querySelector(sel)));

  // Also mark any element explicitly tagged with data-pro="1"
  document.querySelectorAll("[data-pro='1']").forEach(addBadge);

  // -----------------------------
  // Tab slide transitions
  // -----------------------------
  const pages = Array.from(document.querySelectorAll(".page"));
  if (!pages.length) return;

  function isActive(p){
    return p.classList.contains("active") || p.classList.contains("show") || p.getAttribute("aria-hidden")==="false" || p.style.display === "" || p.style.display === "block";
  }

  let lastActive = pages.find(isActive) || null;

  function animateSwitch(){
    const nowActive = pages.find(isActive) || null;
    if (!nowActive || nowActive === lastActive) return;

    // Prepare entering page
    nowActive.classList.add("slideAnim","slideEnter");
    // Force reflow
    void nowActive.offsetWidth;
    nowActive.classList.remove("slideEnter");

    // Animate exit for lastActive
    if (lastActive){
      lastActive.classList.add("slideAnim","slideExit");
      setTimeout(()=> lastActive && lastActive.classList.remove("slideExit"), 220);
    }

    setTimeout(()=> nowActive && nowActive.classList.remove("slideAnim"), 260);
    setTimeout(()=> lastActive && lastActive.classList.remove("slideAnim"), 260);

    lastActive = nowActive;
  }

  const obs = new MutationObserver(()=> animateSwitch());
  pages.forEach(p=> obs.observe(p, { attributes:true, attributeFilter:["class","style","aria-hidden"] }));
})();


// === TAP/OVERLAY SAFETY BOOTSTRAP (auto) ===
(()=>{
  const run=()=>{try{ if(typeof unblockGuard==='function') unblockGuard(); }catch(e){} };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
  window.addEventListener('load', run);
  // Keep running for a short while to defeat cached/stuck overlays (PWA builders sometimes inject).
  let n=0;
  const t=setInterval(()=>{run(); if(++n>30) clearInterval(t);}, 500);
})();
