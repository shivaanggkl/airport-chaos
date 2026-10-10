import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas12, journeyDallas13, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { redlineGateGuidance, confirmedGateObjective } from '../../client/src/objective-guidance.js';
import { emitConfirmedJourneyFeedback } from '../../client/src/haptics-manager.js';
import { SpeedGateTracker } from './speed-gate-validation.js';
import { validateClientTransform } from './transform-validation.js';
import { JourneyAttemptStore } from './journey-attempts.js';

const terrain = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
const bytes = Buffer.from(terrain.elevations, 'base64');
const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
function elevationAt(x, z) {
  const gx = Math.max(0, Math.min(1, (x - terrain.bounds.minX) / (terrain.bounds.maxX - terrain.bounds.minX))) * (terrain.width - 1);
  const gz = Math.max(0, Math.min(1, (z - terrain.bounds.minZ) / (terrain.bounds.maxZ - terrain.bounds.minZ))) * (terrain.height - 1);
  const x0 = Math.floor(gx), z0 = Math.floor(gz), x1 = Math.min(x0 + 1, terrain.width - 1), z1 = Math.min(z0 + 1, terrain.height - 1);
  const sample = (sx, sz) => terrain.baseElevation + samples[sz * terrain.width + sx] * terrain.scale;
  return (sample(x0, z0) * (1 - gx + x0) + sample(x1, z0) * (gx - x0)) * (1 - gz + z0) +
    (sample(x0, z1) * (1 - gx + x0) + sample(x1, z1) * (gx - x0)) * (gz - z0);
}

test('Redline course has five forward, wide gates and a safe northbound corridor', () => {
  const mission = journeyDallas13;
  assert.equal(mission.gates.length, 5);
  assert.equal(mission.timeLimitMs, 90_000);
  assert.equal(mission.firstClearCredits, 1_650);
  assert.equal(mission.startAirportId, 'love');
  const love = cityAirports.dallas.find(airport => airport.id === 'love');
  assert.ok(mission.gates[0].z < love.z - love.runwayLength / 2);
  let route = 0;
  for (let index = 0; index < mission.gates.length; index++) {
    const gate = mission.gates[index];
    assert.ok(gate.radius > 110);
    assert.ok(gate.altitude >= 400 && gate.altitude <= 600);
    const y = elevationAt(gate.x, gate.z) + gate.altitude;
    const before = { x: gate.x, y, z: gate.z + 150 };
    const after = { ...before, z: gate.z - 150 };
    assert.equal(journeyGateCrossing(before, after, index, elevationAt(gate.x, gate.z), mission), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, elevationAt(gate.x, gate.z), mission), false);
    assert.equal(journeyGateCrossing({ ...before, x: before.x + gate.radius }, { ...after, x: after.x + gate.radius }, index, elevationAt(gate.x, gate.z), mission), false);
    if (index) {
      const previous = mission.gates[index - 1];
      const leg = Math.hypot(gate.x - previous.x, gate.z - previous.z);
      route += leg;
      assert.ok(leg > 1_000 && leg < 1_700);
    }
  }
  assert.ok(route >= 4_000 && route <= 5_000);
  let minimumRoofClearance = Infinity;
  let nearbyBuildings = 0;
  for (let x = -3; x <= -2; x++) for (let z = -8; z <= -5; z++) {
    const path = new URL(`../../client/public/data/dallas/near/${x}_${z}.json`, import.meta.url);
    if (!existsSync(path)) continue;
    for (const building of JSON.parse(readFileSync(path, 'utf8')).b) {
      const xs = building.slice(4).filter((_, index) => index % 2 === 0);
      const zs = building.slice(4).filter((_, index) => index % 2 === 1);
      if (!xs.length || Math.max(...xs) < -5_600 || Math.min(...xs) > -4_800 ||
        Math.max(...zs) < -15_700 || Math.min(...zs) > -10_200) continue;
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      for (let index = 1; index < mission.gates.length; index++) {
        const from = mission.gates[index - 1], to = mission.gates[index];
        const dx = to.x - from.x, dz = to.z - from.z;
        const fraction = Math.max(0, Math.min(1, ((centerX - from.x) * dx + (centerZ - from.z) * dz) / (dx * dx + dz * dz)));
        const pathX = from.x + fraction * dx, pathZ = from.z + fraction * dz;
        if (Math.hypot(centerX - pathX, centerZ - pathZ) > 300) continue;
        nearbyBuildings++;
        const altitude = from.altitude + fraction * (to.altitude - from.altitude);
        minimumRoofClearance = Math.min(minimumRoofClearance,
          elevationAt(pathX, pathZ) + altitude - to.radius * .92 - building[3] - building[0]);
      }
    }
  }
  assert.ok(nearbyBuildings > 0);
  assert.ok(minimumRoofClearance > 200);
  assert.equal(confirmedGateObjective({ attemptId: 'a', status: 'RACING', gateIndex: 3 }, mission.gates, elevationAt)?.label, 'GATE 4');
  assert.equal(confirmedGateObjective({ attemptId: 'a', status: 'COMPLETED', gateIndex: 5 }, mission.gates, elevationAt), null);
});

