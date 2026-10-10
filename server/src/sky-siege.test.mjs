import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas17, journeyDallas18 } from '../../shared/journey-mission.mjs';
import { territoriesForCity, territoryContains } from '../../shared/city-territories.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { focusedTerritoryParticipantAllowed } from './focused-territory-defender.js';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-siege-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999950,0),('other',0,0)");
  database.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}
function captured(store, pilot, attemptId, start = 1_000) {
  store.updateSiegeCapture(pilot, attemptId, true, start, start);
  let result;
  for (let n = 1; n <= 60; n++) result = store.updateSiegeCapture(pilot, attemptId, true, start + n * 400, start + n * 400);
  return result;
}
function defended(store, pilot, attemptId, start = 30_000) {
  store.updateSiegeDefense(pilot, attemptId, true, start, start);
  let result;
  for (let n = 1; n <= 100; n++) result = store.updateSiegeDefense(pilot, attemptId, true, start + n * 400, start + n * 400);
  return result;
}

test('Sky Siege uses existing Las Colinas territory and a contained, mission-only defense region', () => {
  const territory = territoriesForCity('dallas').find(item => item.id === journeyDallas18.territoryId);
  assert.ok(territory);
  assert.equal(territory.id, 'las-colinas');
  assert.equal(territory.center.x, -13_500);
  assert.equal(territory.center.z, -9_350);
  for (const point of [
    { x: territory.center.x + journeyDallas18.defenseRadius, z: territory.center.z },
    { x: territory.center.x - journeyDallas18.defenseRadius, z: territory.center.z },
    { x: territory.center.x, z: territory.center.z + journeyDallas18.defenseRadius },
    { x: territory.center.x, z: territory.center.z - journeyDallas18.defenseRadius },
  ]) assert.equal(territoryContains(territory, point), true);
  assert.equal(journeyDallas18.captureMs, 24_000);
  assert.equal(journeyDallas18.defenseMs, 40_000);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas18.id, status: 'RACING' })?.showAmbientAIAircraft, false);
  // Focused Mission 18 pilots cannot enter ordinary shared-world territory capture.
  assert.equal(focusedTerritoryParticipantAllowed(true, undefined, 'attempt'), false);
});

test('siege capture bypasses persistent territory ownership and its Hunter uses safe mission clearance', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /journeyStore\.get\(player\.pilotId, attemptId\)\?\.missionId === journeyDallas18\.id \|\|\s*journeyStore\.get\(player\.pilotId, attemptId\)\?\.missionId === journeyDallas21\.id\)\) return false;/);
  assert.ok(server.includes('journeyStore.updateSiegeCapture(pilot.pilotId, attemptId, valid, performance.now(), now)'));
  assert.ok(server.includes('bot.journeyEscape || bot.journeySiege || bot.journeyBreakout ? journeyEscapeHunterClearance'));
});

test('Sky Siege unlock, fresh capture, pause/resume, Hunter assignment and first-clear reward', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas18.id), /locked/);
    const db = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas17.id, `${pilot}-m17`, 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas18.id);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.equal(store.updateSiegeCapture('other', first.attemptId, true, 1_000), undefined);
    assert.equal(store.assignSiegeHunter('pilot', first.attemptId, 'early'), undefined);
    store.updateSiegeCapture('pilot', first.attemptId, true, 1_000);
    assert.equal(store.updateSiegeCapture('pilot', first.attemptId, true, 10_000)?.captureMs, 0); // long tick cannot credit time
    store.updateSiegeCapture('pilot', first.attemptId, true, 10_400);
    assert.equal(store.updateSiegeCapture('pilot', first.attemptId, false, 10_800)?.captureMs, 0);
    const completeCapture = captured(store, 'pilot', first.attemptId, 12_000);
    assert.equal(completeCapture?.status, 'RACING');
    assert.equal(completeCapture?.holdMs, 0);
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 30_000), undefined); // Hunter not assigned
    assert.equal(store.assignSiegeHunter('pilot', first.attemptId, 'hunter')?.targetId, 'hunter');
    assert.equal(store.assignSiegeHunter('pilot', first.attemptId, 'duplicate'), undefined);
    store.updateSiegeDefense('pilot', first.attemptId, true, 30_000);
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 30_400)?.holdMs, 400);
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, false, 30_800)?.holdMs, 400);
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 50_000)?.holdMs, 400); // pause and long gap
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 50_400)?.holdMs, 800);
    let result;
    for (let n = 1; n <= 98; n++) result = store.updateSiegeDefense('pilot', first.attemptId, true, 50_400 + n * 400, 50_400 + n * 400);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.holdMs, 40_000);
    assert.equal(result?.firstClearCredits, 2_400);
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 100_000), undefined);
    assert.equal(store.progress('pilot', journeyDallas18.id).firstAttemptId, first.attemptId);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2_400);
    const replay = store.launch('pilot', 'trainer', 200_000, journeyDallas18.id);
    store.approach('pilot', replay.attemptId);
    captured(store, 'pilot', replay.attemptId, 201_000);
    store.assignSiegeHunter('pilot', replay.attemptId, 'hunter-replay');
    assert.equal(defended(store, 'pilot', replay.attemptId, 230_000)?.firstClearCredits, 0);
    const cap = store.launch('capped', 'trainer', 300_000, journeyDallas18.id);
    store.approach('capped', cap.attemptId);
    captured(store, 'capped', cap.attemptId, 301_000);
    store.assignSiegeHunter('capped', cap.attemptId, 'hunter-cap');
    assert.equal(defended(store, 'capped', cap.attemptId, 330_000)?.firstClearCredits, 50);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id='journey-dallas-18'").get().count, 2);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Sky Siege failed attempts reset capture and defense while preserving committed rewards', () => {
  const { directory, path, store } = fixture();
  try {
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('pilot', journeyDallas17.id, 'm17', 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas18.id);
    store.approach('pilot', first.attemptId);
    captured(store, 'pilot', first.attemptId, 2_000);
    store.assignSiegeHunter('pilot', first.attemptId, 'hunter');
    store.updateSiegeDefense('pilot', first.attemptId, true, 30_000);
    store.updateSiegeDefense('pilot', first.attemptId, true, 30_400);
    assert.equal(store.fail('pilot', first.attemptId, 'CRASHED', 31_000)?.status, 'FAILED');
    assert.equal(store.updateSiegeDefense('pilot', first.attemptId, true, 31_400), undefined);
    const retry = store.launch('pilot', 'trainer', 32_000, journeyDallas18.id);
    assert.equal(retry.captureMs, 0);
    assert.equal(retry.holdMs, 0);
    assert.equal(retry.targetId, null);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 0);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
