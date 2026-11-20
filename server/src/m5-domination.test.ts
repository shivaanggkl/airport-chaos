import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalog from '../../shared/journey-mission.mjs';
import {journeyDallasTerritoryDomination01 as mission} from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {territoriesForCity,territoryContains} from '../../shared/city-territories.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {maxHealthForAircraft} from '../../shared/aircraft-health.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {newCaptureCompetition,advanceCaptureCompetition,advanceCaptureRespawn,releaseCaptureActor} from './capture-competition.js';
import {territoryDominationInstructions,missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
import {journeyCategorySlot,categoryMissionAccess} from '../../shared/journey-categories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import * as THREE from 'three';
const source=readFileSync('server/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const compile=(names:string[])=>ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name!.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(){
 const players=new Map<string,any>([['pilot',{pilotId:'pilot',position:{x:0,y:1000,z:0}}]]),spawns:any[]=[];
 const ctx=vm.createContext({...catalog,players,structuredClone,captureCompetitions:new Map(),territoriesForCity,territoryContains,newCaptureCompetition,cityAirports,aircraftFlightEnvelope,maxHealthForAircraft,
  keepDallasEscortInside:(p:any)=>p,botSafeFloor:()=>1000,botRunwayHeight:()=>120,journeyAceClearance:300,
  removeBot:(id:string)=>players.delete(id),createBot:(_c:any,_d:any,spawn:any)=>{spawns.push(spawn);players.set(spawn.captureOpponent.id,{bot:{journeyAttemptId:spawn.attemptId}});}});
 vm.runInContext(compile(['ensureCaptureCompetition','reviveTerritoryHoldOpponent','hunterNavigationTarget']),ctx);
 return {ctx,players,spawns};
}
test('M5 is playable after M4 with six exact territories, nine opponents and no hold period',()=>{
 const slot=journeyCategorySlot(mission.id)!;assert.equal(slot.categoryId,'territory-missions');assert.equal(slot.categoryNumber,5);assert.equal(slot.implementation,'playable');
 assert.equal(categoryMissionAccess(mission.id,new Set()),false);assert.equal(categoryMissionAccess(mission.id,new Set([catalog.journeyDallasTerritoryHold01.id])),true);
 assert.deepEqual(new Set(mission.territoryIds),new Set(['white-rock','downtown','las-colinas','love-field','trinity-corridor','addison']));
 assert.equal(mission.timeLimitMs,600000);assert.equal(mission.firstClearCredits,3000);assert.equal(mission.holdDurationMs,0);assert.equal(mission.opponentRespawnMs,15000);assert.equal(mission.opponentCount,9);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'}).showAmbientAIAircraft,false);
});
test('only Love Field and Trinity start owned; four guardians seek their own districts and three hunt the pilot',()=>{
 const {ctx,spawns}=setup(),attempt={attemptId:'a',missionId:mission.id},state=ctx.ensureCaptureCompetition('pilot',attempt);
 assert.equal(spawns.length,9);assert.equal(state.opponents.filter((e:any)=>e.role==='owner').length,6);assert.equal(state.opponents.filter((e:any)=>e.role==='attacker').length,3);
 assert.ok(state.opponents.every((e:any)=>e.level==='HARD'));
 for(const [index,territory]of state.territories.entries())assert.equal(territory.ownerId,index<2?state.opponents[index].id:undefined);
 assert.deepEqual(Array.from(state.opponents.slice(0,6),(e:any)=>mission.territoryIds[e.goal]),['love-field','trinity-corridor','white-rock','las-colinas','downtown','addison']);
 ctx.ensureCaptureCompetition('pilot',attempt);assert.equal(spawns.length,9);
 // Returning to this attempt restores claims and defeated aircraft without creating replacements early.
 state.opponents[0].health=0;const restored=structuredClone(state);ctx.captureCompetitions.delete('a');
 ctx.ensureCaptureCompetition('pilot',{...attempt,captureFlight:{competition:restored}});assert.equal(spawns.length,9);
});
test('each living owner must be defeated; unassigned guardians can claim their own territory',()=>{
 const {ctx}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});let now=state.updatedAt;
 for(let i=0;i<50;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:'love-field'}],now+=400,true);
 assert.equal(state.territories[0].ownerId,state.opponents[0].id);
 for(let i=0;i<38;i++)advanceCaptureCompetition(state,[{id:state.opponents[2].id,alive:true,territoryId:'white-rock'}],now+=400,true);
 assert.equal(state.territories[2].ownerId,state.opponents[2].id);
 for(const index of [0,2]){
  const enemy=state.opponents[index];enemy.health=0;releaseCaptureActor(state,enemy.id);assert.equal(state.territories[index].ownerId,undefined);
  for(let i=0;i<38;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:mission.territoryIds[index]}],now+=400,true);
  assert.equal(state.territories[index].ownerId,'pilot');
 }
});
test('M5 wins on the final ownership tick, loses progress when a territory is stolen, and rewards once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'m5-domination-')),path=join(dir,'p.sqlite');
 const profiles=new PlayerProfileStore(path),initial=profiles.getOrCreate('pilot','Pilot').credits,store=new JourneyAttemptStore(path,true);let now=Date.now();
 try{
  const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,++now);return store.startTerritoryCapture('pilot',a.attemptId,++now)!;};
  const a=start(),state=newCaptureCompetition([],now,mission.territoryIds);
  const tick=()=>store.advanceTerritoryCapture('pilot',a.attemptId,true,now+=400,false,state)!;
  for(let index=0;index<5;index++){state.territories[index]!.ownerId='pilot';assert.equal(tick().status,'RACING');}
  state.territories[0]!.ownerId='enemy';state.territories[5]!.ownerId='pilot';let updated=tick();assert.equal(updated.captureStage,5);assert.equal(updated.status,'RACING');
  store.pause('pilot',a.attemptId,now);assert.equal(store.advanceTerritoryCapture('pilot',a.attemptId,true,now+5000,false,state),undefined);store.resume('pilot',a.attemptId,now+=5000);
  assert.equal(store.advanceTerritoryCapture('wrong-pilot',a.attemptId,true,now+400,false,state),undefined);
  state.territories[0]!.ownerId='pilot';updated=tick();assert.equal(updated.status,'COMPLETED');assert.equal(updated.captureStage,6);assert.equal(updated.defenseMs,0);assert.equal(updated.finishedAt,now);assert.equal(updated.firstClearCredits,3000);
  assert.equal(store.advanceTerritoryCapture('pilot',a.attemptId,true,now+400,false,state),undefined);
  const replay=start();updated=store.advanceTerritoryCapture('pilot',replay.attemptId,true,now+=400,false,state)!;assert.equal(updated.status,'COMPLETED');assert.equal(updated.firstClearCredits,0);
  assert.equal(profiles.getOrCreate('pilot','Pilot').credits,initial+3000);
  const timed=start();assert.equal(store.advanceTerritoryCapture('pilot',timed.attemptId,true,timed.deadlineAt!,false,state),undefined);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('all nine roles wait a full 15 fresh seconds and return to the DFW runway with their original assignment',()=>{
 const {ctx}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 for(const [slot,enemy]of state.opponents.entries()){
  enemy.health=0;let now=1000;enemy.respawnUpdatedAt=now;
  for(let i=0;i<37;i++)assert.equal(advanceCaptureRespawn(enemy,now+=400,true,mission.opponentRespawnMs),false);
  assert.equal(advanceCaptureRespawn(enemy,now+=20000,false,mission.opponentRespawnMs),false);
  assert.equal(advanceCaptureRespawn(enemy,now+=200,true,mission.opponentRespawnMs),true);
  const identity={id:enemy.id,role:enemy.role,goal:enemy.goal};ctx.reviveTerritoryHoldOpponent('pilot',{}, {attemptId:'a'},enemy,slot);
  assert.deepEqual({id:enemy.id,role:enemy.role,goal:enemy.goal},identity);
  const airport=cityAirports.dallas.find(a=>a.id==='dfw')!;assert.equal(enemy.position.x,airport.x);assert.equal(enemy.position.z,airport.z+airport.runwayLength*.3);assert.equal(enemy.position.y,121.2);assert.equal(enemy.runwayStart,true);assert.equal(enemy.health,maxHealthForAircraft(enemy.aircraft));
 }
});
test('all six guardians defend and recapture their assigned district; all three pursuers follow anywhere in Dallas',()=>{
 const {ctx,players}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 ctx.insideAceInterceptAirspace=()=>true;ctx.safeBotWaypoint=(_c:any,_f:any,to:any)=>to;ctx.botFireSolution=()=>({});ctx.COMBAT_RANGE=9000;
 let plan:any;ctx.planOpponentTactics=(_o:any,input:any)=>{plan=input;return {waypoint:input.objective??input.target.position,tactic:'attackPass',turnSign:1};};
 const pilot=players.get('pilot');pilot.lifeState='alive';pilot.health=100;
 for(let slot=0;slot<9;slot++){
  const saved=state.opponents[slot],enemy={cityId:'dallas',aircraftType:saved.aircraft,position:saved.position},bot={personality:'hunter',journeyCaptureSlot:slot,journeyTargetPlayerId:'pilot',journeyAttemptId:'a',opponent:{},speed:300};
  pilot.position={x:70000,y:2000,z:70000};ctx.hunterNavigationTarget(saved.id,enemy,bot,1000);assert.equal(Boolean(plan.objective),slot<6);
  if(slot<6){assert.equal(saved.goal,slot);pilot.position={...territoriesForCity('dallas').find(t=>t.id===mission.territoryIds[slot])!.center,y:2000};ctx.hunterNavigationTarget(saved.id,enemy,bot,2000);assert.equal(plan.objective,undefined);}
 }
});
test('M5 uses shared instructions and a six-stop screenplay with two owners and four unassigned districts',()=>{
 const detail=missionJourneyDetails.find(m=>m.id===mission.id)!;assert.equal(detail.title,'CAPTURE 6 TERRITORIES');assert.equal(detail.timeLimit,'10:00');assert.equal(detail.rewardCredits,3000);assert.equal(detail.description,territoryDominationInstructions.join('\n'));assert.doesNotMatch(detail.description,/hold|respawn|aggressive|hunter/i);
 const territories=mission.territoryIds.map(id=>territoriesForCity('dallas').find(t=>t.id===id)!);
 const intro=new MissionCaptureIntroPath(territories[0]!,15000,()=>0,undefined,{player:new THREE.Group(),territories,instructions:territoryDominationInstructions,owners:mission.owners.filter(o=>o.initiallyOwned),showNeutralOwnership:true});
 for(let i=0;i<6;i++){const time=3000+i*2000;assert.equal(intro.territoryAt(time)?.id,mission.territoryIds[i]);assert.match(intro.text(time),i<2?/GUARDIAN/:/UNASSIGNED/);assert.doesNotMatch(intro.text(time),/hold|respawn|aggressive/i);}
 assert.equal(intro.durationMs,17000);
});

