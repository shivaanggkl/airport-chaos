import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as THREE from 'three';
import { journeyDallasSharpshooter01 as mission, journeyCatalog, journeyDallas08 } from '../../shared/journey-mission.mjs';
import { sharpshooterTargetPose } from '../../shared/sharpshooter-target.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { createSharpshooterTarget, sharpshooterHitFraction } from './sharpshooter-target.js';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { PlayerProfileStore } from './player-profiles.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { RewardedAdStore } from './rewarded-ads.js';
import { SharpshooterTargetView } from '../../client/src/sharpshooter-target.js';

const position={x:0,y:800,z:0};
const target=(stage=0,elapsed=0)=>createSharpshooterTarget(stage,position,0,elapsed,()=>0);
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'sharpshooter-')),path=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');profiles.getOrCreate('other','Other');
 const store=new JourneyAttemptStore(path,true),db=new DatabaseSync(path),now=Date.now();
 const start=(aircraft='trainer')=>{const a=store.launch('pilot',aircraft,now,mission.id);
   store.approach('pilot',a.attemptId,now+1);store.prepareSharpshooter('pilot',a.attemptId,target());
   return store.startSharpshooter('pilot',a.attemptId,now+15_000)!;};
 return {path,store,db,now,start,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M08 activates only its unique slot; all aircraft spawn safely, no opponents, timer after handoff',()=>{
 assert.equal(journeyCatalog.length,30);assert.equal(journeyCatalog[7]!.id,mission.id);assert.notEqual(mission.id,journeyDallas08.id);
 const f=fixture();try{for(const aircraft of ['trainer','cargo','jet','fighter']){
  const a=f.store.launch('pilot',aircraft,f.now,mission.id),approach=f.store.approach('pilot',a.attemptId,f.now+1)!;
  assert.equal(approach.deadlineAt,null);assert.equal(f.store.startSharpshooter('pilot',a.attemptId),undefined);
  const spawn=authorizedJourneyAirborneSpawn(approach,mission,()=>123)!;assert.equal(spawn.position.y,923);
  f.store.prepareSharpshooter('pilot',a.attemptId,target());
  const race=f.store.startSharpshooter('pilot',a.attemptId,f.now+15_000)!;
  assert.equal(race.deadlineAt! - race.startedAt!,180_000);assert.equal(missionFocusForAttempt(race)!.showAmbientAIAircraft,false);
 }}finally{f.close();}
});
test('exact target sequence, 15 degree directions, safe clearance, moving sweep and real swept face hits',()=>{
 for(let stage=0;stage<3;stage++){
  const t=target(stage,1000);assert.ok(Math.abs(Math.hypot(t.x,t.z)-(1800+stage*200))<1e-9);
  assert.equal(t.heading,stage===1?Math.PI/12:stage===2?-Math.PI/12:0);
  const center=sharpshooterTargetPose(t,1000,{...position});
  const end={x:center.x*1.1,y:center.y,z:center.z*1.1};
  assert.notEqual(sharpshooterHitFraction(t,stage,position,end,1000,.05,position),null);
  assert.equal(sharpshooterHitFraction(t,stage-1,position,end,1000,.05,position),null);
  assert.equal(sharpshooterHitFraction(t,stage,{...position,y:1200},{...end,y:1200},1000,.05,position),null);
 }
 const t=target(2,1000),p={...position};
 assert.ok(Math.abs(Math.hypot(sharpshooterTargetPose(t,3000,p).x-t.x,p.z-t.z)-150)<1e-8);
 assert.ok(Math.abs(Math.hypot(sharpshooterTargetPose(t,7000,p).x-t.x,p.z-t.z)-150)<1e-8);
 assert.deepEqual(sharpshooterTargetPose(t,9000,p),sharpshooterTargetPose(t,1000,{...position}));
 assert.equal(createSharpshooterTarget(0,position,0,0,()=>1000).y,1260);
 // A segment inside the old invisible sphere but never reaching the face is a miss.
 const first=target();assert.equal(sharpshooterHitFraction(first,0,{x:0,y:800,z:-1700},{x:0,y:800,z:-1750},0,.05,position),null);
});
test('three physical contacts advance once, persist across reopen, and award exactly 800 once',()=>{
 const f=fixture();try{
  const a=f.start();let store=f.store;
  for(let stage=0;stage<3;stage++){
   const current=store.get('pilot',a.attemptId)!,t=current.sharpshooter!.target!;
   const end={x:t.x*1.1,y:t.y,z:t.z*1.1};
   assert.notEqual(sharpshooterHitFraction(t,stage,position,end,stage*1000,.05,position),null);
   assert.equal(store.hitSharpshooter('other',a.attemptId,stage,stage<2?target(stage+1):null,f.now+16_000+stage*1000),undefined);
   const advanced=store.hitSharpshooter('pilot',a.attemptId,stage,stage<2?target(stage+1,stage*1000):null,f.now+16_000+stage*1000)!;
   assert.equal(advanced.sharpshooter!.destroyed,stage+1);
   assert.equal(store.hitSharpshooter('pilot',a.attemptId,stage,stage<2?target(stage+1):null,f.now+16_000+stage*1000),undefined);
   store=new JourneyAttemptStore(f.path,true);assert.equal(store.get('pilot',a.attemptId)!.sharpshooter!.destroyed,stage+1);
  }
  const end=store.get('pilot',a.attemptId)!;assert.equal(end.status,'COMPLETED');assert.equal(end.firstClearCredits,800);assert.equal(end.sharpshooter!.target,null);
  const replay=f.start();for(let stage=0;stage<3;stage++)f.store.hitSharpshooter('pilot',replay.attemptId,stage,stage<2?target(stage+1):null,f.now+16_000+stage*1000);
  assert.equal(f.store.get('pilot',replay.attemptId)!.firstClearCredits,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,1);
 }finally{f.close();}
});
test('pause, timeout, retry, abandon and verified continuation preserve only legitimate stage',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId,at=f.now+16_000;
  f.store.hitSharpshooter('pilot',id,0,target(1),at);
  f.store.pause('pilot',id,at+100);
  assert.equal(f.store.hitSharpshooter('pilot',id,1,target(2),at+101),undefined);
  const resumed=f.store.resume('pilot',id,at+1100)!;assert.equal(resumed.attempt.deadlineAt,a.deadlineAt!+1000);
  assert.equal(f.store.hitSharpshooter('pilot',id,1,target(2),resumed.attempt.deadlineAt!),undefined);
  f.store.fail('pilot',id,'CRASHED',at+1200);
  assert.equal(f.store.saveContinuation('pilot',id,at+1200,{position,heading:0,bots:[]}),true);
  const adUnitId='ca-app-pub-3940256099942544/5224354917';
  const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId},webEnabled:false,providerRewardAmount:'1'});
  const ad=ads.createAttempt('pilot','android',at+1201,`${id}:${at+1200}`);assert.ok(ad.ok);if(!ad.ok)throw Error('ad unavailable');
  assert.equal(ads.grantVerifiedReward({adUnit:adUnitId,customData:ad.attempt.attemptId,rewardAmount:'1',rewardItem:'reward',timestamp:at+1202,transactionId:'sharp-ad'},at+1202).rewarded,true);
  const continued=f.store.continueAfterAd('pilot',id,ad.attempt.attemptId,at+1203)!;
  assert.equal(continued.sharpshooter!.destroyed,1);assert.equal(continued.sharpshooter!.target!.stage,1);
  assert.ok(continued.deadlineAt!-(at+1203)<=180_000);
  const retry=f.start();assert.equal(retry.sharpshooter!.destroyed,0);f.store.abandon('pilot',retry.attemptId);
  assert.equal(f.store.hitSharpshooter('pilot',retry.attemptId,0,target(1),at+1300),undefined);
 }finally{f.close();}
});
test('one reusable target, both faces, deterministic motion, clean resource disposal',()=>{
 const scene=new THREE.Scene(),view=new SharpshooterTargetView(scene),pilot=new THREE.Vector3(0,800,0);
 const meshes=[...view.root.children] as THREE.Mesh[],geometries=new Set(meshes.map(m=>m.geometry)),materials=new Set(meshes.map(m=>m.material));
 let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
 for(let stage=0;stage<3;stage++){view.update(target(stage),2000,pilot);assert.equal(scene.children.length,1);assert.deepEqual(new Set((view.root.children as THREE.Mesh[]).map(m=>m.geometry)),geometries);}
 assert.equal(geometries.size,7);assert.equal(materials.size,7);assert.equal(meshes.length,12);
 view.dispose();assert.equal(disposed,7);assert.equal(scene.children.length,0);
});

