import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { build } from 'esbuild';
import * as THREE from 'three';
import { addOsmCityData, disposeOsmGroups, setMappedMonsterDamage } from '../../client/src/osm-city.ts';
import { chunkMaterials, preparationOptions, prepareDallasChunk, preparedTransfers, assembleDallasChunk } from '../../client/src/dallas-chunk-preparation.ts';

const environment = { airports: [
  { id: 'dfw', x: -22800, z: -13600, heading: 0, runwayLength: 4100 },
  { id: 'love', x: -5140, z: -7780, heading: 0, runwayLength: 2700 },
  { id: 'addison', x: -3700, z: -21100, heading: 0, runwayLength: 2200 },
  { id: 'executive', x: -6700, z: 10600, heading: 0, runwayLength: 1800 },
], arena: { x: -7800, z: 2800, radiusX: 220, radiusZ: 164 } };
const header = { v: 3, chunkSize: 2000 };
const payload = lod => readFileSync(resolve(`client/public/data/dallas/${lod}/2_-5.json`), 'utf8');
function fixture(t) {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, vertexColors: true });
  material.map = new THREE.Texture();
  const options = { roadMaterial: material, buildingMaterials: Array(5).fill(material), waterMaterial: material,
    landMaterials: Array(8).fill(material), roofMaterial: material, drivewayMaterial: material,
    bridgeTrimMaterial: material, shorelineMaterial: material, treeTrunkMaterial: material,
    treeCrownMaterial: material, streetLightMaterial: material, highwayAccentMaterial: material,
    aerowayMaterials: Array(4).fill(material), monsterDamageTargets: true, majorHighwayWidth: 30 };
  const materials = chunkMaterials(options);
  const config = { environment, materials: [...materials].map(([key]) => ({ key, mapped: true })), monsterDamageTargets: true, majorHighwayWidth: 30 };
  const numeric = preparationOptions(config);
  t.after(() => { material.map.dispose(); material.dispose(); setMappedMonsterDamage(false); });
  return { options: { ...numeric, ...options }, materials, config, numeric };
}
function signature(groups, materials) {
  return groups.map(group => ({ name: group.name, meshes: group.children.map(mesh => ({
    name: mesh.name, points: mesh instanceof THREE.Points, material: [...materials.values()].includes(mesh.material),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, a]) => [key, { array: a.array, itemSize: a.itemSize, normalized: a.normalized }])),
    index: mesh.geometry.index?.array, sphere: mesh.geometry.boundingSphere?.toJSON?.() ?? (mesh.geometry.boundingSphere && { center: mesh.geometry.boundingSphere.center.toArray(), radius: mesh.geometry.boundingSphere.radius }),
  })) }));
}

