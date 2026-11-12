import {journeyDallas19,journeyDallas20,journeyDallas21,journeyDallas22,journeyDallas25} from '../../shared/journey-mission.mjs';
import {maxHealthForAircraft} from '../../shared/aircraft-health.mjs';
import {finalShowdownFireReady,recordFinalShowdownShot} from './final-showdown.js';
import {hunterObservedPosition,hunterBallisticSolution} from './hunter-flight.js';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {ballisticShotSpeed,COMBAT_RANGE,AIM_ENVELOPE} from '../../shared/protocol.mjs';
import {projectileImpactFraction} from '../../shared/projectile-collision.mjs';
import {opponentAim} from './opponent.js';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import { recordOpponentHit, recordOpponentDamage } from './opponent-tactics.js';
import { createOpponent } from './opponent.js';
import { ambushApproach, ambushCanFire, ambushCruiseSpeed } from './surprise-attack.js';
import { advanceHunterFlight } from './hunter-flight.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import { journeyDallas18 as mission, journeyDallas17, journeyDallas07, journeyDallas10, journeyDallas14, journeyDallas13, journeyDallas15, journeyDallas16, journeyDallas23, journeyMissionSlot } from '../../shared/journey-mission.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { projectileDamageForAircraft } from '../../shared/protocol.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { boundJourneyHunterPoint } from './journey-hunter-airspace.js';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function runtime(names, context) {
  const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
    .map(node => node.getText(ast)).join('\n');
  const sandbox = vm.createContext({journeyDallas19,journeyDallas20,journeyDallas21,journeyDallas22,journeyDallas25,maxHealthForAircraft,journeyDallas18:mission,journeyDallas17,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas23,recordOpponentHit,recordOpponentDamage,runwayCombatProtected:()=>false,...context});
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox;
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'final-showdown-')), path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES('pilot',0,0),('old',0,0)");
  const store = new JourneyAttemptStore(path);
  db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('pilot', journeyDallas17.id, 'm11', 1);
  return { directory, path, db, store };
}

function assignAll(store,pilotId,attemptId,prefix='enemy') {
 for(const ordinal of [1,2,3,4]) assert.ok(store.assignFirstContact(pilotId,attemptId,`${prefix}${ordinal}`,ordinal));
 return store.get(pilotId,attemptId);
}
function defeatAll(store,pilotId,attemptId,prefix,now){
 for(const ordinal of [1,2,3,4]) assert.ok(store.completeHunter(pilotId,attemptId,`${prefix}${ordinal}`,now));
 return store.get(pilotId,attemptId);
}

test('four server-owned opponents, duplicate prevention, aggression boundary and permanent latch',()=>{
 const pilot={pilotId:'pilot',lifeState:'alive',position:{x:0,y:100,z:0}};
 const active={missionId:mission.id,attemptId:'attempt',status:'APPROACH',targetId:null,secondaryTargetId:null,rearGuardThirdId:null,rearGuardFourthId:null,crossfireKills:0};
 const players=new Map();let created=0,engaged=0;
 const ctx=runtime(['ensureFirstContact'],{journeyDallas13,players,
  createBot:(_city,_defense,spawn)=>{created++;assert.equal(spawn.firstContact,true);assert.equal(spawn.finalShowdown,true);
   const id=`enemy${spawn.contactOrdinal}`;players.set(id,{bot:{journeyFirstContact:true,journeyFinalShowdown:true,journeyAttemptId:'attempt',journeyTargetPlayerId:'owner'},lifeState:'alive',health:mission.enemies[spawn.contactOrdinal-1].health,position:{x:mission.aggressionDistance+1,y:900,z:0}});return id;},
  journeyStore:{assignFirstContact:(_pilot,_attempt,id,ordinal)=>{active[['targetId','secondaryTargetId','rearGuardThirdId','rearGuardFourthId'][ordinal-1]]=id;return active;}},
  removeBot:()=>assert.fail('unexpected removal'),sendJourneyState(){},failPlayerJourney:()=>assert.fail('unexpected failure'),
  provokeJourneyHunter:(_owner,_pilot,id)=>{engaged++;players.get(id).bot.journeyProvoked=true;}});
 ctx.ensureFirstContact('owner',pilot,active,1000);ctx.ensureFirstContact('owner',pilot,active,1100);
 assert.equal(created,4);assert.equal(engaged,0);
 active.status='RACING';ctx.ensureFirstContact('owner',pilot,active,1200);assert.equal(engaged,0);
 for(const id of ['enemy1','enemy2','enemy3','enemy4'])players.get(id).position.x=mission.aggressionDistance;
 ctx.ensureFirstContact('owner',pilot,active,1300);assert.equal(engaged,4);
 for(const enemy of players.values())enemy.position.x+=5000;
 ctx.ensureFirstContact('owner',pilot,active,1460);assert.equal(engaged,4);
 active.crossfireKills=5;players.delete('enemy1');players.delete('enemy3');ctx.ensureFirstContact('owner',pilot,active,1500);
});

