/* UI layer. Depends on data.js + engine.js (window.WO). */
'use strict';
const W = window.WO;
let st = null;                 // persisted app state
const UI = {tab:'today', plan:null, tier:null, eqId:null, logSeg:'history', editId:null, statsEx:null, storage:'…', persisted:null};
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const M = () => W.exMap(st);
const U = () => st.settings.units;

/* ================= storage ================= */
const IDB = {
  db:null,
  open(){ return new Promise((res,rej)=>{ if(!('indexedDB' in window)) return rej(new Error('no idb'));
    const r=indexedDB.open('workout-pwa',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv');
    r.onsuccess=()=>{ this.db=r.result; res(); }; r.onerror=()=>rej(r.error); }); },
  get(k){ return new Promise((res,rej)=>{ const t=this.db.transaction('kv').objectStore('kv').get(k); t.onsuccess=()=>res(t.result); t.onerror=()=>rej(t.error); }); },
  set(k,v){ return new Promise((res,rej)=>{ const tx=this.db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
};
async function loadState(){
  let raw=null;
  try{ await IDB.open(); raw=await IDB.get('state'); UI.storage='IndexedDB'; }catch(e){ UI.storage='localStorage (IndexedDB unavailable)'; }
  if(!raw){ try{ raw=localStorage.getItem('wo_state'); }catch(e){} }
  try{ st=W.migrate(raw?JSON.parse(raw):null); }catch(e){ st=W.defaultState(); }
}
let saveTimer=null;
function save(){ clearTimeout(saveTimer); saveTimer=setTimeout(persistNow,200); }
async function persistNow(){
  clearTimeout(saveTimer); const json=JSON.stringify(st);
  if(IDB.db){ try{ await IDB.set('state',json); return; }catch(e){ UI.storage='localStorage (IndexedDB write failed)'; } }
  try{ localStorage.setItem('wo_state',json); }catch(e){ toast('Could not save — storage full? Export a backup.'); }
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') persistNow(); });
window.addEventListener('pagehide',persistNow);

/* ================= helpers ================= */
function toast(msg,ms=2200){ const t=$('#toast'); t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none',ms); }
function openSheet(html){ $('#sheetp').innerHTML='<div class="grab"></div>'+html; $('#sheet').classList.add('show'); }
function closeSheet(){ $('#sheet').classList.remove('show'); $('#sheetp').innerHTML=''; }
$('#sheet').addEventListener('click',e=>{ if(e.target.id==='sheet') closeSheet(); });
const num = v => { if(v===''||v==null) return ''; const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?'':n; };
const today = () => W.ymd();
function fmtDate(d){ const x=W.parseYmd(d); return W.DOW[x.getDay()]+' '+x.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][x.getMonth()]; }
function exName(id){ return W.exName(M(),id); }
function curW(){ if(UI.editId) return st.workouts.find(w=>w.id===UI.editId); return st.active; }
function beep(){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C) return; const c=beep.c||(beep.c=new C()); [0,0.25,0.5].forEach(t=>{ const o=c.createOscillator(), g=c.createGain(); o.frequency.value=880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25,c.currentTime+t); g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+t+0.2); o.start(c.currentTime+t); o.stop(c.currentTime+t+0.22); }); }catch(e){} }
function buzz(ms){ try{ navigator.vibrate&&navigator.vibrate(ms); }catch(e){} }

/* ================= charts (hand-rolled SVG) ================= */
function lineChart(series, o={}){
  const Wd=360, H=o.h||170, L=40, R=8, T=10, B=24;
  const pts=series.flatMap(s=>s.pts); if(pts.length<1) return '<p class="mono mu small">No data yet.</p>';
  const xs=pts.map(p=>W.parseYmd(p.x).getTime()); let x0=Math.min(...xs), x1=Math.max(...xs); if(x0===x1){x0-=864e5*3;x1+=864e5*3;}
  const ys=pts.map(p=>p.y).concat((o.ref||[]).map(r=>r.y)); let y0=Math.min(...ys), y1=Math.max(...ys); const pad=(y1-y0)*0.12||Math.abs(y1)*0.05||1; y0-=pad; y1+=pad;
  if(o.zero) y0=Math.min(0,y0);
  const X=t=>L+(t-x0)/(x1-x0)*(Wd-L-R), Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  let g=`<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img">`;
  for(let i=0;i<=3;i++){ const v=y0+(y1-y0)*i/3; g+=`<line x1="${L}" x2="${Wd-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1d2734"/><text x="${L-4}" y="${Y(v)+4}" text-anchor="end">${o.yFmt?o.yFmt(v):Math.round(v)}</text>`; }
  const fd=t=>{ const d=new Date(t); return (d.getMonth()+1)+'/'+d.getDate(); };
  g+=`<text x="${L}" y="${H-6}">${fd(x0)}</text><text x="${Wd-R}" y="${H-6}" text-anchor="end">${fd(x1)}</text>`;
  for(const r of (o.ref||[])) g+=`<line x1="${L}" x2="${Wd-R}" y1="${Y(r.y)}" y2="${Y(r.y)}" stroke="${r.c||'#555'}" stroke-dasharray="4 4"/><text x="${Wd-R-2}" y="${Y(r.y)-3}" text-anchor="end" style="fill:${r.c||'#888'}">${esc(r.label)}</text>`;
  for(const s of series){ if(!s.pts.length) continue; const P=s.pts.map(p=>[X(W.parseYmd(p.x).getTime()),Y(p.y)]);
    g+=`<polyline fill="none" stroke="${s.c}" stroke-width="${s.w||2.2}" ${s.dash?'stroke-dasharray="5 4"':''} points="${P.map(p=>p.join(',')).join(' ')}"/>`;
    if(!s.noDots) g+=P.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.8" fill="${s.c}"/>`).join(''); }
  g+='</svg>';
  if(series.length>1) g+='<div class="row wrap tiny mono">'+series.map(s=>`<span style="color:${s.c}">■ ${esc(s.name)}</span>`).join(' &nbsp; ')+'</div>';
  return g;
}
function barChart(labels, vals, o={}){
  const Wd=360,H=o.h||140,L=30,B=22,T=10; const mx=Math.max(o.max||0,...vals,1); const bw=(Wd-L-6)/vals.length;
  let g=`<svg class="chart" viewBox="0 0 ${Wd} ${H}">`;
  for(const r of (o.ref||[])){ const y=T+(1-r.y/mx)*(H-T-B); g+=`<line x1="${L}" x2="${Wd}" y1="${y}" y2="${y}" stroke="${r.c}" stroke-dasharray="4 4"/><text x="${Wd-2}" y="${y-3}" text-anchor="end" style="fill:${r.c}">${esc(r.label)}</text>`; }
  vals.forEach((v,i)=>{ const h=(v/mx)*(H-T-B); const x=L+i*bw+3; g+=`<rect x="${x}" y="${H-B-h}" width="${bw-6}" height="${h}" rx="3" fill="${i===vals.length-1?'#F2A900':'#8a6a12'}"/>`+(v?`<text x="${x+(bw-6)/2}" y="${H-B-h-3}" text-anchor="middle">${Math.round(v*10)/10}</text>`:'')+`<text x="${x+(bw-6)/2}" y="${H-6}" text-anchor="middle">${esc(labels[i])}</text>`; });
  return g+'</svg>';
}

/* ================= rendering ================= */
const TITLES={today:'Today',log:'Log',stats:'Stats',goals:'Goals',settings:'Settings'};
function render(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===UI.tab));
  $('#title').textContent = UI.editId? 'Edit workout' : (UI.tab==='today'&&st.active? 'In progress' : TITLES[UI.tab]);
  $('#hdrsub').textContent = UI.tab==='today'&&st.active? '' : fmtDate(today());
  const v=$('#view');
  v.innerHTML = UI.editId? viewEdit() : ({today:viewToday,log:viewLog,stats:viewStats,goals:viewGoals,settings:viewSettings}[UI.tab])();
  tickElapsed();
}
/* ---------- TODAY ---------- */
function goalChips(){
  const g=st.goals.filter(x=>x.active!==false);
  if(!g.length) return `<div class="banner" data-a="tab" data-v="goals">No goals yet — tap to add (e.g. Navy PRT + Strength + BP). Until then the generator uses a strength + cardio default.</div>`;
  return '<div class="chips" data-a="tab" data-v="goals">'+g.map(x=>`<span class="pill am" style="font-size:14px">${esc(x.name||WO_GT(x.type))} ×${x.priority||3}</span>`).join('')+'</div>';
}
function WO_GT(t){ return (GOAL_TYPES[t]||{label:t}).label; }
function viewToday(){
  if(st.active) return viewActive();
  if(UI.plan) return viewPlan();
  const tier=UI.tier||st.settings.defaultTier, eqId=UI.eqId||st.settings.defaultEq;
  const wc=W.weekCounters(st,today()); const fr=W.frequency(st,8,today());
  let h='';
  if(st.demo) h+=`<div class="banner">Demo data loaded. Settings → Data → Erase all data to start clean.</div>`;
  const lb=st.settings.lastBackup; const nW=W.finished(st).length;
  if(nW>=3 && (!lb || W.daysBetween(lb.slice(0,10),today())>14)) h+=`<div class="banner" data-a="backup">Last backup: ${lb?lb.slice(0,10):'never'}. Tap to save a backup file (protects against Safari clearing data).</div>`;
  h+=goalChips();
  h+=`<label class="lb">Workout length</label><div class="chips">`+[15,30,45,60,90].map(t=>`<button class="chip ${t==tier?'on':''}" data-a="tier" data-v="${t}">${t} min</button>`).join('')+'</div>';
  h+=`<label class="lb">Equipment</label><div class="chips">`+st.equipmentSets.map(e=>`<button class="chip ${e.id===eqId?'on':''}" data-a="eq" data-v="${e.id}">${esc(e.name)}</button>`).join('')+'</div>';
  h+=`<button class="btn-am btn-big" data-a="generate">Generate workout</button>`;
  h+=`<div class="row"><button class="grow btn-sm" data-a="startEmpty">Empty workout</button><button class="grow btn-sm" data-a="quickBP">+ BP</button><button class="grow btn-sm" data-a="quickBody">+ Weight</button></div>`;
  h+=`<h2>This week</h2><div class="kpis"><div class="kpi"><b>${wc.sessions}</b><span>Workouts</span></div><div class="kpi"><b>${fr.weekStreak}</b><span>Week streak</span></div>`;
  if(st.goals.some(g=>g.active!==false&&(g.type==='bp'||g.type==='endurance'))) h+=`<div class="kpi"><b>${Math.round(wc.aerobicMin)}<small class="mu" style="font-size:16px"> / 150</small></b><span>Aerobic min</span></div>`;
  if(st.goals.some(g=>g.active!==false&&g.type==='bp')) h+=`<div class="kpi"><b>${wc.isoSessions}<small class="mu" style="font-size:16px"> / 3</small></b><span>Isometric sessions</span></div>`;
  const pg=st.goals.find(g=>g.active!==false&&g.type==='prt'&&g.testDate);
  if(pg){ const d=W.daysBetween(today(),pg.testDate); h+=`<div class="kpi"><b>${d}</b><span>Days to PRT</span></div>`; }
  const bs=W.bpSummary(st,today()); if(bs.d7) h+=`<div class="kpi"><b>${bs.d7.sys}/${bs.d7.dia}</b><span>BP 7-day avg</span></div>`;
  h+='</div>';
  const last=W.finished(st).slice(-1)[0];
  if(last) h+=`<h2>Last workout</h2><div class="card" data-a="openW" data-v="${last.id}"><h3>${fmtDate(last.date)} · ${esc(last.eqName||'')}</h3><div class="mono mu small">${last.items.map(i=>esc(exName(i.exId))).join(' · ')}</div></div>`;
  return h;
}
function rxText(it){
  const ex=M()[it.exId]; const u=ex&&ex.ru==='m'?'m':'reps';
  if(it.kind==='cardio') return esc(it.presc.text||'');
  if(it.kind==='flow') return it.drills.map(d=>esc(exName(d.exId))+' '+W.fmtSec(d.sec)).join(' · ');
  const p=it.presc, n=it.sets.length;
  if(it.kind==='hold') return `${n} × ${W.fmtSec(p.sec)}${it.rest?` · rest ${it.rest}s`:''}`;
  const rr = p.lo===p.hi? p.lo : `${p.lo}–${p.hi}`;
  if(it.kind==='bw') return `${n} × ${rr} ${u}${it.rest?` · rest ${it.rest}s`:''}`;
  return `${n} × ${rr} ${u} @ ${p.w?p.w+' '+U():'pick weight'}${it.rest?` · rest ${it.rest}s`:''}`;
}
function viewPlan(){
  const p=UI.plan; let h=`<div class="card"><div class="row"><div class="grow"><h3>${p.tier} min · ${esc(p.eqName)}</h3><div class="mono mu small">Est. ${p.estMin} min incl. ${p.warmMin} min warm-up</div><div class="mono mu tiny">${esc(p.split)}</div></div></div>`;
  h+=p.notes.map(n=>`<div class="why">${esc(n)}</div>`).join('')+'</div>';
  h+=`<div class="card"><h3>Warm-up · ${p.warmMin} min</h3><div class="mono mu small">Easy cardio 2–3 min, then leg swings, arm circles, hip openers; 1–2 lighter ramp-up sets before heavy lifts.</div></div>`;
  p.items.forEach((it,i)=>{ h+=`<div class="card"><div class="row"><div class="grow"><h3>${esc(exName(it.exId))}</h3><div class="rx">${rxText(it)}</div></div><span class="pill">${it.estMin}m</span></div><div class="why">${esc(it.presc.why||'')}</div>
    <div class="row" style="margin-top:8px">${it.kind!=='flow'?`<button class="btn-sm grow" data-a="swap" data-i="${i}">Swap</button>`:''}<button class="btn-sm grow btn-ghost" data-a="planRemove" data-i="${i}">Remove</button></div></div>`; });
  h+=`<button class="btn-am btn-big" data-a="start">Start workout</button><div class="row"><button class="grow" data-a="generate">Regenerate</button><button class="grow btn-ghost" data-a="addEx">+ Exercise</button><button class="grow btn-ghost" data-a="planCancel">Cancel</button></div>`;
  return h;
}
function setRows(it,i,live){
  const ex=M()[it.exId]; const k=it.kind;
  let h='';
  if(k==='w') h+=`<div class="colhd"><span>#</span><span>${U()}</span><span>${ex&&ex.ru==='m'?'meters':'reps'}</span><span>RPE</span><span></span></div>`;
  if(k==='bw') h+=`<div class="colhd bw"><span>#</span><span>reps</span><span>RPE</span><span></span></div>`;
  if(k==='hold') h+=`<div class="colhd hold"><span>#</span><span>seconds</span><span>timer</span><span></span></div>`;
  it.sets.forEach((s,j)=>{
    const cls=k==='w'?'':k; const d=s.done?'done':'';
    if(k==='w') h+=`<div class="set ${d}"><span class="n">${j+1}</span><input inputmode="decimal" data-c="set" data-i="${i}" data-s="${j}" data-f="w" value="${s.w??''}" aria-label="weight"><input inputmode="numeric" data-c="set" data-i="${i}" data-s="${j}" data-f="reps" value="${s.reps??''}" aria-label="reps"><input inputmode="decimal" data-c="set" data-i="${i}" data-s="${j}" data-f="rpe" value="${s.rpe??''}" placeholder="–" aria-label="RPE"><button class="tick" data-a="tick" data-i="${i}" data-s="${j}">✓</button></div>`;
    else if(k==='bw') h+=`<div class="set bw ${d}"><span class="n">${j+1}</span><input inputmode="numeric" data-c="set" data-i="${i}" data-s="${j}" data-f="reps" value="${s.reps??''}"><input inputmode="decimal" data-c="set" data-i="${i}" data-s="${j}" data-f="rpe" value="${s.rpe??''}" placeholder="–"><button class="tick" data-a="tick" data-i="${i}" data-s="${j}">✓</button></div>`;
    else h+=`<div class="set hold ${d}"><span class="n">${j+1}</span><input inputmode="numeric" data-c="set" data-i="${i}" data-s="${j}" data-f="sec" value="${s.sec??''}"><button class="tick btn-sm" data-a="holdStart" data-i="${i}" data-s="${j}">▶</button><button class="tick" data-a="tick" data-i="${i}" data-s="${j}">✓</button></div>`;
  });
  h+=`<div class="row" style="margin-top:6px"><button class="btn-sm grow btn-ghost" data-a="addSet" data-i="${i}">+ Set</button><button class="btn-sm grow btn-ghost" data-a="delSet" data-i="${i}">− Set</button>${live?`<button class="btn-sm grow btn-ghost" data-a="itemMenu" data-i="${i}">⋯</button>`:`<button class="btn-sm grow btn-ghost btn-bad" data-a="itemDel" data-i="${i}">Remove</button>`}</div>`;
  return h;
}
function itemCard(it,i,live){
  const done=W.itemDone(it);
  let h=`<div class="card ${done?'done':''}" id="it${i}"><div class="row"><div class="grow"><h3>${esc(exName(it.exId))}</h3><div class="rx">${rxText(it)}</div></div>${done?'<span class="am" style="font-size:24px">✓</span>':''}</div>`;
  if(it.presc&&it.presc.why) h+=`<div class="why">${esc(it.presc.why)}</div>`;
  if(it.kind==='cardio'){ const c=it.cardio;
    h+=`<div class="row" style="margin-top:8px"><div class="grow"><label class="lb">Minutes</label><input inputmode="decimal" data-c="cardio" data-i="${i}" data-f="min" value="${c.min??''}"></div><div class="grow"><label class="lb">Distance</label><input inputmode="decimal" data-c="cardio" data-i="${i}" data-f="dist" value="${c.dist??''}"></div><div style="width:84px"><label class="lb">Unit</label><select data-c="cardio" data-i="${i}" data-f="unit">${['mi','km','m','yd'].map(u=>`<option ${c.unit===u?'selected':''}>${u}</option>`).join('')}</select></div><div style="width:64px"><label class="lb">RPE</label><input inputmode="decimal" data-c="cardio" data-i="${i}" data-f="rpe" value="${c.rpe??''}"></div></div>
    <div class="row" style="margin-top:10px"><label class="row grow small"><input type="checkbox" data-c="cardio" data-i="${i}" data-f="asRx" ${c.asRx!==false?'checked':''}> Completed as prescribed</label></div>
    <div class="row" style="margin-top:8px"><button class="grow ${c.done?'btn-am':''}" data-a="cardioDone" data-i="${i}">${c.done?'✓ Logged':'Log cardio'}</button>${live?`<button class="btn-sm btn-ghost" data-a="itemMenu" data-i="${i}">⋯</button>`:`<button class="btn-sm btn-ghost btn-bad" data-a="itemDel" data-i="${i}">Remove</button>`}</div>`;
  } else if(it.kind==='flow'){
    h+=it.drills.map(d=>`<div class="drill"><span>${esc(exName(d.exId))}</span><span class="am">${W.fmtSec(d.sec)}</span></div>`).join('');
    h+=`<div class="row" style="margin-top:8px"><button class="grow ${it.done?'btn-am':''}" data-a="flowDone" data-i="${i}">${it.done?'✓ Done':'Mark done'}</button>${live?`<button class="btn-sm btn-ghost" data-a="itemMenu" data-i="${i}">⋯</button>`:`<button class="btn-sm btn-ghost btn-bad" data-a="itemDel" data-i="${i}">Remove</button>`}</div>`;
  } else h+=setRows(it,i,live);
  return h+'</div>';
}
function viewActive(){
  const w=st.active; let h=`<div class="card"><div class="row"><div class="grow"><h3>${w.tier?w.tier+' min · ':''}${esc(w.eqName||'')}</h3><div class="mono am" style="font-size:22px" id="elapsed"></div></div><button class="btn-am" data-a="finish">Finish</button></div></div>`;
  w.items.forEach((it,i)=>h+=itemCard(it,i,true));
  h+=`<div class="row"><button class="grow" data-a="addEx">+ Exercise</button></div>
  <label class="lb">Notes</label><textarea data-c="wnote">${esc(w.note||'')}</textarea>
  <button class="btn-am btn-big" data-a="finish">Finish workout</button><button class="btn-ghost btn-bad" style="width:100%" data-a="discard">Discard workout</button>`;
  return h;
}
function viewEdit(){
  const w=curW(); if(!w){ UI.editId=null; return viewLog(); }
  let h=`<div class="row"><button class="btn-sm" data-a="editBack">‹ Back</button><div class="grow"></div><button class="btn-sm btn-bad" data-a="delW">Delete</button></div>
  <div class="card"><label class="lb">Date</label><input type="date" data-c="wdate" value="${w.date}"><div class="mono mu small" style="margin-top:6px">${esc(w.eqName||'')} · ${esc(w.goals||'')}</div></div>`;
  w.items.forEach((it,i)=>h+=itemCard(it,i,false));
  h+=`<button style="width:100%" data-a="addEx">+ Exercise</button><label class="lb">Notes</label><textarea data-c="wnote">${esc(w.note||'')}</textarea>`;
  return h;
}
function tickElapsed(){ const el=$('#elapsed'); if(!el||!st.active||!st.active.startedAt) return; const s=(Date.now()-new Date(st.active.startedAt))/1000; el.textContent=W.fmtSec(s)+' elapsed'; }
setInterval(tickElapsed,1000);