test('reused worker transfers exact near/mid/far geometry and survives a malformed chunk', async t => {
  const { options, materials, config } = fixture(t);
  const dir = mkdtempSync(resolve('.dallas-worker-test-'));
  const outfile = join(dir, 'worker.mjs');
  await build({ entryPoints: ['client/src/dallas-chunk.worker.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', banner: { js:
    "import { parentPort } from 'node:worker_threads'; globalThis.self = { postMessage: (data, options) => parentPort.postMessage(data, options?.transfer) }; parentPort.on('message', data => self.onmessage({ data }));" } });
  const worker = new Worker(pathToFileURL(outfile));
  t.after(async () => { await worker.terminate(); rmSync(dir, { recursive: true, force: true }); });
  worker.postMessage({ config });
  const request = async job => { const reply = once(worker, 'message'); worker.postMessage(job); return (await reply)[0]; };
  assert.match((await request({ id: 0, payload: '{', header })).error, /SyntaxError/);
  let id = 1;
  for (const lod of ['near', 'mid', 'far']) {
    const text = payload(lod);
    const reply = await request({ id: id++, payload: text, header });
    assert.ok(!reply.error, reply.error);
    const buffers = preparedTransfers(reply.result);
    assert.ok(buffers.length > 0 && buffers.every(buffer => buffer.byteLength > 0));
    const transferred = structuredClone(reply.result, { transfer: buffers });
    assert.ok(buffers.every(buffer => buffer.byteLength === 0), 'buffers transfer without copies');
    const groups = [];
    for (const _ of assembleDallasChunk(transferred, materials, groups)) {}
    assert.ok(groups.every(group => !group.visible && !group.parent), 'partial results stay detached');
    const scene = new THREE.Scene();
    const expected = addOsmCityData(scene, { ...header, chunks: [JSON.parse(text)] }, options);
    assert.deepEqual(signature(groups, materials), signature(expected.groups, materials));
    setMappedMonsterDamage(true);
    for (const group of groups) for (const mesh of group.children) if (mesh.name === 'osm-monster-damage-target') assert.equal(mesh.visible, false);
    disposeOsmGroups(groups); disposeOsmGroups(expected.groups); setMappedMonsterDamage(false);
  }
});

test('streamer keeps the old LOD visible, rejects stale work, bounds queues and cleans up worker/fallback', async t => {
  const { options, config, numeric } = fixture(t);
  const dir = mkdtempSync(resolve('.dallas-streamer-test-'));
  const outfile = join(dir, 'streamer.mjs');
  await build({ entryPoints: ['client/src/dallas-streamer.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env.DEV': 'false' } });
  const { DallasChunkStreamer } = await import(pathToFileURL(outfile).href);
  const previous = { window: globalThis.window, Worker: globalThis.Worker, fetch: globalThis.fetch };
  const tasks = [], workers = [], signals = [];
  class FakeWorker {
    messages = []; terminated = false;
    constructor() { workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  globalThis.window = { setTimeout: (fn, delay) => { tasks.push({ fn, delay }); return tasks.length; } };
  globalThis.Worker = FakeWorker;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => ({ ...header, chunks: [] }) };
    signals.push(init.signal);
    return new Promise(() => {});
  };
  const streamers = [];
  t.after(() => { streamers.forEach(s => s.dispose()); Object.assign(globalThis, previous); rmSync(dir, { recursive: true, force: true }); });
  const create = async () => {
    const scene = new THREE.Scene(), streamer = new DallasChunkStreamer(scene, options, environment);
    streamers.push(streamer); await new Promise(setImmediate); streamer.lastPosition.set(5000, 150, -9000);
    return { scene, streamer };
  };
  const entry = lod => ({ id: '2_-5', lod, x: 2, z: -5, minX: 4000, maxX: 6000, minZ: -10000, maxZ: -8000, filename: `${lod}/2_-5.json`, bytes: 100 });
  const queue = (s, lod, text = payload(lod)) => {
    const item = entry(lod); s.desired.add(`${lod}:2_-5`); s.pending.add(`${lod}:2_-5`);
    s.buildQueue.push({ entry: item, payload: text, fetchedAt: 0, fetchMs: 0 }); s.processBuildQueue();
  };
  const step = () => { const i = tasks.findIndex(task => task.delay === 0); assert.ok(i >= 0); tasks.splice(i, 1)[0].fn(); };
  const drainAssembly = s => { for (let i = 0; s.building && i < 100; i++) step(); assert.equal(s.building, undefined); };
  const { scene, streamer: s } = await create(), worker = workers[0];
  const coarse = new THREE.Group(); scene.add(coarse);
  s.loaded.set('far:2_-5', { entry: entry('far'), groups: [coarse], bytes: 100, lastUsed: 0 }); s.visibleLod.set('2_-5', 'far');
  queue(s, 'mid'); const job = worker.messages.at(-1), result = prepareDallasChunk(job, numeric);
  worker.reply({ id: job.id - 1, result }); assert.equal(tasks.length, 0, 'stale reply ignored');
  worker.reply({ id: job.id, result }); step();
  assert.equal(coarse.visible, true); assert.equal(scene.children.length, 1); assert.ok(s.building.groups[0].children.length <= 2);
  drainAssembly(s); assert.equal(coarse.visible, false); assert.equal(s.visibleLod.get('2_-5'), 'mid');
  queue(s, 'near'); worker.onerror({ preventDefault() {} });
  assert.equal(worker.terminated, true); assert.equal(s.worker, undefined); drainAssembly(s);
  assert.equal(s.visibleLod.get('2_-5'), 'near'); assert.equal(workers.length, 1, 'one reusable worker');
  s.dispose(); assert.equal(scene.children.length, 0);

  tasks.length = 0;
  const { streamer: cancelled, scene: cancelledScene } = await create();
  queue(cancelled, 'near'); const cancelledWorker = workers.at(-1), cancelledJob = cancelledWorker.messages.at(-1);
  cancelledWorker.reply({ id: cancelledJob.id, result: prepareDallasChunk(cancelledJob, numeric) }); step();
  let disposed = 0;
  cancelled.building.groups[0].children.forEach(mesh => mesh.geometry.addEventListener('dispose', () => disposed++));
  cancelled.desired.clear(); step();
  assert.ok(disposed > 0); assert.equal(cancelledScene.children.length, 0); assert.equal(cancelled.pending.size, 0);
  cancelled.dispose(); cancelledWorker.reply({ id: cancelledJob.id, result }); assert.equal(cancelledScene.children.length, 0);

  tasks.length = 0;
  globalThis.Worker = class { constructor() { throw new Error('Unavailable'); } };
  const { streamer: fallback } = await create();
  queue(fallback, 'near', '{'); assert.equal(fallback.pending.size, 0); assert.equal(fallback.failedFetches, 1);
  queue(fallback, 'near'); drainAssembly(fallback); assert.equal(fallback.loaded.size, 1);
  fallback.dispose();

  const { streamer: bounded } = await create();
  bounded.buildQueue = Array.from({ length: 7 }, () => ({ entry: entry('near'), payload: '', fetchedAt: 0, fetchMs: 0 }));
  bounded.queue = Array.from({ length: 20 }, (_, i) => ({ ...entry('far'), id: `cell-${i}` }));
  bounded.queue.forEach(item => bounded.desired.add(`${item.lod}:${item.id}`));
  bounded.pump(); assert.equal(bounded.activeRequests.size, 1, 'combined fetch/preparation backlog is bounded at eight');
  bounded.dispose(); assert.ok(signals.every(signal => signal.aborted)); assert.equal(bounded.pending.size, 0);
});


test('Love Field imported intersections cannot cover the authored M19 runway', t => {
  const { numeric } = fixture(t);
  for (const lod of ['near', 'mid', 'far']) {
    for (const id of ['-3_-4', '-3_-5']) {
      const chunk = JSON.parse(readFileSync(resolve(`client/public/data/dallas/${lod}/${id}.json`), 'utf8'));
      const result = prepareDallasChunk({ id: 1, header, payload: JSON.stringify(chunk) }, numeric);
      for (const group of result.groups) for (const mesh of group.meshes.filter(m => m.name.startsWith('osm-aeroway'))) {
        const positions = mesh.attributes.position.array;
        for (let i = 0; i < positions.length; i += 9) {
          const xs = [positions[i],positions[i+3],positions[i+6]], zs = [positions[i+2],positions[i+5],positions[i+8]];
          assert(!(Math.min(...xs) <= -5117 && Math.max(...xs) >= -5163 && Math.min(...zs) <= -6430 && Math.max(...zs) >= -9130), `${lod}/${id}: imported deck overlaps the playable runway`);
        }
      }
    }
  }
  // Aeroways outside authored airport grounds still render normally.
  const chunk = { x: 0, z: 0, r: [], b: [], w: [], p: [], a: [0, 1000, 1000, 1100, 1000, 46] };
  const result = prepareDallasChunk({ id: 2, header, payload: JSON.stringify(chunk) }, numeric);
  assert(result.groups.some(g => g.meshes.some(m => m.name === 'osm-aeroway-0' && m.attributes.position.array.length > 0)));
});
