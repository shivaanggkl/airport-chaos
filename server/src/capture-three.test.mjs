import {newCaptureCompetition,advanceCaptureCompetition,captureCompetitionOwned} from './capture-competition.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as catalog from '../../shared/journey-mission.mjs';
import {journeyDallasCaptureThree01 as mission,journeyCaptureTerritoryId,journeyTerritoryCaptureMission} from '../../shared/journey-mission.mjs';
import {territoriesForCity,territoryContains,territoryCaptureFlightEligible} from '../../shared/city-territories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {RewardedAdStore} from './rewarded-ads.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
const territories=territoriesForCity('dallas');
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
function runtime(names,context={}){
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const ctx=vm.createContext({...catalog,territoriesForCity,territoryContains,territoryCaptureFlightEligible,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture(unlocked=true){
 const dir=mkdtempSync(join(tmpdir(),'capture-three-')),path=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');profiles.getOrCreate('other','Other');
 const db=new DatabaseSync(path),store=new JourneyAttemptStore(path,unlocked);let clock=Date.now(),competition;
 return {dir,path,profiles,db,store,get now(){return clock;},tick(a,eligible=true,reset=false,ms=400){clock+=ms;
 const territoryId=eligible&&!reset?mission.territoryIds[captureCompetitionOwned(competition)]:undefined;
 advanceCaptureCompetition(competition,[{id:'pilot',alive:true,territoryId}],clock);
 store.saveCaptureFlight('pilot',a.attemptId,{position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:100,y:0,z:0},health:100,updatedAt:clock,competition});
 return store.advanceTerritoryCapture('pilot',a.attemptId,eligible,clock,reset,competition);},start(){competition=newCaptureCompetition([],clock);const a=store.launch('pilot','trainer',clock,mission.id);store.approach('pilot',a.attemptId);return store.startTerritoryCapture('pilot',a.attemptId,clock);},close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M21 uses only its new slot, authoritative geometry, prescribed spawn and M20 prerequisite',()=>{
 assert.equal(catalog.journeyCatalog.length,30);assert.equal(catalog.journeyMissionSlot(mission.id),21);assert.equal(catalog.journeyMissionSlot(catalog.journeyDallasAceIntercept01.id),20);
 assert.equal(mission.timeLimitMs,360000);assert.equal(mission.firstClearCredits,2250);assert.equal(mission.captureDurationMs,15000);
 assert.deepEqual(mission.territoryIds,['las-colinas','love-field','downtown']);
 assert.deepEqual(mission.territoryIds.map(id=>territories.find(t=>t.id===id).center),[{x:-40500,z:-28050},{x:-15420,z:-23340},{x:-1800,z:-1350}]);
 assert.equal(mission.runwayStart,true);assert.equal(mission.startAirportId,'dfw');
 assert.equal(authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,()=>100),undefined);
 const start=source.indexOf('  const spawnAirportId ='),end=source.indexOf('  // All six Golden Gates',start);
 const context=vm.createContext({...catalog,journeyAttempt:{missionId:mission.id,status:'APPROACH'},soloExploreMode:false});
 vm.runInContext(source.slice(start,end)+'\nglobalThis.spawnAirport=spawnAirportId;',context);
 assert.equal(context.spawnAirport,'dfw');
 assert.equal(journeyCaptureTerritoryId(mission.id,3),undefined);assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'}).showAmbientAIAircraft,false);
 const f=fixture(false);try{
  assert.equal(f.store.canAccessMission('pilot',mission.id),false);
  f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('pilot',catalog.journeyDallasAceIntercept01.id,'m20',1);
  assert.equal(f.store.canAccessMission('pilot',mission.id),true);
 }finally{f.close();}
});
test('shared capture engine requires 15 continuous seconds per territory, resets only unfinished progress, and rewards once',()=>{
 const f=fixture();try{
 const initial=f.profiles.getOrCreate('pilot','Pilot').credits;
 for(let replay=0;replay<2;replay++){
  const a=f.start();assert.equal(a.captureStage,0);assert.equal(a.deadlineAt-a.startedAt,360000);
  for(let stage=0;stage<3;stage++){
   for(let i=0;i<10;i++)f.tick(a);
   assert.equal(f.store.get('pilot',a.attemptId).captureMs,4000);
   const reset=f.tick(a,false,true);assert.equal(reset.captureStage,stage);assert.equal(reset.captureMs,0);
   for(let i=0;i<37;i++){const partial=f.tick(a);assert.equal(partial.captureStage,stage);assert.equal(partial.status,'RACING');}
   const completed=f.tick(a,true,false,200);assert.equal(completed.captureStage,stage+1);assert.equal(completed.captureMs,0);
   assert.equal(completed.status,stage===2?'COMPLETED':'RACING');assert.equal(completed.deadlineAt,a.deadlineAt);
  }
  const done=f.store.get('pilot',a.attemptId);assert.equal(done.firstClearCredits,replay===0?2250:0);assert.ok(done.finishTimeMs>45000);
  assert.equal(f.tick(a),undefined);
 }
 assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial+2250);
 assert.equal(f.store.progress('pilot',mission.id).completed,true);assert.ok(f.store.progress('pilot',mission.id).bestTimeMs>0);
 }finally{f.close();}
});
test('production coordinator uses only accepted flight inside the current real boundary and never updates multiplayer ownership',()=>{
 const f=fixture();try{
 const a=f.start(),active=territories.find(t=>t.id==='las-colinas'),future=territories.find(t=>t.id==='love-field');
 const pilot={pilotId:'pilot',cityId:'dallas',lifeState:'alive',health:100,hasRespawnTransform:true,portalTransit:false,
  position:{...future.center,y:1000},lastAcceptedPosition:{...future.center,y:1000},rotation:{x:0,y:0,z:0},velocity:{x:650,y:0,z:0},lastStateAt:f.now,lastAcceptedTransformAt:f.now};
 const state=newCaptureCompetition([],f.now);
 const players=new Map([['owner',pilot]]),ctx=runtime(['updateJourneyTerritoryCapture','updateCompetitiveCapture','checkpointJourneyCapture'],{advanceCaptureCompetition,captureCompetitions:new Map([[a.attemptId,state]]),ensureCaptureCompetition:()=>state,players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),pausedJourneyAttempts:new Set(),
  hasOpenPlayerSocket:()=>true,landingFlightState:new Map([['owner',{airborne:true}]]),botTerrainHeight:()=>100,sendJourneyState(){}});
 let clock=f.now;
 const tick=()=>{clock+=400;pilot.lastStateAt=clock;pilot.lastAcceptedTransformAt=clock;ctx.updateJourneyTerritoryCapture(clock);return f.store.get('pilot',a.attemptId);};
 assert.equal(tick().captureMs,400,'any of the three territories can be captured first');
 // The western interior starts capture even though it is far from the navigation center.
 pilot.position=pilot.lastAcceptedPosition={x:active.bounds.minX+100,z:active.center.z,y:1000};
 assert.equal(tick().captureMs,400);
 for(const invalidate of [()=>pilot.velocity.x=0,()=>ctx.landingFlightState.set('owner',{airborne:false}),()=>pilot.lifeState='destroyed']){
  invalidate();assert.equal(tick().captureMs,0);pilot.velocity.x=650;pilot.lifeState='alive';pilot.journeyDefenseRejectedAt=0;ctx.landingFlightState.set('owner',{airborne:true});tick();
 }
 const beforeRejected=f.store.get('pilot',a.attemptId).captureMs;pilot.journeyDefenseRejectedAt=clock+1000;assert.equal(tick().captureMs,beforeRejected,'unaccepted updates pause rather than erase accepted progress');pilot.journeyDefenseRejectedAt=0;
 ctx.pausedJourneyAttempts.add(a.attemptId);const before=f.store.get('pilot',a.attemptId).captureMs;tick();assert.equal(f.store.get('pilot',a.attemptId).captureMs,before);
 const tables=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%territor%' AND name NOT LIKE 'journey%'").all();
 for(const {name} of tables)assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n,0,'mission cannot create multiplayer ownership');
 assert.match(source,/if \(missionId === (?:journeyDallasMostWantedSurvival01\.id \|\| missionId === )?journeyDallasCaptureThree01\.id \|\| missionId === journeyDallasTerritoryDefense01\.id/);
 }finally{f.close();}
});
test('pause, durable reconnect, timeout, failure, fresh retry and verified continuation preserve the correct stage',()=>{
 const f=fixture();try{
 const a=f.start();for(let n=0;n<38;n++)f.tick(a);for(let n=0;n<10;n++)f.tick(a);
 const before=f.store.get('pilot',a.attemptId);assert.equal(before.captureStage,1);assert.equal(before.captureMs,4000);
 const flight={position:{x:-15500,y:1000,z:-24000},rotation:{x:0,y:-1.5,z:0},velocity:{x:650,y:0,z:0},health:100,updatedAt:f.now};
 f.store.saveCaptureFlight('pilot',a.attemptId,flight);f.store.pause('pilot',a.attemptId,f.now);
 assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,f.now+400),undefined);
 const reopened=new JourneyAttemptStore(f.path,true),restored=reopened.get('pilot',a.attemptId);assert.equal(restored.captureStage,1);assert.equal(restored.captureMs,4000);assert.equal(restored.captureFlight.position.x,flight.position.x);assert.equal(restored.captureFlight.competition.territories[0].ownerId,'pilot');
 const resume=reopened.resume('pilot',a.attemptId,f.now+10000).attempt;assert.equal(resume.deadlineAt,before.deadlineAt+10000);
 assert.equal(reopened.advanceTerritoryCapture('other',a.attemptId,true,f.now+10400),undefined);
 const failed=reopened.fail('pilot',a.attemptId,'CRASHED',f.now+11000);assert.equal(failed.failureReason,'CRASHED');
 assert.ok(reopened.saveContinuation('pilot',a.attemptId,failed.finishedAt,{position:flight.position,heading:flight.rotation.y,bots:[]}));
 const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId:'ca-app-pub-3940256099942544/5224354917'},webEnabled:false,providerRewardAmount:'1'});
 const receipt=ads.createAttempt('pilot','android',f.now+12000,`${a.attemptId}:${failed.finishedAt}`).attempt;
 assert.equal(ads.grantVerifiedReward({transactionId:'capture-three-continuation',customData:receipt.attemptId,adUnit:'5224354917',rewardAmount:'1',timestamp:f.now+13000,keyId:'test'},f.now+13000).ok,true);
 const continued=reopened.continueAfterAd('pilot',a.attemptId,receipt.attemptId,f.now+14000);assert.equal(continued.captureStage,1);assert.equal(continued.captureMs,4000);
 assert.equal(reopened.continueAfterAd('pilot',a.attemptId,receipt.attemptId,f.now+14001),undefined);
 reopened.fail('pilot',a.attemptId,'TIME_UP',continued.deadlineAt);const retry=f.start();assert.equal(retry.captureStage,0);assert.equal(retry.captureMs,0);assert.equal(retry.captureFlight,undefined);
 assert.equal(f.store.advanceTerritoryCapture('pilot',retry.attemptId,true,retry.deadlineAt),undefined);
 }finally{f.close();}
});
test('12-second capture intro uses the three existing definitions, exact text and a clean skip handoff without moving the aircraft',()=>{
 const player=new THREE.Group();player.position.set(-58000,1000,-28050);const initial=player.position.clone();
 const sequence=mission.territoryIds.map(id=>territories.find(t=>t.id===id));
 const intro=new MissionCaptureIntroPath(sequence[0],15000,()=>100,undefined,{player,territories:sequence});
 assert.equal(intro.durationMs,12000);assert.deepEqual([0,3000,6000,9000].map(t=>intro.text(t)),Array(4).fill('Capture 3 TERRITORIES'));
 assert.deepEqual([3000,6000,8000].map(t=>intro.territoryAt(t).id),mission.territoryIds);
 const position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(1,2,3),look=new THREE.Vector3(4,5,6);
 for(const time of [0,3000,6000,8000,12000]){intro.sample(time,position,target,chase,look);assert.deepEqual(player.position,initial);assert.equal(intro.showsCaptureRow(time),false);}
 assert.deepEqual(position,chase);assert.deepEqual(target,look);
});
