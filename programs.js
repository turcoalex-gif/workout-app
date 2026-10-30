/* Strength program templates. Pure data + math; no DOM.
   Percentages are of the program's "base" for each lift: 1RM, training max (TM) or 5RM, as stated per program.
   set fields: reps (target), pct (fraction of base) | null (pick weight), amrap (last-set max reps, "+"), add (lb added on top; kg = lb/2),
               cap (max reps for "max reps, stop at N"), lbl (display label). */
'use strict';
(function(root){
const LIFT_EX = {squat:'back_squat', bench:'bench', deadlift:'deadlift', ohp:'ohp', row:'bb_row', incline:'incline_bench',
  clean:'power_clean', fsquat:'front_squat', sldl:'sldl', rdl:'rdl'};
const LIFT_NAME = {squat:'Squat', bench:'Bench press', deadlift:'Deadlift', ohp:'Overhead press', row:'Barbell row', incline:'Incline bench', clean:'Power clean', fsquat:'Front squat', sldl:'Stiff-leg deadlift', rdl:'Romanian deadlift'};
const UPPER = {bench:1, ohp:1, row:1, incline:1};
const S = (n, reps, pct, x) => Array.from({length:n}, () => Object.assign({reps, pct}, x||{}));
const cat = (...a) => [].concat(...a);
const I = (lift, sets, role, note) => ({lift, sets:cat(...sets), role:role||'main', note:note||''});
const A = (exId, sets, reps, note, x) => ({exId, sets:S(sets, reps, null, x), role:'assist', note:note||''});
const O = (exId, sets, reps, note) => ({exId, sets:S(sets, reps, null), role:'opt', note:note||'Optional'});
const testRamp = lift => I(lift, [S(1,3,.6,{lbl:'warm-up'}),S(1,2,.7,{lbl:'warm-up'}),S(1,1,.8),S(1,1,.875),S(1,1,.925),S(1,1,.975),S(1,1,1.0,{lbl:'attempt',test:true}),S(1,1,1.02,{lbl:'PR attempt (optional)',test:true})], 'main',
  'Work up in singles to a new 1RM. Ramp shown is this app\'s suggestion; stop when bar speed drops. Your heaviest completed single becomes the new 1RM.');

/* ---------- 3-2-1 wave loading ---------- */
function wave321(p){
  const weeks=[]; const lifts=[['squat','Day 1 · Squat'],['bench','Day 2 · Bench'],['deadlift','Day 3 · Deadlift'],['ohp','Day 4 · Press']];
  const acc={squat:[A('rdl',3,8),A('hanging_knee',3,12)], bench:[A('bb_row',3,8),A('chinup',3,8)], deadlift:[A('bulgarian',3,8),A('back_ext',3,12)], ohp:[A('chinup',3,8),A('dips',3,10)]};
  for(let w=0; w<3; w++){
    const b=.80+w*.025;
    weeks.push({label:`Week ${w+1} · waves from ${Math.round(b*1000)/10}%`, days:lifts.map(([l,lab])=>({label:lab, items:[
      I(l,[S(1,3,b,{lbl:'wave 1'}),S(1,2,b+.05,{lbl:'wave 1'}),S(1,1,b+.10,{lbl:'wave 1'}),S(1,3,b+.025,{lbl:'wave 2'}),S(1,2,b+.075,{lbl:'wave 2'}),S(1,1,b+.125,{lbl:'wave 2'})],'main',
        'Wave 2 only if every wave-1 rep was clean; otherwise stop after wave 1. Rest 3–4 min between sets.'),
      ...acc[l]]}))});
  }
  weeks.push({label:'Week 4 · deload', days:lifts.map(([l,lab])=>({label:lab, items:[I(l,[S(3,3,.70)],'main','Deload: crisp triples.'), acc[l][0]]}))});
  return weeks;
}
/* ---------- Wendler 5/3/1 ---------- */
const W531 = [[[.65,5],[.75,5],[.85,5,1]], [[.70,3],[.80,3],[.90,3,1]], [[.75,5],[.85,3],[.95,1,1]], [[.40,5],[.50,5],[.60,5]]];
function w531(p){
  const v=(p.cfg&&p.cfg.variant)||'bbb', bbbPct=+(p.cfg&&p.cfg.bbbPct)||.5;
  const days=[['ohp','Day 1 · Press','chinup',5,10],['deadlift','Day 2 · Deadlift','hanging_knee',5,15],['bench','Day 3 · Bench','db_row',5,10],['squat','Day 4 · Squat','leg_curl',5,10]];
  return W531.map((wk,wi)=>({label:['Week 1 · 5s','Week 2 · 3s','Week 3 · 5/3/1','Week 4 · deload'][wi], days:days.map(([l,lab,ax,as,ar])=>{
    const items=[I(l, wk.map(([pc,r,am])=>S(1,r,pc,am?{amrap:true}:null)), 'main', wi<3?'Last set: as many reps as possible (+), leave 1–2 in the tank.':'Deload week.')];
    if(wi<3 && v==='bbb') items.push(I(l,[S(5,10,bbbPct)],'supp',`Boring But Big: 5×10 @ ${Math.round(bbbPct*100)}% TM.`));
    if(wi<3 && v==='fsl') items.push(I(l,[S(5,5,wk[0][0])],'supp',`First Set Last: 5×5 @ first-set weight (${Math.round(wk[0][0]*100)}% TM).`));
    if(wi<3) items.push(A(ax,as,ar)); return {label:lab, items}; })}));
}
/* ---------- Smolov (full squat cycle) ---------- */
function smolov(){
  const s=(n,r,pc,add)=>S(n,r,pc,add?{add}:null);
  const base=[[4,9,.70],[5,7,.75],[7,5,.80],[10,3,.85]];
  const wk=[];
  wk.push({label:'Week 1 · Intro microcycle', days:[
    {label:'Day 1', items:[I('squat',[s(3,8,.65),s(1,5,.70),s(2,2,.75),s(1,1,.80)])]},
    {label:'Day 2', items:[I('squat',[s(3,8,.65),s(1,5,.70),s(2,2,.75),s(1,1,.80)])]},
    {label:'Day 3', items:[I('squat',[s(4,5,.70),s(1,3,.75),s(2,2,.80),s(1,1,.90)])]}]});
  wk.push({label:'Week 2 · Intro microcycle', days:[
    {label:'Day 1', items:[I('squat',[s(1,5,.80)],'main','Source also allows light accessories (lunges, plyometrics) in the intro.')]},
    {label:'Day 2', items:[I('squat',[s(1,5,.825)])]},
    {label:'Day 3', items:[I('squat',[s(1,5,.85)])]}]});
  [[0,'Week 3 · Base mesocycle'],[20,'Week 4 · Base (+20 lb / +10 kg on week 3)'],[30,'Week 5 · Base (+30 lb / +15 kg on week 3)']].forEach(([add,label])=>
    wk.push({label, days:base.map(([n,r,pc],i)=>({label:'Day '+(i+1), items:[I('squat',[s(n,r,pc,add)],'main', add?'Source: add the full amount only if the previous week felt good; keep the weight if you failed sets.':'')]}))}));
  wk.push({label:'Week 6 · Rest, then test', days:[
    {label:'Day 3 · Build to 1RM', items:[testRamp('squat')]}, {label:'Day 4 · Build to 1RM', items:[testRamp('squat')]}], note:'Days 1–2 are rest.'});
  const sw=(n,r,pc,ex,note)=>({label:'', items:[ex?A(ex,n,r,note):I('squat',[s(n,r,pc)],'main',note)]});
  for(const w of [7,8]) wk.push({label:`Week ${w} · Switching phase`, days:[
    {label:'Day 1 · Speed', items:[I('squat',[s(8,3,.55)],'main','Dynamic effort: explode out of the bottom. Source gives 50–60% of the new 1RM, no fixed sets — 8×3 is this app\'s default.')]},
    {label:'Day 2 · Box squat', items:[I('squat',[s(8,2,.60)],'main','Box squat or band work allowed per source (log as squat). Sets are this app\'s default.')]},
    {label:'Day 3 · Speed', items:[I('squat',[s(6,3,.50)],'main','Light, fast. App default sets.')]}]});
  const R=(...a)=>a.map(([n,r,pc])=>s(n,r,pc));
  const intense=[
    [R([1,3,.65],[1,4,.75],[3,4,.85],[1,5,.85]), R([1,3,.60],[1,3,.70],[1,4,.80],[1,3,.90],[2,5,.85]), R([1,4,.65],[1,4,.70],[5,4,.80])],
    [R([1,4,.60],[1,4,.70],[1,4,.80],[1,3,.90],[2,4,.90]), R([1,3,.65],[1,3,.75],[1,3,.85],[3,3,.90],[1,3,.95]), R([1,3,.65],[1,3,.75],[1,4,.85],[4,5,.90])],
    [R([1,3,.60],[1,3,.70],[1,3,.80],[5,5,.90]), R([1,3,.60],[1,3,.70],[1,3,.80],[2,3,.95]), R([1,3,.65],[1,3,.75],[1,3,.85],[4,3,.95])],
    [R([1,3,.70],[1,4,.80],[5,5,.90]), R([1,3,.70],[1,3,.80],[4,3,.95]), R([1,3,.75],[1,4,.90],[3,4,.95])]];
  intense.forEach((days,i)=>wk.push({label:`Week ${9+i} · Intense mesocycle (on new 1RM)`, days:days.map((sets,j)=>({label:'Day '+(j+1), items:[I('squat',sets,'main','Percentages of the new 1RM from week 6. Reduce the load if you keep failing reps (source).')]}))}));
  wk.push({label:'Week 13 · Taper', days:[
    {label:'Day 1', items:[I('squat',R([1,3,.70],[1,3,.80],[2,5,.90],[3,4,.95]))]},
    {label:'Day 2', items:[I('squat',R([1,4,.75],[4,4,.85]))]},
    {label:'Day 3 · Build to 1RM', items:[testRamp('squat')]}]});
  return wk;
}
/* ---------- Smolov Jr ---------- */
function smolovJr(p){
  const l=(p.cfg&&p.cfg.lift)||'squat'; const ad=(p.cfg&&p.cfg.adds)||(l==='bench'?[5,10]:[10,20]);
  const d=[[6,6,.70],[7,5,.75],[8,4,.80],[10,3,.85]];
  return [0,ad[0],ad[1]].map((add,wi)=>({label:`Week ${wi+1}`+(add?` · +${add} lb / +${add/2} kg on week 1`:''), days:d.map(([n,r,pc],i)=>({label:`Day ${i+1} · ${n}×${r}`, items:[I(l,[S(n,r,pc,add?{add}:null)],'main', wi? 'Source: add 5–10 lb (wk 2) / 10–20 lb (wk 3) over week 1; keep week-1 weights if you failed sets.' : 'Avoid extra accessory work during Smolov Jr (source).')]}))}));
}
/* ---------- Candito 6-week ---------- */
function candito(){
  const R=(exId,reps,note)=>({exId, role:'assist', note:note||'', sets:reps.map(r=>({reps:r,pct:null}))});
  const up=(rowR,ohpR,puR,opt=true)=>[R('bb_row',rowR,'Horizontal pull (any row variant fine)'),R('ohp',ohpR,'Shoulder press (no %; add gradually)'),R('pullup',puR,'Weighted if possible')].concat(opt?[O('lat_raise',4,10),O('db_fly',4,10)]:[]);
  const lo=(opt=true)=>opt?[O('leg_curl',3,10),O('calf_raise_machine',3,10)]:[];
  const B=(lift,arr,note)=>I(lift,arr.map(([n,r,pc,x])=>S(n,r,pc,x)),'main',note||'');
  return [
   {label:'Week 1 · Muscular conditioning', days:[
     {label:'Day 1 · Lower', items:[B('squat',[[4,6,.80]]),B('deadlift',[[2,6,.80]]),...lo()]},
     {label:'Day 2 · Upper', items:[B('bench',[[1,10,.50],[1,10,.675],[1,8,.75],[1,6,.775]]),...up([10,10,8,6],[12,12,10,8],[12,12,10,8])]},
     {label:'Day 3 · Upper', items:[B('bench',[[1,10,.50],[1,10,.675],[1,8,.75],[1,6,.775]]),...up([10,10,8,6],[12,12,10,8],[12,12,10,8])]},
     {label:'Day 4 · Lower', items:[B('squat',[[4,8,.70]]),B('deadlift',[[2,8,.70]]),...lo()]},
     {label:'Day 5 · Upper', items:[B('bench',[[1,1,.80,{amrap:true,lbl:'max reps'}]],'One all-out set for max reps.'),...up([10,10,8,6],[12,12,10,8],[12,12,10,8])]}]},
   {label:'Week 2 · Hypertrophy', days:[
     {label:'Day 1 · Lower', items:[B('squat',[[1,8,.80,{amrap:true,cap:10,lbl:'MR10'}],[5,3,.80,{add:5}]],'MR10 = max reps, stop at 10. Under 8 reps: lower squat 1RM 2.5% from here on. Then 5 triples at MR10 weight +5 lb.'),A('sldl',3,8,'Moderate weight'),...lo()]},
     {label:'Day 2 · Upper', items:[B('bench',[[1,10,.725],[1,8,.775],[1,6,.80,{add:5,amrap:true,cap:8}]]),...up([10,8,8],[10,8,6],[10,8,6])]},
     {label:'Day 3 · Lower', items:[B('squat',[[1,8,.80,{amrap:true,cap:10,add:5,lbl:'MR10'}],[10,3,.80,{add:-5}]],'Back-off triples at MR10 weight −10 lb: 10 reps on MR10 → 10 triples; 8–9 → 8; 7 → 5; under 7 → skip and lower squat 1RM 2.5%. Remove extra sets as needed.'),A('sldl',3,8,'Moderate weight'),...lo()]},
     {label:'Day 4 · Upper', items:[B('bench',[[1,10,.725],[1,8,.775],[1,6,.80,{add:5,amrap:true,cap:8}]]),...up([10,8,8],[10,8,6],[10,8,6])]},
     {label:'Day 5 · Upper', items:[B('bench',[[1,1,.80,{add:-5,amrap:true,lbl:'max reps'}]],'80% minus 5 lb, one all-out set.'),...up([10,8,8],[10,8,6],[10,8,6])]}]},
   {label:'Week 3 · Linear max overload', days:[
     {label:'Day 1 · Lower', items:[B('squat',[[3,4,.85,{add:5,cap:6}]],'Sets of 4–6. No accessories today.'),B('deadlift',[[2,3,.875,{cap:6}]],'Sets of 3–6.')]},
     {label:'Day 2 · Upper', items:[B('bench',[[3,4,.85,{cap:6}]],'Sets of 4–6.'),...up([6,6,6],[6,6,6],[6,6,6],false)]},
     {label:'Day 3 · Lower', items:[B('squat',[[1,4,.85,{add:10,cap:6}]],'One set of 4–6.'),A('sldl',1,8,'Moderate weight')]},
     {label:'Day 4 · Upper', items:[B('bench',[[3,4,.85,{add:5,cap:6}]],'Day 2 weight +5 lb, sets of 4–6.'),...up([6,6,6],[6,6,6],[6,6,6],false)]}]},
   {label:'Week 4 · Heavy weight acclimation', days:[
     {label:'Day 1 · Lower', items:[B('squat',[[1,3,.90,{add:-5}],[1,3,.90],[1,3,.90,{add:5}]]),A('sldl',2,6,'Moderate weight'),...lo()]},
     {label:'Day 2 · Upper', items:[B('bench',[[1,3,.875,{add:-5}],[1,3,.90,{add:-5}],[1,3,.90]]),...up([10,10,8,6],[12,12,10,8],[12,12,10,8])]},
     {label:'Day 3 · Lower', items:[B('squat',[[1,3,.90,{add:5}],[1,1,.95,{cap:2}]]),B('deadlift',[[1,3,.90,{add:5}],[1,1,.95,{cap:2}]]),...lo()]},
     {label:'Day 4 · Upper', items:[B('bench',[[1,3,.875],[1,2,.90,{cap:4}],[1,1,.95,{cap:2}]]),...up([10,10,8,6],[12,12,10,8],[12,12,10,8])]}]},
   {label:'Week 5 · Intensity', days:[
     {label:'Day 1 · Lower', items:[B('squat',[[1,1,.975,{amrap:true,cap:4}]],'As many reps as possible, up to 4. Projected max: ×1.03 (2 reps), ×1.06 (3), ×1.09 (4).'),B('deadlift',[[1,4,.675],[1,4,.70],[1,2,.725]],'Light, move the bar fast.'),...lo()]},
     {label:'Day 2 · Upper', items:[B('bench',[[1,1,.975,{amrap:true,cap:4}]],'As many reps as possible, up to 4. Projected max: ×1.03 (2), ×1.06 (3), ×1.09 (4).'),...up([8,6,6],[8,6,6],[8,6,6]).map(x=>{ if(x.role==='opt') x.sets=x.sets.slice(0,3); return x; })]},
     {label:'Day 3 · Lower', items:[B('deadlift',[[1,1,.975,{amrap:true,cap:4}]],'As many reps as possible, up to 4.'),...lo()]}]},
   {label:'Week 6 · 1RM test', days:[{label:'Max day', items:[testRamp('squat'),testRamp('bench'),testRamp('deadlift')]}]}
  ];
}
/* ---------- Madcow 5x5 (base = current 5RM; week-4 top set = 5RM; +2.5%/wk) ---------- */
function madcow(p){
  const press=(p.cfg&&p.cfg.wedPress)||'incline'; const off=((p.cycle||1)-1)*12; const weeks=[];
  for(let w=1; w<=12; w++){ const k=Math.pow(1.025, w+off-4);
    const ramp=(lift,f)=>I(lift,[.5,.625,.75,.875,1].map(r=>S(1,5,r*k*f)),'main','Ramp 12.5% jumps; top set is the week\'s heavy 5.');
    const wedRamp=(lift)=>I(lift,[.625,.75,.875,1].map(r=>S(1,5,r*k)),'main','4 ramping sets of 5.');
    weeks.push({label:`Week ${w+off}`+(w+off===4?' · top sets = current 5RM':w+off>4?' · PR territory':''), days:[
      {label:'Mon · Heavy', items:[ramp('squat',1),ramp('bench',1),ramp('row',1),A('back_ext',2,10,'Weighted hyperextensions'),A('hanging_knee',4,12,'Weighted sit-ups / abs')]},
      {label:'Wed · Light', items:[I('squat',[.5,.625,.75,.75].map(r=>S(1,5,r*k)),'main','Light day: sets 1–3 of Monday, repeat set 3.'),wedRamp(press),wedRamp('deadlift'),A('hanging_knee',3,12,'Abs')]},
      {label:'Fri · Medium/PR', items:[
        ...['squat','bench','row'].map(l=>I(l,cat(...[.5,.625,.75,.875].map(r=>S(1,5,r*k)),S(1,3,k*1.025,{lbl:'triple PR'}),S(1,8,.75*k,{lbl:'back-off'})),'main','4 ramp sets, triple at Monday top +2.5%, back-off 8 at set-3 weight.')),
        A('dips',3,8,'Weighted dips 3×5–8'),A('bb_curl',3,8),A('oh_db_ext',3,8,'Triceps extensions')]}]});
  }
  return weeks;
}
/* ---------- Texas Method (base = current 5RM) ---------- */
function texas(p){
  const off=((p.cycle||1)-1)*12; const weeks=[];
  for(let w=1; w<=12; w++){ const gw=w+off; const pB = gw%2===1 ? 'bench':'ohp', pL = pB==='bench'?'ohp':'bench';
    const occ=Math.ceil(gw/2); // nth time this press is the intensity lift
    const sq=5*gw, dl=5*gw, pr=5*occ;
    weeks.push({label:`Week ${gw} · ${LIFT_NAME[pB]} week`, days:[
      {label:'Mon · Volume', items:[I('squat',[S(5,5,.9,{add:sq*.9})],'main','5×5 @ 90% of Friday\'s 5-rep target.'),I(pB,[S(5,5,.9,{add:pr*.9})],'main','5×5 @ 90% of Friday\'s target.'),I('deadlift',[S(1,5,1,{add:dl})],'main','1×5, add 5 lb weekly.')]},
      {label:'Wed · Recovery', items:[I('squat',[S(2,5,.72,{add:sq*.72})],'main','2×5 @ 80% of Monday.'),I(pL,[S(3,5,.81,{add:pr*.81})],'main','Lighter press 3×5.'),A('chinup',3,8,'Chin-ups'),A('back_ext',3,10)]},
      {label:'Fri · Intensity', items:[I('squat',[S(1,5,1,{add:sq,lbl:'5RM PR'})],'main','New 5-rep PR (+5 lb/week).'),I(pB,[S(1,5,1,{add:pr,lbl:'5RM PR'})],'main','New 5-rep PR (+5 lb each time it comes round).'),A('power_clean',5,3,'Power clean 5×3 (or deadlift variation)')]}]});
  }
  return weeks;
}
/* ---------- Navy PRT hybrid (app-designed) ---------- */
function navyHybrid(){
  const pc=[.70,.725,.75,.775,.80,.60];
  return pc.map((b,wi)=>({label:`Week ${wi+1}`+(wi===5?' · deload':''), days:[
    {label:'Day A · Squat + Bench', items:[I('squat',[S(3,5,b)]),I('bench',[S(3,5,b)]),A('pullup',3,6,'Pull-ups (supports push-up endurance & posture)')]},
    {label:'Day B · Deadlift + Press', items:[I('deadlift',[S(2,5,b)]),I('ohp',[S(3,5,b)]),A('db_row',3,10)]},
    {label:'Day C · Squat + Bench (heavy triples)', items:[I('squat',[S(3,3,wi===5?b:b+.075)]),I('bench',[S(3,3,wi===5?b:b+.075)]),A('bulgarian',2,8)]}]}));
}
/* ---------- linear-progression programs (state-driven) ---------- */
const LP = {
  ss:{rot:[['A',[['squat',3,5],['ohp',3,5],['deadlift',1,5]]],['B',[['squat',3,5],['bench',3,5],['deadlift',1,5]]]], inc:{squat:10,deadlift:10,bench:5,ohp:5}, startPct:.85, failsToDeload:3, deload:.9},
  sl5x5:{rot:[['A',[['squat',5,5],['bench',5,5],['row',5,5]]],['B',[['squat',5,5],['ohp',5,5],['deadlift',1,5]]]], inc:{squat:5,bench:5,row:5,ohp:5,deadlift:10}, startPct:.5, failsToDeload:3, deload:.9}
};
const GZ = {days:[['squat','bench','lat_pulldown'],['ohp','deadlift','db_row'],['bench','squat','lat_pulldown'],['deadlift','ohp','db_row']],
  t1:[[5,3],[6,2],[10,1]], t2:[[3,10],[3,8],[3,6]], inc:l=>UPPER[l]?5:10};

const PROGRAMS = [
 {id:'wave321', name:'3-2-1 Wave Loading', kind:'pct', base:'1rm', lifts:['squat','bench','deadlift','ohp'], dpw:4, repeat:true, build:wave321,
  blurb:'Poliquin-style 3-2-1 waves: 3 reps, 2 reps, 1 rep, then a second, heavier wave. 4-week cycle (3 loading + deload).',
  source:'Charles Poliquin, wave loading (The Poliquin Principles, 1997). No single canonical % table exists — the 80/85/90 → +2.5%/wave ladder here is this app\'s, labeled as such.'},
 {id:'w531', name:'Wendler 5/3/1', kind:'pct', base:'tm', tmPct:.9, lifts:['ohp','deadlift','bench','squat'], dpw:4, repeat:true, build:w531, options:{variant:[['bbb','Boring But Big (5×10)'],['fsl','First Set Last (5×5)'],['none','Main work only']]},
  blurb:'4-week waves on a 90% training max: 5s, 3s, 5/3/1, deload. TM +5 lb upper / +10 lb lower each cycle.',
  source:'Jim Wendler, 5/3/1 (2nd ed., 2011); BBB & FSL from Beyond 5/3/1 (2013) and 5/3/1 Forever (2017).'},
 {id:'smolov', name:'Smolov (full, 13 wk)', kind:'pct', base:'1rm', lifts:['squat'], dpw:4, build:smolov,
  blurb:'Intro microcycle, base mesocycle, switching phase, intense mesocycle, taper. Squat only. Brutal.',
  source:'Sergey Smolov, Russian squat routine; percentages as published at smolovjr.com/smolov-squat-routine. Switching-phase sets are not specified in the source (50–60% speed work) — app defaults, labeled.'},
 {id:'smolovjr', name:'Smolov Jr (3 wk)', kind:'pct', base:'1rm', lifts:['squat'], liftChoice:['squat','bench'], dpw:4, build:smolovJr,
  blurb:'6×6 @70, 7×5 @75, 8×4 @80, 10×3 @85, four days a week; add weight weeks 2–3.',
  source:'Smolov Jr as published at smolovjr.com/smolov-squat-program (via PowerliftingToWin). Week adds default to squat +10/+20 lb, bench +5/+10 lb (within the source ranges).'},
 {id:'ss', name:'Starting Strength (novice LP)', kind:'lp', base:'5rm', lifts:['squat','bench','ohp','deadlift'], dpw:3, repeat:true,
  blurb:'A/B alternating: squat 3×5 every session, press or bench 3×5, deadlift 1×5. Add weight every session.',
  source:'Mark Rippetoe, Starting Strength: Basic Barbell Training, 3rd ed. (2011), novice program. Start weights = 85% of your estimated 5RM (app default); 3 misses at one weight → 10% reset.'},
 {id:'sl5x5', name:'StrongLifts 5×5', kind:'lp', base:'5rm', lifts:['squat','bench','row','ohp','deadlift'], dpw:3, repeat:true,
  blurb:'A: squat/bench/row 5×5 · B: squat/press 5×5, deadlift 1×5. +5 lb per session (+10 deadlift).',
  source:'Mehdi Hadim, StrongLifts 5×5 (stronglifts.com/5x5). Start at 50% of 5RM per StrongLifts guidance for experienced lifters; 3 failures → deload 10%.'},
 {id:'texas', name:'Texas Method', kind:'pct', base:'5rm', lifts:['squat','bench','ohp','deadlift'], dpw:3, repeat:true, build:texas,
  blurb:'Volume (5×5 @90%) · Recovery (light) · Intensity (new 5RM). Bench and press alternate weeks.',
  source:'Rippetoe & Baker, Practical Programming for Strength Training, 3rd ed. (2014), Texas Method. Base = current 5RM; first Friday target = 5RM + 5 lb.'},
 {id:'gzclp', name:'GZCLP', kind:'gz', base:'5rm', lifts:['squat','bench','ohp','deadlift'], dpw:4, repeat:true,
  blurb:'T1 5×3+ → 6×2+ → 10×1+, T2 3×10 → 3×8 → 3×6, T3 3×15+. Four-day rotation.',
  source:'Cody Lefever, GZCLP (The GZCL Method, simplified; 2016). T1 starts at 85% of 5RM, T2 at 65%; +10 lb lower / +5 lb upper per session.'},
 {id:'madcow', name:'Madcow 5×5', kind:'pct', base:'5rm', lifts:['squat','bench','row','deadlift','incline'], dpw:3, repeat:true, build:madcow, options:{wedPress:[['incline','Incline bench (Wed)'],['ohp','Overhead press (Wed)']]},
  blurb:'Weekly linear intermediate 5×5: Mon heavy ramp, Wed light, Fri triple PR. Top sets +2.5%/wk; week 4 = current 5RM.',
  source:'Madcow2 intermediate 5×5 (Bill Starr-based), per the original Madcow spreadsheet: 12.5% ramps, +2.5%/week.'},
 {id:'candito', name:'Candito 6-Week Strength', kind:'pct', base:'1rm', lifts:['squat','bench','deadlift'], dpw:5, build:candito,
  blurb:'Conditioning → hypertrophy → linear max OT → heavy acclimation → intensity → 1RM test.',
  source:'Jonnie Candito, Candito 6 Week Strength Program (Candito Training HQ spreadsheet). Missing a required rep: lower that lift\'s 1RM by 2.5% (applied automatically).'},
 {id:'navy', name:'Navy PRT Hybrid (app-designed)', kind:'pct', base:'1rm', lifts:['squat','bench','deadlift','ohp'], dpw:3, build:navyHybrid,
  blurb:'Short, submaximal 3×5 / 3×3 barbell work (70–82.5%) that leaves time and legs for PRT push-ups, plank and cardio in the same session.',
  source:'Designed by this app (not a published program). Keeps lifting ≤ ~25 min so the generator can add PRT work.'}
];
const byId = id => PROGRAMS.find(p=>p.id===id);

/* ---------- helpers ---------- */
const stepOf = u => u==='kg'?2.5:5;
const rnd = (w,u) => { const s=stepOf(u); return Math.max(0, Math.round(w/s)*s); };
const addU = (lb,u) => u==='kg'? lb/2 : lb;
function weeksOf(p){ const d=byId(p.id); return d.kind==='pct'? d.build(p) : null; }
function flatSessions(p){ const W=weeksOf(p); if(!W) return null; const out=[]; W.forEach((wk,wi)=>wk.days.forEach((dy,di)=>out.push({wi,di,week:wk.label,day:dy.label,items:dy.items}))); return out; }
function totalSessions(p){ const f=flatSessions(p); return f? f.length : null; }
function baseFor(def, oneRm, fiveRm){ // from user 1RM (or e1RM) to the program's base
  if(def.base==='tm') return oneRm*(def.tmPct||.9);
  if(def.base==='5rm') return fiveRm!=null? fiveRm : oneRm/1.1667; // Epley: 5 reps = 116.7% → 5RM ≈ 85.7% of 1RM
  return oneRm;
}
function resolveSets(sets, base, u){
  return sets.map(s=>{ const w = s.pct==null? null : (base? rnd(base*s.pct + addU(s.add||0,u), u) : null); return Object.assign({}, s, {w}); });
}
/* session for current pointer (or a given index) with weights resolved */
function session(p, u, si){
  const def=byId(p.id); if(si==null) si=p.si||0;
  if(def.kind==='pct'){
    const f=flatSessions(p); if(si>=f.length) return null; const s=f[si];
    return {si, week:s.week, day:s.day, label:`${s.week} · ${s.day}`, items:s.items.map(it=>({lift:it.lift, exId:it.exId||LIFT_EX[it.lift], role:it.role, note:it.note,
      sets: resolveSets(it.sets, it.lift? (p.base[it.lift]||0) : 0, u)}))};
  }
  if(def.kind==='lp'){
    const L=LP[p.id]; const [lab,list]=L.rot[si%L.rot.length]; const n=Math.floor(si/L.rot.length);
    return {si, week:`Session ${si+1}`, day:`Workout ${lab}`, label:`Session ${si+1} · Workout ${lab}`, items:list.map(([l,ns,r])=>{ const st=p.lp[l]||{w:0,fails:0};
      return {lift:l, exId:LIFT_EX[l], role:'main', key:l, note:st.fails?`Missed last time (${st.fails}/${L.failsToDeload}) — repeat this weight.`:'', sets:S(ns,r,null).map(x=>Object.assign(x,{w:rnd(st.w,u)}))}; })};
  }
  if(def.kind==='gz'){
    const d=GZ.days[si%4]; const [l1,l2,t3]=d; const a=p.lp['t1_'+l1], b=p.lp['t2_'+l2], c=p.lp['t3_'+t3]||{w:0};
    const [n1,r1]=GZ.t1[a.stage], [n2,r2]=GZ.t2[b.stage];
    return {si, week:`Week ${Math.floor(si/4)+1}`, day:`Day ${si%4+1}`, label:`Week ${Math.floor(si/4)+1} · Day ${si%4+1}`, items:[
      {lift:l1, exId:LIFT_EX[l1], role:'main', key:'t1_'+l1, note:`T1 ${n1}×${r1}+ (stage ${a.stage+1}/3). Last set AMRAP.`, sets:S(n1,r1,null).map((x,i)=>Object.assign(x,{w:rnd(a.w,u),amrap:i===n1-1}))},
      {lift:l2, exId:LIFT_EX[l2], role:'supp', key:'t2_'+l2, note:`T2 ${n2}×${r2} (stage ${b.stage+1}/3).`, sets:S(n2,r2,null).map(x=>Object.assign(x,{w:rnd(b.w,u)}))},
      {exId:t3, role:'assist', key:'t3_'+t3, note:'T3 3×15+, last set AMRAP; 25+ reps on the last set → add weight.', sets:S(3,15,null).map((x,i)=>Object.assign(x,{w:c.w?rnd(c.w,u):null,amrap:i===2}))}]};
  }
}
/* create a new program instance */
function create(id, inputs, units, cfg){ // inputs: {lift:{orm, frm}} (1RM & optional 5RM in user units)
  const def=byId(id); const p={id, cfg:Object.assign({}, cfg||{}), base:{}, inputs:{}, si:0, cycle:1, start:null, log:[], lp:{}, units, active:true, done:false};
  if(def.liftChoice) p.cfg.lift=p.cfg.lift||def.liftChoice[0];
  const lifts = liftsFor(def, p.cfg);
  for(const l of lifts){ const x=inputs[l]||{}; const frm=x.frm!=null&&x.frm!==''&&+x.frm>0?+x.frm:null; const orm=+x.orm||(frm? frm*1.1667 : 0); p.inputs[l]={orm:Math.round(orm*10)/10,frm}; p.base[l]=orm? Math.round(baseFor(def,orm,frm)*10)/10 : 0; }
  if(def.kind==='lp'){ const L=LP[id]; for(const l of lifts) p.lp[l]={w:rnd(p.base[l]*L.startPct,units), fails:0}; }
  if(def.kind==='gz'){ for(const l of lifts){ p.lp['t1_'+l]={w:rnd(p.base[l]*.85,units), stage:0}; p.lp['t2_'+l]={w:rnd(p.base[l]*.65,units), stage:0, w10:rnd(p.base[l]*.65,units)}; }
    p.lp.t3_lat_pulldown={w:0}; p.lp.t3_db_row={w:0}; }
  return p;
}
function liftsFor(def, cfg){ cfg=cfg||{}; if(def.liftChoice) return [cfg.lift||def.liftChoice[0]]; if(def.id==='madcow') return ['squat','bench','row','deadlift', cfg.wedPress==='ohp'?'ohp':'incline']; return def.lifts; }
function liftsOf(p){ return liftsFor(byId(p.id), p.cfg); }
/* results: [{key|lift, role, sets:[{w,reps,tr,done,amrap,test}]}] -> advance pointer, apply program rules. Returns messages. */
function advance(p, results, units, date){
  const def=byId(p.id); const msg=[]; const u=units;
  const ok = r => r.sets.length && r.sets.every(s=>s.done && (+s.reps||0) >= (+s.tr||0));
  if(def.kind==='lp'){ const L=LP[p.id];
    for(const r of results.filter(r=>r.role==='main')){ const st=p.lp[r.lift]; if(!st) continue; const inc=addU(L.inc[r.lift]||5,u);
      if(ok(r)){ st.w=rnd(st.w+inc,u); st.fails=0; msg.push(`${LIFT_NAME[r.lift]}: all reps → ${st.w} ${u} next time.`); }
      else { st.fails=(st.fails||0)+1; if(st.fails>=L.failsToDeload){ st.w=rnd(st.w*L.deload,u); st.fails=0; msg.push(`${LIFT_NAME[r.lift]}: ${L.failsToDeload} misses → deload 10% to ${st.w} ${u}.`); } else msg.push(`${LIFT_NAME[r.lift]}: missed reps (${st.fails}/${L.failsToDeload}) → repeat ${st.w} ${u}.`); } }
  }
  if(def.kind==='gz'){
    for(const r of results){ const st=p.lp[r.key]; if(!st) continue;
      if(r.key.startsWith('t1_')){ const l=r.lift, inc=addU(GZ.inc(l),u);
        if(ok(r)){ st.w=rnd(st.w+inc,u); msg.push(`T1 ${LIFT_NAME[l]}: success → ${st.w} ${u}.`); }
        else if(st.stage<2){ st.stage++; const [n,rr]=GZ.t1[st.stage]; msg.push(`T1 ${LIFT_NAME[l]}: missed → stage ${st.stage+1} (${n}×${rr}+) at ${st.w} ${u}.`); }
        else { st.stage=0; st.w=rnd(st.w*.85,u); msg.push(`T1 ${LIFT_NAME[l]}: 10×1 missed → restart 5×3+ at ${st.w} ${u} (GZCLP: test a new 5RM and use 85% — app approximation: 85% of current).`); } }
      else if(r.key.startsWith('t2_')){ const l=r.lift, inc=addU(GZ.inc(l)/2,u);
        if(ok(r)){ if(st.stage===0) st.w10=st.w; st.w=rnd(st.w+inc,u); msg.push(`T2 ${LIFT_NAME[l]}: success → ${st.w} ${u}.`); }
        else if(st.stage<2){ st.stage++; const [n,rr]=GZ.t2[st.stage]; msg.push(`T2 ${LIFT_NAME[l]}: missed → stage ${st.stage+1} (${n}×${rr}) at ${st.w} ${u}.`); }
        else { st.stage=0; st.w=rnd((st.w10||st.w)+addU(15,u),u); msg.push(`T2 ${LIFT_NAME[l]}: 3×6 missed → back to 3×10 at ${st.w} ${u} (last 3×10 weight +15 lb).`); } }
      else { const last=r.sets[r.sets.length-1]; const w=Math.max(0,...r.sets.filter(s=>s.done).map(s=>+s.w||0)); if(w) st.w=w; if(last&&last.done&&+last.reps>=25){ st.w=rnd((st.w||0)+addU(5,u),u); msg.push(`T3: 25+ reps on last set → ${st.w} ${u}.`); } }
    }
  }
  if(def.kind==='pct'){
    // 1RM tests (Smolov wk 6/13, Candito wk 6): heaviest completed single becomes the new base
    for(const r of results){ const t=r.sets.filter(s=>s.test||s.lbl==='attempt'); if(!t.length||!r.lift) continue;
      const best=Math.max(0,...r.sets.filter(s=>s.done&&+s.reps>=1).map(s=>+s.w||0)); if(best>0 && best!==p.base[r.lift]){ msg.push(`${LIFT_NAME[r.lift]}: new 1RM ${best} ${u} (was ${p.base[r.lift]}). Later weeks use it.`); p.base[r.lift]=best; if(p.inputs[r.lift]) p.inputs[r.lift].orm=best; } }
    if(def.id==='candito') for(const r of results.filter(r=>r.role==='main'&&r.lift)){ const miss=r.sets.some(s=>!s.amrap && s.done && (+s.reps||0)<(+s.tr||0));
      if(miss){ p.base[r.lift]=Math.round(p.base[r.lift]*.975*10)/10; msg.push(`Candito rule: missed a required rep on ${LIFT_NAME[r.lift]} → 1RM −2.5% to ${p.base[r.lift]} ${u} for the rest of the cycle.`); } }
  }
  p.log.push({si:p.si, date, cycle:p.cycle});
  p.si=(p.si||0)+1;
  const tot=totalSessions(p);
  if(tot!=null && p.si>=tot){
    if(def.repeat){ p.si=0; p.cycle=(p.cycle||1)+1;
      if(def.id==='w531'||def.id==='wave321'){ for(const l of Object.keys(p.base)){ const inc=addU(UPPER[l]?5:10,u); p.base[l]=Math.round((p.base[l]+inc)*10)/10; } msg.push(`Cycle ${p.cycle-1} complete → ${def.base==='tm'?'training maxes':'1RMs'} +5 lb upper / +10 lb lower. Starting cycle ${p.cycle}.`); }
      else msg.push(`Block complete → continuing with weeks ${(p.cycle-1)*12+1}–${p.cycle*12}.`);
    } else { p.done=true; p.active=false; msg.push(`${def.name} complete! Retest or enter new maxes and start your next program.`); }
  }
  return msg;
}
function back(p){ if(p.si>0){ p.si--; p.log.pop(); } }
function skip(p){ const tot=totalSessions(p); p.si=(p.si||0)+1; if(tot!=null&&p.si>=tot){ const d=byId(p.id); if(d.repeat){p.si=0;p.cycle++;} else {p.si=tot-1;} } }
const API={PROGRAMS, byId, LIFT_EX, LIFT_NAME, UPPER, create, session, advance, back, skip, weeksOf, flatSessions, totalSessions, baseFor, liftsOf, liftsFor, resolveSets, rnd, W531, LP, GZ};
if(typeof module!=='undefined') module.exports=API; else root.WO_PROG=API;
})(typeof window!=='undefined'?window:globalThis);
