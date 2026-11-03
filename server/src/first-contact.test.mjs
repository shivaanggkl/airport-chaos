import { recordOpponentHit, recordOpponentDamage } from './opponent-tactics.js';
import { createOpponent } from './opponent.js';
import { advanceHunterFlight } from './hunter-flight.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import { journeyDallas13 as mission, journeyDallas14, journeyDallas06, journeyDallas07, journeyMissionSlot } from '../../shared/journey-mission.mjs';
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
  const sandbox = vm.createContext({recordOpponentHit,recordOpponentDamage,...context});
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox;
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'first-contact-')), path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES('pilot',0,0),('old',0,0)");
  const store = new JourneyAttemptStore(path);
  db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('pilot', journeyDallas06.id, 'm6', 1);
  return { directory, path, db, store };
}

test('M7 retains identity, runway, exact distance and a catchable six-hit opponent', () => {
  assert.equal(journeyMissionSlot(mission.id), 7);
  assert.equal(journeyMissionSlot(journeyDallas07.id), 13);
  assert.equal(mission.startAirportId, 'dfw');
  const dfw = cityAirports.dallas.find(a => a.id === 'dfw');
  assert.ok(Math.abs(Math.hypot(mission.enemySpawn.x - dfw.x, mission.enemySpawn.z - dfw.z) - 20_000) < 1e-6);
  assert.deepEqual(boundJourneyHunterPoint(mission.enemySpawn), mission.enemySpawn);
  assert.equal(mission.enemyHealth / projectileDamageForAircraft('trainer'), 6);
  assert.ok(mission.cruiseSpeed < aircraftFlightEnvelope.trainer.maxSpeed * .7);
  assert.equal(mission.enemyLivery, 'nightowl-sunset-red');
});

test('one server-owned Nightowl, duplicate prevention, horizontal aggression boundary and permanent latch', () => {
  const pilot = { pilotId: 'pilot', lifeState: 'alive', position: { x: 0, y: 100, z: 0 } };
  const active = { missionId: mission.id, attemptId: 'attempt', status: 'APPROACH', targetId: null };
  const players = new Map(); let created = 0, engaged = 0;
  const ctx = runtime(['ensureFirstContact'], { journeyDallas13: mission, journeyDallas14, players,
    createBot: (_city, _defense, spawn) => { created++; assert.equal(spawn.firstContact, true); players.set('enemy', { bot: { journeyFirstContact: true, journeyAttemptId: 'attempt', journeyTargetPlayerId: 'owner' }, lifeState: 'alive', health: 150, position: { x: 10_001, y: 900, z: 0 } }); return 'enemy'; },
    journeyStore: { assignFirstContact: (_pilot, _attempt, id) => { active.targetId = id; return active; } },
    removeBot: () => assert.fail('unexpected removal'), sendJourneyState: () => {}, failPlayerJourney: () => assert.fail('unexpected failure'),
    provokeJourneyHunter: () => { engaged++; players.get('enemy').bot.journeyProvoked = true; },
  });
  ctx.ensureFirstContact('owner', pilot, active, 1000);
  ctx.ensureFirstContact('owner', pilot, active, 1100);
  assert.equal(created, 1); assert.equal(engaged, 0);
  active.status = 'RACING'; ctx.ensureFirstContact('owner', pilot, active, 1200); assert.equal(engaged, 0);
  players.get('enemy').position.x = 10_000;
  ctx.ensureFirstContact('owner', pilot, active, 1300); assert.equal(engaged, 1);
  players.get('enemy').position.x = 15_000;
  ctx.ensureFirstContact('owner', pilot, active, 1400); assert.equal(engaged, 1);
});

