import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/preprocess-osm.mjs <overpass.json> <output.json>');
}

const DEFAULT_SOURCE = {
  name: 'Milwaukee, Wisconsin, USA',
  originLat: 43.0389,
  originLon: -87.9065,
  targetX: -1420,
  targetZ: -2820,
  worldHalfSize: 6000,
  chunkSize: 1000,
};
const SOURCE = process.env.OSM_SOURCE ? { ...DEFAULT_SOURCE, ...JSON.parse(process.env.OSM_SOURCE) } : DEFAULT_SOURCE;
const elevationPath = process.env.ELEVATION_DATA;
const metersPerLon = 111_320 * Math.cos(SOURCE.originLat * Math.PI / 180);
const metersPerLat = 110_540;

let elevationData = null;
let elevationSamples = null;
if (elevationPath) {
  elevationData = JSON.parse(await readFile(elevationPath, 'utf8'));
  const bytes = Buffer.from(elevationData.elevations, 'base64');
  elevationSamples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function sampledElevation(x, z) {
  if (!elevationData || !elevationSamples) return null;
  const normalizedX = Math.max(0, Math.min(elevationData.width - 1, (x - elevationData.bounds.minX) / (elevationData.bounds.maxX - elevationData.bounds.minX) * (elevationData.width - 1)));
  const normalizedZ = Math.max(0, Math.min(elevationData.height - 1, (z - elevationData.bounds.minZ) / (elevationData.bounds.maxZ - elevationData.bounds.minZ) * (elevationData.height - 1)));
  const x0 = Math.floor(normalizedX);
  const z0 = Math.floor(normalizedZ);
  const x1 = Math.min(elevationData.width - 1, x0 + 1);
  const z1 = Math.min(elevationData.height - 1, z0 + 1);
  const blendX = normalizedX - x0;
  const blendZ = normalizedZ - z0;
  const valueAt = (sampleX, sampleZ) => elevationData.baseElevation + elevationSamples[sampleZ * elevationData.width + sampleX] * elevationData.scale;
  return (valueAt(x0, z0) * (1 - blendX) + valueAt(x1, z0) * blendX) * (1 - blendZ) + (valueAt(x0, z1) * (1 - blendX) + valueAt(x1, z1) * blendX) * blendZ;
}

function project(point) {
  return [
    Math.round(SOURCE.targetX + (point.lon - SOURCE.originLon) * metersPerLon),
    Math.round(SOURCE.targetZ - (point.lat - SOURCE.originLat) * metersPerLat),
  ];
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [x1, z1] = points[start];
    const [x2, z2] = points[end];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSquared = dx * dx + dz * dz;
    let farthest = -1;
    let farthestDistance = toleranceSquared;
    for (let index = start + 1; index < end; index += 1) {
      const [x, z] = points[index];
      const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / lengthSquared));
      const offsetX = x - (x1 + dx * progress);
      const offsetZ = z - (z1 + dz * progress);
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared > farthestDistance) {
        farthest = index;
        farthestDistance = distanceSquared;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index][0] * points[next][1] - points[next][0] * points[index][1];
  }
  return Math.abs(area) / 2;
}

function polygonCenter(points) {
  let x = 0;
  let z = 0;
  for (const point of points) {
    x += point[0];
    z += point[1];
  }
  return [x / points.length, z / points.length];
}

function parseMeters(value) {
  if (typeof value !== 'string') return null;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  if (value.includes("'") || value.toLowerCase().includes('ft')) return numeric * 0.3048;
  return numeric;
}

function buildingHeight(tags, area, center) {
  const explicit = parseMeters(tags.height);
  if (explicit !== null) return { height: Math.max(4, Math.min(350, explicit)), source: 1 };
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(levels)) return { height: Math.max(4, Math.min(260, levels * 3.2 + 1.2)), source: 2 };
  const kind = tags.building ?? 'yes';
  if (/^(house|detached|semidetached_house|terrace|bungalow|residential)$/.test(kind)) return { height: kind === 'bungalow' ? 4.5 : 8, source: 0 };
  if (/^(garage|garages|shed|roof|carport)$/.test(kind)) return { height: 3.5, source: 0 };
  if (/^(industrial|warehouse|hangar)$/.test(kind)) return { height: area > 6000 ? 18 : 12, source: 0 };
  if (/^(apartments|dormitory|hotel)$/.test(kind)) return { height: area > 1800 ? 24 : 17, source: 0 };
  if (/^(office|commercial|retail|civic|hospital|school|university)$/.test(kind)) return { height: area > 3500 ? 30 : 16, source: 0 };
  const downtownDistance = Math.hypot(center[0] - SOURCE.targetX, center[1] - SOURCE.targetZ);
  if (downtownDistance < 1200 && area > 450) return { height: Math.min(70, 22 + area / 180), source: 0 };
  if (area > 5000) return { height: 22, source: 0 };
  if (area > 1200) return { height: 14, source: 0 };
  return { height: 8, source: 0 };
}