/* ---------- LOG ---------- */
function viewLog(){
  let h=`<div class="seg">`+[['history','History'],['bp','BP'],['body','Weight'],['prt','PRT']].map(([k,l])=>`<button class="${UI.logSeg===k?'on':''}" data-a="logSeg" data-v="${k}">${l}</button>`).join('')+'</div>';
  if(UI.logSeg==='history'){
    const ws=W.finished(st).slice().reverse();
    h+=`<button style="width:100%" data-a="startEmpty">+ Log a workout manually</button>`;
    if(!ws.length) h+='<p class="mono mu small">No workouts logged yet.</p>';
    for(const w of ws){ const dur=w.startedAt&&w.finishedAt?Math.round((new Date(w.finishedAt)-new Date(w.startedAt))/60000):null;
      const sets=w.items.reduce((a,it)=>a+(it.sets?W.doneSets(it).length:0),0);
      h+=`<div class="card" data-a="openW" data-v="${w.id}"><div class="row"><h3 class="grow">${fmtDate(w.date)}</h3><span class="mono mu small">${dur!=null?dur+' min':''}</span></div><div class="mono mu small">${esc(w.eqName||'')} · ${sets} sets</div><div class="small" style="margin-top:4px">${w.items.map(i=>esc(exName(i.exId))).join(' · ')}</div></div>`; }
  }
  if(UI.logSeg==='bp'){
    const b=W.bpSummary(st,today());
    h+=`<div class="card"><h3>New reading</h3><div class="row"><div class="grow"><label class="lb">Systolic</label><input id="bpS" inputmode="numeric"></div><div class="grow"><label class="lb">Diastolic</label><input id="bpD" inputmode="numeric"></div><div class="grow"><label class="lb">Pulse</label><input id="bpP" inputmode="numeric"></div></div>
     <div class="row"><div class="grow"><label class="lb">Arm</label><select id="bpA"><option>L</option><option>R</option></select></div><div class="grow"><label class="lb">Date</label><input id="bpDate" type="date" value="${today()}"></div></div><label class="lb">Note</label><input id="bpN" placeholder="optional (e.g. after coffee)">
     <button class="btn-am btn-big" data-a="saveBP">Save reading</button></div>`;
    if(b.all.length){ h+=`<div class="card"><h3>Trend</h3>${bpChart(60)}<div class="mono small" style="margin-top:6px">${b.d7?`7-day avg <b class="am">${b.d7.sys}/${b.d7.dia}</b> (${b.d7.n})`:''} ${b.d30?` · 30-day ${b.d30.sys}/${b.d30.dia}`:''}</div></div>`;
      h+=b.all.slice().reverse().slice(0,40).map(r=>`<div class="list-item"><div class="grow"><b class="mono" style="font-size:20px">${r.sys}/${r.dia}</b> <span class="mono mu small">${r.pulse?'p'+r.pulse:''}</span><div class="mono mu tiny">${r.date} ${r.time||''} ${r.arm||''} ${esc(r.notes||'')}</div></div><button class="btn-sm btn-ghost" data-a="delRec" data-k="bp" data-v="${r.id}">✕</button></div>`).join(''); }
    h+=`<p class="mono mu tiny">Not medical advice. Discuss readings and any exercise changes with your clinician. Guideline target referenced: &lt;130/80 (2025 AHA/ACC).</p>`;
  }
  if(UI.logSeg==='body'){
    h+=`<div class="card"><h3>New entry</h3><div class="row"><div class="grow"><label class="lb">Weight (${U()})</label><input id="bwW" inputmode="decimal"></div><div class="grow"><label class="lb">Waist (in/cm)</label><input id="bwWaist" inputmode="decimal"></div><div class="grow"><label class="lb">Body fat %</label><input id="bwBf" inputmode="decimal"></div></div><label class="lb">Date</label><input id="bwDate" type="date" value="${today()}"><button class="btn-am btn-big" data-a="saveBody">Save</button></div>`;
    const b=st.body.slice().sort((a,c)=>a.date.localeCompare(c.date));
    if(b.length){ const pts=b.map(r=>({x:r.date,y:+r.weight})); h+=`<div class="card"><h3>Body weight</h3>${lineChart([{name:'weight',c:'#8a6a12',pts},{name:'7-day avg',c:'#F2A900',pts:W.movingAvg(pts,7),noDots:true,w:3}],{yFmt:v=>v.toFixed(0)})}</div>`;
      h+=b.slice().reverse().slice(0,40).map(r=>`<div class="list-item"><div class="grow"><b class="mono" style="font-size:20px">${r.weight}</b> <span class="mono mu small">${r.waist?'waist '+r.waist:''} ${r.bf?r.bf+'%':''}</span><div class="mono mu tiny">${r.date}</div></div><button class="btn-sm btn-ghost" data-a="delRec" data-k="body" data-v="${r.id}">✕</button></div>`).join(''); }
  }
  if(UI.logSeg==='prt'){
    const pg=st.goals.find(g=>g.type==='prt');
    h+=`<div class="card"><h3>PRT result (mock or official)</h3><div class="row"><div class="grow"><label class="lb">Push-ups</label><input id="pPu" inputmode="numeric"></div><div class="grow"><label class="lb">Plank m:ss</label><input id="pPl" inputmode="numeric" placeholder="3:10"></div></div>
     <div class="row"><div class="grow"><label class="lb">Cardio event</label><select id="pEv">${Object.entries(PRT_CARDIO).map(([k,v])=>`<option value="${k}" ${(pg&&pg.cardioEvent||'run')===k?'selected':''}>${v.label}</option>`).join('')}</select></div><div style="width:120px"><label class="lb">Time m:ss</label><input id="pCt" inputmode="numeric" placeholder="11:45"></div></div>
     <div class="row"><div class="grow"><label class="lb">Date</label><input id="pDate" type="date" value="${today()}"></div><label class="row small" style="margin-top:28px"><input type="checkbox" id="pOff"> Official</label></div>
     <button class="btn-am btn-big" data-a="savePRT">Save result</button>
     <p class="mono mu tiny">Raw results only — scoring tables are not built in. Score your result against the official tables (OPNAVINST 6110.1L, PRP Guide-5A, Dec 2025) and put your target scores in Goals.</p></div>`;
    const t=st.prt.slice().sort((a,b)=>a.date.localeCompare(b.date));
    if(t.length){ h+=prtCharts(); h+=t.slice().reverse().map(r=>`<div class="list-item"><div class="grow"><b>${r.pushups??'–'} push-ups · ${W.fmtSec(r.plankSec)} plank · ${W.fmtSec(r.cardioSec)}</b><div class="mono mu tiny">${r.date} · ${r.official?'OFFICIAL':'practice'} · ${(PRT_CARDIO[r.cardioEvent||'run']||{}).label}</div></div><button class="btn-sm btn-ghost" data-a="delRec" data-k="prt" data-v="${r.id}">✕</button></div>`).join(''); }
  }
  return h;
}
function bpChart(days){
  const b=W.bpSummary(st,today()).all.filter(r=>!days||W.daysBetween(r.date,today())<days);
  return lineChart([{name:'systolic',c:'#F2A900',pts:b.map(r=>({x:r.date,y:+r.sys}))},{name:'diastolic',c:'#58A6FF',pts:b.map(r=>({x:r.date,y:+r.dia}))}],{ref:[{y:130,label:'130',c:'#7d5d00'},{y:80,label:'80',c:'#2d4f7a'}]});
}
function prtCharts(){
  const t=st.prt.slice().sort((a,b)=>a.date.localeCompare(b.date)); const pg=st.goals.find(g=>g.type==='prt');
  const ref=(v,l)=>v?[{y:v,label:l,c:'#3FB950'}]:[];
  return `<div class="card"><h3>Push-ups</h3>${lineChart([{name:'push-ups',c:'#F2A900',pts:t.filter(r=>r.pushups).map(r=>({x:r.date,y:+r.pushups}))}],{ref:ref(pg&&+pg.pushupsTarget,'goal')})}</div>
  <div class="card"><h3>Plank</h3>${lineChart([{name:'plank',c:'#F2A900',pts:t.filter(r=>r.plankSec).map(r=>({x:r.date,y:r.plankSec}))}],{yFmt:W.fmtSec,ref:ref(pg&&W.parseTime(pg.plankTarget),'goal')})}</div>
  <div class="card"><h3>Cardio time (lower is better)</h3>${lineChart([{name:'cardio',c:'#F2A900',pts:t.filter(r=>r.cardioSec).map(r=>({x:r.date,y:r.cardioSec}))}],{yFmt:W.fmtSec,ref:ref(pg&&W.parseTime(pg.cardioTarget),'goal')})}</div>`;
}

