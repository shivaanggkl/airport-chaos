import * as THREE from 'three';
import { addSceneryAsset, replaceTreesWithInstancedAsset } from './assets';
import { addOsmCity, type ImportedRoadSegment } from './city1-osm';
import { addCloudLayer, createTerrainHeightSampler, createTerrainMesh } from './terrain';
import type { StuntZone } from './stunt-combo';
import type { DiscoveryDefinition } from './discoveries';

export const WORLD_METERS_PER_UNIT = 1;
export const WORLD_SIZE = 12_000;

const SCALE = {
  roads: { residential: 9, street: 12, arterial: 18, highway: 32 },
  downtown: { x: -1420, z: -2820, spacing: 210, columns: 10, rows: 9, blockInset: 18 },
  urban: { spacing: 230, blockInset: 20 },
  suburb: { blockWidth: 190, blockDepth: 175, localStreet: 9 },
  industrial: { lotWidth: 225, lotDepth: 245 },
  water: { x: 3500, z: 0, width: 2500, depth: 5000 },
  airport: { centralHalfWidth: 1250, regionalHalfWidth: 380, airfieldHalfWidth: 270 },
} as const;

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

export const airports: ReadonlyArray<AirportDefinition> = [
  { id: 'central', name: 'Central International', x: 0, z: 0, heading: 0, runwayWidth: 45, runwayLength: 2800, spawnOffset: 900, accentColor: 0x31566b },
  { id: 'coast', name: 'Coast Airport', x: 5100, z: 3550, heading: 0, runwayWidth: 36, runwayLength: 1800, spawnOffset: 600, accentColor: 0x2c7da0 },
  { id: 'mountain', name: 'Mountain Airfield', x: -2300, z: -5000, heading: 0, runwayWidth: 30, runwayLength: 1200, spawnOffset: 380, accentColor: 0x8f6b45 },
  { id: 'countryside', name: 'Countryside Airstrip', x: -4300, z: 3800, heading: Math.PI / 2, runwayWidth: 28, runwayLength: 1000, spawnOffset: 320, accentColor: 0x80934c },
];
export const centralAirport = airports[0];
export const getTerrainHeight = createTerrainHeightSampler(
  airports.map((airport) => ({
    x: airport.x,
    z: airport.z,
    heading: airport.heading,
    runwayLength: airport.runwayLength,
    safetyHalfWidth: campusHalfWidth(airport),
  })),
);

export type ObstacleBounds = { x: number; z: number; halfX: number; halfZ: number; height: number; baseY?: number; polygon?: ReadonlyArray<readonly [number, number]> };
export type MountainBounds = { x: number; z: number; radius: number; height: number; baseY?: number };
export type WaterBounds = { minX: number; maxX: number; minZ: number; maxZ: number; surfaceY: number; polygon?: ReadonlyArray<readonly [number, number]> };
export type RegionName = string;
export const regionBounds: ReadonlyArray<{ name: RegionName; minX: number; maxX: number; minZ: number; maxZ: number }> = [
  { name: 'CITY', minX: -3100, maxX: 2200, minZ: -4300, maxZ: 1700 },
  { name: 'MOUNTAINS', minX: -6000, maxX: -1500, minZ: -6000, maxZ: -2200 },
  { name: 'COAST', minX: 2200, maxX: 6000, minZ: -2700, maxZ: 5000 },
  { name: 'COUNTRYSIDE', minX: -6000, maxX: -1500, minZ: 1700, maxZ: 6000 },
];

export const stuntZones: ReadonlyArray<StuntZone> = [
  { id: 'coast-highway-bridge', kind: 'bridge', x: 3500, z: 500, radius: 1180, minAltitude: 8, maxAltitude: 62 },
  { id: 'downtown-skyline', kind: 'landmark', x: -1525, z: -2820, radius: 950, minAltitude: 0, maxAltitude: 280 },
];

export const discoveries: ReadonlyArray<DiscoveryDefinition> = [
  { id: 'central-international', name: 'Central International', type: 'airport', x: 0, z: 0, radius: 820, minAltitude: 0, maxAltitude: 260, credits: 75, setId: 'airport-tour', setBonus: 250 },
  { id: 'coast-airport', name: 'Coast Airport', type: 'airport', x: 5100, z: 3550, radius: 560, minAltitude: 0, maxAltitude: 220, credits: 75, setId: 'airport-tour', setBonus: 250 },
  { id: 'mountain-airfield', name: 'Mountain Airfield', type: 'airstrip', x: -2300, z: -5000, radius: 420, minAltitude: 0, maxAltitude: 190, credits: 100, setId: 'airport-tour', setBonus: 250 },
  { id: 'countryside-airstrip', name: 'Countryside Airstrip', type: 'airstrip', x: -4300, z: 3800, radius: 360, minAltitude: 0, maxAltitude: 170, credits: 125, setId: 'airport-tour', setBonus: 250 },
  { id: 'downtown-landmark-a', name: 'Downtown Tower', type: 'downtown', x: -1525, z: -2820, radius: 210, minAltitude: 90, maxAltitude: 460, credits: 100, setId: 'skyline-tour', setBonus: 225 },
  { id: 'downtown-landmark-b', name: 'Riverfront Tower', type: 'landmark', x: -1778, z: -2400, radius: 220, minAltitude: 100, maxAltitude: 460, credits: 100, setId: 'skyline-tour', setBonus: 225 },
  { id: 'downtown-landmark-c', name: 'Civic Spire', type: 'rooftop', x: -895, z: -2400, radius: 170, minAltitude: 100, maxAltitude: 410, credits: 125, setId: 'skyline-tour', setBonus: 225 },
  { id: 'coast-highway-bridge', name: 'Coast Highway Bridge', type: 'bridge', x: 3500, z: 500, radius: 240, minAltitude: 10, maxAltitude: 100, credits: 125 },
  { id: 'coast-lake', name: 'Coast Lake', type: 'water', x: 3500, z: 0, radius: 700, minAltitude: 20, maxAltitude: 280, credits: 75 },
  { id: 'mountain-ridge', name: 'Mountain Ridge', type: 'secret', x: -4300, z: -4300, radius: 300, minAltitude: 300, maxAltitude: 950, credits: 300, mapVisible: false },
];

type BoxPlacement = { x: number; y: number; z: number; width: number; height: number; depth: number; rotation?: number; color?: number };
const placementColor = new THREE.Color();

function setBoxInstance(mesh: THREE.InstancedMesh, index: number, p: BoxPlacement, transform: THREE.Object3D): void {
  transform.position.set(p.x, p.y, p.z);
  transform.rotation.set(0, p.rotation ?? 0, 0);
  transform.scale.set(p.width, p.height, p.depth);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
  if (p.color !== undefined) mesh.setColorAt(index, placementColor.set(p.color));
}

function addBoxes(scene: THREE.Scene, geometry: THREE.BoxGeometry, material: THREE.Material, placements: ReadonlyArray<BoxPlacement>, transform: THREE.Object3D, renderOrder = 0): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((placement, index) => setBoxInstance(mesh, index, placement, transform));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return mesh;
}

function airportPoint(airport: AirportDefinition, localX: number, localZ: number): { x: number; z: number } {
  const cosine = Math.cos(airport.heading);
  const sine = Math.sin(airport.heading);
  return { x: airport.x + localX * cosine + localZ * sine, z: airport.z - localX * sine + localZ * cosine };
}

function campusHalfWidth(airport: AirportDefinition): number {
  if (airport.id === 'central') return SCALE.airport.centralHalfWidth;
  if (airport.id === 'coast') return SCALE.airport.regionalHalfWidth;
  return SCALE.airport.airfieldHalfWidth;
}

function isNearAirport(x: number, z: number, padding: number): boolean {
  for (const airport of airports) {
    const offsetX = x - airport.x;
    const offsetZ = z - airport.z;
    const cosine = Math.cos(airport.heading);
    const sine = Math.sin(airport.heading);
    const lateral = offsetX * cosine - offsetZ * sine;
    const longitudinal = offsetX * sine + offsetZ * cosine;
    if (Math.abs(lateral) <= campusHalfWidth(airport) + padding && Math.abs(longitudinal) <= airport.runwayLength / 2 + 220 + padding) return true;
  }
  return false;
}

