(function(){
"use strict";
const VERSES = window.VERSES || [];
const DEFAULT_TIMINGS = window.TIMINGS || null;   // {verses:[{start,end,words:[{s,e}]}]}

/* per-student content bundle (name, media, storage namespace) */
const STUDENT = window.STUDENT || { id:"ori", name:"אורי" };
const SID = STUDENT.id || "ori";
const LEGACY = (SID === "ori");                    // "ori" keeps the original keys so nothing is lost
const LS_KEY  = LEGACY ? "ori_timings_v1" : SID + "_timings_v1";
const K_NIKUD = LEGACY ? "ori_nikud"      : SID + "_nikud";
const K_THEME = LEGACY ? "ori_theme"      : SID + "_theme";
const DB_NAME = LEGACY ? "toraOr"         : "toraOr_" + SID;
const K_LEVEL  = SID + "_level";
const K_TAAMIM = SID + "_taamim";

const audio = document.getElementById("audioFull");
let speed = 1;

/* fill per-student bits into the shared shell */
function initStudent(){
  try{
    if(STUDENT.media){
      if(STUDENT.media.full)  audio.src  = STUDENT.media.full;
    }
    const sub=document.getElementById("studentSub"); if(sub && STUDENT.subtitle) sub.textContent=STUDENT.subtitle;
    const rf=document.getElementById("studentRef"); if(rf && STUDENT.ref) rf.textContent=STUDENT.ref;
  }catch(e){}
}

/* ---------- timing store (defaults + localStorage overrides) ---------- */
function loadOverrides(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY)) || {verses:{}}; }
  catch(e){ return {verses:{}}; }
}
function saveOverrides(o){ localStorage.setItem(LS_KEY, JSON.stringify(o)); }
let overrides = loadOverrides();

// returns timing object for verse vi or null
function timingFor(vi){
  const ov = overrides.verses && overrides.verses[vi];
  if (ov && ov.start!=null && ov.end!=null) return normalize(vi, ov);
  if (DEFAULT_TIMINGS && DEFAULT_TIMINGS.verses && DEFAULT_TIMINGS.verses[vi]){
    const d = DEFAULT_TIMINGS.verses[vi];
    if (d && d.start!=null && d.end!=null) return normalize(vi, d);
  }
  return null;
}
// ensure per-word timings exist; if missing, distribute by consonant weight
function normalize(vi, t){
  const words = VERSES[vi].words;
  let wt = t.words;
  if (!wt || wt.length !== words.length){
    const totalW = words.reduce((a,w)=>a+Math.max(1,w.n),0);
    const span = t.end - t.start;
    wt = []; let acc = 0;
    for (let i=0;i<words.length;i++){
      const s = t.start + span*acc/totalW;
      acc += Math.max(1,words[i].n);
      const e = t.start + span*acc/totalW;
      wt.push({s:+s.toFixed(3), e:+e.toFixed(3)});
    }
  }
  return {start:t.start, end:t.end, words:wt};
}
function hasAnyTiming(){
  for (let i=0;i<VERSES.length;i++) if (timingFor(i)) return true;
  return false;
}

/* ---------- render verses ---------- */
const versesEl = document.getElementById("verses");
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
function buildVerses(){
  versesEl.innerHTML = "";
  VERSES.forEach((v, vi)=>{
    const row = document.createElement("div");
    row.className = "verse"; row.dataset.vi = vi;
    const play = document.createElement("div");
    play.className = "play"; play.innerHTML = PLAY_SVG;
    play.title = "השמע / השהה פסוק זה";
    play.addEventListener("click", ()=> onVerseBtn(vi));
    const num = document.createElement("div");
    num.className = "num"; num.textContent = v.ref;
    const text = document.createElement("div");
    text.className = "text";
    v.words.forEach((w, wi)=>{
      const s = document.createElement("span");
      s.className = "w"; s.textContent = w.t; s.dataset.vi=vi; s.dataset.wi=wi;
      s.addEventListener("click", ()=> onWord(vi, wi));
      text.appendChild(s);
      text.appendChild(document.createTextNode(" "));
    });
    const body = document.createElement("div");
    body.className = "vbody";
    body.appendChild(text);
    const recbar = document.createElement("div");
    recbar.className = "recbar";
    body.appendChild(recbar);
    row.appendChild(play); row.appendChild(num); row.appendChild(body);
    versesEl.appendChild(row);
  });
}

/* ---------- playback ---------- */
let raf=null, active=null, stopAt=null, playingAll=false;
const nowbar=document.getElementById("nowbar"), npNum=document.getElementById("npNum");

function clearHL(){
  document.querySelectorAll(".text .w.hl,.text .w.past").forEach(e=>e.classList.remove("hl","past"));
  document.querySelectorAll(".verse.active").forEach(e=>e.classList.remove("active"));
}
const nowPause=document.getElementById("nowPause");
// reflect play/pause state on the verse buttons and the now-bar
function refreshTransport(){
  const playing = active!=null && !audio.paused;
  document.querySelectorAll(".verse").forEach(row=>{
    const btn=row.querySelector(".play");
    if(!btn) return;
    const isThis = (parseInt(row.dataset.vi,10)===active);
    btn.innerHTML = (isThis && playing) ? PAUSE_SVG : PLAY_SVG;
  });
  if(nowPause) nowPause.textContent = playing ? "⏸ השהה" : "▶ המשך";
}

function stopAll(){
  audio.pause(); if(raf) cancelAnimationFrame(raf); raf=null;
  active=null; stopAt=null; playingAll=false;
  clearHL(); nowbar.classList.remove("show");
  refreshTransport();
}
document.getElementById("nowStop").addEventListener("click", stopAll);

// pause but keep position + highlight, so we can resume from the same spot
function pausePlayback(){
  if(active==null) return;
  audio.pause();
  if(raf) cancelAnimationFrame(raf); raf=null;
  refreshTransport();
}
function resumePlayback(){
  if(active==null) return;
  audio.playbackRate = speed;
  audio.play().catch(()=>{});
  tick();
  refreshTransport();
}
// verse play button: start / pause / resume depending on state
function onVerseBtn(vi){
  if(active===vi){
    if(audio.paused) resumePlayback(); else pausePlayback();
  } else {
    playVerse(vi);
  }
}
if(nowPause){
  nowPause.addEventListener("click", ()=>{
    if(active==null) return;
    if(audio.paused) resumePlayback(); else pausePlayback();
  });
}
const nowRestart=document.getElementById("nowRestart");
if(nowRestart){
  nowRestart.addEventListener("click", ()=>{ if(active!=null) playVerse(active); });  // replay current verse from its start
}

function playVerse(vi, fromWord){
  const t = timingFor(vi);
  if(!t){ flashNoTiming(vi); return; }
  if(raf) cancelAnimationFrame(raf);
  clearHL();
  active = vi; playingAll = false;
  const startT = (fromWord!=null && t.words[fromWord]) ? t.words[fromWord].s : t.start;
  // stop a bit before the boundary so a single verse doesn't bleed into the next
  // verse's first word. Verses are contiguous (end[N] == start[N+1]) and audio
  // pause has ~100-150ms latency, so pull back ~0.12s.
  stopAt = t.end - 0.12;
  const nt = timingFor(vi+1);
  if(nt && nt.start > t.start) stopAt = Math.min(stopAt, nt.start - 0.12);
  if(stopAt < startT + 0.15) stopAt = startT + 0.15;   // never below a playable minimum
  const row = versesEl.querySelector('.verse[data-vi="'+vi+'"]');
  if(row){ row.classList.add("active"); row.scrollIntoView({behavior:"smooth",block:"center"}); }
  npNum.textContent = VERSES[vi].ref; nowbar.classList.add("show");
  audio.playbackRate = speed;
  audio.currentTime = startT;
  audio.play().catch(()=>{});
  tick();
  refreshTransport();
}

