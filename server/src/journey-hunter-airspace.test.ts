import assert from 'node:assert/strict';
import test from 'node:test';
import { cityAirports } from '../../shared/city-airports.mjs';
import { boundJourneyHunterPoint, insideJourneyHunterArena, journeyHunterArena, journeyHunterSteeringTarget, keepJourneyHunterInside } from './journey-hunter-airspace.js';

const { x, z } = journeyHunterArena.center;
const radius = journeyHunterArena.radius;

test('later Journey Hunters retain the established DFW-centered Dallas envelope', () => {
  const dfw = cityAirports.dallas[0];
  assert.deepEqual(journeyHunterArena.center, { x: dfw.x, z: dfw.z });
  assert.equal(radius, 25_000);
  assert.equal(insideJourneyHunterArena({ x: x + radius, z }), true);
  assert.equal(insideJourneyHunterArena({ x: x + radius + 1, z }), false);
  assert.deepEqual(boundJourneyHunterPoint({ x: x + radius + 5_000, z: z - radius - 5_000 }),
    { x: x + radius - 3_000, z: z - radius + 3_000 });
  assert.deepEqual(journeyHunterSteeringTarget({ x: x + radius - 2_500, z }, { x: 1, z: 0 },
    { x: x + radius + 1_000, z }), { x, z });
  assert.deepEqual(journeyHunterSteeringTarget({ x: x + radius - 2_500, z }, { x: -1, z: 0 },
    { x: x + radius + 1_000, z }), { x: x + radius - 3_000, z });
  assert.deepEqual(keepJourneyHunterInside({ x: x + radius + 500, z: z - radius - 500 }),
    { x: x + radius - 20, z: z - radius + 20 });
});
