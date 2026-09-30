// City-local geography belongs in data, while capture behavior stays generic
// in the server. Coordinates use the same meter-based Dallas activity anchors.
import { dallasDisplayNames } from './dallas-display-names.mjs';
export const TERRITORY_AREA_SCALE = 2;
export const TERRITORY_LINEAR_SCALE = Math.sqrt(TERRITORY_AREA_SCALE);
export const TERRITORY_WALL_HEIGHT_METERS = 914.4; // 3,000 ft × 0.3048 m/ft

const LOVE_FIELD_WIDTH = 6_300;
const LOVE_FIELD_DEPTH = 58_300_000 / LOVE_FIELD_WIDTH;

const baseCityTerritories = {
  dallas: [
    // The corrected rectangles retain exactly 2x original area while following
    // the districts' long axes. Small 100-600m gaps replace ambiguous overlap.
    { id: 'dfw', cityId: 'dallas', displayName: dallasDisplayNames.dfw, center: { x: -22800, z: -13600 }, bounds: { minX: -27850, maxX: -17850, minZ: -20240, maxZ: -6960 }, captureWeight: 1.2, fixedColor: '#a34dff', colorName: 'Vivid Purple' },
    { id: 'downtown', cityId: 'dallas', displayName: dallasDisplayNames.downtown, center: { x: -600, z: -450 }, bounds: { minX: -3000, maxX: 2400, minZ: -6900, maxZ: 100 }, captureWeight: 1.15, fixedColor: '#2678ff', colorName: 'Electric Blue', botObstacleClearance: 460 },
    { id: 'las-colinas', cityId: 'dallas', displayName: dallasDisplayNames.lasColinas, center: { x: -13500, z: -9350 }, bounds: { minX: -17700, maxX: -9700, minZ: -16960, maxZ: -1840 }, captureWeight: 1, fixedColor: '#00d6b3', colorName: 'Bright Teal' },
    { id: 'love-field', cityId: 'dallas', displayName: dallasDisplayNames.love, center: { x: -5140, z: -7780 }, bounds: { minX: -9600, maxX: -3300, minZ: -7750 - LOVE_FIELD_DEPTH / 2, maxZ: -7750 + LOVE_FIELD_DEPTH / 2 }, captureWeight: 1, fixedColor: '#ffd02e', colorName: 'Gold' },
    { id: 'white-rock', cityId: 'dallas', displayName: 'White Rock', center: { x: 5200, z: -8500 }, bounds: { minX: 2700, maxX: 2700 + 7100 * TERRITORY_LINEAR_SCALE, minZ: -9000 - 3200 * TERRITORY_LINEAR_SCALE, maxZ: -9000 + 3200 * TERRITORY_LINEAR_SCALE }, captureWeight: .95, fixedColor: '#16cfff', colorName: 'Cyan' },
    { id: 'trinity-corridor', cityId: 'dallas', displayName: 'Trinity Corridor', center: { x: -2380, z: 720 }, bounds: { minX: -9700, maxX: 2300, minZ: 400, maxZ: 6900 }, captureWeight: 1.05, fixedColor: '#f04ba0', colorName: 'Magenta' },
    { id: 'addison', cityId: 'dallas', displayName: dallasDisplayNames.addison, center: { x: -3700, z: -21100 }, bounds: { minX: -3400 - 3400 * TERRITORY_LINEAR_SCALE, maxX: -3400 + 3400 * TERRITORY_LINEAR_SCALE, minZ: -20950 - 3050 * TERRITORY_LINEAR_SCALE, maxZ: -20950 + 3050 * TERRITORY_LINEAR_SCALE }, captureWeight: 1, fixedColor: '#55df45', colorName: 'Bright Green' },
    { id: 'dallas-executive', cityId: 'dallas', displayName: dallasDisplayNames.executive, center: { x: -6700, z: 10600 }, bounds: { minX: -6650 - 2950 * TERRITORY_LINEAR_SCALE, maxX: -6650 + 2950 * TERRITORY_LINEAR_SCALE, minZ: 7500, maxZ: 7500 + 6000 * TERRITORY_LINEAR_SCALE }, captureWeight: 1, fixedColor: '#ff8528', colorName: 'Strong Orange' },
  ],
  milwaukee: [],
};

export function territoryBoundsArea(bounds) {
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxZ - bounds.minZ);
}

export function scaleTerritoryBounds(bounds, center, linearScale = TERRITORY_LINEAR_SCALE) {
  return {
    minX: center.x + (bounds.minX - center.x) * linearScale,
    maxX: center.x + (bounds.maxX - center.x) * linearScale,
    minZ: center.z + (bounds.minZ - center.z) * linearScale,
    maxZ: center.z + (bounds.maxZ - center.z) * linearScale,
  };
}

export function territoryContains(definition, position) {
  return position.x >= definition.bounds.minX && position.x <= definition.bounds.maxX &&
    position.z >= definition.bounds.minZ && position.z <= definition.bounds.maxZ;
}

export function territoriesContainingPoint(definitions, position) {
  return definitions.filter((definition) => territoryContains(definition, position));
}

export function territoryMembershipTransition(previousIds, definitions, position) {
  const current = new Set(territoriesContainingPoint(definitions, position).map((territory) => territory.id));
  return {
    current,
    entered: [...current].filter((id) => !previousIds.has(id)),
    exited: [...previousIds].filter((id) => !current.has(id)),
  };
}

// Corrected production rectangles are disjoint. Closest-center selection and
// stable id tie-breaking remain as defensive protection if future geometry is
// malformed, so one aircraft can never advance two captures in one server tick.
export function primaryTerritoryAt(definitions, position) {
  return territoriesContainingPoint(definitions, position).sort((left, right) => {
    const leftDistance = Math.hypot(position.x - left.center.x, position.z - left.center.z);
    const rightDistance = Math.hypot(position.x - right.center.x, position.z - right.center.z);
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  })[0];
}

export const cityTerritories = Object.fromEntries(Object.entries(baseCityTerritories).map(([cityId, territories]) => [cityId,
  territories.map((territory) => ({
    ...territory,
    boundaryHeight: Math.max(territory.boundaryHeight ?? 0, TERRITORY_WALL_HEIGHT_METERS),
  })),
]));

export function territoriesForCity(cityId) {
  return cityTerritories[cityId] ?? [];
}