/* ---------- STATS ---------- */
function viewStats(){
  const fr=W.frequency(st,8,today()); const P=W.prs(st);
  let h=`<div class="kpis"><div class="kpi"><b>${fr.total}</b><span>Workouts</span></div><div class="kpi"><b>${fr.perWeek4}</b><span>Per week (4 wk)</span></div><div class="kpi"><b>${fr.weekStreak}</b><span>Week streak</span></div><div class="kpi"><b>${fr.dayStreak}</b><span>Day streak</span></div></div>`;
  h+=`<div class="card"><h3>Workouts per week</h3>${barChart(Object.keys(fr.per).map(k=>k.slice(5).replace('-','/')),Object.values(fr.per))}</div>`;
  const lifts=Object.keys(P).filter(id=>P[id].kind==='w'&&P[id].best.e1rm).sort((a,b)=>P[b].best.e1rm.v-P[a].best.e1rm.v);
  h+=`<h2>Estimated 1RM</h2>`;
  if(!lifts.length) h+='<p class="mono mu small">Log weighted sets (≤12 reps) to see e1RM.</p>';
  else{ const id=lifts.includes(UI.statsEx)?UI.statsEx:lifts[0]; const s=W.e1rmSeries(st,id); const b=P[id].best; const f=st.settings.formula;
    h+=`<select data-c="statsEx">${lifts.map(x=>`<option value="${x}" ${x===id?'selected':''}>${esc(P[x].ex.name)}</option>`).join('')}</select>
    <div class="card">${lineChart([{name:'Epley',c:'#F2A900',pts:s.map(p=>({x:p.date,y:p.epley}))},{name:'Brzycki',c:'#58A6FF',pts:s.map(p=>({x:p.date,y:p.brzycki})),dash:true}])}
    <table class="tbl" style="margin-top:8px"><tr><th>Record</th><th>Value</th><th>Set / date</th></tr>
    <tr><td>e1RM (${f==='brzycki'?'Brzycki':'Epley'})</td><td class="am">${Math.round(b.e1rm.v)}</td><td>${b.e1rm.w}×${b.e1rm.reps} · ${b.e1rm.date}</td></tr>
    <tr><td>Other formula</td><td>${Math.round(f==='brzycki'?W.epley(b.e1rm.w,b.e1rm.reps):W.brzycki(b.e1rm.w,b.e1rm.reps))}</td><td>${f==='brzycki'?'Epley':'Brzycki'}, same set</td></tr>
    <tr><td>Heaviest</td><td>${b.weight.v}</td><td>×${b.weight.reps} · ${b.weight.date}</td></tr>
    <tr><td>Most reps</td><td>${b.reps.v}</td><td>@${b.reps.w} · ${b.reps.date}</td></tr>
    <tr><td>Best set volume</td><td>${Math.round(b.setVol.v)}</td><td>${b.setVol.w}×${b.setVol.reps}</td></tr>
    <tr><td>Best session vol.</td><td>${Math.round(b.sessVol.v)}</td><td>${b.sessVol.date}</td></tr></table>
    <p class="mono mu tiny">Epley = w × (1 + reps/30). Brzycki = w × 36/(37 − reps). Only sets of ≤12 reps are used.</p></div>`; }
  h+=`<h2>All PRs</h2><div class="card"><table class="tbl"><tr><th>Exercise</th><th>Best</th><th>Date</th></tr>`+
    Object.keys(P).sort((a,b)=>P[a].ex.name.localeCompare(P[b].ex.name)).map(id=>{ const p=P[id], b=p.best;
      const v = b.e1rm? `e1RM ${Math.round(b.e1rm.v)} (${b.e1rm.w}×${b.e1rm.reps})` : b.hold? W.fmtSec(b.hold.v) : b.reps? `${b.reps.v} reps` : b.weight? `${b.weight.v}×${b.weight.reps}`:'–';
      const d = (b.e1rm||b.hold||b.reps||b.weight||{}).date||''; return `<tr><td>${esc(p.ex.name)}</td><td class="am">${v}</td><td>${d.slice(5)}</td></tr>`; }).join('')+`</table></div>`;
  const wm=W.weeklyMuscle(st,5,today()); const wks=Object.keys(wm); const cur=wm[wks[wks.length-1]]; const prev=wks.slice(0,-1);
  const muscles=MUSCLES.filter(m=>wks.some(k=>wm[k][m]));
  if(muscles.length){ const mx=Math.max(1,...muscles.map(m=>Math.max(cur[m]||0, ...prev.map(k=>wm[k][m]||0))));
    h+=`<h2>Weekly sets per muscle</h2><div class="card"><div class="mono mu tiny" style="margin-bottom:6px">Bar = this week. Tick = 4-week average. Primary muscle 1 set, secondary 0.5.</div>`+
     muscles.map(m=>{ const c=cur[m]||0, a=prev.reduce((s,k)=>s+(wm[k][m]||0),0)/(prev.length||1); return `<div class="row" style="margin:6px 0"><span class="mono small" style="width:92px">${m}</span><div class="grow" style="position:relative;height:16px;background:#0B1119;border-radius:4px"><div class="bar" style="width:${c/mx*100}%"></div><div style="position:absolute;top:-3px;left:${a/mx*100}%;width:2px;height:22px;background:#58A6FF"></div></div><span class="mono small" style="width:64px;text-align:right">${W.r1(c)} / ${W.r1(a)}</span></div>`; }).join('')+'</div>'; }
  // cardio minutes per week
  const cw={}; Object.keys(fr.per).forEach(k=>cw[k]=0); for(const w of W.finished(st)){ const k=W.weekStart(w.date); if(k in cw) for(const it of w.items) if(it.kind==='cardio'&&it.cardio.done) cw[k]+=+it.cardio.min||0; }
  h+=`<h2>Aerobic minutes / week</h2><div class="card">${barChart(Object.keys(cw).map(k=>k.slice(5).replace('-','/')),Object.values(cw),{max:160,ref:[{y:90,label:'90',c:'#58A6FF'},{y:150,label:'150',c:'#3FB950'}]})}<div class="mono mu tiny">90–150 min/wk = BP guideline aerobic range (2025 AHA/ACC).</div></div>`;
  if(st.prt.length) h+=`<h2>PRT trends</h2>`+prtCharts();
  if(st.bp.length) h+=`<h2>Blood pressure</h2><div class="card">${bpChart(0)}</div>`;
  if(st.body.length){ const pts=st.body.slice().sort((a,c)=>a.date.localeCompare(c.date)).map(r=>({x:r.date,y:+r.weight})); h+=`<h2>Body weight</h2><div class="card">${lineChart([{name:'weight',c:'#8a6a12',pts},{name:'7-day avg',c:'#F2A900',pts:W.movingAvg(pts,7),noDots:true,w:3}],{yFmt:v=>v.toFixed(0)})}</div>`; }
  return h;
}