test('production intro shows all four lines, restores chase and hands off once on finish or skip; fire controls enabled',async()=>{
 const {createContext,runInContext}=await import('node:vm'),ts=await import('typescript');
 const source=readFileSync('client/src/main.ts','utf8');
 const start=source.indexOf('function applyFlightLaunchCamera('),end=source.indexOf('  if (missionAirportHopIntro)',start);
 const branch=source.slice(start,end)+'return false;\n}';
 const classes=new Set<string>(),title:any={firstElementChild:{textContent:''},replaceChildren(e:any){this.firstElementChild=e;},classList:{toggle(){}}};
 let now=0,handoffs=0;
 const context=createContext({THREE,flightLaunchState:'active',missionSharpshooterIntro:true,missionOneIntroPath:null,
  missionTwoIntroPath:null,missionThreeIntroPath:null,missionFourIntroPath:null,missionFiveIntroPath:null,missionSixIntroPath:null,
  performance:{now:()=>now},flightLaunchStartedAt:0,flightLaunchSkipStartedAt:undefined,FLIGHT_LAUNCH_SKIP_BLEND_MS:500,
  flightLaunchCurrentTarget:new THREE.Vector3(),flightLaunchOrbitPosition:new THREE.Vector3(),
  sharpshooterPosition:new THREE.Vector3(0,800,-1800),airplane:{position:new THREE.Vector3(0,800,0)},camera:new THREE.PerspectiveCamera(),
  flightLaunchTitle:title,document:{createElement:()=>({})},flightGameRoot:{classList:{toggle(name:string,on:boolean){if(on)classes.add(name);else classes.delete(name);}}},
  completeFlightLaunchCinematic(){handoffs++;context.flightLaunchState='complete';classes.clear();},
  chasePosition:new THREE.Vector3(0,810,100),chaseTarget:new THREE.Vector3(0,800,-100)});
 runInContext(ts.transpileModule(branch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const [time,line] of [[0,'SKY SHARPSHOOTER'],[3500,'Three targets are waiting in the sky!'],[7500,'Aim and shoot the glowing bullseyes.'],[9500,'Destroy all three before time runs out!']] as const){
  now=time;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(title.firstElementChild.textContent,line);
  assert.equal(classes.has('sharpshooter-intro'),time>=9000);
 }
 assert.ok((context.camera as THREE.PerspectiveCamera).position.equals(context.chasePosition as THREE.Vector3));
 now=12000;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,1);
 runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,1);
 context.flightLaunchState='active';context.flightLaunchSkipStartedAt=1000;now=1500;
 runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,2);
 const combatSet=source.slice(source.indexOf('const journeyCombatMissionIds'),source.indexOf('\n',source.indexOf('const journeyCombatMissionIds')));
 assert.match(combatSet,/journeyDallasSharpshooter01.id/);
 assert.match(source,/missionSharpshooterIntro=true;beginFlightLaunchCinematic\(\)/);
 assert.match(source,/updateSharpshooterTarget\(\)/);
});
