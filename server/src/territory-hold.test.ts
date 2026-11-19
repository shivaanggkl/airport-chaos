import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalog from '../../shared/journey-mission.mjs';
import {journeyDallasTerritoryHold01 as mission} from '../../shared/journey-mission.mjs';
import {journeyCategorySlot} from '../../shared/journey-categories.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {newCaptureCompetition,advanceCaptureCompetition,advanceCaptureRespawn,type CaptureOpponent} from './capture-competition.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
import {territoryHoldInstructions,missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import * as THREE from 'three';
const source=readFileSync('server/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const fn=(name:string)=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const enemy=(i:number):CaptureOpponent=>({id:`enemy-${i}`,aircraft:'trainer',level:'HARD',position:{x:0,y:500,z:0},rotation:{x:0,y:0,z:0},velocity:{x:200,y:0,z:0},health:100,goal:i%3});

test('M4 uses the shared territory rules, owns the expected slot, and describes only the player goal',()=>{
 assert.equal(journeyCategorySlot(mission.id)?.categoryId,'territory-missions');assert.equal(journeyCategorySlot(mission.id)?.categoryNumber,4);
 assert.equal(mission.timeLimitMs,360000);assert.equal(mission.firstClearCredits,2500);assert.equal(mission.holdDurationMs,30000);assert.equal(mission.opponentRespawnMs,10000);
 assert.deepEqual(mission.owners.map(o=>o.territoryId),mission.territoryIds);
 const detail=missionJourneyDetails.find(d=>d.id===mission.id)!;assert.equal(detail.description,territoryHoldInstructions.join('\n'));assert.equal(detail.timeLimit,'6:00');
 assert.doesNotMatch(detail.description,/respawn|aggressive|hunter|10 seconds/i);
});

test('a live initial owner must be defeated before its territory can be stolen',()=>{
 let now=1000;const state=newCaptureCompetition(Array.from({length:6},(_,i)=>enemy(i)),now);
 state.territories.forEach((t,i)=>t.ownerId=state.opponents[i]!.id);
 for(let i=0;i<45;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:state.territories[0]!.id}],now+=400,true);
 assert.equal(state.territories[0]!.ownerId,'enemy-0');
 state.opponents[0]!.health=0;
 advanceCaptureCompetition(state,[{id:'enemy-0',alive:false},{id:'pilot',alive:true,territoryId:state.territories[0]!.id}],now+=400,true);
 for(let i=0;i<39;i++)advanceCaptureCompetition(state,[{id:'pilot',alive:true,territoryId:state.territories[0]!.id}],now+=400,true);
 assert.equal(state.territories[0]!.ownerId,'pilot');
 // The player cannot physically occupy all three territories: a returned owner can steal an unattended one.
 for(let i=0;i<39;i++)advanceCaptureCompetition(state,[{id:'enemy-0',alive:true,territoryId:state.territories[0]!.id},{id:'pilot',alive:true}],now+=400,true);
 assert.equal(state.territories[0]!.ownerId,'enemy-0');
});