test('takeoff-only four-minute clock, target ownership, deadline, first clear and replay protection', () => {
  const f = fixture();
  try {
    const a = f.store.launch('pilot', 'trainer', 1000, mission.id);
    f.store.approach('pilot', a.attemptId, 1100);
    assert.equal(f.store.startTimedGateClock('pilot', a.attemptId, 1200), undefined);
    assert.equal(f.store.startFirstContact('pilot', a.attemptId, 1200), undefined);
    assert.equal(f.store.assignFirstContact('other', a.attemptId, 'enemy'), undefined);
    assert.equal(f.store.assignFirstContact('pilot', a.attemptId, 'enemy')?.startedAt, null);
    assert.equal(f.store.assignFirstContact('pilot', a.attemptId, 'duplicate'), undefined);
    assert.equal(f.store.acceptGate('pilot', a.attemptId, 0, 1300), undefined);
    assert.equal(f.store.completeHunter('pilot', a.attemptId, 'enemy', 1300), undefined);
    const started = f.store.startFirstContact('pilot', a.attemptId, 2000);
    assert.equal(started.deadlineAt, 242_000);
    assert.equal(f.store.startFirstContact('pilot', a.attemptId, 3000), undefined);
    assert.equal(f.store.completeHunter('pilot', a.attemptId, 'wrong', 3000), undefined);
    assert.equal(f.store.completeHunter('pilot', a.attemptId, 'enemy', 242_000), undefined);
    assert.equal(f.store.completeHunter('pilot', a.attemptId, 'enemy', 241_999).firstClearCredits, 1650);
    assert.equal(f.store.completeHunter('pilot', a.attemptId, 'enemy', 241_999), undefined);
    const replay = f.store.launch('pilot', 'trainer', 300_000, mission.id);
    f.store.approach('pilot', replay.attemptId); f.store.assignFirstContact('pilot', replay.attemptId, 'new');
    f.store.startFirstContact('pilot', replay.attemptId, 301_000);
    assert.equal(f.store.completeHunter('pilot', replay.attemptId, 'new', 302_000).firstClearCredits, 0);
    assert.equal(f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 1650);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM wallet_transactions WHERE reference_id=?").get(mission.id).n, 1);
  } finally { f.db.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('old active Redline attempts are invalidated once; historical clears survive and new attempts resume safely', () => {
  const f = fixture();
  try {
    f.db.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at) VALUES('old-race','old',?,'dallas','trainer','RACING',1)").run(mission.id);
    f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('old', mission.id, 'historical', 1);
    const reopened = new JourneyAttemptStore(f.path);
    assert.equal(reopened.get('old', 'old-race').failureReason, 'MISSION_UPDATED');
    assert.equal(reopened.progress('old', mission.id).firstAttemptId, 'historical');
    const fresh = reopened.launch('old', 'trainer', 2000, mission.id);
    assert.equal(new JourneyAttemptStore(f.path).get('old', fresh.attemptId).status, 'READY');
    reopened.approach('old', fresh.attemptId); reopened.assignFirstContact('old', fresh.attemptId, 'new');
    reopened.startFirstContact('old', fresh.attemptId, 3000);
    assert.equal(reopened.completeHunter('old', fresh.attemptId, 'new', 4000).firstClearCredits, 0);
  } finally { f.db.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('M7 reuses physical Hunter flight, restricted ballistics, private visibility and cleanup', () => {
  assert.match(source, /const cruiseSpeed = bot\.journeyFirstContact \? \(bot\.journeySurpriseAttack \? journeyDallas14 : journeyDallas13\)\.cruiseSpeed/);
  assert.match(source, /!bot\.journeyFirstContact \|\| solution\.distance <= 2_500/);
  assert.ok(source.includes("planOpponentTactics(bot.opponent"));
  assert.match(source, /privateAttemptId: privateId \?\? player\.bot\?\.journeyAttemptId/);
  assert.match(source, /if \(victim\.bot\?\.journeyFirstContact \|\| owner\.bot\?\.journeyFirstContact\)/);
  assert.match(source, /if \(victim\.bot\?\.journeyAttemptId\) removeBot\(victimId\)/);
  assert.match(source, /\(active\?\.missionId === journeyDallas13\.id \|\| active\?\.missionId === journeyDallas14\.id\) && active\.status === 'APPROACH' && journeyCountdownComplete\.has/);
});

test('six accepted Bluejay combat hits destroy only the owned target and complete the real reward transaction', () => {
  const f = fixture();
  try {
    const a = f.store.launch('pilot', 'trainer', 1000, mission.id);
    f.store.approach('pilot', a.attemptId); f.store.assignFirstContact('pilot', a.attemptId, 'enemy');
    f.store.startFirstContact('pilot', a.attemptId, 2000);
    const pilot = { pilotId: 'pilot', entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: false, score: 0, aircraftType: 'trainer' };
    const enemy = { entityType: 'player', cityId: 'dallas', lifeState: 'alive', isBot: true, score: 0, health: 150, spawnProtectedUntil: 0, aircraftType: 'privateJet',
      bot: { journeyFirstContact: true, journeyAttemptId: a.attemptId, journeyTargetPlayerId: 'owner', journeyProvoked: true } };
    const players = new Map([['owner', pilot], ['enemy', enemy], ['outsider', { ...pilot, pilotId: 'other' }]]);
    const packets = [];
    const ctx = runtime(['applyCombatHit', 'transportEscortHealth'], { journeyDallas13: mission, journeyDallas14, journeyDallas15: { id: 'journey-dallas-15' }, players, journeyStore: f.store,
      playerJourneyAttempts: new Map([['owner', a.attemptId]]), playerJourneyRunwayPrep: new Set(),
      focusedBotInteractionExcluded: () => false, tutorialCombatPairAllowed: () => true, sameCombatContext: () => true,
      insideJourneyHunterArena: () => true, stabilityDiagnosticsEnabled: false, airportRepairStays: new Map(),
      sendToPlayer: (_owner, p) => packets.push(p), sendJourneyState: () => {}, provokeJourneyHunter: () => {},
      markPlayerDestroyed: (_id, p) => { p.lifeState = 'destroyed'; }, isHumanPilot: () => false,
      botKillRewardMultiplier: .1, persistScore: () => {}, broadcastToCity: () => assert.fail('private enemy leaked'),
      broadcastLeaderboard: () => {}, removeBot: id => players.delete(id), updateKing: () => {}, cityKings: new Map(),
      handleWantedDestruction: () => {}, challengeForPlayer: () => undefined,
    });
    assert.equal(ctx.applyCombatHit('outsider', 'enemy', 'dallas', 3000, 25), false);
    enemy.bot.journeyProvoked = false;
    assert.equal(ctx.applyCombatHit('owner', 'enemy', 'dallas', 3000, 25), false);
    enemy.bot.journeyProvoked = true;
    for (let hit = 1; hit <= 6; hit++) {
      assert.equal(ctx.applyCombatHit('owner', 'enemy', 'dallas', 3000 + hit * 500, projectileDamageForAircraft('trainer')), true);
      assert.equal(enemy.health, 150 - hit * 25);
      assert.equal(f.store.get('pilot', a.attemptId).status, hit === 6 ? 'COMPLETED' : 'RACING');
    }
    assert.equal(players.has('enemy'), false);
    assert.equal(packets.filter(p => p.type === 'damage').length, 6);
    assert.equal(f.store.get('pilot', a.attemptId).firstClearCredits, 1650);
  } finally { f.db.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('actual Nightowl factory and flight integrator keep the airborne patrol inside its safe two-kilometre area', () => {
  const players = new Map(), sent = [];
  const ctx = runtime(['createBot', 'botStateMessage', 'transportEscortHealth', 'transportEscortCosmetics', 'advanceBotFlight', 'moveTowardBot', 'isHunterCombatPhase', 'botMinimumTurnRadius', 'smoothHunter', 'hunterClearance'], {
    advanceHunterFlight, createOpponent,
    journeyDallas13: mission, journeyDallas14, players, nextBotSerial: 1, botNames: ['Hunter'], botPersonalities: ['hunter'],
    botAirports: () => cityAirports.dallas, airportRoute: () => [], boundJourneyHunterPoint,
    botTerrainHeight: () => 120, botRunwayHeight: () => 120, safeBotWaypoint: (_city, _from, p) => p,
    sendToPlayer: (_owner, p) => sent.push(p), broadcastToCity: () => assert.fail('private spawn leaked'),
    aircraftFlightEnvelope, wrapAngle: a => Math.atan2(Math.sin(a), Math.cos(a)),
    hunterForward: p => ({ x: -Math.sin(p.rotation.y) * Math.cos(p.rotation.x), y: Math.sin(p.rotation.x), z: -Math.cos(p.rotation.y) * Math.cos(p.rotation.x) }),
    journeyAceClearance: 300, botCruiseClearance: 609.6, botCombatClearance: 609.6, botSafeFloor: (_city, _x, _z, clearance) => 120 + clearance,
    keepJourneyHunterInside: p => p,
  });
  const id = ctx.createBot('dallas', undefined, { attemptId: 'attempt', targetPlayerId: 'owner', target: {}, firstContact: true });
  const enemy = players.get(id), spawn = { ...enemy.position };
  assert.equal(enemy.aircraftType, 'privateJet'); assert.equal(enemy.health, 150);
  assert.equal(enemy.position.y, 920); assert.equal(Math.hypot(enemy.velocity.x, enemy.velocity.z), 400);
  assert.equal(sent[0].equippedCosmetics['livery:privateJet'], mission.enemyLivery);
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
    assert.ok(enemy.position.y >= 900);
  }
  assert.ok(maxRadius <= 2_100, `patrol wandered ${maxRadius}m`);
  assert.ok(minSpeed > 300, `patrol stopped: ${minSpeed}m/s`);
});

test('M7 launch refuses an old backend before creating an attempt and explains the missing update', async () => {
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('bootstrap.ts', bootstrap, ts.ScriptTarget.Latest, true);
  const launch = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'playJourneyMission');
  for (const supported of [false, true]) {
    const objective = { textContent: '' }, calls = [];
    const context = vm.createContext({
      journeyLaunchPending: false, dallasUnlocked: () => true, cityJourneyMode: '',
      missionJourney: { selectedMissionNumber: 7, hide: () => {} },
      journeyMissionOrder: Array(6).fill('').concat(mission.id), pendingAircraftSelection: undefined,
      apiUrl: path => path, apiFetch: async path => {
        calls.push(path);
        return { ok: true, json: async () => path.endsWith('/launch') ? { attempt: { attemptId: 'new-attempt' } }
          : { mission13: supported ? { definitionVersion: 1 } : {} } };
      },
      journeyAttemptId: '', journeyAttemptMission: '', cities: [{ id: 'dallas', status: 'available' }],
      citySelector: { hidden: true }, enterCity: async () => {}, missionTimePreset: () => 'day',
      refreshJourneyProgress: async () => {}, missionJourneyElement: { querySelector: () => objective },
      console: { error: () => {} },
    });
    vm.runInContext(ts.transpileModule(launch.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await context.playJourneyMission();
    assert.equal(calls.some(path => path.endsWith('/launch')), supported);
    if (!supported) assert.match(objective.textContent, /Mission 7 needs a server update/);
    assert.equal(context.journeyLaunchPending, false);
  }
});

test('M7 rejects incompatible resumed attempts and uses short, explicit mission instructions', () => {
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const content = readFileSync(new URL('../../client/src/mission-journey-content.ts', import.meta.url), 'utf8');
  const receive = client.slice(client.indexOf("if (message.type === 'journeyAttempt')"));
  assert.ok(receive.indexOf('firstContactSupported !== true') < receive.indexOf('journeyAttempt = message.attempt'));
  assert.match(content, /Take off\. Follow the red radar marker\. Shoot down Nightowl\./);
  assert.match(client, /TAKE OFF · FOLLOW THE RED RADAR MARKER/);
  assert.match(client, /AIM AT THE RED PLANE · HOLD FIRE/);
});
