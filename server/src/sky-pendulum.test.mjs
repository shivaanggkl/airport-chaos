import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas11, journeyDallas12, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { missionFocusForAttempt, excludesFocusedBotInteraction } from '../../shared/mission-focus.mjs';
import { confirmedGateObjective, pendulumGateGuidance } from '../../client/src/objective-guidance.js';
import { JourneyAttemptStore } from './journey-attempts.js';

const terrain = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
const bytes = Buffer.from(terrain.elevations, 'base64');
const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
function elevationAt(x, z) {
  const gx = Math.max(0, Math.min(1, (x - terrain.bounds.minX) / (terrain.bounds.maxX - terrain.bounds.minX))) * (terrain.width - 1);
  const gz = Math.max(0, Math.min(1, (z - terrain.bounds.minZ) / (terrain.bounds.maxZ - terrain.bounds.minZ))) * (terrain.height - 1);
  const x0 = Math.floor(gx), z0 = Math.floor(gz), x1 = Math.min(x0 + 1, terrain.width - 1), z1 = Math.min(z0 + 1, terrain.height - 1);
  const sample = (sx, sz) => terrain.baseElevation + samples[sz * terrain.width + sx] * terrain.scale;
  const top = sample(x0, z0) * (1 - (gx - x0)) + sample(x1, z0) * (gx - x0);
  const bottom = sample(x0, z1) * (1 - (gx - x0)) + sample(x1, z1) * (gx - x0);
  return top * (1 - (gz - z0)) + bottom * (gz - z0);
}

test('Sky Pendulum has six honest forward gates on a clear three-up three-down corridor', () => {
  const gates = journeyDallas12.gates;
  assert.equal(gates.length, 6);
  assert.equal(journeyDallas12.timeLimitMs, 120_000);
  assert.equal(journeyDallas12.firstClearCredits, 1_500);
  assert.equal(journeyDallas12.startAirportId, 'love');
  const love = cityAirports.dallas.find(airport => airport.id === 'love');
  assert.equal(gates[0].x, love.x);
  assert.ok(gates[0].z < love.z - love.runwayLength / 2);
  let route = 0;
  let maxPitch = 0;
  for (const [index, gate] of gates.entries()) {
    assert.equal(gate.radius, 110);
    assert.ok(gate.z < (index ? gates[index - 1].z : love.z));
    const before = { x: gate.x, y: elevationAt(gate.x, gate.z) + gate.altitude, z: gate.z + 140 };
    const after = { ...before, z: gate.z - 140 };
    assert.equal(journeyGateCrossing(before, after, index, elevationAt(gate.x, gate.z), journeyDallas12), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, elevationAt(gate.x, gate.z), journeyDallas12), false);
    assert.equal(journeyGateCrossing({ ...before, x: before.x + 110 }, { ...after, x: after.x + 110 }, index, elevationAt(gate.x, gate.z), journeyDallas12), false);
    if (index) {
      const previous = gates[index - 1];
      const leg = Math.hypot(gate.x - previous.x, gate.z - previous.z);
      route += leg;
      const rise = gate.altitude + elevationAt(gate.x, gate.z) - previous.altitude - elevationAt(previous.x, previous.z);
      const pitch = Math.atan2(rise, leg);
      maxPitch = Math.max(maxPitch, Math.abs(pitch));
      assert.ok(index <= 2 ? pitch > 0 : pitch < 0);
    }
  }
  assert.equal(route, 6_750);
  assert.ok(maxPitch < Math.min(aircraftFlightEnvelope.trainer.maxClimbPitch, aircraftFlightEnvelope.trainer.maxDivePitch) * .6);
  assert.ok(route / 120 < aircraftFlightEnvelope.trainer.maxSpeed);

  let minimumClearance = Infinity;
  let buildings = 0;
  for (let x = -3; x <= -2; x++) for (let z = -10; z <= -6; z++) {
    const path = new URL(`../../client/public/data/dallas/near/${x}_${z}.json`, import.meta.url);
    if (!existsSync(path)) continue;
    const chunk = JSON.parse(readFileSync(path, 'utf8'));
    for (const building of chunk.b) {
      const xs = building.slice(4).filter((_, i) => i % 2 === 0);
      const zs = building.slice(4).filter((_, i) => i % 2 === 1);
      if (!xs.length || Math.max(...xs) < -5_340 || Math.min(...xs) > -4_940 ||
        Math.max(...zs) < -18_200 || Math.min(...zs) > -10_950) continue;
      buildings++;
      const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      if (centerZ > gates[0].z || centerZ < gates[5].z) continue;
      const leg = gates.findIndex((gate, index) => index > 0 && centerZ >= gate.z);
      if (leg < 1) continue;
      const previous = gates[leg - 1], next = gates[leg];
      const fraction = (centerZ - previous.z) / (next.z - previous.z);
      const altitude = previous.altitude + fraction * (next.altitude - previous.altitude);
      const roofY = building[3] + building[0];
      minimumClearance = Math.min(minimumClearance,
        elevationAt(gates[0].x, centerZ) + altitude - next.radius * .92 - roofY);
    }
  }
  assert.ok(buildings > 0);
  assert.ok(minimumClearance > 200);
});

