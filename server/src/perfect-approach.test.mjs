import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas21, journeyDallas22, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { landingGradeForScore, landingPrecisionScore } from '../../shared/landing-scoring.mjs';
import { isPerfectLandingGrade } from '../../shared/gameplay-cinematic-rules.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { observedChampionshipTouchdown } from './championship-landing.js';
import { JourneyAttemptStore } from './journey-attempts.js';

test('Perfect Approach requires Mission 21, three fresh gates and a qualifying server grade', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-perfect-approach-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999950,0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('pilot', 'trainer', 1000, journeyDallas22.id), /locked/);
    const fixture = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas21.id, `m21-${pilot}`, 500, 60_000);
    fixture.close();
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas22.id);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 0, 2_000), undefined);
    const start = store.approach('pilot', first.attemptId, 3_000);
    assert.equal(start.prepareUntil, 6_000);
    assert.equal(start.gateIndex, 0);
    assert.equal(start.deadlineAt, null);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 0, 5_999), undefined);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 1, 6_100), undefined);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'dfw', 900, 0, 6_200)?.gateIndex, 0);
    assert.equal(store.get('pilot', first.attemptId)?.approachCycle, 1);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 0, 7_000)?.gateIndex, 1);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 0, 7_100), undefined);
    assert.equal(store.acceptPerfectApproachGate('other', first.attemptId, 1, 7_500), undefined);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 2, 7_500), undefined);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 1, 7_500)?.gateIndex, 2);
    assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, 2, 8_000)?.gateIndex, 3);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'dfw', 900, 0, 9_000), undefined);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'love', 900, 1, 9_000)?.gateIndex, 0);
    assert.equal(store.get('pilot', first.attemptId)?.status, 'APPROACH');
    for (const [index, at] of [10_000, 10_500, 11_000].entries())
      assert.equal(store.acceptPerfectApproachGate('pilot', first.attemptId, index, at)?.gateIndex, index + 1);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'dfw', 819, 2, 12_000)?.landingGrade, 'SMOOTH');
    assert.equal(store.get('pilot', first.attemptId)?.gateIndex, 0);
    assert.equal(store.get('pilot', first.attemptId)?.approachCycle, 3);
    assert.equal(store.get('pilot', first.attemptId)?.status, 'APPROACH');
    for (const [index, at] of [13_000, 13_500, 14_000].entries()) store.acceptPerfectApproachGate('pilot', first.attemptId, index, at);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'dfw', 820, 3, 15_000)?.status, 'COMPLETED');
    assert.equal(store.get('pilot', first.attemptId)?.firstClearCredits, 3_000);
    assert.equal(store.recordPerfectApproachLanding('pilot', first.attemptId, 'dfw', 940, 3, 15_100), undefined);
    const replay = store.launch('pilot', 'trainer', 16_000, journeyDallas22.id);
    store.approach('pilot', replay.attemptId, 16_100);
    for (const [index, at] of [20_000, 20_500, 21_000].entries()) store.acceptPerfectApproachGate('pilot', replay.attemptId, index, at);
    assert.equal(store.recordPerfectApproachLanding('pilot', replay.attemptId, 'dfw', 940, 0, 22_000)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 23_000, journeyDallas22.id);
    store.approach('capped', capped.attemptId, 23_100);
    for (const [index, at] of [27_000, 27_500, 28_000].entries()) store.acceptPerfectApproachGate('capped', capped.attemptId, index, at);
    assert.equal(store.recordPerfectApproachLanding('capped', capped.attemptId, 'dfw', 900, 0, 29_000)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 3_000);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get().credits, 1_000_000);
    assert.equal(check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id='journey-dallas-22'").get().count, 2);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Approach gates face the actual DFW runway and the scorer preserves PERFECT and LEGENDARY tiers', () => {
  const mission = journeyDallas22;
  const dfw = cityAirports.dallas.find(airport => airport.id === mission.finishAirportId);
  assert.ok(dfw);
  assert.equal(mission.gates.length, 3);
  assert.deepEqual(mission.gates.map(gate => gate.radius), [180, 125, 80]);
  assert.ok(mission.gates.every(gate => gate.x === dfw.x && gate.normalZ > 0));
  assert.ok(mission.airborneSpawn.z < mission.gates[0].z && mission.gates[2].z < dfw.z - dfw.runwayLength / 2);
  const spawn = authorizedJourneyAirborneSpawn({ missionId: mission.id, status: 'APPROACH' }, mission, () => 176);
  assert.deepEqual(spawn.position, { x: dfw.x, y: 701, z: -23_800 });
  for (let index = 0; index < mission.gates.length; index++) {
    const gate = mission.gates[index];
    const y = 170 + gate.altitude;
    assert.equal(journeyGateCrossing({ x: gate.x, y, z: gate.z - 20 }, { x: gate.x, y, z: gate.z + 20 }, index, 170, mission), 'VALID');
    assert.equal(journeyGateCrossing({ x: gate.x, y, z: gate.z + 20 }, { x: gate.x, y, z: gate.z - 20 }, index, 170, mission), false);
    assert.equal(journeyGateCrossing({ x: gate.x + gate.radius, y, z: gate.z - 20 }, { x: gate.x + gate.radius, y, z: gate.z + 20 }, index, 170, mission), false);
  }
  const plane = aircraftFlightEnvelope.trainer;
  const envelope = { speed: plane.safeLandingSpeed, descent: plane.safeDescentRate, tilt: plane.landingTilt };
  const runwayY = 175 + aircraftGroundOffset;
  const current = { x: dfw.x, y: runwayY, z: dfw.z - 1_100 };
  const touchdown = observedChampionshipTouchdown({ ...current, y: runwayY + .8 }, current,
    { x: 0, y: -5, z: 52 }, { x: 0, y: Math.PI, z: 0 }, dfw, runwayY, envelope);
  assert.ok(touchdown);
  assert.equal(landingGradeForScore(landingPrecisionScore(touchdown, envelope)), 'PERFECT');
  assert.equal(isPerfectLandingGrade('LEGENDARY'), true);
  assert.equal(observedChampionshipTouchdown(current, current, { x: 0, y: -5, z: 52 }, { x: 0, y: Math.PI, z: 0 }, dfw, runwayY, envelope), null);
});

