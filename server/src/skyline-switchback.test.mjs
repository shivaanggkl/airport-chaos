import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas19, journeyDallas20, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { generateDallasSkyline } from '../../shared/dallas-skyline.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { switchbackGateGuidance } from '../../client/src/objective-guidance.js';
import { JourneyAttemptStore } from './journey-attempts.js';

const terrain = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
const bytes = Buffer.from(terrain.elevations, 'base64');
function elevationAt(x, z) {
  const gx = (x - terrain.bounds.minX) / (terrain.bounds.maxX - terrain.bounds.minX) * (terrain.width - 1);
  const gz = (z - terrain.bounds.minZ) / (terrain.bounds.maxZ - terrain.bounds.minZ) * (terrain.height - 1);
  const x0 = Math.floor(gx), z0 = Math.floor(gz), tx = gx - x0, tz = gz - z0;
  const sample = (ix, iz) => terrain.baseElevation + bytes.readUInt16LE((iz * terrain.width + ix) * 2) * terrain.scale;
  return (1 - tz) * ((1 - tx) * sample(x0, z0) + tx * sample(x0 + 1, z0)) +
    tz * ((1 - tx) * sample(x0, z0 + 1) + tx * sample(x0 + 1, z0 + 1));
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-switchback-test-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999900,0)");
  db.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}

test('six high/low gates have 3D faces matching the swept server opening', () => {
  const gates = journeyDallas20.gates;
  assert.equal(gates.length, 6);
  assert.deepEqual(gates.map(gate => gate.altitude), [560, 390, 560, 390, 560, 390]);
  assert.equal(journeyDallas20.startAirportId, 'love');
  assert.equal(journeyDallas20.timeLimitMs, 110_000);
  let distance = 0;
  for (const [index, gate] of gates.entries()) {
    assert.equal(gate.radius, 90);
    assert.ok(Math.abs(Math.hypot(gate.normalX, gate.normalY, gate.normalZ) - 1) < 0.0001);
    const y = elevationAt(gate.x, gate.z) + gate.altitude;
    // A 12-unit sample spans a normal 16 ms update at 750 world units/second.
    const before = { x: gate.x - gate.normalX * 6, y: y - gate.normalY * 6, z: gate.z - gate.normalZ * 6 };
    const after = { x: gate.x + gate.normalX * 6, y: y + gate.normalY * 6, z: gate.z + gate.normalZ * 6 };
    const elevation = elevationAt(gate.x, gate.z);
    assert.equal(journeyGateCrossing(before, after, index, elevation, journeyDallas20), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, elevation, journeyDallas20), false);
    assert.equal(journeyGateCrossing({ ...before, y: before.y + 90 }, { ...after, y: after.y + 90 }, index, elevation, journeyDallas20), false);
    if (index) {
      const previous = gates[index - 1];
      const horizontal = Math.hypot(gate.x - previous.x, gate.z - previous.z);
      distance += horizontal;
      assert.ok(horizontal >= 1_200 && horizontal <= 1_600);
      const rise = y - elevationAt(previous.x, previous.z) - previous.altitude;
      const pitch = Math.atan2(rise, horizontal);
      assert.ok(index % 2 ? pitch < 0 : pitch > 0);
      assert.ok(Math.abs(pitch) < Math.min(aircraftFlightEnvelope.trainer.maxClimbPitch, aircraftFlightEnvelope.trainer.maxDivePitch));
    }
  }
  assert.ok(distance > 7_200 && distance < 7_500);
  assert.ok(missionFocusForAttempt({ missionId: journeyDallas20.id, status: 'APPROACH' }));
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas20.id, status: 'COMPLETED' }), null);
});