test('hold requires 30 uninterrupted fresh seconds, resets on loss, survives pause/restart, and rewards once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'territory-hold-')),path=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');let store=new JourneyAttemptStore(path,true),now=Date.now();
 try{
  const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now+1);return store.startTerritoryCapture('pilot',a.attemptId,now+=10)!;};
  let a=start(),state=newCaptureCompetition([],now);state.territories.forEach(t=>t.ownerId='pilot');
  const tick=(fresh=true,ms=400)=>store.advanceTerritoryCapture('pilot',a.attemptId,fresh,now+=ms,false,state)!;
  for(let i=0;i<25;i++)a=tick();assert.equal(a.defenseMs,10000);assert.equal(a.status,'RACING');
  a=tick(false,30000);assert.equal(a.defenseMs,10000,'offline time cannot advance the hold');
  state.territories[1]!.ownerId='enemy';a=tick();assert.equal(a.defenseMs,0);
  state.territories[1]!.ownerId='pilot';for(let i=0;i<25;i++)a=tick();
  store.saveCaptureFlight('pilot',a.attemptId,{position:{x:0,y:500,z:0},rotation:{x:0,y:0,z:0},velocity:{x:200,y:0,z:0},health:100,updatedAt:now,competition:state});
  store.pause('pilot',a.attemptId,now);now+=5000;
  assert.equal(store.advanceTerritoryCapture('pilot',a.attemptId,true,now,false,state),undefined);
  store=new JourneyAttemptStore(path,true);assert.equal(store.get('pilot',a.attemptId)!.defenseMs,10000);assert.deepEqual(store.get('pilot',a.attemptId)!.captureFlight!.competition,state);
  store.resume('pilot',a.attemptId,now);a=tick(false);assert.equal(a.defenseMs,10000);
  for(let i=0;i<49;i++)a=tick();assert.equal(a.status,'RACING');a=tick();assert.equal(a.status,'COMPLETED');assert.equal(a.firstClearCredits,2500);
  a=start();for(let i=0;i<75;i++)a=tick();assert.equal(a.status,'COMPLETED');assert.equal(a.firstClearCredits,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('M4 intro identifies each current owner and explains capture and hold without AI internals',()=>{
 const territories=territoriesForCity('dallas').filter(t=>mission.territoryIds.includes(t.id));
 const player=new THREE.Group();const intro=new MissionCaptureIntroPath(territories[0]!,15000,()=>0,undefined,{player,territories,instructions:territoryHoldInstructions,owners:mission.owners});
 for(const elapsed of [4000,7000,9000]){
  const territory=intro.territoryAt(elapsed)!,owner=mission.owners.find(o=>o.territoryId===territory.id)!;
  assert.match(intro.text(elapsed),new RegExp(owner.name));assert.match(intro.text(elapsed),/30 seconds/);assert.doesNotMatch(intro.text(elapsed),/respawn|aggressive|10 seconds/i);
 }
});

test('respawn waits the full ten seconds of active time and never credits pause/disconnection',()=>{
 const e=enemy(0);e.health=0;e.respawnRemainingMs=10000;e.respawnUpdatedAt=1000;
 assert.equal(advanceCaptureRespawn(e,1100,true,10000),false);assert.equal(e.respawnRemainingMs,9900);
 assert.equal(advanceCaptureRespawn(e,50100,false,10000),false);assert.equal(e.respawnRemainingMs,9900);
 assert.equal(advanceCaptureRespawn(e,100100,true,10000),false);assert.equal(e.respawnRemainingMs,9900);
 let now=100100;
 for(let i=0;i<24;i++)assert.equal(advanceCaptureRespawn(e,now+=400,true,10000),false);
 assert.equal(e.respawnRemainingMs,300);assert.equal(advanceCaptureRespawn(e,now+299,true,10000),false);
 assert.equal(advanceCaptureRespawn(e,now+300,true,10000),true);
});

test('production M4 setup creates exactly three named territory owners and three hunters',()=>{
 const players=new Map<string,any>([['owner',{position:{x:0,y:1000,z:0}}]]),states=new Map(),spawns:any[]=[];
 const ctx=vm.createContext({...catalog,players,captureCompetitions:states,territoriesForCity,newCaptureCompetition,
  keepDallasEscortInside:(p:any)=>p,aircraftFlightEnvelope:{trainer:{maxSpeed:500},privateJet:{maxSpeed:600},cargo:{maxSpeed:400},fighter:{maxSpeed:800}},
  maxHealthForAircraft:()=>100,botSafeFloor:()=>0,journeyAceClearance:300,
  createBot:(_city:any,_defense:any,data:any)=>{spawns.push(data);players.set(data.captureOpponent.id,{bot:{journeyAttemptId:data.attemptId}});}});
 vm.runInContext(compile(fn('ensureCaptureCompetition')),ctx);
 const a={attemptId:'test',missionId:mission.id};const state=ctx.ensureCaptureCompetition('owner',a);
 assert.equal(spawns.length,6);assert.equal(state.opponents.filter((e:any)=>e.role==='owner').length,3);assert.equal(state.opponents.filter((e:any)=>e.role==='attacker').length,3);
 state.territories.forEach((t:any,i:number)=>assert.equal(t.ownerId,state.opponents[i].id));
 assert.deepEqual(Array.from(state.opponents.slice(0,3),(e:any)=>e.name),mission.owners.map(o=>o.name));
 ctx.ensureCaptureCompetition('owner',a);assert.equal(spawns.length,6,'refresh cannot duplicate opponents');
 state.opponents[0].health=0;ctx.ensureCaptureCompetition('owner',a);assert.equal(spawns.length,6,'dead owners cannot respawn through setup');
});

test('every M4 opponent respawns at DFW even when Love Field is nearer',()=>{
 const airports=[{id:'love',x:0,z:0,heading:0,runwayLength:500},{id:'dfw',x:10000,z:20000,heading:0,runwayLength:1000}];
 const players=new Map<string,any>();let spawned:any;
 const ctx=vm.createContext({players,botAirports:()=>airports,botRunwayHeight:()=>120,maxHealthForAircraft:()=>100,
  removeBot:(id:string)=>players.delete(id),createBot:(_city:any,_defense:any,data:any)=>spawned=data});
 vm.runInContext(compile(fn('reviveTerritoryHoldOpponent')),ctx);
 for(let slot=0;slot<6;slot++){
  const e=enemy(slot);e.health=0;e.role=slot<3?'owner':'attacker';e.respawnRemainingMs=0;
  players.set(e.id,{lifeState:'destroyed'});
  ctx.reviveTerritoryHoldOpponent('pilot',{}, {attemptId:'a'},e,slot);
  assert.equal(spawned.captureOpponent.id,e.id);assert.equal(e.runwayStart,true);assert.equal(e.health,100);assert.equal(e.position.y,121.2);
  assert.deepEqual({...e.position},{x:10000,y:121.2,z:20300});assert.deepEqual({...e.velocity},{x:0,y:0,z:0});
  assert.equal(e.respawnRemainingMs,undefined);assert.equal(e.role,slot<3?'owner':'attacker');
 }
});

export {source,fn,compile,enemy};
