import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { JourneyGateSystem } from '../src/journey-gates';
import { fixedGateDirection } from '../src/objective-guidance';
import { journeyDallas03, journeyDallas04 } from '../../shared/journey-mission.mjs';

test('Mission 4 shows only the active gold gate and cleans up on exit', () => {
  const scene = new THREE.Scene();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name), ['journey-dallas-04-gate-1']);
  slalom.setProgress(1, true);
  slalom.update(.1);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name),
    ['journey-dallas-04-gate-2']);
  const gateGroup = scene.getObjectByName('journey-dallas-04-gate-2') as THREE.Group;
  const halo = (gateGroup.children[4] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material;
  assert.equal(halo.opacity, .08, 'Mission 4 gate glow stays restrained and steady');
  assert.equal((gateGroup.children[0] as THREE.Mesh<THREE.TorusGeometry>).geometry.parameters.tube, .08);
  for (const part of gateGroup.children.slice(0, 3)) {
    assert.equal((part as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.transparent, true,
      'the gate must render after opaque terrain instead of losing its lower half at the horizon');
  }
  slalom.setProgress(2, true);
  slalom.update(.1);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name),
    ['journey-dallas-04-gate-3']);
  slalom.setProgress(10, false);
  slalom.dispose();
  assert.equal(scene.children.length, 0);
  const ascent = new JourneyGateSystem(scene, () => 0, journeyDallas03);
  assert.equal(scene.children.filter((child) => child.visible).length, 2, 'Mission 3 preview behavior is preserved');
  const ascentGate = scene.getObjectByName('journey-dallas-03-gate-1') as THREE.Group;
  assert.equal((ascentGate.children[0] as THREE.Mesh<THREE.TorusGeometry>).geometry.parameters.tube, .12);
  ascent.dispose();
  assert.equal(scene.children.length, 0);
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