/* ---------- GOALS ---------- */
function viewGoals(){
  const act=st.goals.filter(g=>g.active!==false); const Wt=W.domainWeights(act);
  const DN={str:'Strength',cardio:'Cardio',prtm:'PRT push-up/plank',iso:'BP isometric',mob:'Mobility',custom:'Custom'};
  let h=`<p class="mono mu small">Stack as many goals as you want. Priority 1–5 sets how much session time each gets.</p>`;
  if(act.length) h+=`<div class="card"><h3>Current blend</h3><div class="mono small">${Object.keys(Wt).filter(k=>Wt[k]>0.005).sort((a,b)=>Wt[b]-Wt[a]).map(k=>`${DN[k]} <span class="am">${Math.round(Wt[k]*100)}%</span>`).join(' · ')}</div></div>`;
  st.goals.forEach((g,i)=>{ h+=goalCard(g,i); });
  h+=`<button class="btn-am btn-big" data-a="addGoal">+ Add goal</button>`;
  return h;
}
function gField(i,f,label,val,ph='',mode='text'){ return `<div class="grow"><label class="lb">${label}</label><input data-c="goal" data-i="${i}" data-f="${f}" value="${esc(val??'')}" placeholder="${ph}" ${mode==='num'?'inputmode="decimal"':''}></div>`; }
function goalCard(g,i){
  let h=`<div class="card"><div class="row"><div class="grow"><span class="pill am">${WO_GT(g.type)}</span></div><label class="row small"><input type="checkbox" data-c="goal" data-i="${i}" data-f="active" ${g.active!==false?'checked':''}> Active</label></div>
  <div class="row">${gField(i,'name','Name',g.name)}</div><label class="lb">Priority</label><div class="seg">`+[1,2,3,4,5].map(p=>`<button class="${(g.priority||3)==p?'on':''}" data-a="goalPri" data-i="${i}" data-v="${p}">${p}</button>`).join('')+'</div>';
  if(g.type==='prt'){
    h+=`<div class="row">${gField(i,'testDate','Test date',g.testDate,'YYYY-MM-DD')}</div><div class="row">${gField(i,'pushupsTarget','Push-ups target',g.pushupsTarget,'e.g. 70','num')}${gField(i,'plankTarget','Plank target m:ss',g.plankTarget,'3:30')}</div>
    <div class="row"><div class="grow"><label class="lb">Cardio event</label><select data-c="goal" data-i="${i}" data-f="cardioEvent">${Object.entries(PRT_CARDIO).map(([k,v])=>`<option value="${k}" ${(g.cardioEvent||'run')===k?'selected':''}>${v.label}</option>`).join('')}</select></div>${gField(i,'cardioTarget','Target m:ss',g.cardioTarget,'11:30')}</div>
    <p class="mono mu tiny">Events per OPNAVINST 6110.1L (29 Dec 2025) &amp; PRP Guide-5A (Dec 2025): 2-min push-ups, forearm plank, 1.5-mile run/walk; alternate cardio (Concept2 2,000 m row, stationary bike, treadmill, 500-yd/450-m swim) only if your CO/OIC authorizes. Targets are your own numbers — no scoring tables are built in.</p>`;
  }
  if(g.type==='strength'||g.type==='hypertrophy'||g.type==='endurance') h+=`<div class="row">${gField(i,'targets','Targets (free text)',g.targets,g.type==='endurance'?'e.g. 10K under 50:00':'e.g. Bench 245, Squat 315')}</div>`;
  if(g.type==='bp') h+=`<div class="row">${gField(i,'sysTarget','Systolic target',g.sysTarget,'125','num')}${gField(i,'diaTarget','Diastolic target',g.diaTarget,'80','num')}</div>
    <p class="mono mu tiny">Generator follows the 2025 AHA/ACC BP guideline exercise table: aerobic 90–150 min/wk at 65–75% HR reserve; dynamic resistance 3×10 at 50–80% 1RM; isometric handgrip 4×2 min, 1 min rest, 30–40% max, 3×/wk (wall sit used when no handgrip trainer). Not medical advice — check with your doctor, especially if on BP medication.</p>`;
  if(g.type==='weight') h+=`<div class="row">${gField(i,'weightTarget','Target weight ('+U()+')',g.weightTarget,'','num')}</div>`;
  if(g.type==='custom'){ h+=`<label class="lb">Style</label><div class="seg">`+[['heavy','Heavy'],['hyp','8–12'],['circuit','Circuit']].map(([k,l])=>`<button class="${(g.style||'hyp')===k?'on':''}" data-a="goalStyle" data-i="${i}" data-v="${k}">${l}</button>`).join('')+`</div><label class="lb">Exercises</label>`+
    (g.exIds||[]).map((id,j)=>`<div class="list-item"><span class="grow">${esc(exName(id))}</span><button class="btn-sm btn-ghost" data-a="goalExDel" data-i="${i}" data-v="${j}">✕</button></div>`).join('')+`<button class="btn-sm" style="width:100%;margin-top:6px" data-a="goalExAdd" data-i="${i}">+ Add exercise</button>`; }
  h+=`<div class="row">${gField(i,'notes','Notes',g.notes)}</div><button class="btn-sm btn-ghost btn-bad" style="margin-top:10px" data-a="goalDel" data-i="${i}">Delete goal</button></div>`;
  return h;
}

