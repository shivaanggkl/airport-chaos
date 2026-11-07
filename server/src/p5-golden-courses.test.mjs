import {dallasLandmarks,landmarkBounds} from '../../shared/dallas-landmarks.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {journeyDallas01,journeyDallas04,journeyDallas05,journeyGateCrossing,journeyGatePlane} from '../../shared/journey-mission.mjs';
import * as controls from '../../shared/flight-control-rules.mjs';
import {mobileIdleBrakeRequested} from '../../shared/mobile-input-rules.mjs';
import {aircraftDefinitions} from '../../client/src/aircraft.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {validateClientTransform} from './transform-validation.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {DALLAS_WORLD_SCALE as S} from '../../shared/dallas-world-scale.mjs';
const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8')),bytes=Buffer.from(data.elevations,'base64');
function ground(x,z){
 const gx=Math.max(0,Math.min(data.width-1,(x/S-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX)*(data.width-1))),gz=Math.max(0,Math.min(data.height-1,(z/S-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ)*(data.height-1))),ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz;
 const at=(a,b)=>data.baseElevation+bytes.readUInt16LE((Math.min(data.height-1,b)*data.width+Math.min(data.width-1,a))*2)*data.scale;
 return((1-tz)*((1-tx)*at(ix,iz)+tx*at(ix+1,iz))+tz*((1-tx)*at(ix,iz+1)+tx*at(ix+1,iz+1)))*S;
}
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const coursePoints=mission=>[mission.airborneSpawn,...mission.gates];
const courseLength=mission=>{const points=coursePoints(mission);return points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);};