test('three-minute clock requires all assigned targets, rejects outsiders and pays once after all four',()=>{
 const f=fixture();try{
  const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId,1100);
  assert.equal(f.store.startTimedGateClock('pilot',a.attemptId,1200),undefined);
  assert.equal(f.store.startFirstContact('pilot',a.attemptId,1200),undefined);
  assert.equal(f.store.assignFirstContact('other',a.attemptId,'enemy1'),undefined);
  assert.equal(f.store.assignFirstContact('pilot',a.attemptId,'enemy3',3),undefined);
  assert.ok(f.store.assignFirstContact('pilot',a.attemptId,'enemy1'));
  assert.equal(f.store.startFirstContact('pilot',a.attemptId,1300),undefined);
  assert.equal(f.store.assignFirstContact('pilot',a.attemptId,'enemy1',2),undefined);
  assert.ok(f.store.assignFirstContact('pilot',a.attemptId,'enemy2',2));
  assert.equal(f.store.startFirstContact('pilot',a.attemptId,1400),undefined);
  assert.ok(f.store.assignFirstContact('pilot',a.attemptId,'enemy3',3));
  assert.equal(f.store.assignFirstContact('pilot',a.attemptId,'duplicate',3),undefined);
  assert.equal(f.store.startFirstContact('pilot',a.attemptId,1400),undefined);
  assert.ok(f.store.assignFirstContact('pilot',a.attemptId,'enemy4',4));
  assert.equal(f.store.assignFirstContact('pilot',a.attemptId,'extra',5),undefined);
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy1',1500),undefined);
  const started=f.store.startFirstContact('pilot',a.attemptId,2000);assert.equal(started.deadlineAt,2000+mission.timeLimitMs);
  assert.equal(f.store.startFirstContact('pilot',a.attemptId,3000),undefined);
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'wrong',3000),undefined);
  for(const id of ['enemy3','enemy1','enemy4'])assert.equal(f.store.completeHunter('pilot',a.attemptId,id,3000).status,'RACING');
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy3',3500),undefined);
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy2',started.deadlineAt),undefined);
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy2',started.deadlineAt-1).firstClearCredits,2400);
  assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy2',started.deadlineAt-1),undefined);
  const replay=f.store.launch('pilot','trainer',300000,mission.id);f.store.approach('pilot',replay.attemptId);
  assignAll(f.store,'pilot',replay.attemptId,'new');f.store.startFirstContact('pilot',replay.attemptId,301000);
  assert.equal(defeatAll(f.store,'pilot',replay.attemptId,'new',302000).firstClearCredits,0);
  assert.equal(f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,2400);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM wallet_transactions WHERE reference_id=?').get(mission.id).n,1);
 }finally{f.db.close();rmSync(f.directory,{recursive:true,force:true});}
});

