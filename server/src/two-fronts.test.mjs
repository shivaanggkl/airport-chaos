import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas20, journeyDallas21 } from '../../shared/journey-mission.mjs';
import { territoriesForCity, territoryContains } from '../../shared/city-territories.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-two-fronts-test-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999950,0),('other',0,0)");
  db.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}
function capture(store, pilot, id, territory, start) {
  store.updateTwoFronts(pilot, id, territory, true, start, start);
  let state;
  for (let n = 1; n <= 15; n++) state = store.updateTwoFronts(pilot, id, territory, true, start + n * 400, start + n * 400);
  return state;
}

test('two existing, distinct Dallas rectangles permit ordinary six-second flight and a timed transfer', () => {
  const territories = territoriesForCity('dallas');
  const alpha = territories.find(item => item.id === journeyDallas21.alphaTerritoryId);
  const bravo = territories.find(item => item.id === journeyDallas21.bravoTerritoryId);
  assert.ok(alpha && bravo && alpha.id !== bravo.id);
  assert.equal(journeyDallas21.startAirportId, 'love');
  assert.equal(journeyDallas21.captureMs, 6_000);
  assert.equal(journeyDallas21.transferMs, 120_000);
  assert.ok(territoryContains(alpha, alpha.center));
  assert.ok(territoryContains(bravo, bravo.center));
  assert.equal(territoryContains(alpha, bravo.center), false);
  assert.equal(territoryContains(bravo, alpha.center), false);
  const size = territory => Math.min(territory.bounds.maxX - territory.bounds.minX, territory.bounds.maxZ - territory.bounds.minZ);
  assert.ok(size(alpha) > 8_000 && size(bravo) > 8_000);
  const direct = Math.hypot(alpha.center.x - bravo.center.x, alpha.center.z - bravo.center.z);
  assert.ok(direct > 31_000 && direct < 32_000);
  assert.ok(aircraftFlightEnvelope.trainer.maxSpeed > direct / 120);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas21.id, status: 'RACING' })?.showAmbientAIAircraft, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas21.id, status: 'COMPLETED' }), null);
});

