import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { JourneyGateSystem } from '../src/journey-gates';
import { fixedGateDirection } from '../src/objective-guidance';
import { journeyDallas03, journeyDallas04 } from '../../shared/journey-mission.mjs';

test('Mission 4 shows one active gold gate and a blue pathway without prediction circles', () => {
  const scene = new THREE.Scene();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  const pathway = scene.getObjectByName('mission-04-blue-pathway') as THREE.Group;
  assert.ok(pathway);
  assert.equal(pathway.visible, false);
  assert.equal(scene.getObjectByName('mission-04-crossing-prediction'), undefined);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name), ['journey-dallas-04-gate-1']);
  const camera = new THREE.PerspectiveCamera(65, 1280 / 585, 0.1, 30_000);
  camera.position.set(-22_150, 920, -20_150);
  camera.lookAt(-19_000, 850, -18_000);
  slalom.setProgress(1, true);
  slalom.update(.1, new THREE.Vector3(-19_000, 850, -18_000), new THREE.Vector3(500, 0, 250), camera);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name),
    ['journey-dallas-04-gate-2', 'mission-04-blue-pathway']);
  const ribbon = (pathway.children[0] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute;
  assert.ok(Number.isFinite(ribbon.getX(12)));
  assert.notEqual(ribbon.getX(12), ribbon.getX(13), 'the pathway has a visible ribbon width');
  const center = (pathway.children[1] as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
  assert.equal(center.getX(center.count - 1), journeyDallas04.gates[1].x);
  slalom.setProgress(2, true);
  slalom.update(.1, new THREE.Vector3(-15_000, 850, -15_000), new THREE.Vector3(500, 0, 250), camera);
  assert.equal(center.getX(center.count - 1), journeyDallas04.gates[2].x,
    'the pathway changes only after confirmed gate progress');
  slalom.setProgress(10, false);
  assert.equal(pathway.visible, false);
  slalom.dispose();
  assert.equal(scene.children.length, 0);
  const ascent = new JourneyGateSystem(scene, () => 0, journeyDallas03);
  assert.equal(scene.getObjectByName('mission-04-blue-pathway'), undefined);
  assert.equal(scene.children.filter((child) => child.visible).length, 2, 'Mission 3 preview behavior is preserved');
  ascent.dispose();
  assert.equal(scene.children.length, 0);
});

test('Mission 4 pathway has visible screen width from the chase camera at the airborne start', () => {
  const scene = new THREE.Scene();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  const spawn = journeyDallas04.airborneSpawn;
  const gate = journeyDallas04.gates[0];
  const camera = new THREE.PerspectiveCamera(65, 1280 / 585, 0.1, 30_000);
  camera.position.set(spawn.x - 150, spawn.altitude + 70, spawn.z - 150);
  camera.lookAt(gate.x, gate.altitude, gate.z);
  camera.updateMatrixWorld();
  slalom.setProgress(0, true);
  slalom.update(.1, new THREE.Vector3(spawn.x, spawn.altitude, spawn.z),
    new THREE.Vector3(gate.x - spawn.x, 0, gate.z - spawn.z), camera);
  const pathway = scene.getObjectByName('mission-04-blue-pathway') as THREE.Group;
  const positions = (pathway.children[0] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = 12 * 2;
  const left = new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)).project(camera);
  const right = new THREE.Vector3(positions.getX(index + 1), positions.getY(index + 1), positions.getZ(index + 1)).project(camera);
  assert.ok(Math.abs(left.x - right.x) * 640 > 20,
    `pathway must cover visible pixels, not lie edge-on (${Math.abs(left.x - right.x) * 640})`);
  slalom.dispose();
});

test('Mission 4 pathway extends below the chase aircraft instead of forming a patch inside the gate', () => {
  const scene = new THREE.Scene();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  const gate = journeyDallas04.gates[0];
  const direction = new THREE.Vector3(gate.x - journeyDallas04.airborneSpawn.x, 0,
    gate.z - journeyDallas04.airborneSpawn.z).normalize();
  const player = new THREE.Vector3(gate.x, gate.altitude, gate.z).addScaledVector(direction, -1600);
  const camera = new THREE.PerspectiveCamera(58, 1280 / 585, 0.1, 30_000);
  camera.position.copy(player).addScaledVector(direction, -20);
  camera.position.y += 5;
  camera.lookAt(player.clone().addScaledVector(direction, 10).add(new THREE.Vector3(0, 1, 0)));
  camera.updateMatrixWorld();
  slalom.setProgress(0, true);
  slalom.update(.1, player, direction.clone().multiplyScalar(650), camera);
  const pathway = scene.getObjectByName('mission-04-blue-pathway') as THREE.Group;
  const center = (pathway.children[1] as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
  const midpoint = new THREE.Vector3(center.getX(12), center.getY(12), center.getZ(12));
  const gateCenter = new THREE.Vector3(gate.x, gate.altitude, gate.z);
  const midpointScreenY = (1 - midpoint.project(camera).y) * 585 / 2;
  const gateScreenY = (1 - gateCenter.project(camera).y) * 585 / 2;
  assert.ok(midpointScreenY - gateScreenY > 80,
    `the guide should read below the gate in the real chase view (${midpointScreenY} versus ${gateScreenY})`);
  assert.ok(center.getY(12) >= 70, 'the guide should stay above the terrain');
  slalom.dispose();
});

test('fixed gate cue follows aircraft heading and altitude with a dead band', () => {
  const player = { x: 0, y: 0, z: 0 };
  const radius = 100;
  assert.equal(fixedGateDirection(player, { x: 0, y: 0, z: -1000 }, 0, radius).arrow, '↑');
  assert.equal(fixedGateDirection(player, { x: -1000, y: 0, z: -1000 }, 0, radius).arrow, '←');
  assert.equal(fixedGateDirection(player, { x: 1000, y: 0, z: -1000 }, 0, radius).arrow, '→');
  assert.equal(fixedGateDirection(player, { x: 0, y: 100, z: -1000 }, 0, radius).arrow, '↑');
  assert.equal(fixedGateDirection(player, { x: 0, y: -100, z: -1000 }, 0, radius).arrow, '↓');
  assert.equal(fixedGateDirection(player, { x: 1000, y: 100, z: -1000 }, 0, radius).arrow, '↗');
  assert.equal(fixedGateDirection(player, { x: 300, y: 0, z: -1000 }, 0, radius, 1, 0).horizontal, 1);
  assert.equal(fixedGateDirection(player, { x: 300, y: 0, z: -1000 }, 0, radius, 0, 0).horizontal, 1);
  assert.equal(fixedGateDirection(player, { x: -1400, y: 0, z: -9800 }, 0, 320).arrow, '←',
    'a gate visibly left at long range needs a left cue even at a small bearing');
  assert.equal(fixedGateDirection(player, { x: 30, y: 0, z: -9800 }, 0, 320).arrow, '↑');
  const gate1 = journeyDallas04.gates[0], gate2 = journeyDallas04.gates[1];
  assert.equal(fixedGateDirection({ x: gate1.x, y: gate1.altitude, z: gate1.z },
    { x: gate2.x, y: gate2.altitude, z: gate2.z },
    journeyDallas04.airborneSpawn.heading, journeyDallas04.gates[1].radius).arrow, '←',
  'the actual Gate 1 to Gate 2 approach in the reported screenshots must indicate left');
});
