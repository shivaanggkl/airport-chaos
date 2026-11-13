import { SharpshooterIntro } from '../../client/src/sharpshooter-intro.js';
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
   store.approach('pilot',a.attemptId,now+1);store.prepareSharpshooter('pilot',a.attemptId,[target(0),target(1),target(2)]);
   return store.startSharpshooter('pilot',a.attemptId,now+15_000)!;};
 return {path,store,db,now,start,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M08 activates only its unique slot; all aircraft spawn safely, no opponents, timer after handoff',()=>{
 assert.equal(journeyCatalog.length,30);assert.equal(journeyCatalog[7]!.id,mission.id);assert.notEqual(mission.id,journeyDallas08.id);
 const f=fixture();try{for(const aircraft of ['trainer','cargo','jet','fighter']){
  const a=f.store.launch('pilot',aircraft,f.now,mission.id),approach=f.store.approach('pilot',a.attemptId,f.now+1)!;
  assert.equal(approach.deadlineAt,null);assert.equal(f.store.startSharpshooter('pilot',a.attemptId),undefined);
  const spawn=authorizedJourneyAirborneSpawn(approach,mission,()=>123)!;assert.equal(spawn.position.y,923);
  f.store.prepareSharpshooter('pilot',a.attemptId,[target(0),target(1),target(2)]);
  const race=f.store.startSharpshooter('pilot',a.attemptId,f.now+15_000)!;
  assert.equal(race.deadlineAt! - race.startedAt!,180_000);assert.equal(missionFocusForAttempt(race)!.showAmbientAIAircraft,false);
 }}finally{f.close();}
});
test('separated target locations and heights, safe clearance, moving sweep and real swept face hits',()=>{
 for(let stage=0;stage<3;stage++){
  const t=target(stage,1000);assert.ok(Math.abs(Math.hypot(t.x,t.z)-([2200,3900,5000][stage]!))<1e-9);
  assert.equal(t.heading,stage===1?Math.PI*35/180:stage===2?-Math.PI*40/180:0);
  assert.equal(t.y,position.y+stage*500);
  const center=sharpshooterTargetPose(t,1000,{...position});
  const end={x:center.x*1.1,y:position.y+(center.y-position.y)*1.1,z:center.z*1.1};
  assert.notEqual(sharpshooterHitFraction(t,stage,position,end,1000,.05,position),null);
  assert.equal(sharpshooterHitFraction(t,stage-1,position,end,1000,.05,position),null);
  assert.equal(sharpshooterHitFraction(t,stage,{...position,y:center.y+400},{...end,y:center.y+400},1000,.05,position),null);
 }
 const t=target(2,1000),p={...position};
 assert.ok(Math.abs(Math.hypot(sharpshooterTargetPose(t,3000,p).x-t.x,p.z-t.z)-150)<1e-8);
 assert.ok(Math.abs(Math.hypot(sharpshooterTargetPose(t,7000,p).x-t.x,p.z-t.z)-150)<1e-8);
 assert.deepEqual(sharpshooterTargetPose(t,9000,p),sharpshooterTargetPose(t,1000,{...position}));
 assert.equal(mission.targetRadius,220);
 assert.equal(createSharpshooterTarget(0,position,0,0,()=>1000).y,1370);
 // A segment inside the old invisible sphere but never reaching the face is a miss.
 const first=target();assert.equal(sharpshooterHitFraction(first,0,{x:0,y:800,z:-1700},{x:0,y:800,z:-1750},0,.05,position),null);
});
test('three physical contacts in any order advance once, persist across reopen, and award exactly 800 once',()=>{
 const f=fixture();try{
  const a=f.start();assert.equal(a.sharpshooter!.targets.length,3);let store=f.store;
  for(const [count,stage]of [2,0,1].entries()){
   const current=store.get('pilot',a.attemptId)!,t=current.sharpshooter!.targets.find(t=>t.stage===stage)!;
   const end={x:t.x*1.1,y:t.y,z:t.z*1.1};
   assert.notEqual(sharpshooterHitFraction(t,stage,position,end,stage*1000,.05,position),null);
   assert.equal(store.hitSharpshooter('other',a.attemptId,stage,f.now+16_000+stage*1000),undefined);
   const advanced=store.hitSharpshooter('pilot',a.attemptId,stage,f.now+16_000+stage*1000)!;
   assert.equal(advanced.sharpshooter!.destroyed,count+1);
   assert.equal(store.hitSharpshooter('pilot',a.attemptId,stage,f.now+16_000+stage*1000),undefined);
   store=new JourneyAttemptStore(f.path,true);assert.equal(store.get('pilot',a.attemptId)!.sharpshooter!.destroyed,count+1);
  }
  const end=store.get('pilot',a.attemptId)!;assert.equal(end.status,'COMPLETED');assert.equal(end.firstClearCredits,800);assert.deepEqual(end.sharpshooter!.targets,[]);
  const replay=f.start();for(let stage=0;stage<3;stage++)f.store.hitSharpshooter('pilot',replay.attemptId,stage,f.now+16_000+stage*1000);
  assert.equal(f.store.get('pilot',replay.attemptId)!.firstClearCredits,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,1);
 }finally{f.close();}
});
test('pause, timeout, retry, abandon and verified continuation preserve only legitimate stage',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId,at=f.now+16_000;
  f.store.hitSharpshooter('pilot',id,0,at);
  f.store.pause('pilot',id,at+100);
  assert.equal(f.store.hitSharpshooter('pilot',id,1,at+101),undefined);
  const resumed=f.store.resume('pilot',id,at+1100)!;assert.equal(resumed.attempt.deadlineAt,a.deadlineAt!+1000);
  assert.equal(f.store.hitSharpshooter('pilot',id,1,resumed.attempt.deadlineAt!),undefined);
  f.store.fail('pilot',id,'CRASHED',at+1200);
  assert.equal(f.store.saveContinuation('pilot',id,at+1200,{position,heading:0,bots:[]}),true);
  const adUnitId='ca-app-pub-3940256099942544/5224354917';
  const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId},webEnabled:false,providerRewardAmount:'1'});
  const ad=ads.createAttempt('pilot','android',at+1201,`${id}:${at+1200}`);assert.ok(ad.ok);if(!ad.ok)throw Error('ad unavailable');
  assert.equal(ads.grantVerifiedReward({adUnit:adUnitId,customData:ad.attempt.attemptId,rewardAmount:'1',rewardItem:'reward',timestamp:at+1202,transactionId:'sharp-ad'},at+1202).rewarded,true);
  const continued=f.store.continueAfterAd('pilot',id,ad.attempt.attemptId,at+1203)!;
  assert.equal(continued.sharpshooter!.destroyed,1);assert.equal(continued.sharpshooter!.targets.length,2);
  assert.ok(continued.deadlineAt!-(at+1203)<=180_000);
  const retry=f.start();assert.equal(retry.sharpshooter!.destroyed,0);f.store.abandon('pilot',retry.attemptId);
  assert.equal(f.store.hitSharpshooter('pilot',retry.attemptId,0,at+1300),undefined);
 }finally{f.close();}
});
test('one reusable target, both faces, deterministic motion, clean resource disposal',()=>{
 const scene=new THREE.Scene(),view=new SharpshooterTargetView(scene),pilot=new THREE.Vector3(0,800,0);
 const meshes=[...view.root.children] as THREE.Mesh[],geometries=new Set(meshes.map(m=>m.geometry)),materials=new Set(meshes.map(m=>m.material));
 let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
 for(let stage=0;stage<3;stage++){view.update(target(stage),2000,pilot);assert.equal(scene.children.length,1);assert.deepEqual(new Set((view.root.children as THREE.Mesh[]).map(m=>m.geometry)),geometries);}
 assert.equal(geometries.size,7);assert.equal(materials.size,7);assert.equal(meshes.length,12);
 const second=new SharpshooterTargetView(scene),third=new SharpshooterTargetView(scene);
 assert.deepEqual(new Set((second.root.children as THREE.Mesh[]).map(m=>m.geometry)),geometries);
 view.dispose();assert.equal(disposed,0);second.dispose();assert.equal(disposed,0);
 third.dispose();assert.equal(disposed,7);assert.equal(scene.children.length,0);
});