/* ---------- SETTINGS ---------- */
function viewSettings(){
  const s=st.settings;
  let h=`<div class="card"><label class="lb">Units</label><div class="seg">${['lb','kg'].map(u=>`<button class="${s.units===u?'on':''}" data-a="units" data-v="${u}">${u}</button>`).join('')}</div>
  <label class="lb">1RM formula (primary)</label><div class="seg">${[['epley','Epley'],['brzycki','Brzycki']].map(([k,l])=>`<button class="${s.formula===k?'on':''}" data-a="setting" data-f="formula" data-v="${k}">${l}</button>`).join('')}</div>
  <label class="lb">Default length</label><div class="seg">${[15,30,45,60,90].map(t=>`<button class="${s.defaultTier==t?'on':''}" data-a="setting" data-f="defaultTier" data-v="${t}" data-n="1">${t}</button>`).join('')}</div>
  <label class="lb">Preferred cardio (non-PRT days)</label><select data-c="setting" data-f="cardioPref">${[['run','Run'],['row','Row'],['bike','Bike'],['swim','Swim']].map(([k,l])=>`<option value="${k}" ${s.cardioPref===k?'selected':''}>${l}</option>`).join('')}</select>
  <label class="lb">Rest periods</label><div class="seg">${[[0.75,'Shorter'],[1,'Normal'],[1.25,'Longer']].map(([k,l])=>`<button class="${(s.restMult||1)==k?'on':''}" data-a="setting" data-f="restMult" data-v="${k}" data-n="1">${l}</button>`).join('')}</div></div>`;
  h+=`<h2>Equipment sets</h2>`+st.equipmentSets.map(e=>`<div class="list-item" data-a="eqEdit" data-v="${e.id}"><div class="grow"><b>${esc(e.name)}</b>${e.id===s.defaultEq?' <span class="pill am">default</span>':''}<div class="mono mu tiny">${e.items.length} items${e.dbMax?` · DBs ≤${e.dbMax}`:''}</div></div><span class="mu">›</span></div>`).join('')+`<button style="width:100%;margin-top:8px" data-a="eqNew">+ New equipment set</button>`;
  h+=`<h2>Custom exercises</h2>`+(st.customExercises.length? st.customExercises.map(e=>`<div class="list-item"><div class="grow"><b>${esc(e.name)}</b><div class="mono mu tiny">${PATTERNS[e.p]} · ${e.k} · ${e.r.join('–')}</div></div><button class="btn-sm btn-ghost" data-a="cexDel" data-v="${e.id}">✕</button></div>`).join('') : '<p class="mono mu small">None yet.</p>')+`<button style="width:100%;margin-top:8px" data-a="cexNew">+ Custom exercise</button>`;
  h+=`<h2>Data</h2><div class="card"><div class="mono small">Saved on this phone in ${esc(UI.storage)}. Persistent storage: <b class="${UI.persisted?'am':''}">${UI.persisted===null?'unknown':UI.persisted?'granted':'not granted'}</b>. Last backup: ${s.lastBackup?s.lastBackup.slice(0,10):'never'}.</div>
   <button class="btn-am btn-big" data-a="viewReport">View / share report</button>
   <div class="row"><button class="grow" data-a="shareCsv">CSV files</button><button class="grow" data-a="backup">Backup (JSON)</button></div>
   <div class="row" style="margin-top:8px"><button class="grow" data-a="restore">Restore backup</button><button class="grow btn-ghost" data-a="demo">Load demo data</button></div>
   <button class="btn-ghost btn-bad" style="width:100%;margin-top:8px" data-a="erase">Erase all data</button></div>`;
  h+=`<h2>About</h2><div class="card mono small" style="font-weight:400;line-height:1.5">Everything stays on this device; nothing is sent anywhere. Works offline once loaded.<br><br>
   <b>Progression:</b> double progression — hit the top of the rep range on every set → +5 lb upper / +10 lb lower (kg: 2.5/5). In range → same weight, beat reps. Missed twice in a row → 10% deload. Push-ups +2 reps/set, holds +10 s, intervals +1 rep, tempo +2 min, steady cardio +10% duration.<br><br>
   <b>Sources:</b> Navy PRT events — OPNAVINST 6110.1L (29 Dec 2025) and PRP Guide-5A Physical Readiness Test (Dec 2025), mynavyhr.navy.mil. BP exercise — 2025 AHA/ACC High Blood Pressure Guideline, Table 12 (aerobic 90–150 min/wk; dynamic resistance 3×10 @ 50–80% 1RM; isometric handgrip 4×2 min, 30–40% max, 3×/wk).<br><br>
   Not medical advice. Fonts: Barlow Condensed &amp; IBM Plex Mono (SIL Open Font License).</div>`;
  return h;
}

