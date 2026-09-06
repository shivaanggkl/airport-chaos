import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = resolve(process.argv[2] ?? 'client/src/data/dallas-osm.json');
const output = resolve(process.argv[3] ?? 'client/public/data/dallas');
const city = JSON.parse(await readFile(input, 'utf8'));
await rm(output, { recursive: true, force: true });
await Promise.all(['near', 'mid', 'far'].map((lod) => mkdir(resolve(output, lod), { recursive: true })));

function polygonBounds(building) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 4; i < building.length - 1; i += 2) { minX = Math.min(minX, building[i]); maxX = Math.max(maxX, building[i]); minZ = Math.min(minZ, building[i + 1]); maxZ = Math.max(maxZ, building[i + 1]); }
  return { minX, maxX, minZ, maxZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}
function lodChunk(chunk, grid, minRoadClass) {
  const masses = new Map();
  for (const building of chunk.b) {
    const box = polygonBounds(building);
    const key = `${Math.floor(box.x / grid)}:${Math.floor(box.z / grid)}`;
    const previous = masses.get(key);
    if (previous) { previous.minX = Math.min(previous.minX, box.minX); previous.maxX = Math.max(previous.maxX, box.maxX); previous.minZ = Math.min(previous.minZ, box.minZ); previous.maxZ = Math.max(previous.maxZ, box.maxZ); previous.height = Math.max(previous.height, building[0]); previous.base = Math.min(previous.base, building[3]); }
    else masses.set(key, { ...box, height: building[0], base: building[3] });
  }
  const b = [...masses.values()].map((m) => [Math.max(10, Math.round(m.height * (grid === 360 ? 0.72 : 0.5) + (grid === 360 ? 7 : 9))), 2, 0, m.base, m.minX - 8, m.minZ - 8, m.maxX + 8, m.minZ - 8, m.maxX + 8, m.maxZ + 8, m.minX - 8, m.maxZ + 8]);
  const r = [];
  for (let i = 0; i < chunk.r.length; i += 6) if (chunk.r[i] >= minRoadClass) r.push(...chunk.r.slice(i, i + 6));
  return { x: chunk.x, z: chunk.z, r, b, w: chunk.w, p: grid === 360 ? chunk.p : [], a: grid === 360 ? (chunk.a ?? []) : [] };
}
const manifest = { v: city.v, source: city.source, attribution: city.attribution, license: city.license, chunkSize: city.chunkSize, chunks: [] };
for (const chunk of city.chunks) {
  const id = `${chunk.x}_${chunk.z}`;
  const variants = { near: chunk, mid: lodChunk(chunk, 360, 2), far: lodChunk(chunk, 1000, 3) };
  for (const [lod, data] of Object.entries(variants)) {
    const filename = `${lod}/${id}.json`;
    const path = resolve(output, filename);
    await writeFile(path, JSON.stringify(data));
    manifest.chunks.push({ id, lod, x: chunk.x, z: chunk.z, minX: chunk.x * city.chunkSize, maxX: (chunk.x + 1) * city.chunkSize, minZ: chunk.z * city.chunkSize, maxZ: (chunk.z + 1) * city.chunkSize, filename, bytes: (await stat(path)).size });
  }
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest));
console.log(JSON.stringify({ chunks: city.chunks.length, files: manifest.chunks.length, bytes: (await stat(resolve(output, 'manifest.json'))).size }, null, 2));
