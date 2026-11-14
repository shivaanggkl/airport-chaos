import {journeyDallasTerritoryDefense01} from '../../shared/journey-mission.mjs';
import {journeyCrossfireMission,journeyMissionOrder,journeyDallas16,journeyDallas18} from '../../shared/journey-mission.mjs';
import {journeyDallas17} from '../../shared/journey-mission.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import {journeyDallas15 as mission,journeyDallas13,journeyDallas14,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {projectileDamageForAircraft} from '../../shared/protocol.mjs';
import {enemyAiLevels,skyHuntersDifficulty} from '../../shared/enemy-ai.mjs';
import {createOpponent} from './opponent.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
import {advanceHunterFlight} from './hunter-flight.js';
import {pursuitProgress} from './hot-pursuit.js';
import {insideJourneyHunterArena,journeyHunterSteeringTarget,boundJourneyHunterPoint} from './journey-hunter-airspace.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {aceDamageAuthorized} from './journey-ace.js';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function runtime(names,context){const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');const ctx=vm.createContext({journeyDallasTerritoryDefense01,journeyCrossfireMission,journeyDallas16,journeyDallas18,journeyDallas17,...context});vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'hot-pursuit-')),path=join(dir,'p.sqlite'),db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");const store=new JourneyAttemptStore(path);db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('pilot',journeyMissionOrder[journeyMissionOrder.indexOf(mission.id)-1],'old-predecessor',1);return{dir,db,store,path};}

test('M9 identity, twelve hits, Addison distance and 55km route remain inside authored mission airspace',()=>{
 assert.equal(journeyMissionSlot(mission.id),11);assert.equal(mission.name,'HOT PURSUIT');assert.equal(mission.bossHealth/projectileDamageForAircraft('trainer'),12);
 const addison=cityAirports.dallas.find(a=>a.id==='addison');assert.equal(mission.startAirportId,addison.id);
 const distance=Math.hypot(addison.x-mission.enemySpawn.x,addison.z-mission.enemySpawn.z);assert.ok(distance>=15000&&distance<=22000);
 let from=mission.enemySpawn,length=0;for(const to of mission.escapeRoute){length+=Math.hypot(to.x-from.x,to.z-from.z);for(let t=0;t<=1;t+=.01)assert.ok(insideJourneyHunterArena({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t}));from=to;}
 assert.ok(length>=45000&&length<=65000);assert.ok(aircraftFlightEnvelope.trainer.maxSpeed>mission.cruiseSpeed*1.8);
});

test('M9 factory creates one escaping Mammoth at Hard difficulty with 300 HP',()=>{
 const players=new Map();
 const ctx=runtime(['createBot'],{journeyDallas13,journeyDallas14,journeyDallas15:mission,
  createOpponent,players,nextBotSerial:1,botNames:['Hunter'],botPersonalities:['hunter'],
  botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,
  botTerrainHeight:()=>120,safeBotWaypoint:(_city,_from,point)=>point,journeyAceClearance:300,
  aircraftFlightEnvelope,DALLAS_WORLD_SCALE:3,pursuitProgress,
  sendToPlayer(){},broadcastToCity:()=>assert.fail('private opponent leaked'),botStateMessage:()=>({})});
 const id=ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner',target:{},ace:true});
 const enemy=players.get(id);
 assert.equal(players.size,1);assert.equal(enemy.aircraftType,'cargo');assert.equal(enemy.displayName,'ESCAPING MAMMOTH');
 assert.equal(enemy.health,300);assert.ok(enemy.bot.journeyPursuit);
 assert.equal(enemy.bot.opponent.definition.level,'HARD');assert.equal(skyHuntersDifficulty[9],'HARD');
 assert.equal(enemy.bot.opponent.definition.behavior,'objective');assert.equal(enemy.bot.opponent.definition.personality,'defensive');
 for(const aircraft of ['trainer','cargo','privateJet','fighter']){
  assert.equal(projectileDamageForAircraft(aircraft),25);assert.equal(enemy.health/projectileDamageForAircraft(aircraft),12);
 }
});

