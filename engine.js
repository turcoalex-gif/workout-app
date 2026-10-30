/* Workout engine: state model, progression, generator, stats, export. No DOM. */
'use strict';
(function(root){
const D = (typeof module!=='undefined') ? require('./data.js') : root.WO_DATA;
const {EQUIP,PATTERNS,MAIN_PATTERNS,ACC_PATTERNS,EXERCISES,GOAL_TYPES,PRT_CARDIO} = D;

/* ---------- utils ---------- */
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const pad = n => String(n).padStart(2,'0');
const ymd = d => { d=d?new Date(d):new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const parseYmd = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const daysBetween = (a,b) => Math.round((parseYmd(b)-parseYmd(a))/864e5);
const addDays = (s,n) => { const d=parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); };
const weekStart = s => { const d=parseYmd(s); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return ymd(d); }; // Monday
const fmtSec = s => { if(s==null||isNaN(s)) return '–'; s=Math.round(s); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return h? h+':'+pad(m)+':'+pad(x) : m+':'+pad(x); };
const parseTime = t => { if(t==null||t==='') return null; if(typeof t==='number') return t; const p=String(t).trim().split(':').map(Number); if(p.some(isNaN)) return null; return p.reduce((a,b)=>a*60+b,0); };
const r1 = x => Math.round(x*10)/10;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ---------- state ---------- */
const ALL_TAGS = EQUIP.map(e=>e[0]);
function defaultState(){
  return {
    schema:1, created:new Date().toISOString(),
    settings:{units:'lb', formula:'epley', defaultTier:45, defaultEq:'eq_base', cardioPref:'run', lastBackup:null, restMult:1},
    goals:[],
    equipmentSets:[
      {id:'eq_base', name:'Base gym', items:ALL_TAGS.slice(), dbMax:120, kbMax:88},
      {id:'eq_hotel', name:'Hotel gym', items:['dumbbell','bench','treadmill','bike','elliptical','cable','outdoor'], dbMax:50, kbMax:0},
      {id:'eq_home', name:'Home gym', items:['dumbbell','bench','pullup','bands','kettlebell','handgrip','jumprope','outdoor'], dbMax:50, kbMax:53},
      {id:'eq_none', name:'None / bodyweight', items:['outdoor'], dbMax:0, kbMax:0}
    ],
    customExercises:[], workouts:[], bp:[], body:[], prt:[], active:null
  };
}
function migrate(s){
  const d=defaultState();
  if(!s||typeof s!=='object') return d;
  for(const k of Object.keys(d)) if(s[k]===undefined) s[k]=d[k];
  s.settings=Object.assign({},d.settings,s.settings||{});
  return s;
}
function exMap(state){ const m={}; for(const e of EXERCISES) m[e.id]=e; for(const e of (state.customExercises||[])) m[e.id]=e; return m; }
function allEx(state){ return EXERCISES.concat(state.customExercises||[]); }
function feasible(ex, eq){ return !!eq && (ex.eq||[]).every(t=>eq.items.includes(t)); }
function eqById(state,id){ return state.equipmentSets.find(e=>e.id===id) || state.equipmentSets[0]; }

/* ---------- 1RM ---------- */
const epley = (w,r) => r<=0?0: r===1? w : w*(1+r/30);
const brzycki = (w,r) => r<=0||r>=37?0: r===1? w : w*36/(37-r);
function e1rm(w,r,f){ return f==='brzycki'? brzycki(w,r) : epley(w,r); }
const E1RM_MAX_REPS = 12;

/* ---------- history index ---------- */
function finished(state){ return state.workouts.filter(w=>w.finishedAt).sort((a,b)=> (a.date+a.startedAt).localeCompare(b.date+b.startedAt)); }
function buildIndex(state, excludeId){
  const byEx={}, patLast={}, M=exMap(state);
  const ws=finished(state).filter(w=>w.id!==excludeId);
  for(const w of ws) for(const it of w.items){
    if(!itemDone(it)) continue;
    (byEx[it.exId]=byEx[it.exId]||[]).unshift({date:w.date,w,it});
    const ex=M[it.exId]; if(ex && it.block!=='prtm'){ if(!patLast[ex.p]||patLast[ex.p]<w.date) patLast[ex.p]=w.date; }
    if(it.kind==='flow') patLast.mob=w.date;
  }
  return {byEx, patLast, workouts:ws};
}
function doneSets(it){ return (it.sets||[]).filter(s=>s.done); }
function itemDone(it){
  if(it.kind==='cardio') return !!(it.cardio&&it.cardio.done);
  if(it.kind==='flow') return !!it.done;
  return doneSets(it).length>0;
}
function modeWeight(sets){
  const c={}; for(const s of sets){ const k=+s.w||0; c[k]=(c[k]||0)+1; }
  let best=0,bw=0; for(const k in c){ if(c[k]>bw||(c[k]===bw&&+k>best)){best=+k;bw=c[k];} } return best;
}
const setsStr = (sets,unit) => { const w=modeWeight(sets); return sets.map(s=>s.reps).join(',')+(w?' @'+w:''); };

/* ---------- rounding / increments ---------- */
function step(units){ return units==='kg'?2.5:5; }
function roundW(w,units){ const s=step(units); return Math.max(s, Math.round(w/s)*s); }
function incFor(ex,units){ if(units==='kg') return ex.inc>=10?5:2.5; return ex.inc||5; }

/* ---------- progression ---------- */
function classify(it){
  const p=it.presc||{}; const ws=doneSets(it); const n=p.sets||ws.length;
  const lo=p.lo, hi=p.hi; const w=modeWeight(ws);
  if(ws.length<n) return {res:'miss',w,ws,why:'only '+ws.length+'/'+n+' sets'};
  if(ws.every(s=>s.reps>=hi && (+s.w||0)>=w)) return {res:'top',w,ws};
  if(ws.some(s=>s.reps<lo)) return {res:'miss',w,ws,why:'a set fell below '+lo};
  return {res:'range',w,ws};
}
function recWeighted(ctx, ex, lo, hi, nSets){
  const {idx,units}=ctx; const h=(idx.byEx[ex.id]||[]).filter(x=>doneSets(x.it).length && x.it.kind==='w');
  const u=units; let w=null, reps=Array(nSets).fill(lo), why='';
  if(!h.length){
    // estimate from another lift in the same pattern with a strength ratio
    let est=null;
    if(ex.ra){
      for(const id in idx.byEx){ const o=ctx.M[id]; if(!o||o.p!==ex.p||!o.ra||o.id===ex.id) continue;
        const last=idx.byEx[id].find(x=>x.it.kind==='w'&&doneSets(x.it).length); if(!last) continue;
        const e=Math.max(...doneSets(last.it).filter(s=>s.reps<=E1RM_MAX_REPS).map(s=>epley(+s.w||0,s.reps)),0);
        const nS=idx.byEx[id].filter(x=>x.it.kind==='w'&&doneSets(x.it).length).length;
        const dist=Math.abs(Math.log(o.ra/ex.ra))-Math.min(nS,6)*0.02; // closest strength ratio = most similar lift; more sessions = more trust
        if(e>0 && (!est||dist<est.dist)) est={o,e,date:last.date,dist};
      }
    }
    if(est){ const e=est.e*ex.ra/est.o.ra; w=roundW(e/(1+(hi+1)/30),u);
      why=`No history on ${ex.name}. Estimated from ${est.o.name} e1RM ${Math.round(est.e)} × strength ratio ${r1(ex.ra/est.o.ra)} → ${w}. Adjust if off.`; }
    else why=`No history yet — pick a weight you could lift ~${hi+2} times (RPE 7). Next time it auto-adjusts.`;
  } else {
    const last=h[0]; const lp=last.it.presc||{}; const c=classify(last.it); const lw=c.w; const d=last.date;
    if(lp.lo!=null && (lp.lo!==lo||lp.hi!==hi)){
      const e=Math.max(...c.ws.filter(s=>s.reps<=E1RM_MAX_REPS).map(s=>epley(+s.w||0,s.reps)),0)||epley(lw,lp.lo);
      w=roundW(e/(1+hi/30),u);
      why=`Rep range changed ${lp.lo}–${lp.hi} → ${lo}–${hi}. Last ${d}: ${setsStr(c.ws)}, e1RM ${Math.round(e)} → ${w}.`;
    } else if(c.res==='top'){
      const inc=incFor(ex,u); w=roundW(lw+inc,u);
      why=`Last ${d}: ${setsStr(c.ws)} — all ${c.ws.length} sets hit ${hi} → +${inc} to ${w}.`;
    } else if(c.res==='range'){
      w=lw; reps=Array.from({length:nSets},(_,i)=>{ const r=c.ws[i]?c.ws[i].reps+1:lo; return clamp(r,lo,hi); });
      why=`Last ${d}: ${setsStr(c.ws)} — in range. Keep ${w}, beat last reps (goal ${nSets}×${hi}).`;
    } else {
      let misses=0; for(const x of h){ const cx=classify(x.it); if(cx.res==='miss' && cx.w===lw) misses++; else break; }
      if(misses>=2){ w=roundW(lw*0.9,u); why=`Missed ${misses} sessions in a row at ${lw} (${c.why}) → deload 10% to ${w}, rebuild.`; }
      else { w=lw; why=`Last ${d}: ${setsStr(c.ws)} — missed (${c.why}). Repeat ${w}.`; }
    }
  }
  // dumbbell / kettlebell cap
  const cap = ex.eq.includes('dumbbell') ? ctx.eq.dbMax : ex.eq.includes('kettlebell') ? ctx.eq.kbMax : 0;
  if(w && cap && w>cap){
    const e=epley(w,lo); const rr=clamp(Math.round(30*(e/cap-1)),lo,25); const nlo=Math.max(lo,rr-3);
    why+=` ${ctx.eq.name} ${ex.eq.includes('dumbbell')?'DBs':'KBs'} top out at ${cap} → ${cap} × ${nlo}–${rr} (same effort).`;
    w=cap; lo=nlo; hi=rr; reps=Array(nSets).fill(nlo);
  }
  return {w,lo,hi,reps,why};
}
function recBW(ctx, ex, lo, hi, nSets, opts={}){
  const h=(ctx.idx.byEx[ex.id]||[]).filter(x=>doneSets(x.it).length);
  let tgt, why, add=opts.add||1;
  if(!h.length){ tgt=opts.start||lo; why=opts.startWhy||`No history yet — ${nSets}×${tgt}. Next time it auto-adjusts.`; }
  else { const it=h[0].it, ws=doneSets(it); const pt=(it.presc&&it.presc.reps)?Math.max(...it.presc.reps):lo; const n=(it.presc&&it.presc.sets)||ws.length;
    const hit = ws.length>=n && ws.every(s=>s.reps>=pt);
    if(hit){ tgt=pt+add; why=`Last ${h[0].date}: ${ws.map(s=>s.reps).join(',')} — all sets hit ${pt} → ${tgt}/set.`; }
    else { tgt=pt; why=`Last ${h[0].date}: ${ws.map(s=>s.reps).join(',')} — target ${pt} not hit on every set → repeat.`; }
  }
  return {w:0, lo:tgt, hi:tgt, reps:Array(nSets).fill(tgt), why:(opts.prefix||'')+why};
}
function recHold(ctx, ex, nSets, opts={}){
  const h=(ctx.idx.byEx[ex.id]||[]).filter(x=>doneSets(x.it).length);
  let sec, why;
  if(opts.fixed){ sec=opts.fixed; why=opts.why; }
  else if(!h.length){ sec=opts.start||ex.r[0]; why=opts.startWhy||`No history yet — ${nSets}×${fmtSec(sec)}.`; }
  else { const it=h[0].it, ws=doneSets(it); const pt=(it.presc&&it.presc.sec)||Math.min(...ws.map(s=>s.sec||0));
    const n=(it.presc&&it.presc.sets)||ws.length;
    if(ws.length>=n && ws.every(s=>(s.sec||0)>=pt)){ sec=pt+(opts.add||10); why=`Last ${h[0].date}: ${ws.map(s=>fmtSec(s.sec)).join(', ')} — all held → ${fmtSec(sec)}.`; }
    else { sec=pt; why=`Last ${h[0].date}: ${ws.map(s=>fmtSec(s.sec)).join(', ')} — not all held ${fmtSec(pt)} → repeat.`; }
  }
  return {sec, why:(opts.prefix||'')+why};
}

/* ---------- goals → domains ---------- */
const GOAL_DOMAINS = {
  prt:{cardio:.55, prtm:.45}, strength:{str:1}, hypertrophy:{str:1}, endurance:{cardio:1},
  bp:{cardio:.5, str:.3, iso:.2}, weight:{cardio:.5, str:.5}, mobility:{mob:1}, custom:{custom:1}
};
const STYLE_OF = {strength:'heavy', hypertrophy:'hyp', bp:'bp', weight:'circuit'};
const STYLE = {
  heavy:{sets:4, rest:150, label:'Strength'}, hyp:{sets:3, rest:90, label:'Hypertrophy'},
  bp:{sets:3, rest:60, label:'BP dynamic resistance (3×10)'}, circuit:{sets:3, rest:45, label:'Circuit'}
};
function rangeFor(ex, style){
  if(ex.k!=='w') return ex.r;
  if(ex.ru==='m') return ex.r;
  if(style==='heavy') return ex.r[0]<=3 ? [3,6] : [ex.r[0], Math.max(ex.r[0]+3,8)];
  if(style==='hyp') return ex.r[0]>=10 ? ex.r : [8,12];
  if(style==='bp') return [10,12];
  return ex.r[0]>=12 ? ex.r : [10,15];
}
function domainWeights(goals){
  const W={str:0,cardio:0,prtm:0,iso:0,mob:0,custom:0}; let tot=0;
  for(const g of goals){ const p=+g.priority||3; tot+=p; const dm=GOAL_DOMAINS[g.type]||{}; for(const d in dm) W[d]+=p*dm[d]; }
  if(tot) for(const d in W) W[d]/=tot;
  return W;
}

/* ---------- weekly counters ---------- */
function weekCounters(state, date){
  const ws=weekStart(date); let aerobicMin=0, isoSessions=0, sessions=0;
  for(const w of finished(state)){ if(w.date<ws||w.date>date) continue; sessions++;
    let iso=false; for(const it of w.items){ if(it.kind==='cardio'&&it.cardio&&it.cardio.done) aerobicMin+=+it.cardio.min||0; if(it.block==='iso'&&doneSets(it).length) iso=true; }
    if(iso) isoSessions++; }
  return {aerobicMin, isoSessions, sessions};
}

/* ---------- generator ---------- */
function pickExercise(ctx, pattern, exclude=[]){
  const c=allEx(ctx.state).filter(e=>e.p===pattern && feasible(e,ctx.eq) && !exclude.includes(e.id));
  if(!c.length) return null;
  c.sort((a,b)=>a.rk-b.rk);
  const best=c[0];
  // stick with the most recently used feasible variant if it's close in preference
  let recent=null; for(const e of c){ const h=ctx.idx.byEx[e.id]; if(h&&h.length&&(!recent||h[0].date>recent.d)) recent={e,d:h[0].date}; }
  let pick = recent && recent.e.rk<=best.rk+2 ? recent.e : best;
  // substitution note: preferred lift (most logged in pattern) not available
  let note='';
  const all=allEx(ctx.state).filter(e=>e.p===pattern);
  let fav=null; for(const e of all){ const n=(ctx.idx.byEx[e.id]||[]).length; if(n&&(!fav||n>fav.n)) fav={e,n}; }
  if(fav && fav.e.id!==pick.id && !feasible(fav.e,ctx.eq)) note=`${fav.e.name} needs ${fav.e.eq.filter(t=>!ctx.eq.items.includes(t)).join(', ')} (not in ${ctx.eq.name}) → ${pick.name}. `;
  else if(!fav && pick.rk>3){ const ideal=all.sort((a,b)=>a.rk-b.rk)[0]; if(ideal&&ideal.id!==pick.id) note=`${ideal.name} not possible with ${ctx.eq.name} → ${pick.name}. `; }
  return {ex:pick, note};
}
function strengthItem(ctx, ex, style, block, note, setsOverride){
  const st=STYLE[style]; const [lo,hi]=rangeFor(ex,style); const n=setsOverride||st.sets;
  const rest=Math.round(st.rest*ctx.restMult/15)*15;
  let presc, kind=ex.k;
  if(ex.k==='w'){ const r=recWeighted(ctx,ex,lo,hi,n); presc={sets:n, lo:r.lo, hi:r.hi, w:r.w, reps:r.reps, why:note+r.why, style}; }
  else if(ex.k==='bw'){ const r=recBW(ctx,ex,lo,hi,n); presc={sets:n, lo:r.lo, hi:r.hi, w:0, reps:r.reps, why:note+r.why, style}; }
  else if(ex.k==='hold'){ const r=recHold(ctx,ex,n); presc={sets:n, sec:r.sec, why:note+r.why, style}; }
  else return null;
  return mkItem(ex, kind, block, presc, rest);
}
function mkItem(ex, kind, block, presc, rest){
  const sets=[]; for(let i=0;i<presc.sets;i++) sets.push(kind==='hold'||kind==='iso'? {sec:presc.sec, done:false} : {w:presc.w||0, reps:(presc.reps&&presc.reps[i])||presc.lo, rpe:'', done:false});
  const it={uid:uid(), exId:ex.id, kind:kind==='iso'?'hold':kind, block, presc, rest, sets};
  it.estMin=estItem(it); return it;
}
function estItem(it){
  if(it.kind==='cardio') return it.presc.min||20;
  if(it.kind==='flow') return Math.ceil(it.drills.reduce((a,d)=>a+d.sec+10,0)/60);
  const n=it.sets.length; let work;
  if(it.kind==='hold') work=it.presc.sec||60; else work=clamp((it.presc.hi||10)*3.5,20,60);
  let t=n*work+(n-1)*(it.rest||60)+60; if(it.presc.style==='heavy'&&it.block==='main') t+=150; // ramp-up sets
  return Math.ceil(t/60);
}
function prtGoal(state){ return state.goals.find(g=>g.active!==false&&g.type==='prt'); }
function latestPrt(state){ return state.prt.slice().sort((a,b)=>b.date.localeCompare(a.date))[0]; }
function cardioExFor(ctx, pref){
  const M=ctx.M, f=id=>M[id]&&feasible(M[id],ctx.eq);
  const map={run:['run_outdoor','run_tread'],treadmill:['run_tread','run_outdoor'],row:['row_erg'],swim500:['swim'],swim450:['swim'],swim:['swim'],bike:['bike_stat']};
  const fallback=['run_outdoor','run_tread','row_erg','bike_stat','elliptical','stair','swim','jumprope','walk_brisk'];
  const want=(map[pref]||[]); for(const id of want) if(f(id)) return {ex:M[id], note:''};
  for(const id of fallback) if(f(id)) return {ex:M[id], note: want.length? `${M[want[0]].name} not available in ${ctx.eq.name} → ${M[id].name}. `:''};
  return {ex:M.walk_brisk, note:''};
}
function cardioItem(ctx, W, maxMin){
  const st=ctx.state, goals=ctx.goals;
  // dominant cardio contributor
  const contrib={}; for(const g of goals){ const s=(GOAL_DOMAINS[g.type]||{}).cardio; if(s) contrib[g.type]=(contrib[g.type]||0)+s*(+g.priority||3); }
  const dom=Object.keys(contrib).sort((a,b)=>contrib[b]-contrib[a])[0];
  const pg=prtGoal(st);
  const pref = dom==='prt' && pg ? (pg.cardioEvent||'run') : st.settings.cardioPref;
  const {ex,note}=cardioExFor(ctx,pref);
  const hist=(ctx.idx.byEx[ex.id]||[]).filter(x=>x.it.cardio&&x.it.cardio.done);
  const lastOf = style => hist.find(x=>x.it.presc.style===style);
  let presc;
  const isRun=ex.p==='run', isRow=ex.id==='row_erg', isSwim=ex.id==='swim';
  if(dom==='prt'){
    const last=hist[0]; const style = last && last.it.presc.style==='intervals' ? 'tempo' : 'intervals';
    const goalSec = pg ? parseTime(pg.cardioTarget) : null; const lt=latestPrt(st);
    const ev=PRT_CARDIO[pg?pg.cardioEvent||'run':'run']||PRT_CARDIO.run;
    let paceTxt='', why='';
    const goalLine = goalSec? `PRT goal ${ev.label} ${fmtSec(goalSec)}`+(lt&&lt.cardioSec?`, latest test ${fmtSec(lt.cardioSec)} (${lt.date})`:'')+'. ' : 'Set a cardio target time in Goals → PRT for pace targets. ';
    if(style==='intervals'){
      const lp=lastOf('intervals'); let n=4; let whyN='Start 4 reps.';
      if(lp){ n = lp.it.cardio.asRx ? Math.min(lp.it.presc.n+1,10) : lp.it.presc.n; whyN = lp.it.cardio.asRx ? `Last intervals ${lp.date}: ${lp.it.presc.n} reps done as prescribed → ${n}.` : `Last intervals ${lp.date} not completed as prescribed → repeat ${n}.`; }
      let work, rest, unitTxt;
      if(isRun){ rest=90; unitTxt='400 m'; work=goalSec? goalSec/1.5*0.95*0.24855 : 110; paceTxt = goalSec? `${fmtSec(work)} each (${fmtSec(goalSec/1.5*0.95)}/mi, 5% faster than goal pace)` : 'hard, repeatable (RPE 8)'; }
      else if(isRow){ rest=90; unitTxt='500 m'; work=goalSec? goalSec/4-2 : 120; paceTxt = goalSec? `${fmtSec(work)} /500m (goal split ${fmtSec(goalSec/4)} − 2 s)` : 'hard, repeatable (RPE 8)'; }
      else if(isSwim){ rest=30; unitTxt='100 yd'; const evd=(pg&&pg.cardioEvent==='swim450')?4.5:5; work=goalSec? goalSec/evd-3:105; paceTxt = goalSec? `${fmtSec(work)} each (goal pace ${fmtSec(goalSec/evd)}/100 − 3 s)` : 'strong, repeatable'; }
      else { rest=60; unitTxt='2 min hard'; work=120; paceTxt='RPE 8, 1 min easy between'; }
      n=Math.max(3,n); let tot=Math.ceil((n*(work+rest))/60)+3;
      while(maxMin && tot>maxMin && n>3){ n--; tot=Math.ceil((n*(work+rest))/60)+3; }
      presc={style, n, min:tot, text:`${n} × ${unitTxt} @ ${paceTxt}; ${rest} s easy between. +3 min easy before/after.`, why:note+goalLine+whyN};
    } else {
      const lp=lastOf('tempo'); let m=15, whyM='Start 15 min.';
      if(lp){ m = lp.it.cardio.asRx ? Math.min(lp.it.presc.min+2,30) : lp.it.presc.min; whyM = lp.it.cardio.asRx ? `Last tempo ${lp.date}: ${lp.it.presc.min} min done → ${m} min.` : `Last tempo not completed → repeat ${m} min.`; }
      if(maxMin) m=Math.min(m,maxMin);
      if(isRun) paceTxt = goalSec? `${fmtSec(goalSec/1.5+30)}/mi (goal pace + 30 s)` : 'comfortably hard (RPE 6–7)';
      else if(isRow) paceTxt = goalSec? `${fmtSec(goalSec/4+8)} /500m (goal split + 8 s)` : 'comfortably hard (RPE 6–7)';
      else paceTxt='comfortably hard (RPE 6–7)';
      presc={style, min:m, text:`${m} min continuous @ ${paceTxt}.`, why:note+goalLine+whyM};
    }
  } else if(dom==='weight'){
    const last=hist[0]; const style= last && last.it.presc.style==='hiit' ? 'steady' : 'hiit';
    if(style==='hiit'){ const lp=lastOf('hiit'); let n=lp? (lp.it.cardio.asRx? Math.min(lp.it.presc.n+2,20) : lp.it.presc.n) : 8;
      let tot=n+3; if(maxMin&&tot>maxMin){ n=Math.max(5,maxMin-3); tot=n+3; }
      presc={style, n, min:tot, text:`${n} rounds: 30 s hard / 30 s easy, +3 min easy.`, why:note+(lp?`Last HIIT ${lp.date}: ${lp.it.presc.n} rounds ${lp.it.cardio.asRx?'done → +2':'not completed → repeat'}.`:'Start 8 rounds.')};
    } else presc=steadyPresc(ctx,ex,hist,note,maxMin,'Zone 2 / conversational (RPE 4–5).',30);
  } else if(dom==='bp'){
    const wc=weekCounters(st,ctx.date);
    presc=steadyPresc(ctx,ex,hist,note,maxMin,'moderate: 65–75% heart-rate reserve (RPE 4–6, can talk).',30);
    presc.why += ` BP guideline (2025 AHA/ACC): aerobic 90–150 min/wk; logged this week: ${Math.round(wc.aerobicMin)} min.`;
  } else {
    const last=hist[0]; const nSteady=hist.slice(0,2).filter(x=>x.it.presc.style==='steady').length;
    if(nSteady>=2){ const lp=lastOf('tempo'); let m=lp?(lp.it.cardio.asRx?Math.min(lp.it.presc.min+2,35):lp.it.presc.min):15; if(maxMin) m=Math.min(m,maxMin);
      presc={style:'tempo', min:m, text:`${m} min @ comfortably hard (RPE 6–7).`, why:note+'Two steady sessions in a row → tempo day. '+(lp?`Last tempo ${lp.it.presc.min} min.`:'')};
    } else presc=steadyPresc(ctx,ex,hist,note,maxMin,'Zone 2 / conversational (RPE 4–5).',30);
  }
  const it={uid:uid(), exId:ex.id, kind:'cardio', block:'cardio', presc, rest:0, cardio:{min:presc.min, dist:'', unit: ex.p==='swim'?'yd': (ex.id==='row_erg'?'m':(ctx.state.settings.units==='kg'?'km':'mi')), rpe:'', done:false, asRx:true}};
  it.estMin=presc.min; return it;
}
function steadyPresc(ctx, ex, hist, note, maxMin, intensity, start){
  const lp=hist.find(x=>x.it.presc.style==='steady'); let m=start, why=`Start ${start} min.`, pace='';
  const cap=Math.min(75, ctx.tier>=90?75:60);
  if(lp){ const lm=+lp.it.cardio.min||lp.it.presc.min; const ok=lp.it.cardio.asRx!==false && (+lp.it.cardio.rpe||5)<=7;
    m = ok ? Math.min(Math.round(lm*1.1), cap) : lm; why = ok ? `Last steady ${lp.date}: ${lm} min${lp.it.cardio.rpe?' @ RPE '+lp.it.cardio.rpe:''} → +10% = ${m} min.` : `Last steady felt hard / incomplete → repeat ${lm} min.`;
    const dist=+lp.it.cardio.dist; if(dist&&lm&&ex.p==='run'){ const p=lm*60/dist; pace=` Last pace ${fmtSec(p)}/${lp.it.cardio.unit}`+(m>=cap? ` — at duration cap, aim ${fmtSec(p*0.98)}/${lp.it.cardio.unit} (2% faster).` : ' — hold it.'); }
  }
  if(maxMin && m>maxMin){ why+=` Trimmed to ${maxMin} min to fit.`; m=maxMin; }
  return {style:'steady', min:m, text:`${m} min steady @ ${intensity}`, why:note+why+pace};
}
function flowItem(ctx, minutes){
  const pool=allEx(ctx.state).filter(e=>e.p==='mob'&&feasible(e,ctx.eq));
  const nPast=ctx.idx.workouts.filter(w=>w.items.some(i=>i.kind==='flow')).length;
  const drills=[]; let t=0; let i=(nPast*2)%pool.length;
  while(t<minutes*60 && drills.length<pool.length){ const e=pool[i%pool.length]; drills.push({exId:e.id, sec:e.r[0]}); t+=e.r[0]+10; i++; }
  const it={uid:uid(), exId:'mob_flow', kind:'flow', block:'mob', presc:{why:`Rotates through ${pool.length} drills (session #${nPast+1}).`}, drills, done:false};
  it.estMin=estItem(it); return it;
}
function generate(state, opts={}){
  const tier=+opts.tier||state.settings.defaultTier||45;
  const eq=eqById(state, opts.eqId||state.settings.defaultEq);
  const date=opts.date||ymd();
  const goals=state.goals.filter(g=>g.active!==false);
  const usedGoals = goals.length? goals : [{type:'strength',priority:3},{type:'endurance',priority:2}];
  const idx=opts.idx||buildIndex(state);
  const restMult = (tier<=15?0.5: tier<=30?0.75:1) * (state.settings.restMult||1);
  const ctx={state,eq,idx,M:exMap(state),units:state.settings.units,tier,date,restMult,goals:usedGoals};
  const W=domainWeights(usedGoals);
  const warm = tier<=15?2: tier<=30?4:6;
  const avail=tier-warm;
  const styleW={}; for(const g of usedGoals){ const s=STYLE_OF[g.type]; if(s){ const share=(GOAL_DOMAINS[g.type].str||0)*(+g.priority||3); styleW[s]=(styleW[s]||0)+share; } }
  const styles=Object.keys(styleW).sort((a,b)=>styleW[b]-styleW[a]);
  const notes=[]; if(!goals.length) notes.push('No goals set — using a default strength + cardio blend. Add goals in the Goals tab.');
  const wc=weekCounters(state,date);
  const pg=prtGoal(state); const lt=latestPrt(state);

  // candidate blocks
  const cands=[];
  const stale = p => { const d=idx.patLast[p]; return d? daysBetween(d,date) : 30; };
  if(W.str>0){
    const mains=MAIN_PATTERNS.slice().sort((a,b)=>stale(b)-stale(a)||MAIN_PATTERNS.indexOf(a)-MAIN_PATTERNS.indexOf(b));
    for(const p of mains) cands.push({d:'str', type:'main', p, imp:1+Math.min(.5,stale(p)/14)});
    const accImp = 0.35 + 0.4*((styleW.hyp||0)/(Object.values(styleW).reduce((a,b)=>a+b,0)||1));
    for(const p of ACC_PATTERNS) cands.push({d:'str', type:'acc', p, imp:accImp*(p==='core'?1.1:1)*(1+Math.min(.3,stale(p)/30))});
  }
  if(W.cardio>0) cands.push({d:'cardio', type:'cardio', imp:1.5});
  if(W.prtm>0){ cands.push({d:'prtm', type:'pushup', imp:1.2}); cands.push({d:'prtm', type:'plank', imp:1.1}); }
  if(W.iso>0) cands.push({d:'iso', type:'iso', imp: wc.isoSessions>=3?0.4:2.2});
  if(W.mob>0) cands.push({d:'mob', type:'flow', imp:1.0});
  for(const g of usedGoals.filter(g=>g.type==='custom')) for(const id of (g.exIds||[])) if(ctx.M[id]&&feasible(ctx.M[id],eq)) cands.push({d:'custom', type:'custom', exId:id, imp:1, g});

  const chosen=[]; const cnt={}; const usedD={}; let used=0; const usedEx=[];
  const build = c => {
    if(c.type==='main'||c.type==='acc'){
      const pk=pickExercise(ctx,c.p,usedEx); if(!pk) return null;
      if(prtGoal(state) && pk.ex.id==='plank') return null;
      const nMain=chosen.filter(x=>x.c.type==='main').length;
      let style;
      if(c.type==='main') style = styles[0]==='heavy'||styleW.heavy ? (nMain<2||styles.length===1? 'heavy' : styles.find(s=>s!=='heavy')) : styles[0];
      else style = styleW.hyp? 'hyp' : (styles.find(s=>s!=='heavy')||'hyp');
      style=style||'hyp';
      return strengthItem(ctx, pk.ex, style, c.type==='main'?'main':'acc', pk.note);
    }
    if(c.type==='cardio') return cardioItem(ctx, W, Math.max(8, Math.round(W.cardio*avail*1.1)));
    if(c.type==='pushup'){
      const ex=ctx.M.pushup; const base = lt&&lt.pushups ? Math.max(5,Math.round(lt.pushups*0.5)) : 12;
      const tgt=pg&&pg.pushupsTarget? ` (goal ${pg.pushupsTarget} in 2 min)`:'';
      const r=recBW(ctx,ex,base,base,4,{add:2,start:base,startWhy:lt&&lt.pushups?`Start at 50% of latest test (${lt.pushups} on ${lt.date}) → 4×${base}.`:`No test logged — start 4×${base}. Log a PRT test in Log → PRT.`, prefix:`PRT push-ups${tgt}: `});
      return mkItem(ex,'bw','prtm',{sets:4,lo:r.lo,hi:r.hi,w:0,reps:r.reps,why:r.why,style:'prt'}, Math.round(60*restMult/15)*15||30);
    }
    if(c.type==='plank'){
      const ex=ctx.M.plank; const base = lt&&lt.plankSec ? Math.max(30,Math.round(lt.plankSec*0.6/5)*5) : 60;
      const tgt=pg&&pg.plankTarget? ` (goal ${pg.plankTarget})`:'';
      const r=recHold(ctx,ex,3,{start:base,startWhy:lt&&lt.plankSec?`Start at 60% of latest test (${fmtSec(lt.plankSec)}) → 3×${fmtSec(base)}.`:`No test logged — start 3×${fmtSec(base)}.`, prefix:`PRT plank${tgt}: `});
      return mkItem(ex,'hold','prtm',{sets:3,sec:r.sec,why:r.why,style:'prt'}, Math.round(60*restMult/15)*15||30);
    }
    if(c.type==='iso'){
      const hg=ctx.M.iso_handgrip, useHg=feasible(hg,eq); const ex=useHg?hg:ctx.M.iso_wallsit;
      const why=(useHg?'':`No handgrip trainer in ${eq.name} → wall sit (isometric alternative; the guideline example is handgrip). `)+
        `2025 AHA/ACC BP guideline: isometric 4 × 2 min, 1 min rest, 30–40% of max effort, 3 sessions/wk. This week: ${wc.isoSessions} done.`;
      return mkItem(ex,'iso','iso',{sets:4,sec:120,why,style:'iso'},60);
    }
    if(c.type==='flow') return flowItem(ctx, tier>=60?10:6);
    if(c.type==='custom'){ const ex=ctx.M[c.exId]; const st=c.g.style||'hyp';
      if(ex.k==='cardio'){ const it={uid:uid(),exId:ex.id,kind:'cardio',block:'custom',presc:{style:'steady',min:20,text:'20 min @ your choice of intensity',why:`Custom goal "${c.g.name||'Custom'}".`},rest:0,cardio:{min:20,dist:'',unit:'mi',rpe:'',done:false,asRx:true}}; it.estMin=20; return it; }
      if(ex.k==='mob'){ const it={uid:uid(),exId:'mob_flow',kind:'flow',block:'custom',presc:{why:`Custom goal "${c.g.name||'Custom'}".`},drills:[{exId:ex.id,sec:ex.r[0]}],done:false}; it.estMin=estItem(it); return it; }
      const it=strengthItem(ctx,ex,st,'custom',`Custom goal "${c.g.name||'Custom'}". `); return it; }
    return null;
  };
  const minTime = it => {
    if(it.kind==='cardio') return Math.min(it.estMin, 8);
    if(it.kind==='flow') return it.estMin;
    const n=it.sets.length; if(n<=2) return it.estMin;
    const t1=estItem(Object.assign({},it,{sets:it.sets.slice(0,2)})); return t1;
  };
  // greedy selection
  let guard=0;
  while(guard++<40){
    let best=null, bestS=-1;
    for(const c of cands){ if(c.taken||c.dead||!W[c.d]) continue; const s=c.imp*(W[c.d]-(usedD[c.d]||0)/avail+0.08); if(s>bestS){bestS=s;best=c;} }
    if(!best||bestS<=0) break;
    const it=build(best); if(!it){ best.dead=true; continue; }
    const rem=avail-used;
    if(it.estMin<=rem){ chosen.push({c:best,it}); used+=it.estMin; usedD[best.d]=(usedD[best.d]||0)+it.estMin; best.taken=true; cnt[best.d]=(cnt[best.d]||0)+1; usedEx.push(it.exId); continue; }
    // try shrinking
    if(it.kind==='cardio' && rem>=8){ const it2=cardioItem(ctx,W,rem); if(it2.estMin<=rem){ chosen.push({c:best,it:it2}); used+=it2.estMin; usedD[best.d]=(usedD[best.d]||0)+it2.estMin; best.taken=true; cnt[best.d]=(cnt[best.d]||0)+1; continue; } }
    if(it.kind!=='cardio'&&it.kind!=='flow'){
      while(it.sets.length>2 && estItem(it)>rem){ it.sets.pop(); it.presc.sets=it.sets.length; if(it.presc.reps) it.presc.reps=it.presc.reps.slice(0,it.sets.length); }
      it.estMin=estItem(it);
      if(it.estMin<=rem){ it.presc.why+=` (Trimmed to ${it.sets.length} sets to fit ${tier} min.)`; chosen.push({c:best,it}); used+=it.estMin; usedD[best.d]=(usedD[best.d]||0)+it.estMin; best.taken=true; cnt[best.d]=(cnt[best.d]||0)+1; usedEx.push(it.exId); continue; }
    }
    best.dead=true;
  }
  // leftover: lengthen flexible cardio
  const card=chosen.find(x=>x.it.kind==='cardio'&&x.it.presc.style==='steady');
  if(card && avail-used>=3){ const add=Math.min(avail-used, Math.max(0,(ctx.tier>=90?75:60)-card.it.presc.min)); if(add>=3){ card.it.presc.min+=add; card.it.estMin+=add; card.it.cardio.min=card.it.presc.min; card.it.presc.text=card.it.presc.text.replace(/^\d+ min/, card.it.presc.min+' min'); card.it.presc.why+=` +${add} min to use the remaining time.`; used+=add; } }
  const order={main:0,acc:1,custom:2,prtm:3,cardio:4,iso:5,mob:6};
  chosen.sort((a,b)=>order[a.it.block]-order[b.it.block]);
  const items=chosen.map(x=>x.it);
  // time split summary
  const byD={}; for(const x of chosen){ byD[x.c.d]=(byD[x.c.d]||0)+x.it.estMin; }
  const DN={str:'Strength',cardio:'Cardio',prtm:'PRT push-up/plank',iso:'BP isometric',mob:'Mobility',custom:'Custom'};
  const split=Object.keys(byD).map(d=>`${DN[d]} ${byD[d]}m`).join(' · ');
  const goalTxt=usedGoals.map(g=>(g.name||GOAL_TYPES[g.type].label)+' ×'+(g.priority||3)).join(', ');
  return {id:uid(), date, tier, eqId:eq.id, eqName:eq.name, goals:goalTxt, warmMin:warm, estMin:warm+used,
    split, notes, items, startedAt:null, finishedAt:null, note:''};
}

/* ---------- swap ---------- */
function alternatives(state, item, eqId){
  const eq=eqById(state,eqId); const M=exMap(state); const ex=M[item.exId]; if(!ex) return [];
  return allEx(state).filter(e=>e.p===ex.p && e.id!==ex.id && feasible(e,eq)).sort((a,b)=>a.rk-b.rk);
}
function swapItem(state, w, item, newId){
  const idx=buildIndex(state,w.id); const eq=eqById(state,w.eqId); const M=exMap(state);
  const ctx={state,eq,idx,M,units:state.settings.units,tier:w.tier,date:w.date,restMult:1,goals:state.goals};
  const ex=M[newId]; const style=(item.presc&&item.presc.style)||'hyp';
  let it;
  if(item.kind==='cardio'){ it=JSON.parse(JSON.stringify(item)); it.exId=newId; it.uid=uid(); it.presc.why='Swapped. '+it.presc.why; }
  else if(['heavy','hyp','bp','circuit'].includes(style)) it=strengthItem(ctx,ex,style,item.block,'Swapped. ',item.sets.length);
  else it=strengthItem(ctx,ex,'hyp',item.block,'Swapped. ',item.sets.length);
  return it;
}
function addItem(state, w, exId){
  const idx=buildIndex(state,w.id); const eq=eqById(state,w.eqId); const M=exMap(state); const ex=M[exId];
  const ctx={state,eq:{...eq,items:ALL_TAGS},idx,M,units:state.settings.units,tier:w.tier||60,date:w.date,restMult:1,goals:state.goals};
  if(ex.k==='cardio'){ const it={uid:uid(),exId,kind:'cardio',block:'cardio',presc:{style:'steady',min:20,text:'Log time / distance',why:'Added manually.'},rest:0,cardio:{min:'',dist:'',unit:ex.p==='swim'?'yd':(ex.id==='row_erg'?'m':(state.settings.units==='kg'?'km':'mi')),rpe:'',done:false,asRx:true}}; it.estMin=20; return it; }
  if(ex.k==='mob'){ const it={uid:uid(),exId:'mob_flow',kind:'flow',block:'mob',presc:{why:'Added manually.'},drills:[{exId,sec:ex.r[0]}],done:false}; it.estMin=estItem(it); return it; }
  if(ex.k==='iso') return mkItem(ex,'iso','iso',{sets:4,sec:120,why:'Added manually. Guideline protocol 4 × 2 min, 1 min rest.',style:'iso'},60);
  return strengthItem(ctx,ex,'hyp','acc','Added manually. ');
}

/* ---------- stats ---------- */
function workSetsFlat(state){
  const M=exMap(state), out=[];
  for(const w of finished(state)) for(const it of w.items){ const ex=M[it.exId]; if(!ex) continue;
    if(it.kind==='w'||it.kind==='bw'||it.kind==='hold') doneSets(it).forEach((s,i)=>out.push({date:w.date,wid:w.id,exId:it.exId,ex,kind:it.kind,n:i+1,w:+s.w||0,reps:+s.reps||0,sec:+s.sec||0,rpe:s.rpe})); }
  return out;
}
function prs(state){
  const f=state.settings.formula; const res={};
  for(const s of workSetsFlat(state)){
    const r=res[s.exId]=res[s.exId]||{ex:s.ex, kind:s.kind, best:{}, sessions:{}};
    if(s.kind==='w'){
      if(s.ex.ru!=='m' && s.reps>0 && s.reps<=E1RM_MAX_REPS){ const e=e1rm(s.w,s.reps,f); if(!r.best.e1rm||e>r.best.e1rm.v) r.best.e1rm={v:e,w:s.w,reps:s.reps,date:s.date}; }
      if(!r.best.weight||s.w>r.best.weight.v||(s.w===r.best.weight.v&&s.reps>r.best.weight.reps)) r.best.weight={v:s.w,reps:s.reps,date:s.date};
      const vol=s.w*s.reps; if(!r.best.setVol||vol>r.best.setVol.v) r.best.setVol={v:vol,w:s.w,reps:s.reps,date:s.date};
      r.sessions[s.wid]=(r.sessions[s.wid]||{v:0,date:s.date}); r.sessions[s.wid].v+=vol;
    }
    if(s.kind==='w'||s.kind==='bw'){ if(!r.best.reps||s.reps>r.best.reps.v) r.best.reps={v:s.reps,w:s.w,date:s.date}; }
    if(s.kind==='hold'){ if(!r.best.hold||s.sec>r.best.hold.v) r.best.hold={v:s.sec,date:s.date}; }
  }
  for(const id in res){ const r=res[id]; let b=null; for(const k in r.sessions){ if(!b||r.sessions[k].v>b.v) b=r.sessions[k]; } if(b) r.best.sessVol=b; delete r.sessions; }
  return res;
}
function e1rmSeries(state, exId){
  const by={};
  for(const s of workSetsFlat(state)) if(s.exId===exId && s.kind==='w' && s.reps>0 && s.reps<=E1RM_MAX_REPS){
    const a=epley(s.w,s.reps), b=brzycki(s.w,s.reps); const o=by[s.date]=by[s.date]||{date:s.date,epley:0,brzycki:0,top:null};
    if(a>o.epley){o.epley=a; o.top=s;} if(b>o.brzycki) o.brzycki=b; }
  return Object.values(by).sort((a,b)=>a.date.localeCompare(b.date));
}
function weeklyMuscle(state, weeks=8, today){
  today=today||ymd(); const ws0=addDays(weekStart(today),-7*(weeks-1)); const out={};
  for(let i=0;i<weeks;i++) out[addDays(ws0,7*i)]={};
  for(const s of workSetsFlat(state)){ const wk=weekStart(s.date); if(!out[wk]) continue;
    s.ex.m.forEach((m,i)=>{ out[wk][m]=(out[wk][m]||0)+(i===0?1:0.5); }); }
  return out;
}
function frequency(state, weeks=8, today){
  today=today||ymd(); const ws=finished(state); const per={}; const ws0=addDays(weekStart(today),-7*(weeks-1));
  for(let i=0;i<weeks;i++) per[addDays(ws0,7*i)]=0;
  for(const w of ws){ const k=weekStart(w.date); if(k in per) per[k]++; }
  // week streak: consecutive weeks (ending this or last week) with ≥1 workout
  const set=new Set(ws.map(w=>weekStart(w.date))); let wk=weekStart(today); if(!set.has(wk)) wk=addDays(wk,-7);
  let weekStreak=0; while(set.has(wk)){ weekStreak++; wk=addDays(wk,-7); }
  const days=new Set(ws.map(w=>w.date)); let d=today; if(!days.has(d)) d=addDays(d,-1); let dayStreak=0; while(days.has(d)){ dayStreak++; d=addDays(d,-1); }
  const last28=ws.filter(w=>daysBetween(w.date,today)<28).length;
  return {per, weekStreak, dayStreak, total:ws.length, perWeek4:r1(last28/4), first:ws[0]&&ws[0].date, last:ws.length&&ws[ws.length-1].date};
}
function avg(a){ return a.length? a.reduce((x,y)=>x+y,0)/a.length : null; }
function bpSummary(state, today){
  today=today||ymd(); const b=state.bp.slice().sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time));
  const win=n=>b.filter(r=>daysBetween(r.date,today)<n && daysBetween(r.date,today)>=0);
  const A=rs=>rs.length?{sys:Math.round(avg(rs.map(r=>+r.sys))),dia:Math.round(avg(rs.map(r=>+r.dia))),n:rs.length}:null;
  return {latest:b[b.length-1], d7:A(win(7)), d30:A(win(30)), first30:A(b.filter(r=>b.length&&daysBetween(b[0].date,r.date)<30)), all:b};
}
function movingAvg(pts, n=7){ return pts.map((p,i)=>{ const w=pts.filter(q=>daysBetween(q.x,p.x)>=0&&daysBetween(q.x,p.x)<n); return {x:p.x,y:avg(w.map(q=>q.y))}; }); }
function newPRs(state, w){
  // compare this workout's sets with history before it
  const before={...state, workouts:state.workouts.filter(x=>x.id!==w.id && x.finishedAt && (x.date+x.startedAt)<(w.date+w.startedAt))};
  const P=prs(before); const f=state.settings.formula; const M=exMap(state); const out=[];
  for(const it of w.items){ const ex=M[it.exId]; if(!ex) continue; const p=(P[it.exId]||{}).best||{};
    const ds=doneSets(it); if(!ds.length) continue;
    if(it.kind==='w'){ let be=0,bs=null; for(const s of ds){ if(s.reps<=E1RM_MAX_REPS&&ex.ru!=='m'){ const e=e1rm(+s.w,+s.reps,f); if(e>be){be=e;bs=s;} } }
      if(be && (!p.e1rm || be>p.e1rm.v+0.01)) out.push(`${ex.name}: e1RM ${Math.round(be)} (${bs.w}×${bs.reps})`+(p.e1rm?` — was ${Math.round(p.e1rm.v)}`:' — first'));
      const mw=Math.max(...ds.map(s=>+s.w||0)); if(p.weight && mw>p.weight.v) out.push(`${ex.name}: heaviest ${mw} — was ${p.weight.v}`); }
    if(it.kind==='bw'){ const mr=Math.max(...ds.map(s=>+s.reps||0)); if(p.reps && mr>p.reps.v) out.push(`${ex.name}: ${mr} reps — was ${p.reps.v}`); }
    if(it.kind==='hold'){ const ms=Math.max(...ds.map(s=>+s.sec||0)); if(p.hold && ms>p.hold.v) out.push(`${ex.name}: ${fmtSec(ms)} — was ${fmtSec(p.hold.v)}`); }
  }
  return out;
}