function buildingFamily(tags, height) {
  const kind = tags.building ?? 'yes';
  if (/^(house|detached|semidetached_house|terrace|bungalow|residential)$/.test(kind)) return 0;
  if (/^(industrial|warehouse|hangar|garage|garages|shed)$/.test(kind)) return 4;
  if (/^(apartments|dormitory|hotel)$/.test(kind)) return 1;
  if (/^(office|commercial|retail)$/.test(kind) || height >= 45) return 3;
  return 2;
}

function roadClass(highway) {
  if (highway === 'motorway' || highway === 'motorway_link' || highway === 'trunk' || highway === 'trunk_link') return 4;
  if (highway === 'primary' || highway === 'primary_link') return 3;
  if (highway === 'secondary' || highway === 'secondary_link') return 2;
  if (highway === 'tertiary' || highway === 'tertiary_link') return 1;
  return 0;
}

function landFamily(tags) {
  const landuse = tags.landuse ?? '';
  if (tags.aeroway === 'aerodrome' || landuse === 'airport') return 6;
  if (landuse === 'industrial') return 2;
  if (landuse === 'commercial' || landuse === 'retail') return 4;
  if (landuse === 'residential') return 3;
  if (/^(farmland|farmyard|orchard|vineyard|meadow)$/.test(landuse)) return 5;
  if (tags.natural === 'wood' || landuse === 'forest') return 1;
  return 0;
}

function ribbon(points, width) {
  if (points.length < 2) return [];
  const left = [];
  const right = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz) || 1;
    const offsetX = -dz / length * width / 2;
    const offsetZ = dx / length * width / 2;
    left.push([points[index][0] + offsetX, points[index][1] + offsetZ]);
    right.push([points[index][0] - offsetX, points[index][1] - offsetZ]);
  }
  return left.concat(right.reverse());
}

const chunks = new Map();

async function* sourceElements() {
  if (!inputPath.endsWith('.pbf')) {
    const sourceData = JSON.parse(await readFile(inputPath, 'utf8'));
    yield* sourceData.elements ?? [];
    return;
  }
  const exporter = spawn('osmium', ['export', '--geometry-types', 'linestring,polygon', '--output-format', 'geojsonseq', '--output', '-', inputPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = createInterface({ input: exporter.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const feature = JSON.parse(line.replace(/^\u001e/, ''));
    const tags = feature.properties ?? {};
    const geometry = feature.geometry;
    const add = (coordinates) => ({ type: 'way', tags, geometry: coordinates.map(([lon, lat]) => ({ lon, lat })) });
    if (geometry?.type === 'LineString') yield add(geometry.coordinates);
    else if (geometry?.type === 'Polygon') yield add(geometry.coordinates[0]);
    else if (geometry?.type === 'MultiPolygon') for (const polygon of geometry.coordinates) yield add(polygon[0]);
  }
  await new Promise((resolve, reject) => exporter.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`osmium export failed (${code})`))));
}

function getChunk(x, z) {
  const chunkX = Math.floor(x / SOURCE.chunkSize);
  const chunkZ = Math.floor(z / SOURCE.chunkSize);
  const key = `${chunkX}:${chunkZ}`;
  let chunk = chunks.get(key);
  if (!chunk) {
    chunk = { x: chunkX, z: chunkZ, r: [], b: [], w: [], p: [], a: [] };
    chunks.set(key, chunk);
  }
  return chunk;
}