test('old active single-Firehawk attempts are invalidated once; historical clears survive and new attempts resume safely', () => {
  const f = fixture();
  try {
    f.db.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at) VALUES('old-race','old',?,'dallas','trainer','RACING',1)").run(mission.id);
    f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('old', mission.id, 'historical', 1);
    f.db.prepare("UPDATE journey_attempts SET definition_revision=1 WHERE attempt_id='old-race'").run();
    const reopened = new JourneyAttemptStore(f.path);
    assert.equal(reopened.get('old', 'old-race').failureReason, 'MISSION_UPDATED');
    assert.equal(reopened.progress('old', mission.id).firstAttemptId, 'historical');
    const fresh = reopened.launch('old', 'trainer', 2000, mission.id);
    assert.equal(new JourneyAttemptStore(f.path).get('old', fresh.attemptId).status, 'READY');
    reopened.approach('old', fresh.attemptId); assignAll(reopened,'old',fresh.attemptId,'new');
    reopened.startFirstContact('old', fresh.attemptId, 3000);
    assert.equal(defeatAll(reopened,'old',fresh.attemptId,'new',4000).firstClearCredits, 0);
  } finally { f.db.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('12 / 12 / 8 / 8 hits destroy only owned targets and pay after all four', () => {
  const f = fixture();
  try {
    const a = f.store.launch('pilot', 'trainer', 1000, mission.id);
    f.store.approach('pilot', a.attemptId); assignAll(f.store,'pilot',a.attemptId);
    f.store.startFirstContact('pilot', a.attemptId, 2000);
    const pilot = { pilotId: 'pilot', entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: false, score: 0, aircraftType: 'trainer' };
    const enemy = { entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: true, score: 0, health: 200, spawnProtectedUntil: 0, aircraftType: 'cargo',
      bot: { journeyFirstContact: true, journeyFinalShowdown: true, journeyAttemptId: a.attemptId, journeyTargetPlayerId: 'owner', journeyProvoked: true } };
    const enemies=mission.enemies.map((config,index)=>({...enemy,health:config.health,aircraftType:config.aircraft,bot:{...enemy.bot,journeyContactOrdinal:index+1}}));
    const players = new Map([['owner', pilot], ...enemies.map((e,index)=>[`enemy${index+1}`,e]), ['outsider', { ...pilot, pilotId: 'other' }]]);
    const packets = [];
    const ctx = runtime(['applyCombatHit', 'transportEscortHealth'], { journeyDallas13, journeyDallas18: mission, ambushCanFire, journeyDallas15: { id: 'journey-dallas-15' }, players, journeyStore: f.store,
      playerJourneyAttempts: new Map([['owner', a.attemptId]]), playerJourneyRunwayPrep: new Set(),
      focusedBotInteractionExcluded: () => false, tutorialCombatPairAllowed: () => true, sameCombatContext: () => true,
      insideJourneyHunterArena: () => true, stabilityDiagnosticsEnabled: false, airportRepairStays: new Map(),
      sendToPlayer: (_owner, p) => packets.push(p), sendJourneyState: () => {}, provokeJourneyHunter: () => {},
      markPlayerDestroyed: (_id, p) => { p.lifeState = 'destroyed'; }, isHumanPilot: () => false,
      botKillRewardMultiplier: .1, persistScore: () => {}, broadcastToCity: () => assert.fail('private enemy leaked'),
      broadcastLeaderboard: () => {}, removeBot: id => players.delete(id), updateKing: () => {}, cityKings: new Map(),
      handleWantedDestruction: () => {}, challengeForPlayer: () => undefined,
    });
    assert.equal(ctx.applyCombatHit('outsider', 'enemy1', 'dallas', 3000, 25), false);
    enemies[0].bot.journeyProvoked = false;
    assert.equal(ctx.applyCombatHit('owner', 'enemy1', 'dallas', 3000, 25), false);
    enemies[0].bot.journeyProvoked = true;
    let totalHits=0;
    for (const [index,ordinal] of [4,2,3,1].entries()) {
      const target=`enemy${ordinal}`, e=players.get(target), config=mission.enemies[ordinal-1];
      assert.equal(ctx.transportEscortHealth(e.bot,e.aircraftType),config.health);
      for(let hit=1;hit<=config.health/25;hit++){
        totalHits++;
        assert.equal(ctx.applyCombatHit('owner',target,'dallas',3000+totalHits*500,projectileDamageForAircraft('trainer')),true);
        assert.equal(e.health,config.health-hit*25);
        assert.equal(f.store.get('pilot',a.attemptId).status,index===3&&hit===config.health/25?'COMPLETED':'RACING');
      }
    }
    assert.ok(['enemy1','enemy2','enemy3','enemy4'].every(id=>!players.has(id)));
    assert.equal(packets.filter(p=>p.type==='damage').length,40);
    assert.equal(f.store.get('pilot', a.attemptId).firstClearCredits, 2400);
  } finally { f.db.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('all four actual aircraft factories and flight integrator keep the airborne patrol inside its safe scaled 7.5-kilometre area', () => {
  const players = new Map(), sent = [];
  const ctx = runtime(['createBot', 'botStateMessage', 'transportEscortHealth', 'transportEscortCosmetics', 'advanceBotFlight', 'moveTowardBot', 'isHunterCombatPhase', 'botMinimumTurnRadius', 'smoothHunter', 'hunterClearance'], {
    advanceHunterFlight, createOpponent,
    journeyDallas10, journeyDallas13, journeyDallas18: mission,journeyDallas17, ambushCanFire, players, nextBotSerial: 1, botNames: ['Hunter'], botPersonalities: ['hunter'],
    botAirports: () => cityAirports.dallas, airportRoute: () => [], boundJourneyHunterPoint,
    botTerrainHeight: () => 120, botRunwayHeight: () => 120, safeBotWaypoint: (_city, _from, p) => p,
    sendToPlayer: (_owner, p) => sent.push(p), broadcastToCity: () => assert.fail('private spawn leaked'),
    aircraftFlightEnvelope, wrapAngle: a => Math.atan2(Math.sin(a), Math.cos(a)),
    hunterForward: p => ({ x: -Math.sin(p.rotation.y) * Math.cos(p.rotation.x), y: Math.sin(p.rotation.x), z: -Math.cos(p.rotation.y) * Math.cos(p.rotation.x) }),
    journeyAceClearance: 300, botCruiseClearance: 609.6, botCombatClearance: 609.6, botSafeFloor: (_city, _x, _z, clearance) => 120 + clearance,
    keepJourneyHunterInside: p => p,
  });
  for(const ordinal of [1,2,3,4]){
  const config=mission.enemies[ordinal-1];
  const id = ctx.createBot('dallas', undefined, { attemptId: 'attempt', targetPlayerId: 'owner', target: {}, firstContact: true, finalShowdown: true, contactOrdinal:ordinal });
  const enemy = players.get(id), spawn = { ...enemy.position };
  assert.equal(enemy.bot.opponent.profile,enemyAiLevels[config.level]);
  assert.equal(enemy.bot.opponent.definition.personality,'aggressive');
  assert.equal(enemy.aircraftType,config.aircraft);assert.equal(enemy.health,config.health);
  assert.equal(!!enemy.bot.finalShowdownBurst,config.aircraft==='fighter');
  if(enemy.bot.finalShowdownBurst){assert.equal(enemy.bot.finalShowdownBurst.shots,0);assert.equal(enemy.bot.finalShowdownBurst.nextShotAt,0);}
  assert.equal(enemy.position.y,120+config.altitude);assert.equal(Math.hypot(enemy.velocity.x,enemy.velocity.z),600);
  assert.equal(sent.at(-1).equippedCosmetics[`livery:${config.aircraft}`],config.livery);
  assert.equal(sent.at(-1).maxHealth,config.health);
  let maxRadius = 0, minSpeed = Infinity;
  for (let tick = 0; tick < 600; tick++) {
    let waypoint = enemy.bot.route[enemy.bot.routeIndex];
    if (Math.hypot(enemy.position.x - waypoint.x, enemy.position.z - waypoint.z) < Math.max(26, ctx.botMinimumTurnRadius(enemy.aircraftType, enemy.bot.speed) * .75)) {
      enemy.bot.routeIndex = (enemy.bot.routeIndex + 1) % enemy.bot.route.length;
      waypoint = enemy.bot.route[enemy.bot.routeIndex];
    }
    ctx.advanceBotFlight(enemy, enemy.bot, waypoint, .2);
    maxRadius = Math.max(maxRadius, Math.hypot(enemy.position.x - spawn.x, enemy.position.z - spawn.z));
    minSpeed = Math.min(minSpeed, Math.hypot(enemy.velocity.x, enemy.velocity.z));
    assert.ok(enemy.position.y >= 1000);
  }
  assert.ok(maxRadius <= mission.patrolRadius + 700, `patrol wandered ${maxRadius}m`);
  assert.ok(minSpeed > 300, `patrol stopped: ${minSpeed}m/s`);
  }
  assert.equal(players.size,4);
});



test('M12 keeps identity, DFW runway, safe spawn, canonical LEGENDARY and original rewards', () => {
  const dfw=cityAirports.dallas.find(a=>a.id===mission.startAirportId);
  assert.equal(journeyMissionSlot(mission.id),12);
  assert.equal(mission.name,'FINAL SHOWDOWN');assert.equal(mission.startAirportId,'dfw');
  const distance=Math.hypot(mission.enemySpawn.x-dfw.x,mission.enemySpawn.z-dfw.z);
  assert.ok(distance>=16000&&distance<=24000);assert.equal(mission.enemyAltitude,2700);
  const enemy=createOpponent({aircraft:mission.enemyAircraft,livery:mission.enemyLivery,level:'LEGENDARY',personality:'aggressive',behavior:'patrol',cityId:'dallas',position:{...mission.enemySpawn,y:1000},rotation:{x:0,y:0,z:0},speed:mission.cruiseSpeed,health:mission.enemyHealth});
  assert.equal(enemy.profile,enemyAiLevels.LEGENDARY);assert.equal(mission.enemyHealth,300);
  assert.equal(projectileDamageForAircraft('trainer')*12,mission.enemyHealth);
  assert.deepEqual(mission.enemies.map(({aircraft,health,level})=>({aircraft,health,level})),[
   {aircraft:'fighter',health:300,level:'LEGENDARY'},{aircraft:'fighter',health:300,level:'LEGENDARY'},
   {aircraft:'privateJet',health:200,level:'VERY_HARD'},{aircraft:'trainer',health:200,level:'LEGENDARY'}]);
  assert.equal(mission.firstClearCredits,2400);assert.equal(mission.timeLimitMs,180000);
  for(const obsolete of ['territoryId','captureMs','defenseMs','defenseRadius','hunterDelayMs'])assert.equal(obsolete in mission,false);
  assert.doesNotMatch(source,/updateSiegeCapture|updateSiegeDefense|assignSiegeHunter/);
});

test('all four opponents produce real forward ballistic hits against a moving Bluejay; evading after launch can miss',()=>{
 const normalize=v=>{const n=Math.hypot(v.x,v.y,v.z);return{x:v.x/n,y:v.y/n,z:v.z/n};},dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const ctx=runtime(['botFireSolution','muzzleTransform','rotateLocalYxz','forwardDirection','hunterForward'],{aircraftPresentationMuzzleSockets,aircraftFlightEnvelope,AIM_ENVELOPE,hunterObservedPosition,hunterBallisticSolution,smoothHunter:()=>true,runwayCombatProtected:()=>false,hunterFireCone:.2,hunterFireRange:COMBAT_RANGE,defenderDownwardFireAngle:.3,normalize,dot});
 for(const config of mission.enemies){
  const shooter={aircraftType:config.aircraft,position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-500},bot:{opponent:{profile:enemyAiLevels[config.level]}}};
  const target={aircraftType:'trainer',position:{x:0,y:1000,z:-1200},rotation:{x:0,y:0,z:0},velocity:{x:100,y:0,z:-300}};
  const solution=ctx.botFireSolution(shooter,target,false);assert.equal(solution.reason,undefined);
  const aim=opponentAim(enemyAiLevels[config.level],solution.aimX,solution.aimY,()=>.6),direction=normalize(ctx.rotateLocalYxz({x:aim.x,y:aim.y,z:-1},shooter.rotation)),origin=ctx.muzzleTransform(shooter).position,speed=ballisticShotSpeed(shooter.velocity,direction);
  const hit=evasive=>{let previous={...origin},p={...target.position},v={...target.velocity};for(let t=.01;t<COMBAT_RANGE/speed;t+=.01){if(evasive&&t>.15){const x=v.x*Math.cos(.008)-v.z*Math.sin(.008);v.z=v.x*Math.sin(.008)+v.z*Math.cos(.008);v.x=x;}p={x:p.x+v.x*.01,y:p.y,z:p.z+v.z*.01};const end={x:origin.x+direction.x*speed*t,y:origin.y+direction.y*speed*t,z:origin.z+direction.z*speed*t};if(projectileImpactFraction(previous,end,p,v,.01,4.49)!==null)return true;previous=end;}return false;};
  assert.equal(hit(false),true,`${config.aircraft} can hit a genuinely moving target`);assert.equal(hit(true),false,'post-launch evasion does not redirect bullets');
 }
});

test('timeout, death, exit, and retry cannot leave a live completion or inherit prior target state',()=>{
 const f=fixture();try{
  for(const reason of ['TIME_UP','AIRCRAFT_DESTROYED']){
   const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId,1100);assignAll(f.store,'pilot',a.attemptId);f.store.startFirstContact('pilot',a.attemptId,2000);
   f.store.fail('pilot',a.attemptId,reason,reason==='TIME_UP'?422000:3000);
   assert.equal(f.store.completeHunter('pilot',a.attemptId,'enemy',4000),undefined);
  }
  const a=f.store.launch('pilot','trainer',400000,mission.id);assert.equal(a.targetId,null);assert.equal(a.startedAt,null);assert.equal(a.deadlineAt,null);
  f.store.abandon('pilot',a.attemptId,400100);assert.equal(f.store.get('pilot',a.attemptId).status,'ABANDONED');
  assert.equal(f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,0);
  assert.match(source,/playerJourneyDfwTakeoff\.add\(playerId\)/);
  assert.match(source,/active\?\.missionId === journeyDallas18\.id \? playerJourneyDfwTakeoff\.has\(playerId\)/);
 }finally{f.db.close();rmSync(f.directory,{recursive:true,force:true});}
});

test('exit removes all four owned opponents, shots and targeting; squad cannot repair',()=>{
 const player={assistedAim:{},aimSamples:[]},enemy={isBot:true,bot:{journeyAttemptId:'attempt',journeyTargetPlayerId:'owner',journeyFinalShowdown:true}},unrelated={isBot:true,bot:{journeyAttemptId:'another'}};
 const players=new Map([['owner',player],...['enemy1','enemy2','enemy3','enemy4'].map(id=>[id,{...enemy,bot:{...enemy.bot}}]),['other',unrelated]]),removedShots=[],sent=[];
 const ctx=runtime(['removeJourneyHunter','removeBot','updateRepairStations'],{
  journeyDallas07:{id:'7'},journeyDallas08:{id:'8'},journeyDallas09:{id:'9'},journeyDallas10:{id:'10'},journeyDallas11:{id:'11'},journeyDallas12:{id:'12'},journeyDallas18:{id:'18'},journeyDallas19:{id:'19'},
  players,playerJourneyAttempts:new Map([['owner','attempt']]),setServerLock:()=>{},removePlayerProjectiles:id=>removedShots.push(id),clearPlayerRuntimeState:()=>{},portalFlights:new Map(),sendToPlayer:(_id,p)=>sent.push(p),broadcastToCity:()=>assert.fail('private removal leaked'),doubleHunterMotion:new Map(),crossfireFireCoordinators:new Map(),crossfireDefeatedHunters:new Map(),crossfireHunterMotion:new Map(),
  pausedJourneyPlayers:new Set(['owner','other']),pausedTrainingPlayers:new Set(),
 });
 // The enemy repair exclusion must execute before touching repair state or geometry.
 ctx.updateRepairStations(1000);
 ctx.removeJourneyHunter({missionId:mission.id,attemptId:'attempt',targetId:'enemy1',secondaryTargetId:'enemy2',rearGuardThirdId:'enemy3',rearGuardFourthId:'enemy4'});
 assert.ok(['enemy1','enemy2','enemy3','enemy4'].every(id=>!players.has(id)));assert.equal(players.has('other'),true);
 assert.deepEqual(removedShots,['owner','enemy1','enemy2','enemy3','enemy4']);assert.equal(player.assistedAim,undefined);assert.equal(player.aimSamples,undefined);
 assert.ok(sent.every(packet=>packet.type==='remove'));assert.deepEqual(sent.map(packet=>packet.playerId),['enemy1','enemy2','enemy3','enemy4']);
});

test('five received Firehawk hits deal exactly 20 HP while ordinary Firehawk weapons deal 25 HP',()=>{
 const f=fixture();try{
  const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId);assignAll(f.store,'pilot',a.attemptId);f.store.startFirstContact('pilot',a.attemptId,2000);
    const pilot = { pilotId: 'pilot', entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: false, score: 0, health:100, spawnProtectedUntil:0, aircraftType: 'trainer' };
    const enemy = { entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: true, score: 0, health: 300, spawnProtectedUntil: 0, aircraftType: 'fighter',
      bot: { journeyFirstContact: true, journeyFinalShowdown: true, journeyAttemptId: a.attemptId, journeyTargetPlayerId: 'owner', journeyProvoked: true } };
    const players = new Map([['owner', pilot], ['enemy1', enemy], ['outsider', { ...pilot, pilotId: 'other' }]]);
    const packets = [];
    const ctx = runtime(['applyCombatHit', 'transportEscortHealth'], { journeyDallas18:mission, journeyDallas13, journeyDallas17, ambushCanFire, journeyDallas15: { id: 'journey-dallas-15' }, players, journeyStore: f.store,
      playerJourneyAttempts: new Map([['owner', a.attemptId]]), playerJourneyRunwayPrep: new Set(),
      focusedBotInteractionExcluded: () => false, tutorialCombatPairAllowed: () => true, sameCombatContext: () => true,
      insideJourneyHunterArena: () => true, stabilityDiagnosticsEnabled: false, airportRepairStays: new Map(),
      sendToPlayer: (_owner, p) => packets.push(p), sendJourneyState: () => {}, provokeJourneyHunter: () => {},
      markPlayerDestroyed: (_id, p) => { p.lifeState = 'destroyed'; f.store.fail('pilot',a.attemptId,'CRASHED',6000); }, isHumanPilot: () => false,
      botKillRewardMultiplier: .1, persistScore: () => {}, broadcastToCity:(_city,p)=>packets.push(p),
      broadcastLeaderboard: () => {}, removeBot: id => players.delete(id), updateKing: () => {}, cityKings: new Map(),
      handleWantedDestruction: () => {}, challengeForPlayer: () => undefined,
    });

  assert.equal(projectileDamageForAircraft('fighter'),25);
  for(const ordinal of [3,4]){
   const config=mission.enemies[ordinal-1],id=`enemy${ordinal}`;
   players.set(id,{...enemy,health:config.health,aircraftType:config.aircraft,bot:{...enemy.bot,journeyContactOrdinal:ordinal}});
   assert.equal(ctx.applyCombatHit(id,'owner','dallas',3100,projectileDamageForAircraft(config.aircraft)),true);
   assert.equal(pilot.health,75,'Very Hard wingmen retain ordinary 25 damage');
   pilot.health=100;
  }
  packets.length=0;
  enemy.bot.journeyProvoked=false;assert.equal(ctx.applyCombatHit('enemy1','owner','dallas',3000,40),false);enemy.bot.journeyProvoked=true;
  for(let n=1;n<=5;n++){
   assert.equal(ctx.applyCombatHit('enemy1','owner','dallas',3000+n*750,40),true);
   assert.equal(pilot.health,100-n*20);assert.equal(pilot.lifeState,n===5?'destroyed':'alive');
  }
  assert.equal(packets.filter(p=>p.type==='damage').length,5);
  assert.ok(packets.filter(p=>p.type==='damage').every(p=>p.damage===20));
  assert.equal(f.store.get('pilot',a.attemptId).status,'FAILED');assert.equal(f.store.progress('pilot',mission.id).completed,false);
 }finally{f.db.close();rmSync(f.directory,{recursive:true,force:true});}
});

test('burst accepts at most two shots 750ms apart and waits two seconds before another burst',()=>{
 const burst={shots:0,nextShotAt:0};let count=0;
 for(let now=1000;now<=10000;now+=50){
  if(!finalShowdownFireReady(burst,now))continue;
  recordFinalShowdownShot(burst,now);count++;
  assert.equal(burst.nextShotAt,now+(count%2?750:2000));
  assert.equal(finalShowdownFireReady(burst,burst.nextShotAt-1),false);
 }
 assert.equal(count,8);
 assert.match(source,/bot\.finalShowdownBurst \|\| finalShowdownFireReady/);
 assert.match(source,/if \(bot\.finalShowdownBurst\) recordFinalShowdownShot/);
});
