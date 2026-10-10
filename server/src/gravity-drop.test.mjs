import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas10, journeyDallas11, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt, excludesFocusedBotInteraction } from '../../shared/mission-focus.mjs';
import { gravityDropGuidance, confirmedGateObjective } from '../../client/src/objective-guidance.js';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { validateClientTransform } from './transform-validation.js';
import { JourneyAttemptStore } from './journey-attempts.js';

test('Gravity Drop uses five honest forward rings, descending then recovering within Bluejay pitch bounds', () => {
  const gates = journeyDallas11.gates;
  assert.equal(gates.length, 5);
  assert.equal(journeyDallas11.timeLimitMs, 75_000);
  assert.equal(journeyDallas11.firstClearCredits, 1_250);
  assert.ok(journeyDallas11.airborneSpawn.altitude > gates[0].altitude);
  const bluejay = aircraftFlightEnvelope.trainer;
  let distance = 0;
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    const previous = gates[Math.max(0, index - 1)];
    const next = gates[Math.min(gates.length - 1, index + 1)];
    const nx = (next.x - previous.x) / Math.hypot(next.x - previous.x, next.z - previous.z);
    const nz = (next.z - previous.z) / Math.hypot(next.x - previous.x, next.z - previous.z);
    const before = { x: gate.x - nx * 180, y: gate.altitude, z: gate.z - nz * 180 };
    const after = { x: gate.x + nx * 180, y: gate.altitude, z: gate.z + nz * 180 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas11), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas11), false);
    assert.equal(journeyGateCrossing({ ...before, x: before.x + gate.radius }, { ...after, x: after.x + gate.radius }, index, 0, journeyDallas11), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius }, { ...after, y: gate.altitude + gate.radius }, index, 0, journeyDallas11), false);
    if (index > 0) {
      const leg = Math.hypot(gate.x - gates[index - 1].x, gate.z - gates[index - 1].z);
      distance += leg;
      const pitch = Math.atan2(gate.altitude - gates[index - 1].altitude, leg);
      assert.ok(index < 4 ? pitch < 0 && Math.abs(pitch) < bluejay.maxDivePitch * .6
        : pitch > 0 && pitch < bluejay.maxClimbPitch * .6);
    }
  }
  assert.equal(distance, 12_000);
  assert.ok(distance / (journeyDallas11.timeLimitMs / 1000) < journeyDallas11.airborneSpawn.speed);
});

test('Dallas OSM roofs and authored skyline leave the complete gate corridor clear', () => {
  const osm = JSON.parse(readFileSync(new URL('../../client/src/data/city1-osm.json', import.meta.url), 'utf8'));
  let nearby = 0;
  let highestRoofAgl = 0;
  for (const chunk of osm.chunks) for (const building of chunk.b) {
    const xs = [], zs = [];
    for (let index = 2; index < building.length; index += 2) { xs.push(building[index]); zs.push(building[index + 1]); }
    if (Math.min(...xs) > -4_800 || Math.max(...xs) < -5_200 ||
      Math.min(...zs) > 5_500 || Math.max(...zs) < -9_000) continue;
    nearby++;
    highestRoofAgl = Math.max(highestRoofAgl, building[0]);
  }
  assert.ok(nearby > 0);
  assert.ok(journeyDallas11.gates[3].altitude - journeyDallas11.gates[3].radius * .92 - highestRoofAgl > 500);
});

test('airborne spawn is server-owned, stable and ordinary movement security rejects a forged jump', () => {
  const attempt = { missionId: journeyDallas11.id, status: 'APPROACH' };
  const spawn = authorizedJourneyAirborneSpawn(attempt, journeyDallas11, () => 170);
  assert.deepEqual(spawn, { position: { x: -5_000, y: 1_820, z: -9_000 }, heading: Math.PI, speed: 220 });
  assert.equal(authorizedJourneyAirborneSpawn({ ...attempt, status: 'READY' }, journeyDallas11, () => 170), undefined);
  assert.equal(authorizedJourneyAirborneSpawn({ missionId: journeyDallas10.id, status: 'APPROACH' }, journeyDallas11, () => 170), undefined);
  assert.equal(validateClientTransform(spawn.position, { ...spawn.position, z: spawn.position.z + 22 }, 100, aircraftFlightEnvelope.trainer).accepted, true);
  assert.equal(validateClientTransform(spawn.position, { ...spawn.position, z: spawn.position.z + 1_000 }, 100, aircraftFlightEnvelope.trainer).accepted, false);
});