test('production intro frames all three targets with steady instructions and restores chase on finish or skip',async()=>{
 const {createContext,runInContext}=await import('node:vm'),ts=await import('typescript');
 const source=readFileSync('client/src/main.ts','utf8');
 const start=source.indexOf('function applyFlightLaunchCamera('),end=source.indexOf('  if (missionAirportHopIntro)',start);
 const branch=source.slice(start,end)+'return false;\n}';
 const classes=new Set<string>(),title:any={firstElementChild:{textContent:''},replaceChildren(e:any){this.firstElementChild=e;},classList:{toggle(){}}};
 let now=0,handoffs=0;
 const views=new Map([0,1,2].map(stage=>{const t=target(stage);return [t.x,t.y,t.z];}).map((p,i)=>[i,{root:{position:new THREE.Vector3(...p)}}]));
 const context=createContext({THREE,SharpshooterIntro,scene:new THREE.Scene(),sharpshooterIntroPresentation:undefined,
  impactFlashes:[],impactFlashPool:[],spawnFlash(){},window:{innerHeight:1080},
  sharpshooterViews:views,journeyDallasSharpshooter01:mission,flightLaunchState:'active',missionSharpshooterIntro:true,missionOneIntroPath:null,
  missionTwoIntroPath:null,missionThreeIntroPath:null,missionFourIntroPath:null,missionFiveIntroPath:null,missionSixIntroPath:null,
  performance:{now:()=>now},flightLaunchStartedAt:0,flightLaunchSkipStartedAt:undefined,FLIGHT_LAUNCH_SKIP_BLEND_MS:500,
  flightLaunchCurrentTarget:new THREE.Vector3(),flightLaunchOrbitPosition:new THREE.Vector3(),
  sharpshooterPosition:new THREE.Vector3(0,800,-1800),airplane:{position:new THREE.Vector3(0,800,0),quaternion:new THREE.Quaternion()},camera:new THREE.PerspectiveCamera(60,16/9,.1,126_000),
  flightLaunchTitle:title,document:{createElement:()=>({})},flightGameRoot:{classList:{toggle(name:string,on:boolean){if(on)classes.add(name);else classes.delete(name);}}},
  completeFlightLaunchCinematic(){handoffs++;context.flightLaunchState='complete';classes.clear();},
  chasePosition:new THREE.Vector3(0,810,100),chaseTarget:new THREE.Vector3(0,800,-100)});
 runInContext(ts.transpileModule(branch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const aspect of [16/9,9/16])for(const time of [0,500,2500]){
  context.camera.aspect=aspect;context.camera.updateProjectionMatrix();
  now=time;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);
  assert.equal(title.firstElementChild.textContent,'Aim, lock and shoot all 3 targets in any order before time runs out.');
  assert.equal(classes.has('sharpshooter-intro'),true);
  context.camera.updateMatrixWorld();
  for(const view of views.values())for(const dx of [-229,229])for(const dy of [-229,229]){
   const point=view.root.position.clone().add(new THREE.Vector3(dx,dy,0)).project(context.camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z<1,'all target rims stay in frame');
  }
 }
 now=0;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);
 const opening=context.camera.position.clone();
 now=500;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);
 assert.ok(context.camera.position.distanceTo(opening)>1,'camera moves immediately');
 assert.match(source,/sharpshooterIntroPresentation.begin\(airplane,getCurrentMuzzlePosition/);
 now=12000;runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,1);
 assert.ok(context.camera.position.equals(context.chasePosition));
 runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,1);
 context.flightLaunchState='active';context.flightLaunchSkipStartedAt=1000;now=1500;
 runInContext('applyFlightLaunchCamera(chasePosition,chaseTarget,60)',context);assert.equal(handoffs,2);
 const combatSet=source.slice(source.indexOf('const journeyCombatMissionIds'),source.indexOf('\n',source.indexOf('const journeyCombatMissionIds')));
 assert.match(combatSet,/journeyDallasSharpshooter01.id/);
 assert.match(source,/missionSharpshooterIntro=true;beginFlightLaunchCinematic\(\)/);
 assert.match(source,/updateSharpshooterTarget\(\)/);
});

