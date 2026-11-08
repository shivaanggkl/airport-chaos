import assert from 'node:assert/strict';
import test from 'node:test';
import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { skyDuelArenaCenter, skyDuelRunwaySpawn } from './sky-duel-spawn.js';

test('Sky Duel pilots depart outward from mirrored DFW positions with 3.9 km of runway ahead', () => {
  const airport = cityAirports.dallas.find(airport => airport.id === 'dfw')!;
  const elevations = [123, 145];
  const starts = [skyDuelRunwaySpawn(0, elevations[0]!), skyDuelRunwaySpawn(1, elevations[1]!)];
  for (const [slot, start] of starts.entries()) {
    const dx = start.position.x - airport.x, dz = start.position.z - airport.z;
    const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
    const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
    assert.equal(lateral, 0);
    assert.equal(along,slot===0?2250:-2250);
    assert.equal(airport.runwayLength/2-Math.abs(along),3900);
    assert.equal(start.position.y, elevations[slot]! + aircraftGroundOffset);
    assert.equal(start.heading, airport.heading+(slot===0?Math.PI:0));
    assert.ok((-Math.sin(start.heading)*dx-Math.cos(start.heading)*dz)>0,'departure points away from midpoint');
  }
  assert.equal(Math.hypot(starts[0]!.position.x - starts[1]!.position.x,
    starts[0]!.position.z - starts[1]!.position.z),4500);
  assert.deepEqual(skyDuelArenaCenter,{x:airport.x,z:airport.z});
});
