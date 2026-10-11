import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyDallas01, journeyDallas04, journeyGateCrossing, journeyGatePlane } from '../../shared/journey-mission.mjs';

test('Mission 4 accepts opening and exact solid-ring contact, but rejects misses and reverse crossings', () => {
  for (let index = 0; index < journeyDallas04.gates.length; index += 1) {
    const gate = journeyDallas04.gates[index];
    const plane = journeyGatePlane(journeyDallas04, index);
    assert.ok(plane);
    const crossingAt = (offset) => {
      const center = { x: gate.x - plane.normalZ * offset, y: gate.altitude, z: gate.z + plane.normalX * offset };
      return [
        { x: center.x - plane.normalX * 30, y: center.y, z: center.z - plane.normalZ * 30 },
        { x: center.x + plane.normalX * 30, y: center.y, z: center.z + plane.normalZ * 30 },
      ];
    };
    const [insideFrom, insideTo] = crossingAt(0);
    assert.equal(journeyGateCrossing(insideFrom, insideTo, index, 0, journeyDallas04), 'VALID');
    const [borderFrom, borderTo] = crossingAt(gate.radius * 1.12 + 2.5);
    assert.equal(journeyGateCrossing(borderFrom, borderTo, index, 0, journeyDallas04), 'VALID');
    const [missFrom, missTo] = crossingAt(gate.radius * 1.12 + 2.55);
    assert.equal(journeyGateCrossing(missFrom, missTo, index, 0, journeyDallas04), false);
    assert.equal(journeyGateCrossing(insideTo, insideFrom, index, 0, journeyDallas04), false);
    assert.equal(journeyGateCrossing(insideFrom, insideTo, (index + 1) % 10, 0, journeyDallas04), false);
  }
  const gate = journeyDallas01.gates[0];
  const plane = journeyGatePlane(journeyDallas01, 0);
  const offset = gate.radius;
  const from = { x: gate.x - plane.normalZ * offset - plane.normalX * 30, y: gate.altitude,
    z: gate.z + plane.normalX * offset - plane.normalZ * 30 };
  const to = { x: from.x + plane.normalX * 60, y: from.y, z: from.z + plane.normalZ * 60 };
  assert.equal(journeyGateCrossing(from, to, 0, 0, journeyDallas01), false, 'Mission 1 opening is unchanged');
});
