import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {journeyDallasSharpshooter01,journeyDallasSharpshooter02 as mission} from '../../shared/journey-mission.mjs';
import {movingTargetPlacements,sharpshooterTargetPose} from '../../shared/sharpshooter-target.mjs';
import {journeyCategorySlot} from '../../shared/journey-categories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {createSharpshooterTarget,sharpshooterHitFraction} from './sharpshooter-target.js';
import {PlayerProfileStore} from './player-profiles.js';
import {JourneyAttemptStore} from './journey-attempts.js';
const spawn={x:-15000,y:800,z:-23000};
const targets=()=>movingTargetPlacements.map((_,stage)=>createSharpshooterTarget(stage,spawn,.7,0,()=>50,mission.id));

test('Moving Targets is chapter two mission two with six mapped anchors, four moving and two stationary',()=>{
 assert.equal(journeyCategorySlot(mission.id)?.categoryId,'shooting-targets');
 assert.equal(journeyCategorySlot(mission.id)?.categoryNumber,2);
 assert.equal(mission.timeLimitMs,180000);assert.equal(mission.firstClearCredits,950);
 const list=targets();assert.equal(list.length,6);
 for(const [i,target]of list.entries()){
  assert.equal(target.x,movingTargetPlacements[i]!.x);assert.equal(target.z,movingTargetPlacements[i]!.z);
  const start=sharpshooterTargetPose(target,0,{x:0,y:0,z:0});
  const later=sharpshooterTargetPose(target,2500,{x:0,y:0,z:0});
  assert.equal(later.x-start.x,i<4?450:0);assert.equal(later.z,start.z);
  assert.deepEqual(sharpshooterTargetPose(target,10000,{x:0,y:0,z:0}),start);
 }
 assert.ok(missionFocusForAttempt({missionId:mission.id,status:'RACING'}));
});

test('moving target sweep clears scenery and uses the same physical face-hit validation',()=>{
 for(const target of targets()){
  const t=createSharpshooterTarget(target.stage,spawn,0,0,()=>1500,mission.id);
  assert.ok(t.y>=1500+mission.targetRadius+150);
  const pose=sharpshooterTargetPose(t,2500,{x:0,y:0,z:0});
  const pilot={x:pose.x,y:pose.y,z:pose.z+1000};
  assert.notEqual(sharpshooterHitFraction(t,t.stage,{...pose,z:pose.z+500},{...pose,z:pose.z-500},2500,.1,pilot),null);
  assert.equal(sharpshooterHitFraction(t,t.stage,{x:pose.x+1000,y:pose.y,z:pose.z+500},{x:pose.x+1000,y:pose.y,z:pose.z-500},2500,.1,pilot),null);
 }
});

test('mission two unlocks after target mission one, preserves all target state, and grants 950 exactly once',()=>{
 const directory=mkdtempSync(join(tmpdir(),'moving-targets-')),path=join(directory,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');
 const db=new DatabaseSync(path);let store=new JourneyAttemptStore(path);const now=Date.now();
 try{
  assert.equal(store.canAccessMission('pilot',mission.id),false);
  db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('pilot',journeyDallasSharpshooter01.id,'m1',now,1000);
  assert.equal(store.canAccessMission('pilot',mission.id),true);
  const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now+1);store.prepareSharpshooter('pilot',a.attemptId,targets());assert.equal(store.get('pilot',a.attemptId)!.deadlineAt,null);return store.startSharpshooter('pilot',a.attemptId,now+1000)!;};
  const a=start();assert.equal(a.deadlineAt,now+181000);
  store.pause('pilot',a.attemptId,now+2000);
  assert.equal(store.hitSharpshooter('pilot',a.attemptId,0,now+2100),undefined);
  store=new JourneyAttemptStore(path);assert.deepEqual(store.get('pilot',a.attemptId)!.sharpshooter!.targets,targets());
  assert.equal(store.resume('pilot',a.attemptId,now+3000)!.attempt.deadlineAt,a.deadlineAt!+1000);
  for(const stage of [3,0,5,1,4,2]){assert.ok(store.hitSharpshooter('pilot',a.attemptId,stage,now+4000+stage));assert.equal(store.hitSharpshooter('pilot',a.attemptId,stage,now+5000+stage),undefined);}
  assert.equal(store.get('pilot',a.attemptId)!.firstClearCredits,950);
  const replay=start();for(let i=0;i<6;i++)store.hitSharpshooter('pilot',replay.attemptId,i,now+4000+i);
  assert.equal(store.get('pilot',replay.attemptId)!.firstClearCredits,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,1);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('radar renders every remaining target and pins distant mission targets to the edge',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');const ts=await import('typescript');
 const source=readFileSync('client/src/main.ts','utf8');
 const loopStart=source.indexOf('    for(const [stage,view]of sharpshooterViews)');
 const loopEnd=source.indexOf('\n  const hopDestination',loopStart);
 assert.ok(loopStart>0&&loopEnd>loopStart);
 const calls:unknown[][]=[];
 vm.runInNewContext(ts.transpileModule(source.slice(loopStart,loopEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{
  sharpshooterViews:new Map(targets().map(t=>[t.stage,{root:{position:sharpshooterTargetPose(t,2500,{x:0,y:0,z:0}),userData:{}}}])),
  direction:{x:0,z:-1},drawRadarMarker:(...args:unknown[])=>calls.push(args),
 });
 assert.equal(calls.length,6);assert.deepEqual(calls.map(call=>call[4]),['TARGET 1','TARGET 2','TARGET 3','TARGET 4','TARGET 5','TARGET 6']);
 const start=source.indexOf('function drawRadarMarker('),end=source.indexOf('  const x = center + radarX;',start);
 const projection=ts.transpileModule(source.slice(start,end)+'return {radarX,radarY,pinned};\n}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const t of targets()){
  const result=vm.runInNewContext(projection+`drawRadarMarker({x:0,z:-1},${t.x},${t.z},'mission')`,{radarCanvas:{width:180},airplane:{position:spawn},radarRange:6000});
  assert.ok(result);assert.ok(Math.hypot(result.radarX,result.radarY)<=77.0001);
 }
});

test('mission two reuses the screenplay overview and keeps all six mapped targets in frame',async()=>{
 const THREE=await import('three');const {SharpshooterIntro}=await import('../../client/src/sharpshooter-intro.js');
 const points=targets().map(t=>new THREE.Vector3(t.x,t.y,t.z));
 for(const aspect of [956/440,812/375]){
  const scene=new THREE.Scene(),aircraft=new THREE.Group();aircraft.position.set(spawn.x,spawn.y,spawn.z);
  const camera=new THREE.PerspectiveCamera(60,aspect,.1,126000),intro=new SharpshooterIntro(scene,points,mission.targetRadius);
  const chase=aircraft.position.clone().add(new THREE.Vector3(0,100,500)),look=aircraft.position.clone();
  for(const time of [0,2500,7000,10500]){
   intro.sample(time,0,camera,aircraft,chase,look,60,()=>{});
   camera.far=Math.max(126000,camera.position.distanceTo(intro.cameraTarget)*2);camera.updateProjectionMatrix();
   for(const point of points){const projected=point.clone().project(camera);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z<1);}
  }
  intro.sample(12000,1,camera,aircraft,chase,look,60,()=>{});assert.ok(camera.position.equals(chase));intro.dispose();
 }
});
