import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {journeyDallasCapture01 as mission,journeyDallas03,journeyDallas14,journeyCatalog} from '../../shared/journey-mission.mjs';
import {territoryContains,territoriesForCity,territoryCaptureFlightEligible,territoryCaptureProgress,territoryCaptureCeilingAgl} from '../../shared/city-territories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {PlayerProfileStore} from './player-profiles.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {loadDallasCombatBuildings as sourceBuildings} from './dallas-collision-source.js';

const target=territoriesForCity('dallas').find(item=>item.id===mission.territoryId)!;
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function fixture() {
 const directory=mkdtempSync(join(tmpdir(),'journey-capture-')),path=join(directory,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');profiles.getOrCreate('other','Other');
 const store=new JourneyAttemptStore(path,true),db=new DatabaseSync(path),now=Date.now();
 const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now);return store.startTerritoryCapture('pilot',a.attemptId,now+400)!;};
 return {path,profiles,store,db,now,start,close:()=>{db.close();rmSync(directory,{recursive:true,force:true});}};
}

test('M05 stable identity, easy configuration and actual Dallas spawn/approach are safe for Bluejay and every aircraft',()=>{
 assert.equal(journeyCatalog[4]!.id,mission.id);assert.equal(journeyCatalog[4]!.implementation,'playable');
 assert.equal(mission.difficulty,'EASY');assert.equal(mission.timeLimitMs,240000);assert.equal(mission.firstClearCredits,500);
 const spawn=authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,dallasElevationAt)!;
 assert.equal(target.bounds.minX-spawn.position.x,2500);assert.equal(spawn.position.z,target.center.z);
 assert.ok(Math.abs(spawn.position.y-dallasElevationAt(spawn.position.x,spawn.position.z)-800)<1e-9);
 assert.ok(-Math.sin(spawn.heading)>.9999);assert.equal(spawn.speed,650);
 assert.equal(authorizedJourneyAirborneSpawn({missionId:mission.id,status:'READY'},mission,dallasElevationAt),undefined);
 // Read only intersecting source chunks, including authored replacements; no guessed obstacle heights.
 const corridor={minX:spawn.position.x-100,maxX:target.bounds.minX+100,minZ:spawn.position.z-100,maxZ:spawn.position.z+100};
 const buildings=sourceBuildings([corridor]);
 for(let x=spawn.position.x;x<=target.bounds.minX;x+=100){
  const y=dallasElevationAt(x,spawn.position.z)+800;
  for(const b of buildings)if(x+100>=b.minX&&x-100<=b.maxX&&spawn.position.z+100>=b.minZ&&spawn.position.z-100<=b.maxZ)
   assert.ok(y>b.top+100,`building clearance at ${x}`);
 }
 for(const airport of cityAirports.dallas)assert.ok(Math.abs(airport.x-spawn.position.x)>airport.runwayWidth/2+100 || Math.abs(airport.z-spawn.position.z)>airport.runwayLength/2+100);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'})!.showAmbientAIAircraft,false);
 assert.equal(territoryCaptureProgress(target,24000),100);
});

test('existing boundaries, movement and capture ceiling determine eligibility',()=>{
 const p={...target.center,y:900};
 assert.equal(territoryCaptureFlightEligible(target,p,100,650,true),true);
 for(const position of [{...p,x:target.bounds.minX-1},{...p,z:target.bounds.maxZ+1},{...p,y:100},{...p,y:100+territoryCaptureCeilingAgl+.01},{...p,x:NaN}])
  assert.equal(territoryCaptureFlightEligible(target,position,100,650,true),false);
 assert.equal(territoryCaptureFlightEligible(target,p,100,0,true),false);
 assert.equal(territoryCaptureFlightEligible(target,p,100,650,false),false);
 assert.equal(territoryCaptureFlightEligible(target,{...p,y:100+territoryCaptureCeilingAgl},100,650,true),true);
});

