import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyDallas01, journeyDallas02, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';

const lake = { x: 5_200, z: -8_500 };

test('Lake Racer is a separate forward course near White Rock Lake', () => {
  assert.equal(journeyDallas02.gates.length, 10);
  assert.equal(journeyDallas02.timeLimitMs, 150_000);
  assert.equal(journeyDallas02.firstClearCredits, 350);
  assert.notDeepEqual(journeyDallas02.gates, journeyDallas01.gates);
  assert.ok(journeyDallas02.gates.some(gate => Math.hypot(gate.x - lake.x, gate.z - lake.z) < 4_000));
  const points = [journeyDallas02.airborneSpawn, ...journeyDallas02.gates];
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z) < 13_000, `leg ${i}`);
    assert.ok(Math.abs(points[i].x) <= 23_000 && Math.abs(points[i].z) <= 23_000, `world margin at gate ${i}`);
  }
  const spawn = authorizedJourneyAirborneSpawn({ missionId: journeyDallas02.id, status: 'APPROACH' }, journeyDallas02, () => 180);
  assert.equal(spawn.position.y, 980);
  assert.equal(authorizedJourneyAirborneSpawn({ missionId: journeyDallas01.id, status: 'APPROACH' }, journeyDallas02, () => 180), undefined);
  assert.equal(authorizedJourneyAirborneSpawn({ missionId: journeyDallas02.id, status: 'FAILED' }, journeyDallas02, () => 180), undefined);
});

test('each Lake Racer gate accepts only a forward swept crossing through its opening', () => {
  const gates = journeyDallas02.gates;
  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i];
    const before = gates[Math.max(0, i - 1)];
    const after = gates[Math.min(gates.length - 1, i + 1)];
    const length = Math.hypot(after.x - before.x, after.z - before.z);
    const nx = (after.x - before.x) / length, nz = (after.z - before.z) / length;
    const from = { x: gate.x - nx * 100, y: 180 + gate.altitude, z: gate.z - nz * 100 };
    const to = { x: gate.x + nx * 100, y: 180 + gate.altitude, z: gate.z + nz * 100 };
    assert.equal(journeyGateCrossing(from, to, i, 180, journeyDallas02), 'VALID', `gate ${i + 1}`);
    assert.equal(journeyGateCrossing(to, from, i, 180, journeyDallas02), false, `reverse gate ${i + 1}`);
    const miss = { ...from, x: from.x - nz * gate.radius * 2, z: from.z + nx * gate.radius * 2 };
    const missTo = { ...to, x: to.x - nz * gate.radius * 2, z: to.z + nx * gate.radius * 2 };
    assert.equal(journeyGateCrossing(miss, missTo, i, 180, journeyDallas02), false, `outside gate ${i + 1}`);
  }
});
