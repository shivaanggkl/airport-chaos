import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas13, journeyDallas14 } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { escapeInterval } from './journey-escape.js';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-escape-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  database.close();
  const store = new JourneyAttemptStore(path);
  return { directory, path, store };
}

test('450 m horizontal separation requires a real close encounter and live pursuit', () => {
  assert.equal(journeyDallas14.escapeDistance, 450);
  assert.equal(journeyDallas14.escapeMs, 10_000);
  const pilot = { x: 0, z: 0 };
  const distant = { x: 451, z: 0 };
  assert.deepEqual(escapeInterval(pilot, distant, 450, true, true, false),
    { distance: 451, engaged: false, valid: false });
  const engaged = escapeInterval(pilot, { x: 240, z: 0 }, 450, true, true, false);
  assert.equal(engaged.engaged, true);
  assert.equal(engaged.valid, false);
  assert.equal(escapeInterval(pilot, { x: 450, z: 0 }, 450, true, true, engaged.engaged).valid, true);
  assert.equal(escapeInterval(pilot, distant, 450, false, true, true).valid, false);
  assert.equal(escapeInterval(pilot, distant, 450, true, false, true).valid, false);
  assert.equal(escapeInterval(pilot, { x: 400, z: 0 }, 450, true, true, true).valid, false);
  assert.equal(escapeInterval(pilot, { x: 0, z: 0 }, 450, true, true, true).distance, 0);
  assert.equal(escapeInterval(pilot, { x: NaN, z: 0 }, 450, true, true, true).valid, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas14.id, status: 'RACING' })?.showAmbientAIAircraft, false);
});

test('Mission 13 unlocks escape; hold pauses, resumes and awards once', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas14.id), /locked/);
    const setup = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) setup.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas13.id, `${pilot}-m13`, 500, 0);
    setup.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas14.id);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, 1_200, 1_200), undefined);
    assert.equal(store.assignHunter('pilot', first.attemptId, 'hunter', null, 2_000)?.status, 'RACING');
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'wrong-hunter', true, 2_200, 2_200), undefined);
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, 2_200, 2_200)?.holdMs, 0);
    let now = 2_200;
    let mono = 2_200;
    for (let index = 0; index < 15; index++) {
      now += 200; mono += 200;
      assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, now, mono)?.holdMs, (index + 1) * 200);
    }
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', false, now + 200, mono + 200)?.holdMs, 3_000);
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, now + 5_000, mono + 5_000)?.holdMs, 3_000);
    now += 5_000; mono += 5_000;
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, now + 5_000, mono + 5_000)?.holdMs, 3_000);
    now += 5_000; mono += 5_000;
    for (let index = 0; index < 35; index++) {
      now += 200; mono += 200;
      const result = store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, now, mono);
      if (index < 34) assert.equal(result?.status, 'RACING');
      else { assert.equal(result?.status, 'COMPLETED'); assert.equal(result.firstClearCredits, 1_800); }
    }
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter', true, now + 200, mono + 200), undefined);
    assert.equal(store.progress('pilot', journeyDallas14.id).completed, true);
    const replay = store.launch('pilot', 'trainer', now + 1_000, journeyDallas14.id);
    store.approach('pilot', replay.attemptId);
    store.assignHunter('pilot', replay.attemptId, 'new-hunter', null, now + 1_200);
    let replayResult = store.updateEscapeHold('pilot', replay.attemptId, 'new-hunter', true, now + 1_400, mono + 1_400);
    for (let index = 1; index <= 50; index++) replayResult = store.updateEscapeHold('pilot', replay.attemptId, 'new-hunter', true, now + 1_400 + 200 * index, mono + 1_400 + 200 * index);
    assert.equal(replayResult?.status, 'COMPLETED');
    assert.equal(replayResult.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 30_000, journeyDallas14.id);
    store.approach('capped', capped.attemptId);
    store.assignHunter('capped', capped.attemptId, 'capped-hunter', null, 30_200);
    let cappedResult = store.updateEscapeHold('capped', capped.attemptId, 'capped-hunter', true, 30_400, 30_400);
    for (let index = 1; index <= 50; index++) cappedResult = store.updateEscapeHold('capped', capped.attemptId, 'capped-hunter', true, 30_400 + index * 200, 30_400 + index * 200);
    assert.equal(cappedResult?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = 'journey-dallas-14'").get().n, 1);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 1_800);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('invalidated and replaced attempts cannot retain escape time or target', () => {
  const { directory, path, store } = fixture();
  try {
    const setup = new DatabaseSync(path);
    setup.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('pilot', journeyDallas13.id, 'm13', 500, 0);
    setup.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas14.id);
    store.approach('pilot', first.attemptId);
    store.assignHunter('pilot', first.attemptId, 'hunter-a', null, 1_200);
    store.updateEscapeHold('pilot', first.attemptId, 'hunter-a', true, 1_400, 1_400);
    store.updateEscapeHold('pilot', first.attemptId, 'hunter-a', true, 1_600, 1_600);
    assert.equal(store.get('pilot', first.attemptId)?.holdMs, 200);
    assert.equal(store.fail('pilot', first.attemptId, 'PURSUIT_INTERRUPTED', 1_700)?.status, 'FAILED');
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter-a', true, 1_800, 1_800), undefined);
    const retry = store.launch('pilot', 'trainer', 2_000, journeyDallas14.id);
    assert.equal(retry.holdMs, 0);
    assert.equal(retry.targetId, null);
    assert.equal(store.updateEscapeHold('pilot', first.attemptId, 'hunter-a', true, 2_200, 2_200), undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('network path uses the assigned bot and accepted server movement, never client escape claims', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /journeyDallas14\.id && !journeyStore\.progress\(identity\.pilotId, journeyDallas13\.id\)\.completed/);
  assert.match(server, /active\.targetId.*?players\.get\(active\.targetId\)/s);
  assert.match(server, /now - pilot\.lastAcceptedTransformAt < 450/);
  assert.match(server, /hunter\.bot\.journeyAttemptId !== attemptId/);
  assert.match(server, /insideJourneyHunterArena\(pilot\.position\)/);
  assert.match(server, /escapeInterval\(pilot\.position, hunter\.position/);
  assert.doesNotMatch(server, /message\.(?:escapeDistance|escapeMs|escapeProgress|hunterPosition)/);
});

test('escape Hunter starts behind the pilot above sampled hazards without an immediate vertical blind-zone turn', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /const journeyEscapeHunterClearance = 200/);
  assert.match(server, /journeySpawn\?\.escape \? botSafeFloor\(cityId, spawnX, spawnZ, journeyEscapeHunterClearance\) \+ 20/);
  assert.match(server, /bot\.journeyEscape \|\| bot\.journeySiege \|\| bot\.journeyBreakout \? journeyEscapeHunterClearance/);
  assert.match(server, /hunterClearance\(bot\)/);
  assert.match(server, /journeySpawn\?\.escape \? journeySpawn\.target\.position\.x \+ Math\.sin\(journeySpawn\.target\.rotation\.y\) \* 240/);
  // At the authorized 300-ft takeoff altitude, the initial relative height
  // stays below the existing AI's 0.6 * horizontal blind-zone threshold.
  assert.ok(200 + 20 - 300 * 0.3048 < 240 * 0.6);
});