function tick(){
  const ct = audio.currentTime;
  if (active!=null){
    const t = timingFor(active);
    if (t){
      const row = versesEl.querySelector('.verse[data-vi="'+active+'"]');
      const spans = row ? row.querySelectorAll(".text .w") : [];
      let cur=-1;
      for (let i=0;i<t.words.length;i++){ if (ct >= t.words[i].s - 0.02) cur=i; else break; }
      spans.forEach((sp,i)=>{
        sp.classList.toggle("hl", i===cur);
        sp.classList.toggle("past", i<cur);
      });
    }
    if (stopAt!=null && ct >= stopAt){
      if (playingAll){ nextInAll(); return; }
      stopAll(); return;
    }
  }
  raf = requestAnimationFrame(tick);
}

/* play all verses back-to-back */
let allIdx=0;
function playAll(){
  const first = firstWithTiming();
  if (first<0){ flashNoTiming(0); return; }
  playingAll=true; allIdx=first; startAllVerse(first);
}
function firstWithTiming(){ for(let i=0;i<VERSES.length;i++) if(timingFor(i)) return i; return -1; }
function startAllVerse(vi, fromWord){
  const t=timingFor(vi);
  if(!t){ nextInAll(); return; }
  if(raf) cancelAnimationFrame(raf);
  clearHL();
  active=vi; stopAt=t.end+0.04;
  const row=versesEl.querySelector('.verse[data-vi="'+vi+'"]');
  if(row){ row.classList.add("active"); row.scrollIntoView({behavior:"smooth",block:"center"}); }
  npNum.textContent=VERSES[vi].ref; nowbar.classList.add("show");
  const startT = (fromWord!=null && t.words[fromWord]) ? t.words[fromWord].s : t.start;
  audio.playbackRate=speed; audio.currentTime=startT; audio.play().catch(()=>{}); tick();
  refreshTransport();
}
function nextInAll(){
  let n=allIdx+1;
  while(n<VERSES.length && !timingFor(n)) n++;
  if(n>=VERSES.length){ stopAll(); celebrate(); return; }
  allIdx=n; startAllVerse(n);
}
// continuous play starting from a specific verse/word (used by level 4: one long reading)
function playAllFrom(vi, fromWord){
  if(!timingFor(vi)){
    let n=vi; while(n<VERSES.length && !timingFor(n)) n++;
    if(n>=VERSES.length){ flashNoTiming(vi); return; }
    vi=n; fromWord=null;
  }
  playingAll=true; allIdx=vi; startAllVerse(vi, fromWord);
}
// clicking a word: level 4 = play the whole passage continuously from here;
// levels 1-3 = play just that verse.
function onWord(vi, wi){
  if(level===4) playAllFrom(vi, wi);
  else playVerse(vi, wi);
}
function celebrate(){
  const light = (document.documentElement.getAttribute("data-theme")==="light");
  const heroEl = document.querySelector(light ? ".hero-wrap .hero-light" : ".hero-wrap .hero-dark");
  const img = heroEl ? heroEl.src : "";   // reuse the header logo path (works in any folder)
  const nm = (STUDENT && STUDENT.name) ? STUDENT.name : "";
  uiModal({
    message:(img?'<img src="'+img+'" alt="תורה אורי" style="height:118px;width:auto;display:block;margin:0 auto 12px">':'')+
            '<div style="font-weight:800;font-size:1.2rem;margin-bottom:4px">כל הכבוד'+(nm?", "+nm:"")+'! 🎉</div>'+
            '<div>סיימת מעבר על כל הקטע ב'+levelName()+' — אשריך!</div>',
    okText:"תודה!", cancelText:null
  });
}


/* ---------- controls ---------- */
document.getElementById("playAll").addEventListener("click", playAll);
document.getElementById("speedGroup").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  speed=parseFloat(b.dataset.sp);
  [...e.currentTarget.children].forEach(c=>c.classList.toggle("on",c===b));
  audio.playbackRate=speed;
});

let noTimingTimer=null;
const noSyncWarn=document.getElementById("noSyncWarn");
function flashNoTiming(vi){
  noSyncWarn.style.display="block";
  noSyncWarn.textContent="לפסוק זה עדיין לא הוגדרו זמנים בהקלטה. פִּתחו \"מצב סנכרון\" והקליטו את התזמון (זה נעשה פעם אחת).";
  clearTimeout(noTimingTimer); noTimingTimer=setTimeout(()=>noSyncWarn.style.display="none",6000);
}

/* ================= SYNC EDITOR ================= */
const editor=document.getElementById("editor");
const edVerse=document.getElementById("edVerse");
document.getElementById("syncToggle").addEventListener("click", e=>{
  editor.classList.toggle("show"); e.currentTarget.classList.toggle("on", editor.classList.contains("show"));
  if(editor.classList.contains("show")){ refreshEditor(); editor.scrollIntoView({behavior:"smooth"}); }
});
VERSES.forEach((v,vi)=>{ const o=document.createElement("option"); o.value=vi;
  o.textContent="פסוק "+v.ref+"  ("+v.words.length+" מילים)"; edVerse.appendChild(o); });

function curVi(){ return parseInt(edVerse.value||"0",10); }
function refreshEditor(){
  const vi=curVi(); const t=timingFor(vi);
  document.getElementById("edStart").textContent = t? t.start.toFixed(2):"—";
  document.getElementById("edEnd").textContent   = t? t.end.toFixed(2):"—";
  document.getElementById("edStartIn").value = t? t.start.toFixed(2):"";
  document.getElementById("edEndIn").value   = t? t.end.toFixed(2):"";
}
edVerse.addEventListener("change", refreshEditor);

function setVerseTiming(vi, obj){
  overrides.verses = overrides.verses || {};
  overrides.verses[vi] = Object.assign({}, overrides.verses[vi], obj);
  saveOverrides(overrides); refreshEditor(); updateWarn();
}
document.getElementById("edApplyBounds").addEventListener("click", ()=>{
  const vi=curVi();
  const s=parseFloat(document.getElementById("edStartIn").value);
  const e=parseFloat(document.getElementById("edEndIn").value);
  if(isNaN(s)||isNaN(e)||e<=s){ uiAlert("הזינו זמן התחלה וסיום תקינים (סיום גדול מהתחלה).",{icon:"⚠️"}); return; }
  const ex = (overrides.verses&&overrides.verses[vi])||{};
  // if word count-consistent words exist keep them, else drop so they redistribute
  let words = ex.words && ex.words.length===VERSES[vi].words.length ? null : null;
  setVerseTiming(vi, {start:s, end:e, words:null});
});
document.getElementById("edPreview").addEventListener("click", ()=> playVerse(curVi()));
document.getElementById("edReset").addEventListener("click", ()=>{
  const vi=curVi();
  if(overrides.verses) delete overrides.verses[vi];
  saveOverrides(overrides); refreshEditor(); updateWarn();
});

