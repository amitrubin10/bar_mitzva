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
    row.appendChild(play); row.appendChild(num); row.appendChild(text);
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

/* ---------- init ---------- */
buildVerses();
updateWarn();
refreshEditor();
audio.addEventListener("pause", ()=>{ /* keep */ });
})();
