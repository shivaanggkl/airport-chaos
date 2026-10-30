import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas07, journeyDallas08, journeyDallas12 } from '../../shared/journey-mission.mjs';
import { transportCourse, transportPose, transportRouteLength } from '../../shared/giant-incoming.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { createRearGuardFireState, finalInterceptEscortsCleared, rearGuardShooter, rearGuardShotResolved, rearGuardTakeoff } from './rear-guard-fire.js';

test('Rear Guard uses the existing transport corridor and a true five-minute escape', () => {
  assert.equal(journeyDallas08.name, 'REAR GUARD');
  assert.equal(journeyDallas08.startAirportId, journeyDallas07.startAirportId);
  assert.equal(journeyDallas08.timeLimitMs, 300_000);
  assert.equal(journeyDallas08.bossHealth, 2_000);
  assert.equal(journeyDallas08.escortCount, 2);
  assert.equal(journeyDallas08.escortHealth, 1_000);
  assert.deepEqual(journeyDallas08.escortAircraft, ['trainer', 'trainer']);
  assert.deepEqual(journeyDallas08.escortLiveries, ['bluejay-skybolt', 'bluejay-aurora']);
  assert.deepEqual({ x: transportPose(0).x, z: transportPose(0).z }, transportCourse.start);
  const end = transportPose(journeyDallas08.timeLimitMs, 900, journeyDallas08.timeLimitMs);
  assert.ok(Math.abs(end.x - transportCourse.end.x) < 0.001);
  assert.ok(Math.abs(end.z - transportCourse.end.z) < 0.001);
  assert.ok(transportRouteLength / 300 < aircraftFlightEnvelope.trainer.maxSpeed * 0.5);
});

test('escort bursts wait for takeoff, alternate, space shots, and never speed up after a kill', () => {
  const fire = createRearGuardFireState();
  assert.equal(rearGuardShooter(fire, 10_000, [true, true]), null);
  rearGuardTakeoff(fire, 10_000);
  assert.equal(rearGuardShooter(fire, 14_999, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 15_000, [true, true]), 1);
  rearGuardShotResolved(fire, 15_000);
  assert.equal(rearGuardShooter(fire, 15_249, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 15_250, [true, true]), 1);
  rearGuardShotResolved(fire, 15_250);
  assert.equal(rearGuardShooter(fire, 20_999, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 21_000, [true, true]), 2);
  rearGuardShotResolved(fire, 21_000);
  rearGuardShotResolved(fire, 21_250);
  assert.equal(rearGuardShooter(fire, 27_000, [false, true]), 2);
  rearGuardShotResolved(fire, 27_000);
  rearGuardShotResolved(fire, 27_250);
  assert.equal(rearGuardShooter(fire, 32_999, [false, true]), null);
  assert.equal(rearGuardShooter(fire, 33_000, [false, true]), 2);
});

test('Final Intercept escorts use the approved airframes, paint, health and shared firing cadence', () => {
  assert.deepEqual(journeyDallas12.escortAircraft, ['privateJet', 'fighter']);
  assert.deepEqual(journeyDallas12.escortLiveries, ['nightowl-forest', 'firehawk-inferno']);
  assert.deepEqual(journeyDallas12.escortHealth, [175, 225]);
  const fire = createRearGuardFireState(journeyDallas12);
  rearGuardTakeoff(fire, 1_000);
  assert.equal(rearGuardShooter(fire, 5_999, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 6_000, [true, true]), 1);
  rearGuardShotResolved(fire, 6_000);
  assert.equal(rearGuardShooter(fire, 6_249, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 6_250, [true, true]), 1);
  rearGuardShotResolved(fire, 6_250);
  assert.equal(rearGuardShooter(fire, 12_000, [true, true]), 2);
});

test('Final Intercept advances after either escort kill order, including a removed first escort', () => {
  const alive = new Set(['nightowl', 'firehawk']);
  const cleared = () => finalInterceptEscortsCleared('nightowl', 'firehawk', id => alive.has(id));
  assert.equal(finalInterceptEscortsCleared(null, 'firehawk', id => alive.has(id)), false);
  assert.equal(cleared(), false);
  alive.delete('nightowl');
  assert.equal(cleared(), false);
  alive.delete('firehawk');
  assert.equal(cleared(), true);
  alive.add('nightowl');
  assert.equal(cleared(), false);
  alive.delete('nightowl');
  assert.equal(cleared(), true);
});

test('Mission 8 escorts use only traveling authoritative projectiles and collision damage', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /function createAssistedShot|type: 'assistedShot'/);
  const firing = server.slice(server.indexOf("if (message.type === 'fire')"), server.indexOf("if (message.type === 'eventJoin')"));
  assert.match(firing, /validatedShotAim/);
  assert.match(firing, /createProjectile/);
  assert.doesNotMatch(firing, /applyCombatHit/);
  assert.match(server, /projectileImpactFraction/);
  const prediction = client.slice(client.indexOf('function spawnMuzzleFeedback('), client.indexOf('function spawnImpactFeedback('));
  assert.match(prediction, /predicted.direction.copy\(projectileDirection\)/);
  assert.doesNotMatch(prediction, /target.position|targetPosition|predictedTargetId/);
  assert.doesNotMatch(client, /pendingLocalAssistedHit|addAssistedShot/);
});

test('Mission 8 unlock, two assigned escorts, transport defeat, timeout and first reward are authoritative', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-rear-guard-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas08.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const id of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(id, journeyDallas07.id, 'mission-07-clear', 500, 60_000);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas08.id);
    assert.equal(first.monsterHealth, 2_000);
    assert.equal(missionFocusForAttempt(first), null);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.ok(missionFocusForAttempt(store.get('pilot', first.attemptId)));
    assert.equal(store.hitTransport('pilot', first.attemptId, 1_500, 25), undefined);
    assert.equal(store.startGiantIncoming('pilot', first.attemptId, 2_000)?.deadlineAt, 302_000);
    assert.equal(store.assignRearGuardEscort('other', first.attemptId, 'escort-1', 1), undefined);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'escort-1', 1)?.targetId, 'escort-1');
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'replacement', 1), undefined);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'escort-2', 2)?.secondaryTargetId, 'escort-2');
    let result;
    for (let index = 0; index < 80; index += 1) result = store.hitTransport('pilot', first.attemptId, 3_000 + index * 100, 25);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.monsterHealth, 0);
    assert.equal(result?.firstClearCredits, 950);
    assert.equal(store.hitTransport('pilot', first.attemptId, 12_000, 25), undefined);
    assert.equal(missionFocusForAttempt(result), null);
    const replay = store.launch('pilot', 'trainer', 20_000, journeyDallas08.id);
    store.approach('pilot', replay.attemptId);
    store.startGiantIncoming('pilot', replay.attemptId, 21_000);
    assert.equal(store.hitTransport('pilot', replay.attemptId, 321_000, 2_000), undefined);
    for (let index = 0; index < 80; index += 1) result = store.hitTransport('pilot', replay.attemptId, 22_000 + index * 100, 25);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 40_000, journeyDallas08.id);
    store.approach('capped', capped.attemptId);
    store.startGiantIncoming('capped', capped.attemptId, 41_000);
    assert.equal(store.hitTransport('capped', capped.attemptId, 41_100, 2_000)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get() as { credits: number }).credits, 950);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = ?").get(journeyDallas08.id) as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