/* --- tap-to-record word timings --- */
let recording=false, recTimes=[], recVi=null;
const tapBtn=document.getElementById("edTapBtn");
const recStatus=document.getElementById("edRecStatus");
function startRecord(){
  recVi=curVi(); recording=true; recTimes=[];
  const words=VERSES[recVi].words;
  stopAll();
  tapBtn.style.display="inline-flex";
  document.getElementById("edRecord").textContent="⏹ סיים / בטל הקלטה";
  updateRecStatus();
  // play from a bit before current known start, or from 0
  const t=timingFor(recVi);
  const from = t? Math.max(0, t.start-0.3) : promptStart();
  audio.playbackRate = 1; audio.currentTime=from; audio.play().catch(()=>{});
  // highlight active verse
  clearHL();
  const row=versesEl.querySelector('.verse[data-vi="'+recVi+'"]'); if(row) row.classList.add("active");
  recLoop();
}
function promptStart(){ return 0; }
function updateRecStatus(){
  const words=VERSES[recVi].words;
  const done=recTimes.length;
  if(done<=words.length)
    recStatus.textContent = "מקישים ברגע תחילת: "+(done<words.length? "«"+words[done].t+"»" : "— (הקישו שוב לסיום הפסוק)")+"   ["+done+"/"+words.length+"]";
}
function recLoop(){
  if(!recording) return;
  recStatus.dataset.time = audio.currentTime.toFixed(2);
  requestAnimationFrame(recLoop);
}
function tap(){
  if(!recording) return;
  const words=VERSES[recVi].words;
  recTimes.push(+audio.currentTime.toFixed(3));
  if(recTimes.length > words.length){ finishRecord(true); return; }
  updateRecStatus();
}
function finishRecord(save){
  recording=false; audio.pause();
  tapBtn.style.display="none";
  document.getElementById("edRecord").textContent="🎯 הקלט תזמון מילים (רווח לכל מילה)";
  const words=VERSES[recVi].words;
  if(save && recTimes.length>=2){
    // recTimes[i] = start of word i ; last extra tap = end of verse
    const starts = recTimes.slice(0, words.length);
    let endV = recTimes[recTimes.length-1];
    if (recTimes.length <= words.length){ endV = Math.min(audio.duration||endV, starts[starts.length-1]+1.2); }
    const wt=[];
    for(let i=0;i<words.length;i++){
      const s = starts[i]!=null? starts[i] : (wt.length?wt[wt.length-1].e:starts[0]);
      const e = (i+1<starts.length)? starts[i+1] : endV;
      wt.push({s:+s.toFixed(3), e:+(e||s+0.3).toFixed(3)});
    }
    setVerseTiming(recVi, {start:starts[0], end:endV, words:wt});
    recStatus.textContent="✓ נשמר! ("+words.length+" מילים)";
  } else {
    recStatus.textContent="בוטל.";
  }
  clearHL();
}
document.getElementById("edRecord").addEventListener("click", ()=>{ recording?finishRecord(true):startRecord(); });
tapBtn.addEventListener("click", tap);
document.addEventListener("keydown", e=>{
  if(e.code==="Space" && recording){ e.preventDefault(); tap(); }
  if(e.code==="Escape" && recording){ finishRecord(false); }
});

/* --- import / export --- */
function currentFullTimings(){
  const out={version:1, verses:[]};
  for(let i=0;i<VERSES.length;i++){ const t=timingFor(i); out.verses[i]= t? {start:t.start,end:t.end,words:t.words}:null; }
  return out;
}
document.getElementById("edExport").addEventListener("click", ()=>{
  const data=currentFullTimings();
  document.getElementById("edJson").value = "window.TIMINGS = "+JSON.stringify(data)+";";
  // also offer file download
  const blob=new Blob([document.getElementById("edJson").value],{type:"text/javascript"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="timings.js"; a.click();
});
document.getElementById("edImport").addEventListener("click", ()=> document.getElementById("edJson").focus());
document.getElementById("edLoadJson").addEventListener("click", ()=>{
  let txt=document.getElementById("edJson").value.trim();
  txt=txt.replace(/^window\.TIMINGS\s*=\s*/,"").replace(/;\s*$/,"");
  try{
    const d=JSON.parse(txt);
    if(!d.verses) throw 0;
    overrides={verses:{}};
    d.verses.forEach((v,i)=>{ if(v) overrides.verses[i]=v; });
    saveOverrides(overrides); refreshEditor(); updateWarn();
    uiAlert("הזמנים נטענו בהצלחה ✓",{icon:"✅"});
  }catch(err){ uiAlert("ה-JSON אינו תקין.",{icon:"⚠️"}); }
});

/* ---------- warn if no timing at all ---------- */
function updateWarn(){
  if(!hasAnyTiming()){
    noSyncWarn.style.display="block";
    noSyncWarn.innerHTML="עדיין לא הוגדרו זמנים להקלטה. פִּתחו <b>מצב סנכרון (להורה)</b> כדי לסמן את זמני הפסוקים והמילים — פעם אחת בלבד, וזה נשמר.";
  } else if(document.activeElement && noSyncWarn.textContent.indexOf("עדיין")>-1){
    // keep
  }
}

/* ---------- PWA install prompt ---------- */
let deferredPrompt=null;
const installBtn=document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault(); deferredPrompt=e;
  if(installBtn) installBtn.style.display="inline-flex";
});
if(installBtn){
  installBtn.addEventListener("click", async ()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt=null; installBtn.style.display="none";
  });
}
window.addEventListener("appinstalled", ()=>{ if(installBtn) installBtn.style.display="none"; });

/* ================= styled dialogs (replace native alert/confirm) ================= */
function uiModal(opts){
  return new Promise(function(resolve){
    const hasCancel = opts.cancelText!==null && opts.cancelText!==undefined;
    const ov=document.createElement("div"); ov.className="modal-ov";
    const box=document.createElement("div"); box.className="modal-box"+(opts.danger?" danger":"");
    let html="";
    if(opts.icon) html+='<div class="modal-icon">'+opts.icon+'</div>';
    if(opts.title) html+='<div class="modal-title">'+opts.title+'</div>';
    html+='<div class="modal-msg">'+opts.message+'</div><div class="modal-btns"></div>';
    box.innerHTML=html;
    const btns=box.querySelector(".modal-btns");
    let done=false;
    function close(val){ if(done)return; done=true; ov.classList.remove("show"); document.removeEventListener("keydown",onkey);
      setTimeout(function(){ ov.remove(); }, 180); resolve(val); }
    if(hasCancel){ const c=document.createElement("button"); c.className="modal-btn cancel"; c.textContent=opts.cancelText||"ביטול"; c.onclick=function(){close(false);}; btns.appendChild(c); }
    const ok=document.createElement("button"); ok.className="modal-btn ok"+(opts.danger?" danger":""); ok.textContent=opts.okText||"אישור"; ok.onclick=function(){close(true);}; btns.appendChild(ok);
    ov.appendChild(box); document.body.appendChild(ov);
    void ov.offsetWidth;                 // force reflow so the transition runs (no rAF dependency)
    ov.classList.add("show");
    setTimeout(function(){ try{ok.focus();}catch(e){} }, 60);
    ov.addEventListener("click",function(e){ if(e.target===ov) close(hasCancel?false:true); });
    function onkey(e){ if(e.key==="Enter"){ e.preventDefault(); close(true); } else if(e.key==="Escape"){ e.preventDefault(); close(hasCancel?false:true); } }
    document.addEventListener("keydown",onkey);
  });
}
function uiConfirm(message,opts){ opts=opts||{}; return uiModal({message:message, title:opts.title, icon:opts.icon, okText:opts.okText||"אישור", cancelText:opts.cancelText||"ביטול", danger:opts.danger}); }
function uiAlert(message,opts){ opts=opts||{}; return uiModal({message:message, title:opts.title, icon:opts.icon, okText:opts.okText||"הבנתי", cancelText:null}); }

/* ================= USER RECORDINGS (record your own reading) ================= */
const STORE="recordings";  /* DB_NAME defined at top from the student bundle */
function idb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
function recGet(vi){ return idb().then(db=>new Promise((res,rej)=>{ const t=db.transaction(STORE).objectStore(STORE).get(vi); t.onsuccess=()=>res(t.result||null); t.onerror=()=>rej(t.error); })); }
function recPut(vi,val){ return idb().then(db=>new Promise((res,rej)=>{ const t=db.transaction(STORE,"readwrite").objectStore(STORE).put(val,vi); t.onsuccess=()=>res(); t.onerror=()=>rej(t.error); })); }
function recDel(vi){ return idb().then(db=>new Promise((res,rej)=>{ const t=db.transaction(STORE,"readwrite").objectStore(STORE).delete(vi); t.onsuccess=()=>res(); t.onerror=()=>rej(t.error); })); }
function recKeys(){ return idb().then(db=>new Promise((res,rej)=>{ const t=db.transaction(STORE).objectStore(STORE).getAllKeys(); t.onsuccess=()=>res(t.result||[]); t.onerror=()=>rej(t.error); })); }