test('bullseye search starts lock validation without a prior server selection and respects the shared 6 km envelope',async()=>{
 const {createContext,runInContext}=await import('node:vm'),ts=await import('typescript');
 const {COMBAT_RANGE,AIM_ENVELOPE,AIM_SWITCH_MARGIN,aimTargetScore}=await import('../../shared/protocol.mjs');
 assert.equal(COMBAT_RANGE,6000);
 const source=readFileSync('client/src/main.ts','utf8');
 const start=source.indexOf('function sharpshooterAimCandidate()'),end=source.indexOf('function updateCombatTarget(',start);
 const root=new THREE.Group();root.position.set(0,800,-5999);
 const context=createContext({journeyAttempt:{missionId:mission.id,status:'RACING',attemptId:'practice',sharpshooter:{targets:[{stage:0}]}},
  journeyDallasSharpshooter01:mission,sharpshooterViews:new Map([[0,{root}]]),combatOffset:new THREE.Vector3(),
  combatInverseQuaternion:new THREE.Quaternion(),airplane:{position:new THREE.Vector3(0,800,0),quaternion:new THREE.Quaternion()},
  COMBAT_RANGE,AIM_ENVELOPE,AIM_SWITCH_MARGIN,aimTargetScore,lockedTargetId:null});
 runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const select=()=>runInContext('sharpshooterAimCandidate()',context);
 assert.equal(select(),'bullseye:practice:0','acquires before any server aim packet');
 root.position.z=-6001;assert.equal(select(),null);
 root.position.set(5000,800,-100);assert.equal(select(),null,'outside forward aim envelope');
 root.position.set(0,800,-2000);assert.equal(select(),'bullseye:practice:0','reacquires after returning to aim');
 root.userData.pendingHit=true;assert.equal(select(),null);
 root.userData.pendingHit=false;context.journeyAttempt.status='APPROACH';assert.equal(select(),null);
 assert.match(source,/\?serverAimTargetId:sharpshooterAimCandidate\(\)/,'fresh server selection wins, local search bootstraps otherwise');
});