test('the full timed corridor clears Dallas terrain and building collision bounds', () => {
  const blocks = [];
  const near = new URL('../../client/public/data/dallas/near/', import.meta.url);
  for (const file of readdirSync(near)) {
    const chunk = JSON.parse(readFileSync(new URL(file, near), 'utf8'));
    for (const building of chunk.b) {
      if (building.length < 10) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 4; i < building.length; i += 2) {
        minX = Math.min(minX, building[i]); maxX = Math.max(maxX, building[i]);
        minZ = Math.min(minZ, building[i + 1]); maxZ = Math.max(maxZ, building[i + 1]);
      }
      blocks.push({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
        radius: Math.hypot(maxX - minX, maxZ - minZ) / 2, top: building[3] + building[0] });
    }
  }
  for (const building of generateDallasSkyline(cityAirports.dallas, [])) {
    blocks.push({ x: building.x, z: building.z, radius: Math.hypot(building.width, building.depth) / 2,
      top: elevationAt(building.x, building.z) + building.height + 24 });
  }
  let minimumGround = Infinity, minimumRoof = Infinity;
  const gates = journeyDallas20.gates;
  for (let i = 1; i < gates.length; i++) {
    const from = gates[i - 1], to = gates[i];
    const dx = to.x - from.x, dz = to.z - from.z, horizontal = Math.hypot(dx, dz);
    const fromY = elevationAt(from.x, from.z) + from.altitude;
    const toY = elevationAt(to.x, to.z) + to.altitude;
    for (let step = 0; step <= 120; step++) {
      const t = step / 120, x = from.x + dx * t, z = from.z + dz * t, y = fromY + (toY - fromY) * t;
      for (const side of [-180, 0, 180]) {
        minimumGround = Math.min(minimumGround,
          y - elevationAt(x - dz / horizontal * side, z + dx / horizontal * side) - to.radius * .92);
      }
    }
    for (const block of blocks) {
      const t = Math.max(0, Math.min(1, ((block.x - from.x) * dx + (block.z - from.z) * dz) / (horizontal * horizontal)));
      const lateral = Math.hypot(block.x - from.x - t * dx, block.z - from.z - t * dz) - block.radius;
      if (lateral > 180) continue;
      minimumRoof = Math.min(minimumRoof, fromY + (toY - fromY) * t - block.top - to.radius * .92);
    }
  }
  assert.ok(minimumGround > 200, `terrain clearance ${minimumGround.toFixed(1)} m`);
  assert.ok(minimumRoof > 200, `building clearance ${minimumRoof.toFixed(1)} m`);
});

test('Mission 19 unlock, sequential deadline, first-clear reward, replay and wallet cap', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas20.id), /locked/);
    const db = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas19.id, `${pilot}-m19`, 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas20.id);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 1_100), undefined);
    assert.equal(store.approach('pilot', first.attemptId, 1_100)?.deadlineAt, null);
    assert.equal(store.acceptGate('pilot', first.attemptId, 1, 2_000), undefined);
    assert.equal(store.acceptGate('capped', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 2_000)?.deadlineAt, 112_000);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 2_100), undefined);
    assert.equal(store.acceptGate('pilot', first.attemptId, 2, 3_000), undefined);
    for (let gate = 1; gate < 6; gate++) {
      const state = store.acceptGate('pilot', first.attemptId, gate, 2_000 + gate * 2_000);
      assert.equal(state?.gateIndex, gate + 1);
      if (gate < 5) assert.equal(state?.deadlineAt, 112_000);
    }
    const completed = store.get('pilot', first.attemptId);
    assert.equal(completed?.status, 'COMPLETED');
    assert.equal(completed?.firstClearCredits, 2_700);
    assert.equal(store.acceptGate('pilot', first.attemptId, 5, 20_000), undefined);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2_700);
    const replay = store.launch('pilot', 'trainer', 30_000, journeyDallas20.id);
    store.approach('pilot', replay.attemptId, 30_100);
    for (let gate = 0; gate < 6; gate++) store.acceptGate('pilot', replay.attemptId, gate, 31_000 + gate * 2_000);
    assert.equal(store.get('pilot', replay.attemptId)?.firstClearCredits, 0);
    const expired = store.launch('pilot', 'trainer', 50_000, journeyDallas20.id);
    store.approach('pilot', expired.attemptId, 50_100);
    store.acceptGate('pilot', expired.attemptId, 0, 51_000);
    for (let gate = 1; gate < 5; gate++) store.acceptGate('pilot', expired.attemptId, gate, 51_000 + gate * 2_000);
    assert.equal(store.acceptGate('pilot', expired.attemptId, 5, 161_000), undefined);
    const capped = store.launch('capped', 'trainer', 200_000, journeyDallas20.id);
    store.approach('capped', capped.attemptId, 200_100);
    for (let gate = 0; gate < 6; gate++) store.acceptGate('capped', capped.attemptId, gate, 201_000 + gate * 2_000);
    assert.equal(store.get('capped', capped.attemptId)?.firstClearCredits, 100);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get().credits, 1_000_000);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id='journey-dallas-20'").get().count, 2);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('guidance corrects vertical overshoot with hysteresis', () => {
  assert.equal(switchbackGateGuidance(2, false, 500, -150, 0, 90, 'ALIGNED', false).instruction, 'DESCEND — REACH GATE 2');
  assert.equal(switchbackGateGuidance(2, false, 500, 150, 0, 90, 'DESCEND', false).instruction, 'CLIMB — REACH GATE 2');
  assert.equal(switchbackGateGuidance(6, false, 500, -150, 0, 90, 'ALIGNED', false).instruction, 'FINAL DESCENT — REACH GATE 6');
  assert.equal(switchbackGateGuidance(6, true, 500, -150, 0, 90, 'ALIGNED', false).instruction, 'TAKE OFF — FOLLOW THE GOLD ARROW');
});