const recorded = new Set();
let mediaRec=null, recChunks=[], recStream=null, recordingVi=null, recTimer=null, recStart=0;
let mineAudio=null, mineUrl=null;

function pickMime(){
  const c=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/aac","audio/ogg"];
  if(window.MediaRecorder && MediaRecorder.isTypeSupported)
    for(const m of c){ try{ if(MediaRecorder.isTypeSupported(m)) return m; }catch(e){} }
  return "";
}
function fmtDur(s){ const m=Math.floor(s/60), ss=Math.floor(s%60); return m+":"+(ss<10?"0":"")+ss; }

function mkBtn(txt,cls,onclick){ const b=document.createElement("span"); b.className="minibtn "+(cls||""); b.textContent=txt; b.addEventListener("click",onclick); return b; }

function renderRecBar(vi){
  const bar=versesEl.querySelector('.verse[data-vi="'+vi+'"] .recbar');
  if(!bar) return;
  bar.innerHTML="";
  if(recordingVi===vi){
    bar.appendChild(mkBtn("⏹ עצור הקלטה","rec-stop",()=>stopUserRec()));
    const t=document.createElement("span"); t.className="rec-timer"; t.id="rectimer-"+vi; t.textContent="● 0:00";
    bar.appendChild(t);
    return;
  }
  const has=recorded.has(vi);
  bar.appendChild(mkBtn(has?"🎤 הקליטו שוב":"🎤 הקליטו את עצמכם","rec-btn",()=>startUserRec(vi)));
  if(has){
    bar.appendChild(mkBtn("▶ ההקלטה שלי","mine-btn",()=>playMine(vi)));
    bar.appendChild(mkBtn("🔍 השוואה למקור","cmp-btn",()=>compareVerse(vi)));
    bar.appendChild(mkBtn("🗑 מחק","del-btn",()=>deleteUserRec(vi)));
  }
}
function clearCmp(vi){ const b=versesEl.querySelector('.verse[data-vi="'+vi+'"] .cmp-result'); if(b) b.remove(); clearWordColors(vi); }

function startRecTimer(vi){
  stopRecTimer();
  recTimer=setInterval(()=>{
    const el=document.getElementById("rectimer-"+vi);
    if(el) el.textContent="● "+fmtDur((performance.now()-recStart)/1000);
  },200);
}
function stopRecTimer(){ if(recTimer){ clearInterval(recTimer); recTimer=null; } }

function startUserRec(vi){
  const begin=()=>{
    stopAll();                     // stop original playback
    if(mineAudio) mineAudio.pause();
    clearCmp(vi);                  // old comparison is stale once re-recording
    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
      recStream=stream; recChunks=[];
      const mime=pickMime();
      try{ mediaRec = mime ? new MediaRecorder(stream,{mimeType:mime}) : new MediaRecorder(stream); }
      catch(e){ mediaRec = new MediaRecorder(stream); }
      mediaRec.ondataavailable=ev=>{ if(ev.data && ev.data.size) recChunks.push(ev.data); };
      mediaRec.onstop=()=>{
        const blob=new Blob(recChunks,{type:(mediaRec&&mediaRec.mimeType)||"audio/webm"});
        if(recStream){ recStream.getTracks().forEach(t=>t.stop()); }
        const finish=()=>{ recordingVi=null; recStream=null; mediaRec=null; stopRecTimer(); renderRecBar(vi); };
        if(blob.size>0){ recPut(vi,{blob,mime:blob.type,createdAt:Date.now()}).then(()=>{ recorded.add(vi); finish(); }).catch(finish); }
        else finish();
      };
      recordingVi=vi; mediaRec.start(1000); recStart=performance.now(); startRecTimer(vi); renderRecBar(vi);
    }).catch(err=>{
      uiAlert("לא ניתן לגשת למיקרופון. יש לאשר הרשאת מיקרופון בדפדפן ולנסות שוב.",{icon:"🎤",title:"נדרשת הרשאת מיקרופון"});
    });
  };
  if(recordingVi!=null){ stopUserRec().then(begin); } else begin();
}

function stopUserRec(){
  return new Promise(res=>{
    if(mediaRec && mediaRec.state!=="inactive"){ mediaRec.addEventListener("stop",()=>res(),{once:true}); mediaRec.stop(); }
    else res();
  });
}

function playMine(vi){
  stopAll();
  recGet(vi).then(rec=>{
    if(!rec) return;
    if(mineAudio){ mineAudio.pause(); if(mineUrl) URL.revokeObjectURL(mineUrl); }
    mineUrl=URL.createObjectURL(rec.blob);
    mineAudio=new Audio(mineUrl); mineAudio.playbackRate=speed;
    mineAudio.play().catch(()=>{});
  });
}

function deleteUserRec(vi){
  uiConfirm("למחוק את ההקלטה שלך לפסוק "+VERSES[vi].ref+"?", {icon:"🗑", okText:"מחק", cancelText:"ביטול", danger:true}).then(function(ok){
    if(!ok) return;
    recDel(vi).then(()=>{ recorded.delete(vi); clearCmp(vi); renderRecBar(vi); });
  });
}

/* ===== Phase 1: compare user recording vs original (tempo + rhythm) ===== */
function rmsEnvelope(buf){
  const d=buf.getChannelData(0), sr=buf.sampleRate;
  const win=Math.max(1,Math.round(sr*0.025)), hop=Math.max(1,Math.round(sr*0.0125));
  const env=[];
  for(let i=0;i+win<=d.length;i+=hop){ let s=0; for(let j=0;j<win;j++){ const v=d[i+j]; s+=v*v; } env.push(Math.sqrt(s/win)); }
  return env.length?env:[0];
}
function normArr(a){ let m=0; for(const x of a) if(x>m)m=x; m=m||1; return a.map(x=>x/m); }
function resampleArr(a,M){ if(a.length===0)return new Array(M).fill(0); if(a.length===1)return new Array(M).fill(a[0]);
  const o=[]; for(let i=0;i<M;i++){ const p=i/(M-1)*(a.length-1),lo=Math.floor(p),hi=Math.ceil(p),f=p-lo; o.push(a[lo]*(1-f)+a[hi]*f);} return o; }
function pearson(a,b){ const n=Math.min(a.length,b.length); if(!n)return 0; let ma=0,mb=0;
  for(let i=0;i<n;i++){ma+=a[i];mb+=b[i];} ma/=n;mb/=n; let d=0,na=0,nb=0;
  for(let i=0;i<n;i++){ const x=a[i]-ma,y=b[i]-mb; d+=x*y;na+=x*x;nb+=y*y;} return (na&&nb)?d/Math.sqrt(na*nb):0; }

