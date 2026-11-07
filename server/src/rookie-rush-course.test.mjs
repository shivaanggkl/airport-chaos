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
import {journeyDallas01 as mission,journeyGateCrossing,journeyGatePlane} from '../../shared/journey-mission.mjs';
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
const points=[mission.airborneSpawn,...mission.gates],length=points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);

test('Rookie Rush is a scaled-once 68km course with ten original-size gates and a three-minute GO clock',()=>{
 assert.equal(mission.gates.length,10);assert.equal(mission.timeLimitMs,180000);assert.equal(mission.firstClearCredits,250);assert(length>=65000&&length<=70000);
 assert.equal(missionJourneyDetails.find(m=>m.id===mission.id).timeLimit,'3:00');
 assert(distance(points[0],points[1])>=3000&&distance(points[0],points[1])<=4000);
 assert.deepEqual(mission.gates.map(g=>g.radius),[340,335,330,325,320,315,310,305,300,350].map(r=>r*S));
 for(let i=2;i<points.length;i++){
  const a=points[i-2],b=points[i-1],c=points[i],l=distance(b,c);assert(l>=5000&&l<=9000);
  const first=Math.atan2(b.x-a.x,b.z-a.z),second=Math.atan2(c.x-b.x,c.z-b.z);assert(Math.abs(Math.atan2(Math.sin(first-second),Math.cos(first-second)))<=50*Math.PI/180);
 }
 const spawn=authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,ground);assert(spawn&&spawn.speed>0);assert.equal(spawn.position.y,ground(spawn.position.x,spawn.position.z)+mission.airborneSpawn.altitude);
 assert(Math.abs(Math.atan2(-(points[1].x-points[0].x),-(points[1].z-points[0].z))-spawn.heading)<1e-9);
 assert(source.includes('journeyAttempt?.missionId===journeyDallas01.id ? .75'));
 // Each crossing can shorten the two adjacent legs by at most its radius.
 // Even this deliberately optimistic lower bound exceeds 60s at Bluejay's normal cap.
 const shortestBound=length-2*mission.gates.slice(0,-1).reduce((s,g)=>s+g.radius,0)-mission.gates.at(-1).radius;
 assert(shortestBound/aircraftDefinitions.trainer.maxSpeed>=60);
});

