import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as missions from '../../shared/journey-mission.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { observedChampionshipTouchdown } from './championship-landing.js';
import { PlayerProfileStore } from './player-profiles.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { RewardedAdStore } from './rewarded-ads.js';
const mission = missions.journeyDallasAirportHop01;
const indexSource = readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const clientSource = readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'airport-hop-')),path=join(dir,'profiles.sqlite');
  const profiles=new PlayerProfileStore(path); profiles.getOrCreate('pilot','Pilot'); profiles.getOrCreate('other','Other');
  const store=new JourneyAttemptStore(path,true),db=new DatabaseSync(path),now=Date.now();
  const start=(type='trainer')=>{const a=store.launch('pilot',type,now,mission.id);store.approach('pilot',a.attemptId,now+1);return store.startAirportHop('pilot',a.attemptId,now+2)!;};
  return {path,profiles,store,db,now,start,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M07 identity, 8-minute clock, all aircraft, one destination and isolated existing systems',()=>{
  assert.equal(missions.journeyCatalog.length,30);assert.equal(missions.journeyCatalog[6]!.id,mission.id);
  assert.equal(missions.journeyCatalog[7]!.id,missions.journeyDallasSharpshooter01.id);assert.equal(missions.journeyCatalog[8]!.id,missions.journeyDallas07.id);
  assert.equal(mission.difficulty,'MEDIUM');assert.equal(mission.firstClearCredits,750);
  const f=fixture();try{for(const type of Object.keys(aircraftFlightEnvelope)){
    const a=f.store.launch('pilot',type,f.now,mission.id);assert.equal(a.airportHopStage,0);assert.equal(a.deadlineAt,null);
    f.store.approach('pilot',a.attemptId,f.now+1);assert.equal(f.store.get('pilot',a.attemptId)!.deadlineAt,null);
    const started=f.store.startAirportHop('pilot',a.attemptId,f.now+12_000)!;
    assert.equal(started.deadlineAt! - started.startedAt!,480_000);assert.equal(started.aircraftType,type);
    assert.equal(missionFocusForAttempt(started)!.showAmbientAIAircraft,false);
  }}finally{f.close();}
  assert.match(indexSource,/spawnAirportId = journeyAttempt\?\.missionId === journeyDallasAirportHop01.id/);
  assert.match(clientSource,/missionAirportHopIntro[\s\S]*elapsed - 10_500[\s\S]*1_500/);
  assert.match(clientSource,/function rewardLanding[^]*?journeyDallasAirportHop01.id[^]*?return;/);
});
test('ordered takeoffs and landings; wrong airports reset only the current leg, durable checkpoints, reward once',()=>{
 const f=fixture();try{const a=f.start(),id=a.attemptId;let time=f.now+10;
 const event=(kind:'takeoff'|'landing',airport:string)=>f.store.airportHopEvent('pilot',id,kind,airport,++time);
 assert.equal(event('landing','love'),undefined);assert.equal(event('takeoff','love'),undefined);
 assert.equal(event('takeoff','dfw')!.airportHopStage,1);
 assert.equal(event('landing','addison')!.airportHopStage,0);
 event('takeoff','dfw');assert.equal(event('landing','love')!.airportHopStage,2);
 assert.equal(event('landing','love'),undefined);
 const reopened=new JourneyAttemptStore(f.path,true);assert.equal(reopened.get('pilot',id)!.airportHopStage,2);
 assert.equal(event('takeoff','dfw'),undefined);assert.equal(event('landing','addison'),undefined);
 event('takeoff','love');assert.equal(event('landing','dfw')!.airportHopStage,2);
 event('takeoff','love');const end=event('landing','addison')!;
 assert.equal(end.airportHopStage,4);assert.equal(end.status,'COMPLETED');assert.equal(end.firstClearCredits,750);
 assert.equal(event('landing','addison'),undefined);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?").get(`journey:${mission.id}`)?.n,1);
 const replay=f.start();f.store.airportHopEvent('pilot',replay.attemptId,'takeoff','dfw',++time);f.store.airportHopEvent('pilot',replay.attemptId,'landing','love',++time);
 f.store.airportHopEvent('pilot',replay.attemptId,'takeoff','love',++time);
 assert.equal(f.store.airportHopEvent('pilot',replay.attemptId,'landing','addison',++time)!.firstClearCredits,0);
 }finally{f.close();}
});
test('pause, ownership, expiration, retry and abandon cannot skip the sequence',()=>{
 const f=fixture();try{const a=f.start(),id=a.attemptId;
 assert.equal(f.store.airportHopEvent('other',id,'takeoff','dfw',f.now+10),undefined);
 f.store.pause('pilot',id,f.now+20);assert.equal(f.store.airportHopEvent('pilot',id,'takeoff','dfw',f.now+30),undefined);
 const resumed=f.store.resume('pilot',id,f.now+1020)!;assert.equal(resumed.attempt.deadlineAt,a.deadlineAt!+1000);
 assert.equal(f.store.airportHopEvent('pilot',id,'takeoff','dfw',resumed.attempt.deadlineAt!),undefined);
 f.store.fail('pilot',id,'TIME_UP',resumed.attempt.deadlineAt!);
 assert.equal(f.store.airportHopEvent('pilot',id,'takeoff','dfw',f.now+40),undefined);
 const retry=f.start();assert.equal(retry.airportHopStage,0);f.store.abandon('pilot',retry.attemptId);
 assert.equal(f.store.airportHopEvent('pilot',retry.attemptId,'takeoff','dfw',f.now+40),undefined);
 }finally{f.close();}
});
test('verified ad continuation retains Love Field checkpoint and requires a fresh departure',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId;
  f.store.airportHopEvent('pilot',id,'takeoff','dfw',f.now+10);
  f.store.airportHopEvent('pilot',id,'landing','love',f.now+20);
  f.store.airportHopEvent('pilot',id,'takeoff','love',f.now+30);
  const failedAt=f.now+1000;
  f.store.fail('pilot',id,'CRASHED',failedAt);
  assert.equal(f.store.saveContinuation('pilot',id,failedAt,{position:{x:0,y:500,z:0},heading:0,bots:[]}),true);
  const adUnitId='ca-app-pub-3940256099942544/5224354917';
  const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId},webEnabled:false,providerRewardAmount:'1'});
  const issued=ads.createAttempt('pilot','android',failedAt+1,`${id}:${failedAt}`);
  assert.ok(issued.ok);if(!issued.ok)throw Error('Ad unavailable');
  const adId=issued.attempt.attemptId;
  assert.equal(ads.grantVerifiedReward({adUnit:adUnitId,customData:adId,rewardAmount:'1',rewardItem:'reward',timestamp:failedAt+2,transactionId:'hop-continue'},failedAt+2).rewarded,true);
  const resumed=f.store.continueAfterAd('pilot',id,adId,failedAt+3)!;
  assert.equal(resumed.airportHopStage,2);assert.equal(resumed.deadlineAt!-(failedAt+3),mission.timeLimitMs);
  assert.equal(f.store.airportHopEvent('pilot',id,'landing','addison',failedAt+4),undefined);
  assert.equal(f.store.airportHopEvent('pilot',id,'takeoff','love',failedAt+5)!.airportHopStage,3);
  assert.equal(f.store.airportHopEvent('pilot',id,'landing','addison',failedAt+6)!.status,'COMPLETED');
  assert.match(indexSource,/resumed.missionId === journeyDallasAirportHop01.id[\s\S]*?safeRespawnTransform/);
 }finally{f.close();}
});
test('production runway spawn, accepted takeoff hook and single-destination guidance agree',()=>{
 const f=fixture();try{
  const a=f.start(),airport=cityAirports.dallas.find(x=>x.id==='dfw')!;
  const player={pilotId:'pilot',aircraftType:'trainer',velocity:{x:0,z:0}};
  const context=createContext({...missions,Math,cityAirports,dallasAirportElevations:new Map([['dfw',123]]),
   aircraftFlightEnvelope,journeyStore:f.store,player,journeyAttemptId:a.attemptId,departure:airport,currentJourney:a,
   stateNow:f.now+10,playerId:'p',landingReceipts:new Map([['p:dfw',f.now]]),sendJourneyState(){}});
  const spawn=indexSource.slice(indexSource.indexOf('function expectedInitialTransform('),indexSource.indexOf('\nfunction logTransformReject('));
  const takeoffStart=indexSource.indexOf('        if (journeyAttemptId && departure && currentJourney?.missionId === journeyDallasAirportHop01.id');
  const takeoff=indexSource.slice(takeoffStart,indexSource.indexOf("        if (journeyAttemptId && departure?.id === 'dfw')",takeoffStart));
  runInContext(ts.transpileModule(spawn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const pose=runInContext("expectedInitialTransform('dallas',0,{x:0,y:1.2,z:45},'dfw')",context);
  assert.equal(pose.y,123);assert.ok(Math.hypot(pose.x-airport.x,pose.z-airport.z)<airport.runwayLength/2);
  const hook=ts.transpileModule(takeoff,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  runInContext(hook,context);assert.equal(f.store.get('pilot',a.attemptId)!.airportHopStage,0);
  player.velocity.z=aircraftFlightEnvelope.trainer.takeoffSpeed;
  runInContext(hook,context);assert.equal(f.store.get('pilot',a.attemptId)!.airportHopStage,1);
  assert.equal(context.landingReceipts.has('p:dfw'),false);
  const guidance=clientSource.slice(clientSource.indexOf('function airportHopDestination('),clientSource.indexOf('\nfunction updateJourneyHud('));
  const client=createContext({...missions,airports:cityAirports.dallas,journeyAttempt:{...a}});
  runInContext(ts.transpileModule(guidance,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,client);
  for(const [stage,id] of [[0,'dfw'],[1,'love'],[2,'love'],[3,'addison']] as const){
   client.journeyAttempt.airportHopStage=stage;assert.equal(runInContext('airportHopDestination().id',client),id);
  }
 }finally{f.close();}
});
test('server accepted touchdown required; taxi, low pass and forged claims cannot advance; no generic landing payouts',()=>{
 const f=fixture();try{
 const a=f.start(),id=a.attemptId,airport=cityAirports.dallas.find(x=>x.id==='love')!;
 const envelope=aircraftFlightEnvelope.trainer,position={x:airport.x,y:0,z:airport.z};
 const velocity={x:-Math.sin(airport.heading)*35,y:-1,z:-Math.cos(airport.heading)*35};
 const rotation={x:0,y:airport.heading,z:0},landingEnvelope={speed:envelope.safeLandingSpeed,descent:envelope.safeDescentRate,tilt:envelope.landingTilt};
 const contact=observedChampionshipTouchdown({...position,y:2},position,velocity,rotation,airport,0,landingEnvelope)!;
 assert.ok(contact);assert.equal(observedChampionshipTouchdown(position,position,velocity,rotation,airport,0,landingEnvelope),null);
 assert.equal(observedChampionshipTouchdown({...position,y:20},{...position,y:10},velocity,rotation,airport,0,landingEnvelope),null);
 const player={pilotId:'pilot',cityId:'dallas',aircraftType:'trainer',lifeState:'alive',hasRespawnTransform:true,lastStateAt:Date.now(),position,velocity,rotation};
 const flight=new Map([['p',{baselineY:0,airborne:true}]]),touchdowns=new Map(),messages:any[]=[];
 const context=createContext({...missions,Date,Math,airportForCity:()=>airport,validLandingTelemetry:(v:any)=>v,
  landingReceipts:new Map(),landingFlightState:flight,aircraftFlightEnvelope,playerJourneyAttempts:new Map([['p',id]]),journeyStore:f.store,
  championshipTouchdowns:touchdowns,isHumanPilot:()=>false,airborneMilestones:{reset(){}},flightAnalytics:new Map(),
  landingPrecisionScore:()=>1,landingGradeForScore:()=> 'ROUGH',sendToPlayer:(_:string,m:any)=>messages.push(m),sendJourneyState:(_:string,m:any)=>messages.push(m),
  sendProfile:()=>{throw Error('No completion yet');},completeLandingChaosEvent:()=>{throw Error('No ambient landing side effects');}});
 const fn=indexSource.slice(indexSource.indexOf('function validateAndRecordLanding('),indexSource.indexOf('\nfunction broadcastEvent('));
 runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 context.player=player;context.telemetry=contact;
 f.store.airportHopEvent('pilot',id,'takeoff','dfw',f.now+3);
 runInContext("validateAndRecordLanding('p',player,'love',telemetry)",context);assert.equal(f.store.get('pilot',id)!.airportHopStage,1);
 touchdowns.set('p',{attemptId:id,approachCycle:0,airportId:'love',telemetry:contact,at:Date.now()});
 runInContext("validateAndRecordLanding('p',player,'love',telemetry)",context);
 assert.equal(f.store.get('pilot',id)!.airportHopStage,2);assert.equal(flight.get('p')!.airborne,false);
 assert.equal(messages.at(-1).credits,0);assert.equal(messages.at(-1).grade,'ROUGH');
 }finally{f.close();}
});

test('M07 radar points to the next landing airport even before takeoff and keeps distant bearings visible',()=>{
 const calls:any[][]=[], arcs:any[][]=[], texts:any[][]=[];
 const attempt={missionId:mission.id,status:'RACING',airportHopStage:0};
 const context=createContext({...missions,Math,journeyAttempt:attempt,airports:cityAirports.dallas,
  missionFocus:{showUnrelatedAirportLabels:false},radarAirportLabels:{},
  drawRadarMarker:(...args:any[])=>calls.push(args),direction:{x:0,z:-1}});
 const destination=clientSource.slice(clientSource.indexOf('function airportHopDestination('),clientSource.indexOf('\nfunction updateJourneyHud('));
 const loopStart=clientSource.indexOf('  const hopDestination = airportHopDestination(true);');
 const loop=clientSource.slice(loopStart,clientSource.indexOf('  if (!skyDuelMode)',loopStart));
 runInContext(ts.transpileModule(destination,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const [stage,id,label] of [[0,'love','AIRPORT 2'],[1,'love','AIRPORT 2'],[2,'addison','AIRPORT 3'],[3,'addison','AIRPORT 3']] as const){
  attempt.airportHopStage=stage;calls.length=0;
  runInContext(`{${ts.transpileModule(loop,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`,context);
  const airport=cityAirports.dallas.find(a=>a.id===id)!;
  assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(1),[airport.x,airport.z,'mission',label]);
 }
 const canvas={width:180,height:180};
 const radarContext={beginPath(){},fill(){},stroke(){},arc:(...args:any[])=>arcs.push(args),fillText:(...args:any[])=>texts.push(args)};
 Object.assign(context,{radarCanvas:canvas,radarContext,radarRange:3000,airplane:{position:{x:0,z:0}},visualLanguage:{mission:{color:'#ffd865'}}});
 const marker=clientSource.slice(clientSource.indexOf('function drawRadarMarker('),clientSource.indexOf('\nfunction drawRadarTerritories('));
 runInContext(ts.transpileModule(marker,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const [x,z] of [[100000,0],[-100000,0],[0,100000],[0,-100000]]){
  arcs.length=0;texts.length=0;
  runInContext(`drawRadarMarker({x:0,z:-1},${x},${z},'mission','2 LAND')`,context);
  assert.ok(Math.abs(Math.hypot(arcs[0][0]-90,arcs[0][1]-90)-77)<.001);
  assert.ok(texts[0][1]>=40&&texts[0][1]<=140);assert.ok(texts[0][2]>=30&&texts[0][2]<=135);
 }
});

 test('M07 victory retains touchdown height and attitude while rolling smoothly to rest',()=>{
  const airplane={position:new THREE.Vector3(100,7,200),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.4,0))};
  const pose=airplane.quaternion.clone();
  const context=createContext({...missions,Math,performance:{now:()=>1000},MISSION_CLEAR_DURATION_MS:4200,MISSION_CLEAR_REVEAL_MS:700,
   missionClearStartedAt:0,journeyAttempt:{missionId:mission.id},airplane,
   missionClearVelocity:new THREE.Vector3(0,0,-30),velocity:new THREE.Vector3(0,0,-30),currentSpeed:30,verticalSpeed:0,
   missionClearElement:{classList:{contains:()=>false,toggle(){}}},
   getTerrainHeight:()=>{throw Error('Must not apply airborne victory clearance');}});
  const source=clientSource.slice(clientSource.indexOf('function updateMissionClear('),clientSource.indexOf('\nfunction eventObjectiveForLocal('));
  runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  for(let i=0;i<180;i++)runInContext('updateMissionClear(1/60)',context);
  assert.equal(airplane.position.y,7);assert.ok(airplane.quaternion.equals(pose));
  assert.ok(airplane.position.z>185&&airplane.position.z<186);
  assert.ok(context.currentSpeed<.1);assert.equal(context.verticalSpeed,0);
  assert.ok(clientSource.includes('attempt.missionId !== journeyDallasAirportHop01.id && missionClearVelocity.lengthSq() < 1'));
 });