test('24 valid seconds capture once, first-clear credit is exactly 500; replay and duplicate ticks cannot duplicate rewards',()=>{
 const f=fixture();try{
 const initial=f.profiles.getOrCreate('pilot','Pilot').credits;
 for(let replay=0;replay<2;replay++){
  const a=f.start();let result=a;
  for(let i=1;i<=60;i++)result=f.store.advanceTerritoryCapture('pilot',a.attemptId,true,a.startedAt!+i*400)!;
  assert.equal(result.status,'COMPLETED');assert.equal(result.captureMs,24000);assert.equal(result.finishTimeMs,24000);
  assert.equal(result.firstClearCredits,replay===0?500:0);
  assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,a.startedAt!+24400),undefined);
 }
 assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial+500);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM journey_completions WHERE mission_id=?').get(mission.id)!.n,1);
 }finally{f.close();}
});

test('progress pauses outside/above altitude, survives reopen and pause, and rejects wrong pilot, stale clock, expiry and crash',()=>{
 const f=fixture();try{
 const ready=f.store.launch('pilot','trainer',f.now,mission.id);
 assert.equal(f.store.advanceTerritoryCapture('pilot',ready.attemptId,true,f.now+400),undefined);
 f.store.approach('pilot',ready.attemptId,f.now);const a=f.store.startTerritoryCapture('pilot',ready.attemptId,f.now+400)!;let time=a.startedAt!;
 assert.equal(a.deadlineAt,time+240000);
 assert.equal(f.store.advanceTerritoryCapture('other',a.attemptId,true,time+400),undefined);
 for(let i=0;i<10;i++)f.store.advanceTerritoryCapture('pilot',a.attemptId,true,time+=400);
 assert.equal(f.store.get('pilot',a.attemptId)!.captureMs,4000);
 for(let i=0;i<10;i++)f.store.advanceTerritoryCapture('pilot',a.attemptId,false,time+=400);
 f.store.pause('pilot',a.attemptId,time);
 assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,time+400),undefined);
 const resumed=f.store.resume('pilot',a.attemptId,time+=10000)!.attempt;
 assert.equal(resumed.captureMs,4000);assert.equal(resumed.deadlineAt,a.deadlineAt!+10000);
 assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,time+=400)!.captureMs,4400);
 // Missed ticks and disconnection cannot become catch-up capture time.
 assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,time+=10000)!.captureMs,4400);
 f.store.fail('pilot',a.attemptId,'CRASHED',time);
 assert.equal(f.store.advanceTerritoryCapture('pilot',a.attemptId,true,time+400),undefined);
 assert.equal(f.start().captureMs,0,'retry is a fresh attempt');
 const expired=f.start();assert.equal(f.store.advanceTerritoryCapture('pilot',expired.attemptId,true,expired.deadlineAt!),undefined);
 assert.equal(f.store.fail('pilot',expired.attemptId,'TIME_UP',expired.deadlineAt!)!.failureReason,'TIME_UP');
 }finally{f.close();}
});

test('production territory coordinator requires accepted transforms, connection, life, movement and active unpaused state',()=>{
 const f=fixture();try{
 const a=f.start();let time=a.startedAt!;
 const player:any={pilotId:'pilot',cityId:'dallas',lifeState:'alive',health:100,hasRespawnTransform:true,portalTransit:false,
  lastStateAt:time,lastAcceptedPosition:{...target.center,y:900},position:{x:1e9,y:1e9,z:1e9},velocity:{x:650,y:0,z:0}};
 const players=new Map([['owner',player]]),pausedJourneyAttempts=new Set(),landingFlightState=new Map([['owner',{airborne:true}]]);let connected=true;
 const context=createContext({players,playerJourneyAttempts:new Map([['owner',a.attemptId]]),journeyStore:f.store,
  journeyDallasCapture01:mission,territoriesForCity,territoryCaptureFlightEligible,pausedJourneyAttempts,landingFlightState,
  hasOpenPlayerSocket:()=>connected,botTerrainHeight:()=>100,sendJourneyState:()=>{}});
 const code=source.slice(source.indexOf('function updateJourneyTerritoryCapture('),source.indexOf('function updateTerritories('));
 runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const tick=()=>{time+=400;player.lastStateAt=time;runInContext(`updateJourneyTerritoryCapture(${time})`,context);return f.store.get('pilot',a.attemptId)!.captureMs;};
 assert.equal(tick(),400,'uses accepted server transform rather than display/client position');
 for(const invalid of [()=>{connected=false;},()=>{player.lifeState='destroyed';},()=>{player.health=0;},()=>{player.hasRespawnTransform=false;},()=>{player.portalTransit=true;},()=>{player.cityId='milwaukee';},()=>{player.velocity.x=0;},()=>{landingFlightState.set('owner',{airborne:false});},()=>{pausedJourneyAttempts.add(a.attemptId);},()=>{player.lastAcceptedPosition.y=5000;},()=>{player.lastAcceptedPosition.x=target.bounds.maxX+1;}]){
  const restore={...player,lastAcceptedPosition:{...player.lastAcceptedPosition},velocity:{...player.velocity}};
  invalid();assert.equal(tick(),400);Object.assign(player,restore);connected=true;landingFlightState.set('owner',{airborne:true});pausedJourneyAttempts.clear();
 }
 assert.equal(tick(),800);
 assert.match(source,/missionId === journeyDallasCapture01.id \|\| missionId === journeyDallas18.id/,'global ownership excludes linked M05 including terminal state');
 assert.match(source,/updateJourneyTerritoryCapture\(now\);/,'shares world territory cadence');
 }finally{f.close();}
});