/* ================= actions ================= */
const A = {};
document.addEventListener('click', e=>{
  const el=e.target.closest('[data-a]'); if(!el) return;
  if(el.tagName==='INPUT'||el.tagName==='SELECT') return;
  const f=A[el.dataset.a]; if(f){ e.preventDefault(); f(el,e); }
});
document.addEventListener('change', e=>{ const el=e.target; const c=el.dataset&&el.dataset.c; if(c&&C[c]) C[c](el); });
const C = {};
A.tab = el => { UI.tab=el.dataset.v; UI.editId=null; closeSheet(); render(); window.scrollTo(0,0); };
A.tier = el => { UI.tier=+el.dataset.v; render(); };
A.eq = el => { UI.eqId=el.dataset.v; render(); };
A.generate = () => { const tier=UI.tier||st.settings.defaultTier, eqId=UI.eqId||st.settings.defaultEq; UI.plan=W.generate(st,{tier,eqId,date:today()}); render(); window.scrollTo(0,0); };
A.planCancel = () => { UI.plan=null; render(); window.scrollTo(0,0); };
A.planRemove = el => { UI.plan.items.splice(+el.dataset.i,1); recalcPlan(); render(); };
function recalcPlan(){ const p=UI.plan; p.estMin=p.warmMin+p.items.reduce((a,i)=>a+(i.estMin||0),0); }
A.start = () => { const w=UI.plan; w.startedAt=new Date().toISOString(); w.date=today(); st.active=w; UI.plan=null; save(); render(); window.scrollTo(0,0); };
A.startEmpty = () => { const eq=W.eqById(st,UI.eqId||st.settings.defaultEq); st.active={id:W.uid(),date:today(),tier:null,eqId:eq.id,eqName:eq.name,goals:'',items:[],notes:[],startedAt:new Date().toISOString(),finishedAt:null,note:''}; UI.tab='today'; UI.editId=null; save(); render(); };
A.swap = el => {
  const i=+el.dataset.i; const w=UI.plan||curW(); const it=w.items[i]; const alts=W.alternatives(st,it,w.eqId);
  openSheet(`<h3>Swap ${esc(exName(it.exId))}</h3><p class="mono mu small">Same movement pattern, available in ${esc(W.eqById(st,w.eqId).name)}.</p>`+(alts.length?alts.map(a=>`<div class="list-item" data-a="doSwap" data-i="${i}" data-v="${a.id}"><span class="grow">${esc(a.name)}</span><span class="mono mu tiny">${a.eq.join(', ')||'no equipment'}</span></div>`).join(''):'<p class="mono mu">No alternatives with this equipment.</p>'));
};
A.doSwap = el => { const w=UI.plan||curW(); const i=+el.dataset.i; const it=W.swapItem(st,w,w.items[i],el.dataset.v); if(it){ w.items[i]=it; } if(UI.plan) recalcPlan(); else save(); closeSheet(); render(); };
A.addEx = () => exPicker('addExPick');
function exPicker(action, extra=''){
  const w=UI.plan||curW(); const eq=w?W.eqById(st,w.eqId):null;
  openSheet(`<h3>Add exercise</h3><input id="exq" placeholder="Search…" autocomplete="off"><label class="row small" style="margin:8px 0"><input type="checkbox" id="exall" ${eq?'':'checked'}> Show exercises outside ${eq?esc(eq.name):'equipment set'}</label><div id="exlist"></div>`);
  const draw=()=>{ const q=($('#exq').value||'').toLowerCase(); const all=$('#exall').checked;
    const list=W.allEx(st).filter(e=>(!q||e.name.toLowerCase().includes(q)||(PATTERNS[e.p]||'').toLowerCase().includes(q)) && (all||!eq||W.feasible(e,eq)));
    const groups={}; list.forEach(e=>(groups[e.p]=groups[e.p]||[]).push(e));
    $('#exlist').innerHTML=Object.keys(groups).map(p=>`<label class="lb">${PATTERNS[p]||p}</label>`+groups[p].map(e=>`<div class="list-item" data-a="${action}" data-v="${e.id}" ${extra}><span class="grow">${esc(e.name)}</span><span class="mono mu tiny">${e.eq.join(', ')}</span></div>`).join('')).join('')||'<p class="mono mu">No match.</p>'; };
  $('#exq').addEventListener('input',draw); $('#exall').addEventListener('change',draw); draw();
}
A.addExPick = el => { const w=UI.plan||curW(); const it=W.addItem(st,w,el.dataset.v); w.items.push(it); if(UI.plan) recalcPlan(); else save(); closeSheet(); render(); const c=document.getElementById('it'+(w.items.length-1)); if(c) c.scrollIntoView({block:'center'}); };
A.itemMenu = el => { const i=+el.dataset.i; openSheet(`<h3>${esc(exName(curW().items[i].exId))}</h3><button style="width:100%;margin:6px 0" data-a="swap" data-i="${i}">Swap exercise</button><button style="width:100%;margin:6px 0" data-a="itemUp" data-i="${i}">Move up</button><button class="btn-bad" style="width:100%;margin:6px 0" data-a="itemDel" data-i="${i}">Remove</button><button class="btn-ghost" style="width:100%" data-a="closeSheet">Cancel</button>`); };
A.closeSheet = closeSheet;
A.itemUp = el => { const w=curW(), i=+el.dataset.i; if(i>0){ const t=w.items[i]; w.items[i]=w.items[i-1]; w.items[i-1]=t; save(); } closeSheet(); render(); };
A.itemDel = el => { const w=curW(); if(!confirm('Remove this exercise?')) return; w.items.splice(+el.dataset.i,1); save(); closeSheet(); render(); };
A.tick = el => {
  const w=curW(), it=w.items[+el.dataset.i], s=it.sets[+el.dataset.s];
  // read current input values in the row (in case change hasn't fired)
  el.parentElement.querySelectorAll('input[data-f]').forEach(inp=>{ const v=num(inp.value); s[inp.dataset.f]= v; });
  s.done=!s.done; save(); buzz(30);
  el.parentElement.classList.toggle('done',s.done);
  if(s.done && !UI.editId){
    // carry weight forward to the next unfinished set if user changed it
    const nx=it.sets[+el.dataset.s+1]; if(nx&&!nx.done&&it.kind==='w'&&s.w!==''&&s.w!==it.presc.w){ nx.w=s.w; }
    const last = it.sets.every(x=>x.done); startTimer(last? Math.min(90,it.rest||60) : (it.rest||60));
  }
  render();
};
A.addSet = el => { const it=curW().items[+el.dataset.i]; const l=it.sets[it.sets.length-1]||{}; it.sets.push(it.kind==='hold'?{sec:l.sec||it.presc.sec||60,done:false}:{w:l.w??'',reps:l.reps??'',rpe:'',done:false}); save(); render(); };
A.delSet = el => { const it=curW().items[+el.dataset.i]; if(it.sets.length>1){ it.sets.pop(); save(); render(); } };
A.cardioDone = el => { const it=curW().items[+el.dataset.i]; const card=el.closest('.card'); card.querySelectorAll('[data-c=cardio]').forEach(C.cardio); it.cardio.done=!it.cardio.done; save(); buzz(30); render(); };
A.flowDone = el => { const it=curW().items[+el.dataset.i]; it.done=!it.done; save(); render(); };
C.set = el => { const w=curW(); if(!w) return; const s=w.items[+el.dataset.i].sets[+el.dataset.s]; s[el.dataset.f]=num(el.value); save(); };
C.cardio = el => { const w=curW(); if(!w) return; const c=w.items[+el.dataset.i].cardio; const f=el.dataset.f; c[f]= f==='unit'? el.value : f==='asRx'? el.checked : num(el.value); save(); };
C.wnote = el => { const w=curW(); w.note=el.value; save(); };
C.wdate = el => { const w=curW(); if(el.value){ w.date=el.value; save(); } };
A.finish = () => {
  const w=st.active; const done=w.items.filter(W.itemDone).length;
  if(!done && !confirm('Nothing logged yet. Finish anyway?')) return;
  w.items=w.items.filter(it=>W.itemDone(it) || confirm(`"${exName(it.exId)}" has nothing logged. Keep it in the log?`));
  w.finishedAt=new Date().toISOString(); st.workouts.push(w); st.active=null; stopTimer();
  const prs=W.newPRs(st,w); save();
  const dur=Math.round((new Date(w.finishedAt)-new Date(w.startedAt))/60000);
  const sets=w.items.reduce((a,it)=>a+(it.sets?W.doneSets(it).length:0),0);
  const vol=w.items.reduce((a,it)=>a+(it.kind==='w'?W.doneSets(it).reduce((x,s)=>x+(+s.w||0)*(+s.reps||0),0):0),0);
  render();
  openSheet(`<h3 class="am" style="font-size:28px">Workout saved</h3><div class="kpis" style="margin:10px 0"><div class="kpi"><b>${dur}</b><span>Minutes</span></div><div class="kpi"><b>${sets}</b><span>Sets</span></div><div class="kpi"><b>${Math.round(vol).toLocaleString()}</b><span>Volume ${U()}</span></div><div class="kpi"><b>${prs.length}</b><span>PRs</span></div></div>`+
   (prs.length?'<h3>New records</h3>'+prs.map(p=>`<div class="why">${esc(p)}</div>`).join(''):'')+`<button class="btn-am btn-big" data-a="closeSheet">Done</button>`);
};
A.discard = () => { if(confirm('Discard this workout? Nothing will be saved.')){ st.active=null; stopTimer(); save(); render(); } };
A.openW = el => { UI.editId=el.dataset.v; render(); window.scrollTo(0,0); };
A.editBack = () => { UI.editId=null; UI.tab='log'; render(); };
A.delW = () => { if(!confirm('Delete this workout permanently?')) return; st.workouts=st.workouts.filter(w=>w.id!==UI.editId); UI.editId=null; UI.tab='log'; save(); render(); };
A.logSeg = el => { UI.logSeg=el.dataset.v; render(); };
A.quickBP = () => { UI.tab='log'; UI.logSeg='bp'; render(); setTimeout(()=>$('#bpS')&&$('#bpS').focus(),50); };
A.quickBody = () => { UI.tab='log'; UI.logSeg='body'; render(); setTimeout(()=>$('#bwW')&&$('#bwW').focus(),50); };
A.saveBP = () => { const s=num($('#bpS').value), d=num($('#bpD').value); if(!s||!d) return toast('Enter systolic and diastolic');
  const now=new Date(); st.bp.push({id:W.uid(),date:$('#bpDate').value||today(),time:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),sys:s,dia:d,pulse:num($('#bpP').value),arm:$('#bpA').value,notes:$('#bpN').value}); save(); toast('BP saved'); render(); };
