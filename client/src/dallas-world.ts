import * as THREE from 'three';
import dallasElevationJson from './data/dallas-elevation.json';
import dallasSourceJson from './data/dallas-source.json';
import { addSceneryAsset } from './assets';
import { DallasChunkStreamer } from './dallas-streamer';
import type { ImportedObstacle, ImportedRoadSegment, ImportedWater } from './osm-city';
import type { WorldMapLayer } from './world-map';

export const WORLD_METERS_PER_UNIT = 1;
export const WORLD_SIZE = 50_000;
export const DALLAS_GEO_BOUNDS = dallasSourceJson.bounds;

export type AirportId = string;
export type AirportDefinition = {
  id: AirportId;
  name: string;
  x: number;
  z: number;
  heading: number;
  runwayWidth: number;
  runwayLength: number;
  spawnOffset: number;
  accentColor: number;
};
export type RegionName = string;
export type ObstacleBounds = ImportedObstacle;
export type MountainBounds = { x: number; z: number; radius: number; height: number; baseY?: number };
export type WaterBounds = ImportedWater;

let dallasStreamer: DallasChunkStreamer | undefined;
type CompactElevationData = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  width: number;
  height: number;
  baseElevation: number;
  scale: number;
  elevations: string;
};
const dallasElevation = dallasElevationJson as CompactElevationData;
const elevationBytes = Uint8Array.from(atob(dallasElevation.elevations), (character) => character.charCodeAt(0));
const elevationSamples = new Uint16Array(elevationBytes.buffer, elevationBytes.byteOffset, elevationBytes.byteLength / 2);
const airportSafetyWidth: Record<string, number> = { dfw: 1500, love: 700, addison: 600, executive: 560 };

export const airports: ReadonlyArray<AirportDefinition> = [
  { id: 'dfw', name: 'DFW International', x: -22_800, z: -13_600, heading: 0, runwayWidth: 60, runwayLength: 4100, spawnOffset: 1300, accentColor: 0x31566b },
  { id: 'love', name: 'Dallas Love Field', x: -5_140, z: -7_780, heading: 0, runwayWidth: 46, runwayLength: 2700, spawnOffset: 820, accentColor: 0x5a6f86 },
  { id: 'addison', name: 'Addison Airport', x: -3_700, z: -21_100, heading: 0, runwayWidth: 38, runwayLength: 2200, spawnOffset: 670, accentColor: 0x617a87 },
  { id: 'executive', name: 'Dallas Executive', x: -6_700, z: 10_600, heading: 0, runwayWidth: 38, runwayLength: 1800, spawnOffset: 540, accentColor: 0x718064 },
];
export const centralAirport = airports[0];
export const dallasLocations = {
  downtown: { x: -600, z: -450 },
  whiteRock: { x: 5200, z: -8500 },
  trinity: { x: -2380, z: 720 },
  lasColinas: { x: -13_500, z: -9350 },
} as const;
export const mapLayer: WorldMapLayer = {
  bounds: { minX: -25_000, maxX: 25_000, minZ: -25_000, maxZ: 25_000 },
  staticUrl: '/data/dallas/map.json',
  landmarks: [
    { id: 'downtown', label: 'DOWNTOWN', ...dallasLocations.downtown },
    { id: 'las-colinas', label: 'LAS COLINAS', ...dallasLocations.lasColinas },
    { id: 'white-rock', label: 'WHITE ROCK LAKE', ...dallasLocations.whiteRock },
    { id: 'trinity', label: 'TRINITY CORRIDOR', ...dallasLocations.trinity },
  ],
};
export const visualQaPresets = [
  { id: 'DFW_RUNWAY', label: 'DFW RUNWAY', x: centralAirport.x, z: centralAirport.z + centralAirport.spawnOffset, altitude: 0, heading: centralAirport.heading, onGround: true },
  { id: 'DFW_500M', label: 'DFW 500M', x: centralAirport.x - 260, z: centralAirport.z, altitude: 500, heading: -Math.PI / 2 },
  { id: 'DOWNTOWN_300M', label: 'DOWNTOWN 300M', x: dallasLocations.downtown.x + 520, z: dallasLocations.downtown.z + 420, altitude: 300, heading: 0.89 },
  { id: 'DOWNTOWN_800M', label: 'DOWNTOWN 800M', x: dallasLocations.downtown.x + 700, z: dallasLocations.downtown.z + 560, altitude: 800, heading: 0.89 },
  { id: 'DALLAS_1500M', label: 'DALLAS 1500M', x: dallasLocations.lasColinas.x + 1800, z: dallasLocations.lasColinas.z + 1200, altitude: 1500, heading: 0.98 },
  { id: 'WHITE_ROCK_500M', label: 'WHITE ROCK 500M', x: dallasLocations.whiteRock.x - 350, z: dallasLocations.whiteRock.z + 300, altitude: 500, heading: -0.86 },
  { id: 'TRINITY_500M', label: 'TRINITY 500M', x: dallasLocations.trinity.x - 350, z: dallasLocations.trinity.z + 480, altitude: 500, heading: -0.63 },
  { id: 'LAS_COLINAS_500M', label: 'LAS COLINAS 500M', x: dallasLocations.lasColinas.x + 360, z: dallasLocations.lasColinas.z + 420, altitude: 500, heading: 0.71 },
] as const;
export const regionBounds: ReadonlyArray<{ name: RegionName; minX: number; maxX: number; minZ: number; maxZ: number }> = [
  { name: 'CITY', minX: -9000, maxX: 7000, minZ: -11_000, maxZ: 6500 },
  { name: 'MOUNTAINS', minX: -25_000, maxX: -9000, minZ: -25_000, maxZ: -4000 },
  { name: 'COAST', minX: 3000, maxX: 16_000, minZ: -2000, maxZ: 12_000 },
  { name: 'COUNTRYSIDE', minX: -25_000, maxX: 25_000, minZ: 6500, maxZ: 25_000 },
];

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