test('server owns Alpha then Bravo, pauses capture, enforces deadline and pays the first clear once', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas21.id), /locked/);
    const db = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas20.id, `${pilot}-m20`, 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas21.id);
    assert.equal(first.targetId, journeyDallas21.alphaTerritoryId);
    assert.equal(first.secondaryTargetId, journeyDallas21.bravoTerritoryId);
    store.approach('pilot', first.attemptId, 1_000);
    assert.equal(store.updateTwoFronts('other', first.attemptId, journeyDallas21.alphaTerritoryId, true, 1_000), undefined);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 1_000)?.captureMs, 0);
    store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 1_000, 1_000);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 1_400, 1_400)?.captureMs, 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, '', false, 1_800, 1_800)?.captureMs, 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 20_000, 20_000)?.captureMs, 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 20_400, 20_400)?.captureMs, 800);
    let alpha;
    for (let n = 1; n <= 13; n++) alpha = store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 20_400 + n * 400, 20_400 + n * 400);
    assert.equal(alpha?.status, 'RACING');
    assert.equal(alpha?.captureMs, 6_000);
    assert.equal(alpha?.holdMs, 0);
    const deadline = alpha.deadlineAt;
    assert.equal(deadline, alpha.startedAt + 120_000);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.alphaTerritoryId, true, 25_000, 25_000)?.deadlineAt, deadline);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 26_000, 26_000)?.holdMs, 0);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 26_400, 26_400)?.holdMs, 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, '', false, 26_800, 26_800)?.holdMs, 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 27_000, 27_000)?.holdMs, 400);
    let completed;
    for (let n = 1; n <= 14; n++) completed = store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 27_000 + n * 400, 27_000 + n * 400);
    assert.equal(completed?.status, 'COMPLETED');
    assert.equal(completed?.holdMs, 6_000);
    assert.equal(completed?.firstClearCredits, 2_850);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 40_000, 40_000), undefined);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2_850);
    const replay = store.launch('pilot', 'trainer', 50_000, journeyDallas21.id);
    store.approach('pilot', replay.attemptId, 50_000);
    const secondAlpha = capture(store, 'pilot', replay.attemptId, journeyDallas21.alphaTerritoryId, 50_000);
    assert.equal(secondAlpha?.status, 'RACING');
    const secondBravo = capture(store, 'pilot', replay.attemptId, journeyDallas21.bravoTerritoryId, 60_000);
    assert.equal(secondBravo?.status, 'COMPLETED');
    assert.equal(secondBravo?.firstClearCredits, 0);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2_850);
    const capped = store.launch('capped', 'trainer', 80_000, journeyDallas21.id);
    store.approach('capped', capped.attemptId, 80_000);
    capture(store, 'capped', capped.attemptId, journeyDallas21.alphaTerritoryId, 80_000);
    const cappedResult = capture(store, 'capped', capped.attemptId, journeyDallas21.bravoTerritoryId, 90_000);
    assert.equal(cappedResult?.firstClearCredits, 50);
    const expired = store.launch('pilot', 'trainer', 100_000, journeyDallas21.id);
    store.approach('pilot', expired.attemptId, 100_000);
    const expiredAlpha = capture(store, 'pilot', expired.attemptId, journeyDallas21.alphaTerritoryId, 100_000);
    assert.equal(store.updateTwoFronts('pilot', expired.attemptId, journeyDallas21.bravoTerritoryId, true, expiredAlpha.deadlineAt, expiredAlpha.deadlineAt)?.status, 'FAILED');
    assert.equal(store.progress('pilot', journeyDallas21.id).firstAttemptId, first.attemptId);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Mission 21 capture is isolated from shared territory ownership and client-supplied progress', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /journeyStore\.get\(player\.pilotId, attemptId\)\?\.missionId === journeyDallas21\.id\)\) return false/);
  assert.match(server, /journeyStore\.updateTwoFronts\(pilot\.pilotId, attemptId, currentTerritory, eligible, performance\.now\(\), now\)/);
  assert.match(server, /hasOpenPlayerSocket\(playerId\) && landingFlightState\.get\(playerId\)\?\.airborne === true/);
  assert.match(server, /playerJourneyLoveTakeoff\.has\(playerId\)/);
  assert.doesNotMatch(server, /message\.(captureMs|holdMs|deadlineAt).*journeyDallas21/);
});

test('5.9 seconds cannot win, deadline is strict, and a fresh retry clears both captures', () => {
  const { directory, path, store } = fixture();
  try {
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('pilot', journeyDallas20.id, 'm20', 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas21.id);
    store.approach('pilot', first.attemptId, 1_000);
    const alpha = capture(store, 'pilot', first.attemptId, journeyDallas21.alphaTerritoryId, 1_000);
    assert.equal(alpha?.status, 'RACING');
    store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 10_000, 10_000);
    for (let n = 1; n <= 14; n++) store.updateTwoFronts('pilot', first.attemptId,
      journeyDallas21.bravoTerritoryId, true, 10_000 + n * 400, 10_000 + n * 400);
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true, 15_900, 15_900)?.holdMs, 5_900);
    assert.equal(store.get('pilot', first.attemptId)?.status, 'RACING');
    assert.equal(store.updateTwoFronts('pilot', first.attemptId, journeyDallas21.bravoTerritoryId, true,
      alpha.deadlineAt, alpha.deadlineAt)?.status, 'FAILED');
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 0);
    const retry = store.launch('pilot', 'trainer', alpha.deadlineAt + 1, journeyDallas21.id);
    assert.equal(retry.status, 'READY');
    assert.equal(retry.captureMs, 0);
    assert.equal(retry.holdMs, 0);
    assert.equal(retry.deadlineAt, null);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
