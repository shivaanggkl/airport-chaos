import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: node scripts/fetch-dallas-osm.mjs <output.json>');
if (!process.argv.includes('--remote')) {
  const { spawn } = await import('node:child_process');
  const run = async (args, env = process.env) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env });
    await new Promise((resolve, reject) => child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Local Dallas PBF import failed (${code})`))));
  };
  await run(['scripts/extract-dallas-pbf.mjs']);
  const source = JSON.parse(await readFile(new URL('../client/src/data/dallas-source.json', import.meta.url), 'utf8'));
  await run(['scripts/preprocess-osm.mjs', '.cache/osm/dallas-features.osm.pbf', outputPath], {
    ...process.env,
    OSM_SOURCE: JSON.stringify({ name: source.name, originLat: source.origin.lat, originLon: source.origin.lon, targetX: source.target.x, targetZ: source.target.z, worldHalfSize: source.worldHalfSize, chunkSize: source.chunkSize }),
    ELEVATION_DATA: 'client/src/data/dallas-elevation.json',
  });
  process.exit(0);
}

// Matches the configured 50 km City 1 bounds around the Dallas world origin.
const bounds = { south: 32.5506, west: -97.064, north: 33.0028, east: -96.53 };
const tileLatitude = 0.09;
const tileLongitude = 0.11;
const endpoint = process.env.OVERPASS_URL ?? 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const execFileAsync = promisify(execFile);
const featureQuery = [
  'way["building"](S,W,N,E);',
  'way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|living_street|unclassified)$"](S,W,N,E);',
  'way["railway"~"^(rail|light_rail|subway|tram)$"](S,W,N,E);',
  'way["landuse"](S,W,N,E);',
  'way["leisure"~"^(park|garden|nature_reserve|golf_course)$"](S,W,N,E);',
  'way["natural"~"^(water|wood|wetland|scrub)$"](S,W,N,E);',
  'way["waterway"~"^(riverbank|river|canal|stream)$"](S,W,N,E);',
  'way["aeroway"~"^(runway|taxiway|apron|terminal|hangar|aerodrome)$"](S,W,N,E);',
].join('\n');

function tiles() {
  const result = [];
  for (let south = bounds.south; south < bounds.north - 0.00001; south += tileLatitude) {
    for (let west = bounds.west; west < bounds.east - 0.00001; west += tileLongitude) {
      result.push({ south, west, north: Math.min(bounds.north, south + tileLatitude), east: Math.min(bounds.east, west + tileLongitude) });
    }
  }
  return result;
}

function queryFor(tile) {
  const box = `${tile.south},${tile.west},${tile.north},${tile.east}`;
  return `[out:json][timeout:180];(\n${featureQuery.replaceAll('S,W,N,E', box)}\n);out geom;`;
}

function splitTile(tile) {
  const middleLat = (tile.south + tile.north) / 2;
  const middleLon = (tile.west + tile.east) / 2;
  return [
    { south: tile.south, west: tile.west, north: middleLat, east: middleLon },
    { south: tile.south, west: middleLon, north: middleLat, east: tile.east },
    { south: middleLat, west: tile.west, north: tile.north, east: middleLon },
    { south: middleLat, west: middleLon, north: tile.north, east: tile.east },
  ];
}

async function fetchTile(tile, splitDepth = 0) {
  try {
    const { stdout } = await execFileAsync('curl', [
      '--silent', '--show-error', '--fail', '--connect-timeout', '20', '--max-time', '45',
      '--retry', '1', '--retry-all-errors', '--retry-delay', '3',
      '--user-agent', 'Airport-Chaos-Dallas-Offline-Importer/1.0',
      '--data-urlencode', `data=${queryFor(tile)}`, endpoint,
    ], { maxBuffer: 256 * 1024 * 1024 });
    return JSON.parse(stdout).elements ?? [];
  } catch (error) {
    if (splitDepth < 2) {
      const elements = [];
      for (const child of splitTile(tile)) elements.push(...await fetchTile(child, splitDepth + 1));
      return elements;
    }
    throw error;
  }
}

const seen = new Set();
const elements = [];
const allTiles = tiles();
const cacheDirectory = `${outputPath}.tiles`;
await mkdir(cacheDirectory, { recursive: true });
for (const [index, tile] of allTiles.entries()) {
  const cachePath = join(cacheDirectory, `${index}.json`);
  let tileElements;
  try {
    tileElements = JSON.parse(await readFile(cachePath, 'utf8'));
    console.log(`Dallas OSM ${index + 1}/${allTiles.length}: restored ${tileElements.length} features`);
  } catch {
    tileElements = await fetchTile(tile);
    await writeFile(cachePath, JSON.stringify(tileElements));
    console.log(`Dallas OSM ${index + 1}/${allTiles.length}: ${tileElements.length} features`);
  }
  for (const element of tileElements) {
    const key = `${element.type}:${element.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      elements.push(element);
    }
  }
}

await writeFile(outputPath, `${JSON.stringify({ source: 'OpenStreetMap Dallas 50 km bounds', bounds, elements })}\n`);
console.log(JSON.stringify({ tiles: allTiles.length, features: elements.length, outputPath }, null, 2));
