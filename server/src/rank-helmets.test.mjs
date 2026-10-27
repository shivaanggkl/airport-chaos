import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { rankHelmetForLevel, rankHelmets } from '../../client/src/rank-helmets.ts';
import { queueVerifiedRankHelmetUnlock } from '../../client/src/rank-helmet-unlock.ts';

test('all fifty levels resolve to the seven approved earned helmets', () => {
  assert.deepEqual(rankHelmets.map(({ id, level }) => [id, level]), [
    ['rookie', 1], ['pathfinder', 5], ['aviator', 10], ['ace', 15],
    ['elite', 25], ['sky_commander', 35], ['legend', 50],
  ]);
  for (let level = 1; level <= 50; level += 1) {
    const expected = [...rankHelmets].reverse().find(helmet => level >= helmet.level);
    assert.equal(rankHelmetForLevel(level).id, expected.id, `Level ${level}`);
  }
});

test('each approved helmet has a bundled optimized asset', async () => {
  for (const helmet of rankHelmets) {
    const path = fileURLToPath(new URL(`../../client/public${helmet.src}`, import.meta.url));
    const asset = await stat(path);
    assert.ok(asset.size > 20_000 && asset.size < 200_000, `${helmet.id}: ${asset.size} bytes`);
  }
});

test('only verified rank transitions queue a single final-rank announcement', () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const pendingKey = 'airport-chaos-rank-helmet-pending-v1';
  queueVerifiedRankHelmetUnlock('pilot-a', 1, 4);
  assert.equal(values.has(pendingKey), false);
  queueVerifiedRankHelmetUnlock('pilot-a', 4, 5);
  assert.equal(JSON.parse(values.get(pendingKey)).rankId, 'pathfinder');
  queueVerifiedRankHelmetUnlock('pilot-a', 5, 35);
  assert.deepEqual(JSON.parse(values.get(pendingKey)), { pilotId: 'pilot-a', level: 35, rankId: 'sky_commander' });
  queueVerifiedRankHelmetUnlock('pilot-a', 4, 5);
  assert.equal(JSON.parse(values.get(pendingKey)).level, 35);
  values.set('airport-chaos-rank-helmet-shown-v1', JSON.stringify({ pilotId: 'pilot-a', level: 35, rankId: 'sky_commander' }));
  values.delete(pendingKey);
  queueVerifiedRankHelmetUnlock('pilot-a', 5, 35);
  assert.equal(values.has(pendingKey), false);
  delete globalThis.sessionStorage;
});
