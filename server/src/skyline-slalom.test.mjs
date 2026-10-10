import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas09, journeyDallas10, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt, excludesFocusedBotInteraction } from '../../shared/mission-focus.mjs';
import { confirmedGateObjective, precisionGateBearing, slalomGateGuidance } from '../../client/src/objective-guidance.js';
import { JourneyAttemptStore } from './journey-attempts.js';

test('Skyline Slalom has five forward-only wide gates with alternating reachable turns', () => {
  assert.equal(journeyDallas10.gates.length, 5);
  assert.equal(journeyDallas10.timeLimitMs, 85_000);
  assert.equal(journeyDallas10.firstClearCredits, 1_150);
  assert.equal(journeyDallas10.startAirportId, 'love');
  const turns = [];
  for (let index = 0; index < 5; index += 1) {
    const gate = journeyDallas10.gates[index];
    assert.equal(gate.radius, 100);
    const prior = journeyDallas10.gates[Math.max(0, index - 1)];
    const next = journeyDallas10.gates[Math.min(4, index + 1)];
    const length = Math.hypot(next.x - prior.x, next.z - prior.z);
    const nx = (next.x - prior.x) / length;
    const nz = (next.z - prior.z) / length;
    const before = { x: gate.x - nx * 120, y: gate.altitude, z: gate.z - nz * 120 };
    const after = { x: gate.x + nx * 120, y: gate.altitude, z: gate.z + nz * 120 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas10), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas10), false);
    assert.equal(journeyGateCrossing({ ...before, x: before.x - nz * 130, z: before.z + nx * 130 },
      { ...after, x: after.x - nz * 130, z: after.z + nx * 130 }, index, 0, journeyDallas10), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + 110 }, { ...after, y: gate.altitude + 110 }, index, 0, journeyDallas10), false);
    if (index >= 2) {
      const a = journeyDallas10.gates[index - 2];
      const b = journeyDallas10.gates[index - 1];
      const c = gate;
      turns.push(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x),
        (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
    }
  }
  assert.ok(turns[0] > 0 && turns[1] < 0 && turns[2] > 0);
  assert.ok(journeyDallas10.gates.every(gate => gate.x <= -2_800));
  assert.ok(journeyDallas10.gates.every(gate => Math.abs(gate.altitude - 400) <= 10));
  const approach = { x: -5_140, z: -7_780 };
  const expected = ['LEFT', 'RIGHT', 'LEFT', 'RIGHT'];
  for (let index = 1; index < 5; index += 1) {
    const origin = index === 1 ? approach : journeyDallas10.gates[index - 2];
    const crossed = journeyDallas10.gates[index - 1];
    const next = journeyDallas10.gates[index];
    const yaw = Math.atan2(-(crossed.x - origin.x), -(crossed.z - origin.z));
    const bearing = precisionGateBearing(crossed.x, crossed.z, yaw, next.x, next.z);
    assert.equal(slalomGateGuidance(index + 1, false, bearing.horizontalDistance,
      bearing.horizontalDistance, next.altitude - crossed.altitude, next.radius, bearing.angle, null, false).instruction,
    `GATE ${index + 1} — TURN ${expected[index - 1]}`);
  }
});

