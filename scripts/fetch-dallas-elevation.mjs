import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[2] ?? 'client/src/data/dallas-elevation.json';
const originLat = 32.7767;
const originLon = -96.797;
const worldHalfSize = 25_000;
const width = 257;
const height = 257;
const metersPerLon = 111_320 * Math.cos(originLat * Math.PI / 180);
const metersPerLat = 110_540;
const bbox = {
  minLon: originLon - worldHalfSize / metersPerLon,
  maxLon: originLon + worldHalfSize / metersPerLon,
  minLat: originLat - worldHalfSize / metersPerLat,
  maxLat: originLat + worldHalfSize / metersPerLat,
};

function typeSize(type) {
  return ({ 3: 2, 4: 4, 12: 8 })[type] ?? 1;
}

function readTiffFloatGrid(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint16(0, true) !== 0x4949 || view.getUint16(2, true) !== 42) throw new Error('Expected a little-endian TIFF from USGS 3DEP.');
  const entryCount = view.getUint16(view.getUint32(4, true), true);
  const entries = new Map();
  const entryStart = view.getUint32(4, true) + 2;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = entryStart + index * 12;
    entries.set(view.getUint16(offset, true), { type: view.getUint16(offset + 2, true), count: view.getUint32(offset + 4, true), value: view.getUint32(offset + 8, true) });
  }
  const values = (tag) => {
    const entry = entries.get(tag);
    if (!entry) throw new Error(`TIFF tag ${tag} is missing.`);
    const start = entry.count * typeSize(entry.type) <= 4 ? null : entry.value;
    return Array.from({ length: entry.count }, (_, index) => {
      const offset = start === null ? 8 + 2 + [...entries.keys()].indexOf(tag) * 12 + 8 : start + index * typeSize(entry.type);
      if (start === null && index > 0) throw new Error(`Unexpected inline TIFF array for tag ${tag}.`);
      if (entry.type === 3) return start === null ? view.getUint16(offset, true) : view.getUint16(offset, true);
      if (entry.type === 4) return view.getUint32(offset, true);
      throw new Error(`Unsupported TIFF tag type ${entry.type}.`);
    });
  };
  const imageWidth = values(256)[0];
  const imageHeight = values(257)[0];
  const tileWidth = values(322)[0];
  const tileHeight = values(323)[0];
  const tileOffsets = values(324);
  const tileBytes = values(325);
  if (values(258)[0] !== 32 || values(339)[0] !== 3 || tileOffsets.length !== tileBytes.length) throw new Error('Expected uncompressed Float32 USGS 3DEP tiles.');
  const columns = Math.ceil(imageWidth / tileWidth);
  const grid = new Float32Array(imageWidth * imageHeight);
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      const tile = Math.floor(y / tileHeight) * columns + Math.floor(x / tileWidth);
      const tileOffset = tileOffsets[tile] + ((y % tileHeight) * tileWidth + (x % tileWidth)) * 4;
      if (tileOffset + 4 > tileOffsets[tile] + tileBytes[tile]) throw new Error('USGS 3DEP TIFF tile bounds are invalid.');
      grid[y * imageWidth + x] = view.getFloat32(tileOffset, true);
    }
  }
  return { imageWidth, imageHeight, grid };
}

const url = new URL('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage');
url.search = new URLSearchParams({
  bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
  bboxSR: '4326', imageSR: '4326', size: `${width},${height}`, format: 'tiff', pixelType: 'F32', f: 'image',
}).toString();
const response = await fetch(url);
if (!response.ok) throw new Error(`USGS 3DEP download failed: ${response.status}`);
const { imageWidth, imageHeight, grid } = readTiffFloatGrid(Buffer.from(await response.arrayBuffer()));
const valid = [...grid].filter((value) => Number.isFinite(value) && value > -999000);
if (valid.length !== grid.length) throw new Error('USGS 3DEP returned NoData within the Dallas bounds.');
const baseElevation = Math.floor(Math.min(...valid));
const encoded = new Uint16Array(grid.length);
for (let index = 0; index < grid.length; index += 1) encoded[index] = Math.round((grid[index] - baseElevation) * 10);
const data = {
  v: 1,
  source: 'USGS 3DEP bare-earth DEM, National Map Elevation Service',
  license: 'Public domain (U.S. Government work)',
  datum: 'NAVD88 meters',
  bounds: { minX: -worldHalfSize, maxX: worldHalfSize, minZ: -worldHalfSize, maxZ: worldHalfSize },
  width: imageWidth,
  height: imageHeight,
  baseElevation,
  scale: 0.1,
  elevations: Buffer.from(encoded.buffer).toString('base64'),
};
await writeFile(outputPath, `${JSON.stringify(data)}\n`);
console.log(JSON.stringify({ outputPath, source: data.source, width: imageWidth, height: imageHeight, baseElevation, maxElevation: baseElevation + Math.max(...encoded) * data.scale }, null, 2));
