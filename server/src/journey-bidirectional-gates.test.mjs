import assert from 'node:assert/strict';
import test from 'node:test';
import {
  journeyGateCrossing, journeyGatePlane,
  journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04,
  journeyDallas05, journeyDallas06,
} from '../../shared/journey-mission.mjs';

test('both faces of every Golden Gates ring accept an ordered crossing through its opening', () => {
  const terrainHeight = 180;
  for (const mission of [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06]) {
    for (const [index, gate] of mission.gates.entries()) {
      const plane = journeyGatePlane(mission, index);
      assert.ok(plane);
      const { normalX, normalZ } = plane;
      const from = { x: gate.x - normalX * 30, y: terrainHeight + gate.altitude, z: gate.z - normalZ * 30 };
      const to = { x: gate.x + normalX * 30, y: from.y, z: gate.z + normalZ * 30 };
      assert.equal(journeyGateCrossing(from, to, index, terrainHeight, mission), 'VALID', `${mission.id} gate ${index + 1} front`);
      assert.equal(journeyGateCrossing(to, from, index, terrainHeight, mission), 'VALID', `${mission.id} gate ${index + 1} back`);
      const miss = { x: -normalZ * gate.radius * 2, z: normalX * gate.radius * 2 };
      for (const [start, end] of [[from, to], [to, from]])
        assert.equal(journeyGateCrossing(
          { ...start, x: start.x + miss.x, z: start.z + miss.z },
          { ...end, x: end.x + miss.x, z: end.z + miss.z },
          index, terrainHeight, mission,
        ), false, `${mission.id} gate ${index + 1} outside opening`);
    }
  }
});
