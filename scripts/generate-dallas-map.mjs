import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataDirectory = resolve(process.argv[2] ?? 'client/public/data/dallas');
const manifest = JSON.parse(await readFile(resolve(dataDirectory, 'manifest.json'), 'utf8'));
const roads = [];
const water = [];
const land = [];
// The map cache resolves ~24m/pixel; sub-pixel polygon edges add no detail.
function mapOutline(polygon, start = 0) {
  const result = polygon.slice(0, start + 2);
  let x = polygon[start], z = polygon[start + 1];
  for (let i = start + 2; i < polygon.length; i += 2) {
    if (Math.hypot(polygon[i] - x, polygon[i + 1] - z) < 12) continue;
    x = polygon[i]; z = polygon[i + 1]; result.push(x, z);
  }
  return result.length >= start + 6 ? result : polygon;
}

for (const entry of manifest.chunks) {
  if (entry.lod !== 'far' && entry.lod !== 'mid') continue;
  const chunk = JSON.parse(await readFile(resolve(dataDirectory, entry.filename), 'utf8'));
  for (let index = 0; index < chunk.r.length; index += 6) {
    const roadClass = chunk.r[index];
    if (entry.lod === 'mid' && roadClass !== 2) continue;
    roads.push(roadClass, chunk.r[index + 2], chunk.r[index + 3], chunk.r[index + 4], chunk.r[index + 5]);
  }
  if (entry.lod === 'mid') {
    for (const polygon of chunk.p ?? []) {
      if (polygon.length >= 7 && polygon[0] <= 1) {
        let area = 0;
        for (let i = 1; i < polygon.length; i += 2) {
          const j = i + 2 < polygon.length ? i + 2 : 1;
          area += polygon[i] * polygon[j + 1] - polygon[j] * polygon[i + 1];
        }
        if (Math.abs(area) >= 80_000) land.push(mapOutline(polygon, 1));
      }
    }
    continue;
  }
  for (const polygon of chunk.w ?? []) {
    if (polygon.length < 6) continue;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (let index = 0; index < polygon.length; index += 2) {
      minX = Math.min(minX, polygon[index]); maxX = Math.max(maxX, polygon[index]);
      minZ = Math.min(minZ, polygon[index + 1]); maxZ = Math.max(maxZ, polygon[index + 1]);
    }
    // The map keeps named water and river-scale forms while omitting invisible ponds.
    if ((maxX - minX) * (maxZ - minZ) >= 12_000) water.push(mapOutline(polygon));
  }
}

const output = { v: 2, roads, water, land };
await writeFile(resolve(dataDirectory, 'map.json'), JSON.stringify(output));
console.log(JSON.stringify({ roadSegments: roads.length / 5, waterPolygons: water.length }, null, 2));