test('M08 moving demonstration uses real muzzle, shared crimson rounds and restores every aircraft after rendering',()=>{
 const positions=[0,1,2].map(stage=>{const t=target(stage);return new THREE.Vector3(t.x,t.y,t.z);});
 for(const size of [1,2,3,4]){
  const scene=new THREE.Scene(),intro=new SharpshooterIntro(scene,positions,mission.targetRadius);
  const plane=new THREE.Object3D();plane.position.set(0,800,0);plane.scale.setScalar(size);scene.add(plane);
  const original=plane.position.clone(),rotation=plane.quaternion.clone();
  const camera=new THREE.PerspectiveCamera(60,16/9,.1,126000),chase=new THREE.Vector3(0,840,120*size),look=new THREE.Vector3(0,800,-100);
  const impacts:THREE.Vector3[]=[];
  const sample=(time:number,blend=0)=>intro.sample(time,blend,camera,plane,chase,look,60,p=>impacts.push(p.clone()));
  sample(0);const first=camera.position.clone();sample(1000);assert.ok(camera.position.distanceTo(first)>100,'overview visibly sweeps');
  intro.begin(plane,()=>{},1000);assert.equal(plane.visible,false);intro.end(plane);assert.equal(plane.visible,true);
  for(const stage of [0,1,2]){
   const time=3000+stage*2500+1250;sample(time);
   assert.equal(intro.locked,true);assert.ok(intro.aimPoint.equals(positions[stage]!));
   intro.begin(plane,p=>p.set(0,0,-20).applyMatrix4(plane.matrixWorld),time);
   const round=scene.children.find(c=>c instanceof THREE.Mesh) as THREE.Mesh;
   assert.equal(round.visible,true);assert.equal((round.material as THREE.MeshPhongMaterial).color.getHex(),0xdc143c);
   const muzzle=new THREE.Vector3(0,0,-20).applyMatrix4(plane.matrixWorld);
   const axis=positions[stage]!.clone().sub(muzzle),travel=round.position.clone().sub(muzzle);
   assert.ok(travel.clone().cross(axis).length()<1e-5,'round follows one straight muzzle-to-target segment');
   intro.end(plane);assert.ok(plane.position.equals(original));assert.ok(plane.quaternion.equals(rotation));
   assert.equal(plane.scale.x,size);
   sample(3000+stage*2500+2000);
  }
  assert.equal(impacts.length,3);
  for(const boundary of [5500,8000]){sample(boundary-.1);const before=camera.position.clone();sample(boundary+.1);
   assert.ok(camera.position.distanceTo(before)<10,'no jump between target passes');}
  sample(12000,1);intro.begin(plane,()=>{},12000);assert.ok(plane.position.equals(original));intro.end(plane);
  assert.ok(camera.position.equals(chase));
  intro.dispose();assert.equal(scene.children.filter(c=>c instanceof THREE.Mesh).length,0);
 }
});

