import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { journeyDallas08, journeyDallas09 } from '../../shared/journey-mission.mjs';
import { transportCourse, transportFootprintRadius, transportPose, transportRouteLength } from '../../shared/giant-incoming.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { createRearGuardFireState, rearGuardReinforcementsJoined, rearGuardShooter, rearGuardShotResolved, rearGuardTakeoff, shouldBeginReinforcements } from './rear-guard-fire.js';
import { reinforcementApproachPoint } from './reinforcement-approach.js';

test('Mission 9 reinforcements enter the forward view and converge outside the transport', () => {
  const transport = transportPose(120_000, 900, journeyDallas09.timeLimitMs);
  const pilot = { x: transport.x + Math.sin(transport.yaw) * 500,
    z: transport.z + Math.cos(transport.yaw) * 500 };
  for (const ordinal of [3, 4] as const) {
    const entry = reinforcementApproachPoint(transport, ordinal, 'entry');
    const formation = reinforcementApproachPoint(transport, ordinal, 'formation');
    for (const point of [entry, formation]) {
      const dx = point.x - pilot.x, dz = point.z - pilot.z;
      const forward = -dx * Math.sin(transport.yaw) - dz * Math.cos(transport.yaw);
      const lateral = Math.abs(dx * Math.cos(transport.yaw) - dz * Math.sin(transport.yaw));
      assert.ok(forward > 0 && Math.atan2(lateral, forward) < 45 * Math.PI / 180);
      assert.ok(Math.hypot(point.x - transport.x, point.z - transport.z) > transportFootprintRadius + 120);
    }
    assert.ok(Math.hypot(formation.x - transport.x, formation.z - transport.z) <
      Math.hypot(entry.x - transport.x, entry.z - transport.z));
  }
  const left = reinforcementApproachPoint(transport, 3, 'entry');
  const right = reinforcementApproachPoint(transport, 4, 'entry');
  assert.ok((left.x - transport.x) * (right.x - transport.x) +
    (left.z - transport.z) * (right.z - transport.z) < 0);
});

test('Mission 9 preserves its reward and uses a 5:30 transport route with four specified escorts', () => {
  assert.equal(journeyDallas09.name, 'REINFORCEMENTS');
  assert.equal(journeyDallas09.firstClearCredits, 1_050);
  assert.equal(journeyDallas09.bossHealth, 2_000);
  assert.equal(journeyDallas09.timeLimitMs, 330_000);
  assert.equal(journeyDallas09.escortCount, 4);
  assert.equal(journeyDallas09.initialEscortCount, 2);
  assert.deepEqual(journeyDallas09.escortHealth, [75, 125, 175, 225]);
  assert.deepEqual(journeyDallas09.escortAircraft, ['trainer', 'cargo', 'privateJet', 'privateJet']);
  assert.deepEqual(journeyDallas09.escortLiveries, ['bluejay-aurora', 'mammoth-sand', 'nightowl-forest', 'nightowl-royal-violet']);
  for (let i = 0; i < 4; i++) {
    const cosmetic = cosmeticCatalog.find(item => item.id === journeyDallas09.escortLiveries[i]);
    assert.equal(cosmetic?.aircraftRestriction, journeyDallas09.escortAircraft[i]);
  }
  const end = transportPose(journeyDallas09.timeLimitMs, 900, journeyDallas09.timeLimitMs);
  assert.ok(Math.abs(end.x - transportCourse.end.x) < .001 && Math.abs(end.z - transportCourse.end.z) < .001);
  assert.ok(transportRouteLength / 330 < aircraftFlightEnvelope.trainer.maxSpeed * .5);
});

test('one threshold crossing starts the wave; a terminal transport hit cancels it', () => {
  assert.equal(shouldBeginReinforcements(1_001, 'RACING', false), false);
  assert.equal(shouldBeginReinforcements(1_000, 'RACING', false), true);
  assert.equal(shouldBeginReinforcements(700, 'RACING', false), true);
  assert.equal(shouldBeginReinforcements(700, 'RACING', true), false);
  assert.equal(shouldBeginReinforcements(0, 'COMPLETED', false), false);
  assert.equal(shouldBeginReinforcements(700, 'FAILED', false), false);
});

