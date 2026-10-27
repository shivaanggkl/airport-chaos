import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { representativeBuildings } from './dallas-lod.mjs';

const building = (x, z, width = 20, depth = 16, height = 30, base = 140) => [
  height, 2, 0, base, x - width / 2, z - depth / 2, x + width / 2, z - depth / 2,
  x + width / 2, z + depth / 2, x - width / 2, z + depth / 2,
];

test('representatives preserve source centers, heights and ground elevations', () => {
  const source = [building(10, 10, 30, 20, 40, 155), building(250, 250, 25, 15, 70, 160)];
  for (const grid of [360, 1000]) {
    const result = representativeBuildings(source, grid);
    assert.deepEqual(result.map(item => [(item[4] + item[8]) / 2, (item[5] + item[9]) / 2]).sort((a, b) => a[0] - b[0]), [[10, 10], [250, 250]]);
    assert.deepEqual(result.map(item => item[3]).sort(), [155, 160]);
    assert.deepEqual(result.map(item => item[0]).sort(), [40, 70]);
    assert.ok(result.every(item => source.some(original => item[0] === original[0] && item[3] === original[3] &&
      JSON.stringify(item.slice(4)) === JSON.stringify(original.slice(4)))));
    assert.ok(result.every(item => item[1] === 2));
  }
});

test('large independent mapped footprints never merge or shrink', () => {
  const source = [building(100, 100, 500, 40), building(800, 700, 600, 35)];
  for (const grid of [360, 1000]) {
    const result = representativeBuildings(source, grid);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(item => item[8] - item[4]).sort((a,b)=>a-b), [500,600]);
    assert.ok(result.every(item => item[9] - item[5] <= 40));
  }
});

test('selection is deterministic, capped and distributed across occupied cells', () => {
  const source = Array.from({ length: 40 }, (_, i) => building((i % 10) * 80 + 20, Math.floor(i / 10) * 80 + 20));
  for (const grid of [360, 1000]) {
    const a = representativeBuildings(source, grid);
    const b = representativeBuildings(source, grid);
    assert.deepEqual(a, b);
    assert.ok(a.length <= (grid === 360 ? 12 : 8));
    assert.ok(Math.max(...a.map(item => item[4])) - Math.min(...a.map(item => item[4])) > 100);
  }
});

test('a mapped tower survives distant LOD selection beside broad low buildings', () => {
  const low = Array.from({ length: 14 }, (_, index) => building(index * 16, 70, 70, 42, 9));
  const tower = building(110, 115, 25, 25, 154);
  for (const grid of [360, 1000]) {
    const selected = representativeBuildings([...low, tower], grid);
    assert.ok(selected.some(item => item[0] === tower[0] && item[4] === tower[4]));
  }
});

test('generated Dallas chunks use real Near footprints and exact manifest sizes', async () => {
  const directory = resolve('client/public/data/dallas');
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const entries = new Map(manifest.chunks.map(entry => [`${entry.lod}:${entry.id}`, entry]));
  for (const nearEntry of manifest.chunks.filter(entry => entry.lod === 'near')) {
    const near = JSON.parse(await readFile(resolve(directory, nearEntry.filename), 'utf8'));
    for (const [lod, grid] of [['mid', 360], ['far', 1000]]) {
      const entry = entries.get(`${lod}:${nearEntry.id}`);
      assert.ok(entry, `${lod}:${nearEntry.id} exists`);
      const path = resolve(directory, entry.filename);
      const chunk = JSON.parse(await readFile(path, 'utf8'));
      assert.equal((await stat(path)).size, entry.bytes, path);
      assert.deepEqual(chunk.b, representativeBuildings(near.b, grid), path);
    }
  }
});
