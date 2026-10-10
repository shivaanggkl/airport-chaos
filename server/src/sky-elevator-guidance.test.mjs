import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { journeyDallas07 } from '../../shared/journey-mission.mjs';
import { climbGateInstruction, climbDepartureTurnSide, confirmedGateObjective, precisionGateBearing, projectMissionObjective } from '../../client/src/objective-guidance.ts';

test('Sky Elevator uses only the confirmed active gate and cleans up after completion', () => {
  const attempt = { attemptId: 'test-attempt', gateIndex: 0, status: 'APPROACH' };
  const gate1 = confirmedGateObjective(attempt, journeyDallas07.gates, () => 25);
  assert.equal(gate1?.label, 'GATE 1');
  assert.equal(gate1?.position.y, 335);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 1 }, journeyDallas07.gates, () => 25)?.label, 'GATE 2');
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 4, status: 'COMPLETED' }, journeyDallas07.gates, () => 25), null);
  assert.equal(confirmedGateObjective({ ...attempt, gateIndex: 4, status: 'RACING' }, journeyDallas07.gates, () => 25), null);
});

test('Sky Elevator instructions prioritize speed, climb and genuine near-gate alignment', () => {
  assert.equal(climbGateInstruction(1, true, 800, 200, 76, 0, 55, false), 'TAKE OFF — CLIMB CLEAR OF RUNWAY');
  assert.equal(climbGateInstruction(1, false, 800, 200, 76, 60, 55, false, null, false), 'CLIMB CLEAR OF RUNWAY');
  assert.equal(climbGateInstruction(2, false, 1_000, 250, 72, 50, 55, false), 'GAIN SPEED TO KEEP CLIMBING');
  assert.equal(climbGateInstruction(2, false, 1_000, 250, 72, 90, 55, false), 'CLIMB TO GATE 2');
  assert.equal(climbGateInstruction(3, false, 150, 10, 70, 90, 55, false), 'FLY THROUGH GATE 3');
  assert.equal(climbGateInstruction(3, false, 700, 5, 70, 90, 55, false), 'FOLLOW THE ARROW TO GATE 3');
  assert.equal(climbGateInstruction(3, false, 700, 5, 70, 90, 55, true), 'GATE 2 CLEARED!');
});

test('Sky Elevator gold guidance remains finite for a gate behind the camera', () => {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, .1, 20_000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  const placement = projectMissionObjective(camera, new THREE.Vector3(0, 100, 1_000), 76, 844, 390);
  assert.equal(placement.kind, 'arrow');
  assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.y) && Number.isFinite(placement.angle));
});

test('Addison departure keeps Gate 1 turn guidance stable until the aircraft faces the gate', () => {
  const gate = journeyDallas07.gates[0];
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
