import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalog from '../../shared/journey-mission.mjs';
import {journeyDallasCaptureThree01 as mission} from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {territoriesForCity,territoryContains} from '../../shared/city-territories.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {maxHealthForAircraft} from '../../shared/aircraft-health.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {newCaptureCompetition,advanceCaptureCompetition,advanceCaptureRespawn,releaseCaptureActor} from './capture-competition.js';
import {captureThreeInstructions,missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
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
test('M3 starts with exactly two named territory owners and two HARD pursuing opponents',()=>{
 const {ctx,spawns}=setup(),attempt={attemptId:'a',missionId:mission.id},state=ctx.ensureCaptureCompetition('pilot',attempt);
 assert.equal(state.opponents.length,4);assert.deepEqual(Array.from(state.opponents,(e:any)=>e.role),['owner','owner','attacker','attacker']);
 assert.ok(state.opponents.every((e:any)=>e.level==='HARD'));
 state.territories.forEach((t:any,i:number)=>assert.equal(t.ownerId,state.opponents[i].id));
 assert.deepEqual(Array.from(state.opponents.slice(0,2),(e:any)=>e.name),mission.owners.map(o=>o.name));
 ctx.ensureCaptureCompetition('pilot',attempt);assert.equal(spawns.length,4);
 for(const enemy of state.opponents){enemy.health=0;ctx.ensureCaptureCompetition('pilot',attempt);}assert.equal(spawns.length,4,'refresh never bypasses respawn buffer');
});
test('M3 requires killing the owner, capturing both, and 15 uninterrupted fresh seconds; rewards once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'m3-takeover-')),path=join(dir,'p.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');let store=new JourneyAttemptStore(path,true),now=Date.now();
 try{
 const {ctx}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 for(let i=0;i<45;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:mission.territoryIds[0]}],now+=400,true);
 assert.equal(state.territories[0].ownerId,state.opponents[0].id,'living initial owner cannot be bypassed');
 state.opponents.forEach((e:any)=>{e.health=0;releaseCaptureActor(state,e.id);});
 for(const id of mission.territoryIds)for(let i=0;i<38;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:id}],now+=400,true);
 assert.ok(state.territories.every((t:any)=>t.ownerId==='pilot'));
 const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now+1);return store.startTerritoryCapture('pilot',a.attemptId,now+=10)!;};
 let a=start();const tick=(fresh=true,ms=400)=>store.advanceTerritoryCapture('pilot',a.attemptId,fresh,now+=ms,false,state)!;
 a=tick();assert.equal(a.defenseMs,0,'capture tick never counts toward holding');for(let i=0;i<25;i++)a=tick();assert.equal(a.defenseMs,10000);assert.equal(a.status,'RACING');
 a=tick(false,20000);assert.equal(a.defenseMs,10000);
 state.territories[0].ownerId='enemy';a=tick();assert.equal(a.defenseMs,0);
 state.territories[0].ownerId='pilot';a=tick();for(let i=0;i<25;i++)a=tick();
 store.saveCaptureFlight('pilot',a.attemptId,{position:{x:0,y:500,z:0},rotation:{x:0,y:0,z:0},velocity:{x:200,y:0,z:0},health:100,updatedAt:now,competition:state});
 store.pause('pilot',a.attemptId,now);now+=5000;assert.equal(store.advanceTerritoryCapture('pilot',a.attemptId,true,now,false,state),undefined);
 store=new JourneyAttemptStore(path,true);assert.equal(store.get('pilot',a.attemptId)!.defenseMs,10000);store.resume('pilot',a.attemptId,now);
 for(let i=0;i<12;i++)a=tick();assert.equal(a.status,'RACING');a=tick();assert.equal(a.status,'COMPLETED');assert.equal(a.defenseMs,15000);assert.equal(a.firstClearCredits,2250);
 a=start();for(let i=0;i<39;i++)a=tick();assert.equal(a.status,'COMPLETED');assert.equal(a.firstClearCredits,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('all four M3 roles wait 15 fresh seconds and relaunch at DFW without changing identity or goal',()=>{
 const {ctx}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 for(const [slot,enemy]of state.opponents.entries()){
  enemy.health=0;let now=1000;enemy.respawnUpdatedAt=now;
  for(let i=0;i<37;i++)assert.equal(advanceCaptureRespawn(enemy,now+=400,true,mission.opponentRespawnMs),false);
  assert.equal(advanceCaptureRespawn(enemy,now+=30000,false,mission.opponentRespawnMs),false);
  assert.equal(advanceCaptureRespawn(enemy,now+=200,true,mission.opponentRespawnMs),true);
  const id=enemy.id,role=enemy.role,goal=enemy.goal;ctx.reviveTerritoryHoldOpponent('pilot',{}, {attemptId:'a'},enemy,slot);
  const airport=cityAirports.dallas.find(a=>a.id==='dfw')!;
  assert.equal(enemy.id,id);assert.equal(enemy.role,role);assert.equal(enemy.goal,goal);assert.equal(enemy.position.x,airport.x);assert.equal(enemy.position.z,airport.z+airport.runwayLength*.3);assert.equal(enemy.position.y,121.2);assert.equal(enemy.runwayStart,true);assert.equal(enemy.health,maxHealthForAircraft(enemy.aircraft));
 }
});
test('M3 owner defends and recaptures its own territory; both hunters pursue outside the territories',()=>{
 const {ctx,players}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 ctx.journeyAceClearance=300;ctx.insideAceInterceptAirspace=()=>true;ctx.safeBotWaypoint=(_c:any,_f:any,to:any)=>to;ctx.botFireSolution=()=>({});ctx.COMBAT_RANGE=9000;
 let plan:any;ctx.planOpponentTactics=(_o:any,input:any)=>{plan=input;return {waypoint:input.objective??input.target.position,tactic:'attackPass',turnSign:1};};
 const pilot=players.get('pilot');pilot.lifeState='alive';pilot.health=100;
 for(const slot of [0,1,2,3]){
  const saved=state.opponents[slot],enemy={cityId:'dallas',aircraftType:saved.aircraft,position:saved.position},bot={personality:'hunter',journeyCaptureSlot:slot,journeyTargetPlayerId:'pilot',journeyAttemptId:'a',opponent:{},speed:300};
  pilot.position={x:80000,y:2000,z:80000};ctx.hunterNavigationTarget(saved.id,enemy,bot,1000);
  assert.equal(Boolean(plan.objective),slot<2);
  if(slot<2){assert.equal(saved.goal,slot);pilot.position={...territoriesForCity('dallas').find(t=>t.id===mission.territoryIds[slot])!.center,y:2000};ctx.hunterNavigationTarget(saved.id,enemy,bot,2000);assert.equal(plan.objective,undefined);}
 }
});
test('M3 journey, pause/gameplay instructions and screenplay explain ownership and the 15 second goal',()=>{
 const detail=missionJourneyDetails.find(m=>m.id===mission.id)!;assert.equal(detail.description,captureThreeInstructions.join('\n'));assert.match(detail.title,/HOLD 2/);assert.doesNotMatch(detail.description,/respawn|aggressive|HARD|hunter/i);
 const definitions=mission.territoryIds.map(id=>territoriesForCity('dallas').find(t=>t.id===id)!);
 const intro=new MissionCaptureIntroPath(definitions[0]!,15000,()=>0,undefined,{player:new THREE.Group(),territories:definitions,instructions:captureThreeInstructions,owners:mission.owners});
 for(const time of [3000,6000]){assert.match(intro.text(time),/GUARDIAN/);assert.match(intro.text(time),/15 seconds/);}
 assert.equal(catalog.journeyDallasTerritoryHold01.holdDurationMs,30000);assert.equal(catalog.journeyDallasTerritoryHold01.opponentCount,6);assert.equal(catalog.journeyDallasTerritoryHold01.opponentRespawnMs,10000);
});

test('the production damage hook schedules every M3 role for respawn and releases defeated ownership',()=>{
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applyCombatHit') as ts.FunctionDeclaration;
 const hook=fn.body!.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast).startsWith('victim.bot?.journeyCaptureSlot !== undefined'))!;
 const {ctx}=setup(),state=ctx.ensureCaptureCompetition('pilot',{attemptId:'a',missionId:mission.id});
 let checkpoints=0;
 const testContext=vm.createContext({...catalog,players:new Map([['pilot',{pilotId:'pilot'}]]),captureCompetitions:new Map([['a',state]]),journeyStore:{activeSnapshot:()=>({missionId:mission.id})},releaseCaptureActor,checkpointJourneyCapture:()=>checkpoints++,now:5000});
 for(const [slot,enemy]of state.opponents.entries()){
  testContext.victim={health:0,bot:{journeyCaptureSlot:slot,journeyAttemptId:'a',journeyTargetPlayerId:'pilot'}};testContext.victimId=enemy.id;
  vm.runInContext(ts.transpileModule(hook.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,testContext);
  assert.equal(enemy.health,0);assert.equal(enemy.respawnRemainingMs,15000);assert.equal(enemy.respawnUpdatedAt,5000);
  assert.ok(state.territories.every((t:any)=>t.ownerId!==enemy.id));
 }
 assert.equal(checkpoints,4);
});