test('deterministic 75% Bluejay run executes the real client flight integrator, clears all ten gates and leaves 20s without boost',t=>{
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');assert(fn);
 const s=mission.airborneSpawn,airplane=new THREE.Group(),e=aircraftDefinitions.trainer,dt=1/60;
 airplane.position.set(s.x,ground(s.x,s.z)+s.altitude,s.z);airplane.rotation.set(0,s.heading,0,'YXZ');
 let input={x:0,y:0},elapsed=0,index=0;
 const no=()=>{},fail=()=>assert.fail('unexpected crash/landing in the airborne course');
 const sandbox={...controls,THREE,Math,Number,console,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:'trainer',velocity:new THREE.Vector3(-Math.sin(s.heading)*s.speed,0,-Math.cos(s.heading)*s.speed),forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),obstacleSweepStart:new THREE.Vector3(),heldActions:new Set(),throttle:.75,currentSpeed:s.speed,verticalSpeed:0,heading:s.heading,pitch:0,roll:0,onGround:false,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:1,speedBonus:0,flightState:'FLYING',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>ground(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>null,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:fail,endRun:fail,evaluateLanding:fail,setFlightState:no,mobileInput:{getThrottleTarget:()=>.75,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)};
 const context=vm.createContext(sandbox);vm.runInContext(ts.transpileModule(fn.getText(ast).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 let lastHeading=s.heading;
 while(elapsed<180&&index<10){
  const g=mission.gates[index],p=airplane.position,targetHeading=Math.atan2(-(g.x-p.x),-(g.z-p.z)),error=Math.atan2(Math.sin(targetHeading-context.heading),Math.cos(targetHeading-context.heading));
  const turnRate=Math.atan2(Math.sin(context.heading-lastHeading),Math.cos(context.heading-lastHeading))/dt;lastHeading=context.heading;
  const desiredVy=THREE.MathUtils.clamp((ground(g.x,g.z)+g.altitude-p.y)*.06,-15,15);
  input={x:-THREE.MathUtils.clamp(error*1.3-turnRate*.35,-.85,.85),y:-THREE.MathUtils.clamp(.12+(desiredVy-context.velocity.y)*.04,-.65,.8)};
  const before=p.clone();context.updateFlight(dt);elapsed+=dt;
  assert.equal(context.boostActive,false);assert(!context.onGround);assert.equal(validateClientTransform(before,p,dt*1000,e,0).accepted,true);
  assert(p.y-ground(p.x,p.z)>1000,'controlled flight remains safely above terrain');
  if(journeyGateCrossing(before,p,index,ground(g.x,g.z),mission)==='VALID')index++;
 }
 t.diagnostic(`route ${(length/1000).toFixed(3)} km; 75% Bluejay ${elapsed.toFixed(2)}s; ${(180-elapsed).toFixed(2)}s remaining; ${index}/10 gates`);
 assert.equal(index,10);assert(elapsed<=160);assert(elapsed>=60);
});

test('full Rookie Rush openings and corridors clear terrain, mapped buildings and the rendered authored skyline',async()=>{
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
  const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,l=distance(a,b),ay=ground(a.x,a.z)+a.altitude,by=ground(b.x,b.z)+b.altitude,r=b.radius*.92;
  for(let step=0;step<=Math.ceil(l/125);step++){
   const u=step/Math.ceil(l/125),x=a.x+dx*u,z=a.z+dz*u,y=ay+(by-ay)*u;
   for(const side of [-b.radius,0,b.radius])terrain=Math.min(terrain,y-ground(x-dz/l*side,z+dx/l*side)-r);
  }
  for(const block of blocks){const u=Math.max(0,Math.min(1,((block.x-a.x)*dx+(block.z-a.z)*dz)/(l*l)));if(Math.hypot(block.x-a.x-dx*u,block.z-a.z-dz*u)-block.radius>b.radius+180)continue;roof=Math.min(roof,ay+(by-ay)*u-block.top-r);}
 }
 assert(terrain>200,`terrain aperture clearance ${terrain}`);assert(roof>200,`building aperture clearance ${roof}`);
});

test('M1 GO, ordered crossings, timeout, retry, pause and one-time credits preserve legacy course records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rookie-course-')),path=join(dir,'profile.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0),('veteran',250,0),('other',0,0)");
 try{
  const store=new JourneyAttemptStore(path,true);
  const finish=(pilot,now)=>{
   const a=store.launch(pilot,'trainer',now,mission.id);assert.equal(store.get(pilot,a.attemptId).aircraftType,'trainer');store.approach(pilot,a.attemptId,now+100);
   assert.equal(store.acceptGate(pilot,a.attemptId,0,now+500),undefined);assert.equal(store.startRookieRush('other',a.attemptId,now+1000),undefined);
   const started=store.startRookieRush(pilot,a.attemptId,now+1000);assert.equal(started.deadlineAt,now+181000);assert.equal(store.startRookieRush(pilot,a.attemptId,now+1001),undefined);
   for(const [i,g]of mission.gates.entries()){
    const n=journeyGatePlane(mission,i),p={x:g.x-n.normalX*50,y:ground(g.x,g.z)+g.altitude,z:g.z-n.normalZ*50},q={x:g.x+n.normalX*50,y:p.y,z:g.z+n.normalZ*50};
    assert.equal(journeyGateCrossing({...p,y:p.y+g.radius*2},{...q,y:q.y+g.radius*2},i,ground(g.x,g.z),mission),false);
    assert.equal(store.acceptGate(pilot,a.attemptId,i+1,now+2000+i*1000),undefined);
    assert.equal(journeyGateCrossing(p,q,i,ground(g.x,g.z),mission),'VALID');assert.equal(store.acceptGate(pilot,a.attemptId,i,now+2000+i*1000).gateIndex,i+1);
    assert.equal(store.acceptGate(pilot,a.attemptId,i,now+2001+i*1000),undefined);
   }
   return store.get(pilot,a.attemptId);
  };
  assert.equal(finish('pilot',1000).firstClearCredits,250);assert.equal(finish('pilot',30000).firstClearCredits,0);
  assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,250);
  db.prepare("INSERT INTO journey_completions VALUES('veteran',?,'old-course',1,5000,1)").run(mission.id);
  assert.equal(store.rookieRushBestTime('veteran'),undefined);assert.equal(finish('veteran',60000).firstClearCredits,0);
  assert.equal(store.rookieRushBestTime('veteran'),10000);assert.equal(store.progress('veteran').firstAttemptId,'old-course');assert.equal(store.progress('veteran').bestTimeMs,5000);
  const late=store.launch('pilot','trainer',100000,mission.id);store.approach('pilot',late.attemptId,100100);const start=store.startRookieRush('pilot',late.attemptId,101000);
  assert.equal(store.acceptGate('pilot',late.attemptId,0,start.deadlineAt),undefined);assert.equal(store.fail('pilot',late.attemptId,'TIME_UP',start.deadlineAt).status,'FAILED');
  const paused=store.launch('pilot','trainer',300000,mission.id);store.approach('pilot',paused.attemptId,300100);store.startRookieRush('pilot',paused.attemptId,301000);store.pause('pilot',paused.attemptId,302000);assert.equal(store.resume('pilot',paused.attemptId,303000).attempt.deadlineAt,482000);
  const legacy=store.launch('other','trainer',500000,mission.id);db.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(legacy.attemptId);assert.equal(new JourneyAttemptStore(path,true).get('other',legacy.attemptId).failureReason,'MISSION_UPDATED');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
