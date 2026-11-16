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
import {journeyDallasMostWantedSurvival01 as mission} from '../../shared/journey-mission.mjs';
import {mostWantedIntroText} from '../../shared/most-wanted-survival.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {projectileDamageForAircraft} from '../../shared/protocol.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {RewardedAdStore} from './rewarded-ads.js';
import {CrossfireFireCoordinator} from './journey-crossfire.js';
import {insideSurvivalArea,survivalOutcome,survivalReplacement,survivalSteering,defeatSurvivalHunter,shiftSurvival} from './most-wanted-survival.js';
import {createOpponent,opponentReactionReady} from './opponent.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
import {advanceHunterFlight} from './hunter-flight.js';
import {boundJourneyHunterPoint,insideJourneyHunterArena} from './journey-hunter-airspace.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.ts';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
function runtime(names,context={}){
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const ctx=vm.createContext({structuredClone,...catalog,defeatSurvivalHunter,insideSurvivalArea,survivalOutcome,survivalReplacement,survivalSteering,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'journey-survival-')),path=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');profiles.getOrCreate('other','Other');
 const store=new JourneyAttemptStore(path,true),db=new DatabaseSync(path),now=Date.now();
 const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId);
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,health:100,score:0,aircraftType:'trainer',journeySurvivalAttemptId:a.attemptId,
  position:{x:-28000,y:1300,z:-22000},lastAcceptedPosition:{x:-28000,y:1300,z:-22000},rotation:{x:0,y:Math.PI,z:0},velocity:{x:0,y:0,z:650},lastAcceptedTransformAt:now,hasRespawnTransform:true,spawnProtectedUntil:0};
 const players=new Map([['owner',pilot]]),packets=[],coordinators=new Map();
 const ctx=runtime(['createBot','ensureMostWantedSurvival','checkpointSurvival','botCruiseFactor','applyCombatHit','transportEscortHealth','progressionEnabled'],{
  players,journeyStore:store,profileStore:profiles,sendProfile(){},createOpponent,nextBotSerial:1,botNames:['Hunter'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,botTerrainHeight:()=>100,botSafeFloor:()=>200,safeBotWaypoint:(_c,_f,p)=>p,
  journeyAceClearance:300,aircraftFlightEnvelope,DALLAS_WORLD_SCALE:3,hasOpenPlayerSocket:()=>true,crossfireFireCoordinators:coordinators,CrossfireFireCoordinator,
  botFireSolution:()=>({reason:'OUT_OF_RANGE'}),botStateMessage:()=>({}),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:(_id,p)=>packets.push({type:'attempt',attempt:p}),
  broadcastToCity:()=>assert.fail('private actor leaked'),playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyRunwayPrep:new Set(),
  runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena,stabilityDiagnosticsEnabled:false,
  airportRepairStays:new Map(),provokeJourneyHunter(){},markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',recordOpponentHit,recordOpponentDamage,
  isHumanPilot:p=>!p.isBot,botKillRewardMultiplier:.1,persistScore(){},broadcastLeaderboard(){},removeBot:id=>players.delete(id),updateKing(){},cityKings:new Map(),handleWantedDestruction(){},challengeForPlayer:()=>undefined,
  removePlayerProjectiles(){},setServerLock(){},removeJourneyHunter:attempt=>{for(const [id,p]of players)if(p.bot?.journeyAttemptId===attempt.attemptId)players.delete(id);coordinators.delete(attempt.attemptId);},
  failPlayerJourney:(_id,reason,time)=>store.fail('pilot',a.attemptId,reason,time)});
 const update=time=>{pilot.lastAcceptedTransformAt=time;ctx.ensureMostWantedSurvival('owner',pilot,store.get('pilot',a.attemptId),time);return store.get('pilot',a.attemptId);};
 return {dir,path,store,profiles,db,now,a,pilot,players,packets,ctx,update,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M26 identity, exact unscaled spawns, HARD/MEDIUM profiles and protected M20/M21 slots',()=>{
 assert.equal(catalog.journeyCatalog.length,30);assert.equal(catalog.journeyMissionSlot(mission.id),26);assert.equal(catalog.journeyMissionSlot(catalog.journeyDallasAceIntercept01.id),20);assert.equal(catalog.journeyMissionSlot(catalog.journeyDallasCaptureThree01.id),21);
 assert.equal(mission.timeLimitMs,120000);assert.equal(mission.firstClearCredits,2600);assert.equal(mission.replacementDelayMs,15000);
 assert.deepEqual(mission.enemies.map(e=>[e.aircraft,e.livery,e.level,e.health,e.fireDelayMs]),[['fighter','firehawk-stealth-gray','HARD',300,8000],['privateJet','nightowl-sunset-red','MEDIUM',250,10000]]);
 assert.deepEqual(authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,()=>100),{position:{x:-28000,y:1200,z:-22000},heading:Math.PI,speed:650});
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'}).showAmbientAIAircraft,false);
 const f=fixture();try{
  const a=f.update(f.now);assert.equal(f.players.size,3);assert.equal(a.startedAt,null);
  for(const [slot,h]of a.mostWanted.hunters.entries()){
   const enemy=f.players.get(h.id),definition=mission.enemies[slot];
   assert.deepEqual([enemy.position.x,enemy.position.z],[definition.x,definition.z]);assert.ok(Math.abs(enemy.position.y-f.pilot.position.y)<=150);
   assert.equal(enemy.health,definition.health);assert.equal(enemy.bot.opponent.profile,enemyAiLevels[definition.level]);assert.equal(enemy.bot.opponent.cosmetics[`livery:${definition.aircraft}`],definition.livery);
  }
  assert.equal(f.ctx.applyCombatHit('owner',a.targetId,'dallas',f.now+100,25),false,'no intro damage');
 }finally{f.close();}
});
test('real combat needs 12/10 hits; kills do not win or pay, and replacements arrive after 15 seconds with no duplicate actors',()=>{
 const f=fixture();try{
 let a=f.update(f.now);const initial=f.profiles.getOrCreate('pilot','Pilot').credits;assert.equal(f.ctx.progressionEnabled(f.pilot),false,'no ordinary flight/chaos credits during survival');
 f.store.startDoubleThreat('pilot',a.attemptId,f.now+1000);a=f.update(f.now+1000);
 assert.equal(a.deadlineAt-a.startedAt,120000);assert.deepEqual(a.mostWanted.hunters.map(h=>h.fireAt),[f.now+9000,f.now+11000]);
 assert.equal(f.ctx.applyCombatHit(a.targetId,'owner','dallas',f.now+8999,25),false);assert.equal(f.ctx.applyCombatHit(a.secondaryTargetId,'owner','dallas',f.now+10999,25),false);
 for(const slot of [0,1]){
  const id=a.mostWanted.hunters[slot].id;
  for(let hit=0;hit<mission.enemies[slot].health/25;hit++)assert.equal(f.ctx.applyCombatHit('owner',id,'dallas',f.now+12000+slot*1000+hit*10,projectileDamageForAircraft('trainer')),true);
  assert.equal(f.players.has(id),false);assert.equal(f.ctx.applyCombatHit('owner',id,'dallas',f.now+13000,25),false);
 }
 a=f.store.get('pilot',a.attemptId);assert.equal(a.status,'RACING');assert.equal(a.mostWanted.hunters.filter(h=>h.nextSpawnAt!==null).length,2);
 assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial);assert.equal(f.pilot.score,0);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,a.targetId,f.now+14000),undefined);
 const firstDue=a.mostWanted.hunters[0].nextSpawnAt,secondDue=a.mostWanted.hunters[1].nextSpawnAt;
 f.update(firstDue-1);assert.equal(f.players.size,1);
 let next=f.update(firstDue);assert.equal(f.players.size,2);assert.equal(next.mostWanted.hunters[0].health,300);assert.equal(next.mostWanted.hunters[0].generation,1);assert.equal(next.mostWanted.hunters[0].fireAt,firstDue+3000);
 next=f.update(secondDue);assert.equal(f.players.size,3);assert.equal(next.mostWanted.hunters[1].health,250);
 for(let i=0;i<5;i++)f.update(secondDue+i*200);assert.equal(f.players.size,3);
 assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial);
 }finally{f.close();}
});
test('replacement candidates honor side order, 1500-unit inset, separation and deferred spawning',()=>{
 const pilot={position:{x:-28000,y:1300,z:-22000},rotation:{x:0,y:Math.PI,z:0},velocity:{x:0,y:0,z:650},health:100,acceptedAt:0};
 const left=survivalReplacement(0,pilot,[],()=>1000),right=survivalReplacement(1,pilot,[],()=>1000);
 assert.deepEqual([Math.round(left.position.x),Math.round(left.position.z)],[-25500,-18000]);assert.deepEqual([Math.round(right.position.x),Math.round(right.position.z)],[-30500,-18000]);
 assert.ok(insideSurvivalArea(left.position,1500));const alternate=survivalReplacement(0,pilot,[left.position],()=>1000);assert.ok(Math.hypot(alternate.position.x-left.position.x,alternate.position.z-left.position.z)>=2200);
 assert.equal(survivalReplacement(0,{...pilot,position:{x:20000,y:1300,z:20000}},[],()=>1000),undefined);
 assert.equal(survivalReplacement(0,pilot,[],()=>NaN),undefined);
 const goal=survivalSteering({x:2500,y:1000,z:0},{x:1,z:0},{x:10000,y:1000,z:0});assert.ok(goal.x<0);assert.equal(goal.y,1000);
});
test('outside grace warns for 10 seconds, zero holds while outside, returning late cannot claim victory',()=>{
 const state={pilot:{position:{x:4000,y:1000,z:0},health:100},outsideSince:null};
 assert.equal(survivalOutcome(state,120000,117000,true),undefined);assert.equal(state.outsideSince,117000);
 assert.equal(survivalOutcome(state,120000,120000,true),undefined);
 const late=structuredClone(state);state.pilot.position.x=0;assert.equal(survivalOutcome(state,120000,126999,true),'WIN');
 late.pilot.position.x=0;assert.equal(survivalOutcome(late,120000,127000,true),'LEFT_COMBAT_AREA');
 const stale={pilot:{position:{x:0,y:1000,z:0},health:100},outsideSince:null};assert.equal(survivalOutcome(stale,120000,120000,false),undefined);
});
test('surviving wins without kills, pays exactly 2600 once and cleans up both Hunters; retry resets all state',()=>{
 const f=fixture();try{
 let a=f.update(f.now);f.store.startDoubleThreat('pilot',a.attemptId,f.now+1000);a=f.update(f.now+1000);const initial=f.profiles.getOrCreate('pilot','Pilot').credits;
 assert.equal(f.store.completeSurvival('other',a.attemptId,f.now+121000),undefined);
 assert.equal(f.update(f.now+120999).status,'RACING');const done=f.update(f.now+121000);
 assert.equal(done.status,'COMPLETED');assert.equal(done.firstClearCredits,2600);assert.equal(f.players.size,1);assert.equal(f.store.completeSurvival('pilot',a.attemptId,f.now+121001),undefined);
 assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial+2600);
 const retry=f.store.launch('pilot','trainer',f.now+130000,mission.id);assert.equal(retry.mostWanted,undefined);
 f.store.approach('pilot',retry.attemptId);f.pilot.journeySurvivalAttemptId=retry.attemptId;f.ctx.playerJourneyAttempts.set('owner',retry.attemptId);
 f.ctx.ensureMostWantedSurvival('owner',f.pilot,f.store.get('pilot',retry.attemptId),f.now+130000);f.store.startDoubleThreat('pilot',retry.attemptId,f.now+131000);
 f.pilot.lastAcceptedTransformAt=f.now+251000;f.ctx.ensureMostWantedSurvival('owner',f.pilot,f.store.get('pilot',retry.attemptId),f.now+251000);
 assert.equal(f.store.get('pilot',retry.attemptId).firstClearCredits,0);assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial+2600);
 }finally{f.close();}
});
test('pause and durable restore freeze replacement, boundary and survival clocks; validated continuation adds no survival time or credits',()=>{
 const f=fixture();try{
 let a=f.update(f.now);f.store.startDoubleThreat('pilot',a.attemptId,f.now+1000);a=f.update(f.now+1000);
 const state=a.mostWanted;defeatSurvivalHunter(state,state.hunters[0].id,f.now+2000);state.outsideSince=f.now+2000;state.updatedAt=f.now+3000;f.store.saveSurvival('pilot',a.attemptId,state);
 f.store.pause('pilot',a.attemptId,f.now+3000);const reopened=new JourneyAttemptStore(f.path,true),resumed=reopened.resume('pilot',a.attemptId,f.now+13000).attempt;
 assert.equal(resumed.deadlineAt,a.deadlineAt+10000);assert.equal(resumed.mostWanted.hunters[0].nextSpawnAt,f.now+27000);assert.equal(resumed.mostWanted.outsideSince,f.now+12000);
 for(const [id,p]of f.players)if(p.isBot)f.players.delete(id);f.update(f.now+13000);assert.equal(f.players.size,2,'rebuild restores only the expected live generation, not the waiting slot');
 const failed=reopened.fail('pilot',a.attemptId,'CRASHED',f.now+15000);assert.ok(reopened.saveContinuation('pilot',a.attemptId,failed.finishedAt,{bots:[]}));
 const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId:'ca-app-pub-3940256099942544/5224354917'},webEnabled:false,providerRewardAmount:'1'});
 const receipt=ads.createAttempt('pilot','android',f.now+16000,`${a.attemptId}:${failed.finishedAt}`).attempt;
 assert.equal(ads.grantVerifiedReward({transactionId:'survival-continuation',customData:receipt.attemptId,adUnit:'5224354917',rewardAmount:'1',timestamp:f.now+17000,keyId:'test'},f.now+17000).ok,true);
 const initial=f.profiles.getOrCreate('pilot','Pilot').credits,continued=reopened.continueAfterAd('pilot',a.attemptId,receipt.attemptId,f.now+20000);
 assert.equal(continued.deadlineAt,f.now+136000);assert.equal(continued.mostWanted.hunters[0].health,0);assert.equal(continued.mostWanted.hunters[0].nextSpawnAt,f.now+32000);
 assert.equal(continued.mostWanted.hunters[1].health,250);assert.equal(reopened.continueAfterAd('pilot',a.attemptId,receipt.attemptId,f.now+20001),undefined);assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,initial);
 }finally{f.close();}
});
test('12-second intro uses the actual two Hunters, exact screenplay and skip handoff without moving actors',()=>{
 const player=new THREE.Group(),first=new THREE.Group(),second=new THREE.Group();player.position.set(-28000,1300,-22000);first.position.set(-31800,1400,-17100);second.position.set(-23200,1200,-26600);
 const starts=[player.position.clone(),first.position.clone(),second.position.clone()],intro=new CombatMissionIntroPath(first,player,26,false,false,undefined,undefined,false,false,false,undefined,false,second);
 assert.equal(intro.durationMs,12000);assert.deepEqual([0,3000,6000,9000].map(mostWantedIntroText),['YOU ARE MOST WANTED!','Dallas Hunters are coming for you!','Two dangerous aircraft are tracking you!','SURVIVE FOR 2 MINUTES!']);
 const position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(1,2,3),look=new THREE.Vector3(4,5,6);
 for(const time of [0,3000,6000,9000,12000]){intro.sample(time,position,target,chase,look);assert.deepEqual([player.position,first.position,second.position],starts);}
 assert.deepEqual(position,chase);assert.deepEqual(target,look);
});

