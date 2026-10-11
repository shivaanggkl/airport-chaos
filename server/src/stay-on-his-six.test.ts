import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas07, journeyDallas08 } from '../../shared/journey-mission.mjs';
import { journeyFormationStatus } from '../../shared/journey-formation.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { throttleSpeedTarget } from '../../shared/flight-control-rules.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

const leader = { position: { x: 0, y: 400, z: 0 }, heading: 0, speed: 450, airborne: true };
const pilot = { position: { x: 0, y: 400, z: 160 }, heading: 0, speed: 450, airborne: true };

test('formation follows the actual leader heading, altitude, movement and rear sector', () => {
  assert.equal(journeyFormationStatus(pilot, leader), 'VALID');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, z: -160 } }, leader), 'GET_BEHIND');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, x: 160, z: 0 } }, leader), 'GET_BEHIND');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, z: 70 } }, leader), 'TOO_CLOSE');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, z: 400 } }, leader), 'VALID');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, z: 451 } }, leader), 'TOO_FAR');
  assert.equal(journeyFormationStatus({ ...pilot, position: { ...pilot.position, y: 501 } }, leader), 'ALTITUDE');
  assert.equal(journeyFormationStatus({ ...pilot, heading: Math.PI / 2 }, leader), 'ALIGN');
  assert.equal(journeyFormationStatus({ ...pilot, airborne: false }, leader), 'AIRBORNE_REQUIRED');
  assert.equal(journeyFormationStatus({ ...pilot, speed: 0 }, leader), 'AIRBORNE_REQUIRED');
  assert.equal(journeyFormationStatus({ ...pilot, heading: Number.NaN }, leader), 'AIRBORNE_REQUIRED');
  assert.equal(journeyFormationStatus({ ...pilot, position: { x: 160, y: 400, z: 0 }, heading: Math.PI / 2 },
    { ...leader, heading: Math.PI / 2 }), 'VALID');
  assert.equal(journeyDallas08.leaderRoute.length, 7);
  assert.equal(journeyDallas08.startAirportId, 'love');
  assert.equal(journeyDallas08.followMs, 15_000);
  assert.equal(aircraftFlightEnvelope.trainer.maxSpeed * journeyDallas08.leaderCruiseFactor,
    throttleSpeedTarget(0.5, aircraftFlightEnvelope.trainer));
  const shortestLeg = Math.min(...journeyDallas08.leaderRoute.map((point, index) => {
    const next = journeyDallas08.leaderRoute[(index + 1) % journeyDallas08.leaderRoute.length]!;
    return Math.hypot(next.x - point.x, next.z - point.z);
  }));
  assert.ok(shortestLeg / (aircraftFlightEnvelope.trainer.maxSpeed * journeyDallas08.leaderCruiseFactor) > 5);
});

test('Mission 8 unlock, accumulated hold, target identity, replay, cap and ledger are authoritative', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-formation-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('other', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas08.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const id of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(id, journeyDallas07.id, 'mission-07-clear', 500, 60_000);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas08.id);
    assert.equal(missionFocusForAttempt(first), null);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.ok(missionFocusForAttempt(store.get('pilot', first.attemptId)));
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 1_100), undefined);
    assert.equal(store.assignLeader('other', first.attemptId, 'leader', null, 1_200), undefined);
    assert.equal(store.assignLeader('pilot', first.attemptId, 'leader', null, 1_200)?.targetId, 'leader');
    assert.equal(store.assignLeader('pilot', first.attemptId, 'another', null, 1_300), undefined);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'another', true, 1_400), undefined);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 1_400)?.holdMs, 0);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 1_600)?.holdMs, 200);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 1_600)?.holdMs, 200);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', false, 2_000)?.holdMs, 200);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 20_000)?.holdMs, 200);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 21_000)?.holdMs, 200);
    assert.equal(store.assignLeader('pilot', first.attemptId, 'replacement', 'leader', 21_100)?.holdMs, 200);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'leader', true, 21_200), undefined);
    let result;
    for (let index = 0; index <= 73; index += 1) result = store.updateFormationHold('pilot', first.attemptId, 'replacement', true, 21_200 + index * 200);
    assert.equal(result?.status, 'RACING');
    result = store.updateFormationHold('pilot', first.attemptId, 'replacement', true, 36_200);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.holdMs, 15_000);
    assert.equal(result?.firstClearCredits, 950);
    assert.equal(store.updateFormationHold('pilot', first.attemptId, 'replacement', true, 36_400), undefined);
    assert.equal(missionFocusForAttempt(result), null);
    const replay = store.launch('pilot', 'trainer', 40_000, journeyDallas08.id);
    store.approach('pilot', replay.attemptId);
    store.assignLeader('pilot', replay.attemptId, 'replay-leader', null, 40_100);
    for (let index = 0; index <= 75; index += 1) result = store.updateFormationHold('pilot', replay.attemptId, 'replay-leader', true, 40_200 + index * 200);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 60_000, journeyDallas08.id);
    store.approach('capped', capped.attemptId);
    store.assignLeader('capped', capped.attemptId, 'capped-leader', null, 60_100);
    for (let index = 0; index <= 75; index += 1) result = store.updateFormationHold('capped', capped.attemptId, 'capped-leader', true, 60_200 + index * 200);
    assert.equal(result?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get() as { credits: number }).credits, 950);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = ?").get(journeyDallas08.id) as { count: number }).count, 1);
    assert.equal((check.prepare("SELECT amount FROM wallet_transactions WHERE pilot_id = 'capped' AND reference_id = ?").get(journeyDallas08.id) as { amount: number }).amount, 50);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
