import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyDallas01, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { dfwSpeedGates } from '../../shared/city-challenges.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';

test('Rookie Rush is an independent ten-gate Dallas route; Free Fly keeps four DFW gates', () => {
  const mission = journeyDallas01;
  assert.equal(mission.id, 'journey-dallas-01');
  assert.equal(mission.gates.length, 10);
  assert.equal(mission.timeLimitMs, 150_000);
  assert.equal(mission.firstClearCredits, 250);
  assert.equal(dfwSpeedGates.length, 4);
  assert.notEqual(mission.gates, dfwSpeedGates);
  assert.ok(mission.gates.every(gate => Math.abs(gate.x) + gate.radius < 25_000 && Math.abs(gate.z) + gate.radius < 25_000));
  assert.ok(mission.gates.every(gate => gate.altitude >= 760));
  assert.ok(Math.hypot(mission.gates[0].x - mission.airborneSpawn.x,
    mission.gates[0].z - mission.airborneSpawn.z) <= 3_000);
});

test('every Rookie Rush gate accepts forward movement only through its visible opening', () => {
  const mission = journeyDallas01;
  for (let index = 0; index < mission.gates.length; index += 1) {
    const gate = mission.gates[index];
    const prior = mission.gates[Math.max(0, index - 1)];
    const next = mission.gates[Math.min(mission.gates.length - 1, index + 1)];
    const length = Math.hypot(next.x - prior.x, next.z - prior.z);
    const nx = (next.x - prior.x) / length, nz = (next.z - prior.z) / length;
    const before = { x: gate.x - nx * 100, y: gate.altitude, z: gate.z - nz * 100 };
    const after = { x: gate.x + nx * 100, y: gate.altitude, z: gate.z + nz * 100 };
    assert.equal(journeyGateCrossing(before, after, index, 0, mission), 'VALID', `gate ${index + 1}`);
    assert.equal(journeyGateCrossing(after, before, index, 0, mission), false, `reverse gate ${index + 1}`);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius },
      { ...after, y: gate.altitude + gate.radius }, index, 0, mission), false, `near miss gate ${index + 1}`);
  }
});

test('even the Firehawk absolute speed cap requires at least one minute along the gate sequence', () => {
  const mission = journeyDallas01;
  const points = [mission.airborneSpawn, ...mission.gates];
  const centerline = points.slice(1).reduce((distance, point, index) =>
    distance + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
  // The disc-radius subtraction allows the fastest conceivable edge-to-edge
  // crossing at every gate. Boost cannot exceed this envelope's hard cap.
  const openingAllowance = 2 * mission.gates.reduce((sum, gate) => sum + gate.radius, 0)
    - mission.gates.at(-1).radius;
  const maximumSpeed = aircraftFlightEnvelope.fighter.maxSpeed * aircraftFlightEnvelope.fighter.boostMaxSpeed + 10;
  assert.ok((centerline - openingAllowance) / maximumSpeed > 60);
  assert.ok(centerline / aircraftFlightEnvelope.trainer.maxSpeed < 150);
});
