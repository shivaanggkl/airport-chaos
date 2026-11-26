import test from 'node:test';
import assert from 'node:assert/strict';
import {pursuitWarlordSpecies as species,createPursuitWarlordEncounter as create} from './pursuit-warlord.js';
import {finalWarlordSpecies} from './final-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {createM19Encounter,stepM19,disposeM19} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
import {titanAnchor} from '../../shared/titan-pose.mjs';
const zero={x:0,y:0,z:0};
const cycle=a=>a.warning+a.windup+a.active+a.recovery+a.cooldown;

test('M1 walks and turns six times faster, shoots six times more often, and fires three times faster without punches',()=>{
 const oldWalk=model.height*model.clips.walk.stride/model.clips.walk.duration*.32;
 assert.equal(species.movement.walk,oldWalk*6);assert.equal(species.movement.run,oldWalk*6);
 assert.equal(species.movement.acceleration,oldWalk*6/1.5);assert.equal(species.movement.turnRate,.45*6);assert.equal(species.movement.turnAcceleration,.6*6);
 const shot=species.abilities.find(a=>a.mechanism==='projectile');assert(Math.abs(cycle(shot)-(0.9+0.4+1+0.8+9)/6)<1e-9);
 assert.equal(shot.projectileSpeed,3600);assert.equal(shot.count,6);assert.equal(shot.damage,25);assert.equal(shot.cooldown,1.5);
 assert.equal(species.movement.chargeSpeed,0);assert(species.abilities.every(a=>a.mechanism==='projectile'));
 assert.deepEqual(species.animations,['idle','walk','turn','roar','shoot','defeat']);assert.equal(shot.spreadPattern,'cluster');assert(species.abilities.every(a=>!a.interruptible));
 assert(finalWarlordSpecies.abilities.some(a=>a.mechanism==='sweep'));
 assert.equal(finalWarlordSpecies.abilities.find(a=>a.mechanism==='projectile').projectileSpeed,1600);
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
   for(const shot of frame.projectiles)assert(Math.abs(Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)-3600)<1e-6);
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
  assert(finalWarlordSpecies.director.roarInterval===undefined);
 }finally{disposeM19(e);}
});