test('real heavy-aircraft integration completes the escape, with bounded defensive maneuvers and no orbit trap',t=>{
 const position={...mission.enemySpawn,y:1000},first=mission.escapeRoute[0];
 const enemy={position,rotation:{x:0,y:Math.atan2(position.x-first.x,position.z-first.z),z:0},velocity:{x:0,y:0,z:0},aircraftType:'cargo'};
 const motion={speed:420,bankControl:0,combatTurnSign:1},progress={index:0,previous:{...position},remaining:0,escaped:false};
 const target={position:{x:position.x+1000,y:1000,z:position.z-1000},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},aircraftType:'trainer'};
 const ai=createOpponent({aircraft:'cargo',livery:mission.enemyLivery,level:'HARD',cityId:'dallas',position,rotation:enemy.rotation,speed:420,health:200,behavior:'objective',personality:'defensive'});
 assert.equal(ai.profile,enemyAiLevels.HARD);
 let seconds=0,breaks=0;
 for(;seconds<180&&!progress.escaped;seconds+=.05){
  pursuitProgress(enemy.position,progress);
  const objective={...mission.escapeRoute[progress.index],y:1000};
  const plan=planOpponentTactics(ai,{enemy,target,targetId:'pilot',speed:motion.speed,now:seconds*1000,cruise:420,objective,firingSolution:false,lockedByTarget:seconds>20&&seconds<26,floorAt:()=>100,inside:insideJourneyHunterArena});
  if(plan.tactic==='defensiveBreak')breaks++;
  const goal=journeyHunterSteeringTarget(enemy.position,{x:-Math.sin(enemy.rotation.y),z:-Math.cos(enemy.rotation.y)},plan.waypoint);
  const previous={...position};advanceHunterFlight(enemy,motion,{...plan.waypoint,...goal},plan.cruise,.05,()=>100);
  assert.ok(Math.hypot(position.x-previous.x,position.z-previous.z)>10);assert.ok(motion.speed<=450);assert.ok(position.y>100);assert.ok(insideJourneyHunterArena(position));
 }
 assert.ok(progress.escaped);assert.ok(seconds>80&&seconds<150);assert.ok(breaks>0);t.diagnostic(`Physical escape ${seconds.toFixed(1)}s; HARD defensive flight remains outbound`);
});