test('both aircraft use the existing tactical planner and physical flight integrator for moving attack passes',()=>{
 for(const [slot,definition]of mission.enemies.entries()){
  const enemy={aircraftType:definition.aircraft,position:{x:definition.x,y:1400,z:definition.z},rotation:{x:0,y:Math.atan2(definition.x+28000,definition.z+22000),z:0},velocity:{x:0,y:0,z:0}};
  const target={aircraftType:'trainer',position:{x:-28000,y:1400,z:-22000},rotation:{x:0,y:Math.PI,z:0},velocity:{x:0,y:0,z:650}};
  const ai=createOpponent({aircraft:definition.aircraft,livery:definition.livery,level:definition.level,cityId:'dallas',position:enemy.position,rotation:enemy.rotation,speed:650,health:definition.health,behavior:'patrol'});
  const motion={speed:650,bankControl:0,combatTurnSign:1},start={...enemy.position};let attacks=0;
  for(let time=0;time<30000;time+=50){
   target.position.z+=650*.05;
   const plan=planOpponentTactics(ai,{enemy,target,targetId:'pilot',speed:motion.speed,now:time,cruise:900,supportSide:slot===1?1:undefined,
    firingSolution:time>3000,lockedByTarget:time>8000&&time<10000,floorAt:()=>100,inside:insideSurvivalArea,safeWaypoint:(_from,p)=>p});
   if(plan.tactic==='attackPass')attacks++;
   const goal=survivalSteering(enemy.position,{x:-Math.sin(enemy.rotation.y),z:-Math.cos(enemy.rotation.y)},plan.waypoint),before={...enemy.position};
   advanceHunterFlight(enemy,motion,goal,plan.cruise,.05,()=>100);
   assert.ok(Math.hypot(enemy.position.x-before.x,enemy.position.z-before.z)<=aircraftFlightEnvelope[definition.aircraft].maxSpeed*.05+1);assert.ok(enemy.position.y>100);
  }
  assert.ok(Math.hypot(enemy.position.x-start.x,enemy.position.z-start.z)>2000);assert.ok(ai.tactics.transitions.length>0);
  assert.equal(ai.profile,enemyAiLevels[definition.level]);
 }
});