function ensureCmpBox(vi){
  const body=versesEl.querySelector('.verse[data-vi="'+vi+'"] .vbody');
  let box=body.querySelector('.cmp-result');
  if(!box){ box=document.createElement('div'); box.className='cmp-result'; body.appendChild(box); }
  return box;
}
function compareVerse(vi){
  const oe = window.ORIG_ENV && ORIG_ENV.verses[vi];
  if(!oe){ uiAlert("אין נתוני מקור לפסוק זה.",{icon:"ℹ️"}); return; }
  const box=ensureCmpBox(vi); box.innerHTML='<div class="cmp-loading">מנתח את ההקלטה ומיישר למקור…</div>';
  recGet(vi).then(rec=>{
    if(!rec){ box.remove(); return; }
    const Ctx=window.AudioContext||window.webkitAudioContext; const ctx=new Ctx();
    return rec.blob.arrayBuffer()
      .then(ab=>new Promise((res,rej)=>{ const p=ctx.decodeAudioData(ab,res,rej); if(p&&p.then)p.then(res,rej); }))
      .then(buf=>{ try{ctx.close();}catch(e){}
        setTimeout(()=>{
          const HOP=ORIG_ENV.hop||0.04;
          const userF=computeUserFrames(buf);
          const origF={fe:oe.fe, fp:oe.fp, fv:oe.fv, hop:HOP};
          let scores=null, overall=null;
          if(userF){
            const path=dtwPath(userF, origF);
            scores=wordScores(path, userF, origF, oe.words, HOP);
            const valid=scores.filter(s=>s.score!=null);
            overall=valid.length? Math.round(valid.reduce((a,s)=>a+s.score,0)/valid.length) : null;
            colorWords(vi, scores);
          }
          renderCompare(vi,{userDur:buf.duration, origDur:oe.dur, oe, userF, scores, overall});
        },20);
      });
  }).catch(()=>{ ensureCmpBox(vi).innerHTML='<div class="cmp-loading">לא ניתן לנתח את ההקלטה בדפדפן זה.</div>'; });
}
function renderCompare(vi,r){
  const box=ensureCmpBox(vi);
  const ratio=r.userDur/r.origDur;
  let tempo,tclass;
  if(ratio<=1.15 && ratio>=0.87){ tempo="קצב טוב 👍"; tclass="good"; }
  else if(ratio<0.87){ tempo="מהר מדי — כדאי להאט"; tclass="warn"; }
  else { tempo="לאט מדי — אפשר לזרז"; tclass="warn"; }

  let overallRow="", pitchCanvas="";
  const canPitch = r.overall!=null && r.oe.fp && r.userF && r.userF.fp;
  if(r.overall!=null){
    const oc=r.overall>=75?"good":(r.overall>=50?"":"warn");
    overallRow='<div class="cmp-row"><span>דיוק כולל:</span> <b class="'+oc+'">'+r.overall+'%</b></div>'+
      '<div class="cmp-row"><span class="cmp-sub">המילים צבועות על הפסוק: <b class="wg">ירוק</b>=מדויק · <b class="wo">צהוב</b>=כמעט · <b class="wb">אדום</b>=כדאי לתרגל</span></div>';
    if(canPitch) pitchCanvas='<div class="cmp-caption">קו המנגינה (אתה מול המקור):</div><canvas class="cmp-canvas pitch" height="110"></canvas>';
  } else {
    overallRow='<div class="cmp-row"><span class="cmp-sub">לא זוהתה מספיק שירה בהקלטה לניתוח פר-מילה. נסו להקליט קריאה בטעמים.</span></div>';
  }

  box.innerHTML =
    '<div class="cmp-head">🔍 השוואה למקור <span class="cmp-x" title="סגור">✕</span></div>'+
    '<div class="cmp-rows">'+
      '<div class="cmp-row"><span>קצב:</span> <b class="'+tclass+'">'+tempo+'</b> '+
        '<span class="cmp-sub">(אתה '+r.userDur.toFixed(1)+"ש׳ · מקור "+r.origDur.toFixed(1)+"ש׳)</span></div>"+
      overallRow+
    '</div>'+
    pitchCanvas+
    (canPitch?'<div class="cmp-legend"><span class="dot o"></span> המקור &nbsp;&nbsp; <span class="dot u"></span> אתה &nbsp;·&nbsp; זמן ⟸</div>':'');
  box.querySelector('.cmp-x').addEventListener('click',()=>{ box.remove(); clearWordColors(vi); });
  if(canPitch){
    const N=64;
    const op=resampleArr(r.oe.fp,N), ov=resampleArr(r.oe.fv,N).map(x=>x>=0.5?1:0);
    const up=resampleArr(r.userF.fp,N), uv=resampleArr(r.userF.fv,N).map(x=>x>=0.5?1:0);
    drawPitch(box.querySelector('canvas.pitch'), op, ov, up, uv);
  }
}

/* ---- phase 3: frame features, DTW alignment, per-word scoring ---- */
function computeUserFrames(buf){
  const m=toMono16k(buf), data=m.data, sr=m.sr;
  const WIN=1024, HOP=Math.round(sr*0.04), THRESH=0.15;
  const tauMin=Math.floor(sr/400), tauMax=Math.min(Math.floor(sr/80),WIN-1), NEED=WIN+tauMax;
  const fe=[], f0s=[], fv=[]; const d=new Float64Array(tauMax+1), dp=new Float64Array(tauMax+1);
  for(let s=0; s+NEED<=data.length; s+=HOP){
    let e=0; for(let j=0;j<WIN;j++){ const x=data[s+j]; e+=x*x; } fe.push(Math.sqrt(e/WIN));
    d[0]=0;
    for(let tau=1;tau<=tauMax;tau++){ let ss=0; for(let j=0;j<WIN;j++){ const df=data[s+j]-data[s+j+tau]; ss+=df*df; } d[tau]=ss; }
    dp[0]=1; let run=0;
    for(let tau=1;tau<=tauMax;tau++){ run+=d[tau]; dp[tau]=run>0? d[tau]*tau/run : 1; }
    let best=-1, tau=tauMin;
    while(tau<tauMax){ if(dp[tau]<THRESH){ while(tau+1<=tauMax && dp[tau+1]<dp[tau]) tau++; best=tau; break; } tau++; }
    if(best<0){ let mi=tauMin; for(let k=tauMin;k<=tauMax;k++) if(dp[k]<dp[mi]) mi=k; best=mi; }
    let shift=0; if(best>1&&best<tauMax){ const a=dp[best-1],b=dp[best],c=dp[best+1],den=a+c-2*b; shift=den?0.5*(a-c)/den:0; }
    const per=best+shift, f0=per>0? sr/per:0;
    f0s.push(f0); fv.push((dp[best]<THRESH && f0>=80 && f0<=400)?1:0);
  }
  if(!fe.length) return null;
  let mx=0; for(const x of fe) if(x>mx) mx=x; mx=mx||1; for(let i=0;i<fe.length;i++) fe[i]/=mx;
  const voiced=[]; for(let i=0;i<f0s.length;i++) if(fv[i]) voiced.push(f0s[i]);
  let fp=null;
  if(voiced.length>=5){ const med=medianOf(voiced)||1; fp=f0s.map((f,i)=> fv[i]? 12*Math.log2(f/med):NaN); interpNaN(fp); }
  return {fe, fp, fv, hop:0.04, dur:buf.duration};
}
function dtwPath(userF, origF){
  const n=userF.fe.length, m=origF.fe.length; const INF=1e18;
  const bt=new Uint8Array(n*m);
  let prev=new Float64Array(m+1).fill(INF); prev[0]=0;
  const cur=new Float64Array(m+1);
  for(let i=1;i<=n;i++){
    cur[0]=INF; const ue=userF.fe[i-1], uv=userF.fv[i-1];
    for(let j=1;j<=m;j++){
      const oe=origF.fe[j-1], ov=origF.fv[j-1];
      const c=2*Math.abs(ue-oe) + (uv!==ov?0.5:0);   // align on energy + voicing (melody-independent)
      let mn=prev[j-1], ch=2; if(prev[j]<mn){mn=prev[j];ch=0;} if(cur[j-1]<mn){mn=cur[j-1];ch=1;}
      cur[j]=c+mn; bt[(i-1)*m+(j-1)]=ch;
    }
    prev.set(cur);
  }
  let i=n,j=m; const path=[];
  while(i>0&&j>0){ path.push([i-1,j-1]); const ch=bt[(i-1)*m+(j-1)]; if(ch===2){i--;j--;} else if(ch===0){i--;} else {j--;} }
  path.reverse(); return path;
}
function wordScores(path, userF, origF, words, hop){
  const m=origF.fe.length; const o2u=Array.from({length:m},()=>[]);
  for(const pr of path){ o2u[pr[1]].push(pr[0]); }
  return words.map(function(w){
    let oj0=Math.max(0,Math.floor(w[0]/hop)), oj1=Math.min(m-1,Math.ceil(w[1]/hop)); if(oj1<oj0) oj1=oj0;
    let sum=0,cnt=0, eSum=0,eCnt=0;
    for(let oj=oj0;oj<=oj1;oj++){
      for(const ui of o2u[oj]){
        eSum+=userF.fe[ui]; eCnt++;
        if(origF.fp && userF.fp && origF.fv[oj] && userF.fv[ui]){ sum+=Math.abs(userF.fp[ui]-origF.fp[oj]); cnt++; }
      }
    }
    const avgE = eCnt? eSum/eCnt : 0;
    let score, dev=null;
    if(avgE<0.06){ score=0; }                                   // missed / silent
    else if(cnt>=2){ dev=sum/cnt; score=Math.max(0,Math.min(100, Math.round(100-(dev-1)*18))); }
    else { score=60; }                                          // unmeasurable melody -> neutral
    return {score, dev};
  });
}
function colorWords(vi, scores){
  clearWordColors(vi);
  const row=versesEl.querySelector('.verse[data-vi="'+vi+'"]'); if(!row) return;
  const spans=row.querySelectorAll(".text .w");
  scores.forEach(function(s,wi){ const sp=spans[wi]; if(!sp) return;
    sp.classList.add(s.score>=75?"wgood":(s.score>=50?"wok":"woff")); });
}
function clearWordColors(vi){
  const row=versesEl.querySelector('.verse[data-vi="'+vi+'"]'); if(!row) return;
  row.querySelectorAll(".text .w.wgood,.text .w.wok,.text .w.woff").forEach(e=>e.classList.remove("wgood","wok","woff"));
}
function drawEnvelopes(cv, orig, user){
  const dpr=window.devicePixelRatio||1;
  const w=cv.clientWidth||560, h=90;
  cv.width=w*dpr; cv.height=h*dpr; const g=cv.getContext('2d'); g.scale(dpr,dpr);
  g.clearRect(0,0,w,h);
  const pad=8, H=h-pad*2;
  // right-to-left time axis to match Hebrew reading direction
  function path(env){ const n=env.length; g.beginPath();
    for(let i=0;i<n;i++){ const x=w*(1-i/(n-1)); const y=pad+H*(1-env[i]); i?g.lineTo(x,y):g.moveTo(x,y);} }
  path(orig); g.lineTo(0,pad+H); g.lineTo(w,pad+H); g.closePath(); g.fillStyle='rgba(244,196,48,0.25)'; g.fill();
  path(orig); g.strokeStyle='rgba(244,196,48,0.95)'; g.lineWidth=2; g.stroke();
  path(user); g.strokeStyle='#5b8cff'; g.lineWidth=2; g.stroke();
}

