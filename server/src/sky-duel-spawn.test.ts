import assert from 'node:assert/strict';
import test from 'node:test';
import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { skyDuelArenaCenter, skyDuelRunwaySpawn } from './sky-duel-spawn.js';

test('Sky Duel pilots start on the DFW and Love Field runway centerlines inside the arena', () => {
  const airports = ['dfw', 'love'].map(id => cityAirports.dallas.find(airport => airport.id === id)!);
  const elevations = [123, 145];
  const starts = [skyDuelRunwaySpawn(0, elevations[0]!), skyDuelRunwaySpawn(1, elevations[1]!)];
  for (const [slot, start] of starts.entries()) {
    const airport = airports[slot]!;
    const dx = start.position.x - airport.x, dz = start.position.z - airport.z;
    const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
    const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
    assert.equal(lateral, 0);
    assert.ok(along > 0 && along < airport.runwayLength / 2, `${airport.id} start fits the runway`);
    assert.equal(start.position.y, elevations[slot]! + aircraftGroundOffset);
    assert.equal(start.heading, airport.heading);
    assert.ok(Math.hypot(start.position.x - skyDuelArenaCenter.x, start.position.z - skyDuelArenaCenter.z) < 12_000);
  }
  assert.ok(Math.hypot(starts[0]!.position.x - starts[1]!.position.x,
    starts[0]!.position.z - starts[1]!.position.z) > 10_000);
});
