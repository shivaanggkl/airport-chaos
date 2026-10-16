import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { journeyDallas07 } from '../../shared/journey-mission.mjs';
import { addisonClimbGates } from '../../shared/city-challenges.mjs';
import { climbGateInstruction, climbDepartureTurnSide, confirmedGateObjective, precisionGateBearing, projectMissionObjective } from '../../client/src/objective-guidance.ts';

test('Mission 7 has no gates; shared climb challenge uses only the confirmed active gate and cleans up after completion', () => {
  assert.equal(journeyDallas07.gates.length, 0);
  const attempt = { attemptId: 'test-attempt', gateIndex: 0, status: 'APPROACH' };
  const gate1 = confirmedGateObjective(attempt, addisonClimbGates, () => 25);
  assert.equal(gate1?.label, 'GATE 1');
  assert.equal(gate1?.position.y, 335);
  assert.equal(gate1?.bottomCue, true);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 1 }, addisonClimbGates, () => 25)?.label, 'GATE 2');
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 4, status: 'COMPLETED' }, addisonClimbGates, () => 25), null);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 4, status: 'RACING' }, addisonClimbGates, () => 25), null);
});

test('Shared climb challenge instructions prioritize speed, climb and genuine near-gate alignment', () => {
  assert.equal(climbGateInstruction(1, true, 800, 200, 76, 0, 55, false), 'TAKE OFF — CLIMB CLEAR OF RUNWAY');
  assert.equal(climbGateInstruction(1, false, 800, 200, 76, 60, 55, false, null, false), 'CLIMB CLEAR OF RUNWAY');
  assert.equal(climbGateInstruction(2, false, 1_000, 250, 72, 50, 55, false), 'GAIN SPEED TO KEEP CLIMBING');
  assert.equal(climbGateInstruction(2, false, 1_000, 250, 72, 90, 55, false), 'CLIMB TO GATE 2');
  assert.equal(climbGateInstruction(3, false, 150, 10, 70, 90, 55, false), 'FLY THROUGH GATE 3');
  assert.equal(climbGateInstruction(3, false, 700, 5, 70, 90, 55, false), 'FOLLOW THE ARROW TO GATE 3');
  assert.equal(climbGateInstruction(3, false, 700, 5, 70, 90, 55, true), 'GATE 2 CLEARED!');
});

test('Shared climb challenge gold guidance remains finite for a gate behind the camera', () => {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 20_000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  const placement = projectMissionObjective(camera, new THREE.Vector3(0, 100, 1_000), 76, 844, 390);
  assert.equal(placement.kind, 'arrow');
  assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.y) && Number.isFinite(placement.angle));
});

test('Shared floating objective cue stays clear of the central flight path', () => {
  const camera = new THREE.PerspectiveCamera(70, 1_280 / 589, .1, 20_000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  const obstacles = [
    { left: 60, top: 90, right: 440, bottom: 250 },
    { left: 900, top: 0, right: 1_280, bottom: 280 },
  ];
  const placement = projectMissionObjective(camera, new THREE.Vector3(0, 0, -1_000), 76,
    1_280, 589, obstacles);
  assert.equal(placement.kind, 'arrow');
  assert.ok(placement.x + 112 < 1_280 * .35 || placement.x - 112 > 1_280 * .65);
  assert.ok(obstacles.every(rect => placement.x + 112 <= rect.left - 7 || placement.x - 112 >= rect.right + 7 ||
    placement.y + 23 <= rect.top - 7 || placement.y - 23 >= rect.bottom + 7));
  camera.aspect = 844 / 390;
  camera.updateProjectionMatrix();
  const phone = projectMissionObjective(camera, new THREE.Vector3(0, 0, -1_000), 76,
    844, 390, [
      { left: 12, top: 90, right: 300, bottom: 225 },
      { left: 55, top: 230, right: 185, bottom: 390 },
      { left: 590, top: 110, right: 730, bottom: 320 },
    ]);
  assert.equal(phone.kind, 'arrow');
  assert.ok(phone.x + 94 < 844 * .35 || phone.x - 94 > 844 * .65);
});

test('Confirmed gate cue follows a visible gate and docks below the aircraft when off-screen', () => {
  const camera = new THREE.PerspectiveCamera(70, 1_280 / 589, .1, 20_000);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  const gate = new THREE.Vector3(0, 0, -1_000);
  const desktop = projectMissionObjective(camera, gate, 76, 1_280, 589,
    [], { left: 0, right: 0, top: 0, bottom: 0 }, undefined, undefined, true);
  assert.equal(desktop.kind, 'marker');
  assert.equal(desktop.x, 640);
  assert.ok(desktop.y < 589 * .5);
  const behind = projectMissionObjective(camera, new THREE.Vector3(0, 0, 1_000), 76, 1_280, 589,
    [], { left: 0, right: 0, top: 0, bottom: 0 }, undefined, undefined, true);
  assert.equal(behind.kind, 'arrow');
  assert.equal(behind.x, 640);
  assert.ok(behind.y > 589 * .8 && behind.y + 23 < 589);
  camera.aspect = 844 / 390;
  camera.updateProjectionMatrix();
  const phone = projectMissionObjective(camera, gate, 76, 844, 390,
    [], { left: 44, right: 44, top: 0, bottom: 21 }, undefined, undefined, true);
  assert.equal(phone.kind, 'marker');
  assert.equal(phone.x, 422);
  const phoneOffscreen = projectMissionObjective(camera, new THREE.Vector3(2_000, 0, -1_000), 76, 844, 390,
    [], { left: 44, right: 44, top: 0, bottom: 21 }, undefined, undefined, true);
  assert.equal(phoneOffscreen.kind, 'arrow');
  assert.equal(phoneOffscreen.x, 422);
  assert.ok(phoneOffscreen.y > 390 * .75 && phoneOffscreen.y + 23 < 390 - 21);
});

test('Addison departure keeps Gate 1 turn guidance stable until the aircraft faces the gate', () => {
  const gate = addisonClimbGates[0];
  const spawnX = -3_700;
  const spawnZ = -21_100 + 670;
  const departureBearing = precisionGateBearing(spawnX, spawnZ, 0, gate.x, gate.z);
  assert.ok(Math.abs(departureBearing.angle) > Math.PI * 5 / 9);
  let turnSide = climbDepartureTurnSide(1, true, departureBearing.angle, null);
  assert.equal(turnSide, null);
  turnSide = climbDepartureTurnSide(1, false, departureBearing.angle, turnSide);
  assert.equal(turnSide, 'LEFT');
  assert.equal(climbGateInstruction(1, false, 1_000, 300, gate.radius, 90, 55, false, null, false), 'CLIMB CLEAR OF RUNWAY');
  assert.equal(climbGateInstruction(1, false, 1_000, 300, gate.radius, 90, 55, false, turnSide), 'GATE 1 — TURN LEFT');
  turnSide = climbDepartureTurnSide(1, false, precisionGateBearing(spawnX, spawnZ, Math.PI / 2, gate.x, gate.z).angle, turnSide);
  assert.equal(turnSide, 'LEFT');
  turnSide = climbDepartureTurnSide(1, false, precisionGateBearing(spawnX, spawnZ, Math.PI, gate.x, gate.z).angle, turnSide);
  assert.equal(turnSide, null);
  assert.equal(climbDepartureTurnSide(2, false, departureBearing.angle, 'LEFT'), null);
  assert.equal(climbDepartureTurnSide(1, false, -departureBearing.angle, null), 'RIGHT');
});
