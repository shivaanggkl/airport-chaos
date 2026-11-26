import {pursuitWarlord} from '../../shared/pursuit-warlord.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pursuitWarlordSpecies as species,createPursuitWarlordEncounter as create} from './pursuit-warlord.js';
import {finalWarlordSpecies,createFinalWarlordEncounter as createFinal} from './final-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {createM19Encounter,stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
import {titanAnchor} from '../../shared/titan-pose.mjs';
const zero={x:0,y:0,z:0};
const cycle=a=>a.warning+a.windup+a.active+a.recovery+a.cooldown;

test('M1 walks and turns six times faster, shoots six times more often, with larger, slower, wider fireballs without punches',()=>{
 const oldWalk=model.height*model.clips.walk.stride/model.clips.walk.duration*.32;
 assert.equal(species.movement.walk,oldWalk*6);assert.equal(species.movement.run,oldWalk*6);
 assert.equal(species.movement.acceleration,oldWalk*6/1.5);assert.equal(species.movement.turnRate,.45*6);assert.equal(species.movement.turnAcceleration,.6*6);
 const shot=species.abilities.find(a=>a.mechanism==='projectile');assert(Math.abs(cycle(shot)-(0.9+0.4+1+0.8+9)/6)<1e-9);
 assert.equal(shot.radius,144);assert.equal(shot.spread,.24);assert.equal(shot.projectileSpeed,1800);assert.equal(shot.count,6);assert.equal(shot.damage,25);assert.equal(shot.cooldown,1.5);
 assert.equal(species.movement.chargeSpeed,0);assert(species.abilities.every(a=>a.mechanism==='projectile'));
 assert.deepEqual(species.animations,['idle','walk','turn','roar','shoot','defeat']);assert.equal(shot.spreadPattern,'cluster');assert(species.abilities.every(a=>!a.interruptible));
 assert(finalWarlordSpecies.abilities.every(a=>a.mechanism==='projectile'));
 assert.equal(finalWarlordSpecies.abilities.find(a=>a.mechanism==='projectile').projectileSpeed,1800);
});

test('M1 damage never selects a flinch animation; other monsters retain their damage reaction',()=>{
 for(const [flinch,expected]of [[false,'idle'],[true,'hit']]){
  const pose=createAshenPose(2000,false,false,false,true,flinch),limbs={};
  const context={time:0,health:2000,gait:0,velocity:zero,yawVelocity:0,airborne:false,ability:null};
  pose(limbs,{},zero,0,{},context);
  const frame=pose(limbs,{},zero,0,{}, {...context,time:1,health:1900});
  assert.equal(frame.clip,model.clips[expected].name);
 }
});

test('M1 repeatedly releases fast six-ball volleys while moving; hit damage does not stop shooting',()=>{
 const e=create('fast-m1','pilot',100000,()=>135,[]),origin={...e.frame.position},yaw=e.frame.yaw;
 const target=titanAnchor(origin,yaw,{x:0,y:1800,z:6000}),volleys=[],counts=new Map();let maxSpeed=0;
 try{
  for(let i=1;i<=600;i++){
   const now=100000+i*50;stepM19(e,target,zero,500,now);
   const frame=e.frame;maxSpeed=Math.max(maxSpeed,Math.hypot(frame.velocity.x,frame.velocity.z));
   assert(['idle','walk','turn','roar','shoot'].some(key=>frame.animation.clip===model.clips[key].name));
   assert(frame.projectiles.length<=32);
   for(const event of e.events.filter(v=>v.type==='release')){
    if(!counts.has(event.attackId))volleys.push(now);
    counts.set(event.attackId,(counts.get(event.attackId)??0)+1);

   }
   for(const shot of frame.projectiles)assert(Math.abs(Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)-1800)<1e-6);
   if(frame.ability?.stage==='WINDUP'){
    const oldId=frame.ability.eventId,body=frame.limbs.body;
    e.engine.damage({encounterId:e.attemptId,source:'pilot',sequence:i,from:{x:body.x-4000,y:body.y,z:body.z},to:{x:body.x+4000,y:body.y,z:body.z},amount:1,radius:1,delta:0});
    assert.equal(e.engine.snapshot().ability?.eventId,oldId);
   }
  }
  assert(maxSpeed>1000);assert(volleys.length>=6,`Only ${volleys.length} volleys in 30 seconds: ${JSON.stringify(volleys)} ${JSON.stringify([...counts])}`);
  assert([...counts.values()].every(count=>count===6),JSON.stringify([...counts]));
 }finally{disposeM19(e);}
});