/* ---------- export ---------- */
function exName(M,id){ return id==='mob_flow'?'Mobility flow':(M[id]?M[id].name:id); }
function goalLine(g){
  const t=GOAL_TYPES[g.type]?GOAL_TYPES[g.type].label:g.type; const parts=[];
  if(g.type==='prt'){ if(g.testDate) parts.push('test '+g.testDate); if(g.pushupsTarget) parts.push('push-ups '+g.pushupsTarget); if(g.plankTarget) parts.push('plank '+g.plankTarget); parts.push('cardio: '+(PRT_CARDIO[g.cardioEvent||'run']||{}).label+(g.cardioTarget?' '+g.cardioTarget:'')); }
  if(g.type==='strength'||g.type==='hypertrophy'){ if(g.targets) parts.push(g.targets); }
  if(g.type==='bp'&&(g.sysTarget||g.diaTarget)) parts.push(`target < ${g.sysTarget||'?'}/${g.diaTarget||'?'}`);
  if(g.type==='weight'&&g.weightTarget) parts.push('target weight '+g.weightTarget);
  if(g.type==='endurance'&&g.targets) parts.push(g.targets);
  if(g.type==='custom'&&g.exIds&&g.exIds.length) parts.push('exercises: '+g.exIds.length);
  if(g.notes) parts.push(g.notes);
  return `${g.name||t} [${t}] — priority ${g.priority||3}/5${g.active===false?' (paused)':''}${parts.length?' — '+parts.join('; '):''}`;
}
function itemLine(M, it, units, f){
  const name=exName(M,it.exId);
  if(it.kind==='cardio'){ const c=it.cardio||{}; return `  ${name}: ${c.done?'':'[not done] '}${c.min?c.min+' min':''}${c.dist?', '+c.dist+' '+c.unit:''}${c.rpe?', RPE '+c.rpe:''}${c.asRx===false?' (modified)':''}   [Rx: ${it.presc.text||''}]`; }
  if(it.kind==='flow') return `  Mobility flow: ${it.done?'done':'not done'} — ${it.drills.map(d=>exName(M,d.exId)).join(', ')}`;
  const ds=doneSets(it); if(!ds.length) return `  ${name}: not done`;
  if(it.kind==='hold') return `  ${name}: ${ds.map(s=>fmtSec(s.sec)).join(', ')}`;
  if(it.kind==='bw') return `  ${name}: ${ds.map(s=>s.reps+(s.rpe?' @RPE'+s.rpe:'')).join(', ')} reps`;
  const unitLbl=(M[it.exId]&&M[it.exId].ru==='m')?' m':'';
  let best=0; ds.forEach(s=>{ if(s.reps<=E1RM_MAX_REPS&&unitLbl==='') best=Math.max(best,e1rm(+s.w,+s.reps,f)); });
  return `  ${name}: ${ds.map(s=>`${s.w}×${s.reps}${unitLbl}${s.rpe?' @RPE'+s.rpe:''}`).join(', ')}${best?`   (e1RM ${Math.round(best)})`:''}`;
}
function reportText(state, today){
  today=today||ymd(); const M=exMap(state); const u=state.settings.units; const f=state.settings.formula;
  const L=[]; const H=t=>{L.push(''); L.push(t.toUpperCase()); L.push('-'.repeat(t.length));};
  L.push('WORKOUT REPORT'); L.push('Generated '+new Date().toLocaleString()); L.push(`Units: ${u} · 1RM estimate: ${f==='brzycki'?'Brzycki':'Epley'} (both shown in Stats; sets of ≤${E1RM_MAX_REPS} reps only)`);
  H('Goals'); if(!state.goals.length) L.push('(none)'); state.goals.forEach((g,i)=>L.push(`${i+1}. ${goalLine(g)}`));
  H('Equipment sets'); state.equipmentSets.forEach(e=>L.push(`${e.name}: ${e.items.map(t=>(EQUIP.find(x=>x[0]===t)||[t,t])[1]).join(', ')||'nothing'}${e.dbMax?` · DBs to ${e.dbMax}`:''}${e.kbMax?` · KBs to ${e.kbMax}`:''}`));
  const fr=frequency(state,8,today);
  H('Summary'); L.push(`Workouts logged: ${fr.total}${fr.first?` (${fr.first} → ${fr.last})`:''}`); L.push(`Last 4 weeks: ${fr.perWeek4} workouts/week · week streak: ${fr.weekStreak} · day streak: ${fr.dayStreak}`);
  const P=prs(state); const ids=Object.keys(P).sort((a,b)=>P[a].ex.name.localeCompare(P[b].ex.name));
  H('Personal records');
  if(!ids.length) L.push('(none yet)');
  for(const id of ids){ const p=P[id], b=p.best; const parts=[];
    if(b.e1rm) parts.push(`e1RM ${Math.round(b.e1rm.v)} (${b.e1rm.w}×${b.e1rm.reps}, ${b.e1rm.date})`);
    if(b.weight&&p.kind==='w') parts.push(`heaviest ${b.weight.v}×${b.weight.reps} (${b.weight.date})`);
    if(b.reps&&p.kind==='bw') parts.push(`most reps ${b.reps.v} (${b.reps.date})`);
    if(b.setVol) parts.push(`best set ${b.setVol.w}×${b.setVol.reps}=${Math.round(b.setVol.v)} ${u}`);
    if(b.sessVol) parts.push(`best session volume ${Math.round(b.sessVol.v)} ${u} (${b.sessVol.date})`);
    if(b.hold) parts.push(`longest ${fmtSec(b.hold.v)} (${b.hold.date})`);
    L.push(`${p.ex.name}: ${parts.join(' · ')}`); }
  if(state.prt.length){ H('PRT log'); state.prt.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>L.push(`${t.date} ${t.official?'OFFICIAL':'practice'}: push-ups ${t.pushups??'–'} · plank ${fmtSec(t.plankSec)} · ${(PRT_CARDIO[t.cardioEvent||'run']||{}).label} ${fmtSec(t.cardioSec)}${t.notes?' — '+t.notes:''}`)); }
  if(state.bp.length){ const s=bpSummary(state,today); H('Blood pressure (mmHg)');
    L.push(`Latest ${s.latest.date} ${s.latest.time||''}: ${s.latest.sys}/${s.latest.dia}${s.latest.pulse?' pulse '+s.latest.pulse:''}`);
    if(s.d7) L.push(`7-day average: ${s.d7.sys}/${s.d7.dia} (${s.d7.n} readings)`); if(s.d30) L.push(`30-day average: ${s.d30.sys}/${s.d30.dia} (${s.d30.n} readings)`);
    if(s.first30) L.push(`First 30 days of log: ${s.first30.sys}/${s.first30.dia} (${s.first30.n} readings)`);
    L.push('Readings:'); s.all.forEach(r=>L.push(`  ${r.date} ${r.time||''}  ${r.sys}/${r.dia}${r.pulse?'  p'+r.pulse:''}${r.arm?'  '+r.arm+' arm':''}${r.notes?'  '+r.notes:''}`)); }
  if(state.body.length){ H(`Body weight (${u})`); state.body.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>L.push(`  ${r.date}  ${r.weight}${r.waist?'  waist '+r.waist:''}${r.bf?'  BF '+r.bf+'%':''}${r.notes?'  '+r.notes:''}`)); }
  H('Workout history (newest first)');
  const ws=finished(state).slice().reverse(); if(!ws.length) L.push('(none)');
  for(const w of ws){ const d=parseYmd(w.date); const dur = w.startedAt&&w.finishedAt ? Math.round((new Date(w.finishedAt)-new Date(w.startedAt))/60000) : null;
    L.push(''); L.push(`${w.date} ${DOW[d.getDay()]} · ${dur!=null?dur+' min actual · ':''}${w.tier?w.tier+' min plan · ':''}${w.eqName||''}`);
    if(w.goals) L.push(`  Goals: ${w.goals}`);
    for(const it of w.items) L.push(itemLine(M,it,u,f));
    if(w.note) L.push(`  Notes: ${w.note}`); }
  L.push(''); L.push('Not medical advice. BP exercise targets referenced: 2025 AHA/ACC High Blood Pressure Guideline.');
  return L.join('\n');
}
function csvEsc(v){ if(v==null) return ''; v=String(v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }
function toCsv(rows){ return rows.map(r=>r.map(csvEsc).join(',')).join('\n')+'\n'; }
function csvFiles(state){
  const M=exMap(state); const u=state.settings.units; const ws=finished(state);
  const W=[['workout_id','date','start','end','duration_min','planned_min','equipment_set','goals','notes']];
  const S=[['workout_id','date','exercise','exercise_id','pattern','set','reps','weight_'+u,'rpe','seconds','e1rm_epley','e1rm_brzycki']];
  const C=[['workout_id','date','exercise','minutes','distance','distance_unit','rpe','as_prescribed','prescription']];
  for(const w of ws){ const dur=w.startedAt&&w.finishedAt?Math.round((new Date(w.finishedAt)-new Date(w.startedAt))/60000):'';
    W.push([w.id,w.date,w.startedAt,w.finishedAt,dur,w.tier,w.eqName,w.goals,w.note]);
    for(const it of w.items){ const ex=M[it.exId];
      if(it.kind==='cardio'){ const c=it.cardio; if(c&&c.done) C.push([w.id,w.date,exName(M,it.exId),c.min,c.dist,c.unit,c.rpe,c.asRx?'yes':'no',it.presc.text]); continue; }
      if(it.kind==='flow'){ if(it.done) it.drills.forEach((d,i)=>S.push([w.id,w.date,exName(M,d.exId),d.exId,'mob',i+1,'','','',d.sec,'',''])); continue; }
      doneSets(it).forEach((s,i)=>{ const ok=it.kind==='w'&&s.reps<=E1RM_MAX_REPS&&ex&&ex.ru!=='m';
        S.push([w.id,w.date,exName(M,it.exId),it.exId,ex?ex.p:'',i+1,it.kind==='hold'?'':s.reps,it.kind==='w'?s.w:'',s.rpe||'',it.kind==='hold'?s.sec:'',ok?r1(epley(+s.w,+s.reps)):'',ok?r1(brzycki(+s.w,+s.reps)):'']); }); } }
  const B=[['date','time','systolic','diastolic','pulse','arm','notes']]; state.bp.slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).forEach(r=>B.push([r.date,r.time,r.sys,r.dia,r.pulse,r.arm,r.notes]));
  const BW=[['date','weight_'+u,'waist','bodyfat_pct','notes']]; state.body.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>BW.push([r.date,r.weight,r.waist,r.bf,r.notes]));
  const PT=[['date','official','pushups','plank_mmss','plank_sec','cardio_event','cardio_mmss','cardio_sec','notes']]; state.prt.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>PT.push([r.date,r.official?'yes':'no',r.pushups,fmtSec(r.plankSec),r.plankSec,(PRT_CARDIO[r.cardioEvent||'run']||{}).label,fmtSec(r.cardioSec),r.cardioSec,r.notes]));
  return {'workouts.csv':toCsv(W),'sets.csv':toCsv(S),'cardio.csv':toCsv(C),'blood_pressure.csv':toCsv(B),'body_weight.csv':toCsv(BW),'prt_tests.csv':toCsv(PT)};
}
function backupJson(state){ return JSON.stringify({app:'workout-pwa', schema:1, exportedAt:new Date().toISOString(), state}, null, 1); }
function parseBackup(text){ const o=JSON.parse(text); const s=o&&o.app==='workout-pwa'?o.state:o; if(!s||!Array.isArray(s.workouts)||!Array.isArray(s.goals)) throw new Error('Not a workout backup file'); return migrate(s); }