test('legacy three-territory databases upgrade atomically without losing attempts, continuations or credits',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const dir=mkdtempSync(join(tmpdir(),'m5-upgrade-')),path=join(dir,'p.sqlite');
 const profiles=new PlayerProfileStore(path),initial=profiles.getOrCreate('pilot','Pilot').credits;
 let store=new JourneyAttemptStore(path,true);const a=store.launch('pilot','trainer',1000,catalog.journeyDallasTerritoryHold01.id);
 const db=new DatabaseSync(path);try{
  db.exec(`PRAGMA foreign_keys=ON;BEGIN IMMEDIATE;
    ALTER TABLE journey_attempts ADD COLUMN capture_stage_legacy INTEGER NOT NULL DEFAULT 0 CHECK(capture_stage_legacy BETWEEN 0 AND 3);
    UPDATE journey_attempts SET capture_stage_legacy=3;
    ALTER TABLE journey_attempts DROP COLUMN capture_stage;
    ALTER TABLE journey_attempts RENAME COLUMN capture_stage_legacy TO capture_stage;COMMIT;`);
  db.prepare('INSERT INTO journey_continuations(attempt_id,pilot_id,failed_at,expires_at,payload) VALUES(?,?,?,?,?)').run(a.attemptId,'pilot',1,9999999999999,'{}');
  const before=db.prepare('SELECT * FROM journey_attempts WHERE attempt_id=?').get(a.attemptId);
  store=new JourneyAttemptStore(path,true);assert.deepEqual(db.prepare('SELECT * FROM journey_attempts WHERE attempt_id=?').get(a.attemptId),before);
  assert.equal(store.get('pilot',a.attemptId)!.captureStage,3);assert.ok(db.prepare('SELECT * FROM journey_continuations WHERE attempt_id=?').get(a.attemptId));
  assert.equal(profiles.getOrCreate('pilot','Pilot').credits,initial);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.prepare('UPDATE journey_attempts SET capture_stage=6 WHERE attempt_id=?').run(a.attemptId);assert.equal(store.get('pilot',a.attemptId)!.captureStage,6);
  assert.throws(()=>db.prepare('UPDATE journey_attempts SET capture_stage=7 WHERE attempt_id=?').run(a.attemptId),/CHECK constraint/);
  store=new JourneyAttemptStore(path,true);assert.equal(store.get('pilot',a.attemptId)!.captureStage,6,'migration is idempotent');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