test('a continuously eligible M1 target receives a new volley about every two seconds',()=>{
 const cfg=structuredClone(species);
 // Hold movement nearly still to measure firing cadence without target-facing changes.
 cfg.movement.walk=.01;cfg.movement.run=.01;cfg.movement.acceleration=.01;cfg.movement.deceleration=.01;
 const e=createM19Encounter('cadence','pilot',0,()=>135,[],2000,new SpeciesRegistry().register(cfg),{geometry,spawn:journeyDallas23.monster,environmentDamage:false,articulate:createAshenPose(2000,false,false,false,true,false)});
 const target=titanAnchor(e.frame.position,e.frame.yaw,{x:0,y:1800,z:6000}),times=[];
 try{
  for(let ms=50;ms<=12000;ms+=50){
   stepM19(e,target,zero,500,ms);
   if(e.events.some(v=>v.type==='release'))times.push(ms);
  }
  assert(times.length>=5,JSON.stringify(times));
  for(let i=1;i<times.length;i++)assert(times[i]-times[i-1]>=2000&&times[i]-times[i-1]<=2250,JSON.stringify(times));
 }finally{disposeM19(e);}
});


test('M1 roars during gameplay, stays still through the roar, and resumes shooting without running or powering up',()=>{
 const e=create('roar-m1','pilot',0,()=>135,[]),origin={...e.frame.position},yaw=e.frame.yaw;
 const target=titanAnchor(origin,yaw,{x:0,y:1800,z:6000});let roars=0,roarFrames=0,shotsAfterRoar=0;
 try{
  for(let ms=50;ms<=55000;ms+=50){
   stepM19(e,target,zero,100,ms);const f=e.frame;
   assert(['idle','walk','turn','roar','shoot'].some(key=>f.animation.clip===model.clips[key].name));
   for(const event of e.events){
    if(event.type==='roar')roars++;
    if(event.type==='release'&&roars>0)shotsAfterRoar++;
   }
   if(f.animation.clip===model.clips.roar.name){roarFrames++;assert.equal(f.ability,null);assert(Math.hypot(f.velocity.x,f.velocity.z)<.5);}
  }
  assert(roars>=2);assert(roarFrames>50);assert(shotsAfterRoar>=6);
  assert.equal(finalWarlordSpecies.director.roarInterval,species.director.roarInterval);
 }finally{disposeM19(e);}
});

test('M1 stays inside the invisible 24 km downtown area, brakes naturally, and reengages when the pilot returns',()=>{
 const area=pursuitWarlord.downtown;
 for(const side of [-1,1]){
  const e=create(`downtown-${side}`,'pilot',0,()=>135,[]),origin={...e.frame.position};let maxRadius=0,settled=0;
  try{
   for(let ms=50;ms<=210000;ms+=50){
    const target=ms<150000?{x:area.x+side*80000,y:3000,z:area.z+side*60000}:{x:area.x,y:2000,z:area.z};
    const before={...e.frame.position};stepM19(e,target,zero,100,ms);const f=e.frame;
    const radius=Math.hypot(f.position.x-area.x,f.position.z-area.z);maxRadius=Math.max(maxRadius,radius);
    assert(radius<area.radius-species.radius,'entire monster remains inside its area');
    assert(Math.hypot(f.position.x-before.x,f.position.z-before.z)<=species.movement.run*.051,'movement never teleports');
    if(ms>120000&&ms<150000&&Math.hypot(f.velocity.x,f.velocity.z)<.1){settled++;assert.notEqual(f.animation.clip,model.clips.walk.name,'stopped monster must not walk in place');}
   }
   assert(maxRadius>17000);assert(settled>30);assert(Math.hypot(e.frame.position.x-area.x,e.frame.position.z-area.z)<maxRadius-3000,'returns toward downtown');
   assert(Math.hypot(e.frame.position.x-origin.x,e.frame.position.z-origin.z)>1000);
  }finally{disposeM19(e);}
 }
});