test('confirmed guidance uses actual gate, altitude and attempt state', () => {
  const attempt = { attemptId: 'a', gateIndex: 0, status: 'APPROACH' };
  assert.equal(confirmedGateObjective(attempt, journeyDallas12.gates, elevationAt)?.label, 'GATE 1');
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 3 }, journeyDallas12.gates, elevationAt)?.label, 'GATE 4');
  assert.equal(confirmedGateObjective({ ...attempt, status: 'COMPLETED' }, journeyDallas12.gates, elevationAt), null);
  assert.equal(pendulumGateGuidance(1, true, 1_000, 500, 0, 110, false), 'TAKE OFF — FOLLOW THE GOLD ARROW');
  assert.equal(pendulumGateGuidance(3, false, 900, 150, 0, 110, false), 'CLIMB — REACH GATE 3');
  assert.equal(pendulumGateGuidance(4, false, 900, -150, 0, 110, false), 'SWING DOWN — REACH GATE 4');
  assert.equal(pendulumGateGuidance(4, false, 900, 150, 0, 110, false), 'CLIMB — REACH GATE 4');
  assert.equal(pendulumGateGuidance(4, false, 900, -150, 0, 110, true), 'PEAK REACHED — SWING DOWN!');
  assert.equal(pendulumGateGuidance(6, false, 200, 0, 0, 110, false), 'FLY THROUGH GATE 6');
  assert.equal(pendulumGateGuidance(6, false, 900, -150, 0, 110, false), 'FINAL GATE — FINISH STRONG!');
  assert.equal(pendulumGateGuidance(5, false, 900, -150, Math.PI, 110, false), 'FOLLOW THE GOLD ARROW TO GATE 5');
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas12.id, status: 'APPROACH' })?.showAmbientAIAircraft, false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas12.id, status: 'COMPLETED' }), null);
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true);
  assert.equal(excludesFocusedBotInteraction(true, false, false, false), false);
});

test('eligibility, six sequential gates, timeout, first-clear, wallet cap and replay are server-owned', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-pendulum-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0), ('other', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas12.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas11.id, `${pilot}-mission11`, 500, 0);
    fixture.close();
    const expired = store.launch('pilot', 'trainer', 1_000, journeyDallas12.id);
    assert.equal(store.approach('pilot', expired.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('other', expired.attemptId, 0, 2_000), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 1, 2_000), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 0, 2_000)?.deadlineAt, 122_000);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 0, 2_500), undefined);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 1, 122_001), undefined);
    assert.equal(store.fail('pilot', expired.attemptId, 'TIME_UP', 122_001)?.status, 'FAILED');
    const first = store.launch('pilot', 'trainer', 200_000, journeyDallas12.id);
    store.approach('pilot', first.attemptId);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 210_000)?.gateIndex, 1);
    assert.equal(store.acceptGate('pilot', first.attemptId, 2, 211_000), undefined);
    for (let index = 1; index < 6; index++) {
      const state = store.acceptGate('pilot', first.attemptId, index, 210_000 + index * 12_000);
      assert.equal(state?.gateIndex, index + 1);
      assert.equal(state?.status, index === 5 ? 'COMPLETED' : 'RACING');
    }
    assert.equal(store.get('pilot', first.attemptId).firstClearCredits, 1_500);
    assert.equal(store.acceptGate('pilot', first.attemptId, 5, 280_000), undefined);
    const replay = store.launch('pilot', 'trainer', 300_000, journeyDallas12.id);
    store.approach('pilot', replay.attemptId);
    for (let index = 0; index < 6; index++) store.acceptGate('pilot', replay.attemptId, index, 310_000 + index * 10_000);
    assert.equal(store.get('pilot', replay.attemptId).firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 400_000, journeyDallas12.id);
    store.approach('capped', capped.attemptId);
    for (let index = 0; index < 6; index++) store.acceptGate('capped', capped.attemptId, index, 410_000 + index * 10_000);
    assert.equal(store.get('capped', capped.attemptId).firstClearCredits, 50);
    const crashed = store.launch('pilot', 'trainer', 500_000, journeyDallas12.id);
    store.approach('pilot', crashed.attemptId);
    assert.equal(store.fail('pilot', crashed.attemptId, 'CRASHED', 501_000)?.status, 'FAILED');
    assert.equal(store.acceptGate('pilot', crashed.attemptId, 0, 502_000), undefined);
    const retry = store.launch('pilot', 'trainer', 503_000, journeyDallas12.id);
    assert.equal(store.approach('pilot', retry.attemptId)?.gateIndex, 0);
    assert.equal(store.abandon('pilot', retry.attemptId)?.status, 'ABANDONED');
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = 'journey-dallas-12'").get().n, 1);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 1_500);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