A.saveBody = () => { const w=num($('#bwW').value); if(!w) return toast('Enter weight'); st.body.push({id:W.uid(),date:$('#bwDate').value||today(),weight:w,waist:num($('#bwWaist').value),bf:num($('#bwBf').value),notes:''}); save(); toast('Saved'); render(); };
A.savePRT = () => { const pu=num($('#pPu').value), pl=W.parseTime($('#pPl').value), ct=W.parseTime($('#pCt').value); if(pu===''&&!pl&&!ct) return toast('Enter at least one result');
  st.prt.push({id:W.uid(),date:$('#pDate').value||today(),official:$('#pOff').checked,pushups:pu===''?null:pu,plankSec:pl,cardioEvent:$('#pEv').value,cardioSec:ct,notes:''}); save(); toast('PRT result saved'); render(); };
A.delRec = el => { if(!confirm('Delete this entry?')) return; const k=el.dataset.k; st[k]=st[k].filter(r=>r.id!==el.dataset.v); save(); render(); };
C.statsEx = el => { UI.statsEx=el.value; render(); };
/* goals */
A.addGoal = () => openSheet('<h3>Add goal</h3>'+Object.entries(GOAL_TYPES).map(([k,v])=>`<div class="list-item" data-a="addGoalType" data-v="${k}"><div class="grow"><b>${v.label}</b><div class="mono mu tiny">${v.desc}</div></div><span class="am">+</span></div>`).join(''));
A.addGoalType = el => { const t=el.dataset.v; const g={id:W.uid(),type:t,name:GOAL_TYPES[t].label,priority:3,active:true}; if(t==='prt'){ g.cardioEvent='run'; g.priority=5; } if(t==='custom'){ g.exIds=[]; g.style='hyp'; } st.goals.push(g); save(); closeSheet(); render(); };
A.goalPri = el => { st.goals[+el.dataset.i].priority=+el.dataset.v; save(); render(); };
A.goalStyle = el => { st.goals[+el.dataset.i].style=el.dataset.v; save(); render(); };
A.goalDel = el => { if(!confirm('Delete this goal?')) return; st.goals.splice(+el.dataset.i,1); save(); render(); };
A.goalExAdd = el => { UI.goalIdx=+el.dataset.i; exPicker('goalExPick'); };
A.goalExPick = el => { const g=st.goals[UI.goalIdx]; (g.exIds=g.exIds||[]).push(el.dataset.v); save(); closeSheet(); render(); };
A.goalExDel = el => { st.goals[+el.dataset.i].exIds.splice(+el.dataset.v,1); save(); render(); };
C.goal = el => { const g=st.goals[+el.dataset.i]; const f=el.dataset.f; g[f]= f==='active'? el.checked : el.value; save(); if(f==='active') render(); };
/* settings */
A.setting = el => { st.settings[el.dataset.f]= el.dataset.n? +el.dataset.v : el.dataset.v; save(); render(); };
C.setting = el => { st.settings[el.dataset.f]=el.value; save(); };
A.units = el => { const u=el.dataset.v; if(u===st.settings.units) return; if(!confirm(`Switch to ${u}? All logged weights will be converted.`)) return;
  const f=u==='kg'?0.45359237:2.20462262; const cv=x=> (x===''||x==null)? x : Math.round(+x*f*2)/2;
  for(const w of st.workouts.concat(st.active?[st.active]:[])) for(const it of w.items){ if(it.kind==='w'){ it.sets.forEach(s=>s.w=cv(s.w)); if(it.presc) it.presc.w=cv(it.presc.w); } }
  st.body.forEach(r=>r.weight=cv(r.weight)); st.equipmentSets.forEach(e=>{ e.dbMax=cv(e.dbMax); e.kbMax=cv(e.kbMax); });
  st.settings.units=u; save(); render(); };
function eqEditor(e, isNew){
  openSheet(`<h3>${isNew?'New':'Edit'} equipment set</h3><label class="lb">Name</label><input id="eqName" value="${esc(e.name)}">
   <div class="row"><div class="grow"><label class="lb">Heaviest DB (${U()})</label><input id="eqDb" inputmode="decimal" value="${e.dbMax||''}"></div><div class="grow"><label class="lb">Heaviest KB (${U()})</label><input id="eqKb" inputmode="decimal" value="${e.kbMax||''}"></div></div>
   <label class="lb">Available</label>`+EQUIP.map(([k,l])=>`<label class="list-item" style="min-height:50px"><input type="checkbox" class="eqchk" value="${k}" ${e.items.includes(k)?'checked':''}><span class="grow small">${l}</span></label>`).join('')+
   `<button class="btn-am btn-big" data-a="eqSave" data-v="${e.id}" data-new="${isNew?1:''}">Save</button><div class="row"><button class="grow" data-a="eqDefault" data-v="${e.id}">Make default</button>${isNew?'':`<button class="grow btn-bad" data-a="eqDel" data-v="${e.id}">Delete</button>`}</div>`);
}
A.eqEdit = el => eqEditor(st.equipmentSets.find(e=>e.id===el.dataset.v));
A.eqNew = () => eqEditor({id:'eq_'+W.uid(),name:'New set',items:[],dbMax:'',kbMax:''},true);
A.eqSave = el => { let e=st.equipmentSets.find(x=>x.id===el.dataset.v); if(!e){ e={id:el.dataset.v}; st.equipmentSets.push(e); }
  e.name=$('#eqName').value||'Unnamed'; e.dbMax=num($('#eqDb').value)||0; e.kbMax=num($('#eqKb').value)||0; e.items=[...document.querySelectorAll('.eqchk')].filter(c=>c.checked).map(c=>c.value); save(); closeSheet(); render(); toast('Equipment set saved'); };
