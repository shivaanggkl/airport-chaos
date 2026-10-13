import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { representativeBuildings } from './dallas-lod.mjs';

// Tracked v3 Near chunks are canonical. Never rewrite their detailed geometry
// or collision provenance while correcting the visual Mid/Far representations.
const directory = resolve(process.argv[2] ?? 'client/public/data/dallas');
const manifestPath = resolve(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.v !== 3) throw new Error('Expected Dallas v3 Near chunks');
const entries = new Map(manifest.chunks.map(entry => [`${entry.lod}:${entry.id}`, entry]));

for (const entry of manifest.chunks.filter(({ lod }) => lod === 'near')) {
  const near = JSON.parse(await readFile(resolve(directory, entry.filename), 'utf8'));
  for (const [lod, grid] of [['mid', 360], ['far', 1000]]) {
    const target = entries.get(`${lod}:${entry.id}`);
    if (!target) throw new Error(`Missing ${lod} chunk for ${entry.id}`);
    const path = resolve(directory, target.filename);
    const chunk = JSON.parse(await readFile(path, 'utf8'));
    chunk.b = representativeBuildings(near.b, grid);
    await writeFile(path, JSON.stringify(chunk));
    target.bytes = (await stat(path)).size;
  }
}
await writeFile(manifestPath, JSON.stringify(manifest));
console.log(`Updated Mid/Far buildings for ${manifest.chunks.length / 3} Dallas cells; Near unchanged.`);
