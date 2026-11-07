import { DALLAS_WORLD_SCALE, scaleDallasPoint, scaleDallasBounds } from './dallas-world-scale.mjs';
export const monsterDamageSites = [
    { x: -2191, z: -1201, y: 122, width: 165, depth: 124 },
    { x: -2140, z: -1155, y: 122.1, width: 126, depth: 99 },
    { x: -2214, z: -1329, y: 122, width: 128, depth: 102 },
].map(site => ({ ...scaleDallasPoint(site), y: site.y * DALLAS_WORLD_SCALE, width: site.width * DALLAS_WORLD_SCALE, depth: site.depth * DALLAS_WORLD_SCALE }));
export const monsterDebrisOffsets = Object.freeze(Array.from({ length: 6 }, (_, i) => Object.freeze(scaleDallasPoint({ x: -350 + (i % 3) * 300, z: -250 + Math.floor(i / 3) * 500 }))));

// Dallas encounter navigation stays inside the authored city, not a small spawn pen.
export const monsterArena = Object.freeze(scaleDallasBounds({minX:-22000,maxX:14000,minZ:-22000,maxZ:14000}));
