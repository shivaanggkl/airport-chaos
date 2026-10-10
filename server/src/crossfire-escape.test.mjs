import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas15, journeyDallas16, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { CrossfireFireCoordinator } from './journey-crossfire.js';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-crossfire-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  database.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}

test('five forward gates have matching visible openings and reject reverse crossings', () => {
  assert.equal(journeyDallas16.gates.length, 5);
  assert.equal(journeyDallas16.firstClearCredits, 2_100);
  for (let i = 0; i < 5; i++) {
    const gate = journeyDallas16.gates[i];
    const previous = journeyDallas16.gates[Math.max(0, i - 1)];
    const next = journeyDallas16.gates[Math.min(4, i + 1)];
    const dx = next.x - previous.x; const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    const from = { x: gate.x - dx / length * 20, y: gate.altitude, z: gate.z - dz / length * 20 };
    const to = { x: gate.x + dx / length * 20, y: gate.altitude, z: gate.z + dz / length * 20 };
    assert.equal(journeyGateCrossing(from, to, i, 0, journeyDallas16), 'VALID');
    assert.equal(journeyGateCrossing(to, from, i, 0, journeyDallas16), false);
  }
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas16.id, status: 'RACING' })?.showAmbientAIAircraft, false);
});

test('Mission 16 requires Mission 15 and persists two milestone Hunter identities', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas16.id), /locked/);
    const database = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) database.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run(pilot, journeyDallas15.id, `${pilot}-m15`, 500);
    const first = store.launch('pilot', 'trainer', 2_000, journeyDallas16.id);
    store.approach('pilot', first.attemptId);
    assert.equal(store.assignCrossfireHunter('pilot', first.attemptId, 'hunter1', 1), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 2_100), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 2_100)?.gateIndex, 1);
    assert.equal(store.assignCrossfireHunter('pilot', first.attemptId, 'hunter1', 1)?.targetId, 'hunter1');
    assert.equal(store.assignCrossfireHunter('pilot', first.attemptId, 'duplicate', 1), undefined);
    assert.equal(store.assignCrossfireHunter('pilot', first.attemptId, 'hunter2', 2), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 2_200), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 2_500)?.gateIndex, 2);
    assert.equal(store.acceptGate('pilot', first.attemptId, 2, 2_900)?.gateIndex, 3);
    assert.equal(store.assignCrossfireHunter('pilot', first.attemptId, 'hunter2', 2)?.secondaryTargetId, 'hunter2');
    assert.equal(store.acceptGate('pilot', first.attemptId, 3, 3_300)?.gateIndex, 4);
    assert.equal(store.acceptGate('pilot', first.attemptId, 4, 3_700)?.status, 'COMPLETED');
    assert.equal(store.get('pilot', first.attemptId)?.firstClearCredits, 2_100);
    assert.equal(store.acceptGate('pilot', first.attemptId, 4, 4_100), undefined);
    assert.equal(store.progress('pilot', journeyDallas16.id).completed, true);
    const replay = store.launch('pilot', 'trainer', 5_000, journeyDallas16.id);
    store.approach('pilot', replay.attemptId);
    for (let i = 0; i < 5; i++) store.acceptGate('pilot', replay.attemptId, i, 5_000 + i * 400);
    assert.equal(store.get('pilot', replay.attemptId)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 8_000, journeyDallas16.id);
    store.approach('capped', capped.attemptId);
    for (let i = 0; i < 5; i++) store.acceptGate('capped', capped.attemptId, i, 8_000 + i * 400);
    assert.equal(store.get('capped', capped.attemptId)?.firstClearCredits, 50);
    assert.equal(database.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 2_100);
    database.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('one active shooter and a safe handoff without changing weapon cooldowns', () => {
  const coordinator = new CrossfireFireCoordinator();
  assert.equal(coordinator.canInitiate('hunter1', false, 1_000), false);
  assert.equal(coordinator.canInitiate('hunter1', true, 1_000), true);
  assert.equal(coordinator.canInitiate('hunter2', true, 1_000), false);
  coordinator.revoke('hunter1', 1_100);
  assert.equal(coordinator.canInitiate('hunter2', true, 1_500), false);
  assert.equal(coordinator.canInitiate('hunter2', true, 2_000), true);
  assert.equal(coordinator.canInitiate('hunter1', true, 2_000), false);
  assert.equal(coordinator.canInitiate('hunter2', false, 2_100), false);
  assert.equal(coordinator.canInitiate('hunter1', true, 2_500), false);
  assert.equal(coordinator.canInitiate('hunter1', true, 3_000), true);
});

test('abandon and Retry retire gate progress and assigned Hunter IDs', () => {
  const { directory, path, store } = fixture();
  try {
    const database = new DatabaseSync(path);
    database.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run('pilot', journeyDallas15.id, 'prior-ace', 500);
    database.close();
    const old = store.launch('pilot', 'trainer', 1_000, journeyDallas16.id);
    store.approach('pilot', old.attemptId);
    store.acceptGate('pilot', old.attemptId, 0, 1_100);
    store.assignCrossfireHunter('pilot', old.attemptId, 'old-hunter', 1);
    assert.equal(store.abandon('pilot', old.attemptId, 1_200)?.status, 'ABANDONED');
    assert.equal(store.acceptGate('pilot', old.attemptId, 1, 1_500), undefined);
    const retry = store.launch('pilot', 'trainer', 2_000, journeyDallas16.id);
    assert.notEqual(retry.attemptId, old.attemptId);
    assert.equal(retry.gateIndex, 0);
    assert.equal(retry.targetId, null);
    assert.equal(retry.secondaryTargetId, null);
    assert.equal(retry.deadlineAt, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
