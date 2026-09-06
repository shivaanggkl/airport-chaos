import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataDirectory = resolve(process.argv[2] ?? 'client/public/data/dallas');
const manifest = JSON.parse(await readFile(resolve(dataDirectory, 'manifest.json'), 'utf8'));
const roads = [];
const water = [];

for (const entry of manifest.chunks) {
  if (entry.lod !== 'far') continue;
  const chunk = JSON.parse(await readFile(resolve(dataDirectory, entry.filename), 'utf8'));
  for (let index = 0; index < chunk.r.length; index += 6) {
    const roadClass = chunk.r[index];
    roads.push(roadClass, chunk.r[index + 2], chunk.r[index + 3], chunk.r[index + 4], chunk.r[index + 5]);
  }
  for (const polygon of chunk.w ?? []) {
    if (polygon.length < 6) continue;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (let index = 0; index < polygon.length; index += 2) {
      minX = Math.min(minX, polygon[index]); maxX = Math.max(maxX, polygon[index]);
      minZ = Math.min(minZ, polygon[index + 1]); maxZ = Math.max(maxZ, polygon[index + 1]);
    }
    // The map keeps named water and river-scale forms while omitting invisible ponds.
    if ((maxX - minX) * (maxZ - minZ) >= 12_000) water.push(polygon);
  }
}

const output = { v: 1, roads, water };
await writeFile(resolve(dataDirectory, 'map.json'), JSON.stringify(output));
console.log(JSON.stringify({ roadSegments: roads.length / 5, waterPolygons: water.length }, null, 2));