test('DFW corridor stays in Dallas terrain bounds with a flyable Bluejay descent and clear OSM path', () => {
  const terrain = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
  // Decode through DataView because Buffer may have a nonzero byte offset.
  const bytes = Buffer.from(terrain.elevations, 'base64');
  const value = (x, z) => terrain.baseElevation + bytes.readUInt16LE((z * terrain.width + x) * 2) * terrain.scale;
  const lerp = (a, b, t) => a + (b - a) * t;
  const elevationAt = (worldX, worldZ) => {
    const x = (worldX - terrain.bounds.minX) / (terrain.bounds.maxX - terrain.bounds.minX) * (terrain.width - 1);
    const z = (worldZ - terrain.bounds.minZ) / (terrain.bounds.maxZ - terrain.bounds.minZ) * (terrain.height - 1);
    const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(x0 + 1, terrain.width - 1), z1 = Math.min(z0 + 1, terrain.height - 1);
    return lerp(lerp(value(x0, z0), value(x1, z0), x - x0), lerp(value(x0, z1), value(x1, z1), x - x0), z - z0);
  };
  const points = [journeyDallas22.airborneSpawn, ...journeyDallas22.gates];
  for (const point of points) {
    assert.ok(point.x > terrain.bounds.minX + 500 && point.x < terrain.bounds.maxX - 500);
    assert.ok(point.z > terrain.bounds.minZ + 500 && point.z < terrain.bounds.maxZ - 500);
  }
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1], next = points[index];
    const horizontal = Math.hypot(next.x - previous.x, next.z - previous.z);
    const drop = elevationAt(previous.x, previous.z) + previous.altitude - elevationAt(next.x, next.z) - next.altitude;
    assert.ok(horizontal >= 1_300 && horizontal <= 2_100);
    assert.ok(drop > 0 && Math.atan2(drop, horizontal) < aircraftFlightEnvelope.trainer.maxDivePitch);
    for (let step = 0; step <= 20; step++) {
      const fraction = step / 20, z = lerp(previous.z, next.z, fraction);
      const worldY = lerp(elevationAt(previous.x, previous.z) + previous.altitude,
        elevationAt(next.x, next.z) + next.altitude, fraction);
      assert.ok(worldY - elevationAt(previous.x, z) > 200);
    }
  }
  const osm = JSON.parse(readFileSync(new URL('../../client/src/data/city1-osm.json', import.meta.url), 'utf8'));
  const corridorBuildings = osm.chunks.flatMap(chunk => chunk.b).filter(building => {
    const coordinates = building.slice(osm.v >= 3 ? 4 : 2);
    const xs = coordinates.filter((_, index) => index % 2 === 0);
    const zs = coordinates.filter((_, index) => index % 2 === 1);
    return Math.max(...xs) >= -22_980 && Math.min(...xs) <= -22_620 &&
      Math.max(...zs) >= journeyDallas22.airborneSpawn.z && Math.min(...zs) <= -15_650;
  });
  assert.equal(corridorBuildings.length, 0);
});
