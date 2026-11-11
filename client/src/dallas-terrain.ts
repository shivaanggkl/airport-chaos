import * as THREE from 'three';
import dallasElevationJson from './data/dallas-elevation.json';

type CompactElevationData = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  width: number;
  height: number;
  baseElevation: number;
  scale: number;
  elevations: string;
};
export const dallasElevation = dallasElevationJson as CompactElevationData;
const elevationBytes = Uint8Array.from(atob(dallasElevation.elevations), (character) => character.charCodeAt(0));
const elevationSamples = new Uint16Array(elevationBytes.buffer, elevationBytes.byteOffset, elevationBytes.byteLength / 2);
export const airportSafetyWidth: Record<string, number> = { dfw: 1500, love: 700, addison: 600, executive: 560 };


export type TerrainAirport = { id: string; x: number; z: number; heading: number; runwayLength: number };
export type DallasTerrainEnvironment = { airports: ReadonlyArray<TerrainAirport>; arena: { x: number; z: number; radiusX: number; radiusZ: number } };

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rawHeight(x: number, z: number): number {
  const normalizedX = THREE.MathUtils.clamp((x - dallasElevation.bounds.minX) / (dallasElevation.bounds.maxX - dallasElevation.bounds.minX), 0, 1) * (dallasElevation.width - 1);
  const normalizedZ = THREE.MathUtils.clamp((z - dallasElevation.bounds.minZ) / (dallasElevation.bounds.maxZ - dallasElevation.bounds.minZ), 0, 1) * (dallasElevation.height - 1);
  const x0 = Math.floor(normalizedX);
  const z0 = Math.floor(normalizedZ);
  const x1 = Math.min(dallasElevation.width - 1, x0 + 1);
  const z1 = Math.min(dallasElevation.height - 1, z0 + 1);
  const blendX = normalizedX - x0;
  const blendZ = normalizedZ - z0;
  const sample = (sampleX: number, sampleZ: number): number => dallasElevation.baseElevation + elevationSamples[sampleZ * dallasElevation.width + sampleX] * dallasElevation.scale;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(sample(x0, z0), sample(x1, z0), blendX),
    THREE.MathUtils.lerp(sample(x0, z1), sample(x1, z1), blendX),
    blendZ,
  );
}

export function createDallasTerrain(airports: ReadonlyArray<TerrainAirport>): (x: number, z: number) => number {
  const airportRunwayElevations = new Map(airports.map((airport) => [airport.id, rawHeight(airport.x, airport.z)]));

  function airportFlattening(x: number, z: number, airport: TerrainAirport): number {
    const dx = x - airport.x;
    const dz = z - airport.z;
    const c = Math.cos(airport.heading);
    const s = Math.sin(airport.heading);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    const beyondX = Math.max(0, Math.abs(localX) - airportSafetyWidth[airport.id]);
    const beyondZ = Math.max(0, Math.abs(localZ) - airport.runwayLength / 2 - 300);
    return 1 - smoothstep(0, 500, Math.hypot(beyondX, beyondZ));
  }

  function getTerrainHeight(x: number, z: number): number {
    const raw = rawHeight(x, z);
    let flatten = 0;
    for (const airport of airports) flatten = Math.max(flatten, airportFlattening(x, z, airport));
    const nearestAirportElevation = airports.reduce((elevation, airport) => {
      const influence = airportFlattening(x, z, airport);
      return influence > flatten - 0.0001 ? airportRunwayElevations.get(airport.id)! : elevation;
    }, raw);
    return raw * (1 - flatten) + nearestAirportElevation * flatten;
  }

  return getTerrainHeight;
}

export function createDallasExclusion({ airports, arena }: DallasTerrainEnvironment) {
  return (x: number, z: number, padding: number): boolean => airports.some((airport) => Math.abs(x - airport.x) < airportSafetyWidth[airport.id] + padding && Math.abs(z - airport.z) < airport.runwayLength / 2 + 500 + padding)
    || (Math.abs(x - arena.x) < arena.radiusX + 35 + padding && Math.abs(z - arena.z) < arena.radiusZ + 35 + padding);
}
