import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TERRITORY_AREA_SCALE,
  TERRITORY_LINEAR_SCALE,
  TERRITORY_WALL_HEIGHT_METERS,
  primaryTerritoryAt,
  territoriesContainingPoint,
  territoriesForCity,
  territoryBoundsArea,
  territoryMembershipTransition,
} from '../../shared/city-territories.mjs';

const originalAreas: Record<string, number> = {
  dfw: 66_400_000,
  downtown: 18_900_000,
  'las-colinas': 60_480_000,
  'love-field': 29_150_000,
  'white-rock': 45_440_000,
  'trinity-corridor': 39_000_000,
  addison: 41_480_000,
  'dallas-executive': 35_400_000,
};

const originalCenters: Record<string, { x: number; z: number }> = {
  dfw: { x: -22_800, z: -13_600 },
  downtown: { x: -600, z: -450 },
  'las-colinas': { x: -13_500, z: -9_350 },
  'love-field': { x: -5_140, z: -7_780 },
  'white-rock': { x: 5_200, z: -8_500 },
  'trinity-corridor': { x: -2_380, z: 720 },
  addison: { x: -3_700, z: -21_100 },
  'dallas-executive': { x: -6_700, z: 10_600 },
};

test('every authoritative Dallas rectangle has exactly double its original horizontal area', () => {
  assert.equal(TERRITORY_AREA_SCALE, 2);
  assert.ok(Math.abs(TERRITORY_LINEAR_SCALE - Math.sqrt(2)) < Number.EPSILON);
  const territories = territoriesForCity('dallas');
  assert.deepEqual(territories.map(({ id }) => id).sort(), Object.keys(originalAreas).sort());
  for (const territory of territories) {
    const ratio = territoryBoundsArea(territory.bounds) / originalAreas[territory.id]!;
    assert.ok(Math.abs(ratio - 2) < 1e-12, `${territory.id} area ratio was ${ratio}`);
    assert.equal(territory.boundaryHeight, 914.4);
  }
  assert.equal(TERRITORY_WALL_HEIGHT_METERS, 914.4);
});

test('corrected 2x rectangles preserve logical anchors and have no overlapping capture area', () => {
  const territories = territoriesForCity('dallas');
  for (const territory of territories) assert.deepEqual(territory.center, originalCenters[territory.id]);
  const overlaps: string[] = [];
  for (let leftIndex = 0; leftIndex < territories.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < territories.length; rightIndex += 1) {
      const left = territories[leftIndex]!, right = territories[rightIndex]!;
      const overlapX = Math.min(left.bounds.maxX, right.bounds.maxX) - Math.max(left.bounds.minX, right.bounds.minX);
      const overlapZ = Math.min(left.bounds.maxZ, right.bounds.maxZ) - Math.max(left.bounds.minZ, right.bounds.minZ);
      if (overlapX > 0 && overlapZ > 0) overlaps.push(`${left.id}:${right.id}`);
    }
  }
  assert.deepEqual(overlaps, []);
  for (const territory of territories) {
    assert.deepEqual(territoriesContainingPoint(territories, territory.center).map(({ id }) => id), [territory.id]);
  }
});

test('ordinary membership is singular and enter/exit transitions cannot double-count capture', () => {
  const territories = territoriesForCity('dallas');
  const dfw = territories.find(({ id }) => id === 'dfw')!;
  const position = dfw.center;
  assert.deepEqual(territoriesContainingPoint(territories, position).map(({ id }) => id), ['dfw']);
  assert.equal(primaryTerritoryAt(territories, position)?.id, 'dfw');
  const entered = territoryMembershipTransition(new Set(), territories, position);
  assert.deepEqual(entered.entered, ['dfw']);
  const exited = territoryMembershipTransition(entered.current, territories, { x: 40_000, z: 40_000 });
  assert.deepEqual(exited.exited, ['dfw']);
  assert.equal(exited.current.size, 0);
});

test('server capture, world walls, Map, and Radar consume the shared territory bounds', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../../client/src/world-map.ts', import.meta.url), 'utf8');
  assert.match(server, /primaryTerritoryAt\(definitions, player\.position\)/);
  assert.match(server, /territoryMembershipTransition\(player\.territoryIds, definitions, player\.position\)/);
  assert.match(main, /const \{ minX, maxX, minZ, maxZ \} = definition\.bounds;/);
  assert.match(main, /const height = TERRITORY_WALL_HEIGHT_METERS/);
  assert.match(main, /const territoryWallMaterial = createTerritoryWallMaterial\(\)/);
  assert.match(main, /new THREE\.Mesh\(createTerritoryWallGeometry\(definition\), territoryWallMaterial\)/);
  assert.match(main, /const territoryPulseMesh = new THREE\.Mesh\(new THREE\.BufferGeometry\(\), territoryPulseMaterial\)/);
  assert.match(main, /territoryPulseMesh\.geometry = entry\.wall\.geometry/);
  assert.doesNotMatch(main, /const border = new THREE\.Group\(\)/);
  assert.match(main, /territoryWallCullDistance = 10_000/);
  assert.match(main, /function drawRadarTerritories\(direction: THREE\.Vector3\)/);
  assert.match(main, /drawRadarTerritories\(direction\);/);
  assert.match(map, /territory\.bounds\.minX[\s\S]*territory\.bounds\.maxZ/);
  const shared = readFileSync(new URL('../../shared/city-territories.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(shared, /TERRITORY_WALL_HEIGHT_METERS\s*=\s*(?:3_?048|10_000)/);
});