/* ---------- simulation (demo data + tests) ---------- */
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function simulate(state, opts={}){
  const R=rng(opts.seed||7); const weeks=opts.weeks||8; const end=opts.end||ymd(); const start=addDays(weekStart(end),-7*weeks);
  const M=exMap(state);
  const true1={back_squat:275,front_squat:220,deadlift:335,rdl:250,bench:225,incline_bench:185,ohp:140,bb_row:185,hip_thrust:300,leg_press:480,cable_row:190,lat_pulldown:180,db_bench:90,incline_db:75,seated_db_press:60,standing_db_press:55,db_row:90,cs_db_row:70,db_bent_row:70,bulgarian:55,db_walk_lunge:55,db_rdl:90,db_goblet_squat:95,db_floor_press:80,lat_raise:30,face_pull:70,cable_lat_raise:25,db_curl:45,bb_curl:100,hammer_curl:50,pushdown:90,oh_db_ext:60,leg_ext:200,leg_curl:160,calf_raise_db:80,cable_fly:50,cable_crunch:120,pallof_cable:60,farmer_db:120,machine_chest:220,machine_row:200,db_stepup:55,kb_swing:80,cable_curl:70,rear_delt_fly:30};
  const bwCap={pushup:40,pullup:12,chinup:13,dips:18,inverted_row:15,door_row:20,pike_pushup:15,glute_bridge:30,bw_squat:40,rev_lunge:20,burpee:15,dead_bug:15,hanging_knee:15,ab_wheel:12,decline_pushup:28,diamond_pushup:22,calf_raise_bw:22,split_squat:20,band_pull_apart:25,ytw:12,bench_dip:25,band_row:25,trx_row:18,mtn_climber:40,jump_squat:15,jump_lunge:16,sl_glute_bridge:18,bird_dog:15,band_curl:20,band_pulldown:20,pallof_band:15};
  const holdCap={plank:120,side_plank:60,hollow_hold:45,iso_handgrip:120,iso_wallsit:120};
  const days=opts.days||[1,3,5,6]; // Mon Wed Fri Sat
  const tiers=[45,60,30,90,15]; let n=0; let bpBase=[138,88], bw=205;
  for(let d=start; d<=end; d=addDays(d,1)){
    const dow=parseYmd(d).getDay();
    // BP most mornings
    if(R()<0.8){ const k=daysBetween(start,d)/(weeks*7); state.bp.push({id:uid(),date:d,time:'06:'+pad(Math.floor(R()*50)+10),sys:Math.round(bpBase[0]-9*k+(R()-.5)*8),dia:Math.round(bpBase[1]-6*k+(R()-.5)*6),pulse:Math.round(64-4*k+(R()-.5)*6),arm:'L',notes:''}); }
    if(dow===0||dow===3){ bw=r1(bw-0.35+(R()-.5)*1.2); state.body.push({id:uid(),date:d,weight:bw,waist:'',bf:'',notes:''}); }
    if(!days.includes(dow)) continue;
    const week=Math.floor(daysBetween(start,d)/7);
    const eqId = week===3? 'eq_hotel' : (dow===6? 'eq_home':'eq_base');
    const tier = tiers[n%tiers.length]; n++;
    const w=generate(state,{tier,eqId,date:d});
    w.startedAt=d+'T06:00:00'; w.finishedAt=d+'T06:'+pad(Math.min(59,tier))+':00';
    const prog=1+0.004*n;
    for(const it of w.items){
      const ex=M[it.exId];
      if(it.kind==='w'){ const t=(true1[it.exId]||(ex&&ex.ra?150*ex.ra:60))*prog; if(!it.presc.w){ it.presc.w=roundW(t/(1+(it.presc.hi+2)/30),'lb'); it.sets.forEach(s=>s.w=it.presc.w); }
        it.sets.forEach((s,i)=>{ const cap=Math.floor(30*(t/s.w-1))-Math.floor(i*0.6)+(R()<0.2?-1:0); s.reps=Math.max(1,Math.min(it.presc.hi, ex.ru==='m'?it.presc.hi:cap)); s.rpe=s.reps>=it.presc.hi?8:9; s.done=true; }); }
      else if(it.kind==='bw'){ const cap=(bwCap[it.exId]||15)*prog; it.sets.forEach((s,i)=>{ s.reps=Math.max(1,Math.min(s.reps, Math.floor(cap*0.85-i))); s.done=true; }); }
      else if(it.kind==='hold'){ const cap=(holdCap[it.exId]||60)*prog; it.sets.forEach(s=>{ s.sec=Math.min(s.sec, Math.round(cap)); s.done=true; }); }
      else if(it.kind==='cardio'){ it.cardio.done=true; it.cardio.asRx=R()<0.85; it.cardio.min=it.presc.min; it.cardio.rpe=it.presc.style==='steady'?5:7; if(it.exId.startsWith('run')) it.cardio.dist=r1(it.presc.min/(9.2-0.02*n)); }
      else if(it.kind==='flow') it.done=true;
    }
    state.workouts.push(w);
    if(week%3===2 && dow===6){ state.prt.push({id:uid(),date:d,official:false,pushups:Math.round(55+n*0.6),plankSec:150+n*3,cardioEvent:'run',cardioSec:Math.round(12*60+40-n*4),notes:'practice test'}); }
  }
  return state;
}
function demoGoals(){
  return [
    {id:uid(),type:'prt',name:'Navy PRT',priority:5,active:true,testDate:'2027-03-15',pushupsTarget:75,plankTarget:'3:30',cardioEvent:'run',cardioTarget:'11:30',notes:''},
    {id:uid(),type:'strength',name:'Build strength',priority:3,active:true,targets:'Bench 245, Squat 315, Deadlift 405',notes:''},
    {id:uid(),type:'bp',name:'Lower BP',priority:4,active:true,sysTarget:125,diaTarget:80,notes:''}
  ];
}

const API={uid,ymd,parseYmd,addDays,daysBetween,weekStart,fmtSec,parseTime,r1,DOW,defaultState,migrate,exMap,allEx,feasible,eqById,
  epley,brzycki,e1rm,E1RM_MAX_REPS,buildIndex,doneSets,itemDone,classify,recWeighted,recBW,recHold,generate,alternatives,swapItem,addItem,estItem,
  domainWeights,weekCounters,workSetsFlat,prs,e1rmSeries,weeklyMuscle,frequency,bpSummary,movingAvg,newPRs,reportText,csvFiles,backupJson,parseBackup,
  simulate,demoGoals,finished,goalLine,exName,ALL_TAGS,roundW};
if(typeof module!=='undefined') module.exports=API; else root.WO=API;
})(typeof window!=='undefined'?window:globalThis);
