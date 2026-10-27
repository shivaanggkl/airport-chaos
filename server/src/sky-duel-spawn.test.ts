import assert from 'node:assert/strict';
import test from 'node:test';
import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { competitiveModes } from '../../shared/competitive-modes.mjs';
import { skyDuelRunwaySpawn } from './sky-duel-spawn.js';

test('Sky Duel pilots start stationary on separate DFW runway centerlines', () => {
  const dfw = cityAirports.dallas.find(airport => airport.id === 'dfw')!;
  const elevation = 123;
  const starts = [skyDuelRunwaySpawn(0, elevation), skyDuelRunwaySpawn(1, elevation)];
  for (const [slot, start] of starts.entries()) {
    const dx = start.position.x - dfw.x, dz = start.position.z - dfw.z;
    const lateral = dx * Math.cos(dfw.heading) - dz * Math.sin(dfw.heading);
    const along = dx * Math.sin(dfw.heading) + dz * Math.cos(dfw.heading);
    assert.equal(lateral, competitiveModes.skyDuel.runwayLaterals[slot]);
    assert.ok(along > 0 && along < 3_850 / 2, 'both starts fit the rendered runways');
    assert.equal(start.position.y, elevation + aircraftGroundOffset);
    assert.equal(start.heading, dfw.heading);
  }
  assert.ok(Math.hypot(starts[0]!.position.x - starts[1]!.position.x,
    starts[0]!.position.z - starts[1]!.position.z) > 600);
});