test('takeoff clock, timeout, old-attempt invalidation and preserved completion receipts',()=>{
 const f=fixture();try{const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignHunter('pilot',a.attemptId,'enemy');assert.equal(f.store.get('pilot',a.attemptId).startedAt,null);assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',2000),undefined);assert.equal(f.store.startPursuit('outsider',a.attemptId,2000),undefined);assert.equal(f.store.startPursuit('pilot',a.attemptId,2000).deadlineAt,182000);assert.equal(f.store.startPursuit('pilot',a.attemptId,3000),undefined);assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',182000),undefined);f.store.fail('pilot',a.attemptId,'TIME_UP',182000);assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',301000),undefined);
 const old=f.store.launch('pilot','trainer',400000,mission.id);f.db.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(old.attemptId);new JourneyAttemptStore(f.path);assert.equal(f.store.get('pilot',old.attemptId).failureReason,'MISSION_UPDATED');assert.equal(f.store.progress('pilot',journeyMissionOrder[journeyMissionOrder.indexOf(mission.id)-1]).completed,true);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('twelve production damage applications settle once; escape wins if arrival is already confirmed',()=>{
 const f=fixture();try{
 const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignHunter('pilot',a.attemptId,'enemy');f.store.startPursuit('pilot',a.attemptId,2000);
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,score:0,aircraftType:'trainer'};
 const enemy={entityType:'player',cityId:'dallas',lifeState:'alive',isBot:true,score:0,health:mission.bossHealth,spawnProtectedUntil:0,aircraftType:'cargo',position:{...mission.enemySpawn,y:1000},bot:{journeyAce:true,journeyPursuit:{index:0,previous:{...mission.enemySpawn,y:1000},remaining:40000,escaped:false},journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyProvoked:true}};
 const players=new Map([['owner',pilot],['enemy',enemy]]),packets=[];
 const ctx=runtime(['applyCombatHit','transportEscortHealth'],{pursuitProgress,aceDamageAuthorized,journeyDallas13,journeyDallas14,journeyDallas15:mission,players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyAddisonTakeoff:new Set(['owner']),playerJourneyLoveTakeoff:new Set(),playerJourneyRunwayPrep:new Set(),runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena:()=>true,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:()=>{},provokeJourneyHunter:()=>{},markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:()=>{},broadcastToCity:()=>assert.fail('private actor leaked'),broadcastLeaderboard:()=>{},removeBot:id=>players.delete(id),updateKing:()=>{},cityKings:new Map(),handleWantedDestruction:()=>{},challengeForPlayer:()=>undefined,recordOpponentHit,recordOpponentDamage,failPlayerJourney:()=>assert.fail('unexpected escape')});
 for(let hit=1;hit<=12;hit++){assert.equal(ctx.applyCombatHit('owner','enemy','dallas',3000+hit*500,25),true);assert.equal(enemy.health,mission.bossHealth-hit*25);}
 assert.equal(f.store.get('pilot',a.attemptId).status,'COMPLETED');assert.equal(f.store.get('pilot',a.attemptId).firstClearCredits,1950);assert.equal(players.has('enemy'),false);
 const replay=f.store.launch('pilot','trainer',10000,mission.id);f.store.approach('pilot',replay.attemptId);f.store.assignHunter('pilot',replay.attemptId,'enemy');f.store.startPursuit('pilot',replay.attemptId,11000);
 const finish={...mission.escapeRoute.at(-1),y:1000};enemy.position=finish;enemy.health=25;enemy.lifeState='alive';enemy.bot.journeyAttemptId=replay.attemptId;enemy.bot.journeyPursuit={index:mission.escapeRoute.length-1,previous:{...finish},remaining:0,escaped:false};
 players.set('enemy',enemy);ctx.playerJourneyAttempts.set('owner',replay.attemptId);ctx.failPlayerJourney=(_id,reason,now)=>f.store.fail('pilot',replay.attemptId,reason,now);
 assert.equal(ctx.applyCombatHit('owner','enemy','dallas',12000,25),false);assert.equal(enemy.health,25);
 assert.equal(f.store.get('pilot',replay.attemptId).failureReason,'ENEMY_ESCAPED');assert.equal(f.store.completeHunter('pilot',replay.attemptId,'enemy',12000),undefined);
 assert.equal(f.db.prepare('SELECT credits FROM player_profiles WHERE pilot_id=?').get('pilot').credits,1950);

 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('server-observed destination fails once, cleans up its owned target, and never escapes before takeoff',()=>{
 const f=fixture();try{
 const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignHunter('pilot',a.attemptId,'enemy');
 const finish={...mission.escapeRoute.at(-1),y:1000};const enemy={position:finish,health:200,lifeState:'alive',bot:{journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyPursuit:{index:mission.escapeRoute.length-1,previous:finish,remaining:0,escaped:false}}};
 const pilot={pilotId:'pilot',lifeState:'alive'},players=new Map([['owner',pilot],['enemy',enemy]]);let failures=0;
 const ctx=runtime(['ensureJourneyAce'],{journeyDallas15:mission,players,pursuitProgress,provokeJourneyHunter(){},sendJourneyState:()=>{},failPlayerJourney:(_id,reason,now)=>{failures++;f.store.fail('pilot',a.attemptId,reason,now);players.delete('enemy');}});
 ctx.ensureJourneyAce('owner',pilot,f.store.get('pilot',a.attemptId),1500);assert.equal(failures,0);assert.equal(enemy.bot.journeyPursuit.escaped,false);
 f.store.startPursuit('pilot',a.attemptId,2000);ctx.ensureJourneyAce('owner',pilot,f.store.get('pilot',a.attemptId),3000);ctx.ensureJourneyAce('owner',pilot,f.store.get('pilot',a.attemptId),3100);
 assert.equal(failures,1);assert.equal(players.has('enemy'),false);assert.equal(players.has('owner'),true);assert.equal(f.store.get('pilot',a.attemptId).failureReason,'ENEMY_ESCAPED');assert.equal(f.store.progress('pilot',mission.id).completed,false);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('M9 retaliates within 6km and resumes escape outside it without changing other missions',()=>{
 const enemy={cityId:'dallas',position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},
  bot:{personality:'hunter',journeyPursuit:{index:0,escaped:false,remaining:4000},journeyTargetPlayerId:'pilot',journeyAttemptId:'attempt',journeyProvoked:true,opponent:{}}};
 const pilot={pilotId:'pilot',position:{x:0,y:1000,z:5000}};
 let planInput;
 const ctx=runtime(['hunterNavigationTarget'],{journeyDallas15:mission,hunterFireRange:6000,
  players:new Map([['pilot',pilot]]),journeyStore:{activeSnapshot:()=>({status:'RACING'})},pursuitRecoveryPoses:new Map(),projectilesByOwner:new Map(),
  botSafeFloor:()=>100,journeyAceClearance:300,botFireSolution:()=>({reason:'NO_FORWARD_SOLUTION'}),
  planOpponentTactics:(_runtime,input)=>{planInput=input;return {tactic:'rearIntercept',turnSign:1,waypoint:input.objective??pilot.position};},
  opponentReactionReady:()=>true,insideJourneyHunterArena,safeBotWaypoint:(_city,_from,to)=>to});
 ctx.hunterNavigationTarget('enemy',enemy,enemy.bot,1000);
 assert.equal(planInput.objective,undefined,'pursuer behind the Mammoth must permit combat turns');
 pilot.position.z=6001;ctx.hunterNavigationTarget('enemy',enemy,enemy.bot,2000);
 assert.ok(planInput.objective,'outside gun range the escape route resumes');
 pilot.position.z=5000;enemy.bot.journeyProvoked=false;ctx.hunterNavigationTarget('enemy',enemy,enemy.bot,3000);
 assert.ok(planInput.objective,'unprovoked escape remains intact');
});