test('Mission 9 escort bursts begin after takeoff and shift from 6 to 4 seconds after wave combat eligibility', () => {
  const fire = createRearGuardFireState(journeyDallas09);
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
  rearGuardReinforcementsJoined(fire, 22_000);
  assert.equal(rearGuardShooter(fire, 24_999, [false, true, true, true]), null);
  assert.equal(rearGuardShooter(fire, 25_000, [false, true, true, true]), 2);
  rearGuardShotResolved(fire, 25_000);
  rearGuardShotResolved(fire, 25_250);
  assert.equal(rearGuardShooter(fire, 28_999, [false, true, true, true]), null);
  assert.equal(rearGuardShooter(fire, 29_000, [false, true, true, true]), 3);
});

test('initial escorts keep their six-second cadence during the reinforcement entry warning', () => {
  const fire = createRearGuardFireState(journeyDallas09);
  rearGuardTakeoff(fire, 0);
  assert.equal(rearGuardShooter(fire, 5_000, [true, true]), 1);
  rearGuardShotResolved(fire, 5_000);
  rearGuardShotResolved(fire, 5_250);
  rearGuardReinforcementsJoined(fire, 10_000);
  assert.equal(rearGuardShooter(fire, 11_000, [true, true, true, true]), 2);
  rearGuardShotResolved(fire, 11_000);
  rearGuardShotResolved(fire, 11_250);
  assert.equal(rearGuardShooter(fire, 12_999, [true, true, true, true]), null);
  assert.equal(rearGuardShooter(fire, 15_000, [true, true, true, true]), 3);
});

test('reinforcements can defend after their entry grace even if both initial escorts died', () => {
  const fire = createRearGuardFireState(journeyDallas09);
  rearGuardTakeoff(fire, 0);
  assert.equal(rearGuardShooter(fire, 5_000, [false, false]), null);
  rearGuardReinforcementsJoined(fire, 10_000);
  assert.equal(rearGuardShooter(fire, 12_999, [false, false, true, true]), null);
  assert.equal(rearGuardShooter(fire, 13_000, [false, false, true, true]), 3);
});

test('Mission 9 unlock, first clear, replay, timeout and wallet remain server-owned', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-reinforcements-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas09.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas08.id, 'mission-08-clear', 500, 0);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas09.id);
    assert.equal(first.monsterHealth, 2_000);
    assert.equal(missionFocusForAttempt(first), null);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.ok(missionFocusForAttempt(store.get('pilot', first.attemptId)));
    assert.equal(store.hitTransport('pilot', first.attemptId, 1_500, 25), undefined);
    assert.equal(store.startGiantIncoming('pilot', first.attemptId, 2_000)?.deadlineAt, 332_000);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'bluejay', 1)?.targetId, 'bluejay');
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'replacement', 1), undefined);
    assert.equal(store.assignRearGuardEscort('pilot', first.attemptId, 'mammoth', 2)?.secondaryTargetId, 'mammoth');
    assert.equal(store.hitTransport('pilot', first.attemptId, 3_000, 1_300)?.monsterHealth, 700);
    assert.equal(store.hitTransport('pilot', first.attemptId, 3_100, 700)?.status, 'COMPLETED');
    assert.equal(store.hitTransport('pilot', first.attemptId, 3_200, 25), undefined);
    assert.equal(store.progress('pilot', journeyDallas09.id).completed, true);
    const replay = store.launch('pilot', 'trainer', 10_000, journeyDallas09.id);
    store.approach('pilot', replay.attemptId);
    store.startGiantIncoming('pilot', replay.attemptId, 11_000);
    assert.equal(store.hitTransport('pilot', replay.attemptId, 341_000, 2_000), undefined);
    assert.equal(store.hitTransport('pilot', replay.attemptId, 11_100, 2_000)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 20_000, journeyDallas09.id);
    store.approach('capped', capped.attemptId);
    store.startGiantIncoming('capped', capped.attemptId, 21_000);
    assert.equal(store.hitTransport('capped', capped.attemptId, 21_100, 2_000)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get() as {credits:number}).credits, 1_050);
    assert.equal((check.prepare('SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = ? AND reference_id = ?').get('pilot', journeyDallas09.id) as {count:number}).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