function simulateCourse(mission,type,throttleTarget){
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');assert(fn);
 const s=mission.airborneSpawn,airplane=new THREE.Group(),e=aircraftDefinitions[type],dt=1/60;
 airplane.position.set(s.x,ground(s.x,s.z)+s.altitude,s.z);airplane.rotation.set(0,s.heading,0,'YXZ');
 let input={x:0,y:0},elapsed=0,index=0,travelled=0,missedGateCrossings=0;
 const no=()=>{},fail=()=>assert.fail('unexpected crash/landing in the airborne course');
 const sandbox={...controls,THREE,Math,Number,console,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:type,velocity:new THREE.Vector3(-Math.sin(s.heading)*s.speed,0,-Math.cos(s.heading)*s.speed),forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions:new Set(),throttle:throttleTarget,currentSpeed:s.speed,verticalSpeed:0,heading:s.heading,pitch:0,roll:0,onGround:false,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:1,speedBonus:0,flightState:'FLYING',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>ground(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>null,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:fail,endRun:fail,evaluateLanding:fail,setFlightState:no,mobileInput:{getThrottleTarget:()=>throttleTarget,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)};
 const context=vm.createContext(sandbox);vm.runInContext(ts.transpileModule(fn.getText(ast).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 let lastHeading=s.heading;
 while(elapsed<mission.timeLimitMs/1000&&index<10){
  const g=mission.gates[index],p=airplane.position,targetHeading=Math.atan2(-(g.x-p.x),-(g.z-p.z)),error=Math.atan2(Math.sin(targetHeading-context.heading),Math.cos(targetHeading-context.heading));
  const turnRate=Math.atan2(Math.sin(context.heading-lastHeading),Math.cos(context.heading-lastHeading))/dt;lastHeading=context.heading;
  const desiredVy=THREE.MathUtils.clamp((ground(g.x,g.z)+g.altitude-p.y)*.12,-90,90);
  input={x:-THREE.MathUtils.clamp(error*1.3-turnRate*.35,-.85,.85),y:-THREE.MathUtils.clamp(.12+(desiredVy-context.velocity.y)*.04,-.65,.8)};
  const before=p.clone();context.updateFlight(dt);elapsed+=dt;travelled+=before.distanceTo(p);
  assert.equal(context.boostActive,false);assert(!context.onGround);assert.equal(validateClientTransform(before,p,dt*1000,e,0).accepted,true);
  assert(p.y-ground(p.x,p.z)>1000,'controlled flight remains safely above terrain');
  const crossed=journeyGateCrossing(before,p,index,ground(g.x,g.z),mission);
  const plane=journeyGatePlane(mission,index),signed=v=>(v.x-g.x)*plane.normalX+(v.z-g.z)*plane.normalZ;
  if(signed(before)*signed(p)<0&&crossed!=='VALID')missedGateCrossings++;
  if(crossed==='VALID')index++;
 }
 return {elapsed,index,travelled,missedGateCrossings};
}

for(const mission of [journeyDallas04,journeyDallas05]) {
const points=coursePoints(mission),length=courseLength(mission);
test(`${mission.name} controlled 75% Bluejay clears all gates without Boost with 20s margin`,t=>{
 const run=simulateCourse(mission,'trainer',.75);
 t.diagnostic(`${mission.name} route ${(length/1000).toFixed(3)} km; Bluejay ${run.elapsed.toFixed(2)}s; ${mission.timeLimitMs/1000-run.elapsed}s remaining; ${(run.travelled/1000).toFixed(2)} km flown; ${run.missedGateCrossings} misses`);
 assert.equal(run.index,10);assert(run.elapsed<=mission.timeLimitMs/1000-20);
 assert(run.travelled<length*1.15,'continuous route without missed-gate recovery loops');
 assert.equal(run.missedGateCrossings,0,'every gate is cleared on the first crossing');
});

test(`${mission.name} full openings and corridors clear terrain, mapped buildings and the rendered authored skyline`,async()=>{
 const {loadMonsterDistrictBuildings}=await import('./monster-arrival.js');
 const {generateDallasSkyline}=await import('../../shared/dallas-skyline.mjs');
 const world=await import('../../client/src/dallas-world.js');
 const blocks=loadMonsterDistrictBuildings().map(b=>({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,radius:Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2,top:b.top}));
 const add=(x,z,w,d,h)=>blocks.push({x:x*S,z:z*S,radius:Math.hypot(w,d)*S/2,top:ground(x*S,z*S)+h*S});
 for(const b of generateDallasSkyline(world.airports,[]))add(b.x,b.z,b.width,b.depth,b.height+24);
 // Collect the existing authored landmark positions from the real renderer.
 // Conservative solid envelopes include crowns/podiums; no rendering or new asset is needed.
 const text=readFileSync(new URL('../../client/src/dallas-world.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='addDallasSkyline');
 const scene=new THREE.Scene(),obstacles=[],material=new THREE.MeshBasicMaterial();
 const context=vm.createContext({THREE,dallasLandmarks,landmarkBounds,landmarkMaterials:{glassBlue:material,glassDark:material,glassGreen:material,steel:material},getTerrainHeight:(x,z)=>ground(x*S,z*S)/S,dallasLocations:world.dallasLocations,addReunionTower:()=>add(-1120,130,56,56,171),addSteppedTower:(_scene,_obs,x,z,w,d,h)=>add(x,z,w*1.2,d*1.2,h),addSignatureTower:(_scene,_obs,x,z,w,d,h)=>add(x,z,w*1.5,d*1.5,h+50)});
 vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);context.addDallasSkyline(scene,obstacles);
 for(const b of obstacles)add(b.x,b.z,b.halfX*2,b.halfZ*2,b.height);
 for(const o of scene.children)o.geometry?.dispose();material.dispose();
 let roof=Infinity,terrain=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,l=distance(a,b),ay=ground(a.x,a.z)+a.altitude,by=ground(b.x,b.z)+b.altitude,r=mission===journeyDallas04?b.radius*1.12+2.5:b.radius*.92;
  for(let step=0;step<=Math.ceil(l/125);step++){
   const u=step/Math.ceil(l/125),x=a.x+dx*u,z=a.z+dz*u,y=ay+(by-ay)*u;
   for(const side of [-b.radius,0,b.radius])terrain=Math.min(terrain,y-ground(x-dz/l*side,z+dx/l*side)-r);
  }
  for(const block of blocks){const u=Math.max(0,Math.min(1,((block.x-a.x)*dx+(block.z-a.z)*dz)/(l*l)));if(Math.hypot(block.x-a.x-dx*u,block.z-a.z-dz*u)-block.radius>b.radius+180)continue;roof=Math.min(roof,ay+(by-ay)*u-block.top-r);}
 }
 assert(terrain>200,`terrain aperture clearance ${terrain}`);assert(roof>200,`building aperture clearance ${roof}`);
});


test(`${mission.name} has safe spacing, gradual turns and an aligned opening matching M1`,()=>{
 assert(length>=(mission===journeyDallas04?154000:159000)&&length<=(mission===journeyDallas04?156000:161000));assert.equal(mission.timeLimitMs,180000);assert.equal(mission.gates.length,10);
 assert(Math.abs(distance(points[0],points[1])-distance(journeyDallas01.airborneSpawn,journeyDallas01.gates[0]))<1e-6);
 const turns=[];
 for(let i=2;i<points.length;i++){
  const a=points[i-2],b=points[i-1],c=points[i];
  assert(distance(b,c)>=6000&&distance(b,c)<=10000);
  const d=Math.atan2(b.z-a.z,b.x-a.x),e=Math.atan2(c.z-b.z,c.x-b.x),angle=Math.atan2(Math.sin(e-d),Math.cos(e-d));
  assert(Math.abs(angle)<=65*Math.PI/180);turns.push(angle);
 }
 if(mission===journeyDallas04) {
  for(let i=2;i<turns.length;i++)assert(turns[i]*turns[i-1]<0,'alternating slalom after the opening approach');
  assert(Math.abs(turns[0])>10*Math.PI/180&&turns.slice(1).every(t=>Math.abs(t)>25*Math.PI/180));
  assert.deepEqual(mission.gates.map(g=>g.radius),[325,310,300,290,280,275,270,265,260,340].map(r=>r*S));
 } else {
  for(let i=1;i<10;i++)assert(mission.gates[i].radius<mission.gates[i-1].radius);
  assert.deepEqual(mission.gates.map(g=>g.radius),[300,290,275,260,250,245,240,235,230,225].map(r=>r*S));
  assert(distance(mission.gates[0],{x:-13500*S,z:-9350*S})<12000,'first gate stays near Las Colinas');
  for(let i=7;i<turns.length;i++)assert(Math.abs(turns[i])<25*Math.PI/180,'gentle precision approaches');
 }
 const spawn=authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,ground);
 assert.equal(spawn.position.x,mission.airborneSpawn.x);assert.equal(spawn.position.y,ground(spawn.position.x,spawn.position.z)+mission.airborneSpawn.altitude);
 assert.equal(spawn.speed,mission.airborneSpawn.speed);
 assert(points.every(p=>Math.abs(p.x)+(p.radius??0)<25000*S&&Math.abs(p.z)+(p.radius??0)<25000*S));
 if(mission===journeyDallas04)assert(mission.gates.some(g=>distance(g,{x:-600*S,z:-450*S})<6500));
 assert(mission.gates.some(g=>distance(g,{x:-4100*S,z:2300*S})<2500));
 const s=mission.airborneSpawn,g=mission.gates[0];
 assert(Math.abs(Math.atan2(-(g.x-s.x),-(g.z-s.z))-s.heading)<1e-9);
});

}

test('M4/M5 keep authoritative deadlines, ordered gates, retry and one-time rewards across course revisions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'p5-courses-')),path=join(dir,'profile.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0),('other',0,0)");
 try {
  const store=new JourneyAttemptStore(path,true);
  for(const mission of [journeyDallas04,journeyDallas05]) {
   const finish=now=>{
    const a=store.launch('pilot','trainer',now,mission.id);
    assert.equal(db.prepare('SELECT definition_revision FROM journey_attempts WHERE attempt_id=?').get(a.attemptId).definition_revision,mission.courseRevision);
    store.approach('pilot',a.attemptId,now+100);
    assert.equal(store.acceptGate('pilot',a.attemptId,0,now+500),undefined);
    assert.equal(store.startRookieRush('other',a.attemptId,now+1000),undefined);
    const started=store.startRookieRush('pilot',a.attemptId,now+1000);
    assert.equal(started.deadlineAt,now+1000+mission.timeLimitMs);
    assert.equal(store.startRookieRush('pilot',a.attemptId,now+1001),undefined);
    for(const [i,g] of mission.gates.entries()) {
     const n=journeyGatePlane(mission,i),p={x:g.x-n.normalX*50,y:ground(g.x,g.z)+g.altitude,z:g.z-n.normalZ*50},q={x:g.x+n.normalX*50,y:p.y,z:g.z+n.normalZ*50};
     assert.equal(journeyGateCrossing({...p,y:p.y+g.radius*2},{...q,y:q.y+g.radius*2},i,ground(g.x,g.z),mission),false);
     assert.equal(store.acceptGate('other',a.attemptId,i,now+2000+i*1000),undefined);
     assert.equal(store.acceptGate('pilot',a.attemptId,i+1,now+2000+i*1000),undefined);
     assert.equal(journeyGateCrossing(p,q,i,ground(g.x,g.z),mission),'VALID');
     assert.equal(store.acceptGate('pilot',a.attemptId,i,now+2000+i*1000).gateIndex,i+1);
     assert.equal(store.acceptGate('pilot',a.attemptId,i,now+2001+i*1000),undefined);
    }
    return store.get('pilot',a.attemptId);
   };
   const before=db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits;
   const first=finish(1000);assert.equal(first.firstClearCredits,mission.firstClearCredits);
   assert.equal(finish(30000).firstClearCredits,0);
   assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,before+mission.firstClearCredits);
   // Previous-course clears still unlock missions and retain their historical time/receipt.
   db.prepare('UPDATE journey_attempts SET definition_revision=?,finish_time_ms=5000 WHERE mission_id=?').run(mission.courseRevision-1,mission.id);
   db.prepare("UPDATE journey_completions SET best_time_ms=5000 WHERE pilot_id='pilot' AND mission_id=?").run(mission.id);
   assert.equal(store.progress('pilot',mission.id).completed,true);
   assert.equal(store.progress('pilot',mission.id).bestTimeMs,undefined);
   assert.equal(finish(60000).firstClearCredits,0);
   assert.equal(store.progress('pilot',mission.id).bestTimeMs,10000);
   const history=db.prepare("SELECT first_attempt_id,best_time_ms FROM journey_completions WHERE pilot_id='pilot' AND mission_id=?").get(mission.id);
   assert.equal(history.first_attempt_id,first.attemptId);assert.equal(history.best_time_ms,5000);
   const expired=store.launch('pilot','trainer',100000,mission.id);store.approach('pilot',expired.attemptId,100100);
   const started=store.startRookieRush('pilot',expired.attemptId,101000);
   assert.equal(store.acceptGate('pilot',expired.attemptId,0,started.deadlineAt),undefined);
   assert.equal(store.fail('pilot',expired.attemptId,'TIME_UP',started.deadlineAt).status,'FAILED');
   const retry=store.launch('pilot','trainer',400000,mission.id);assert.equal(retry.gateIndex,0);
   store.approach('pilot',retry.attemptId,400100);store.startRookieRush('pilot',retry.attemptId,401000);
   store.pause('pilot',retry.attemptId,402000);
   assert.equal(store.resume('pilot',retry.attemptId,403000).attempt.deadlineAt,402000+mission.timeLimitMs);
   const stale=store.launch('other','trainer',700000,mission.id);
   db.prepare('UPDATE journey_attempts SET definition_revision=? WHERE attempt_id=?').run(mission.courseRevision-1,stale.attemptId);
   assert.equal(new JourneyAttemptStore(path,true).get('other',stale.attemptId).failureReason,'MISSION_UPDATED');
   assert.equal(store.launch('other','trainer',800000,mission.id).gateIndex,0);
   const detail=missionJourneyDetails.find(m=>m.id===mission.id);
   assert.equal(detail.description,mission.objective);assert.equal(detail.timeLimit,'3:00');
  }
 } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