/* ---- pitch (melody) analysis ---- */
function toMono16k(buf){
  const sr=buf.sampleRate, d=buf.getChannelData(0), target=16000;
  if(sr===target) return {data:d, sr:target};
  const n=Math.max(1,Math.round(d.length*target/sr)), out=new Float32Array(n);
  for(let i=0;i<n;i++){ const p=i*sr/target, lo=Math.floor(p), hi=Math.min(lo+1,d.length-1), f=p-lo; out[i]=d[lo]*(1-f)+d[hi]*f; }
  return {data:out, sr:target};
}
function medianOf(a){ const s=a.slice().sort((x,y)=>x-y); const n=s.length; return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0; }
function interpNaN(a){
  const n=a.length; let i=0;
  // leading
  while(i<n && isNaN(a[i])) i++;
  if(i===n) return;
  for(let k=0;k<i;k++) a[k]=a[i];
  let last=i;
  for(let j=i+1;j<n;j++){
    if(!isNaN(a[j])){
      if(j>last+1){ const step=(a[j]-a[last])/(j-last); for(let k=last+1;k<j;k++) a[k]=a[last]+step*(k-last); }
      last=j;
    }
  }
  for(let k=last+1;k<n;k++) a[k]=a[last]; // trailing
}
function yinContour(data, sr){
  const WIN=1024, HOP=320, THRESH=0.15;
  const tauMin=Math.floor(sr/400), tauMax=Math.min(Math.floor(sr/80),WIN-1), need=WIN+tauMax;
  const f0s=[], vs=[]; const d=new Float64Array(tauMax+1), dp=new Float64Array(tauMax+1);
  for(let start=0; start+need<=data.length; start+=HOP){
    d[0]=0;
    for(let tau=1;tau<=tauMax;tau++){ let s=0; for(let j=0;j<WIN;j++){ const df=data[start+j]-data[start+j+tau]; s+=df*df; } d[tau]=s; }
    dp[0]=1; let run=0;
    for(let tau=1;tau<=tauMax;tau++){ run+=d[tau]; dp[tau]=run>0? d[tau]*tau/run : 1; }
    let best=-1, tau=tauMin;
    while(tau<tauMax){ if(dp[tau]<THRESH){ while(tau+1<=tauMax && dp[tau+1]<dp[tau]) tau++; best=tau; break; } tau++; }
    if(best<0){ let mi=tauMin; for(let k=tauMin;k<=tauMax;k++) if(dp[k]<dp[mi]) mi=k; best=mi; }
    let shift=0;
    if(best>1 && best<tauMax){ const a=dp[best-1],b=dp[best],c=dp[best+1],den=a+c-2*b; shift=den?0.5*(a-c)/den:0; }
    const period=best+shift, f0=period>0? sr/period:0;
    f0s.push(f0); vs.push(dp[best]<THRESH && f0>=80 && f0<=400);
  }
  return {f0s, vs};
}
function pitchRel(data, sr, N){
  const {f0s, vs}=yinContour(data, sr);
  const voiced=[]; for(let i=0;i<f0s.length;i++) if(vs[i]) voiced.push(f0s[i]);
  if(voiced.length<5) return null;
  const med=medianOf(voiced)||1;
  const st=f0s.map((f,i)=> vs[i]? 12*Math.log2(f/med) : NaN);
  interpNaN(st);
  return { pitch:resampleArr(st,N), pvoiced:resampleArr(vs.map(v=>v?1:0),N).map(x=>x>=0.5?1:0) };
}
function melodyMatch(userP, userPv, origP, origPv){
  const a=[], b=[];
  for(let i=0;i<origP.length;i++){ if(origPv[i] && userPv[i]){ a.push(userP[i]); b.push(origP[i]); } }
  if(a.length<6) return null;
  return pearson(a,b);
}
function drawPitch(cv, orig, origPv, user, userPv){
  const dpr=window.devicePixelRatio||1, w=cv.clientWidth||560, h=110;
  cv.width=w*dpr; cv.height=h*dpr; const g=cv.getContext('2d'); g.scale(dpr,dpr);
  g.clearRect(0,0,w,h);
  const pad=8, H=h-pad*2, mid=pad+H/2, LIM=9; // ±9 semitones
  const y=s=>mid - Math.max(-LIM,Math.min(LIM,s))/LIM*(H/2);
  // zero line (median)
  g.strokeStyle=(getComputedStyle(document.documentElement).getPropertyValue('--grid').trim()||'rgba(128,128,128,.25)'); g.lineWidth=1; g.beginPath(); g.moveTo(0,mid); g.lineTo(w,mid); g.stroke();
  function line(vals,pv,color){
    g.strokeStyle=color; g.lineWidth=2.2; g.beginPath(); let pen=false;
    for(let i=0;i<vals.length;i++){
      const x=w*(1-i/(vals.length-1));
      if(pv[i]){ const yy=y(vals[i]); if(pen)g.lineTo(x,yy); else{ g.moveTo(x,yy); pen=true; } }
      else pen=false;
    }
    g.stroke();
  }
  line(orig,origPv,'rgba(244,196,48,0.95)');
  line(user,userPv,'#5b8cff');
}

function initRecordings(){
  const ok = ("indexedDB" in window) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  recKeys().then(keys=>{ keys.forEach(k=>recorded.add(k)); }).catch(()=>{}).then(()=>{
    VERSES.forEach((v,vi)=>renderRecBar(vi));
  });
  if(!ok){ /* still render bars; startUserRec will alert on failure */ }
}

