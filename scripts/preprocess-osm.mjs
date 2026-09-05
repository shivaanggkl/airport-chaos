import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/preprocess-osm.mjs <overpass.json> <output.json>');
}

const SOURCE = {
  name: 'Milwaukee, Wisconsin, USA',
  originLat: 43.0389,
  originLon: -87.9065,
  targetX: -1420,
  targetZ: -2820,
  worldHalfSize: 6000,
  chunkSize: 1000,
};
const metersPerLon = 111_320 * Math.cos(SOURCE.originLat * Math.PI / 180);
const metersPerLat = 110_540;

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
  if (explicit !== null) return Math.max(4, Math.min(350, explicit));
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(levels)) return Math.max(4, Math.min(260, levels * 3.2 + 1.2));
  const kind = tags.building ?? 'yes';
  if (/^(house|detached|semidetached_house|terrace|bungalow|residential)$/.test(kind)) return kind === 'bungalow' ? 4.5 : 8;
  if (/^(garage|garages|shed|roof|carport)$/.test(kind)) return 3.5;
  if (/^(industrial|warehouse|hangar)$/.test(kind)) return area > 6000 ? 18 : 12;
  if (/^(apartments|dormitory|hotel)$/.test(kind)) return area > 1800 ? 24 : 17;
  if (/^(office|commercial|retail|civic|hospital|school|university)$/.test(kind)) return area > 3500 ? 30 : 16;
  const downtownDistance = Math.hypot(center[0] - SOURCE.targetX, center[1] - SOURCE.targetZ);
  if (downtownDistance < 1200 && area > 450) return Math.min(70, 22 + area / 180);
  if (area > 5000) return 22;
  if (area > 1200) return 14;
  return 8;
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
  if (highway === 'motorway' || highway === 'trunk') return 4;
  if (highway === 'primary') return 3;
  if (highway === 'secondary') return 2;
  if (highway === 'tertiary') return 1;
  return 0;
}

const sourceData = JSON.parse(await readFile(inputPath, 'utf8'));
const chunks = new Map();
const buildingCells = new Map();

function getChunk(x, z) {
  const chunkX = Math.floor(x / SOURCE.chunkSize);
  const chunkZ = Math.floor(z / SOURCE.chunkSize);
  const key = `${chunkX}:${chunkZ}`;
  let chunk = chunks.get(key);
  if (!chunk) {
    chunk = { x: chunkX, z: chunkZ, r: [], b: [], w: [], p: [] };
    chunks.set(key, chunk);
  }
  return chunk;
}

for (const element of sourceData.elements ?? []) {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) continue;
  const tags = element.tags ?? {};
  const projected = element.geometry.map(project);
  if (tags.highway) {
    const points = simplify(projected, tags.highway === 'residential' || tags.highway === 'unclassified' ? 3 : 1.5);
    const classification = roadClass(tags.highway);
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

  const closed = projected.length >= 4 && projected[0][0] === projected.at(-1)[0] && projected[0][1] === projected.at(-1)[1];
  if (!closed) continue;
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
    const height = Math.round(buildingHeight(tags, area, center) * 10) / 10;
    const family = buildingFamily(tags, height);
    const cellKey = `${Math.floor(center[0] / 250)}:${Math.floor(center[1] / 250)}`;
    const list = buildingCells.get(cellKey) ?? [];
    list.push({ center, area, explicit: Boolean(tags.height || tags['building:levels']), data: [height, family, ...flat] });
    buildingCells.set(cellKey, list);
  } else if (tags.natural === 'water' || tags.waterway === 'riverbank') {
    if (area >= 500) getChunk(center[0], center[1]).w.push(flat);
  } else if (tags.leisure === 'park' || tags.landuse) {
    const kind = tags.landuse === 'forest' ? 1 : tags.landuse === 'industrial' || tags.landuse === 'commercial' ? 2 : 0;
    const minimumArea = kind === 2 ? 8000 : 1800;
    if (area >= minimumArea) getChunk(center[0], center[1]).p.push([kind, ...flat]);
  }
}

for (const list of buildingCells.values()) {
  list.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.data[0] - a.data[0] || b.area - a.area);
  for (const building of list.slice(0, 24)) {
    getChunk(building.center[0], building.center[1]).b.push(building.data);
  }
}

const compact = {
  v: 1,
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
  return sum;
}, { roads: 0, buildings: 0, water: 0, landuse: 0 });
console.log(JSON.stringify({ outputPath, chunks: compact.chunks.length, ...totals }, null, 2));