const airportRunwayElevations = new Map(airports.map((airport) => [airport.id, rawHeight(airport.x, airport.z)]));

function airportFlattening(x: number, z: number, airport: AirportDefinition): number {
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

export function getTerrainHeight(x: number, z: number): number {
  const raw = rawHeight(x, z);
  let flatten = 0;
  for (const airport of airports) flatten = Math.max(flatten, airportFlattening(x, z, airport));
  const nearestAirportElevation = airports.reduce((elevation, airport) => {
    const influence = airportFlattening(x, z, airport);
    return influence > flatten - 0.0001 ? airportRunwayElevations.get(airport.id)! : elevation;
  }, raw);
  return raw * (1 - flatten) + nearestAirportElevation * flatten;
}

function makeTerrain(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, dallasElevation.width - 1, dallasElevation.height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const terrainColor = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, getTerrainHeight(x, z));
    const variation = Math.sin(x * 0.0017 + z * 0.0009) * 0.024 + Math.cos(z * 0.0023) * 0.015;
    // Land-use polygons from the offline OSM dataset add the actual developed, airport,
    // park, industrial, and farm surfaces. This is only an unobtrusive base for gaps.
    terrainColor.setRGB(0.43 + variation, 0.46 + variation, 0.37 + variation);
    colors.push(terrainColor.r, terrainColor.g, terrainColor.b);
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

const airportMaterials = {
  airportGround: new THREE.MeshStandardMaterial({ color: 0x737a69, roughness: 1 }),
  runway: new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.94 }),
  taxiway: new THREE.MeshStandardMaterial({ color: 0x4c5355, roughness: 0.96 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x596063, roughness: 0.92 }),
  terminal: new THREE.MeshStandardMaterial({ color: 0x9ba5a5, roughness: 0.6, metalness: 0.14 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x315565, roughness: 0.24, metalness: 0.28 }),
  hangar: new THREE.MeshStandardMaterial({ color: 0x777c7b, roughness: 0.78, metalness: 0.12 }),
  marking: new THREE.MeshBasicMaterial({ color: 0xe9e5d5, depthWrite: false }),
  taxiLine: new THREE.MeshBasicMaterial({ color: 0xd7a83a, depthWrite: false }),
};

function localPosition(airport: AirportDefinition, lateral: number, longitudinal: number): THREE.Vector3 {
  const cosine = Math.cos(airport.heading);
  const sine = Math.sin(airport.heading);
  return new THREE.Vector3(
    airport.x + lateral * cosine + longitudinal * sine,
    getTerrainHeight(airport.x, airport.z),
    airport.z - lateral * sine + longitudinal * cosine,
  );
}

function addAirportBox(
  scene: THREE.Scene,
  airport: AirportDefinition,
  lateral: number,
  longitudinal: number,
  width: number,
  height: number,
  length: number,
  material: THREE.Material,
  yOffset: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
  const position = localPosition(airport, lateral, longitudinal);
  mesh.position.set(position.x, position.y + yOffset + height * 0.5, position.z);
  mesh.rotation.y = airport.heading;
  scene.add(mesh);
  return mesh;
}