test('dive guidance follows actual elevation and confirmed objective', () => {
  const attempt = { attemptId: 'a', status: 'APPROACH', gateIndex: 0 };
  assert.equal(confirmedGateObjective(attempt, journeyDallas11.gates, () => 170)?.position.y, 1_720);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 4 }, journeyDallas11.gates, () => 170)?.label, 'GATE 5');
  assert.equal(confirmedGateObjective({ ...attempt, status: 'COMPLETED' }, journeyDallas11.gates, () => 170), null);
  assert.equal(gravityDropGuidance(1, 2500, -100, 0, 110, true, false), 'GET READY — FOLLOW THE GOLD ARROW');
  assert.equal(gravityDropGuidance(3, 850, -300, 0, 110, false, false), 'NOSE DOWN — REACH GATE 3');
  assert.equal(gravityDropGuidance(3, 850, 200, 0, 110, false, false), 'GATE 3 ABOVE — CLIMB');
  assert.equal(gravityDropGuidance(3, 850, -300, Math.PI, 110, false, false), 'FOLLOW THE GOLD ARROW TO GATE 3');
  assert.equal(gravityDropGuidance(5, 850, 300, 0, 110, false, false), 'PULL UP — REACH THE FINAL GATE');
  assert.equal(gravityDropGuidance(5, 200, 10, 0, 110, false, false), 'LEVEL OUT — FLY THROUGH GATE 5');
  assert.equal(gravityDropGuidance(5, 850, 300, 0, 110, false, true), 'PULL UP — REACH THE FINAL GATE');
});

test('Focus excludes ambient bots for Mission 11 only while the attempt is active', () => {
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas11.id, status: 'APPROACH' })?.showAmbientAIAircraft, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas11.id, status: 'RACING' })?.showAmbientAIMarkers, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas11.id, status: 'COMPLETED' }), null);
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true);
  assert.equal(excludesFocusedBotInteraction(true, false, false, false), false);
});

test('preparation, sequence, timeout, first-clear reward, cap and replay are authoritative', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-gravity-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0), ('other', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas11.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas10.id, `${pilot}-mission10`, 500, 0);
    fixture.close();
    const early = store.launch('pilot', 'trainer', 1_000, journeyDallas11.id);
    assert.equal(store.approach('pilot', early.attemptId, 2_000)?.prepareUntil, 5_000);
    assert.equal(store.acceptGate('pilot', early.attemptId, 0, 4_999), undefined);
    assert.equal(store.acceptGate('other', early.attemptId, 0, 5_000), undefined);
    assert.equal(store.acceptGate('pilot', early.attemptId, 1, 5_000), undefined);
    assert.equal(store.acceptGate('pilot', early.attemptId, 0, 5_000)?.deadlineAt, 80_000);
    assert.equal(store.acceptGate('pilot', early.attemptId, 0, 6_000), undefined);
    assert.equal(store.acceptGate('pilot', early.attemptId, 1, 80_001), undefined);
    assert.equal(store.fail('pilot', early.attemptId, 'TIME_UP', 80_001)?.status, 'FAILED');
    const first = store.launch('pilot', 'trainer', 100_000, journeyDallas11.id);
    store.approach('pilot', first.attemptId, 101_000);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 104_000)?.gateIndex, 1);
    assert.equal(store.acceptGate('pilot', first.attemptId, 2, 110_000), undefined);
    for (let index = 1; index < 5; index++) {
      const result = store.acceptGate('pilot', first.attemptId, index, 104_000 + index * 12_000);
      assert.equal(result?.gateIndex, index + 1);
      assert.equal(result?.status, index === 4 ? 'COMPLETED' : 'RACING');
    }
    assert.equal(store.get('pilot', first.attemptId).firstClearCredits, 1_250);
    assert.equal(store.acceptGate('pilot', first.attemptId, 4, 160_000), undefined);
    const replay = store.launch('pilot', 'trainer', 200_000, journeyDallas11.id);
    store.approach('pilot', replay.attemptId, 201_000);
    for (let index = 0; index < 5; index++) store.acceptGate('pilot', replay.attemptId, index, 204_000 + index * 10_000);
    assert.equal(store.get('pilot', replay.attemptId).firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 300_000, journeyDallas11.id);
    store.approach('capped', capped.attemptId, 301_000);
    for (let index = 0; index < 5; index++) store.acceptGate('capped', capped.attemptId, index, 304_000 + index * 10_000);
    assert.equal(store.get('capped', capped.attemptId).firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = 'journey-dallas-11'").get().n, 1);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 1_250);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
