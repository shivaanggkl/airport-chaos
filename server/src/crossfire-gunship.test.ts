import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { transportCourse, transportPose, transportRouteLength, transportTuning } from '../../shared/giant-incoming.mjs';
import { journeyDallas09, journeyDallas10, journeyDallas12 } from '../../shared/journey-mission.mjs';
import { excludesFocusedBotInteraction, missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { createTransportEncounter, stepCrossfireGunCycle, stepTransportEncounter, transportGunAim,
  transportGunMuzzle, transportHullImpact, transportImpact } from './giant-incoming.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { createRearGuardFireState, rearGuardShotResolved, rearGuardShooter, rearGuardTakeoff } from './rear-guard-fire.js';

test('Crossfire uses the 5:30 Dallas transport course and exactly two specified escorts', () => {
  assert.equal(journeyDallas10.id, 'journey-dallas-10');
  assert.equal(journeyDallas10.name, 'CROSSFIRE');
  assert.equal(journeyDallas10.firstClearCredits, 1_150);
  assert.equal(journeyDallas10.bossHealth, 2_000);
  assert.equal(journeyDallas10.timeLimitMs, 330_000);
  assert.equal(journeyDallas10.escortCount, 2);
  assert.deepEqual(journeyDallas10.escortAircraft, ['privateJet', 'cargo']);
  assert.deepEqual(journeyDallas10.escortHealth, [175, 225]);
  assert.deepEqual(journeyDallas10.escortLiveries, ['nightowl-forest', 'mammoth-sand']);
  assert.deepEqual(journeyDallas12.escortAircraft, ['privateJet', 'fighter']);
  assert.deepEqual(journeyDallas12.escortLiveries, ['nightowl-forest', 'firehawk-inferno']);
  for (let index = 0; index < 2; index++)
    assert.equal(cosmeticCatalog.find(item => item.id === journeyDallas10.escortLiveries[index])?.aircraftRestriction,
      journeyDallas10.escortAircraft[index]);
  const end = transportPose(journeyDallas10.timeLimitMs, 900, journeyDallas10.timeLimitMs);
  assert.ok(Math.abs(end.x - transportCourse.end.x) < .001 && Math.abs(end.z - transportCourse.end.z) < .001);
  assert.ok(transportRouteLength / 330 < aircraftFlightEnvelope.trainer.maxSpeed * .5);
});

test('three guns rotate one warning and two 250 ms shots every three seconds, forfeiting illegal turns', () => {
  const encounter = createTransportEncounter('attempt', 'pilot', 1_000, 900, 330_000, true);
  const cycle = encounter.crossfire!;
  assert.equal(encounter.warningUntil, 0); // The older rear-gun schedule stays idle.
  assert.equal(stepCrossfireGunCycle(cycle, 2_999, () => true), null);
  assert.equal(stepCrossfireGunCycle(cycle, 3_000, () => true), null);
  assert.equal(cycle.activeGun, 0);
  assert.equal(cycle.guns[0].warningUntil, 4_000);
  assert.equal(stepCrossfireGunCycle(cycle, 3_999, () => true), null);
  assert.equal(stepCrossfireGunCycle(cycle, 4_000, () => true), 0);
  assert.equal(stepCrossfireGunCycle(cycle, 4_249, () => true), null);
  assert.equal(stepCrossfireGunCycle(cycle, 4_250, () => true), 0);
  assert.equal(cycle.activeGun, null);
  assert.equal(stepCrossfireGunCycle(cycle, 6_000, () => false), null);
  assert.equal(cycle.nextGun, 2);
  assert.equal(cycle.nextBurstAt, 9_000);
  assert.equal(stepCrossfireGunCycle(cycle, 8_999, () => true), null);
  assert.equal(stepCrossfireGunCycle(cycle, 9_000, () => true), null);
  assert.equal(cycle.activeGun, 2);
  assert.equal(stepCrossfireGunCycle(cycle, 10_000, () => true), 2);
  assert.equal(stepCrossfireGunCycle(cycle, 10_250, () => true), 2);
  assert.equal(cycle.nextGun, 0);
});

test('each side gun has a clear outward firing arc that does not cross the airframe', () => {
  const pose = transportPose(90_000, 900, journeyDallas10.timeLimitMs);
  for (const gun of [1, 2]) {
    const side = gun === 1 ? -1 : 1;
    const muzzle = transportGunMuzzle(pose, gun);
    const target = { x: muzzle.x + side * Math.cos(pose.yaw) * 1_000, y: muzzle.y,
      z: muzzle.z - side * Math.sin(pose.yaw) * 1_000 };
    assert.equal(transportGunAim(pose, target, gun).eligible, true);
    assert.equal(transportHullImpact(muzzle, target, pose), false);
  }
});

test('hits on either added gun reach the gunship shared airframe health', () => {
  const pose = { ...transportPose(0), x: 0, y: 0, z: 0, yaw: 0, roll: 0,
    sideGuns: [{ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 }] };
  for (const side of [-1, 1]) {
    const start = { x: side * 15 * transportTuning.scale, y: 4.7 * transportTuning.scale, z: 0 };
    const end = { x: side * 10 * transportTuning.scale, y: 4.7 * transportTuning.scale, z: 0 };
    assert.equal(transportImpact(start, end, { ...pose, sideGuns: undefined }, { ...pose, sideGuns: undefined }), undefined);
    assert.ok(transportImpact(start, end, pose, pose));
  }
});

test('integrated gunship combat warns and releases only the scheduled two ballistic shots', () => {
  const encounter = createTransportEncounter('attempt', 'pilot', 0, 900, journeyDallas10.timeLimitMs, true);
  let firstWarning = -1;
  for (let ms = 0; ms <= 6_300; ms += 50) {
    const pose = transportPose(ms, 900, journeyDallas10.timeLimitMs);
    const muzzle = transportGunMuzzle(pose, 1);
    const target = { x: muzzle.x - Math.cos(pose.yaw) * 1_000, y: muzzle.y,
      z: muzzle.z + Math.sin(pose.yaw) * 1_000 };
    stepTransportEncounter(encounter, target, { x: 0, y: 0, z: 0 }, [], ms);
    if (encounter.crossfire!.guns[1].warningUntil && firstWarning < 0) firstWarning = ms;
    assert.equal(encounter.warningUntil, 0);
  }
  assert.equal(firstWarning, 5_000); // The rear gun has no legal shot, so its turn is forfeited.
  assert.equal(encounter.shots.length, 2);
  assert.deepEqual(encounter.shots.map(shot => shot.id), ['attempt:1', 'attempt:2']);
  assert.ok(encounter.shots.every(shot => shot.speed > 0));
});

test('Crossfire escorts share a six-second burst after takeoff, with no replacements', () => {
  const fire = createRearGuardFireState(journeyDallas10);
  rearGuardTakeoff(fire, 10_000);
  assert.equal(rearGuardShooter(fire, 14_999, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 15_000, [true, true]), 1);
  rearGuardShotResolved(fire, 15_000);
  assert.equal(rearGuardShooter(fire, 15_249, [true, true]), null);
  assert.equal(rearGuardShooter(fire, 15_250, [true, true]), 1);
  rearGuardShotResolved(fire, 15_250);
  assert.equal(rearGuardShooter(fire, 21_000, [false, true]), 2);
  rearGuardShotResolved(fire, 21_000);
  rearGuardShotResolved(fire, 21_250);
  assert.equal(rearGuardShooter(fire, 27_000, [false, true]), 2);
});

test('Crossfire unlock, result, replay and exactly-once reward remain server-owned', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-crossfire-gunship-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas10.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas09.id, 'prior-clear', 500, 0);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas10.id);
    assert.equal(first.monsterHealth, 2_000);
    assert.equal(missionFocusForAttempt(first), null);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.ok(missionFocusForAttempt(store.get('pilot', first.attemptId)));
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 1_500), undefined);
    assert.equal(store.hitTransport('pilot', first.attemptId, 1_500, 25), undefined);
    assert.equal(store.startGiantIncoming('pilot', first.attemptId, 2_000)?.deadlineAt, 332_000);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'nightowl', 1)?.targetId, 'nightowl');
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'duplicate', 1), undefined);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'firehawk', 2)?.secondaryTargetId, 'firehawk');
    assert.equal(store.hitTransport('pilot', first.attemptId, 3_000, 1_999)?.monsterHealth, 1);
    const won = store.hitTransport('pilot', first.attemptId, 3_100, 1)!;
    assert.equal(won.status, 'COMPLETED');
    assert.equal(won.firstClearCredits, 1_150);
    assert.equal(store.hitTransport('pilot', first.attemptId, 3_200, 25), undefined);
    assert.equal(store.progress('pilot', journeyDallas10.id).firstAttemptId, first.attemptId);
    const replay = store.launch('pilot', 'trainer', 10_000, journeyDallas10.id);
    store.approach('pilot', replay.attemptId);
    store.startGiantIncoming('pilot', replay.attemptId, 11_000);
    assert.equal(store.hitTransport('pilot', replay.attemptId, 341_000, 2_000), undefined);
    assert.equal(store.hitTransport('pilot', replay.attemptId, 11_100, 2_000)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 20_000, journeyDallas10.id);
    store.approach('capped', capped.attemptId);
    store.startGiantIncoming('capped', capped.attemptId, 21_000);
    assert.equal(store.hitTransport('capped', capped.attemptId, 21_100, 2_000)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get() as {credits:number}).credits, 1_150);
    assert.equal((check.prepare('SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = ? AND reference_id = ?').get('pilot', journeyDallas10.id) as {count:number}).count, 1);
    check.close();
    assert.equal(missionFocusForAttempt({ missionId: journeyDallas10.id, status: 'COMPLETED' }), null);
    assert.equal(excludesFocusedBotInteraction(true, false, false, true), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