function addRunway(scene: THREE.Scene, airport: AirportDefinition, lateral: number, length = airport.runwayLength, width = airport.runwayWidth): void {
  addAirportBox(scene, airport, lateral, 0, width, 0.18, length, airportMaterials.runway, 0.03);
  for (let longitudinal = -length * 0.34; longitudinal <= length * 0.34; longitudinal += 120) {
    addAirportBox(scene, airport, lateral, longitudinal, 0.95, 0.025, 48, airportMaterials.marking, 0.215);
  }
  for (const edge of [-1, 1]) {
    addAirportBox(scene, airport, lateral + edge * (width / 2 - 1.25), 0, 0.4, 0.025, length * 0.94, airportMaterials.marking, 0.215);
  }
  const thresholdOffset = length * 0.42;
  for (const side of [-1, 1]) {
    addAirportBox(scene, airport, lateral, side * thresholdOffset, width * 0.78, 0.025, 2.8, airportMaterials.marking, 0.217);
    for (let stripe = -4; stripe <= 4; stripe += 1) {
      addAirportBox(scene, airport, lateral + stripe * (width * 0.07), side * (thresholdOffset - 22), width * 0.036, 0.025, 28, airportMaterials.marking, 0.217);
    }
  }
}

function addObstacle(obstacles: ObstacleBounds[], mesh: THREE.Mesh, baseY: number): void {
  const geometry = mesh.geometry as THREE.BoxGeometry;
  const parameters = geometry.parameters;
  obstacles.push({
    x: mesh.position.x,
    z: mesh.position.z,
    halfX: parameters.width / 2,
    halfZ: parameters.depth / 2,
    height: parameters.height,
    baseY,
    polygon: [],
  });
}

function addDfwCampus(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  const groundY = getTerrainHeight(airport.x, airport.z);
  addAirportBox(scene, airport, 0, 0, 3350, 0.02, 4900, airportMaterials.airportGround, 0.005);
  // The visual layout follows DFW's multiple parallel north/south runway corridors while the central runway remains the landing surface.
  for (const [index, lateral] of [-1040, -690, 0, 690, 1040].entries()) {
    addRunway(scene, airport, lateral, index === 2 ? airport.runwayLength : 3850, index === 2 ? airport.runwayWidth : 54);
  }
  for (const lateral of [-860, -350, 350, 860]) addAirportBox(scene, airport, lateral, 0, 25, 0.09, 4050, airportMaterials.taxiway, 0.025);
  const apron = addAirportBox(scene, airport, 420, 0, 560, 0.12, 2700, airportMaterials.apron, 0.02);
  const terminal = addAirportBox(scene, airport, 760, 0, 155, 30, 1650, airportMaterials.terminal, 0.06);
  addAirportBox(scene, airport, 670, 0, 12, 18, 1520, airportMaterials.glass, 14);
  for (const longitudinal of [-570, -190, 190, 570]) {
    addAirportBox(scene, airport, 510, longitudinal, 410, 0.11, 72, airportMaterials.taxiway, 0.09);
    addAirportBox(scene, airport, 495, longitudinal, 270, 15, 54, airportMaterials.glass, 0.1);
  }
  for (const longitudinal of [-1120, 1120]) {
    const hangar = addAirportBox(scene, airport, 1250, longitudinal, 220, 25, 150, airportMaterials.hangar, 0.08);
    addObstacle(obstacles, hangar, groundY);
  }
  const tower = addAirportBox(scene, airport, 1120, 180, 32, 58, 32, airportMaterials.glass, 0.08);
  for (const longitudinal of [-1260, -840, -420, 420, 840, 1260]) {
    addAirportBox(scene, airport, 1020, longitudinal, 160, 0.08, 36, airportMaterials.apron, 0.09);
  }
  for (const lateral of [-1450, 1450]) {
    addAirportBox(scene, airport, lateral, 0, 16, 0.07, 4500, airportMaterials.taxiway, 0.04);
  }
  for (const longitudinal of [-570, -190, 190, 570]) {
    const position = localPosition(airport, 495, longitudinal);
    addSceneryAsset(scene, 'airportTerminal', {
      position: { x: position.x, y: groundY + 0.1, z: position.z },
      rotationY: airport.heading,
      size: { x: 250, y: 32, z: 62 },
      maxDistance: 9000,
    });
  }
  for (const longitudinal of [-1120, 1120]) {
    const position = localPosition(airport, 1250, longitudinal);
    addSceneryAsset(scene, 'airportHangar', {
      position: { x: position.x, y: groundY + 0.1, z: position.z },
      rotationY: airport.heading,
      size: { x: 220, y: 25, z: 150 },
      maxDistance: 7000,
    });
  }
  const towerPosition = localPosition(airport, 1120, 180);
  addSceneryAsset(scene, 'airportTower', {
    position: { x: towerPosition.x, y: groundY + 0.1, z: towerPosition.z },
    rotationY: airport.heading,
    size: { x: 32, y: 58, z: 32 },
    maxDistance: 9000,
  });
  addObstacle(obstacles, terminal, groundY);
  addObstacle(obstacles, tower, groundY);
  void apron;
}

