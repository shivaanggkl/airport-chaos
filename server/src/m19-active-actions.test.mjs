import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {createStationaryWarlordEncounter} from './stationary-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
const make=()=>createStationaryWarlordEncounter('active','pilot',0,()=>135,[]),zero={x:0,y:0,z:0};
test('M19 roars early and regularly, finishes each authored roar, and remains stationary and harmless at distance',()=>{
 const e=make(),position={...e.frame.position},yaw=e.frame.yaw,roars=[],durations=[];let current;
 try{
  for(let ms=50;ms<=42000;ms+=50){
   stepM19(e,{x:position.x,y:position.y+3000,z:position.z+6000},zero,18,ms);
   for(const event of e.events)if(event.kind==='animation'&&event.type==='roar')roars.push(ms/1000);
   if(e.frame.animation.clip===model.clips.roar.name){current??=ms;}
   else if(current!==undefined){durations.push((ms-current)/1000);current=undefined;}
   assert.deepEqual(e.frame.position,position);assert.equal(e.frame.yaw,yaw);
   assert(!e.events.some(v=>v.kind==='damage'));assert.equal(e.frame.projectiles.length,0);
  }
  assert(roars[0]<=.2);assert(roars.length>=4);
  for(let index=1;index<roars.length;index++)assert(roars[index]-roars[index-1]>=6.5&&roars[index]-roars[index-1]<7);
  assert(durations.length>=3);assert(durations.every(seconds=>seconds>=model.clips.roar.duration-.15),'full roar plays without early reset');
 }finally{disposeM19(e);}
});

for(const speed of [aircraftFlightEnvelope.trainer.maxSpeed,aircraftFlightEnvelope.fighter.maxSpeed*aircraftFlightEnvelope.fighter.boostMaxSpeed])test(`M19 anticipates an incoming ${speed.toFixed(0)} m/s pass and only genuine fist contact damages`,()=>{
 const e=make(),limbs={};
 try{
  createAshenPose(500,true)(limbs,{},e.frame.position,e.frame.yaw,{}, {time:.7,health:500,gait:0,velocity:zero,yawVelocity:0,airborne:false,ability:{id:'hand-strike',stage:'ACTIVE',progress:.5,elapsed:.7,active:.3,warning:.35,windup:.2,recovery:1.4}});
  const hand=limbs['hand-left'],v={x:-Math.sin(e.frame.yaw)*speed,y:0,z:-Math.cos(e.frame.yaw)*speed};
  let windup,damage=0;
  for(let ms=50;ms<=2000;ms+=50){
   const t=ms/1000-.75,p={x:hand.x+v.x*t,y:hand.y,z:hand.z+v.z*t};
   stepM19(e,p,v,18,ms);
   if(e.frame.ability?.id==='hand-strike')windup??=ms;
   for(const event of e.events)if(event.kind==='damage'&&event.type==='sweep'){
    assert.equal(e.frame.ability.stage,'ACTIVE');assert.equal(event.ability,'hand-strike');assert.equal(event.amount,15);
    damage+=permittedM19Damage(e,event,100000+ms);
   }
  }
  assert(windup<400,'punch prepares before the aircraft has already passed');assert(damage>0,'properly timed fast pass reaches the real authored fist');
 }finally{disposeM19(e);}
});

test('M19 roar audio follows received animation snapshots once, even if the network omitted its event',()=>{
 const source=readFileSync(new URL('../../client/src/monster-arrival.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('monster-arrival.ts',source,ts.ScriptTarget.Latest,true);
 let code;
 function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(ast).startsWith('this.stationary && f.animation?.clip==='))code=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(code);
 let count=0;const state={stationary:true,lastStationaryRoarStart:null,onRoar:()=>count++};
 const ctx=vm.createContext({ashenWarlordModel:model,state,f:null});
 vm.runInContext(ts.transpileModule(`function receive(){${code}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 for(const [time,clipTime] of [[3.15,.15],[3.25,.25],[4,1],[15.1,.1],[15.2,.2]]){
  ctx.f={time,animation:{clip:model.clips.roar.name,time:clipTime},events:[]};vm.runInContext('receive.call(state)',ctx);
 }
 assert.equal(count,2,'one sound for each roar, not every snapshot');
 state.stationary=false;ctx.f={time:27,animation:{clip:model.clips.roar.name,time:0},events:[]};vm.runInContext('receive.call(state)',ctx);assert.equal(count,2,'other mission sound handling remains unchanged');
});


test('M19 reset restarts the early roar schedule without replaying an old roar',()=>{
 const e=make(),far={x:e.frame.position.x,y:e.frame.position.y+3000,z:e.frame.position.z+6000};
 try{
  for(let ms=50;ms<=5000;ms+=50)stepM19(e,far,zero,18,ms);
  e.engine.reset();const roars=[];
  for(let ms=5050;ms<=9000;ms+=50){stepM19(e,far,zero,18,ms);if(e.events.some(v=>v.kind==='animation'&&v.type==='roar'))roars.push(ms);}
  assert.equal(roars.length,1);assert(roars[0]>=5050&&roars[0]<5350);
 }finally{disposeM19(e);}
});


test('M19 actual client model plays a mostly active continuous cycle with short recoveries and normalized crossfades',async()=>{
 const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js'),THREE=await import('three');
 const {AshenWarlordModel}=await import('../../client/src/ashen-warlord-model.js');
 const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
 const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
 const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const actor=new AshenWarlordModel(source,true);await actor.ready;
 const e=make(),far={x:e.frame.position.x,y:e.frame.position.y+3000,z:e.frame.position.z+6000};
 let idle=0,idleStreak=0,maxIdle=0;const poses=new Map(),hand=new THREE.Vector3();
 try{
  for(let ms=50;ms<=26000;ms+=50){
   stepM19(e,far,zero,18,ms);actor.root.position.set(e.frame.position.x,e.frame.position.y,e.frame.position.z);actor.root.rotation.y=e.frame.yaw;
   actor.setTitanPose(e.frame);actor.update(.05,2000,0);
   const animation=e.frame.animation;
   if(ms===50)assert.equal(animation.clip,model.clips.roar.name,'first gameplay snapshot is already acting');
   if(animation.clip===model.clips.idle.name){idle+=.05;idleStreak+=.05;maxIdle=Math.max(maxIdle,idleStreak);}else idleStreak=0;
   const weights=[...actor.actions.values()].filter(a=>a.enabled).map(a=>a.getEffectiveWeight());
   assert(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6,'crossfade weights sum to one without conflicting clips');
   if(animation.blend>.95){actor.handPosition('left',hand);const samples=poses.get(animation.clip)??[];samples.push(hand.clone());poses.set(animation.clip,samples);}
   assert.equal(e.frame.ability,null,'out-of-reach threat punches do not fabricate attacks');
   assert(!e.events.some(event=>event.kind==='damage'));
  }
  assert(idle/26<.15,`too much idle: ${idle}s`);assert(maxIdle<=.75,`long idle gap: ${maxIdle}s`);
  for(const key of ['punch','roar']){
   const samples=poses.get(model.clips[key].name);assert(samples?.length>10,`client never played ${key}`);
   const movement=Math.max(...samples.map(p=>p.distanceTo(samples[0])));assert(movement>50,`${key} must move the actual skeleton`);
  }
 }finally{actor.dispose();disposeM19(e);}
});