test('M1 updates on the runway from mission start, while pause, countdown and M2 runway gating stay intact',()=>{
 const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function updateMonsterEncounters('),source.indexOf('function applyTransportHit('));
 const code=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [mission,status,paused,expected] of [[missions.journeyDallas23,'RACING',false,1],[missions.journeyDallas23,'APPROACH',false,0],[missions.journeyDallas23,'RACING',true,0],[missions.journeyDallas19,'RACING',false,0]]){
  let steps=0;const encounter={attemptId:'a',playerId:'pilot',projectileIds:new Set(),events:[],lastBroadcastAt:1000};
  const context=vm.createContext({...missions,monsterEncounters:new Map([['a',encounter]]),pausedJourneyAttempts:new Set(paused?['a']:[]),players:new Map([['pilot',{pilotId:'p',position:{x:0,y:0,z:0},velocity:zero,aircraftType:'trainer'}]]),journeyStore:{activeSnapshot:()=>({missionId:mission.id,status,deadlineAt:2000})},playerJourneyRunwayPrep:new Set(['pilot']),aircraftHitRadii:{trainer:10},stepM19:()=>steps++});
  vm.runInContext(code+';updateMonsterEncounters(1000)',context);assert.equal(steps,expected);
 }
});

test('M1 central fireball damages a stationary runway aircraft on its first volley instead of hitting terrain first',()=>{
 for(const height of [0,5,15,100,300]){
  const e=create(`runway-hit-${height}`,'pilot',0,()=>135,[]),root=e.frame.position;
  const target={x:root.x+2500,y:135+height,z:root.z};let damage=0,firstHit=Infinity;
  try{
   for(let ms=50;ms<=4000;ms+=50){
    stepM19(e,target,zero,2.8,ms);
    for(const event of e.events)if(event.type==='projectile'&&event.kind==='damage'){firstHit=Math.min(firstHit,ms);damage+=permittedM19Damage(e,event,ms);}
   }
   assert(firstHit<=3500,'first aimed fireball reaches the runway aircraft');assert(damage>=25);
  }finally{disposeM19(e);}
 }
 assert.equal(finalWarlordSpecies.abilities.find(a=>a.mechanism==='projectile').groundClearanceAim,true,'both missions clear the runway with their large fireballs');
});

test('M2 runs, turns and roars with M1 shooting, never rushes, punches or flinches even under fire',()=>{
 const m2=finalWarlordSpecies;
 assert.deepEqual(m2.animations,['idle','run','turn','roar','shoot','defeat']);
 assert.equal(m2.movement.chargeSpeed,0);assert(m2.movement.runOnly);
 assert.equal(m2.movement.turnRate,species.movement.turnRate);assert.equal(m2.movement.turnAcceleration,species.movement.turnAcceleration);
 assert.deepEqual(m2.abilities,species.abilities.map(a=>({...a,count:12})));assert.equal(m2.director.roarDuration,species.director.roarDuration);
 const e=createFinal('m2-six-motions','pilot',0,()=>135,[]),origin={...e.frame.position};
 let roars=0,releases=0,running=0,damaged=0;
 try{
  for(let ms=50;ms<=65000;ms+=50){
   const target={x:origin.x+14000,y:2500,z:origin.z+Math.sin(ms/15000)*3000};
   if(ms%3000===0){const p=e.frame.limbs.body;damaged+=e.engine.damage({encounterId:e.attemptId,source:'pilot',sequence:ms,from:{x:p.x-4000,y:p.y,z:p.z},to:{x:p.x+4000,y:p.y,z:p.z},amount:25,radius:1,delta:0});}
   const before={...e.frame.position};stepM19(e,target,zero,20,ms);const f=e.frame;
   assert(['idle','run','turn','roar','shoot'].some(key=>model.clips[key].name===f.animation.clip));
   assert(Math.hypot(f.position.x-before.x,f.position.z-before.z)<=m2.movement.run*.051);
   if(f.animation.clip===model.clips.run.name)running++;
   for(const event of e.events){if(event.type==='roar')roars++;if(event.type==='release')releases++;}
   if(f.animation.clip===model.clips.roar.name)assert(Math.hypot(f.velocity.x,f.velocity.z)<.5);
  }
  assert(damaged>0);assert(running>50);assert(roars>=2);assert(releases>=12);
 }finally{disposeM19(e);}
});