function addRegionalAirport(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  const groundY = getTerrainHeight(airport.x, airport.z);
  addRunway(scene, airport, 0);
  addAirportBox(scene, airport, airport.runwayWidth * 1.15, 0, 18, 0.09, airport.runwayLength * 0.7, airportMaterials.taxiway, 0.025);
  const apron = addAirportBox(scene, airport, airport.runwayWidth * 3.2, 0, airport.id === 'love' ? 230 : 130, 0.12, airport.id === 'love' ? 430 : 240, airportMaterials.taxiway, 0.02);
  const terminal = addAirportBox(scene, airport, airport.runwayWidth * 4.5, 0, airport.id === 'love' ? 150 : 82, airport.id === 'love' ? 23 : 16, airport.id === 'love' ? 270 : 130, airportMaterials.terminal, 0.06);
  addAirportBox(scene, airport, airport.runwayWidth * 4.1, 0, 10, airport.id === 'love' ? 14 : 10, airport.id === 'love' ? 245 : 108, airportMaterials.glass, 0.1);
  const hangar = addAirportBox(scene, airport, airport.runwayWidth * 5.4, airport.id === 'love' ? 245 : 150, airport.id === 'love' ? 135 : 82, airport.id === 'love' ? 22 : 18, airport.id === 'love' ? 110 : 78, airportMaterials.hangar, 0.06);
  const tower = addAirportBox(scene, airport, airport.runwayWidth * 4.0, airport.id === 'love' ? -250 : -155, 18, airport.id === 'love' ? 42 : 28, 18, airportMaterials.glass, 0.06);
  addObstacle(obstacles, terminal, groundY);
  addObstacle(obstacles, hangar, groundY);
  addObstacle(obstacles, tower, groundY);
  void apron;
}

function addAirport(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  if (airport.id === 'dfw') addDfwCampus(scene, airport, obstacles);
  else addRegionalAirport(scene, airport, obstacles);
}

const landmarkMaterials = {
  glassDark: new THREE.MeshStandardMaterial({ color: 0x1f3a45, roughness: 0.22, metalness: 0.38 }),
  glassBlue: new THREE.MeshStandardMaterial({ color: 0x477584, roughness: 0.2, metalness: 0.3 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9ca09d, roughness: 0.76, metalness: 0.05 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6e7778, roughness: 0.48, metalness: 0.32 }),
  reunion: new THREE.MeshStandardMaterial({ color: 0x9fc8d2, roughness: 0.32, metalness: 0.38 }),
  river: new THREE.MeshStandardMaterial({ color: 0x386f7c, roughness: 0.3, metalness: 0.12, transparent: true, opacity: 0.92 }),
};

function addCityBox(
  scene: THREE.Scene,
  obstacles: ObstacleBounds[],
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  rotation = 0,
  collides = true,
  verticalOffset = 0,
): THREE.Mesh {
  const baseY = getTerrainHeight(x, z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, baseY + verticalOffset + height * 0.5, z);
  mesh.rotation.y = rotation;
  scene.add(mesh);
  if (collides) addObstacle(obstacles, mesh, baseY + verticalOffset);
  return mesh;
}

function addSteppedTower(scene: THREE.Scene, obstacles: ObstacleBounds[], x: number, z: number, width: number, depth: number, height: number, material: THREE.Material, rotation = 0): void {
  const podiumHeight = Math.min(28, height * 0.14);
  const shaftHeight = (height - podiumHeight) * 0.8;
  const crownHeight = height - podiumHeight - shaftHeight;
  addCityBox(scene, obstacles, x, z, width * 1.2, podiumHeight, depth * 1.2, landmarkMaterials.concrete, rotation);
  addCityBox(scene, obstacles, x, z, width, shaftHeight, depth, material, rotation, true, podiumHeight);
  addCityBox(scene, obstacles, x, z, width * 0.72, crownHeight, depth * 0.72, material, rotation, true, podiumHeight + shaftHeight);
}