for await (const element of sourceElements()) {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) continue;
  const tags = element.tags ?? {};
  const projected = element.geometry.map(project);
  if (tags.highway || tags.railway) {
    const points = simplify(projected, tags.highway === 'residential' || tags.highway === 'unclassified' ? 3 : 1.5);
    const classification = tags.railway ? 5 : roadClass(tags.highway);
    const bridge = tags.bridge && tags.bridge !== 'no' ? 1 : 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const [x1, z1] = points[index];
      const [x2, z2] = points[index + 1];
      const centerX = (x1 + x2) / 2;
      const centerZ = (z1 + z2) / 2;
      if (Math.abs(centerX) > SOURCE.worldHalfSize || Math.abs(centerZ) > SOURCE.worldHalfSize) continue;
      if (Math.hypot(x2 - x1, z2 - z1) < 3) continue;
      getChunk(centerX, centerZ).r.push(classification, bridge, x1, z1, x2, z2);
    }
    continue;
  }

  if (tags.aeroway === 'runway' || tags.aeroway === 'taxiway') {
    const points = simplify(projected, 1.5);
    const width = Math.max(8, Math.min(80, parseMeters(tags.width) ?? (tags.aeroway === 'runway' ? 46 : 22)));
    const kind = tags.aeroway === 'runway' ? 0 : 1;
    for (let index = 0; index < points.length - 1; index += 1) {
      const [x1, z1] = points[index];
      const [x2, z2] = points[index + 1];
      const centerX = (x1 + x2) / 2;
      const centerZ = (z1 + z2) / 2;
      if (Math.abs(centerX) > SOURCE.worldHalfSize || Math.abs(centerZ) > SOURCE.worldHalfSize || Math.hypot(x2 - x1, z2 - z1) < 3) continue;
      getChunk(centerX, centerZ).a.push(kind, x1, z1, x2, z2, Math.round(width * 10) / 10);
    }
    continue;
  }

  const closed = projected.length >= 4 && projected[0][0] === projected.at(-1)[0] && projected[0][1] === projected.at(-1)[1];
  if (!closed) {
    if (tags.waterway === 'river' || tags.waterway === 'canal' || tags.waterway === 'stream') {
      const points = ribbon(simplify(projected, 3), Math.max(8, Math.min(120, parseMeters(tags.width) ?? (tags.waterway === 'river' ? 45 : tags.waterway === 'canal' ? 22 : 8))));
      if (points.length >= 3) {
        const center = polygonCenter(points);
        if (Math.abs(center[0]) <= SOURCE.worldHalfSize && Math.abs(center[1]) <= SOURCE.worldHalfSize) getChunk(center[0], center[1]).w.push(points.flat());
      }
    }
    continue;
  }
  projected.pop();
  const points = simplify(projected.concat([projected[0]]), 1.2);
  points.pop();
  if (points.length < 3) continue;
  const center = polygonCenter(points);
  if (Math.abs(center[0]) > SOURCE.worldHalfSize || Math.abs(center[1]) > SOURCE.worldHalfSize) continue;
  const area = polygonArea(points);
  const flat = points.flat();

  if (tags.building) {
    if (area < 24 || /^(roof|carport)$/.test(tags.building)) continue;
    const inferred = buildingHeight(tags, area, center);
    const height = Math.round(inferred.height * 10) / 10;
    const family = buildingFamily(tags, height);
    const baseElevation = sampledElevation(center[0], center[1]);
    getChunk(center[0], center[1]).b.push(baseElevation === null ? [height, family, inferred.source, ...flat] : [height, family, inferred.source, Math.round(baseElevation * 10) / 10, ...flat]);
  } else if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.waterway === 'river' || tags.waterway === 'canal') {
    if (area >= 500) getChunk(center[0], center[1]).w.push(flat);
  } else if (tags.aeroway === 'apron') {
    if (area >= 300) getChunk(center[0], center[1]).p.push([7, ...flat]);
  } else if (tags.leisure === 'park' || tags.landuse || tags.natural === 'wood' || tags.aeroway === 'aerodrome') {
    const kind = landFamily(tags);
    const minimumArea = kind === 2 || kind === 4 || kind === 7 ? 5000 : 1800;
    if (area >= minimumArea) getChunk(center[0], center[1]).p.push([kind, ...flat]);
  }
}

const compact = {
  v: elevationData ? 3 : 2,
  source: SOURCE.name,
  attribution: '© OpenStreetMap contributors',
  license: 'https://www.openstreetmap.org/copyright',
  origin: [SOURCE.originLat, SOURCE.originLon],
  target: [SOURCE.targetX, SOURCE.targetZ],
  chunkSize: SOURCE.chunkSize,
  chunks: [...chunks.values()].sort((a, b) => a.z - b.z || a.x - b.x),
};

await writeFile(outputPath, `${JSON.stringify(compact)}\n`);
const totals = compact.chunks.reduce((sum, chunk) => {
  sum.roads += chunk.r.length / 6;
  sum.buildings += chunk.b.length;
  sum.water += chunk.w.length;
  sum.landuse += chunk.p.length;
  sum.aeroways += chunk.a.length / 6;
  return sum;
}, { roads: 0, buildings: 0, water: 0, landuse: 0, aeroways: 0 });
console.log(JSON.stringify({ outputPath, chunks: compact.chunks.length, ...totals }, null, 2));
