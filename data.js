/* Exercise library + equipment catalog. Pure data. */
'use strict';
const EQUIP = [
  ['barbell','Barbell + plates'],['rack','Squat / power rack'],['bench','Adjustable bench'],
  ['dumbbell','Dumbbells'],['kettlebell','Kettlebells'],['cable','Cable station / pulldown'],
  ['machines','Selectorized machines (leg press, curl/ext, chest press)'],['pullup','Pull-up bar'],
  ['dipbar','Dip bars'],['bands','Resistance bands'],['trx','Suspension trainer (TRX)'],
  ['box','Plyo box / step'],['abwheel','Ab wheel'],['handgrip','Handgrip trainer'],
  ['treadmill','Treadmill'],['bike','Stationary bike'],['rower','Rower (Concept2)'],
  ['elliptical','Elliptical'],['stairmill','Stair climber'],['pool','Pool'],['jumprope','Jump rope'],
  ['outdoor','Outdoor running route / track']
];
const MUSCLES = ['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core','forearms'];
const PATTERNS = {
  squat:'Squat', hinge:'Hinge', lunge:'Single-leg', hpush:'Horizontal push', vpush:'Vertical push',
  hpull:'Horizontal pull', vpull:'Vertical pull', carry:'Carry', core:'Core', bi:'Biceps', tri:'Triceps',
  delt:'Shoulder accessory', legiso:'Leg accessory', chestiso:'Chest accessory', calf:'Calves',
  cond:'Conditioning', run:'Run', row:'Row (erg)', bike:'Bike', swim:'Swim', cardio:'Other cardio',
  mob:'Mobility', iso:'BP isometric'
};
const MAIN_PATTERNS = ['squat','hinge','hpush','hpull','vpush','vpull','lunge'];
const ACC_PATTERNS = ['core','delt','bi','tri','legiso','chestiso','calf','carry'];
const CARDIO_PATTERNS = ['run','row','bike','swim','cardio'];
/* k: w=weighted reps, bw=bodyweight reps, hold=seconds, cardio, mob=timed drill, iso=BP isometric
   eq: ALL required tags. m: primary muscles. r: default rep range. inc: lb increment. rk: preference rank in pattern.
   ra: strength ratio vs pattern reference lift (for estimating a substitute's weight). ru: rep unit label. */