function addReunionTower(scene: THREE.Scene, obstacles: ObstacleBounds[]): void {
  // Reunion Tower's real downtown location, represented with original primitive geometry.
  const x = -1120;
  const z = 130;
  const baseY = getTerrainHeight(x, z);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 134, 10), landmarkMaterials.steel);
  shaft.position.set(x, baseY + 67, z);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(25, 18, 12), landmarkMaterials.reunion);
  globe.position.set(x, baseY + 145, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(25.5, 1.3, 6, 24), landmarkMaterials.steel);
  ring.position.copy(globe.position);
  ring.rotation.x = Math.PI / 2;
  scene.add(shaft, globe, ring);
  obstacles.push({ x, z, halfX: 28, halfZ: 28, height: 171, baseY, polygon: [] });
}

function addDallasSkyline(scene: THREE.Scene, obstacles: ObstacleBounds[]): void {
  addReunionTower(scene, obstacles);
  // Tallest and faceted landmark masses sit at their real downtown coordinates, using non-trademarked proportions.
  addSteppedTower(scene, obstacles, -330, -360, 58, 72, 282, landmarkMaterials.glassDark, 0.05);
  const facetedBaseY = getTerrainHeight(-780, -230);
  const faceted = new THREE.Mesh(new THREE.CylinderGeometry(32, 47, 224, 4), landmarkMaterials.glassBlue);
  faceted.position.set(-780, facetedBaseY + 112, -230);
  faceted.rotation.y = Math.PI / 4;
  scene.add(faceted);
  obstacles.push({ x: -780, z: -230, halfX: 50, halfZ: 50, height: 224, baseY: facetedBaseY, polygon: [] });
  addSteppedTower(scene, obstacles, -600, -610, 54, 52, 205, landmarkMaterials.glassBlue, -0.15);
  addSteppedTower(scene, obstacles, -170, -700, 48, 58, 186, landmarkMaterials.glassDark, 0.18);
  addSteppedTower(scene, obstacles, -1050, -580, 52, 48, 164, landmarkMaterials.steel, -0.1);
  addSteppedTower(scene, obstacles, -1230, -370, 44, 50, 150, landmarkMaterials.glassBlue, 0.22);
  const core: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [-420, 20, 48, 66, 126, 0.08], [-650, 50, 40, 45, 118, -0.1], [-900, 120, 45, 48, 105, 0.12],
    [-250, 150, 38, 42, 98, 0.2], [-1340, 10, 42, 46, 96, -0.14], [-940, -790, 44, 50, 112, 0.08],
    [-420, -980, 52, 48, 108, -0.18], [-170, -1030, 38, 42, 94, 0.1], [-1280, -760, 46, 44, 102, 0.18],
  ];
  for (const [x, z, width, depth, height, rotation] of core) addSteppedTower(scene, obstacles, x, z, width, depth, height, landmarkMaterials.concrete, rotation);

  // Las Colinas/Irving's lower but visible business cluster anchors the DFW-to-downtown route.
  const lasColinas: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [dallasLocations.lasColinas.x, dallasLocations.lasColinas.z, 68, 62, 138], [-13270, -9180, 55, 48, 112], [-13740, -8990, 52, 48, 94],
    [-13080, -9570, 46, 48, 82], [-14000, -9560, 48, 44, 78],
  ];
  for (const [x, z, width, depth, height] of lasColinas) addSteppedTower(scene, obstacles, x, z, width, depth, height, landmarkMaterials.glassBlue, 0.12);
}

