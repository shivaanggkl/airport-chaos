import {readFileSync} from 'node:fs';
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';

const dallasElevationAt = (() => {
  const data = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8')) as {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    width: number; height: number; baseElevation: number; scale: number; elevations: string;
  };
  const bytes = Buffer.from(data.elevations, 'base64');
  const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const sample = (x: number, z: number) => data.baseElevation + samples[z * data.width + x] * data.scale;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const elevationAt = (worldX: number, worldZ: number) => {
    const sourceX = worldX / DALLAS_WORLD_SCALE, sourceZ = worldZ / DALLAS_WORLD_SCALE;
    const x = Math.max(0, Math.min(1, (sourceX - data.bounds.minX) / (data.bounds.maxX - data.bounds.minX))) * (data.width - 1);
    const z = Math.max(0, Math.min(1, (sourceZ - data.bounds.minZ) / (data.bounds.maxZ - data.bounds.minZ))) * (data.height - 1);
    const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(data.width - 1, x0 + 1), z1 = Math.min(data.height - 1, z0 + 1);
    return lerp(lerp(sample(x0, z0), sample(x1, z0), x - x0), lerp(sample(x0, z1), sample(x1, z1), x - x0), z - z0) * DALLAS_WORLD_SCALE;
  };
  return elevationAt;
})();
export {dallasElevationAt};
