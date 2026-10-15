import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { journeyDallas02 } from '../../shared/journey-mission.mjs';
import { MissionTwoIntroPath, MISSION_TWO_INTRO_SWEEP_MS } from '../../client/src/mission-two-intro.js';

test('Lake Racer preview visits each of the ten real gates in order', () => {
  const spawn = new THREE.Vector3(journeyDallas02.airborneSpawn.x, journeyDallas02.airborneSpawn.altitude, journeyDallas02.airborneSpawn.z);
  const path = new MissionTwoIntroPath(spawn, journeyDallas02.gates, () => 0);
  const camera = new THREE.Vector3();
  const target = new THREE.Vector3();
  for (const [index, gate] of journeyDallas02.gates.entries()) {
    path.sample(MISSION_TWO_INTRO_SWEEP_MS * (index + 1) / journeyDallas02.gates.length, camera, target);
    const center = new THREE.Vector3(gate.x, gate.altitude, gate.z);
    assert.ok(camera.distanceTo(center) < 800, `camera misses gate ${index + 1}`);
    assert.ok(target.clone().sub(camera).dot(center.clone().sub(camera)) > 0, `gate ${index + 1} is behind camera`);
  }
});