function addTrinityRiver(scene: THREE.Scene, waterBounds: WaterBounds[]): void {
  // Simplified ribbon follows the Trinity corridor from Irving through downtown toward southeast Dallas.
  const points: ReadonlyArray<readonly [number, number]> = [
    [-7800, -3100], [-6200, -2050], [-4700, -940], [-3300, -210], [-2380, 720], [-1640, 1660], [-620, 2600], [640, 3650], [1900, 4980], [3600, 6800],
  ];
  const positions: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[index + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const width = 62 + index * 4;
    const offsetX = -dz / length * width * 0.5;
    const offsetZ = dx / length * width * 0.5;
    const y1 = getTerrainHeight(x1, z1) + 0.17;
    const y2 = getTerrainHeight(x2, z2) + 0.17;
    positions.push(
      x1 + offsetX, y1, z1 + offsetZ, x2 + offsetX, y2, z2 + offsetZ, x1 - offsetX, y1, z1 - offsetZ,
      x1 - offsetX, y1, z1 - offsetZ, x2 + offsetX, y2, z2 + offsetZ, x2 - offsetX, y2, z2 - offsetZ,
    );
    waterBounds.push({
      minX: Math.min(x1, x2) - width * 0.5,
      maxX: Math.max(x1, x2) + width * 0.5,
      minZ: Math.min(z1, z2) - width * 0.5,
      maxZ: Math.max(z1, z2) + width * 0.5,
      surfaceY: (y1 + y2) * 0.5,
      polygon: [[x1 + offsetX, z1 + offsetZ], [x2 + offsetX, z2 + offsetZ], [x2 - offsetX, z2 - offsetZ], [x1 - offsetX, z1 - offsetZ]],
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, landmarkMaterials.river));
}

export function createWorld(scene: THREE.Scene, depthOffsetDirection = -1): { obstacleBounds: ObstacleBounds[]; mountainBounds: MountainBounds[]; waterBounds: WaterBounds[] } {
  const obstacleBounds: ObstacleBounds[] = [];
  const mountainBounds: MountainBounds[] = [];
  const waterBounds: WaterBounds[] = [];
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(120_000, 120_000), new THREE.MeshStandardMaterial({ color: 0x5b704d, roughness: 1, depthWrite: false }));
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = dallasElevation.baseElevation - 8;
  horizon.renderOrder = -3;
  scene.add(horizon, makeTerrain());

  for (const airport of airports) addAirport(scene, airport, obstacleBounds);
  addDallasSkyline(scene, obstacleBounds);
  addTrinityRiver(scene, waterBounds);
  dallasStreamer?.dispose();
  dallasStreamer = new DallasChunkStreamer(scene, {
    roadMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection }),
    buildingMaterials: [
      new THREE.MeshStandardMaterial({ color: 0xb8b1a7, roughness: 0.94 }),
      new THREE.MeshStandardMaterial({ color: 0x9fa9aa, roughness: 0.82 }),
      new THREE.MeshStandardMaterial({ color: 0xa5abad, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x708d99, roughness: 0.34, metalness: 0.15 }),
      new THREE.MeshStandardMaterial({ color: 0x9a9d98, roughness: 0.9 }),
    ],
    waterMaterial: new THREE.MeshStandardMaterial({ color: 0x216f8d, roughness: 0.24, metalness: 0.15 }),
    landMaterials: [
      new THREE.MeshStandardMaterial({ color: 0x698158, roughness: 1 }), // parks/open green
      new THREE.MeshStandardMaterial({ color: 0x486940, roughness: 1 }), // woodland
      new THREE.MeshStandardMaterial({ color: 0x62696b, roughness: 1 }), // industrial
      new THREE.MeshStandardMaterial({ color: 0x838679, roughness: 1 }), // residential
      new THREE.MeshStandardMaterial({ color: 0x7c756d, roughness: 1 }), // commercial
      new THREE.MeshStandardMaterial({ color: 0x9b8a61, roughness: 1 }), // farmland
      new THREE.MeshStandardMaterial({ color: 0x7b8165, roughness: 1 }), // airport/open transport
      new THREE.MeshStandardMaterial({ color: 0x5a6164, roughness: 0.96 }), // apron
    ],
    aerowayMaterials: [airportMaterials.runway, airportMaterials.taxiway],
    majorHighwayWidth: 38,
    highwayAccentMaterial: new THREE.MeshBasicMaterial({ color: 0xd8d1ac, depthWrite: false }),
    heightAt: getTerrainHeight,
    isExcluded: (x, z, padding) => airports.some((airport) => Math.abs(x - airport.x) < airportSafetyWidth[airport.id] + padding && Math.abs(z - airport.z) < airport.runwayLength / 2 + 500 + padding),
  });
  return { obstacleBounds, mountainBounds, waterBounds };
}

export function updateWorldStreaming(position: THREE.Vector3): void { dallasStreamer?.update(position); }
export function disposeWorldStreaming(): void { dallasStreamer?.dispose(); dallasStreamer = undefined; }

export type { ImportedRoadSegment };