const EX_RAW = [
 // squat
 ['back_squat','Back Squat','squat','w',['barbell','rack'],['quads','glutes'],[3,8],10,1,1],
 ['front_squat','Front Squat','squat','w',['barbell','rack'],['quads','core'],[3,8],10,2,.8],
 ['leg_press','Leg Press','squat','w',['machines'],['quads','glutes'],[8,12],10,3,1.8],
 ['db_goblet_squat','DB Goblet Squat','squat','w',['dumbbell'],['quads','glutes'],[8,15],5,4,.35],
 ['kb_goblet_squat','KB Goblet Squat','squat','w',['kettlebell'],['quads','glutes'],[8,15],5,5,.35],
 ['db_front_squat','DB Front Squat (pair)','squat','w',['dumbbell'],['quads','glutes'],[6,12],5,4,.3],
 ['bw_squat','Bodyweight Squat','squat','bw',[],['quads','glutes'],[15,30],0,8],
 ['jump_squat','Jump Squat','squat','bw',[],['quads','glutes'],[8,15],0,9],
 // hinge
 ['deadlift','Deadlift','hinge','w',['barbell'],['hamstrings','glutes','back'],[3,6],10,1,1],
 ['rdl','Romanian Deadlift','hinge','w',['barbell'],['hamstrings','glutes'],[6,10],10,2,.7],
 ['hip_thrust','Barbell Hip Thrust','hinge','w',['barbell','bench'],['glutes','hamstrings'],[6,12],10,3,.9],
 ['db_rdl','DB Romanian Deadlift (pair)','hinge','w',['dumbbell'],['hamstrings','glutes'],[8,12],5,4,.3],
 ['kb_swing','Kettlebell Swing','hinge','w',['kettlebell'],['glutes','hamstrings'],[12,20],5,5,.2],
 ['sl_db_rdl','Single-leg DB RDL','hinge','w',['dumbbell'],['hamstrings','glutes'],[8,12],5,6,.2],
 ['good_morning','Good Morning','hinge','w',['barbell','rack'],['hamstrings','back'],[8,12],5,7,.4],
 ['cable_pullthrough','Cable Pull-through','hinge','w',['cable'],['glutes','hamstrings'],[10,15],10,7,.3],
 ['back_ext','Back Extension','hinge','bw',['machines'],['back','glutes'],[10,20],0,8],
 ['glute_bridge','Glute Bridge','hinge','bw',[],['glutes','hamstrings'],[15,25],0,9],
 ['sl_glute_bridge','Single-leg Glute Bridge','hinge','bw',[],['glutes','hamstrings'],[10,20],0,10],
 // single leg
 ['bulgarian','DB Bulgarian Split Squat','lunge','w',['dumbbell','bench'],['quads','glutes'],[6,12],5,1,.25],
 ['db_walk_lunge','DB Walking Lunge','lunge','w',['dumbbell'],['quads','glutes'],[8,12],5,2,.25],
 ['db_stepup','DB Step-up','lunge','w',['dumbbell','box'],['quads','glutes'],[8,12],5,3,.2],
 ['bb_rev_lunge','Barbell Reverse Lunge','lunge','w',['barbell','rack'],['quads','glutes'],[6,10],10,2,.5],
 ['rev_lunge','Reverse Lunge (bodyweight)','lunge','bw',[],['quads','glutes'],[10,20],0,8],
 ['split_squat','Split Squat (bodyweight)','lunge','bw',[],['quads','glutes'],[10,20],0,9],
 ['jump_lunge','Jumping Lunge','lunge','bw',[],['quads','glutes'],[8,16],0,10],
 // horizontal push
 ['bench','Bench Press','hpush','w',['barbell','bench','rack'],['chest','triceps','shoulders'],[3,8],5,1,1],
 ['db_bench','DB Bench Press','hpush','w',['dumbbell','bench'],['chest','triceps'],[6,12],5,2,.4],
 ['incline_bench','Incline Bench Press','hpush','w',['barbell','bench','rack'],['chest','shoulders'],[5,10],5,3,.8],
 ['incline_db','Incline DB Press','hpush','w',['dumbbell','bench'],['chest','shoulders'],[8,12],5,4,.33],
 ['machine_chest','Machine Chest Press','hpush','w',['machines'],['chest','triceps'],[8,12],10,5,.9],
 ['db_floor_press','DB Floor Press','hpush','w',['dumbbell'],['chest','triceps'],[8,12],5,6,.38],
 ['dips','Dips','hpush','bw',['dipbar'],['chest','triceps'],[6,15],0,7],
 ['pushup','Push-up','hpush','bw',[],['chest','triceps','core'],[10,30],0,8],
 ['decline_pushup','Feet-elevated Push-up','hpush','bw',[],['chest','shoulders'],[8,20],0,9],
 ['close_grip_bench','Close-grip Bench Press','tri','w',['barbell','bench','rack'],['triceps','chest'],[6,10],5,1,.85],
 // vertical push
 ['ohp','Overhead Press','vpush','w',['barbell','rack'],['shoulders','triceps'],[3,8],5,1,1],
 ['seated_db_press','Seated DB Shoulder Press','vpush','w',['dumbbell','bench'],['shoulders','triceps'],[6,12],5,2,.42],
 ['standing_db_press','Standing DB Press','vpush','w',['dumbbell'],['shoulders','triceps','core'],[6,12],5,3,.4],
 ['machine_shoulder','Machine Shoulder Press','vpush','w',['machines'],['shoulders','triceps'],[8,12],10,4,.9],
 ['kb_press','KB Overhead Press','vpush','w',['kettlebell'],['shoulders','triceps'],[6,12],5,5,.4],
 ['arnold','Arnold Press','vpush','w',['dumbbell'],['shoulders'],[8,12],5,6,.35],
 ['pike_pushup','Pike Push-up','vpush','bw',[],['shoulders','triceps'],[6,15],0,8],
 ['hspu','Wall Handstand Push-up','vpush','bw',[],['shoulders','triceps'],[3,10],0,9],
 // horizontal pull
 ['bb_row','Barbell Row','hpull','w',['barbell'],['back','biceps'],[5,10],5,1,1],
 ['cable_row','Seated Cable Row','hpull','w',['cable'],['back','biceps'],[8,12],10,2,1],
 ['db_row','One-arm DB Row','hpull','w',['dumbbell','bench'],['back','biceps'],[6,12],5,3,.45],
 ['cs_db_row','Chest-supported DB Row','hpull','w',['dumbbell','bench'],['back'],[8,12],5,4,.38],
 ['db_bent_row','DB Bent-over Row (pair)','hpull','w',['dumbbell'],['back','biceps'],[8,12],5,4,.38],
 ['machine_row','Machine Row','hpull','w',['machines'],['back','biceps'],[8,12],10,4,1],
 ['inverted_row','Inverted Row (bar in rack)','hpull','bw',['barbell','rack'],['back','biceps'],[6,15],0,6],
 ['trx_row','Suspension Row','hpull','bw',['trx'],['back','biceps'],[8,15],0,6],
 ['band_row','Band Row','hpull','bw',['bands'],['back'],[12,20],0,8],
 ['door_row','Doorframe / Towel Row','hpull','bw',[],['back','biceps'],[10,20],0,9],
 // vertical pull
 ['pullup','Pull-up','vpull','bw',['pullup'],['back','biceps'],[3,12],0,1],
 ['chinup','Chin-up','vpull','bw',['pullup'],['back','biceps'],[3,12],0,2],
 ['lat_pulldown','Lat Pulldown','vpull','w',['cable'],['back','biceps'],[8,12],10,3],
 ['band_pullup','Band-assisted Pull-up','vpull','bw',['pullup','bands'],['back','biceps'],[5,12],0,4],
 ['band_pulldown','Band Pulldown','vpull','bw',['bands'],['back'],[12,20],0,7],
 // core
 ['plank','Forearm Plank','core','hold',[],['core'],[30,240],0,1],
 ['side_plank','Side Plank (each side)','core','hold',[],['core'],[20,60],0,3],
 ['hollow_hold','Hollow Hold','core','hold',[],['core'],[20,60],0,4],
 ['dead_bug','Dead Bug','core','bw',[],['core'],[8,15],0,5],
 ['bird_dog','Bird Dog','core','bw',[],['core','back'],[8,15],0,6],
 ['hanging_knee','Hanging Knee Raise','core','bw',['pullup'],['core'],[8,15],0,2],
 ['ab_wheel','Ab Wheel Rollout','core','bw',['abwheel'],['core'],[6,15],0,2],
 ['cable_crunch','Cable Crunch','core','w',['cable'],['core'],[10,15],10,3],
 ['pallof_cable','Pallof Press (cable)','core','w',['cable'],['core'],[10,12],5,4],
 ['pallof_band','Pallof Press (band)','core','bw',['bands'],['core'],[10,15],0,5],
 // carry
 ['farmer_db','DB Farmer Carry','carry','w',['dumbbell'],['forearms','core'],[30,60],5,1,0,'m'],
 ['farmer_kb','KB Farmer Carry','carry','w',['kettlebell'],['forearms','core'],[30,60],5,2,0,'m'],
 // arms
 ['bb_curl','Barbell Curl','bi','w',['barbell'],['biceps'],[8,12],5,1],
 ['db_curl','DB Curl','bi','w',['dumbbell'],['biceps'],[8,12],5,2],
 ['hammer_curl','Hammer Curl','bi','w',['dumbbell'],['biceps','forearms'],[8,12],5,3],
 ['cable_curl','Cable Curl','bi','w',['cable'],['biceps'],[10,15],5,3],
 ['band_curl','Band Curl','bi','bw',['bands'],['biceps'],[15,25],0,6],
 ['pushdown','Cable Triceps Pushdown','tri','w',['cable'],['triceps'],[10,15],5,2],
 ['oh_db_ext','Overhead DB Triceps Extension','tri','w',['dumbbell'],['triceps'],[10,15],5,3],
 ['skullcrusher','DB Skull Crusher','tri','w',['dumbbell','bench'],['triceps'],[10,15],5,3],
 ['bench_dip','Bench Dip','tri','bw',['bench'],['triceps'],[10,20],0,6],
 ['diamond_pushup','Diamond Push-up','tri','bw',[],['triceps','chest'],[8,20],0,7],
 // shoulders accessory
 ['lat_raise','DB Lateral Raise','delt','w',['dumbbell'],['shoulders'],[12,20],5,1],
 ['cable_lat_raise','Cable Lateral Raise','delt','w',['cable'],['shoulders'],[12,20],5,2],
 ['rear_delt_fly','DB Rear Delt Fly','delt','w',['dumbbell'],['shoulders','back'],[12,20],5,2],
 ['face_pull','Face Pull','delt','w',['cable'],['shoulders','back'],[12,20],5,1],
 ['band_pull_apart','Band Pull-apart','delt','bw',['bands'],['shoulders','back'],[15,30],0,4],
 ['ytw','Prone Y-T-W','delt','bw',[],['shoulders','back'],[8,12],0,8],
 // leg accessory / calves / chest accessory
 ['leg_ext','Leg Extension','legiso','w',['machines'],['quads'],[10,15],10,1],
 ['leg_curl','Leg Curl','legiso','w',['machines'],['hamstrings'],[10,15],10,1],
 ['calf_raise_db','Standing Calf Raise (DB)','calf','w',['dumbbell'],['calves'],[12,20],5,2],
 ['calf_raise_machine','Machine Calf Raise','calf','w',['machines'],['calves'],[10,15],10,1],
 ['calf_raise_bw','Single-leg Calf Raise','calf','bw',[],['calves'],[12,25],0,5],
 ['cable_fly','Cable Fly','chestiso','w',['cable'],['chest'],[10,15],5,1],
 ['db_fly','DB Fly','chestiso','w',['dumbbell','bench'],['chest'],[10,15],5,2],
 // conditioning
 ['burpee','Burpee','cond','bw',[],['quads','chest','core'],[8,20],0,5],
 ['mtn_climber','Mountain Climbers (each leg)','cond','bw',[],['core','shoulders'],[20,40],0,6],
 // cardio
 ['run_outdoor','Run (outdoor)','run','cardio',['outdoor'],[],[0,0],0,1],
 ['run_tread','Run (treadmill)','run','cardio',['treadmill'],[],[0,0],0,2],
 ['walk_brisk','Brisk Walk / Ruck','cardio','cardio',[],[],[0,0],0,9],
 ['row_erg','Rower','row','cardio',['rower'],[],[0,0],0,1],
 ['bike_stat','Stationary Bike','bike','cardio',['bike'],[],[0,0],0,1],
 ['swim','Swim','swim','cardio',['pool'],[],[0,0],0,1],
 ['elliptical','Elliptical','cardio','cardio',['elliptical'],[],[0,0],0,3],
 ['stair','Stair Climber','cardio','cardio',['stairmill'],[],[0,0],0,4],
 ['jumprope','Jump Rope','cardio','cardio',['jumprope'],[],[0,0],0,5],
 // mobility (seconds)
 ['mob_wgs',"World's Greatest Stretch",'mob','mob',[],[],[60,60],0,1],
 ['mob_9090','Hip 90/90 Switches','mob','mob',[],[],[60,60],0,2],
 ['mob_couch','Couch Stretch (each side)','mob','mob',[],[],[60,60],0,3],
 ['mob_tspine','Open-book T-spine Rotation','mob','mob',[],[],[60,60],0,4],
 ['mob_catcow','Cat-Cow','mob','mob',[],[],[45,45],0,5],
 ['mob_dogcobra','Down Dog to Cobra','mob','mob',[],[],[45,45],0,6],
 ['mob_squat_hold','Deep Squat Hold','mob','mob',[],[],[60,60],0,7],
 ['mob_ankle','Ankle Knee-to-wall Rocks','mob','mob',[],[],[45,45],0,8],
 ['mob_ham','Hamstring Floss','mob','mob',[],[],[45,45],0,9],
 ['mob_dislocate','Band Shoulder Dislocates','mob','mob',['bands'],[],[45,45],0,10],
 // BP isometrics (seconds)
 ['iso_handgrip','Isometric Handgrip (alternate hands)','iso','iso',['handgrip'],['forearms'],[120,120],0,1],
 ['iso_wallsit','Wall Sit (isometric)','iso','iso',[],['quads'],[120,120],0,2]
];
const EXERCISES = EX_RAW.map(a => ({id:a[0],name:a[1],p:a[2],k:a[3],eq:a[4],m:a[5],r:a[6],inc:a[7],rk:a[8],ra:a[9]||0,ru:a[10]||'reps'}));
const GOAL_TYPES = {
  prt:{label:'Navy PRT', desc:'Push-ups (2 min), forearm plank, 1.5-mile run or authorized alternate cardio.'},
  strength:{label:'Build strength', desc:'Heavy compound lifts, 3–6 reps, long rests.'},
  hypertrophy:{label:'Hypertrophy', desc:'Muscle size: 8–12 reps, more sets & accessories.'},
  endurance:{label:'Endurance / cardio', desc:'Aerobic base, longer steady sessions + tempo.'},
  bp:{label:'Blood pressure reduction', desc:'Aerobic + dynamic resistance (3×10) + isometric handgrip/wall sit.'},
  weight:{label:'Weight / body comp', desc:'Calorie-burning circuits + conditioning, keep strength.'},
  mobility:{label:'Mobility', desc:'Daily-ish mobility flows.'},
  custom:{label:'Custom', desc:'Your own exercise list.'}
};
const PRT_CARDIO = {
  run:{label:'1.5-mile run/walk', dist:'1.5 mi'},
  row:{label:'2,000 m row (Concept2)', dist:'2000 m'},
  swim500:{label:'500-yd swim', dist:'500 yd'},
  swim450:{label:'450-m swim', dist:'450 m'},
  bike:{label:'Stationary bike', dist:'timed'},
  treadmill:{label:'Treadmill 1.5 mi', dist:'1.5 mi'}
};
var WO_DATA = {EQUIP,MUSCLES,PATTERNS,MAIN_PATTERNS,ACC_PATTERNS,CARDIO_PATTERNS,EXERCISES,GOAL_TYPES,PRT_CARDIO};
if (typeof module !== "undefined") module.exports = WO_DATA; else window.WO_DATA = WO_DATA;