test('M08 completion preserves the final round and waits for impact and target disposal before success',async()=>{
 const {createContext,runInContext}=await import('node:vm'),ts=await import('typescript');
 const source=readFileSync('client/src/main.ts','utf8');
 const result={attemptId:'final-hit',missionId:mission.id,status:'COMPLETED',startedAt:1000,sharpshooter:{destroyed:3,targets:[]}};
 const events:string[]=[],root=new THREE.Group();root.userData={attemptId:result.attemptId,pendingHit:true};
 const views=new Map([[2,{root,dispose(){events.push('target removed');}}]]);
 const context=createContext({journeyAttempt:result,pendingSharpshooterCompletion:result,journeyDallasSharpshooter01:mission,
  sharpshooterViews:views,journeyServerTimeOffset:0,Date,airplane:{position:new THREE.Vector3()},
  sharpshooterPosition:new THREE.Vector3(),sharpshooterSelectedStage:2,serverAimTargetId:null,missionObjective:null,
  beginMissionClear(){events.push('success');}});
 const start=source.indexOf('function finishSharpshooterCompletion()'),end=source.indexOf('\nlet reinforcementArrivedUntil',start);
 runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 runInContext('updateSharpshooterTarget()',context);assert.equal(views.size,1);assert.deepEqual(events,[]);
 root.userData.pendingHit=false; // Shared assisted round has reached its confirmed impact.
 runInContext('updateSharpshooterTarget()',context);assert.deepEqual(events,['target removed','success']);
 runInContext('updateSharpshooterTarget()',context);assert.equal(events.length,2,'success starts once');
 context.pendingSharpshooterCompletion=result;context.journeyAttempt={...result,attemptId:'retry'};
 runInContext('finishSharpshooterCompletion()',context);assert.equal(context.pendingSharpshooterCompletion,null);
 const cleanupStart=source.indexOf('    const preserveSharpshooterImpact='),cleanupEnd=source.indexOf("    if (previousAttempt?.status === 'FAILED'",cleanupStart);
 const cleanup=ts.transpileModule(source.slice(cleanupStart,cleanupEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [missionId,status,clears]of [[mission.id,'COMPLETED',0],[mission.id,'FAILED',1],['another','COMPLETED',1]]as const){
  let count=0;
  runInContext(cleanup,createContext({journeyDallasSharpshooter01:mission,message:{attempt:{...result,missionId,status}},
   previousAttempt:{...result,status:'RACING'},clearProjectileVisuals(){count++;},clearCombatTarget(){}}));
  assert.equal(count,clears);
 }
});