test('speed thresholds are about 75% of sustainable FAST cruise for every eligible aircraft', () => {
  for (const [type, envelope] of Object.entries(aircraftFlightEnvelope)) {
    assert.ok(Math.abs(journeyDallas13.speedThresholds[type] - envelope.maxSpeed * .85 * .75) <= 5);
    assert.ok(journeyDallas13.speedThresholds[type] < envelope.maxSpeed);
  }
  assert.equal(journeyDallas13.speedThresholds.trainer, 640);
  assert.equal(redlineGateGuidance(1, true, 0, false, false, false), 'TAKE OFF — FOLLOW THE GOLD ARROW');
  assert.equal(redlineGateGuidance(2, false, 400, false, false, false), 'SPEED UP — INCREASE THROTTLE');
  assert.equal(redlineGateGuidance(2, false, 400, true, true, false), 'TOO SLOW — TRY GATE 2 AGAIN');
  assert.equal(redlineGateGuidance(2, false, 400, true, false, false), 'SPEED READY — FLY THROUGH GATE 2');
  assert.equal(redlineGateGuidance(5, false, 400, true, false, false), 'FINAL SPEED GATE — GO!');
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas13.id, status: 'RACING' })?.showAmbientAIAircraft, false);
});

test('sustained accepted movement qualifies, isolated spikes and invalid displacement do not', () => {
  const tracker = new SpeedGateTracker();
  const envelope = aircraftFlightEnvelope.trainer;
  let speed = null;
  for (let i = 0; i <= 4; i++) speed = tracker.record('pilot', 'attempt-a', { x: 0, y: 600, z: -75 * i }, i * 100);
  assert.equal(speed, 750);
  assert.equal(tracker.record('pilot', 'attempt-b', { x: 0, y: 600, z: -375 }, 500), null);
  tracker.clear('pilot');
  assert.equal(tracker.record('pilot', 'attempt-b', { x: 0, y: 600, z: -375 }, 600), null);
  const impossible = validateClientTransform({ x: 0, y: 600, z: 0 }, { x: 0, y: 600, z: -300 }, 100, envelope);
  assert.equal(impossible.accepted, false);
  const slow = new SpeedGateTracker();
  for (let i = 0; i <= 4; i++) speed = slow.record('pilot', 'attempt-c', { x: 0, y: 600, z: -60 * i }, i * 100);
  assert.equal(speed, 600);
});

test('Mission 12 unlocks Redline; slow, skipped, stale and replay gates cannot pay twice', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-redline-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas13.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas12.id, `${pilot}-mission12`, 500, 0);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas13.id);
    assert.equal(store.approach('pilot', first.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 2_000, 1_000), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 2_000)?.deadlineAt, 92_000);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 3_000), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 4_000), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 4_000, 639), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 4_000, 640)?.gateIndex, 2);
    assert.equal(store.acceptGate('pilot', first.attemptId, 3, 5_000, 900), undefined);
    for (let gate = 2; gate < 5; gate++) assert.equal(store.acceptGate('pilot', first.attemptId, gate, 4_000 + gate * 2_000, 800)?.gateIndex, gate + 1);
    assert.equal(store.get('pilot', first.attemptId)?.status, 'COMPLETED');
    assert.equal(store.get('pilot', first.attemptId)?.firstClearCredits, 1_650);
    assert.equal(store.acceptGate('pilot', first.attemptId, 4, 20_000, 900), undefined);
    const replay = store.launch('pilot', 'trainer', 30_000, journeyDallas13.id);
    store.approach('pilot', replay.attemptId);
    for (let gate = 0; gate < 5; gate++) store.acceptGate('pilot', replay.attemptId, gate, 32_000 + gate * 2_000, gate ? 800 : undefined);
    assert.equal(store.get('pilot', replay.attemptId)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 50_000, journeyDallas13.id);
    store.approach('capped', capped.attemptId);
    for (let gate = 0; gate < 5; gate++) store.acceptGate('capped', capped.attemptId, gate, 52_000 + gate * 2_000, gate ? 800 : undefined);
    assert.equal(store.get('capped', capped.attemptId)?.firstClearCredits, 50);
    const timeout = store.launch('pilot', 'trainer', 100_000, journeyDallas13.id);
    store.approach('pilot', timeout.attemptId);
    assert.equal(store.acceptGate('pilot', timeout.attemptId, 0, 101_000)?.deadlineAt, 191_000);
    assert.equal(store.acceptGate('pilot', timeout.attemptId, 1, 191_001, 900), undefined);
    assert.equal(store.fail('pilot', timeout.attemptId, 'TIME_UP', 191_001)?.status, 'FAILED');
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id = 'pilot' AND reference_id = 'journey-dallas-13'").get().n, 1);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 1_650);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('checkpoint haptics occur for Gates 1–4 and one victory for Gate 5', () => {
  const events = [];
  const manager = { emit(event) { events.push(event); } };
  let previous = { attemptId: 'redline', missionId: journeyDallas13.id, status: 'APPROACH', gateIndex: 0 };
  for (let gateIndex = 1; gateIndex <= 4; gateIndex++) {
    const next = { ...previous, status: 'RACING', gateIndex };
    emitConfirmedJourneyFeedback(manager, previous, next);
    previous = next;
  }
  emitConfirmedJourneyFeedback(manager, previous, { ...previous, status: 'COMPLETED', gateIndex: 5 });
  assert.deepEqual(events, ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'missionSuccess']);
});
