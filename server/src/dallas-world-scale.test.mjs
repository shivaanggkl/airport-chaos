import assert from 'node:assert/strict';
import test from 'node:test';
import { scaledDallasWorld } from '../../client/src/dallas-scaled-world.js';
import { getCity } from '../../client/src/cities.js';
import * as sourceDallas from '../../client/src/dallas-world.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { cityRegistry } from '../../shared/city-registry.mjs';
import { portalForCity } from '../../shared/intercity-portals.mjs';
import { journeyDallas01 } from '../../shared/journey-mission.mjs';
import { DALLAS_WORLD_SCALE } from '../../shared/dallas-world-scale.mjs';
import { maxVisibleDistance } from '../../client/src/ad-placement.js';
import { cityChallenges } from '../../shared/city-challenges.mjs';
import { cityDiscoveries } from '../../shared/city-discoveries.mjs';

test('every Dallas launch uses the same scaled city world module', async () => {
  assert.strictEqual(await getCity('dallas').loadWorld(), scaledDallasWorld);
});

test('Dallas renderer, server airports, terrain, Journey gates, and portal share one physical scale', () => {
  assert.equal(scaledDallasWorld.WORLD_SIZE, cityRegistry.dallas.worldSize);
  for (const [index, airport] of sourceDallas.airports.entries()) {
    const rendered = scaledDallasWorld.airports[index];
    const authoritative = cityAirports.dallas[index];
    assert.equal(rendered.x, airport.x * DALLAS_WORLD_SCALE);
    assert.equal(rendered.z, airport.z * DALLAS_WORLD_SCALE);
    assert.equal(rendered.runwayLength, authoritative.runwayLength);
    assert.equal(rendered.runwayWidth, authoritative.runwayWidth);
    assert.deepEqual([rendered.x, rendered.z], [authoritative.x, authoritative.z]);
    assert.equal(scaledDallasWorld.getTerrainHeight(rendered.x, rendered.z),
      sourceDallas.getTerrainHeight(airport.x, airport.z) * DALLAS_WORLD_SCALE);
  }
  assert.equal(journeyDallas01.gates[0].x, -5_360 * DALLAS_WORLD_SCALE);
  assert.equal(journeyDallas01.gates[0].radius, 340 * DALLAS_WORLD_SCALE);
  const gate = portalForCity('dallas', scaledDallasWorld.getTerrainHeight);
  assert.ok(gate);
  assert.equal(gate.x, 10_000 * DALLAS_WORLD_SCALE);
  assert.equal(gate.z, -20_000 * DALLAS_WORLD_SCALE);
  assert.equal(scaledDallasWorld.mapLayer.sourceScale, DALLAS_WORLD_SCALE);
  assert.equal(scaledDallasWorld.discoveries, cityDiscoveries.dallas);
  for (const challenge of cityChallenges.dallas) {
    const rendered = scaledDallasWorld.skyChallenges.find(item => item.id === challenge.id);
    assert.equal(rendered?.timeLimit, challenge.timeLimit);
    if (challenge.gates) assert.deepEqual(rendered.gates, challenge.gates);
  }
});

test('Dallas ad placements keep their original sight distance relative to the enlarged city', () => {
  assert.equal(scaledDallasWorld.adPlacements.length, sourceDallas.adPlacements.length);
  for (const [index, source] of sourceDallas.adPlacements.entries()) {
    const placement = scaledDallasWorld.adPlacements[index];
    assert.equal(placement.id, source.id);
    assert.equal(placement.position.x, source.position.x * DALLAS_WORLD_SCALE);
    assert.equal(placement.position.z, source.position.z * DALLAS_WORLD_SCALE);
    if (source.type === 'AIRCRAFT_LIVERY') {
      assert.equal(placement.visibilityScale, undefined);
      assert.deepEqual(placement.size, source.size);
    } else {
      assert.equal(placement.visibilityScale, DALLAS_WORLD_SCALE);
      assert.equal(placement.size.x, source.size.x * DALLAS_WORLD_SCALE);
      assert.equal(maxVisibleDistance(placement.type, placement.visibilityScale),
        maxVisibleDistance(source.type) * DALLAS_WORLD_SCALE);
    }
  }
});