test('rollout keeps existing M06 access, while new pilots must clear M05; progression unlocks Surprise Attack',()=>{
 const f=fixture();try{
 f.db.prepare('DELETE FROM journey_catalog_versions WHERE version=?').run('dallas-capture-01');
 f.db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('pilot',journeyDallas03.id,'old-m04',f.now,1000,1);
 const store=new JourneyAttemptStore(f.path);
 assert.equal(store.canAccessMission('pilot',journeyDallas14.id),true);
 f.db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('other',journeyDallas03.id,'new-m04',f.now,1000,1);
 const reopened=new JourneyAttemptStore(f.path);
 assert.equal(reopened.canAccessMission('other',mission.id),true);
 assert.equal(reopened.canAccessMission('other',journeyDallas14.id),false);
 const a=reopened.launch('other','trainer',f.now,mission.id);reopened.approach('other',a.attemptId,f.now);
 const started=reopened.startTerritoryCapture('other',a.attemptId,f.now+400)!;
 for(let i=1;i<=60;i++)reopened.advanceTerritoryCapture('other',a.attemptId,true,started.startedAt!+i*400);
 assert.equal(reopened.canAccessMission('other',journeyDallas14.id),true);
 }finally{f.close();}
});


test('shared capture HUD follows approach, capture, return and victory; existing walls, radar, map and victory are reused',()=>{
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const attempt:any={status:'APPROACH',captureMs:0};const airplane={position:{x:target.bounds.minX-2500,y:900,z:target.center.z}};
 const context=createContext({journeyAttempt:attempt,airplane,territoryDefinitions:territoriesForCity('dallas'),territoryContains,
  journeyDallasCapture01:mission,territoryCaptureCeilingAgl,getTerrainHeight:()=>100});
 const start=main.indexOf('function journeyTerritoryCaptureLabel('),end=main.indexOf('function updateCaptureHud(',start);
 runInContext(ts.transpileModule(main.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const label=()=>runInContext('journeyTerritoryCaptureLabel()',context);
 assert.equal(label(),'FLY TO LAS COLINAS');
 Object.assign(airplane.position,target.center);attempt.status='RACING';attempt.captureMs=10800;
 assert.equal(label(),'CAPTURE LAS COLINAS — 45%');
 airplane.position.x=target.bounds.minX-1;assert.equal(label(),'RETURN TO LAS COLINAS — 45%');
 attempt.captureMs=24000;assert.equal(label(),'TERRITORY CAPTURED!');
 const styles=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
 assert.match(main,/classList.toggle\('territory-capture-focus', next !== null && attempt\?\.missionId === journeyDallasCapture01.id\)/);
 assert.match(styles,/\.territory-capture-focus #territory-capture:not\(\.hidden\):not\(\[hidden\]\) \{ display: block !important; \}/);
 assert.match(main,/const missionClearMissionIds = new Set<string>\(\[journeyDallasCapture01.id/);
 assert.match(main,/drawRadarTerritories\(direction, focusedTerritoryTargetId\(\)!\)/);
 assert.match(main,/entry.displayColor = state\?\.controllerId \|\| entry.missionTarget \? definition.fixedColor/);
 assert.match(main,/territories: territoryDefinitions.filter[\s\S]*?missionTarget: missionTerritories.includes\(definition.id\) \|\| definition.id === focusedTerritoryTargetId\(\)/);
});
