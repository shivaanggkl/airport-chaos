import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06,
  journeyGateCrossing, journeyGatePlane,
} from '../../shared/journey-mission.mjs';
import { DALLAS_WORLD_SCALE as S, scaleDallasPoint } from '../../shared/dallas-world-scale.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { stepCoordinatedBank, throttleSpeedTarget } from '../../shared/flight-control-rules.mjs';
import { generateDallasSkyline } from '../../shared/dallas-skyline.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { JourneyGateSystem } from '../../client/src/journey-gates.ts';

const missions = [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06];
const bluejay = aircraftFlightEnvelope.trainer;
const fastSpeed = throttleSpeedTarget(.8, bluejay);
const terrain = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
const heights = Buffer.from(terrain.elevations, 'base64');

function elevationAt(x, z) {
  x /= S; z /= S;
  const gx = (x - terrain.bounds.minX) / (terrain.bounds.maxX - terrain.bounds.minX) * (terrain.width - 1);
  const gz = (z - terrain.bounds.minZ) / (terrain.bounds.maxZ - terrain.bounds.minZ) * (terrain.height - 1);
  const ix = Math.max(0, Math.min(terrain.width - 2, Math.floor(gx)));
  const iz = Math.max(0, Math.min(terrain.height - 2, Math.floor(gz)));
  const tx = gx - ix, tz = gz - iz;
  const sample = (sx, sz) => terrain.baseElevation + heights.readUInt16LE((sz * terrain.width + sx) * 2) * terrain.scale;
  return ((1 - tz) * ((1 - tx) * sample(ix, iz) + tx * sample(ix + 1, iz)) +
    tz * ((1 - tx) * sample(ix, iz + 1) + tx * sample(ix + 1, iz + 1))) * S;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('the six Golden Gates routes grow in difficulty across Dallas districts', () => {
  const courses = new Set();
  const turnLimits = [55, 60, 60, 75, 80, 80];
  for (const [missionIndex, mission] of missions.entries()) {
    assert.equal(mission.id, `journey-dallas-0${missionIndex + 1}`);
    assert.equal(mission.gates.length, 10);
    assert.ok(mission.timeLimitMs >= 150_000);
    const points = [mission.airborneSpawn, ...mission.gates];
    const legs = points.slice(1).map((point, index) => distance(point, points[index]));
    const length = legs.reduce((sum, leg) => sum + leg, 0);
    assert.ok(missionIndex===0 ? length>=65000&&length<=70000 : missionIndex===1 ? length>=70000&&length<=75000 : missionIndex===2 ? length>=75000&&length<=80000 : length / fastSpeed >= 30 * S && length / fastSpeed <= 42.5 * S, `${mission.name}: Bluejay route length`);
    assert.ok(missionIndex===0 ? legs[0]>=3000&&legs[0]<=4000&&legs.slice(1).every(l=>l>=5000&&l<=9000) : missionIndex<=2 ? legs[0]>=3000&&legs[0]<=4000&&legs.slice(1).every(l=>l>=5000&&l<=9000) : legs.every(leg => leg >= 2_500 * S && leg <= 7_500 * S), `${mission.name}: readable gate spacing`);
    assert.ok(points.every(point => point.x - (point.radius ?? 0) > terrain.bounds.minX * S && point.x + (point.radius ?? 0) < terrain.bounds.maxX * S &&
      point.z - (point.radius ?? 0) > terrain.bounds.minZ * S && point.z + (point.radius ?? 0) < terrain.bounds.maxZ * S), `${mission.name}: inside the Dallas terrain`);
    for (let index = 1; index < points.length - 1; index++) {
      const before = points[index - 1], at = points[index], after = points[index + 1];
      const first = Math.atan2(at.z - before.z, at.x - before.x);
      const second = Math.atan2(after.z - at.z, after.x - at.x);
      assert.ok(Math.abs(angle(first, second)) * 180 / Math.PI < turnLimits[missionIndex],
        `${mission.name}: turn at gate ${index}`);
      assert.ok(Math.abs(at.altitude - before.altitude) / legs[index - 1] < .04,
        `${mission.name}: reachable Bluejay altitude at gate ${index}`);
    }
    courses.add(JSON.stringify(mission.gates.map(gate => [gate.x, gate.z])));
  }
  assert.equal(courses.size, 6);
  const skyline = scaleDallasPoint({ x: -600, z: -450 }), lake = scaleDallasPoint({ x: 5_200, z: -8_500 }), trinity = scaleDallasPoint({ x: -4_100, z: 2_300 });
  const rookieHeading = Math.atan2(-(skyline.x - journeyDallas01.airborneSpawn.x),
    -(skyline.z - journeyDallas01.airborneSpawn.z));
  assert.ok(Math.abs(angle(rookieHeading, journeyDallas01.airborneSpawn.heading)) < Math.PI / 6,
    'Downtown remains inside the forward view while the aircraft faces gate one');
  const firstGate = journeyDallas01.gates[0];
  assert.ok(Math.abs(angle(Math.atan2(-(firstGate.x - journeyDallas01.airborneSpawn.x),
    -(firstGate.z - journeyDallas01.airborneSpawn.z)), journeyDallas01.airborneSpawn.heading)) < 1e-9);
  assert.ok(distance(journeyDallas01.airborneSpawn, scaleDallasPoint({ x: -5_140, z: -7_780 })) < 4_000 * S,
    'Rookie Rush begins close to Love Field');
  assert.ok(journeyDallas01.gates.every(gate => gate.radius >= 300 * S));
  assert.ok(distance(journeyDallas01.gates.at(-1), trinity) < 1_500 * S);
  assert.ok(journeyDallas02.gates.some(gate => distance(gate, lake) < 3_000 * S));
  assert.ok(journeyDallas02.gates.some(gate => gate.x > lake.x), 'Lake Racer reaches the eastern lake approach');
  assert.ok(journeyDallas03.gates[5].altitude < 1_200 * S);
  assert.ok(journeyDallas03.gates.slice(1, 5).every((gate, index) => gate.altitude > journeyDallas03.gates[index].altitude));
  assert.ok(journeyDallas03.gates.slice(5).every((gate, index) => gate.altitude < journeyDallas03.gates[index + 4].altitude));
  assert.ok(journeyDallas03.gates.some(gate => gate.z <= -20_000 * S), 'Golden Ascent reaches North Dallas');
  assert.ok(journeyDallas04.gates[1].x > journeyDallas04.gates[2].x && journeyDallas04.gates[3].x > journeyDallas04.gates[4].x);
  assert.ok(journeyDallas05.gates.some(gate => distance(gate, trinity) < 2_000 * S));
  assert.ok(journeyDallas05.gates.some(gate => gate.x < -18_000 * S), 'Needle Rush reaches West Dallas');
  assert.ok(journeyDallas05.gates[8].radius < journeyDallas04.gates[8].radius);
  assert.ok(journeyDallas06.gates.some(gate => distance(gate, lake) < 3_000 * S));
  assert.ok(journeyDallas06.gates.some(gate => distance(gate, trinity) < 500 * S));
  assert.ok(journeyDallas06.gates.at(-1).radius >= 340 * S);
  assert.ok(journeyDallas06.gates.some(gate => gate.z >= 11_000 * S), 'Golden Championship reaches South Dallas');
  assert.ok(Math.min(...journeyDallas06.gates.map(gate => gate.radius)) <
    Math.min(...journeyDallas05.gates.map(gate => gate.radius)), 'the final race has the narrowest gate');
});

test('normal Bluejay bank steering reaches every gate in order from the authored spawn', () => {
  const dt = .05;
  for (const mission of missions) {
    let { x, z, heading } = mission.airborneSpawn;
    let y = elevationAt(x, z) + mission.airborneSpawn.altitude;
    let roll = 0, gateIndex = 0, elapsed = 0;
    while (elapsed < 120 * S && gateIndex < mission.gates.length) {
      const gate = mission.gates[gateIndex];
      const plane = journeyGatePlane(mission, gateIndex);
      const targetHeading = Math.atan2(-(gate.x - x), -(gate.z - z));
      const input = Math.max(-1, Math.min(1, angle(targetHeading, heading) * 2.5));
      roll = stepCoordinatedBank(roll, input, dt, bluejay);
      heading += Math.sin(roll) * (fastSpeed / bluejay.maxSpeed) * bluejay.bankTurn * dt;
      const from = { x, y, z };
      x -= Math.sin(heading) * fastSpeed * dt;
      z -= Math.cos(heading) * fastSpeed * dt;
      const verticalTarget = elevationAt(gate.x, gate.z) + gate.altitude - y;
      y += Math.max(-fastSpeed * Math.tan(bluejay.maxDivePitch) * dt,
        Math.min(fastSpeed * Math.tan(bluejay.maxClimbPitch) * dt, verticalTarget));
      const to = { x, y, z };
      const signed = point => (point.x - gate.x) * plane.normalX + (point.z - gate.z) * plane.normalZ;
      if (signed(from) < 0 && signed(to) >= 0) {
        assert.equal(journeyGateCrossing(from, to, gateIndex, elevationAt(gate.x, gate.z), mission), 'VALID',
          `${mission.name}: Bluejay missed gate ${gateIndex + 1}`);
        assert.equal(journeyGateCrossing(to, from, gateIndex, elevationAt(gate.x, gate.z), mission), 'VALID',
          `${mission.name}: reverse crossing missed`);
        gateIndex++;
      }
      elapsed += dt;
    }
    assert.equal(gateIndex, 10, `${mission.name}: all gates reached`);
    assert.ok(mission.id===journeyDallas01.id ? elapsed>=30&&elapsed<=160 : mission.id===journeyDallas02.id||mission.id===journeyDallas03.id ? elapsed<=mission.timeLimitMs/1000-20 : elapsed >= 30 * S && elapsed <= 45 * S, `${mission.name}: ${elapsed.toFixed(1)}s Bluejay run`);
  }
});

test('the authoritative mission store advances all ten correctly crossed gates on every Golden Gates route', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-golden-gates-integration-'));
  const databasePath = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL)');
  for (const [index] of missions.entries())
    database.prepare('INSERT INTO player_profiles VALUES (?, 0, 0)').run(`pilot-${index}`);
  database.close();
  try {
    const store = new JourneyAttemptStore(databasePath, true);
    for (const [missionIndex, mission] of missions.entries()) {
      const pilotId = `pilot-${missionIndex}`;
      const attempt = store.launch(pilotId, 'trainer', 1_000, mission.id);
      assert.equal(store.approach(pilotId, attempt.attemptId, 1_100)?.status, 'APPROACH');
      assert.equal(store.acceptGate(pilotId, attempt.attemptId, 0, 1_200), undefined,
        `${mission.name}: gate one cannot clear before the race starts`);
      assert.equal(store.startRookieRush(pilotId, attempt.attemptId, 2_000)?.status, 'RACING');
      for (const [gateIndex, gate] of mission.gates.entries()) {
        const plane = journeyGatePlane(mission, gateIndex);
        const center = { x: gate.x, y: elevationAt(gate.x, gate.z) + gate.altitude, z: gate.z };
        const before = { x: center.x - plane.normalX * 60, y: center.y, z: center.z - plane.normalZ * 60 };
        const after = { x: center.x + plane.normalX * 60, y: center.y, z: center.z + plane.normalZ * 60 };
        const entry = gateIndex % 2 === 0 ? before : after;
        const exit = gateIndex % 2 === 0 ? after : before;
        assert.equal(journeyGateCrossing(entry, exit, gateIndex, elevationAt(gate.x, gate.z), mission), 'VALID',
          `${mission.name}: gate ${gateIndex + 1} crosses the displayed opening`);
        assert.equal(store.acceptGate(pilotId, attempt.attemptId, gateIndex + 1, 3_000 + gateIndex * 7_000), undefined,
          `${mission.name}: a future gate cannot clear early`);
        const advanced = store.acceptGate(pilotId, attempt.attemptId, gateIndex, 3_000 + gateIndex * 7_000);
        assert.equal(advanced?.gateIndex, gateIndex + 1, `${mission.name}: gate ${gateIndex + 1} advances`);
        assert.equal(advanced?.status, gateIndex === 9 ? 'COMPLETED' : 'RACING');
      }
      assert.equal(store.get(pilotId, attempt.attemptId)?.firstClearCredits, mission.firstClearCredits);
      assert.equal(store.progress(pilotId, mission.id).completed, true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all 60 rendered gates match their authoritative crossing centers and directions', () => {
  for (const mission of missions) {
    const scene = new THREE.Scene();
    const rendered = new JourneyGateSystem(scene, elevationAt, mission);
    assert.equal(scene.children.length, 10, `${mission.name}: rendered gate count`);
    for (const [gateIndex, gate] of mission.gates.entries()) {
      const group = scene.children[gateIndex];
      const plane = journeyGatePlane(mission, gateIndex);
      const facing = group.getWorldDirection(new THREE.Vector3());
      assert.equal(group.position.x, gate.x);
      assert.equal(group.position.y, elevationAt(gate.x, gate.z) + gate.altitude);
      assert.equal(group.position.z, gate.z);
      assert.equal(group.scale.x, gate.radius);
      assert.ok(facing.x * plane.normalX + facing.z * plane.normalZ > .999,
        `${mission.name}: gate ${gateIndex + 1} faces the server-accepted direction`);
    }
    rendered.dispose();
    assert.equal(scene.children.length, 0);
  }
});

test('all six centerline corridors and full gate openings clear mapped buildings and terrain', () => {
  const blocks = new Map();
  const add = block => {
    const key = `${Math.floor(block.x / (2_000 * S))},${Math.floor(block.z / (2_000 * S))}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(block);
  };
  const near = new URL('../../client/public/data/dallas/near/', import.meta.url);
  for (const file of readdirSync(near)) {
    const cell = /^(-?\d+)_(-?\d+)\.json$/.exec(file);
    if (!cell) continue;
    for (const building of JSON.parse(readFileSync(new URL(file, near), 'utf8')).b) {
      if (building.length < 10) continue;
      const xs = building.slice(4).filter((_, index) => index % 2 === 0);
      const zs = building.slice(5).filter((_, index) => index % 2 === 0);
      const minX = Math.min(...xs) * S, maxX = Math.max(...xs) * S, minZ = Math.min(...zs) * S, maxZ = Math.max(...zs) * S;
      add({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
        radius: Math.hypot(maxX - minX, maxZ - minZ) / 2, top: (building[0] + building[3]) * S });
    }
  }
  for (const building of generateDallasSkyline(cityAirports.dallas.map(a => ({ ...a, x: a.x / S, z: a.z / S, runwayWidth: a.runwayWidth / S, runwayLength: a.runwayLength / S })), []))
    add({ x: building.x * S, z: building.z * S, radius: Math.hypot(building.width, building.depth) * S / 2,
      top: elevationAt(building.x * S, building.z * S) + (building.height + 24) * S });

  for (const mission of missions) {
    let minimumGround = Infinity, minimumRoof = Infinity;
    const points = [mission.airborneSpawn, ...mission.gates];
    for (let legIndex = 1; legIndex < points.length; legIndex++) {
      const from = points[legIndex - 1], to = points[legIndex];
      const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
      const fromY = elevationAt(from.x, from.z) + from.altitude;
      const toY = elevationAt(to.x, to.z) + to.altitude;
      const steps = Math.ceil(length / 125);
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, x = from.x + dx * t, z = from.z + dz * t;
        const y = fromY + (toY - fromY) * t, opening = to.radius * .92;
        for (const side of [-180, 0, 180])
          minimumGround = Math.min(minimumGround, y - elevationAt(x - dz / length * side, z + dx / length * side) - opening);
        const cellX = Math.floor(x / (2_000 * S)), cellZ = Math.floor(z / (2_000 * S));
        for (let cx = cellX - 1; cx <= cellX + 1; cx++) for (let cz = cellZ - 1; cz <= cellZ + 1; cz++)
          for (const building of blocks.get(`${cx},${cz}`) ?? []) {
            if (Math.hypot(building.x - x, building.z - z) - building.radius > 180) continue;
            minimumRoof = Math.min(minimumRoof, y - building.top - opening);
          }
      }
    }
    assert.ok(minimumGround > 200 * S, `${mission.name}: terrain aperture clearance ${minimumGround.toFixed(0)} m`);
    assert.ok(minimumRoof > 200 * S, `${mission.name}: roof aperture clearance ${minimumRoof.toFixed(0)} m`);
  }
});
