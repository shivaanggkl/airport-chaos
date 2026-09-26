import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const source = JSON.parse(await readFile(resolve(projectRoot, 'client/src/data/dallas-source.json'), 'utf8'));
const cacheDirectory = resolve(projectRoot, '.cache/osm');
const rawPbf = resolve(cacheDirectory, 'texas-latest.osm.pbf');
const extractedPbf = resolve(cacheDirectory, 'dallas-bounds.osm.pbf');
const filteredPbf = resolve(cacheDirectory, 'dallas-features.osm.pbf');
const provenancePath = resolve(cacheDirectory, 'dallas-provenance.json');
const outputPath = resolve(projectRoot, process.argv[2] ?? '.cache/osm/dallas-source.json');
const execFileAsync = promisify(execFile);
const bbox = `${source.bounds.west},${source.bounds.south},${source.bounds.east},${source.bounds.north}`;
const sourceUrl = 'https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf';

async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function run(command, args) { await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 }); }
async function recordedProvenance() {
  try { return JSON.parse(await readFile(provenancePath, 'utf8')); }
  catch { return {}; }
}
async function osmSnapshotAt() {
  for (const key of ['header.option.osmosis_replication_timestamp', 'header.option.timestamp']) {
    try {
      const { stdout } = await execFileAsync('osmium', ['fileinfo', '-g', key, rawPbf]);
      if (stdout.trim()) return stdout.trim();
    } catch { /* Older source files may not expose a snapshot timestamp. */ }
  }
  return 'not recorded';
}

const previous = await recordedProvenance();
let downloadedAt = previous.downloadedAt ?? 'not recorded';
let extractedAt = previous.extractedAt ?? 'not recorded';
if (!await exists(rawPbf)) {
  await mkdir(cacheDirectory, { recursive: true });
  await run('curl', ['--location', '--fail', '--continue-at', '-', '--output', rawPbf, sourceUrl]);
  downloadedAt = new Date().toISOString();
}
let extractedThisRun = false;
if (!await exists(extractedPbf)) {
  await run('osmium', ['extract', '--bbox', bbox, '--strategy', 'complete_ways', '--overwrite', '--output', extractedPbf, rawPbf]);
  extractedThisRun = true;
}
if (!await exists(filteredPbf)) {
  await run('osmium', ['tags-filter', '--overwrite', '--output', filteredPbf, extractedPbf, 'w/building', 'w/highway', 'w/aeroway', 'w/water', 'w/waterway', 'w/railway', 'w/landuse', 'w/leisure', 'w/natural', 'r/type=multipolygon']);
  extractedThisRun = true;
}
if (extractedThisRun) extractedAt = new Date().toISOString();
const provenance = {
  derivedFrom: 'OpenStreetMap',
  provider: 'Geofabrik GmbH',
  sourceUrl,
  downloadedAt,
  osmSnapshotAt: await osmSnapshotAt(),
  extractedAt,
  geographicBounds: source.bounds,
  importer: 'scripts/extract-dallas-pbf.mjs',
  pipeline: 'Geofabrik Texas PBF -> osmium extract/tags-filter -> compact Dallas dataset -> streaming chunks/map cache',
  pipelineVersion: 1,
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(JSON.stringify({ bounds: source.bounds, texasPbf: (await stat(rawPbf)).size, extractedPbf: (await stat(extractedPbf)).size, filteredPbf: (await stat(filteredPbf)).size, outputPath: filteredPbf }, null, 2));
process.exit(0);

const elements = [];
const stats = { buildings: 0, roads: 0, landuse: 0, water: 0, aeroways: 0, rail: 0 };
const useful = (tags) => tags.building || tags.highway || tags.aeroway || tags.water || tags.waterway || tags.railway || tags.landuse || tags.leisure || tags.natural;
const addFeature = (feature, coordinates) => {
  const tags = feature.properties ?? {};
  if (!useful(tags) || !Array.isArray(coordinates) || coordinates.length < 2) return;
  elements.push({ type: 'way', id: feature.id ?? elements.length, tags, geometry: coordinates.map(([lon, lat]) => ({ lon, lat })) });
  if (tags.building) stats.buildings += 1;
  if (tags.highway) stats.roads += 1;
  if (tags.landuse || tags.leisure || tags.natural) stats.landuse += 1;
  if (tags.water || tags.waterway || tags.natural === 'water') stats.water += 1;
  if (tags.aeroway) stats.aeroways += 1;
  if (tags.railway) stats.rail += 1;
};
const exporter = spawn('osmium', ['export', '--geometry-types', 'linestring,polygon', '--output-format', 'geojsonseq', '--output', '-', filteredPbf], { stdio: ['ignore', 'pipe', 'inherit'] });
const lines = createInterface({ input: exporter.stdout, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const feature = JSON.parse(line.replace(/^\u001e/, ''));
  if (feature.geometry?.type === 'LineString') addFeature(feature, feature.geometry.coordinates);
  else if (feature.geometry?.type === 'Polygon') addFeature(feature, feature.geometry.coordinates[0]);
  else if (feature.geometry?.type === 'MultiPolygon') for (const polygon of feature.geometry.coordinates) addFeature(feature, polygon[0]);
}
await new Promise((resolve, reject) => exporter.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`osmium export failed (${code})`))));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ source: 'Geofabrik Texas OSM PBF local extract', bounds: source.bounds, elements })}\n`);
const sizes = { texasPbf: (await stat(rawPbf)).size, extractedPbf: (await stat(extractedPbf)).size, filteredPbf: (await stat(filteredPbf)).size, sourceJson: (await stat(outputPath)).size };
console.log(JSON.stringify({ bounds: source.bounds, sourceFeatures: elements.length, ...stats, sizes, outputPath }, null, 2));