/* ---------- reading levels + taamim (cantillation) ---------- */
function stripTaamim(s){ return s.replace(/[\u0591-\u05AF\u05BD]/g,""); }              // cantillation + meteg
function stripNikud(s){ return s.replace(/[\u05B0-\u05BC\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,""); }  // vowels + dagesh/dots
function stripSofPasuq(s){ return s.replace(/\u05C3/g,""); }                                 // sof-pasuq

// 1: regular font + nikud ; 2: STA"M + nikud ; 3: STA"M no-nikud ; 4: STA"M continuous (scroll)
const LEVELS = {
  1:{font:"regular", nikud:true,  sep:true,  name:"כתב רגיל · עם ניקוד",       icon:"📖"},
  2:{font:"stam",    nikud:true,  sep:true,  name:"כתב סת\"ם · עם ניקוד",       icon:"📜"},
  3:{font:"stam",    nikud:false, sep:true,  name:"כתב סת\"ם · בלי ניקוד",      icon:"📜"},
  4:{font:"stam",    nikud:false, sep:false, name:"רצף — כמו קלף התורה",        icon:"🕎"}
};
let level = parseInt(localStorage.getItem(K_LEVEL)||"1",10); if(!LEVELS[level]) level=1;
let taamimOn = (localStorage.getItem(K_TAAMIM)!=="0");   // default: taamim shown

function wordDisplay(full, lv){
  let s = full;
  if(!taamimOn)  s = stripTaamim(s);
  if(!lv.nikud)  s = stripNikud(s);
  if(!lv.sep)    s = stripSofPasuq(s);
  return s;
}
function applyDisplay(){
  const lv = LEVELS[level] || LEVELS[1];
  versesEl.setAttribute("data-level", String(level));
  versesEl.querySelectorAll(".verse").forEach(function(row){
    const vi=parseInt(row.dataset.vi,10);
    row.querySelectorAll(".text .w").forEach(function(sp){
      const wi=parseInt(sp.dataset.wi,10);
      sp.textContent = wordDisplay(VERSES[vi].words[wi].t, lv);
    });
  });
  const lg=document.getElementById("levelGroup");
  if(lg) [].forEach.call(lg.children, function(b){
    const n=parseInt(b.dataset.lvl,10);
    b.classList.toggle("on", n===level);
    if(LEVELS[n]) b.title = "רמה "+n+" · "+LEVELS[n].name;   // hover tooltip
  });
  const tb=document.getElementById("taamimToggle");
  if(tb) tb.textContent = taamimOn ? "טעמים: מוצגים" : "טעמים: מוסתרים";
  // nice title above the passage showing the current level
  const lt=document.getElementById("levelTitle");
  if(lt) lt.innerHTML = (lv.icon?lv.icon+" ":"")+'<b>רמה '+level+'</b> · '+lv.name;
  // hide the "click ▶ next to each verse" hint in level 4 (no per-verse buttons there)
  const hint=document.querySelector(".hint"); if(hint) hint.style.display = (level===4)?"none":"";
  // level 4 = reading/exam view: if leaving mid-record, stop; hide is via CSS
  if(level===4 && recordingVi!=null) stopUserRec();
  const l4=document.getElementById("level4bar");
  if(l4) l4.style.display=(level===4)?"flex":"none";
  if(level===4){ renderLevel4Bar(); }
  else { const l4r=document.getElementById("level4result"); if(l4r) l4r.style.display="none"; clearFullColors(); }
}
const levelGroupEl=document.getElementById("levelGroup");
if(levelGroupEl) levelGroupEl.addEventListener("click", function(e){
  const b=e.target.closest("button"); if(!b) return;
  level=parseInt(b.dataset.lvl,10); if(!LEVELS[level]) level=1;
  localStorage.setItem(K_LEVEL,String(level)); applyDisplay();
});
const taamimBtn=document.getElementById("taamimToggle");
if(taamimBtn) taamimBtn.addEventListener("click", function(){
  taamimOn=!taamimOn; localStorage.setItem(K_TAAMIM, taamimOn?"1":"0"); applyDisplay();
});
function levelName(){ return "רמה "+level; }

/* ---------- light / dark theme ---------- */
const themeBtn=document.getElementById("themeToggle");
function curTheme(){ return document.documentElement.getAttribute("data-theme")==="light" ? "light":"dark"; }
function applyThemeIcon(){
  if(themeBtn) themeBtn.textContent = curTheme()==="light" ? "☀️" : "🌙";
  const m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content", curTheme()==="light" ? "#f4efe1" : "#0f1020");
}
if(themeBtn) themeBtn.addEventListener("click", function(){
  const light = curTheme()!=="light";
  document.documentElement.setAttribute("data-theme", light?"light":"dark");
  localStorage.setItem(K_THEME, light?"light":"dark");
  applyThemeIcon();
});

/* ================= level 4: record & compare the WHOLE passage ================= */
let fullRec=false, fullMR=null, fullChunks=[], fullStream=null, fullTimer=null, fullT0=0;
let fullMine=null, fullMineUrl=null;

function buildFullRef(){
  const verses=ORIG_ENV.verses, hop=ORIG_ENV.hop;
  const fe=[], fp=[], fv=[], words=[]; let off=0, haveP=true;
  for(let vi=0; vi<verses.length; vi++){
    const v=verses[vi];
    for(let k=0;k<v.fe.length;k++){ fe.push(v.fe[k]); fp.push(v.fp?v.fp[k]:0); fv.push(v.fv?v.fv[k]:0); }
    if(!v.fp) haveP=false;
    for(let wi=0; wi<v.words.length; wi++){
      words.push({vi:vi, wi:wi, oj0:off+Math.max(0,Math.floor(v.words[wi][0]/hop)), oj1:off+Math.floor(v.words[wi][1]/hop)});
    }
    off+=v.fe.length;
  }
  return {fe:fe, fp:haveP?fp:null, fv:fv, hop:hop, words:words};
}
function renderLevel4Bar(){
  const bar=document.getElementById("level4bar"); if(!bar) return;
  if(fullRec){
    bar.innerHTML="";
    bar.appendChild(mkBtn("⏹ עצור הקלטה","rec-stop",function(){ stopFullRec(); }));
    const t=document.createElement("span"); t.className="rec-timer"; t.id="fulltimer"; t.textContent="● 0:00"; bar.appendChild(t);
    return;
  }
  recGet("full").then(function(rec){
    if(level!==4) return;
    bar.innerHTML="";
    // play the WHOLE passage continuously (level 4 = one long scroll reading)
    bar.appendChild(mkBtn("▶ נגן את כל הקטע","play-full-btn",function(){ playAll(); }));
    bar.appendChild(mkBtn(rec?"🎤 הקליטו שוב את כל הקטע":"🎤 הקליטו את כל הקטע","rec-btn",function(){ startFullRec(); }));
    if(rec){
      var minePlaying = fullMine && !fullMine.paused;
      bar.appendChild(mkBtn(minePlaying?"⏸ עצור השמעה":"▶ ההקלטה שלי","mine-btn",function(){ playFullMine(); }));
      bar.appendChild(mkBtn("📤 שלח בוואטסאפ","share-btn",function(){ shareFullRec(); }));
      bar.appendChild(mkBtn("🔍 השוואה למקור","cmp-btn",function(){ compareFull(); }));
      bar.appendChild(mkBtn("🗑 מחק","del-btn",function(){ deleteFullRec(); }));
    }
  });
}
function startFullRec(){
  stopAll(); if(fullMine) fullMine.pause(); clearFullColors();
  const l4r=document.getElementById("level4result"); if(l4r) l4r.style.display="none";
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    fullStream=stream; fullChunks=[];
    const mime=pickMime();
    try{ fullMR=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); }catch(e){ fullMR=new MediaRecorder(stream); }
    fullMR.ondataavailable=function(ev){ if(ev.data&&ev.data.size) fullChunks.push(ev.data); };
    fullMR.onstop=function(){
      const blob=new Blob(fullChunks,{type:(fullMR&&fullMR.mimeType)||"audio/webm"});
      if(fullStream) fullStream.getTracks().forEach(function(t){t.stop();});
      const done=function(){ fullRec=false; fullStream=null; fullMR=null; if(fullTimer){clearInterval(fullTimer);fullTimer=null;} renderLevel4Bar(); };
      if(blob.size>0) recPut("full",{blob:blob,mime:blob.type,createdAt:1}).then(done).catch(done); else done();
    };
    fullRec=true; fullMR.start(1000); fullT0=performance.now();
    fullTimer=setInterval(function(){ const el=document.getElementById("fulltimer"); if(el) el.textContent="● "+fmtDur((performance.now()-fullT0)/1000); },200);
    renderLevel4Bar();
  }).catch(function(){ uiAlert("לא ניתן לגשת למיקרופון. יש לאשר הרשאת מיקרופון ולנסות שוב.",{icon:"🎤",title:"נדרשת הרשאת מיקרופון"}); });
}
function stopFullRec(){ if(fullMR && fullMR.state!=="inactive") fullMR.stop(); }
function stopFullMine(){
  if(fullMine){ try{ fullMine.pause(); fullMine.currentTime=0; }catch(e){} }
}
function playFullMine(){
  stopAll();
  // toggle: if my recording is already playing, pressing again stops it
  if(fullMine && !fullMine.paused){ stopFullMine(); renderLevel4Bar(); return; }
  recGet("full").then(function(rec){ if(!rec) return;
    if(fullMine){ try{fullMine.pause();}catch(e){} if(fullMineUrl) URL.revokeObjectURL(fullMineUrl); }
    fullMineUrl=URL.createObjectURL(rec.blob); fullMine=new Audio(fullMineUrl); fullMine.playbackRate=speed;
    fullMine.onended=function(){ renderLevel4Bar(); };
    fullMine.onpause=function(){ renderLevel4Bar(); };
    fullMine.play().catch(function(){});
    renderLevel4Bar();
  });
}
function deleteFullRec(){
  uiConfirm("למחוק את ההקלטה של כל הקטע?",{icon:"🗑",okText:"מחק",cancelText:"ביטול",danger:true}).then(function(ok){
    if(!ok) return;
    stopFullMine();                                   // stop playback before removing it
    if(fullMineUrl){ URL.revokeObjectURL(fullMineUrl); fullMineUrl=null; } fullMine=null;
    recDel("full").then(function(){ clearFullColors(); const l4r=document.getElementById("level4result"); if(l4r) l4r.style.display="none"; renderLevel4Bar(); });
  });
}
// share the recording (WhatsApp etc.) via the native share sheet
function shareFullRec(){
  recGet("full").then(function(rec){ if(!rec) return;
    var mime=rec.mime||(rec.blob&&rec.blob.type)||"audio/webm";
    var ext=(mime.indexOf("mp4")>=0||mime.indexOf("m4a")>=0)?"m4a":(mime.indexOf("ogg")>=0?"ogg":"webm");
    var fname="הקלטה-"+((STUDENT&&STUDENT.name)||"תורה-אורי")+"."+ext;
    var file=null; try{ file=new File([rec.blob],fname,{type:mime}); }catch(e){}
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file], title:"תורה אורי", text:"ההקלטה שלי · תורה אורי"}).catch(function(){});
    } else {
      var a=document.createElement("a"); a.href=URL.createObjectURL(rec.blob); a.download=fname;
      document.body.appendChild(a); a.click(); a.remove();
      uiAlert("השיתוף הישיר לא נתמך במכשיר הזה — ההקלטה ירדה למכשיר ותוכלו לשלוח אותה ידנית בוואטסאפ.",{icon:"📤",title:"הורדת ההקלטה"});
    }
  });
}
function clearFullColors(){
  versesEl.querySelectorAll(".text .w.wgood,.text .w.wok,.text .w.woff").forEach(function(e){ e.classList.remove("wgood","wok","woff"); });
}
function colorFull(scores){
  clearFullColors();
  scores.forEach(function(s){
    const row=versesEl.querySelector('.verse[data-vi="'+s.vi+'"]'); if(!row) return;
    const sp=row.querySelectorAll(".text .w")[s.wi]; if(!sp) return;
    sp.classList.add(s.score>=75?"wgood":(s.score>=50?"wok":"woff"));
  });
}
function compareFull(){
  const l4r=document.getElementById("level4result"); if(!l4r) return;
  l4r.style.display="block"; l4r.innerHTML='<div class="cmp-loading">מנתח את ההקלטה ומיישר למקור… (עשוי לקחת כמה שניות)</div>';
  recGet("full").then(function(rec){
    if(!rec){ l4r.style.display="none"; return; }
    const Ctx=window.AudioContext||window.webkitAudioContext; const ctx=new Ctx();
    rec.blob.arrayBuffer().then(function(ab){ return new Promise(function(res,rej){ const p=ctx.decodeAudioData(ab,res,rej); if(p&&p.then)p.then(res,rej); }); })
      .then(function(buf){ try{ctx.close();}catch(e){}
        setTimeout(function(){
          const userF=computeUserFrames(buf);
          const ref=buildFullRef();
          if(!userF){ l4r.innerHTML='<div class="cmp-loading">לא הצלחתי לנתח את ההקלטה.</div>'; return; }
          const path=dtwPath(userF, ref);
          const o2u=[]; for(let j=0;j<ref.fe.length;j++) o2u.push([]);
          for(let i=0;i<path.length;i++){ o2u[path[i][1]].push(path[i][0]); }
          const scores=ref.words.map(function(w){
            let sum=0,cnt=0,eSum=0,eCnt=0;
            for(let oj=w.oj0;oj<=w.oj1 && oj<ref.fe.length;oj++){
              const us=o2u[oj];
              for(let z=0;z<us.length;z++){ const ui=us[z]; eSum+=userF.fe[ui]; eCnt++;
                if(ref.fp && userF.fp && ref.fv[oj] && userF.fv[ui]){ sum+=Math.abs(userF.fp[ui]-ref.fp[oj]); cnt++; } }
            }
            const avgE=eCnt?eSum/eCnt:0; let sc;
            if(avgE<0.06) sc=0; else if(cnt>=2){ const dev=sum/cnt; sc=Math.max(0,Math.min(100,Math.round(100-(dev-1)*18))); } else sc=60;
            return {vi:w.vi, wi:w.wi, score:sc};
          });
          colorFull(scores);
          const overall=Math.round(scores.reduce(function(a,s){return a+s.score;},0)/scores.length);
          const oc=overall>=75?"good":(overall>=50?"":"warn");
          l4r.innerHTML='<div class="cmp-head">🔍 השוואת כל הקטע <span class="cmp-x" title="סגור">✕</span></div>'+
            '<div class="cmp-rows"><div class="cmp-row"><span>דיוק כולל:</span> <b class="'+oc+'">'+overall+'%</b></div>'+
            '<div class="cmp-row"><span class="cmp-sub">המילים צבועות על הקטע: <b class="wg">ירוק</b>=מדויק · <b class="wo">צהוב</b>=כמעט · <b class="wb">אדום</b>=לתרגל</span></div></div>';
          l4r.querySelector(".cmp-x").addEventListener("click",function(){ l4r.style.display="none"; clearFullColors(); });
        },30);
      }).catch(function(){ l4r.innerHTML='<div class="cmp-loading">לא ניתן לנתח את ההקלטה בדפדפן זה.</div>'; });
  });
}

/* ---------- init ---------- */
initStudent();
buildVerses();
applyDisplay();
applyThemeIcon();
initRecordings();

/* dismiss splash once the app is ready */
(function(){
  const splash=document.getElementById("splash");
  if(!splash) return;
  setTimeout(function(){ splash.classList.add("hide");
    setTimeout(function(){ if(splash.parentNode) splash.remove(); }, 600); }, 950);
})();
updateWarn();
refreshEditor();
audio.addEventListener("pause", ()=>{ /* keep */ });
})();
