(function(){
"use strict";
const VERSES = window.VERSES || [];
const DEFAULT_TIMINGS = window.TIMINGS || null;   // {verses:[{start,end,words:[{s,e}]}]}
const LS_KEY = "ori_timings_v1";

const audio = document.getElementById("audioFull");
const audio2 = document.getElementById("audioFirst2");
let speed = 1;

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
      s.addEventListener("click", ()=> playVerse(vi, wi));
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
  audio2.pause();
  audio.playbackRate = speed;
  audio.play();
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

function playVerse(vi, fromWord){
  const t = timingFor(vi);
  if(!t){ flashNoTiming(vi); return; }
  audio2.pause();
  if(raf) cancelAnimationFrame(raf);
  clearHL();
  active = vi; playingAll = false;
  const startT = (fromWord!=null && t.words[fromWord]) ? t.words[fromWord].s : t.start;
  stopAt = t.end + 0.04;
  const row = versesEl.querySelector('.verse[data-vi="'+vi+'"]');
  if(row){ row.classList.add("active"); row.scrollIntoView({behavior:"smooth",block:"center"}); }
  npNum.textContent = VERSES[vi].ref; nowbar.classList.add("show");
  audio.playbackRate = speed;
  audio.currentTime = startT;
  audio.play();
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
  audio2.pause(); playingAll=true; allIdx=first; startAllVerse(first);
}
function firstWithTiming(){ for(let i=0;i<VERSES.length;i++) if(timingFor(i)) return i; return -1; }
function startAllVerse(vi){
  const t=timingFor(vi);
  if(!t){ nextInAll(); return; }
  if(raf) cancelAnimationFrame(raf);
  clearHL();
  active=vi; stopAt=t.end+0.04;
  const row=versesEl.querySelector('.verse[data-vi="'+vi+'"]');
  if(row){ row.classList.add("active"); row.scrollIntoView({behavior:"smooth",block:"center"}); }
  npNum.textContent=VERSES[vi].ref; nowbar.classList.add("show");
  audio.playbackRate=speed; audio.currentTime=t.start; audio.play(); tick();
  refreshTransport();
}
function nextInAll(){
  let n=allIdx+1;
  while(n<VERSES.length && !timingFor(n)) n++;
  if(n>=VERSES.length){ stopAll(); return; }
  allIdx=n; startAllVerse(n);
}

/* ---------- short (first 2 verses) recording ---------- */
const playFirst2Btn=document.getElementById("playFirst2");
playFirst2Btn.addEventListener("click", ()=>{
  if(!audio2.paused){ audio2.pause(); audio2.currentTime=0; playFirst2Btn.classList.remove("on"); return; }
  stopAll(); audio2.playbackRate=speed; audio2.currentTime=0; audio2.play();
  playFirst2Btn.classList.add("on");
});
audio2.addEventListener("ended", ()=>playFirst2Btn.classList.remove("on"));

/* ---------- controls ---------- */
document.getElementById("playAll").addEventListener("click", playAll);
document.getElementById("speedGroup").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  speed=parseFloat(b.dataset.sp);
  [...e.currentTarget.children].forEach(c=>c.classList.toggle("on",c===b));
  audio.playbackRate=speed; audio2.playbackRate=speed;
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
  if(isNaN(s)||isNaN(e)||e<=s){ alert("הזינו זמן התחלה וסיום תקינים (סיום גדול מהתחלה)."); return; }
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
  audio2.pause(); audio.playbackRate = 1; audio.currentTime=from; audio.play();
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
    alert("נטען בהצלחה ✓");
  }catch(err){ alert("JSON לא תקין."); }
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

/* ================= USER RECORDINGS (record your own reading) ================= */
const DB_NAME="toraOr", STORE="recordings";
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
function clearCmp(vi){ const b=versesEl.querySelector('.verse[data-vi="'+vi+'"] .cmp-result'); if(b) b.remove(); }

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
      recordingVi=vi; mediaRec.start(); recStart=performance.now(); startRecTimer(vi); renderRecBar(vi);
    }).catch(err=>{
      alert("לא ניתן לגשת למיקרופון. יש לאשר הרשאת מיקרופון בדפדפן ולנסות שוב.");
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
  if(!confirm("למחוק את ההקלטה שלך לפסוק "+VERSES[vi].ref+"?")) return;
  recDel(vi).then(()=>{ recorded.delete(vi); clearCmp(vi); renderRecBar(vi); });
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
  if(!oe){ alert("אין נתוני מקור לפסוק זה."); return; }
  const box=ensureCmpBox(vi); box.innerHTML='<div class="cmp-loading">מנתח את ההקלטה…</div>';
  recGet(vi).then(rec=>{
    if(!rec){ box.remove(); return; }
    const Ctx=window.AudioContext||window.webkitAudioContext;
    const ctx=new Ctx();
    return rec.blob.arrayBuffer()
      .then(ab=>new Promise((res,rej)=>{ const p=ctx.decodeAudioData(ab,res,rej); if(p&&p.then)p.then(res,rej); }))
      .then(buf=>{
        const N=(ORIG_ENV.points||64);
        const userEnv=resampleArr(normArr(rmsEnvelope(buf)),N);
        const corr=pearson(userEnv,oe.env);
        renderCompare(vi,{corr, userDur:buf.duration, origDur:oe.dur, userEnv, origEnv:oe.env});
        try{ctx.close();}catch(e){}
      });
  }).catch(()=>{ box.innerHTML='<div class="cmp-loading">לא ניתן לנתח את ההקלטה בדפדפן זה.</div>'; });
}
function renderCompare(vi,r){
  const box=ensureCmpBox(vi);
  const rhythm=Math.max(0,Math.round(r.corr*100));
  const ratio=r.userDur/r.origDur;
  let tempo,tclass;
  if(ratio<=1.15 && ratio>=0.87){ tempo="קצב טוב 👍"; tclass="good"; }
  else if(ratio<0.87){ tempo="מהר מדי — כדאי להאט"; tclass="warn"; }
  else { tempo="לאט מדי — אפשר לזרז"; tclass="warn"; }
  const rlabel = rhythm>=65?"דומה מאוד למקור":rhythm>=40?"דומה חלקית":"שונה מהמקור";
  box.innerHTML =
    '<div class="cmp-head">🔍 השוואה למקור <span class="cmp-x" title="סגור">✕</span></div>'+
    '<div class="cmp-rows">'+
      '<div class="cmp-row"><span>קצב:</span> <b class="'+tclass+'">'+tempo+'</b> '+
        '<span class="cmp-sub">(אתה '+r.userDur.toFixed(1)+"ש׳ · מקור "+r.origDur.toFixed(1)+"ש׳)</span></div>"+
      '<div class="cmp-row"><span>התאמת מקצב:</span> <b>'+rhythm+'%</b> <span class="cmp-sub">'+rlabel+'</span></div>'+
    '</div>'+
    '<canvas class="cmp-canvas" height="90"></canvas>'+
    '<div class="cmp-legend"><span class="dot o"></span> המקור &nbsp;&nbsp; <span class="dot u"></span> אתה &nbsp;·&nbsp; זמן ⟸</div>';
  box.querySelector('.cmp-x').addEventListener('click',()=>box.remove());
  drawEnvelopes(box.querySelector('canvas'), r.origEnv, r.userEnv);
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

function initRecordings(){
  const ok = ("indexedDB" in window) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  recKeys().then(keys=>{ keys.forEach(k=>recorded.add(k)); }).catch(()=>{}).then(()=>{
    VERSES.forEach((v,vi)=>renderRecBar(vi));
  });
  if(!ok){ /* still render bars; startUserRec will alert on failure */ }
}

/* ---------- init ---------- */
buildVerses();
initRecordings();
updateWarn();
refreshEditor();
audio.addEventListener("pause", ()=>{ /* keep */ });
})();