function createSurfaceTexture(base: string, light: string, dark: string, repeat: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = base;
  context.fillRect(0, 0, 128, 128);
  for (let index = 0; index < 680; index += 1) {
    const x = (index * 47 + index * index * 3) % 128;
    const y = (index * 83 + index * index * 7) % 128;
    const size = 1 + (index % 3);
    context.globalAlpha = 0.08 + (index % 4) * 0.025;
    context.fillStyle = index % 3 === 0 ? light : dark;
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFacadeTexture(
  facade: string,
  mortar: string,
  window: string,
  columns: number,
  rows: number,
  glass = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = facade;
  context.fillRect(0, 0, 256, 256);
  const cellWidth = 256 / columns;
  const cellHeight = 256 / rows;
  context.fillStyle = mortar;
  for (let column = 1; column < columns; column += 1) context.fillRect(column * cellWidth - 0.55, 0, 1.1, 256);
  for (let row = 1; row < rows; row += 1) context.fillRect(0, row * cellHeight - 0.45, 256, 0.9);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const marginX = glass ? cellWidth * 0.14 : cellWidth * 0.24;
      const marginY = glass ? cellHeight * 0.18 : cellHeight * 0.28;
      const variation = (row * 19 + column * 31) % 11;
      context.fillStyle = variation === 0 ? '#9a9274' : variation < 3 ? '#52636a' : window;
      context.fillRect(
        column * cellWidth + marginX,
        row * cellHeight + marginY,
        cellWidth - marginX * 2,
        Math.max(1, cellHeight - marginY * 2),
      );
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function distanceToSegmentSquared(
  x: number,
  z: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSquared = dx * dx + dz * dz;
  const progress = lengthSquared === 0 ? 0 : THREE.MathUtils.clamp(((x - x1) * dx + (z - z1) * dz) / lengthSquared, 0, 1);
  const offsetX = x - (x1 + dx * progress);
  const offsetZ = z - (z1 + dz * progress);
  return offsetX * offsetX + offsetZ * offsetZ;
}

function createFacadeBoxGeometry(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const index = geometry.getIndex();
  if (!index) return geometry;
  for (const groupIndex of [2, 3]) {
    const group = geometry.groups[groupIndex];
    for (let offset = group.start; offset < group.start + group.count; offset += 1) {
      uv.setXY(index.getX(offset), 0.002, 0.002);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function createMountainGeometry(): THREE.BufferGeometry {
  const segments = 9;
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = [
    { y: -0.5, radius: 1 },
    { y: -0.14, radius: 0.7 },
    { y: 0.18, radius: 0.38 },
  ];
  for (let ring = 0; ring < rings.length; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const variation = 0.88 + ((segment * 7 + ring * 5) % 5) * 0.055;
      const radius = rings[ring].radius * variation;
      positions.push(Math.cos(angle) * radius, rings[ring].y, Math.sin(angle) * radius);
    }
  }
  const peakIndex = positions.length / 3;
  positions.push(0.08, 0.5, -0.05);
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const lower = ring * segments + segment;
      const lowerNext = ring * segments + next;
      const upper = (ring + 1) * segments + segment;
      const upperNext = (ring + 1) * segments + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  const upperRing = (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(upperRing + segment, peakIndex, upperRing + (segment + 1) % segments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createReliefGeometry(): THREE.BufferGeometry {
  const segments = 24;
  const rings = [
    { radius: 1, y: 0 },
    { radius: 0.72, y: 0.18 },
    { radius: 0.4, y: 0.58 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * ring.radius, ring.y, Math.sin(angle) * ring.radius);
    }
  }
  const center = positions.length / 3;
  positions.push(0, 1, 0);
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const outer = ring * segments + segment;
      const outerNext = ring * segments + next;
      const inner = (ring + 1) * segments + segment;
      const innerNext = (ring + 1) * segments + next;
      indices.push(outer, inner, outerNext, outerNext, inner, innerNext);
    }
  }
  const innerRing = (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(innerRing + segment, center, innerRing + (segment + 1) % segments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createWorld(scene: THREE.Scene, depthOffsetDirection = -1): {
  obstacleBounds: ObstacleBounds[];
  mountainBounds: MountainBounds[];
  waterBounds: WaterBounds[];
} {
  const obstacleBounds: ObstacleBounds[] = [];
  const mountainBounds: MountainBounds[] = [];
  const waterBounds: WaterBounds[] = [];
  const transform = new THREE.Object3D();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const facadeBox = createFacadeBoxGeometry();

  const grassTexture = createSurfaceTexture('#597446', '#789159', '#405b36', 96);
  const developedTexture = createSurfaceTexture('#687176', '#858d8d', '#505b60', 42);
  const pavementTexture = createSurfaceTexture('#697173', '#858d8c', '#50595c', 22);
  const asphaltTexture = createSurfaceTexture('#242d32', '#3b464b', '#182025', 48);
  const soilTexture = createSurfaceTexture('#9b8351', '#b89c64', '#77653e', 18);
  const fieldTexture = createSurfaceTexture('#657a42', '#829957', '#4b6234', 20);
  const downtownFacadeTextures = [
    createFacadeTexture('#b7b8b4', '#868b8b', '#34464e', 14, 18),
    createFacadeTexture('#aeb8bb', '#708087', '#263e49', 16, 34, true),
    createFacadeTexture('#9faeb3', '#65767e', '#203944', 18, 52, true),
  ];
  const urbanFacadeTextures = [
    createFacadeTexture('#b7ada0', '#8d7768', '#3f4a4b', 12, 16),
    createFacadeTexture('#b5b7b3', '#888d8b', '#3d4f55', 12, 20),
  ];
  const houseFacadeTexture = createFacadeTexture('#d1ccc1', '#aaa69e', '#46565a', 4, 3);
  const industrialFacadeTexture = createFacadeTexture('#b5b8b5', '#898e8d', '#465155', 14, 5);
  const terminalFacadeTexture = createFacadeTexture('#aab9bd', '#6d7c81', '#244754', 18, 7, true);
  const osmRoadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection });
  const osmBuildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xc1b9aa, map: houseFacadeTexture, roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ color: 0xb4a69a, map: urbanFacadeTextures[0], roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xaeb2b0, map: downtownFacadeTextures[0], roughness: 0.76, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: 0x8fa2a8, map: downtownFacadeTextures[2], roughness: 0.38, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0xa8acab, map: industrialFacadeTexture, roughness: 0.9, metalness: 0.08 }),
  ];
  const osmWaterMaterial = new THREE.MeshStandardMaterial({ color: 0x126f98, emissive: 0x05263a, emissiveIntensity: 0.18, roughness: 0.2, metalness: 0.18 });
  const osmLandMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x4f7b4d, map: grassTexture, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x2e603d, map: grassTexture, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x58666b, map: developedTexture, roughness: 1 }),
  ];

  const horizonGround = new THREE.Mesh(new THREE.PlaneGeometry(60_000, 60_000), new THREE.MeshStandardMaterial({ color: 0x47663d, roughness: 1, depthWrite: false }));
  horizonGround.rotation.x = -Math.PI / 2;
  horizonGround.position.y = -90;
  horizonGround.renderOrder = -3;
  scene.add(horizonGround);

  scene.add(createTerrainMesh(getTerrainHeight, new THREE.MeshStandardMaterial({ color: 0xffffff, map: grassTexture, roughness: 1 })));
  addCloudLayer(scene);

  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: developedTexture, roughness: 1 }), [
    { x: -1420, y: 0.022, z: -2820, width: 2450, height: 0.044, depth: 2250, color: 0x60686d },
    { x: 700, y: 0.022, z: -2950, width: 1900, height: 0.044, depth: 2850, color: 0x687176 },
    { x: -2020, y: 0.022, z: -900, width: 2050, height: 0.044, depth: 1900, color: 0x747a76 },
    { x: 850, y: 0.018, z: 3450, width: 3150, height: 0.036, depth: 3000, color: 0x74815c },
    { x: 1400, y: 0.022, z: -4600, width: 2500, height: 0.044, depth: 1450, color: 0x6d706c },
  ], transform, -1);

  const airportGrounds: BoxPlacement[] = [];
  const runways: BoxPlacement[] = [];
  const pavements: BoxPlacement[] = [];
  const markings: BoxPlacement[] = [];
  const taxiMarkings: BoxPlacement[] = [];
  const lights: BoxPlacement[] = [];
  const hangars: BoxPlacement[] = [];
  const terminals: BoxPlacement[] = [];
  const towers: BoxPlacement[] = [];
  const addAirportObstacle = (placement: BoxPlacement): void => {
    const half = Math.max(placement.width, placement.depth) / 2;
    obstacleBounds.push({ x: placement.x, z: placement.z, halfX: half, halfZ: half, height: placement.height, baseY: placement.y - placement.height / 2 });
  };
  for (const airport of airports) {
    const major = airport.id === 'central';
    const regional = airport.id === 'coast';
    const airportY = getTerrainHeight(airport.x, airport.z);
    airportGrounds.push({ x: airport.x, y: airportY + 0.025, z: airport.z, width: campusHalfWidth(airport) * 2, height: 0.05, depth: airport.runwayLength + 440, rotation: airport.heading, color: major ? 0x657b55 : 0x6d8058 });
    runways.push({ x: airport.x, y: airportY + 0.12, z: airport.z, width: airport.runwayWidth, height: 0.16, depth: airport.runwayLength, rotation: airport.heading });
    const taxiWidth = major ? 22 : regional ? 15 : 12;
    const taxiOffset = airport.runwayWidth / 2 + (major ? 92 : regional ? 56 : 42);
    const apronWidth = major ? 520 : regional ? 190 : 125;
    const apronDepth = major ? 1100 : regional ? 430 : 260;
    const apronLocalX = taxiOffset + taxiWidth / 2 + apronWidth / 2;
    const parallel = airportPoint(airport, taxiOffset, 0);
    pavements.push({ x: parallel.x, y: airportY + 0.12, z: parallel.z, width: taxiWidth, height: 0.14, depth: airport.runwayLength * (major ? 0.78 : 0.7), rotation: airport.heading });
    taxiMarkings.push({ x: parallel.x, y: airportY + 0.205, z: parallel.z, width: 0.35, height: 0.018, depth: airport.runwayLength * (major ? 0.78 : 0.7), rotation: airport.heading });
    const apron = airportPoint(airport, apronLocalX, 0);
    pavements.push({ x: apron.x, y: airportY + 0.12, z: apron.z, width: apronWidth, height: 0.14, depth: apronDepth, rotation: airport.heading });
    const standCount = major ? 11 : regional ? 4 : 3;
    for (let stand = 0; stand < standCount; stand += 1) {
      const localZ = (stand - (standCount - 1) / 2) * (major ? 92 : regional ? 78 : 64);
      const standPoint = airportPoint(airport, apronLocalX - apronWidth * 0.12, localZ);
      taxiMarkings.push({ x: standPoint.x, y: airportY + 0.205, z: standPoint.z, width: 0.28, height: 0.018, depth: apronWidth * 0.56, rotation: airport.heading + Math.PI / 2 });
    }
    for (const localZ of major ? [-850, -425, 0, 425, 850] : [-airport.runwayLength * 0.25, airport.runwayLength * 0.25]) {
      const connector = airportPoint(airport, taxiOffset / 2, localZ);
      pavements.push({ x: connector.x, y: airportY + 0.12, z: connector.z, width: taxiWidth, height: 0.14, depth: taxiOffset, rotation: airport.heading + Math.PI / 2 });
      taxiMarkings.push({ x: connector.x, y: airportY + 0.205, z: connector.z, width: 0.35, height: 0.018, depth: taxiOffset, rotation: airport.heading + Math.PI / 2 });
    }
    for (let localZ = -airport.runwayLength / 2 + 55; localZ <= airport.runwayLength / 2 - 55; localZ += 60) {
      const point = airportPoint(airport, 0, localZ);
      markings.push({ x: point.x, y: airportY + 0.235, z: point.z, width: 0.9, height: 0.025, depth: 30, rotation: airport.heading });
    }
    for (const localX of [-airport.runwayWidth / 2 + 0.75, airport.runwayWidth / 2 - 0.75]) {
      const point = airportPoint(airport, localX, 0);
      markings.push({ x: point.x, y: airportY + 0.235, z: point.z, width: 0.45, height: 0.025, depth: airport.runwayLength, rotation: airport.heading });
    }
    const thresholdSpacing = (airport.runwayWidth - 8) / 5;
    for (const localZ of [-airport.runwayLength / 2 + 34, airport.runwayLength / 2 - 34]) {
      for (let threshold = -2; threshold <= 2; threshold += 1) {
        const point = airportPoint(airport, threshold * thresholdSpacing, localZ);
        markings.push({ x: point.x, y: airportY + 0.237, z: point.z, width: 2.3, height: 0.025, depth: 18, rotation: airport.heading });
      }
    }
    for (let localZ = -airport.runwayLength / 2; localZ <= airport.runwayLength / 2; localZ += 75) {
      for (const localX of [-airport.runwayWidth / 2 - 1.4, airport.runwayWidth / 2 + 1.4]) {
        const point = airportPoint(airport, localX, localZ);
        lights.push({ x: point.x, y: airportY + 0.43, z: point.z, width: 0.65, height: 0.65, depth: 0.65 });
      }
    }
    const facilityX = apronLocalX + apronWidth / 2 + (major ? 110 : 45);
    const hangarCount = major ? 4 : 2;
    for (let index = 0; index < hangarCount; index += 1) {
      const majorZ = [-720, -520, 520, 720][index];
      const point = airportPoint(airport, facilityX + (major ? 30 : 0), major ? majorZ : (index - (hangarCount - 1) / 2) * 100);
      const width = major ? 118 : regional ? 58 : 46;
      const depth = major ? 165 : regional ? 78 : 62;
      const height = major ? 31 : regional ? 19 : 15;
      const placement = { x: point.x, y: airportY + height / 2, z: point.z, width, height, depth, rotation: airport.heading, color: index % 2 === 0 ? airport.accentColor : 0x8b9293 };
      hangars.push(placement);
      addAirportObstacle(placement);
    }
    if (major) {
      const terminalParts = [
        { localX: facilityX + 80, localZ: 0, width: 105, height: 42, depth: 650 },
        { localX: facilityX - 112, localZ: -285, width: 300, height: 24, depth: 48 },
        { localX: facilityX - 112, localZ: 0, width: 300, height: 24, depth: 48 },
        { localX: facilityX - 112, localZ: 285, width: 300, height: 24, depth: 48 },
        { localX: facilityX + 178, localZ: 0, width: 82, height: 31, depth: 430 },
      ];
      for (const part of terminalParts) {
        const point = airportPoint(airport, part.localX, part.localZ);
        const placement = { x: point.x, y: airportY + part.height / 2, z: point.z, width: part.width, height: part.height, depth: part.depth, rotation: airport.heading, color: 0x829298 };
        terminals.push(placement);
        addAirportObstacle(placement);
      }
      const parking = airportPoint(airport, facilityX + 330, 0);
      pavements.push({ x: parking.x, y: airportY + 0.1, z: parking.z, width: 270, height: 0.1, depth: 780, rotation: airport.heading });
      for (let row = -8; row <= 8; row += 1) {
        const stripe = airportPoint(airport, facilityX + 330, row * 42);
        markings.push({ x: stripe.x, y: airportY + 0.175, z: stripe.z, width: 245, height: 0.014, depth: 0.22, rotation: airport.heading });
      }
    } else {
      const terminalPoint = airportPoint(airport, facilityX, regional ? 190 : 135);
      const terminalWidth = regional ? 95 : 62;
      const terminalDepth = regional ? 120 : 75;
      const terminalHeight = regional ? 24 : 17;
      const placement = { x: terminalPoint.x, y: airportY + terminalHeight / 2, z: terminalPoint.z, width: terminalWidth, height: terminalHeight, depth: terminalDepth, rotation: airport.heading, color: 0x829298 };
      terminals.push(placement);
      addAirportObstacle(placement);
    }
    const towerPoint = airportPoint(airport, major ? facilityX - 25 : -airport.runwayWidth / 2 - 78, major ? -470 : -airport.runwayLength * 0.18);
    const towerHeight = major ? 68 : regional ? 38 : 28;
    const towerPlacement = { x: towerPoint.x, y: airportY + towerHeight / 2, z: towerPoint.z, width: major ? 14 : 9, height: towerHeight, depth: major ? 14 : 9, color: airport.accentColor };
    towers.push(towerPlacement);
    addAirportObstacle(towerPlacement);
  }

  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: grassTexture, roughness: 1 }), airportGrounds, transform, -1);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x777b7b, map: asphaltTexture, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), runways, transform, 1);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavementTexture, roughness: 1 }), pavements, transform, 1);
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xfff4d1, toneMapped: false, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), markings, transform, 2);
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xf1bd3e, toneMapped: false, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), taxiMarkings, transform, 2);
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xffdc88, toneMapped: false }), lights, transform, 2);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: industrialFacadeTexture, roughness: 0.82, metalness: 0.04 }), hangars, transform);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: terminalFacadeTexture, roughness: 0.36, metalness: 0.18 }), terminals, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0.08 }), towers, transform);

  const centralFacilityX = 755.5;
  for (const localZ of [-230, 0, 230]) {
    const point = airportPoint(centralAirport, centralFacilityX + 80, localZ);
    addSceneryAsset(scene, 'airportTerminal', {
      position: { x: point.x, y: getTerrainHeight(point.x, point.z) + 0.02, z: point.z },
      rotationY: centralAirport.heading,
      size: { x: 102, y: 42, z: 205 },
      maxDistance: 4200,
    });
  }
  for (const localZ of [-720, -520, 520, 720]) {
    const point = airportPoint(centralAirport, centralFacilityX + 30, localZ);
    addSceneryAsset(scene, 'airportHangar', {
      position: { x: point.x, y: getTerrainHeight(point.x, point.z) + 0.02, z: point.z },
      rotationY: centralAirport.heading,
      size: { x: 118, y: 31, z: 165 },
      maxDistance: 3300,
    });
  }
  const centralTowerPoint = airportPoint(centralAirport, centralFacilityX - 25, -470);
  addSceneryAsset(scene, 'airportTower', {
    position: { x: centralTowerPoint.x, y: getTerrainHeight(centralTowerPoint.x, centralTowerPoint.z) + 0.02, z: centralTowerPoint.z },
    rotationY: centralAirport.heading,
    size: { x: 18, y: 68, z: 18 },
    maxDistance: 4200,
  });

  const landmarkDetails = [
    { key: 'landmarkA' as const, x: -1525, z: -2820, width: 82, height: 285, depth: 82, rotation: 0 },
    { key: 'landmarkB' as const, x: -1778, z: -2400, width: 92, height: 300, depth: 84, rotation: 0 },
    { key: 'landmarkC' as const, x: -895, z: -2400, width: 104, height: 265, depth: 88, rotation: Math.PI / 12 },
    { key: 'landmarkD' as const, x: -1945, z: -3030, width: 110, height: 250, depth: 92, rotation: 0 },
    { key: 'landmarkE' as const, x: -1180, z: -3220, width: 78, height: 225, depth: 78, rotation: -Math.PI / 14 },
  ];
  for (const landmark of landmarkDetails) {
    addSceneryAsset(scene, landmark.key, {
      position: { x: landmark.x, y: getTerrainHeight(landmark.x, landmark.z) + 0.02, z: landmark.z },
      rotationY: landmark.rotation,
      size: { x: landmark.width, y: landmark.height, z: landmark.depth },
      maxDistance: 6500,
    });
  }

  const importedCity = addOsmCity(scene, {
    roadMaterial: osmRoadMaterial,
    buildingMaterials: osmBuildingMaterials,
    waterMaterial: osmWaterMaterial,
    landMaterials: osmLandMaterials,
    isExcluded: isNearAirport,
    heightAt: getTerrainHeight,
  });
  obstacleBounds.push(...importedCity.obstacleBounds);
  waterBounds.push(...importedCity.waterBounds);
  const roadSegments: ImportedRoadSegment[] = importedCity.roadSegments;
  const openParcels: BoxPlacement[] = [];
  const useSyntheticCity = false;
  if (useSyntheticCity) {
  const roads: BoxPlacement[] = [];
  const roadEdgeLines: BoxPlacement[] = [];
  const arterialLines: BoxPlacement[] = [];
  const addRoad = (x1: number, z1: number, x2: number, z2: number, width: number): void => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const rotation = Math.atan2(dx, dz);
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    roads.push({ x: centerX, y: 0.085, z: centerZ, width, height: 0.1, depth: length, rotation });
    roadSegments.push({ x1, z1, x2, z2, width });
    if (width >= SCALE.roads.highway) {
      const normalX = -dz / length;
      const normalZ = dx / length;
      const offset = width / 2 - 1.25;
      roadEdgeLines.push(
        { x: centerX + normalX * offset, y: 0.148, z: centerZ + normalZ * offset, width: 0.3, height: 0.018, depth: length, rotation },
        { x: centerX - normalX * offset, y: 0.148, z: centerZ - normalZ * offset, width: 0.3, height: 0.018, depth: length, rotation },
      );
    } else if (width >= SCALE.roads.arterial) {
      for (let distance = 35; distance < length - 20; distance += 64) {
        const progress = distance / length;
        arterialLines.push({ x: x1 + dx * progress, y: 0.148, z: z1 + dz * progress, width: 0.28, height: 0.018, depth: 24, rotation });
      }
    }
  };
  const d = SCALE.downtown;
  const minX = d.x - d.columns * d.spacing / 2;
  const maxX = d.x + d.columns * d.spacing / 2;
  const minZ = d.z - d.rows * d.spacing / 2;
  const maxZ = d.z + d.rows * d.spacing / 2;
  for (let column = 0; column <= d.columns; column += 1) addRoad(minX + column * d.spacing, minZ, minX + column * d.spacing, maxZ, SCALE.roads.street);
  for (let row = 0; row <= d.rows; row += 1) addRoad(minX, minZ + row * d.spacing, maxX, minZ + row * d.spacing, SCALE.roads.street);
  const addStreetGrid = (x: number, z: number, width: number, depth: number, spacing: number, roadWidth: number): void => {
    for (let roadX = x - width / 2; roadX <= x + width / 2 + 1; roadX += spacing) addRoad(roadX, z - depth / 2, roadX, z + depth / 2, roadWidth);
    for (let roadZ = z - depth / 2; roadZ <= z + depth / 2 + 1; roadZ += spacing) addRoad(x - width / 2, roadZ, x + width / 2, roadZ, roadWidth);
  };
  const addNeighborhoodRoads = (x: number, z: number, columns: number, rows: number): void => {
    const width = columns * SCALE.suburb.blockWidth;
    const depth = rows * SCALE.suburb.blockDepth;
    for (let column = 0; column <= columns; column += 1) {
      const bend = ((column * 37) % 5 - 2) * 12;
      const roadX = x - width / 2 + column * SCALE.suburb.blockWidth;
      addRoad(roadX, z - depth / 2, roadX + bend, z, SCALE.suburb.localStreet);
      addRoad(roadX + bend, z, roadX - bend * 0.35, z + depth / 2, SCALE.suburb.localStreet);
    }
    for (let row = 0; row <= rows; row += 1) {
      const bend = ((row * 29) % 5 - 2) * 10;
      const roadZ = z - depth / 2 + row * SCALE.suburb.blockDepth;
      addRoad(x - width / 2, roadZ, x, roadZ + bend, SCALE.suburb.localStreet);
      addRoad(x, roadZ + bend, x + width / 2, roadZ - bend * 0.35, SCALE.suburb.localStreet);
    }
  };
  addStreetGrid(720, -2920, 1850, 2800, 230, SCALE.roads.street);
  addStreetGrid(-2050, -850, 2000, 1900, 230, SCALE.roads.street);
  addStreetGrid(1710, -980, 1150, 1610, 230, SCALE.roads.street);
  addStreetGrid(-2550, 1180, 1150, 1150, 230, SCALE.roads.street);
  addNeighborhoodRoads(620, 3260, 7, 6);
  addNeighborhoodRoads(1810, 4380, 6, 5);
  addNeighborhoodRoads(-760, 3510, 5, 5);
  addRoad(-780, 2450, -620, 2800, SCALE.roads.arterial);
  addRoad(-620, 2800, 300, 3180, SCALE.roads.arterial);
  addRoad(300, 3180, 1320, 3900, SCALE.roads.arterial);
  addRoad(1320, 3900, 2310, 4700, SCALE.roads.arterial);
  const centralHighwaySegments: ReadonlyArray<readonly [number, number, number, number]> = [
    [600, -5800, 600, -1850],
    [600, -1850, 1380, -1480],
    [1380, -1480, 1380, 1480],
    [1380, 1480, 600, 1850],
    [600, 1850, 600, 5800],
  ];
  for (const [x1, z1, x2, z2] of centralHighwaySegments) addRoad(x1, z1, x2, z2, SCALE.roads.highway);
  addRoad(1380, -520, 1040, -520, SCALE.roads.arterial);
  addRoad(1380, 0, 1040, 0, SCALE.roads.arterial);
  addRoad(1380, 520, 1040, 520, SCALE.roads.arterial);
  addRoad(1040, -520, 1040, 520, SCALE.roads.street);
  addRoad(-5800, 1500, 2250, 1500, SCALE.roads.highway);
  addRoad(4750, 1500, 5800, 1500, SCALE.roads.highway);
  addRoad(1700, 500, 2250, 500, SCALE.roads.highway);
  addRoad(4750, 500, 5800, 500, SCALE.roads.highway);
  addRoad(-5750, -4300, -3200, -4300, SCALE.roads.arterial);
  addRoad(-3200, -4300, -650, -1700, SCALE.roads.arterial);
  addRoad(-5700, 4350, -4300, 4350, SCALE.roads.arterial);
  addRoad(-4300, 4350, -650, 1650, SCALE.roads.arterial);
  addRoad(4720, 1750, 5300, 2780, SCALE.roads.arterial);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x858585, map: asphaltTexture, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection }), roads, transform);
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xe7e3d5, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), roadEdgeLines, transform, 2);
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xd4b853, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), arterialLines, transform, 2);

  const bridges: BoxPlacement[] = [
    { x: 3500, y: 3.08, z: 500, width: 2500, height: 6, depth: SCALE.roads.highway },
    { x: 3500, y: 2.58, z: 1500, width: 2500, height: 5, depth: SCALE.roads.highway },
  ];
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x44494c, roughness: 0.93 }), bridges, transform);
  obstacleBounds.push({ x: 3500, z: 500, halfX: 1250, halfZ: 16, height: 6.1 }, { x: 3500, z: 1500, halfX: 1250, halfZ: 16, height: 5.1 });

  const highwayLines: BoxPlacement[] = [];
  const addHighwayDashes = (x1: number, z1: number, x2: number, z2: number): void => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const normalX = -dz / length;
    const normalZ = dx / length;
    const rotation = Math.atan2(dx, dz);
    for (let distance = 48; distance < length - 24; distance += 120) {
      const progress = distance / length;
      for (const laneOffset of [-5.4, 5.4]) {
        highwayLines.push({
          x: x1 + dx * progress + normalX * laneOffset,
          y: 0.145,
          z: z1 + dz * progress + normalZ * laneOffset,
          width: 0.32,
          height: 0.025,
          depth: 48,
          rotation,
        });
      }
    }
  };
  for (const [x1, z1, x2, z2] of centralHighwaySegments) addHighwayDashes(x1, z1, x2, z2);
  for (let x = -5740; x <= 5740; x += 120) {
    for (const laneOffset of [-5.4, 5.4]) highwayLines.push({ x, y: x >= 2250 && x <= 4750 ? 5.61 : 0.145, z: 1500 + laneOffset, width: 48, height: 0.025, depth: 0.32 });
  }
  for (let x = 1760; x <= 5740; x += 120) {
    for (const laneOffset of [-5.4, 5.4]) highwayLines.push({ x, y: x >= 2250 && x <= 4750 ? 6.11 : 0.145, z: 500 + laneOffset, width: 48, height: 0.025, depth: 0.32 });
  }
  highwayLines.push(
    { x: 3500, y: 6.11, z: 485.2, width: 2500, height: 0.025, depth: 0.28 },
    { x: 3500, y: 6.11, z: 514.8, width: 2500, height: 0.025, depth: 0.28 },
    { x: 3500, y: 5.61, z: 1485.2, width: 2500, height: 0.025, depth: 0.28 },
    { x: 3500, y: 5.61, z: 1514.8, width: 2500, height: 0.025, depth: 0.28 },
  );
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0xe8cf75, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection * 2 }), highwayLines, transform, 2);

  const rails: BoxPlacement[] = [
    { x: 3500, y: 7.1, z: 484, width: 2500, height: 2, depth: 1.2 }, { x: 3500, y: 7.1, z: 516, width: 2500, height: 2, depth: 1.2 },
    { x: 3500, y: 6.1, z: 1484, width: 2500, height: 2, depth: 1.2 }, { x: 3500, y: 6.1, z: 1516, width: 2500, height: 2, depth: 1.2 },
  ];
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xaeb6b8, roughness: 0.72 }), rails, transform);
  const piers: BoxPlacement[] = [];
  for (let x = 2320; x <= 4680; x += 240) {
    piers.push({ x, y: 7, z: 500, width: 11, height: 14, depth: 24 }, { x, y: 6.5, z: 1500, width: 10, height: 13, depth: 24 });
    obstacleBounds.push({ x, z: 500, halfX: 5.5, halfZ: 12, height: 14 }, { x, z: 1500, halfX: 5, halfZ: 12, height: 13 });
  }
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x858b8d, roughness: 1 }), piers, transform);

  const downtownBuildings: [BoxPlacement[], BoxPlacement[], BoxPlacement[]] = [[], [], []];
  const downtownPodiums: BoxPlacement[] = [];
  const downtownParcels: BoxPlacement[] = [];
  const landmarkCells = new Set(['4:4', '6:3', '3:6', '7:6', '2:3']);
  const openCells = new Set(['1:2', '8:1', '2:7', '7:7']);
  const addDowntownStructure = (placement: BoxPlacement, facadeHeight = placement.height): void => {
    const facadeTier = facadeHeight < 105 ? 0 : facadeHeight < 175 ? 1 : 2;
    downtownBuildings[facadeTier].push(placement);
    obstacleBounds.push({
      x: placement.x,
      z: placement.z,
      halfX: placement.width / 2,
      halfZ: placement.depth / 2,
      height: placement.y + placement.height / 2,
    });
  };
  for (let row = 0; row < d.rows; row += 1) {
    for (let column = 0; column < d.columns; column += 1) {
      const blockX = d.x + (column - (d.columns - 1) / 2) * d.spacing;
      const blockZ = d.z + (row - (d.rows - 1) / 2) * d.spacing;
      const parcelSize = d.spacing - SCALE.roads.street - d.blockInset;
      downtownParcels.push({ x: blockX, y: 0.065, z: blockZ, width: parcelSize, height: 0.08, depth: parcelSize, color: (row + column) % 3 === 0 ? 0x737675 : 0x686d6d });
      if (landmarkCells.has(`${column}:${row}`)) continue;
      if (openCells.has(`${column}:${row}`)) {
        openParcels.push({ x: blockX, y: 0.13, z: blockZ, width: parcelSize - 8, height: 0.08, depth: parcelSize - 8, color: (row + column) % 2 === 0 ? 0x647d58 : 0x555a5c });
        continue;
      }
      const radial = Math.hypot(column - 4.5, row - 4) / 6.1;
      const core = THREE.MathUtils.clamp(1 - radial, 0, 1);
      const seed = row * 67 + column * 43;
      const pattern = seed % 5;
      const towerHeight = THREE.MathUtils.clamp(58 + core * 145 + (seed % 43), 48, 245);
      const color = [0x67747c, 0x74828a, 0x596971, 0x817d75][seed % 4];
      if (pattern === 0) {
        const podiumHeight = 18 + seed % 13;
        downtownPodiums.push({ x: blockX, y: podiumHeight / 2, z: blockZ, width: parcelSize - 16, height: podiumHeight, depth: parcelSize - 28, color: 0x777a78 });
        const towerWidth = 62 + seed % 25;
        const towerDepth = 58 + (seed * 3) % 27;
        addDowntownStructure({ x: blockX - 12, y: podiumHeight + towerHeight / 2, z: blockZ + 8, width: towerWidth, height: towerHeight, depth: towerDepth, color }, towerHeight);
      } else if (pattern === 1) {
        const heightA = towerHeight * 0.78;
        const heightB = towerHeight * 0.62;
        addDowntownStructure({ x: blockX - 49, y: heightA / 2, z: blockZ, width: 58, height: heightA, depth: parcelSize - 30, color }, heightA);
        addDowntownStructure({ x: blockX + 26, y: heightB / 2, z: blockZ + 48, width: 108, height: heightB, depth: 58, color: 0x767f82 }, heightB);
      } else if (pattern === 2) {
        const podiumHeight = 24 + seed % 12;
        const midHeight = towerHeight * 0.58;
        downtownPodiums.push({ x: blockX, y: podiumHeight / 2, z: blockZ, width: 146, height: podiumHeight, depth: 126, color: 0x737776 });
        addDowntownStructure({ x: blockX + 8, y: podiumHeight + midHeight / 2, z: blockZ - 6, width: 102, height: midHeight, depth: 92, color }, midHeight);
        addDowntownStructure({ x: blockX + 4, y: podiumHeight + midHeight + towerHeight * 0.22, z: blockZ - 8, width: 68, height: towerHeight * 0.44, depth: 62, color: 0x5e747d }, towerHeight * 0.44);
      } else if (pattern === 3) {
        for (let lot = 0; lot < 3; lot += 1) {
          const lotHeight = towerHeight * (0.52 + lot * 0.13);
          const x = blockX + [-50, 47, 5][lot];
          const z = blockZ + [-37, -28, 53][lot];
          addDowntownStructure({ x, y: lotHeight / 2, z, width: 54 + (seed + lot * 7) % 22, height: lotHeight, depth: 55 + (seed + lot * 11) % 20, color: [color, 0x81817d, 0x637178][lot] }, lotHeight);
        }
      } else {
        const wingHeight = towerHeight * 0.55;
        addDowntownStructure({ x: blockX - 52, y: wingHeight / 2, z: blockZ, width: 52, height: wingHeight, depth: 142, color }, wingHeight);
        addDowntownStructure({ x: blockX + 52, y: wingHeight * 0.44, z: blockZ, width: 52, height: wingHeight * 0.88, depth: 142, color: 0x7d827f }, wingHeight * 0.88);
        addDowntownStructure({ x: blockX, y: towerHeight / 2, z: blockZ - 52, width: 60, height: towerHeight, depth: 48, color: 0x60727a }, towerHeight);
      }
    }
  }
  downtownBuildings.forEach((placements, index) => addBoxes(
    scene,
    facadeBox,
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: downtownFacadeTextures[index], roughness: index === 0 ? 0.76 : 0.38, metalness: index === 0 ? 0.05 : 0.2 }),
    placements,
    transform,
  ));
  for (const podium of downtownPodiums) {
    obstacleBounds.push({ x: podium.x, z: podium.z, halfX: podium.width / 2, halfZ: podium.depth / 2, height: podium.height });
  }
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: urbanFacadeTextures[1], roughness: 0.82, metalness: 0.03 }), downtownPodiums, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavementTexture, roughness: 1 }), downtownParcels, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavementTexture, roughness: 1 }), openParcels, transform);

  const glass = new THREE.MeshStandardMaterial({ color: 0x718992, map: downtownFacadeTextures[2], roughness: 0.28, metalness: 0.28 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x777876, map: downtownFacadeTextures[0], roughness: 0.72, metalness: 0.08 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb39a61, roughness: 0.5, metalness: 0.22 });
  const cylinder = new THREE.CylinderGeometry(1, 1.08, 1, 12);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const landmarkBox = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material, rotation = 0): void => {
    const mesh = new THREE.Mesh(facadeBox, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.scale.set(width, height, depth);
    scene.add(mesh);
  };
  landmarkBox(-1525, 130, -2820, 82, 260, 82, glass);
  landmarkBox(-1525, 292, -2820, 58, 64, 58, accent);
  const crown = new THREE.Mesh(cone, accent);
  crown.position.set(-1525, 356, -2820);
  crown.scale.set(38, 64, 38);
  scene.add(crown);
  obstacleBounds.push({ x: -1525, z: -2820, halfX: 44, halfZ: 44, height: 388 });

  const roundTower = new THREE.Mesh(cylinder, glass);
  roundTower.position.set(-1105, 164, -3030);
  roundTower.scale.set(49, 328, 49);
  scene.add(roundTower);
  const roundCap = new THREE.Mesh(cone, accent);
  roundCap.position.set(-1105, 344, -3030);
  roundCap.scale.set(38, 32, 38);
  scene.add(roundCap);
  obstacleBounds.push({ x: -1105, z: -3030, halfX: 50, halfZ: 50, height: 360 });

  landmarkBox(-1778, 150, -2400, 56, 300, 68, glass);
  landmarkBox(-1692, 140, -2400, 56, 280, 68, glass);
  landmarkBox(-1735, 252, -2400, 120, 18, 52, accent);
  obstacleBounds.push({ x: -1735, z: -2400, halfX: 74, halfZ: 36, height: 300 });
  landmarkBox(-895, 75, -2400, 118, 150, 96, stone, Math.PI / 12);
  landmarkBox(-895, 186, -2400, 88, 222, 76, glass, Math.PI / 12);
  landmarkBox(-895, 284, -2400, 54, 74, 52, accent, Math.PI / 12);
  obstacleBounds.push({ x: -895, z: -2400, halfX: 62, halfZ: 62, height: 321 });

  landmarkBox(-1945, 36, -3030, 142, 72, 112, stone);
  landmarkBox(-1945, 142, -3030, 96, 212, 82, glass);
  landmarkBox(-1945, 270, -3030, 62, 44, 54, accent);
  obstacleBounds.push({ x: -1945, z: -3030, halfX: 72, halfZ: 57, height: 292 });

  const urbanBuildings: [BoxPlacement[], BoxPlacement[]] = [[], []];
  const urbanParcels: BoxPlacement[] = [];
  const urbanParking: BoxPlacement[] = [];
  const addUrban = (centerX: number, centerZ: number, columns: number, rows: number, spacing: number): void => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const blockX = centerX + (column - (columns - 1) / 2) * spacing;
        const blockZ = centerZ + (row - (rows - 1) / 2) * spacing;
        if (isNearAirport(blockX, blockZ, spacing * 0.44)) continue;
        const parcelSize = spacing - SCALE.roads.street - SCALE.urban.blockInset;
        const seed = Math.abs(Math.round(centerX + centerZ)) + row * 53 + column * 79;
        urbanParcels.push({ x: blockX, y: 0.06, z: blockZ, width: parcelSize, height: 0.07, depth: parcelSize, color: seed % 3 === 0 ? 0x777b78 : 0x6e7473 });
        if (seed % 17 === 0) {
          urbanParking.push({ x: blockX, y: 0.12, z: blockZ, width: parcelSize - 16, height: 0.06, depth: parcelSize - 16, color: 0x555959 });
          continue;
        }
        const density = THREE.MathUtils.clamp(1 - Math.hypot(blockX - d.x, blockZ - d.z) / 5200, 0.12, 0.82);
        const baseHeight = 18 + density * 62 + seed % 25;
        const positions = [
          { x: -48, z: -48 }, { x: 49, z: -42 }, { x: -38, z: 50 }, { x: 53, z: 48 },
        ];
        const buildingCount = seed % 5 === 0 ? 4 : 3;
        for (let lot = 0; lot < buildingCount; lot += 1) {
          const x = blockX + positions[lot].x + ((seed + lot * 17) % 11) - 5;
          const z = blockZ + positions[lot].z + ((seed + lot * 23) % 9) - 4;
          const width = 47 + ((seed + lot * 13) % 29);
          const depth = 45 + ((seed + lot * 19) % 31);
          const height = THREE.MathUtils.clamp(baseHeight * (0.62 + lot * 0.12) + (seed + lot * 31) % 18, 20, 112);
          const color = [0x858b8c, 0x777f82, 0x918a7f, 0x6d797d][(seed + lot) % 4];
          urbanBuildings[(seed + lot) % 2].push({ x, y: height / 2, z, width, height, depth, color });
          obstacleBounds.push({ x, z, halfX: width / 2, halfZ: depth / 2, height });
        }
        if (seed % 4 === 1) {
          urbanParking.push({ x: blockX + 58, y: 0.12, z: blockZ - 58, width: 52, height: 0.06, depth: 46, color: 0x555959 });
        }
      }
    }
  };
  addUrban(720, -2920, 8, 12, 230);
  addUrban(-2050, -850, 9, 8, 230);
  addUrban(1710, -980, 5, 7, 230);
  addUrban(-2550, 1180, 5, 5, 230);
  urbanBuildings.forEach((placements, index) => addBoxes(
    scene,
    facadeBox,
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: urbanFacadeTextures[index], roughness: index === 0 ? 0.9 : 0.76, metalness: 0.02 }),
    placements,
    transform,
  ));
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pavementTexture, roughness: 1 }), urbanParcels, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltTexture, roughness: 0.98 }), urbanParking, transform);

  const houses: BoxPlacement[] = [];
  const roofPlacements: BoxPlacement[] = [];
  const suburbYards: BoxPlacement[] = [];
  const suburbCommercial: BoxPlacement[] = [];
  const suburbCommunity: BoxPlacement[] = [];
  const suburbParking: BoxPlacement[] = [];
  const addSuburb = (centerX: number, centerZ: number, columns: number, rows: number): void => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const blockX = centerX + (column - (columns - 1) / 2) * SCALE.suburb.blockWidth;
        const blockZ = centerZ + (row - (rows - 1) / 2) * SCALE.suburb.blockDepth;
        if (isNearAirport(blockX, blockZ, Math.max(SCALE.suburb.blockWidth, SCALE.suburb.blockDepth) * 0.48)) continue;
        const seed = Math.abs(Math.round(centerX + centerZ)) + row * 47 + column * 71;
        suburbYards.push({ x: blockX, y: 0.055, z: blockZ, width: SCALE.suburb.blockWidth - 17, height: 0.07, depth: SCALE.suburb.blockDepth - 17, color: seed % 3 === 0 ? 0x668057 : 0x71885f });
        if ((row === 0 && column % 3 === 1) || seed % 23 === 0) {
          const width = 112 + seed % 26;
          const depth = 44 + seed % 18;
          const height = 11 + seed % 7;
          suburbCommercial.push({ x: blockX, y: height / 2, z: blockZ - 34, width, height, depth, color: 0x858886 });
          suburbParking.push({ x: blockX, y: 0.12, z: blockZ + 40, width: width + 18, height: 0.06, depth: 58, color: 0x555958 });
          obstacleBounds.push({ x: blockX, z: blockZ - 34, halfX: width / 2, halfZ: depth / 2, height });
          continue;
        }
        if (seed % 29 === 0) {
          const width = 92;
          const depth = 68;
          const height = 13;
          suburbCommunity.push({ x: blockX - 18, y: height / 2, z: blockZ, width, height, depth, color: 0xa4a097 });
          suburbParking.push({ x: blockX + 55, y: 0.12, z: blockZ, width: 45, height: 0.06, depth: 72, color: 0x555958 });
          obstacleBounds.push({ x: blockX - 18, z: blockZ, halfX: width / 2, halfZ: depth / 2, height });
          continue;
        }
        const homeSites = [
          [-57, -52], [0, -54], [57, -50],
          [-57, 52], [0, 54], [57, 50],
        ] as const;
        for (let lot = 0; lot < homeSites.length; lot += 1) {
          if ((seed + lot * 7) % 19 === 0) continue;
          const x = blockX + homeSites[lot][0] + ((seed + lot * 11) % 7) - 3;
          const z = blockZ + homeSites[lot][1] + ((seed + lot * 13) % 7) - 3;
          const width = 11 + ((seed + lot * 5) % 7);
          const depth = 15 + ((seed + lot * 9) % 7);
          const height = 6.3 + ((seed + lot) % 4) * 0.85;
          const rotation = lot < 3 ? 0 : Math.PI;
          houses.push({ x, y: height / 2, z, width, height, depth, rotation, color: [0xc0b5a2, 0xb5afa4, 0xc5c4bb, 0xaaa49a][(seed + lot) % 4] });
          roofPlacements.push({ x, y: height + 1.6, z, width: width * 0.78, height: 3.2, depth: depth * 0.78, rotation: rotation + Math.PI / 4 });
          const half = Math.max(width, depth) / 2;
          obstacleBounds.push({ x, z, halfX: half, halfZ: half, height: height + 3.2 });
        }
      }
    }
  };
  addSuburb(620, 3260, 7, 6);
  addSuburb(1810, 4380, 6, 5);
  addSuburb(-760, 3510, 5, 5);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: houseFacadeTexture, roughness: 0.98 }), houses, transform);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: urbanFacadeTextures[0], roughness: 0.9 }), suburbCommercial, transform);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: urbanFacadeTextures[1], roughness: 0.92 }), suburbCommunity, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: grassTexture, roughness: 1 }), suburbYards, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltTexture, roughness: 0.98 }), suburbParking, transform);
  const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
  const roofs = new THREE.InstancedMesh(roofGeometry, new THREE.MeshStandardMaterial({ color: 0x755c4d, roughness: 0.98 }), roofPlacements.length);
  roofPlacements.forEach((roof, index) => {
    transform.position.set(roof.x, roof.y, roof.z);
    transform.rotation.set(0, roof.rotation ?? 0, 0);
    transform.scale.set(roof.width, roof.height, roof.depth);
    transform.updateMatrix();
    roofs.setMatrixAt(index, transform.matrix);
  });
  roofs.instanceMatrix.needsUpdate = true;
  scene.add(roofs);

  const warehouses: BoxPlacement[] = [];
  const distributionYards: BoxPlacement[] = [];
  const loadingDocks: BoxPlacement[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const x = 300 + column * 360;
      const z = -5300 + row * 365;
      const width = 145 + ((row + column) % 3) * 34;
      const depth = 155 + ((row * 3 + column) % 3) * 28;
      const height = 19 + ((row * 11 + column * 7) % 17);
      distributionYards.push({ x, y: 0.075, z, width: 315, height: 0.09, depth: 320, color: (row + column) % 2 === 0 ? 0x626665 : 0x585d5c });
      warehouses.push({ x, y: height / 2, z, width, height, depth, color: [0x7d8383, 0x898780, 0x6f7778][(row + column) % 3] });
      obstacleBounds.push({ x, z, halfX: width / 2, halfZ: depth / 2, height });
      const dockSide = x + width / 2 + 10;
      for (let dock = -2; dock <= 2; dock += 1) {
        loadingDocks.push({ x: dockSide, y: 2.2, z: z + dock * 28, width: 18, height: 4.4, depth: 7, color: 0xc1c2bd });
      }
    }
  }
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltTexture, roughness: 0.98 }), distributionYards, transform);
  addBoxes(scene, facadeBox, new THREE.MeshStandardMaterial({ color: 0xffffff, map: industrialFacadeTexture, roughness: 0.9, metalness: 0.09 }), warehouses, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xb9bab6, roughness: 0.85, metalness: 0.08 }), loadingDocks, transform);

  const stackGeometry = new THREE.CylinderGeometry(1, 1.16, 1, 10);
  const stacks = new THREE.InstancedMesh(stackGeometry, new THREE.MeshStandardMaterial({ color: 0x88766a, roughness: 0.88 }), 12);
  for (let index = 0; index < 12; index += 1) {
    const x = 360 + (index % 6) * 350;
    const z = -5420 + Math.floor(index / 6) * 1250;
    const height = 55 + (index % 4) * 12;
    transform.position.set(x, height / 2, z);
    transform.scale.set(11, height, 11);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    stacks.setMatrixAt(index, transform.matrix);
    obstacleBounds.push({ x, z, halfX: 12, halfZ: 12, height });
  }
  stacks.instanceMatrix.needsUpdate = true;
  scene.add(stacks);

  const tankGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  const tanks = new THREE.InstancedMesh(tankGeometry, new THREE.MeshStandardMaterial({ color: 0xaeb6b7, roughness: 0.6, metalness: 0.2 }), 18);
  for (let index = 0; index < 18; index += 1) {
    const x = 2400 + (index % 3) * 70;
    const z = -5200 + Math.floor(index / 3) * 175;
    const radius = 14 + (index % 3) * 2;
    const height = 22 + (index % 4) * 4;
    transform.position.set(x, height / 2, z);
    transform.scale.set(radius, height, radius);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    tanks.setMatrixAt(index, transform.matrix);
    obstacleBounds.push({ x, z, halfX: radius, halfZ: radius, height });
  }
  tanks.instanceMatrix.needsUpdate = true;
  scene.add(tanks);

  const outerShore: BoxPlacement[] = [
    { x: 2085, y: 0.035, z: 0, width: 210, height: 0.05, depth: 5500 },
    { x: 4915, y: 0.035, z: 0, width: 210, height: 0.05, depth: 5500 },
    { x: 3500, y: 0.035, z: -2700, width: 2840, height: 0.05, depth: 250 },
    { x: 3500, y: 0.035, z: 2700, width: 2840, height: 0.05, depth: 250 },
  ];
  const shore: BoxPlacement[] = [
    { x: 2185, y: 0.09, z: 0, width: 130, height: 0.12, depth: 5300 },
    { x: 4815, y: 0.09, z: 0, width: 130, height: 0.12, depth: 5300 },
    { x: 3500, y: 0.09, z: -2575, width: 2500, height: 0.12, depth: 150 },
    { x: 3500, y: 0.09, z: 2575, width: 2500, height: 0.12, depth: 150 },
  ];
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x798257, map: fieldTexture, roughness: 1 }), outerShore, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xb8ad7d, map: soilTexture, roughness: 1 }), shore, transform);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SCALE.water.width, SCALE.water.depth), new THREE.MeshStandardMaterial({ color: 0x126f98, emissive: 0x05263a, emissiveIntensity: 0.18, roughness: 0.2, metalness: 0.18 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(SCALE.water.x, 0.13, SCALE.water.z);
  scene.add(water);
  waterBounds.push({ minX: 2250, maxX: 4750, minZ: -2500, maxZ: 2500, surfaceY: 0.13 });
  const waterBands: BoxPlacement[] = [];
  for (let band = 0; band < 20; band += 1) waterBands.push({ x: SCALE.water.x, y: 0.165, z: -2300 + band * 240, width: 1300 + (band % 5) * 190, height: 0.015, depth: 2.2 });
  addBoxes(scene, unitBox, new THREE.MeshBasicMaterial({ color: 0x8bc9d5, transparent: true, opacity: 0.2, depthWrite: false }), waterBands, transform);
  }

  const fieldA: BoxPlacement[] = [];
  const fieldB: BoxPlacement[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const x = -5725 + column * 480;
      const z = 2050 + row * 510;
      if (isNearAirport(x, z, 15)) continue;
      const field = { x, y: 0.055, z, width: 445, height: 0.09, depth: 470 };
      ((row + column) % 2 === 0 ? fieldA : fieldB).push(field);
    }
  }
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0x9ca582, map: fieldTexture, roughness: 1 }), fieldA, transform);
  addBoxes(scene, unitBox, new THREE.MeshStandardMaterial({ color: 0xb7ab8b, map: soilTexture, roughness: 1 }), fieldB, transform);

  const siloGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  const siloPlacements: BoxPlacement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = -5520 + column * 1080;
      const z = 2240 + row * 1540;
      if (isNearAirport(x, z, 90)) continue;
      const height = 28 + ((row * 5 + column * 7) % 18);
      siloPlacements.push({ x, y: height / 2, z, width: 12, height, depth: 12 });
      obstacleBounds.push({ x, z, halfX: 13, halfZ: 13, height });
    }
  }
  const silos = new THREE.InstancedMesh(siloGeometry, new THREE.MeshStandardMaterial({ color: 0xb2b5b3, roughness: 0.9 }), siloPlacements.length);
  siloPlacements.forEach((silo, index) => {
    transform.position.set(silo.x, silo.y, silo.z);
    transform.scale.set(silo.width, silo.height, silo.depth);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    silos.setMatrixAt(index, transform.matrix);
  });
  silos.instanceMatrix.needsUpdate = true;
  scene.add(silos);

  const treePlacements: Array<{ x: number; z: number; height: number; radius: number }> = [];
  const treePositionIsClear = (x: number, z: number, radius: number): boolean => {
    if (isNearAirport(x, z, radius + 24)) return false;
    for (const road of roadSegments) {
      const clearance = road.width / 2 + radius + 3;
      if (distanceToSegmentSquared(x, z, road.x1, road.z1, road.x2, road.z2) <= clearance * clearance) return false;
    }
    for (const obstacle of obstacleBounds) {
      if (Math.abs(x - obstacle.x) <= obstacle.halfX + radius + 2 && Math.abs(z - obstacle.z) <= obstacle.halfZ + radius + 2) return false;
    }
    return true;
  };
  for (let index = 0; index < 880 && treePlacements.length < 560; index += 1) {
    const x = -5850 + ((index * 977) % 8200);
    const z = 1550 + ((index * 613) % 4200);
    const height = 9 + (index % 7) * 1.25;
    const radius = 3.4 + (index % 4) * 0.55;
    if (treePositionIsClear(x, z, radius)) treePlacements.push({ x, z, height, radius });
  }
  for (const park of openParcels) {
    for (let row = -1; row <= 1; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        const x = park.x + column * 42 + row * 5;
        const z = park.z + row * 42 - column * 4;
        if (treePositionIsClear(x, z, 4)) treePlacements.push({ x, z, height: 11 + (row + 1), radius: 4 });
      }
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.12, 1, 6), new THREE.MeshStandardMaterial({ color: 0x594838, roughness: 1 }), treePlacements.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x35573b, roughness: 1 }), treePlacements.length);
  treePlacements.forEach((tree, index) => {
    const trunkHeight = tree.height * 0.42;
    const groundY = getTerrainHeight(tree.x, tree.z);
    transform.position.set(tree.x, groundY + trunkHeight / 2, tree.z);
    transform.scale.set(0.7, trunkHeight, 0.7);
    transform.rotation.set(0, (index % 9) * 0.31, 0);
    transform.updateMatrix();
    trunks.setMatrixAt(index, transform.matrix);
    transform.position.set(tree.x, groundY + trunkHeight + (tree.height - trunkHeight) * 0.46, tree.z);
    transform.scale.set(tree.radius, (tree.height - trunkHeight) * 0.62, tree.radius);
    transform.updateMatrix();
    crowns.setMatrixAt(index, transform.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);
  replaceTreesWithInstancedAsset(
    scene,
    treePlacements.map((tree, index) => ({
      x: tree.x,
      y: getTerrainHeight(tree.x, tree.z) + 0.02,
      z: tree.z,
      height: tree.height,
      rotationY: (index % 9) * 0.31,
    })),
    [trunks, crowns],
  );

  const reliefPlacements = [
    { x: -5200, z: -2050, radius: 1050, radiusZ: 720, height: 125, rotation: 0.12 },
    { x: -4050, z: -2450, radius: 920, radiusZ: 610, height: 95, rotation: -0.24 },
    { x: -5550, z: 350, radius: 980, radiusZ: 620, height: 62, rotation: 0.18 },
    { x: -3350, z: 2450, radius: 760, radiusZ: 530, height: 48, rotation: -0.12 },
    { x: -2550, z: 5350, radius: 960, radiusZ: 520, height: 44, rotation: 0.28 },
    { x: 950, z: 5500, radius: 1150, radiusZ: 430, height: 34, rotation: -0.08 },
  ].filter((hill) => !isNearAirport(hill.x, hill.z, Math.max(hill.radius, hill.radiusZ) + 40));
  const reliefGeometry = createReliefGeometry();
  const relief = new THREE.InstancedMesh(reliefGeometry, new THREE.MeshStandardMaterial({ color: 0x61734e, roughness: 1 }), reliefPlacements.length);
  reliefPlacements.forEach((hill, index) => {
    const baseY = getTerrainHeight(hill.x, hill.z);
    transform.position.set(hill.x, baseY, hill.z);
    transform.scale.set(hill.radius, hill.height, hill.radiusZ);
    transform.rotation.set(0, hill.rotation, 0);
    transform.updateMatrix();
    relief.setMatrixAt(index, transform.matrix);
    mountainBounds.push({ x: hill.x, z: hill.z, radius: Math.max(hill.radius, hill.radiusZ), height: hill.height, baseY });
  });
  relief.instanceMatrix.needsUpdate = true;
  scene.add(relief);

  type MountainPlacement = MountainBounds & { radiusZ: number; rotation: number };
  const mountainPlacements: MountainPlacement[] = [];
  for (let index = 0; index < 9; index += 1) {
    const radius = 620 + (index % 4) * 95;
    const radiusZ = 420 + ((index * 3) % 4) * 75;
    const height = 430 + ((index * 137) % 420);
    const x = -5700 + index * 500;
    const z = -5450 + (index % 3) * 170;
    if (!isNearAirport(x, z, Math.max(radius, radiusZ) + 45)) mountainPlacements.push({ x, z, radius, radiusZ, height, rotation: (index % 5) * 0.17 });
  }
  for (let index = 0; index < 8; index += 1) {
    const radius = 560 + (index % 3) * 110;
    const radiusZ = 620 + ((index + 1) % 3) * 100;
    const height = 360 + ((index * 113) % 390);
    const x = -5350 + (index % 3) * 230;
    const z = -4700 + index * 480;
    if (!isNearAirport(x, z, Math.max(radius, radiusZ) + 45)) mountainPlacements.push({ x, z, radius, radiusZ, height, rotation: (index % 4) * 0.22 });
  }
  for (let index = 0; index < 7; index += 1) {
    const radius = 520 + (index % 3) * 100;
    const radiusZ = 360 + (index % 2) * 90;
    const height = 390 + ((index * 97) % 330);
    mountainPlacements.push({ x: -1500 + index * 480, z: -5750 + (index % 3) * 120, radius, radiusZ, height, rotation: (index % 5) * 0.2 });
  }
  const mountainGeometry = createMountainGeometry();
  const mountains = new THREE.InstancedMesh(mountainGeometry, new THREE.MeshStandardMaterial({ color: 0x69675f, roughness: 1, flatShading: true }), mountainPlacements.length);
  mountainPlacements.forEach((mountain, index) => {
    const baseY = getTerrainHeight(mountain.x, mountain.z);
    transform.position.set(mountain.x, baseY + mountain.height / 2, mountain.z);
    transform.scale.set(mountain.radius, mountain.height, mountain.radiusZ);
    transform.rotation.set(0, mountain.rotation, 0);
    transform.updateMatrix();
    mountains.setMatrixAt(index, transform.matrix);
    mountainBounds.push({ x: mountain.x, z: mountain.z, radius: Math.max(mountain.radius, mountain.radiusZ), height: mountain.height, baseY });
  });
  mountains.instanceMatrix.needsUpdate = true;
  scene.add(mountains);

  const caps = new THREE.InstancedMesh(mountainGeometry, new THREE.MeshStandardMaterial({ color: 0xc1c5c0, roughness: 0.96, flatShading: true }), mountainPlacements.length);
  mountainPlacements.forEach((mountain, index) => {
    const capHeight = mountain.height * 0.18;
    transform.position.set(mountain.x, getTerrainHeight(mountain.x, mountain.z) + mountain.height - capHeight / 2, mountain.z);
    transform.scale.set(mountain.radius * 0.18, capHeight, mountain.radiusZ * 0.18);
    transform.rotation.set(0, mountain.rotation, 0);
    transform.updateMatrix();
    caps.setMatrixAt(index, transform.matrix);
  });
  caps.instanceMatrix.needsUpdate = true;
  scene.add(caps);

  return { obstacleBounds, mountainBounds, waterBounds };
}
