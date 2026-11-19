import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {journeyDallasSharpshooter01,journeyDallasSharpshooter02,journeyDallasSharpshooter03,journeyDallasSharpshooter04,journeyDallasSharpshooter05} from '../../shared/journey-mission.mjs';
import {movingTargetPlacements,doubleTroublePlacements,precisionFirePlacements,targetMasterPlacements,sharpshooterTargetPose} from '../../shared/sharpshooter-target.mjs';
import {journeyCategorySlot} from '../../shared/journey-categories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {createSharpshooterTarget,sharpshooterHitFraction} from './sharpshooter-target.js';
import {PlayerProfileStore} from './player-profiles.js';
import {JourneyAttemptStore} from './journey-attempts.js';
for(const mission of [journeyDallasSharpshooter02,journeyDallasSharpshooter03,journeyDallasSharpshooter04,journeyDallasSharpshooter05]){
const spawn={x:mission.airborneSpawn.x,y:mission.airborneSpawn.altitude,z:mission.airborneSpawn.z};
const placements=mission===journeyDallasSharpshooter02?movingTargetPlacements:mission===journeyDallasSharpshooter03?doubleTroublePlacements:mission===journeyDallasSharpshooter04?precisionFirePlacements:targetMasterPlacements;
const expected=mission===journeyDallasSharpshooter02?{number:2,count:6,moving:4,time:180000,reward:950}:mission===journeyDallasSharpshooter03?{number:3,count:8,moving:6,time:360000,reward:1100}:mission===journeyDallasSharpshooter04?{number:4,count:10,moving:8,time:195000,reward:1250}:{number:5,count:12,moving:12,time:540000,reward:1500};
const targets=()=>placements.map((_,stage)=>createSharpshooterTarget(stage,spawn,.7,0,()=>50,mission.id));

test(`${mission.name} has its mapped anchors and correct moving/stationary split`,()=>{
 assert.equal(journeyCategorySlot(mission.id)?.categoryId,'shooting-targets');
 assert.equal(journeyCategorySlot(mission.id)?.categoryNumber,expected.number);
 assert.equal(mission.timeLimitMs,expected.time);assert.equal(mission.firstClearCredits,expected.reward);
 assert.equal(placements.filter(point=>point.moving).length,expected.moving);
 const list=targets();assert.equal(list.length,expected.count);
 for(const [i,target]of list.entries()){
  assert.equal(target.x,placements[i]!.x);assert.equal(target.z,placements[i]!.z);
  const start=sharpshooterTargetPose(target,0,{x:0,y:0,z:0});
  const later=sharpshooterTargetPose(target,2500,{x:0,y:0,z:0});
  assert.equal(later.x-start.x,placements[i]!.moving?450:0);assert.equal(later.z,start.z);
  const cycle=sharpshooterTargetPose(target,10000,{x:0,y:0,z:0});
  assert.ok(Math.abs(cycle.x-start.x)<1e-8);assert.equal(cycle.y,start.y);assert.equal(cycle.z,start.z);
 }
 if(mission===journeyDallasSharpshooter04){
  assert.deepEqual(placements.flatMap((p,i)=>!p.moving?[i+1]:[]),[3,8]);
  assert.equal(new Set(list.map(t=>t.y)).size,10);
  for(const [i,t]of list.entries())assert.equal(t.y,precisionFirePlacements[i]!.altitude);
 }
 if(mission===journeyDallasSharpshooter05){
  assert.ok(placements.every(p=>p.moving));
  assert.equal(new Set(list.map(t=>t.y)).size,12);
  for(const [i,t]of list.entries())assert.equal(t.y,targetMasterPlacements[i]!.altitude);
 }
 assert.ok(missionFocusForAttempt({missionId:mission.id,status:'RACING'}));
});

test(`${mission.name} clears scenery and uses the same physical face-hit validation`,()=>{
 for(const target of targets()){
  const t=createSharpshooterTarget(target.stage,spawn,0,0,()=>1500,mission.id);
  assert.ok(t.y>=1500+mission.targetRadius+150);
  const pose=sharpshooterTargetPose(t,2500,{x:0,y:0,z:0});
  const pilot={x:pose.x,y:pose.y,z:pose.z+1000};
  assert.notEqual(sharpshooterHitFraction(t,t.stage,{...pose,z:pose.z+500},{...pose,z:pose.z-500},2500,.1,pilot),null);
  assert.equal(sharpshooterHitFraction(t,t.stage,{x:pose.x+1000,y:pose.y,z:pose.z+500},{x:pose.x+1000,y:pose.y,z:pose.z-500},2500,.1,pilot),null);
 }
});

test(`${mission.name} unlocks after its predecessor, preserves state and grants its reward exactly once`,()=>{
 const directory=mkdtempSync(join(tmpdir(),'moving-targets-')),path=join(directory,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');
 const db=new DatabaseSync(path);let store=new JourneyAttemptStore(path);const now=Date.now();
 try{
  assert.equal(store.canAccessMission('pilot',mission.id),false);
  for(const id of mission===journeyDallasSharpshooter02?[journeyDallasSharpshooter01.id]:[journeyDallasSharpshooter01.id,journeyDallasSharpshooter02.id,...(mission!==journeyDallasSharpshooter03?[journeyDallasSharpshooter03.id]:[]),...(mission===journeyDallasSharpshooter05?[journeyDallasSharpshooter04.id]:[])])
   db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('pilot',id,id,now,1000);
  assert.equal(store.canAccessMission('pilot',mission.id),true);
  const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now+1);store.prepareSharpshooter('pilot',a.attemptId,targets());assert.equal(store.get('pilot',a.attemptId)!.deadlineAt,null);return store.startSharpshooter('pilot',a.attemptId,now+1000)!;};
  const a=start();assert.equal(a.deadlineAt,now+1000+expected.time);
  store.pause('pilot',a.attemptId,now+2000);
  assert.equal(store.hitSharpshooter('pilot',a.attemptId,0,now+2100),undefined);
  store=new JourneyAttemptStore(path);assert.deepEqual(store.get('pilot',a.attemptId)!.sharpshooter!.targets,targets());
  assert.equal(store.resume('pilot',a.attemptId,now+3000)!.attempt.deadlineAt,a.deadlineAt!+1000);
  for(const stage of [3,0,5,1,4,2,7,6,9,8,11,10].filter(stage=>stage<expected.count)){assert.ok(store.hitSharpshooter('pilot',a.attemptId,stage,now+4000+stage));assert.equal(store.hitSharpshooter('pilot',a.attemptId,stage,now+5000+stage),undefined);}
  assert.equal(store.get('pilot',a.attemptId)!.firstClearCredits,expected.reward);
  const replay=start();for(let i=0;i<expected.count;i++)store.hitSharpshooter('pilot',replay.attemptId,i,now+4000+i);
  assert.equal(store.get('pilot',replay.attemptId)!.firstClearCredits,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,1);
 }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test(`${mission.name} renders every radar target and pins distant targets to the edge`,async()=>{
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
 assert.equal(calls.length,expected.count);assert.deepEqual(calls.map(call=>call[4]),placements.map((_,i)=>`TARGET ${i+1}`));
 const start=source.indexOf('function drawRadarMarker('),end=source.indexOf('  const x = center + radarX;',start);
 const projection=ts.transpileModule(source.slice(start,end)+'return {radarX,radarY,pinned};\n}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const t of targets()){
  const result=vm.runInNewContext(projection+`drawRadarMarker({x:0,z:-1},${t.x},${t.z},'mission')`,{radarCanvas:{width:180},airplane:{position:spawn},radarRange:6000});
  assert.ok(result);assert.ok(Math.hypot(result.radarX,result.radarY)<=77.0001);
 }
});

test(`${mission.name} keeps all mapped targets above ground and in frame during its screenplay`,async()=>{
 const THREE=await import('three');const {SharpshooterIntro}=await import('../../client/src/sharpshooter-intro.js');
 const {SharpshooterTargetView}=await import('../../client/src/sharpshooter-target.js');
 for(const aspect of [956/440,812/375]){
  const scene=new THREE.Scene(),aircraft=new THREE.Group();aircraft.position.set(spawn.x,spawn.y,spawn.z);
  const views=targets().map(target=>{const view=new SharpshooterTargetView(scene);view.update(target,0,aircraft.position);return view;});
  const positions=views.map(view=>view.root.position.clone());
  const points=views.map(view=>view.root.position);
  const camera=new THREE.PerspectiveCamera(60,aspect,.1,126000),intro=new SharpshooterIntro(scene,points,mission.targetRadius);
  const chase=aircraft.position.clone().add(new THREE.Vector3(0,100,500)),look=aircraft.position.clone();
  for(const [time,handoff] of [[0,0],[2500,0],[7000,0],[10500,0],[11250,.25],[11750,.75]]){
   intro.sample(time!,handoff!,camera,aircraft,chase,look,60,()=>{});
   camera.far=Math.max(126000,camera.position.distanceTo(intro.cameraTarget)*2);camera.updateProjectionMatrix();
   for(const [index,view]of views.entries()){
    view.beginIntro(camera,375,intro.overviewOpacity);
    view.root.updateWorldMatrix(true,true);
    const vertex=new THREE.Vector3();let lowest=Infinity;
    view.root.traverse(object=>{
     const mesh=object as import('three').Mesh;
     if(!mesh.isMesh)return;
     const points=mesh.geometry.getAttribute('position');
     for(let i=0;i<points.count;i++)lowest=Math.min(lowest,vertex.fromBufferAttribute(points,i).applyMatrix4(mesh.matrixWorld).y);
    });
    assert.ok(lowest>=positions[index]!.y-mission.targetRadius*1.04,`target ${index+1} lower edge ${lowest} remains above terrain during handoff ${handoff}`);
    const projected=view.root.position.clone().project(camera);
    if(handoff===0)assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z<1);
   }
   intro.updateLabels(camera);
   for(const [index,view]of views.entries()){
    view.endIntro();assert.ok(view.root.position.equals(positions[index]!),'gameplay position restored after every overview frame');
   }
  }
  intro.sample(12000,1,camera,aircraft,chase,look,60,()=>{});assert.ok(camera.position.equals(chase));intro.dispose();for(const view of views)view.dispose();
 }
});

}
