import assert from 'node:assert/strict';
import test from 'node:test';
import { projectGateCrossing } from '../src/golden-flight-guide-math';

const center = { x: 0, y: 850, z: 0 };
const normal = { x: 1, z: 0 };
const position = { x: -3000, y: 850, z: 0 };
test('velocity projection distinguishes aligned, edge and missed gate openings', () => {
  assert.equal(projectGateCrossing(position, { x: 600, y: 0, z: 0 }, center, normal, 300)?.state, 'ALIGNED');
  assert.equal(projectGateCrossing(position, { x: 600, y: 0, z: 49 }, center, normal, 300)?.state, 'EDGE');
  assert.equal(projectGateCrossing(position, { x: 600, y: 0, z: 72 }, center, normal, 300)?.state, 'MISS');
  assert.equal(projectGateCrossing(position, { x: 600, y: 59, z: 0 }, center, normal, 300)?.state, 'MISS');
});
test('projection suppresses reverse, parallel, behind and distant trajectories', () => {
  assert.equal(projectGateCrossing(position, { x: -600, y: 0, z: 0 }, center, normal, 300), null);
  assert.equal(projectGateCrossing(position, { x: 20, y: 0, z: 600 }, center, normal, 300), null);
  assert.equal(projectGateCrossing({ x: 300, y: 850, z: 0 }, { x: 600, y: 0, z: 0 }, center, normal, 300), null);
  assert.equal(projectGateCrossing({ x: -6000, y: 850, z: 0 }, { x: 600, y: 0, z: 0 }, center, normal, 300), null);
});

test('Golden Flight Guide exists only for Mission 4 and disposes with its gates', async () => {
  const THREE = await import('three');
  const { JourneyGateSystem } = await import('../src/journey-gates');
  const { journeyDallas03, journeyDallas04, journeyGatePlane } = await import('../../shared/journey-mission.mjs');
  const scene = new THREE.Scene();
  const ascent = new JourneyGateSystem(scene, () => 0, journeyDallas03);
  assert.equal(scene.getObjectByName('mission-04-flight-guide'), undefined);
  ascent.dispose();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  const line = scene.getObjectByName('mission-04-flight-guide');
  const marker = scene.getObjectByName('mission-04-crossing-prediction');
  assert.ok(line);
  assert.ok(marker);
  const gate = journeyDallas04.gates[0]!;
  const plane = journeyGatePlane(journeyDallas04, 0)!;
  const start = new THREE.Vector3(gate.x - plane.normalX * 3000, gate.altitude, gate.z - plane.normalZ * 3000);
  const velocity = new THREE.Vector3(plane.normalX * 600, 0, plane.normalZ * 600);
  slalom.update(.1, start, velocity);
  assert.equal(marker.visible, true);
  const beyond = new THREE.Vector3(gate.x + plane.normalX * 400, gate.altitude,
    gate.z + plane.normalZ * 400);
  slalom.update(.1, beyond, velocity);
  assert.equal(marker.visible, false);
  const path = (line as import('three').Line).geometry.getAttribute('position');
  const last = path.count - 1;
  const recoveryDistance = (path.getX(last) - gate.x) * plane.normalX + (path.getZ(last) - gate.z) * plane.normalZ;
  assert.ok(recoveryDistance <= -900, 'missed gate guidance leads back upstream');
  slalom.setProgress(1, true);
  assert.equal(marker.visible, false);
  slalom.dispose();
  assert.equal(scene.getObjectByName('mission-04-flight-guide'), undefined);
  assert.equal(scene.getObjectByName('mission-04-crossing-prediction'), undefined);
  for (let retry = 0; retry < 3; retry += 1) {
    const next = new JourneyGateSystem(scene, () => 0, journeyDallas04);
    next.dispose();
    assert.equal(scene.children.length, 0, 'retry and exit leave no guide or gate objects');
  }
});
