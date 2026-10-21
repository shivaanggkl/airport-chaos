import assert from 'node:assert/strict';
import test from 'node:test';
import {
  crossesJourneyGateWrongWay, journeyGateCrossing, journeyGatePlane,
  journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04,
  journeyDallas05, journeyDallas06, journeyDallas07,
} from '../../shared/journey-mission.mjs';

test('wrong-way feedback uses the real opening and direction for every early Dallas gate', () => {
  const terrainHeight = 180;
  for (const mission of [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06]) {
    for (const [index, gate] of mission.gates.entries()) {
      const plane = journeyGatePlane(mission, index);
      assert.ok(plane);
      const { normalX, normalZ } = plane;
      const from = { x: gate.x - normalX * 30, y: terrainHeight + gate.altitude, z: gate.z - normalZ * 30 };
      const to = { x: gate.x + normalX * 30, y: from.y, z: gate.z + normalZ * 30 };
      assert.equal(journeyGateCrossing(from, to, index, terrainHeight, mission), 'VALID', `${mission.id} gate ${index + 1} forward`);
      assert.equal(crossesJourneyGateWrongWay(from, to, index, terrainHeight, mission), false, `${mission.id} gate ${index + 1} forward cue`);
      assert.equal(crossesJourneyGateWrongWay(to, from, index, terrainHeight, mission), true, `${mission.id} gate ${index + 1} reverse cue`);
      const miss = { x: -normalZ * gate.radius * 2, z: normalX * gate.radius * 2 };
      assert.equal(crossesJourneyGateWrongWay(
        { ...to, x: to.x + miss.x, z: to.z + miss.z },
        { ...from, x: from.x + miss.x, z: from.z + miss.z },
        index, terrainHeight, mission,
      ), false, `${mission.id} gate ${index + 1} outside opening`);
    }
  }
  assert.equal(journeyDallas07.gates.length, 0);
});