A.eqDefault = el => { if(!st.equipmentSets.find(x=>x.id===el.dataset.v)){ A.eqSave(el); } st.settings.defaultEq=el.dataset.v; save(); closeSheet(); render(); };
A.eqDel = el => { if(st.equipmentSets.length<=1) return toast('Keep at least one set'); if(!confirm('Delete this equipment set?')) return; st.equipmentSets=st.equipmentSets.filter(x=>x.id!==el.dataset.v); if(st.settings.defaultEq===el.dataset.v) st.settings.defaultEq=st.equipmentSets[0].id; if(UI.eqId===el.dataset.v) UI.eqId=null; save(); closeSheet(); render(); };
A.cexNew = () => openSheet(`<h3>Custom exercise</h3><label class="lb">Name</label><input id="cxName">
  <label class="lb">Movement pattern</label><select id="cxP">${Object.entries(PATTERNS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
  <label class="lb">Type</label><select id="cxK"><option value="w">Weighted (weight × reps)</option><option value="bw">Bodyweight reps</option><option value="hold">Timed hold</option><option value="cardio">Cardio (time/distance)</option></select>
  <div class="row"><div class="grow"><label class="lb">Reps / sec low</label><input id="cxLo" inputmode="numeric" value="8"></div><div class="grow"><label class="lb">High</label><input id="cxHi" inputmode="numeric" value="12"></div><div class="grow"><label class="lb">Increment</label><input id="cxInc" inputmode="decimal" value="5"></div></div>
  <label class="lb">Muscles</label><div class="chips">${MUSCLES.map(m=>`<label class="pill" style="font-size:15px;padding:6px 10px"><input type="checkbox" class="cxm" value="${m}" style="width:20px;height:20px;vertical-align:middle"> ${m}</label>`).join('')}</div>
  <label class="lb">Needs equipment</label>${EQUIP.map(([k,l])=>`<label class="list-item" style="min-height:46px"><input type="checkbox" class="cxe" value="${k}"><span class="grow small">${l}</span></label>`).join('')}
  <button class="btn-am btn-big" data-a="cexSave">Save exercise</button>`);
A.cexSave = () => { const name=$('#cxName').value.trim(); if(!name) return toast('Name required'); const lo=+$('#cxLo').value||8, hi=+$('#cxHi').value||lo;
  st.customExercises.push({id:'cx_'+W.uid(),name,p:$('#cxP').value,k:$('#cxK').value,eq:[...document.querySelectorAll('.cxe')].filter(c=>c.checked).map(c=>c.value),m:[...document.querySelectorAll('.cxm')].filter(c=>c.checked).map(c=>c.value),r:[lo,hi],inc:+$('#cxInc').value||5,rk:5,ra:0,ru:'reps',custom:true});
  save(); closeSheet(); render(); toast('Exercise added'); };
A.cexDel = el => { if(!confirm('Delete custom exercise? Logged sets keep their data.')) return; st.customExercises=st.customExercises.filter(e=>e.id!==el.dataset.v); save(); render(); };
/* export */
function stamp(){ return today(); }
async function shareFiles(files, title){
  const fs=files.map(f=>new File([f.text],f.name,{type:f.type}));
  if(navigator.canShare && navigator.share){ try{ if(navigator.canShare({files:fs})){ await navigator.share({files:fs,title}); return 'shared'; } }catch(e){ if(e&&e.name==='AbortError') return 'cancelled'; } }
  for(const f of fs){ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1500); }
  return 'downloaded';
}
A.viewReport = () => { const t=W.reportText(st,today()); UI.reportText=t;
  openSheet(`<h3>Report</h3><p class="mono mu small">Plain text — readable anywhere. Share to Files, Mail, Notes…</p><pre class="report">${esc(t)}</pre><button class="btn-am btn-big" data-a="shareReport">Share report (.txt)</button><button style="width:100%" data-a="copyReport">Copy to clipboard</button>`); };
A.shareReport = async () => { const r=await shareFiles([{name:`workout-report-${stamp()}.txt`,text:UI.reportText||W.reportText(st),type:'text/plain'}],'Workout report'); if(r==='downloaded') toast('Report downloaded'); };
A.copyReport = async () => { try{ await navigator.clipboard.writeText(UI.reportText); toast('Copied'); }catch(e){ toast('Copy not allowed here — use Share'); } };
A.shareCsv = async () => { const f=W.csvFiles(st); const r=await shareFiles(Object.keys(f).map(k=>({name:k.replace('.csv',`-${stamp()}.csv`),text:f[k],type:'text/csv'})),'Workout CSV export'); if(r==='downloaded') toast('CSV files downloaded'); };
A.backup = async () => { const r=await shareFiles([{name:`workout-backup-${stamp()}.json`,text:W.backupJson(st),type:'application/json'}],'Workout backup'); if(r!=='cancelled'){ st.settings.lastBackup=new Date().toISOString(); save(); render(); toast('Backup saved — keep it in Files/iCloud'); } };
A.restore = () => { $('#importFile').value=''; $('#importFile').click(); };
$('#importFile').addEventListener('change', async e=>{ const f=e.target.files[0]; if(!f) return; try{ const s=W.parseBackup(await f.text());
  if(!confirm(`Restore backup with ${s.workouts.length} workouts, ${s.bp.length} BP readings? This replaces the data on this phone.`)) return;
  st=s; delete st.demo; await persistNow(); UI.plan=null; UI.editId=null; render(); toast('Backup restored'); }catch(err){ alert('Could not read backup: '+err.message); } });
A.demo = () => { if((st.workouts.length||st.bp.length) && !confirm('Replace current data with 8 weeks of demo data?')) return;
  const s=W.defaultState(); s.goals=W.demoGoals(); W.simulate(s,{weeks:8,end:W.addDays(today(),-1),seed:11}); s.demo=true; st=s; save(); UI.tab='today'; render(); toast('Demo data loaded'); };
A.erase = () => { if(!confirm('Erase ALL workouts, goals, BP, weight and settings on this phone?')) return; if(!confirm('Really erase? Make a backup first if unsure.')) return; st=W.defaultState(); persistNow(); UI.plan=null; UI.editId=null; render(); toast('All data erased'); };

/* ================= rest timer & hold timer ================= */
const T={end:0,h:null};
function startTimer(sec){ if(!sec) return; T.end=Date.now()+sec*1000; $('#timer').classList.add('show'); $('#timer').classList.remove('zero'); clearInterval(T.h); T.h=setInterval(tickTimer,250); tickTimer(); }
function tickTimer(){ const left=Math.max(0,Math.round((T.end-Date.now())/1000)); $('#tleft').textContent=W.fmtSec(left); if(left<=0){ clearInterval(T.h); $('#timer').classList.add('zero'); beep(); buzz([200,100,200]); setTimeout(()=>{ if(Date.now()>=T.end) $('#timer').classList.remove('show'); },4000); } }
function stopTimer(){ clearInterval(T.h); $('#timer').classList.remove('show'); }
A.timerAdd = el => { T.end=Math.max(Date.now(),T.end)+(+el.dataset.v)*1000; tickTimer(); if(T.end>Date.now()){ clearInterval(T.h); T.h=setInterval(tickTimer,250); $('#timer').classList.remove('zero'); } };
A.timerSkip = stopTimer;
const HT={};
A.holdStart = el => { const w=curW(), i=+el.dataset.i, j=+el.dataset.s, it=w.items[i]; const tgt=+(it.sets[j].sec||it.presc.sec||60);
  Object.assign(HT,{i,j,tgt,start:Date.now()}); $('#holdname').textContent=exName(it.exId)+' · set '+(j+1); $('#holdtgt').textContent='target '+W.fmtSec(tgt); $('#holdov').classList.add('show'); stopTimer();
  clearInterval(HT.h); HT.beeped=false; HT.h=setInterval(()=>{ const el2=(Date.now()-HT.start)/1000; const left=HT.tgt-el2; $('#holdt').textContent=left>0?W.fmtSec(Math.ceil(left)):'+'+W.fmtSec(-left); if(left<=0&&!HT.beeped){ HT.beeped=true; beep(); buzz([300,100,300]); } },200); beep.c||beep(); };
A.holdStop = () => { clearInterval(HT.h); $('#holdov').classList.remove('show'); const w=curW(); const it=w.items[HT.i]; const s=it.sets[HT.j]; s.sec=Math.round((Date.now()-HT.start)/1000); s.done=true; save(); render(); if(!UI.editId) startTimer(it.rest||60); };
A.holdCancel = () => { clearInterval(HT.h); $('#holdov').classList.remove('show'); };

/* ================= boot ================= */
(async function boot(){
  await loadState();
  try{ if(navigator.storage&&navigator.storage.persist){ UI.persisted = await navigator.storage.persisted(); if(!UI.persisted) UI.persisted = await navigator.storage.persist(); } }catch(e){}
  render();
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('service-worker.js').catch(()=>{});
})();
window.__app={get state(){return st;}, set state(v){st=v;}, UI, render, persistNow, A};
