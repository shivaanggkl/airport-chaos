import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { lockedShotProgress } from '../../client/src/locked-shot-visual.ts';

test('a banked locked shot joins the confirmed muzzle-to-hit line without a curved path', () => {
  const muzzle = new THREE.Vector3(18, 42, -6);
  const predictedHit = new THREE.Vector3(240, 95, -510);
  const confirmedHit = new THREE.Vector3(225, 110, -500);
  const predictedPellet = muzzle.clone().lerp(predictedHit, 0.4);
  const progress = lockedShotProgress(muzzle, predictedHit, predictedPellet);
  const correctedPellet = muzzle.clone().lerp(confirmedHit, progress);
  const confirmedLine = confirmedHit.clone().sub(muzzle);
  assert.ok(Math.abs(progress - 0.4) < 1e-12);
  assert.ok(correctedPellet.clone().sub(muzzle).cross(confirmedLine).length() < 1e-9);
  assert.ok(lockedShotProgress(muzzle, predictedHit, confirmedHit.clone().multiplyScalar(10)) <= 1);
});