test('confirmed targets and turn cues follow actual heading, not gate number or client progress', () => {
  const attempt = { attemptId: 'attempt', gateIndex: 0, status: 'APPROACH' };
  const objective = confirmedGateObjective(attempt, journeyDallas10.gates, () => 120);
  assert.equal(objective?.label, 'GATE 1');
  assert.equal(objective?.position.y, 510);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 3 }, journeyDallas10.gates, () => 120)?.label, 'GATE 4');
  assert.equal(confirmedGateObjective({ ...attempt, status: 'COMPLETED' }, journeyDallas10.gates, () => 120), null);
  const left = slalomGateGuidance(3, false, 900, 900, 0, 100, -Math.PI / 2, null, false);
  const right = slalomGateGuidance(3, false, 900, 900, 0, 100, Math.PI / 2, null, false);
  assert.equal(left.instruction, 'GATE 3 — TURN LEFT');
  assert.equal(right.instruction, 'GATE 3 — TURN RIGHT');
  assert.equal(slalomGateGuidance(3, false, 700, 700, 0, 100, .7, 'RIGHT', false).turnSide, 'RIGHT');
  assert.equal(slalomGateGuidance(3, false, 700, 700, 0, 100, .25, 'RIGHT', false).turnSide, null);
  assert.equal(slalomGateGuidance(3, false, 280, 280, 0, 100, .2, null, false).instruction, 'FLY THROUGH GATE 3');
  assert.equal(slalomGateGuidance(3, false, 380, 380, 0, 100, .2, null, false).instruction, 'FOLLOW THE ARROW TO GATE 3');
  assert.equal(slalomGateGuidance(1, true, 200, 200, 0, 100, .8, null, false).instruction, 'TAKE OFF — FOLLOW THE GOLD ARROW');
  const gate2 = journeyDallas10.gates[1];
  const bearing = precisionGateBearing(journeyDallas10.gates[0].x, journeyDallas10.gates[0].z,
    Math.PI, gate2.x, gate2.z);
  assert.ok(bearing.angle < 0);
});

test('Mission 10 focus is scoped to active attempts and leaves human combat unchanged', () => {
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas10.id, status: 'APPROACH' })?.showAmbientAIAircraft, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas10.id, status: 'RACING' })?.showAmbientAIMarkers, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas10.id, status: 'COMPLETED' }), null);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas10.id, status: 'READY', aiIsolated: true }), null);
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true);
  assert.equal(excludesFocusedBotInteraction(false, true, true, false), true);
  assert.equal(excludesFocusedBotInteraction(true, false, false, false), false);
  assert.equal(excludesFocusedBotInteraction(false, true, false, false), false);
});

test('Mission 10 eligibility, five gates, timer, reward, cap and replay stay server-owned', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-slalom-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0), ('other', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas10.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas09.id, `${pilot}-mission9`, 500, 0);
    fixture.close();
    const expired = store.launch('pilot', 'trainer', 1_000, journeyDallas10.id);
    assert.equal(store.approach('pilot', expired.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('other', expired.attemptId, 0, 1_500), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 1, 1_500), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 0, 2_000)?.deadlineAt, 87_000);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 0, 2_500), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 1, 87_001), undefined);
    assert.equal(store.fail('pilot', expired.attemptId, 'TIME_UP', 87_001)?.status, 'FAILED');
    const first = store.launch('pilot', 'trainer', 100_000, journeyDallas10.id);
    store.approach('pilot', first.attemptId);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 110_000)?.gateIndex, 1);
    assert.equal(store.acceptGate('pilot', first.attemptId, 2, 115_000), undefined);
    for (let index = 1; index <= 4; index += 1) {
      const result = store.acceptGate('pilot', first.attemptId, index, 110_000 + index * 12_000);
      assert.equal(result?.gateIndex, index + 1);
      assert.equal(result?.status, index === 4 ? 'COMPLETED' : 'RACING');
    }
    const completed = store.get('pilot', first.attemptId);
    assert.equal(completed.finishTimeMs, 48_000);
    assert.equal(completed.firstClearCredits, 1_150);
    assert.equal(store.acceptGate('pilot', first.attemptId, 4, 159_000), undefined);
    assert.equal(store.progress('pilot', journeyDallas10.id).firstAttemptId, first.attemptId);
    const replay = store.launch('pilot', 'trainer', 200_000, journeyDallas10.id);
    store.approach('pilot', replay.attemptId);
    for (let index = 0; index < 5; index += 1) store.acceptGate('pilot', replay.attemptId, index, 201_000 + index * 10_000);
    assert.equal(store.get('pilot', replay.attemptId)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 300_000, journeyDallas10.id);
    store.approach('capped', capped.attemptId);
    for (let index = 0; index < 5; index += 1) store.acceptGate('capped', capped.attemptId, index, 301_000 + index * 10_000);
    assert.equal(store.get('capped', capped.attemptId)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = 'journey-dallas-10'").get()).count, 1);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get()).credits, 1_150);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = 'capped' AND reference_id = 'journey-dallas-10' AND amount = 50").get()).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
