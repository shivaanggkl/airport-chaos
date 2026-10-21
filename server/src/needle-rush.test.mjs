import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { journeyDallas05 } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { generateDallasSkyline } from '../../shared/dallas-skyline.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import * as THREE from 'three';
import { JourneyGateSystem } from '../../client/src/journey-gates.js';

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

test('Needle Rush stays near the Trinity and fits a normal Bluejay run', () => {
  const course = [journeyDallas05.airborneSpawn, ...journeyDallas05.gates];
  assert.ok(journeyDallas05.gates.some(gate => Math.hypot(gate.x + 4_100, gate.z - 2_300) < 2_000),
    'the race passes the actual Trinity River corridor');
  let centerline = 0;
  for (let i = 1; i < course.length; i++) {
    const from = course[i - 1], to = course[i];
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    centerline += distance;
    assert.ok(Math.abs(to.x) + to.radius < 25_000 && Math.abs(to.z) + to.radius < 25_000);
  }
  assert.ok(centerline > 40_000 && centerline < 50_000);
  assert.ok(centerline / (aircraftFlightEnvelope.trainer.maxSpeed * .8) < 80);
});

test('Needle Rush corridor clears Dallas terrain and mapped buildings', () => {
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
  const course = [journeyDallas05.airborneSpawn, ...journeyDallas05.gates];
  for (let i = 1; i < course.length; i++) {
    const from = course[i - 1], to = course[i];
    const dx = to.x - from.x, dz = to.z - from.z, horizontal = Math.hypot(dx, dz);
    const fromY = elevationAt(from.x, from.z) + from.altitude;
    const toY = elevationAt(to.x, to.z) + to.altitude;
    for (let step = 0; step <= 100; step++) {
      const t = step / 100, x = from.x + dx * t, z = from.z + dz * t, y = fromY + (toY - fromY) * t;
      for (const side of [-180, 0, 180])
        minimumGround = Math.min(minimumGround, y - elevationAt(x - dz / horizontal * side, z + dx / horizontal * side) - to.radius * .92);
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
  console.log(`Needle Rush clearance: terrain ${minimumGround.toFixed(1)} m; mapped buildings ${minimumRoof.toFixed(1)} m`);
});

test('Needle Rush uses the existing golden ring aperture and releases mission objects', () => {
  const scene = new THREE.Scene();
  const rings = new JourneyGateSystem(scene, () => 120, journeyDallas05);
  assert.equal(scene.children.length, 10);
  assert.equal(scene.children.filter(group => group.visible).length, 2);
  const first = scene.children[0];
  const final = scene.children[9];
  assert.equal(first.children[0].material.color.getHex(), 0xf7c948);
  assert.equal(first.children[1].geometry.parameters.radius, .86);
  assert.equal(first.scale.x, 300);
  assert.equal(final.scale.x, 320);
  rings.setProgress(7, true);
  assert.equal(scene.children.filter(group => group.visible).length, 3, 'previous gate flashes briefly after a confirmed crossing');
  rings.update(.6);
  assert.equal(scene.children.filter(group => group.visible).length, 2);
  assert.equal(scene.children[7].children[0].material.color.getHex(), 0xf7c948);
  rings.dispose();
  assert.equal(scene.children.length, 0);
});
