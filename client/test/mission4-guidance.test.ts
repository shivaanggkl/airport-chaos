import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { JourneyGateSystem } from '../src/journey-gates';
import { fixedGateDirection } from '../src/objective-guidance';
import { journeyDallas03, journeyDallas04 } from '../../shared/journey-mission.mjs';

test('Mission 4 has one active gold gate and no route or prediction objects across transitions', () => {
  const scene = new THREE.Scene();
  const slalom = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  assert.equal(scene.getObjectByName('mission-04-flight-guide'), undefined);
  assert.equal(scene.getObjectByName('mission-04-crossing-prediction'), undefined);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name), ['journey-dallas-04-gate-1']);
  slalom.setProgress(1, true);
  slalom.update(.1);
  assert.deepEqual(scene.children.filter((child) => child.visible).map((child) => child.name), ['journey-dallas-04-gate-2']);
  slalom.setProgress(10, false);
  slalom.dispose();
  assert.equal(scene.children.length, 0);
  const ascent = new JourneyGateSystem(scene, () => 0, journeyDallas03);
  assert.equal(scene.children.filter((child) => child.visible).length, 2, 'Mission 3 preview behavior is preserved');
  ascent.dispose();
  assert.equal(scene.children.length, 0);
});

test('fixed gate cue follows aircraft heading and altitude with a dead band', () => {
  const player = { x: 0, y: 0, z: 0 };
  const radius = 100;
  assert.equal(fixedGateDirection(player, { x: 0, y: 0, z: -1000 }, 0, radius).arrow, '➜');
  assert.equal(fixedGateDirection(player, { x: -1000, y: 0, z: -1000 }, 0, radius).arrow, '←');
  assert.equal(fixedGateDirection(player, { x: 1000, y: 0, z: -1000 }, 0, radius).arrow, '→');
  assert.equal(fixedGateDirection(player, { x: 0, y: 100, z: -1000 }, 0, radius).arrow, '↑');
  assert.equal(fixedGateDirection(player, { x: 0, y: -100, z: -1000 }, 0, radius).arrow, '↓');
  assert.equal(fixedGateDirection(player, { x: 1000, y: 100, z: -1000 }, 0, radius).arrow, '↗');
  assert.equal(fixedGateDirection(player, { x: 300, y: 0, z: -1000 }, 0, radius, 1, 0).horizontal, 1);
  assert.equal(fixedGateDirection(player, { x: 300, y: 0, z: -1000 }, 0, radius, 0, 0).horizontal, 0);
});
