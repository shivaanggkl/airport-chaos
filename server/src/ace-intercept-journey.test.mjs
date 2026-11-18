import * as THREE from 'three';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.ts';
import {RewardedAdStore} from './rewarded-ads.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {journeyDallasAceIntercept01 as mission} from '../../shared/journey-mission.mjs';
import {aceInterceptIntroText} from '../../shared/ace-intercept.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {projectileDamageForAircraft} from '../../shared/protocol.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {aceInterceptDistance,insideAceInterceptAirspace,updateAceIntercept} from './ace-intercept.js';
import {createOpponent,opponentReactionReady} from './opponent.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
import {advanceHunterFlight} from './hunter-flight.js';
import {pursuitProgress} from './hot-pursuit.js';
import {insideJourneyHunterArena,dallasEscortSteeringTarget,boundJourneyHunterPoint,journeyHunterSteeringTarget} from './journey-hunter-airspace.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
function runtime(names,context={}){
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const ctx=vm.createContext({structuredClone,insideAceInterceptAirspace,...missions,updateAceIntercept,pursuitProgress,projectileDamageForAircraft,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ace-intercept-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 const store=new JourneyAttemptStore(path,true);
 return {dir,path,db,store,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
function initial(){const position={...mission.enemySpawn,y:1300};delete position.altitude;delete position.heading;return {phase:'DOGFIGHT',health:350,position,rotation:{x:0,y:2.709,z:0},velocity:{x:0,y:0,z:-650},speed:650,updatedAt:1000,route:{index:0,previous:{...position},remaining:0,escaped:false}};}
function launched(f,now=Date.now()){
 const a=f.store.launch('pilot','trainer',now,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignFirstContact('pilot',a.attemptId,'enemy');f.store.saveAceIntercept('pilot',a.attemptId,'enemy',initial());return f.store.get('pilot',a.attemptId);
}
test('M20 replaces only slot 20 with the specified unscaled configuration and intro',()=>{
 assert.equal(missions.journeyCatalog.length,30);assert.equal(missions.journeyMissionSlot(mission.id),20);
 assert.equal(missions.journeyMissionSlot(missions.journeyDallas15.id),11);assert.equal(missions.journeyMissionSlot(missions.journeyDallas16.id),17);
 assert.equal(mission.timeLimitMs,260000);assert.equal(mission.firstClearCredits,2150);assert.equal(mission.enemyHealth,350);
 assert.equal(mission.enemyLivery,'firehawk-stealth-gray');assert.equal(mission.difficulty,'HARD');
 assert.deepEqual(mission.escapeRoute,[{x:-6000,z:-12000},{x:10000,z:-2000},{x:25000,z:16000},{x:38000,z:43000}]);
 assert.equal(mission.runwayStart,true);assert.equal(mission.startAirportId,'dfw');
 const attempt={missionId:mission.id,status:'APPROACH'};
 assert.equal(authorizedJourneyAirborneSpawn(attempt,mission,()=>150),undefined);
 const start=source.indexOf('  const spawnAirportId ='),end=source.indexOf('  // All six Golden Gates',start);
 assert.ok(start>=0&&end>start);
 const context=vm.createContext({...missions,journeyAttempt:attempt,soloExploreMode:false});
 vm.runInContext(source.slice(start,end)+'\nglobalThis.selectedAirport=spawnAirportId;',context);
 assert.equal(context.selectedAirport,'dfw');
 assert.ok(aircraftFlightEnvelope.trainer.maxSpeed>mission.escapeMaxSpeed);
 assert.deepEqual([0,2000,5000,8000].map(aceInterceptIntroText),['ACE INTERCEPT','A dangerous Firehawk has entered Dallas airspace!','Intercept and destroy the enemy!','Watch out — this pilot fights back!']);
 assert.ok(missionFocusForAttempt({missionId:mission.id,status:'RACING'}));
});
test('factory creates one assigned Firehawk at safe exact coordinates, HARD AI and 350 HP',()=>{
 const players=new Map(),ctx=runtime(['createBot'],{players,createOpponent,nextBotSerial:1,botNames:['Hunter'],botPersonalities:['hunter'],
  botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,botTerrainHeight:()=>120,botSafeFloor:()=>1800,
  safeBotWaypoint:(_city,_from,p)=>p,journeyAceClearance:300,aircraftFlightEnvelope,DALLAS_WORLD_SCALE:3,
  sendToPlayer(){},broadcastToCity:()=>assert.fail('private actor leaked'),botStateMessage:()=>({})});
 const id=ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner',target:{},firstContact:true,aceIntercept:true});
 const enemy=players.get(id);
 assert.equal(players.size,1);assert.equal(enemy.position.x,-17000);assert.equal(enemy.position.z,-18500);assert.equal(enemy.position.y,1850);
 assert.equal(enemy.rotation.y,2.709);assert.equal(enemy.health,350);assert.equal(enemy.aircraftType,'fighter');assert.equal(enemy.bot.speed,650);
 assert.equal(enemy.bot.opponent.profile,enemyAiLevels.HARD);assert.equal(enemy.bot.opponent.cosmetics['livery:fighter'],'firehawk-stealth-gray');
 const saved=structuredClone(enemy.bot.journeyAceIntercept);updateAceIntercept(saved,175,saved.position);saved.position.x=-14000;saved.route.index=1;
 players.delete(id);assert.equal(ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner2',target:{},firstContact:true,aceIntercept:true,aceInterceptState:saved}),id);
 assert.equal(players.get(id).health,175);assert.equal(players.get(id).bot.journeyAceIntercept.route.index,1);assert.equal(players.get(id).position.x,-14000);
});
test('seven real 25 HP hits transition once without changing motion, escape follows all waypoints physically',t=>{
 const state=initial();let transitions=0;
 for(let n=1;n<=7;n++)transitions+=Number(updateAceIntercept(state,350-n*projectileDamageForAircraft('trainer'),state.position));
 assert.equal(transitions,1);assert.equal(state.phase,'ESCAPE');assert.equal(state.health,175);assert.equal(updateAceIntercept(state,150,state.position),false);
 const enemy={cityId:'dallas',position:{...state.position},rotation:{...state.rotation},velocity:{...state.velocity},aircraftType:'fighter'};
 const motion={personality:'hunter',speed:650,bankControl:0,combatTurnSign:1,journeyAceIntercept:state,journeyProvoked:true,journeyTargetPlayerId:'pilot'};
 const target={position:{x:-22000,y:1300,z:-26000},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:650},aircraftType:'trainer'};
 motion.opponent=createOpponent({aircraft:'fighter',livery:mission.enemyLivery,level:'HARD',cityId:'dallas',position:enemy.position,rotation:enemy.rotation,speed:650,health:150,behavior:'patrol'});
 const ctx=runtime(['hunterNavigationTarget'],{players:new Map([['pilot',target]]),projectilesByOwner:new Map(),botSafeFloor:()=>100,
  botFireSolution:()=>({reason:'OUT_OF_RANGE'}),planOpponentTactics,opponentReactionReady,insideJourneyHunterArena,journeyAceClearance:300,safeBotWaypoint:(_c,_f,p)=>p});
 let seconds=0,lastIndex=0;
 for(;seconds<200&&!state.route.escaped;seconds+=.05){
  target.lockedTargetId=seconds>20&&seconds<23?'enemy':undefined;
  const navigation=ctx.hunterNavigationTarget('enemy',enemy,motion,seconds*1000);
  const goal=dallasEscortSteeringTarget(enemy.position,{x:-Math.sin(enemy.rotation.y),z:-Math.cos(enemy.rotation.y)},navigation.waypoint);
  const before={...enemy.position};advanceHunterFlight(enemy,motion,{...navigation.waypoint,...goal},Math.min(850,motion.opponent.tactics.plan.cruise),.05,()=>100);
  assert.ok(Math.hypot(enemy.position.x-before.x,enemy.position.z-before.z)<=850*.05+1);assert.ok(motion.speed<=850);
  assert.ok(insideAceInterceptAirspace(enemy.position));updateAceIntercept(state,150,enemy.position);
  assert.ok(state.route.index>=lastIndex&&state.route.index<=lastIndex+1);lastIndex=state.route.index;
 }
 assert.equal(state.route.index,3);assert.equal(state.route.escaped,true);assert.ok(seconds<200);t.diagnostic(`Escape route reached physically in ${seconds.toFixed(1)} seconds`);
});
test('GO clock, checkpoint persistence, pause, authority, deadline and idempotent reward',()=>{
 const f=fixture();try{
 const now=Date.now(),a=launched(f,now);assert.equal(a.startedAt,null);assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',now),undefined);
 assert.equal(f.store.startFirstContact('other',a.attemptId,now),undefined);
 const go=f.store.startFirstContact('pilot',a.attemptId,now+10000);assert.equal(go.deadlineAt,now+250000);
 const state=initial();updateAceIntercept(state,175,state.position);state.route.index=2;state.updatedAt=now+12000;
 assert.ok(f.store.saveAceIntercept('pilot',a.attemptId,'enemy',state));assert.equal(f.store.saveAceIntercept('other',a.attemptId,'enemy',state),undefined);
 assert.equal(f.store.saveAceIntercept('pilot',a.attemptId,'wrong',state),undefined);
 assert.equal(f.store.saveAceIntercept('pilot',a.attemptId,'enemy',{...state,phase:'DOGFIGHT'}),undefined);
 const reopened=new JourneyAttemptStore(f.path,true);assert.deepEqual(reopened.get('pilot',a.attemptId).aceIntercept,state);
 f.store.pause('pilot',a.attemptId,now+14000);assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',now+15000),undefined);
 const resumed=f.store.resume('pilot',a.attemptId,now+24000).attempt;assert.equal(resumed.deadlineAt,go.deadlineAt+10000);assert.equal(resumed.aceIntercept.route.index,2);
 state.health=0;state.updatedAt=now+25000;assert.ok(f.store.saveAceIntercept('pilot',a.attemptId,'enemy',state));
 const done=f.store.completeHunter('pilot',a.attemptId,'enemy',now+25000);assert.equal(done.status,'COMPLETED');assert.equal(done.firstClearCredits,2150);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',now+25001),undefined);assert.equal(f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,2150);
 const retry=launched(f,now+26000);assert.equal(retry.aceIntercept.phase,'DOGFIGHT');assert.equal(retry.aceIntercept.health,350);
 f.store.startFirstContact('pilot',retry.attemptId,now+27000);state.route.index=0;
 f.store.saveAceIntercept('pilot',retry.attemptId,'enemy',state);const replay=f.store.completeHunter('pilot',retry.attemptId,'enemy',now+28000);assert.equal(replay.firstClearCredits,0);
 const timed=launched(f,now+29000);f.store.startFirstContact('pilot',timed.attemptId,now+30000);state.health=0;f.store.saveAceIntercept('pilot',timed.attemptId,'enemy',state);
 assert.equal(f.store.completeHunter('pilot',timed.attemptId,'enemy',now+270000),undefined);assert.equal(f.store.fail('pilot',timed.attemptId,'TIME_UP',now+270000).failureReason,'TIME_UP');
 }finally{f.close();}
});

test('actual combat applies fourteen validated hits, enforces intro and fire delay, wins once and rejects escape/timeout hits',()=>{
 const f=fixture();try{
 const now=Date.now(),a=launched(f,now),state=initial();state.updatedAt=now;
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,health:100,score:0,aircraftType:'trainer',position:{x:-20000,y:1300,z:-25000},lastAcceptedPosition:{x:-20000,y:1300,z:-25000},rotation:{x:0,y:-.432,z:0},velocity:{x:0,y:0,z:650}};
 const enemy={entityType:'player',cityId:'dallas',lifeState:'alive',isBot:true,score:0,health:350,spawnProtectedUntil:0,aircraftType:'fighter',position:{...state.position},rotation:{...state.rotation},velocity:{...state.velocity},bot:{speed:650,journeyFirstContact:true,journeyAceIntercept:state,journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyProvoked:true}};
 const players=new Map([['owner',pilot],['enemy',enemy]]),packets=[];
 const ctx=runtime(['applyCombatHit','transportEscortHealth','checkpointAceIntercept'],{players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyRunwayPrep:new Set(),
  runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena,
  botKillRewardMultiplier:.1,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:()=>{},provokeJourneyHunter:()=>{},
  markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',isHumanPilot:()=>false,persistScore:()=>{},broadcastToCity:()=>assert.fail('mission actor leaked'),
  broadcastLeaderboard(){},removeBot:id=>players.delete(id),updateKing(){},cityKings:new Map(),handleWantedDestruction(){},challengeForPlayer:()=>undefined,
  recordOpponentHit,recordOpponentDamage,maxHealthForAircraft:()=>100,failPlayerJourney:(_id,reason,time)=>f.store.fail('pilot',ctx.playerJourneyAttempts.get('owner'),reason,time)});
 assert.equal(ctx.applyCombatHit('owner','enemy','dallas',now+5000,25),false,'intro blocks all damage');
 f.store.startFirstContact('pilot',a.attemptId,now+10000);
 assert.equal(ctx.applyCombatHit('enemy','owner','dallas',now+15999,25),false,'enemy cannot fire before GO + 6 seconds');
 assert.equal(pilot.health,100);
 for(let hit=1;hit<=14;hit++){
  assert.equal(ctx.applyCombatHit('owner','enemy','dallas',now+10000+hit*500,25),true);
  assert.equal(enemy.health,350-hit*25);
  if(hit===7)assert.equal(state.phase,'ESCAPE');
 }
 assert.equal(f.store.get('pilot',a.attemptId).status,'COMPLETED');assert.equal(f.store.get('pilot',a.attemptId).firstClearCredits,2150);assert.equal(players.has('enemy'),false);
 assert.equal(ctx.applyCombatHit('owner','enemy','dallas',now+18000,25),false);
 assert.equal(packets.filter(p=>p.type==='damage').length,14);
 for(const reason of ['ENEMY_ESCAPED','TIME_UP']){
  const retry=launched(f,now+20000);f.store.startFirstContact('pilot',retry.attemptId,now+21000);ctx.playerJourneyAttempts.set('owner',retry.attemptId);
  enemy.health=25;enemy.lifeState='alive';enemy.bot.journeyAttemptId=retry.attemptId;enemy.bot.journeyAceIntercept=initial();
  if(reason==='ENEMY_ESCAPED'){
   enemy.position={...mission.escapeRoute.at(-1),y:1300};enemy.bot.journeyAceIntercept.phase='ESCAPE';Object.assign(enemy.bot.journeyAceIntercept.route,{index:3,previous:{...enemy.position}});
  }else enemy.position={...state.position};
  players.set('enemy',enemy);
  assert.equal(ctx.applyCombatHit('owner','enemy','dallas',reason==='TIME_UP'?now+261000:now+22000,25),false);
  assert.equal(enemy.health,25);
  if(reason==='TIME_UP')f.store.fail('pilot',retry.attemptId,reason,now+261000);
  assert.equal(f.store.get('pilot',retry.attemptId).failureReason,reason);
 }
 }finally{f.close();}
});

test('the ten-second screenplay and skip use the assigned actors without moving them',()=>{
 const player=new THREE.Group(),enemy=new THREE.Group();player.position.set(-20000,1200,-25000);enemy.position.set(-17000,1300,-18500);
 const start=enemy.position.clone(),playerStart=player.position.clone(),intro=new CombatMissionIntroPath(enemy,player,20);
 assert.equal(intro.durationMs,10000);const position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(1,2,3),look=new THREE.Vector3(4,5,6);
 for(const elapsed of [0,2000,5000,8000,10000]){intro.sample(elapsed,position,target,chase,look);assert.deepEqual(enemy.position,start);assert.deepEqual(player.position,playerStart);}
 assert.deepEqual(position,chase);assert.deepEqual(target,look);assert.equal(intro.opponent,enemy);
});
test('M20 verified continuation preserves escape phase, health, waypoint and pose, without extra credits',()=>{
 const f=fixture();try{
 const now=Date.now(),a=launched(f,now);f.store.startFirstContact('pilot',a.attemptId,now+1000);
 const state=initial();updateAceIntercept(state,150,state.position);state.route.index=2;state.updatedAt=now+2000;
 f.store.saveAceIntercept('pilot',a.attemptId,'enemy',state);
 const failure=f.store.fail('pilot',a.attemptId,'CRASHED',now+3000);
 assert.equal(f.store.saveContinuation('pilot',a.attemptId,failure.finishedAt,{bots:[{id:'enemy',state}]}),true);
 f.db.exec('CREATE TABLE pilot_daily_rewards(pilot_id TEXT PRIMARY KEY,last_claimed_at INTEGER)');
 const ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId:'ca-app-pub-3940256099942544/5224354917'},webEnabled:false,providerRewardAmount:'1'});
 const receipt=ads.createAttempt('pilot','android',now+4000,`${a.attemptId}:${failure.finishedAt}`);
 const reward={transactionId:'m20-continuation-reward-0001',customData:receipt.attempt.attemptId,adUnit:'5224354917',rewardAmount:'1',timestamp:now+5000,keyId:'test'};
 const verified=ads.grantVerifiedReward(reward,now+5000);assert.equal(verified.ok,true,JSON.stringify(verified));
 const resumed=f.store.continueAfterAd('pilot',a.attemptId,receipt.attempt.attemptId,now+6000);
 assert.deepEqual(resumed.aceIntercept,state);assert.equal(resumed.status,'RACING');assert.equal(resumed.deadlineAt,now+246000);
 assert.equal(f.store.continueAfterAd('pilot',a.attemptId,receipt.attempt.attemptId,now+6001),undefined);
 assert.equal(f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,0);
 }finally{f.close();}
});

test('escape HUD distance uses the remaining enemy route and is bounded to one update per second',()=>{
 const state=initial();assert.equal(aceInterceptDistance(state,1000),undefined);
 updateAceIntercept(state,175,state.position);const distance=aceInterceptDistance(state,1000);assert.ok(distance>50000);
 state.route.remaining=12345;assert.equal(aceInterceptDistance(state,1999),distance);assert.equal(aceInterceptDistance(state,2000),12345);
});
