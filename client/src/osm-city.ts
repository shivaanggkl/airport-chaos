import * as THREE from 'three';

export type CompactChunk = {
  x: number;
  z: number;
  r: number[];
  b: number[][];
  w: number[][];
  p: number[][];
  a?: number[];
};

export type OsmDataProvenance = {
  derivedFrom: string;
  provider: string;
  sourceUrl: string;
  downloadedAt: string;
  osmSnapshotAt: string;
  extractedAt: string;
  geographicBounds: { south: number; west: number; north: number; east: number };
  geographicBoundsType: string;
  importer: string;
  pipeline: string;
  pipelineVersion: number | string;
  generatedAt: string;
  datasetVersion: number;
};

export type CompactCityData = {
  v: number;
  source: string;
  attribution: string;
  license: string;
  copyright?: string;
  provenance?: OsmDataProvenance;
  chunkSize: number;
  chunks: CompactChunk[];
};

export type ImportedRoadSegment = { x1: number; z1: number; x2: number; z2: number; width: number };
export type ImportedObstacle = {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  height: number;
  baseY: number;
  polygon: ReadonlyArray<readonly [number, number]>;
};
export type ImportedWater = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  surfaceY: number;
  polygon: ReadonlyArray<readonly [number, number]>;
};

type GeometryBuffers = {
  positions: number[];
  normals: number[];
  colors?: number[];
  uvs?: number[];
  indices?: number[];
};

type StreamedChunkGroups = {
  detail: THREE.Group;
  mid?: THREE.Group;
  far?: THREE.Group;
  x: number;
  z: number;
  detailRadius: number;
  midRadius: number;
  farRadius: number;
};

type BuildingMassing = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxHeight: number;
};

const streamedChunkGroups: StreamedChunkGroups[] = [];
// Existing mapped west-Downtown footprints, kept separate only so Mission 19
// can reversibly replace them during its timeout presentation at every LOD.
export const monsterDamageSites = [
  { x: -2191, z: -1201, y: 122, width: 165, depth: 124 },
  { x: -2140, z: -1155, y: 122.1, width: 126, depth: 99 },
  { x: -2214, z: -1329, y: 122, width: 128, depth: 102 },
] as const;
const monsterTargetMeshes = new Set<THREE.Mesh>();
let monsterDamageActive = false;
export function setMappedMonsterDamage(active: boolean): void {
  monsterDamageActive = active;
  for (const mesh of monsterTargetMeshes) mesh.visible = !active;
}
const roadWidths = [9, 11, 14, 18, 30, 4] as const;
const roadColors = [0x41484c, 0x3c4347, 0x363d42, 0x30383d, 0x293238, 0x665f55] as const;
const color = new THREE.Color();

function pushTriangle(buffers: GeometryBuffers, a: readonly number[], b: readonly number[], c: readonly number[], normal: readonly number[], uv?: readonly number[]): void {
  const first = buffers.indices ? buffers.positions.length / 3 : 0;
  buffers.positions.push(...a, ...b, ...c);
  buffers.normals.push(...normal, ...normal, ...normal);
  if (buffers.uvs) buffers.uvs.push(...(uv ?? [0, 0, 1, 0, 1, 1]));
  if (buffers.indices) buffers.indices.push(first, first + 1, first + 2);
}

function createGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  // Unit normals and vertex colors do not need 32-bit components. Packing
  // them cuts the resident Dallas NEAR working set without changing meshes,
  // chunk radii or LOD handoff behavior.
  const normals = new Int8Array(buffers.normals.length);
  for (let index = 0; index < normals.length; index += 1) {
    normals[index] = Math.round(THREE.MathUtils.clamp(buffers.normals[index], -1, 1) * 127);
  }
  geometry.setAttribute('normal', new THREE.Int8BufferAttribute(normals, 3, true));
  if (buffers.colors) {
    const colors = new Uint8Array(buffers.colors.length);
    for (let index = 0; index < colors.length; index += 1) {
      colors[index] = Math.round(THREE.MathUtils.clamp(buffers.colors[index], 0, 1) * 255);
    }
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute(colors, 3, true));
  }
  if (buffers.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  if (buffers.indices) geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function flatPolygon(data: number[], offset = 0): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let index = offset; index < data.length - 1; index += 2) points.push([data[index], data[index + 1]]);
  return points;
}

function bounds(points: ReadonlyArray<readonly [number, number]>): { minX: number; maxX: number; minZ: number; maxZ: number; x: number; z: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

function addSurfacePolygon(buffers: GeometryBuffers, points: ReadonlyArray<readonly [number, number]>, y: number | ((x: number, z: number) => number), tint?: number): void {
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  color.set(tint ?? 0xffffff);
  for (const triangle of triangles) {
    const a = points[triangle[0]];
    const b = points[triangle[1]];
    const c = points[triangle[2]];
    const heightAt = typeof y === 'function' ? y : () => y;
    pushTriangle(buffers, [a[0], heightAt(a[0], a[1]), a[1]], [c[0], heightAt(c[0], c[1]), c[1]], [b[0], heightAt(b[0], b[1]), b[1]], [0, 1, 0]);
    if (buffers.colors) {
      for (let vertex = 0; vertex < 3; vertex += 1) buffers.colors.push(color.r, color.g, color.b);
    }
  }
}

function addBuilding(buffers: GeometryBuffers, points: ReadonlyArray<readonly [number, number]>, baseY: number, height: number, flatRoof = true): void {
  if (flatRoof) {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const triangle of triangles) {
      const a = points[triangle[0]];
      const b = points[triangle[1]];
      const c = points[triangle[2]];
      pushTriangle(buffers, [a[0], baseY + height, a[1]], [c[0], baseY + height, c[1]], [b[0], baseY + height, b[1]], [0, 1, 0], [0.002, 0.002, 0.002, 0.002, 0.002, 0.002]);
    }
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const [x1, z1] = points[index];
    const [x2, z2] = points[next];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.5) continue;
    const normal = [dz / length, 0, -dx / length] as const;
    const u = Math.max(1, length / 5);
    const v = Math.max(1, height / 3.4);
    if (buffers.indices) {
      const first = buffers.positions.length / 3;
      buffers.positions.push(x1, baseY, z1, x2, baseY, z2, x2, baseY + height, z2, x1, baseY + height, z1);
      for (let vertex = 0; vertex < 4; vertex += 1) buffers.normals.push(...normal);
      if (buffers.uvs) buffers.uvs.push(0, 0, u, 0, u, v, 0, v);
      buffers.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    } else {
      pushTriangle(buffers, [x1, baseY, z1], [x2, baseY, z2], [x2, baseY + height, z2], normal, [0, 0, u, 0, u, v]);
      pushTriangle(buffers, [x1, baseY, z1], [x2, baseY + height, z2], [x1, baseY + height, z1], normal, [0, 0, u, v, 0, v]);
    }
  }
}

// Decorative roof styles fit completely inside the source building's collision
// envelope: the mapped height remains the peak and the walls end below it.
function addResidentialRoof(buffers: GeometryBuffers, points: ReadonlyArray<readonly [number, number]>, eaveY: number, peakY: number, tint: number, gable: boolean): void {
  const roofColor = new THREE.Color(tint);
  const face = (a: readonly number[], b: readonly number[], c: readonly number[]) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const normal = ab.cross(ac).normalize();
    pushTriangle(buffers, a, b, c, [normal.x, normal.y, normal.z]);
    for (let vertex = 0; vertex < 3; vertex += 1) buffers.colors!.push(roofColor.r, roofColor.g, roofColor.b);
  };
  const eave = points.map(([x, z]) => [x, eaveY, z]);
  if (!gable) {
    const center = points.reduce((sum, [x, z]) => [sum[0] + x / 4, sum[1] + z / 4], [0, 0]);
    const peak = [center[0], peakY, center[1]];
    for (let index = 0; index < 4; index += 1) face(eave[index], eave[(index + 1) % 4], peak);
    return;
  }
  const edge0 = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  const edge1 = Math.hypot(points[2][0] - points[1][0], points[2][1] - points[1][1]);
  const offset = edge0 >= edge1 ? 0 : 1;
  const p = Array.from({ length: 4 }, (_, index) => eave[(index + offset) % 4]);
  const ridgeA = [(p[0][0] + p[3][0]) / 2, peakY, (p[0][2] + p[3][2]) / 2];
  const ridgeB = [(p[1][0] + p[2][0]) / 2, peakY, (p[1][2] + p[2][2]) / 2];
  face(p[0], p[1], ridgeB); face(p[0], ridgeB, ridgeA);
  face(p[2], p[3], ridgeA); face(p[2], ridgeA, ridgeB);
  face(p[1], p[2], ridgeB); face(p[3], p[0], ridgeA);
}

function pointInPolygon(x: number, z: number, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function detailHash(x: number, z: number): number {
  return (Math.imul(Math.round(x), 73856093) ^ Math.imul(Math.round(z), 19349663)) >>> 0;
}

function isConvexQuadrilateral(points: ReadonlyArray<readonly [number, number]>): boolean {
  if (points.length !== 4) return false;
  let direction = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = points[index], b = points[(index + 1) % 4], c = points[(index + 2) % 4];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(turn) < 0.1) return false;
    if (direction && Math.sign(turn) !== direction) return false;
    direction = Math.sign(turn);
  }
  return true;
}

function addTree(trunks: GeometryBuffers, crowns: GeometryBuffers, x: number, y: number, z: number, size: number): void {
  const trunkHalf = size * 0.07;
  const trunkTop = y + size * 0.46;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const normal = [b[1] - a[1], 0, a[0] - b[0]];
    pushTriangle(trunks, [x + a[0] * trunkHalf, y, z + a[1] * trunkHalf], [x + b[0] * trunkHalf, y, z + b[1] * trunkHalf], [x + b[0] * trunkHalf, trunkTop, z + b[1] * trunkHalf], normal);
    pushTriangle(trunks, [x + a[0] * trunkHalf, y, z + a[1] * trunkHalf], [x + b[0] * trunkHalf, trunkTop, z + b[1] * trunkHalf], [x + a[0] * trunkHalf, trunkTop, z + a[1] * trunkHalf], normal);
  }
  const radius = size * 0.31;
  const lowerY = y + size * 0.33;
  const tip = [x, y + size, z];
  for (let i = 0; i < 6; i += 1) {
    const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3;
    const center = (a + b) / 2;
    pushTriangle(crowns,
      [x + Math.cos(a) * radius, lowerY, z + Math.sin(a) * radius],
      [x + Math.cos(b) * radius, lowerY, z + Math.sin(b) * radius],
      tip, [Math.cos(center) * 0.8, 0.6, Math.sin(center) * 0.8]);
  }
}

export function updateOsmCityChunks(position: THREE.Vector3): void {
  for (const chunk of streamedChunkGroups) {
    const dx = position.x - chunk.x;
    const dz = position.z - chunk.z;
    const distanceSquared = dx * dx + dz * dz;
    chunk.detail.visible = distanceSquared <= chunk.detailRadius * chunk.detailRadius;
    if (chunk.mid) {
      chunk.mid.visible = distanceSquared > chunk.detailRadius * chunk.detailRadius && distanceSquared <= chunk.midRadius * chunk.midRadius;
    }
    if (chunk.far) {
      chunk.far.visible = distanceSquared > chunk.midRadius * chunk.midRadius && distanceSquared <= chunk.farRadius * chunk.farRadius;
    }
  }
}

function addMassing(masses: Map<string, BuildingMassing>, box: ReturnType<typeof bounds>, height: number, gridSize: number): void {
  const key = `${Math.floor(box.x / gridSize)}:${Math.floor(box.z / gridSize)}`;
  const existing = masses.get(key);
  if (existing) {
    existing.minX = Math.min(existing.minX, box.minX);
    existing.maxX = Math.max(existing.maxX, box.maxX);
    existing.minZ = Math.min(existing.minZ, box.minZ);
    existing.maxZ = Math.max(existing.maxZ, box.maxZ);
    existing.maxHeight = Math.max(existing.maxHeight, height);
    return;
  }
  masses.set(key, { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, maxHeight: height });
}

function addRoadSurface(buffers: GeometryBuffers, a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
  pushTriangle(buffers, a, d, b, [0, 1, 0]);
  pushTriangle(buffers, b, d, c, [0, 1, 0]);
}

export function addOsmCityData(
  scene: THREE.Scene,
  cityData: CompactCityData,
  options: {
    roadMaterial: THREE.Material;
    roofMaterial?: THREE.Material;
    drivewayMaterial?: THREE.Material;
    bridgeTrimMaterial?: THREE.Material;
    shorelineMaterial?: THREE.Material;
    treeTrunkMaterial?: THREE.Material;
    treeCrownMaterial?: THREE.Material;
    streetLightMaterial?: THREE.PointsMaterial;
    buildingMaterials: ReadonlyArray<THREE.Material>;
    waterMaterial: THREE.Material;
    landMaterials: ReadonlyArray<THREE.Material>;
    isExcluded: (x: number, z: number, padding: number) => boolean;
    heightAt: (x: number, z: number) => number;
    // Dallas already streams separately preprocessed NEAR/MID/FAR chunks.
    // Callers that only render one of those files must not allocate the
    // legacy derived LODs or collision return arrays just to discard them.
    collectCollisionData?: boolean;
    isBuildingExcluded?: (x:number,z:number)=>boolean;
    monsterDamageTargets?: boolean;
    streamRadius?: number;
    midRadius?: number;
    farRadius?: number;
    majorHighwayWidth?: number;
    highwayAccentMaterial?: THREE.Material;
    aerowayMaterials?: ReadonlyArray<THREE.Material>;
  },
): { roadSegments: ImportedRoadSegment[]; obstacleBounds: ImportedObstacle[]; waterBounds: ImportedWater[]; groups: THREE.Group[] } {
  const roadSegments: ImportedRoadSegment[] = [];
  const obstacleBounds: ImportedObstacle[] = [];
  const waterBounds: ImportedWater[] = [];
  const groups: THREE.Group[] = [];
  const collectCollisionData = options.collectCollisionData !== false;
  const buildDerivedLods = options.streamRadius !== undefined;

  for (const chunk of cityData.chunks) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `osm-${chunk.x}-${chunk.z}`;
    const midGroup = new THREE.Group();
    midGroup.name = `osm-mid-${chunk.x}-${chunk.z}`;
    const farGroup = new THREE.Group();
    farGroup.name = `osm-far-${chunk.x}-${chunk.z}`;

    const roadBuffers: GeometryBuffers = { positions: [], normals: [], colors: [] };
    const streetLightPositions: number[] = [];
    const lightStride = Math.max(1, Math.ceil(chunk.r.length / 6 / 160));
    const highwayAccentBuffers: GeometryBuffers = { positions: [], normals: [] };
    const bridgeTrimBuffers: GeometryBuffers = { positions: [], normals: [] };
    const drivableRoads: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> = [];
    const sceneryRoads: typeof drivableRoads = [];
    const midRoadBuffers: GeometryBuffers = { positions: [], normals: [] };
    const farRoadBuffers: GeometryBuffers = { positions: [], normals: [] };
    for (let index = 0; index < chunk.r.length; index += 6) {
      const classification = chunk.r[index];
      const bridge = chunk.r[index + 1] === 1;
      const x1 = chunk.r[index + 2];
      const z1 = chunk.r[index + 3];
      const x2 = chunk.r[index + 4];
      const z2 = chunk.r[index + 5];
      const width = classification === 4 && options.majorHighwayWidth ? options.majorHighwayWidth : (roadWidths[classification] ?? roadWidths[0]);
      const centerX = (x1 + x2) / 2;
      const centerZ = (z1 + z2) / 2;
      if (options.isExcluded(centerX, centerZ, width / 2 + 8)) continue;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.5) continue;
      const offsetX = -dz / length * width / 2;
      const offsetZ = dx / length * width / 2;
      const startY = options.heightAt(x1, z1) + (bridge ? 6.1 : 0.11);
      const endY = options.heightAt(x2, z2) + (bridge ? 6.1 : 0.11);
      if (options.streetLightMaterial && (index / 6) % lightStride === 0 && classification !== 5) {
        streetLightPositions.push(centerX, (startY + endY) * 0.5 + 0.8, centerZ);
      }
      const a = [x1 + offsetX, startY, z1 + offsetZ] as const;
      const b = [x1 - offsetX, startY, z1 - offsetZ] as const;
      const c = [x2 - offsetX, endY, z2 - offsetZ] as const;
      const d = [x2 + offsetX, endY, z2 + offsetZ] as const;
      addRoadSurface(roadBuffers, a, b, c, d);
      if (classification <= 1) drivableRoads.push({ x1, z1, x2, z2, width });
      // Keep tree canopies off mapped footpaths as well as vehicle roads.
      sceneryRoads.push({ x1, z1, x2, z2, width });
      if (bridge && options.bridgeTrimMaterial) {
        // Painted deck edges clarify mapped crossings without adding an
        // unregistered solid rail inside the Trinity flight opening.
        const inset = 0.7 / width;
        for (const side of [-1, 1]) {
          const startX = x1 + offsetX * side * (1 - inset), startZ = z1 + offsetZ * side * (1 - inset);
          const endX = x2 + offsetX * side * (1 - inset), endZ = z2 + offsetZ * side * (1 - inset);
          const innerStartX = x1 + offsetX * side * (1 - inset * 3), innerStartZ = z1 + offsetZ * side * (1 - inset * 3);
          const innerEndX = x2 + offsetX * side * (1 - inset * 3), innerEndZ = z2 + offsetZ * side * (1 - inset * 3);
          addRoadSurface(bridgeTrimBuffers,
            [startX, startY + 0.04, startZ], [innerStartX, startY + 0.04, innerStartZ],
            [innerEndX, endY + 0.04, innerEndZ], [endX, endY + 0.04, endZ]);
        }
      }
      color.set(roadColors[classification] ?? roadColors[0]);
      for (let vertex = 0; vertex < 6; vertex += 1) roadBuffers.colors!.push(color.r, color.g, color.b);
      if (classification === 4 && options.highwayAccentMaterial) {
        const stripeWidth = 0.46;
        const stripeOffset = width * 0.5 - 1.5;
        for (const side of [-1, 1]) {
          const stripeX = offsetX * (stripeOffset * 2 / width) * side;
          const stripeZ = offsetZ * (stripeOffset * 2 / width) * side;
          const innerX = offsetX * (stripeWidth * 2 / width) * side;
          const innerZ = offsetZ * (stripeWidth * 2 / width) * side;
          const ay = startY + 0.035;
          const by = endY + 0.035;
          pushTriangle(highwayAccentBuffers, [x1 + stripeX - innerX, ay, z1 + stripeZ - innerZ], [x2 + stripeX - innerX, by, z2 + stripeZ - innerZ], [x1 + stripeX + innerX, ay, z1 + stripeZ + innerZ], [0, 1, 0]);
          pushTriangle(highwayAccentBuffers, [x1 + stripeX + innerX, ay, z1 + stripeZ + innerZ], [x2 + stripeX - innerX, by, z2 + stripeZ - innerZ], [x2 + stripeX + innerX, by, z2 + stripeZ + innerZ], [0, 1, 0]);
        }
      }
      if (buildDerivedLods && classification >= 2) addRoadSurface(midRoadBuffers, a, b, c, d);
      if (buildDerivedLods && classification >= 3) addRoadSurface(farRoadBuffers, a, b, c, d);
      if (collectCollisionData) roadSegments.push({ x1, z1, x2, z2, width });
    }
    if (roadBuffers.positions.length) {
      const roadMesh = new THREE.Mesh(createGeometry(roadBuffers), options.roadMaterial);
      roadMesh.name = 'osm-road';
      chunkGroup.add(roadMesh);
    }
    if (streetLightPositions.length && options.streetLightMaterial) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(streetLightPositions, 3));
      chunkGroup.add(new THREE.Points(geometry, options.streetLightMaterial));
    }
    if (highwayAccentBuffers.positions.length && options.highwayAccentMaterial) {
      const accentMesh = new THREE.Mesh(createGeometry(highwayAccentBuffers), options.highwayAccentMaterial);
      accentMesh.name = 'osm-highway-accent';
      chunkGroup.add(accentMesh);
    }
    if (bridgeTrimBuffers.positions.length && options.bridgeTrimMaterial) {
      const mesh = new THREE.Mesh(createGeometry(bridgeTrimBuffers), options.bridgeTrimMaterial);
      mesh.name = 'osm-bridge-deck-edges';
      chunkGroup.add(mesh);
    }

    const aerowayBuffers = (options.aerowayMaterials ?? []).map((): GeometryBuffers => ({ positions: [], normals: [] }));
    for (let index = 0; index < (chunk.a?.length ?? 0); index += 6) {
      const kind = chunk.a![index];
      const x1 = chunk.a![index + 1];
      const z1 = chunk.a![index + 2];
      const x2 = chunk.a![index + 3];
      const z2 = chunk.a![index + 4];
      const width = chunk.a![index + 5];
      const length = Math.hypot(x2 - x1, z2 - z1);
      const buffer = aerowayBuffers[kind];
      if (!buffer || length < 0.5) continue;
      const offsetX = -(z2 - z1) / length * width / 2;
      const offsetZ = (x2 - x1) / length * width / 2;
      const startY = options.heightAt(x1, z1) + 0.145;
      const endY = options.heightAt(x2, z2) + 0.145;
      addRoadSurface(buffer,
        [x1 + offsetX, startY, z1 + offsetZ], [x1 - offsetX, startY, z1 - offsetZ],
        [x2 - offsetX, endY, z2 - offsetZ], [x2 + offsetX, endY, z2 + offsetZ],
      );
    }
    aerowayBuffers.forEach((buffers, kind) => {
      if (buffers.positions.length) {
        const aerowayMesh = new THREE.Mesh(createGeometry(buffers), options.aerowayMaterials![kind]);
        aerowayMesh.name = `osm-aeroway-${kind}`;
        chunkGroup.add(aerowayMesh);
      }
    });

    const buildingBuffers = options.buildingMaterials.map((material): GeometryBuffers => ({
      positions: [], normals: [], indices: [],
      // Dallas's streamed building materials are untextured. Milwaukee's
      // mapped facades retain UVs; unused UV arrays cost many MiB downtown.
      ...((material as THREE.MeshStandardMaterial).map ? { uvs: [] } : {}),
    }));
    const targetBuffers = options.monsterDamageTargets
      ? options.buildingMaterials.map((): GeometryBuffers => ({ positions: [], normals: [], indices: [] })) : undefined;
    const roofBuffers: GeometryBuffers = { positions: [], normals: [], colors: [] };
    const drivewayBuffers: GeometryBuffers = { positions: [], normals: [] };
    const buildingBoxes: Array<ReturnType<typeof bounds>> = [];
    const midMasses = new Map<string, BuildingMassing>();
    const farMasses = new Map<string, BuildingMassing>();
    for (const building of chunk.b) {
      const height = building[0];
      const family = building[1];
      // v2 adds a compact height-provenance code; v3 also fixes the building's sampled base elevation.
      const points = flatPolygon(building, cityData.v >= 3 ? 4 : cityData.v >= 2 ? 3 : 2);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 8)) continue;
      if (options.isBuildingExcluded?.(box.x, box.z)) continue;
      buildingBoxes.push(box);
      const baseY = (cityData.v >= 3 ? building[3] : options.heightAt(box.x, box.z)) + 0.08;
      const isTarget = targetBuffers && monsterDamageSites.some(site =>
        Math.abs(box.x - site.x) < 5 && Math.abs(box.z - site.z) < 5);
      const buffers = isTarget ? targetBuffers[family] ?? targetBuffers[2] : buildingBuffers[family] ?? buildingBuffers[2];
      const width = box.maxX - box.minX, depth = box.maxZ - box.minZ;
      const detailSeed = detailHash(box.x, box.z);
      const residentialRoof = Boolean(options.roofMaterial) && family === 0 && isConvexQuadrilateral(points) &&
        height >= 4 && height <= 15 && width >= 5 && depth >= 5 && width * depth >= 45 && width * depth <= 1_400 && detailSeed % 7 === 0;
      const roofRise = residentialRoof ? Math.min(2.7, Math.max(0.9, height * 0.23)) : 0;
      addBuilding(buffers, points, baseY, height - roofRise, !residentialRoof);
      if (residentialRoof) {
        const roofTints = [0x9c7966, 0x666e78, 0x8e6561, 0x8d8876, 0x6a7471];
        addResidentialRoof(roofBuffers, points, baseY + height - roofRise, baseY + height,
          roofTints[(detailSeed >>> 5) % roofTints.length], (detailSeed & 1) === 0);
      }
      if (options.drivewayMaterial && (residentialRoof || (family === 4 || family === 3) && height < 22 && width * depth > 400 && detailSeed % 5 === 0)) {
        let nearest: typeof drivableRoads[number] | undefined;
        let nearestX = 0, nearestZ = 0, nearestDistance = 38 * 38;
        for (const road of drivableRoads) {
          const vx = road.x2 - road.x1, vz = road.z2 - road.z1;
          const t = THREE.MathUtils.clamp(((box.x - road.x1) * vx + (box.z - road.z1) * vz) / (vx * vx + vz * vz), 0, 1);
          const x = road.x1 + vx * t, z = road.z1 + vz * t;
          const distance = (box.x - x) ** 2 + (box.z - z) ** 2;
          if (distance < nearestDistance) { nearest = road; nearestX = x; nearestZ = z; nearestDistance = distance; }
        }
        if (nearest) {
          let edgeX = 0, edgeZ = 0, edgeDistance = Infinity;
          for (let index = 0; index < points.length; index += 1) {
            const next = points[(index + 1) % points.length];
            const x = (points[index][0] + next[0]) / 2, z = (points[index][1] + next[1]) / 2;
            const distance = (x - nearestX) ** 2 + (z - nearestZ) ** 2;
            if (distance < edgeDistance) { edgeX = x; edgeZ = z; edgeDistance = distance; }
          }
          const distance = Math.sqrt(edgeDistance);
          const gap = distance - nearest.width / 2;
          if (gap >= 2 && gap <= 28) {
            const dx = (nearestX - edgeX) / distance, dz = (nearestZ - edgeZ) / distance;
            const sideX = -dz * (family === 0 ? 1.45 : 4.5), sideZ = dx * (family === 0 ? 1.45 : 4.5);
            const endX = edgeX + dx * gap, endZ = edgeZ + dz * gap;
            const y0 = options.heightAt(edgeX, edgeZ) + 0.14, y1 = options.heightAt(endX, endZ) + 0.14;
            addRoadSurface(drivewayBuffers,
              [edgeX + sideX, y0, edgeZ + sideZ], [edgeX - sideX, y0, edgeZ - sideZ],
              [endX - sideX, y1, endZ - sideZ], [endX + sideX, y1, endZ + sideZ]);
          }
        }
      }
      if (buildDerivedLods) {
        addMassing(midMasses, box, height, 360);
        addMassing(farMasses, box, height, 1000);
      }
      if (collectCollisionData) obstacleBounds.push({ x: box.x, z: box.z, halfX: (box.maxX - box.minX) / 2, halfZ: (box.maxZ - box.minZ) / 2, height, baseY, polygon: points });
    }
    buildingBuffers.forEach((buffers, family) => {
      if (buffers.positions.length) {
        const buildingMesh = new THREE.Mesh(createGeometry(buffers), options.buildingMaterials[family]);
        buildingMesh.name = `osm-building-${family}`;
        chunkGroup.add(buildingMesh);
      }
    });
    if (roofBuffers.positions.length && options.roofMaterial) {
      const mesh = new THREE.Mesh(createGeometry(roofBuffers), options.roofMaterial);
      mesh.name = 'osm-residential-roofs';
      chunkGroup.add(mesh);
    }
    if (drivewayBuffers.positions.length && options.drivewayMaterial) {
      const mesh = new THREE.Mesh(createGeometry(drivewayBuffers), options.drivewayMaterial);
      mesh.name = 'osm-driveways-and-parking';
      chunkGroup.add(mesh);
    }
    targetBuffers?.forEach((buffers, family) => {
      if (!buffers.positions.length) return;
      const mesh = new THREE.Mesh(createGeometry(buffers), options.buildingMaterials[family]);
      mesh.name = 'osm-monster-damage-target';
      mesh.visible = !monsterDamageActive;
      monsterTargetMeshes.add(mesh);
      chunkGroup.add(mesh);
    });

    const waterBuffers: GeometryBuffers = { positions: [], normals: [] };
    const shorelineBuffers: GeometryBuffers = { positions: [], normals: [] };
    for (const water of chunk.w) {
      const points = flatPolygon(water);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 4)) continue;
      const surfaceY = options.heightAt(box.x, box.z) + 0.16;
      addSurfacePolygon(waterBuffers, points, surfaceY);
      if (options.shorelineMaterial && points.length <= 100 && (box.maxX - box.minX) * (box.maxZ - box.minZ) > 30_000) {
        // A narrow inner bank follows the mapped lake polygon. It adds no
        // terrain elevation or new collision boundary.
        for (let index = 0; index < points.length; index += 1) {
          const a = points[index], b = points[(index + 1) % points.length];
          const ax = a[0] + (box.x - a[0]) * 0.015, az = a[1] + (box.z - a[1]) * 0.015;
          const bx = b[0] + (box.x - b[0]) * 0.015, bz = b[1] + (box.z - b[1]) * 0.015;
          addRoadSurface(shorelineBuffers,
            [a[0], surfaceY + 0.025, a[1]], [ax, surfaceY + 0.025, az],
            [bx, surfaceY + 0.025, bz], [b[0], surfaceY + 0.025, b[1]]);
        }
      }
      if (collectCollisionData) waterBounds.push({ ...box, surfaceY, polygon: points });
    }
    if (waterBuffers.positions.length) {
      const waterMesh = new THREE.Mesh(createGeometry(waterBuffers), options.waterMaterial);
      waterMesh.name = 'osm-water';
      chunkGroup.add(waterMesh);
    }
    if (shorelineBuffers.positions.length && options.shorelineMaterial) {
      const mesh = new THREE.Mesh(createGeometry(shorelineBuffers), options.shorelineMaterial);
      mesh.name = 'osm-mapped-shoreline';
      chunkGroup.add(mesh);
    }

    const landBuffers = options.landMaterials.map((): GeometryBuffers => ({ positions: [], normals: [] }));
    for (const land of chunk.p) {
      const family = land[0];
      const points = flatPolygon(land, 1);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 2)) continue;
      addSurfacePolygon(landBuffers[family] ?? landBuffers[0], points, (x, z) => options.heightAt(x, z) + 0.045 + family * 0.004);
    }
    landBuffers.forEach((buffers, family) => {
      if (buffers.positions.length) {
        const landMesh = new THREE.Mesh(createGeometry(buffers), options.landMaterials[family]);
        landMesh.name = `osm-land-${family}`;
        chunkGroup.add(landMesh);
      }
    });

    if (options.treeTrunkMaterial && options.treeCrownMaterial) {
      const trunks: GeometryBuffers = { positions: [], normals: [] };
      const crowns: GeometryBuffers = { positions: [], normals: [] };
      let treeCount = 0;
      const insideChunk = (x: number, z: number) =>
        x >= chunk.x * cityData.chunkSize && x < (chunk.x + 1) * cityData.chunkSize &&
        z >= chunk.z * cityData.chunkSize && z < (chunk.z + 1) * cityData.chunkSize;
      for (const land of chunk.p) {
        const family = land[0];
        if (family !== 0 && family !== 1 && family !== 3) continue;
        const polygon = flatPolygon(land, 1);
        const box = bounds(polygon);
        const step = family === 3 ? 110 : family === 1 ? 58 : 66;
        let inLand = 0;
        for (let gx = Math.floor(Math.max(box.minX, chunk.x * cityData.chunkSize) / step) * step;
          gx <= Math.min(box.maxX, (chunk.x + 1) * cityData.chunkSize) && treeCount < 72 && inLand < 18; gx += step) {
          for (let gz = Math.floor(Math.max(box.minZ, chunk.z * cityData.chunkSize) / step) * step;
            gz <= Math.min(box.maxZ, (chunk.z + 1) * cityData.chunkSize) && treeCount < 72 && inLand < 18; gz += step) {
            const seed = detailHash(gx, gz);
            if (family === 3 ? seed % 5 !== 0 : seed % 3 === 0) continue;
            const x = gx + ((seed >>> 7) % 17) - 8, z = gz + ((seed >>> 13) % 17) - 8;
            if (!insideChunk(x, z) || !pointInPolygon(x, z, polygon) || options.isExcluded(x, z, 10)) continue;
            if (buildingBoxes.some(building => x > building.minX - 8 && x < building.maxX + 8 && z > building.minZ - 8 && z < building.maxZ + 8)) continue;
            if (sceneryRoads.some(road => {
              const vx = road.x2 - road.x1, vz = road.z2 - road.z1;
              if (x < Math.min(road.x1, road.x2) - road.width || x > Math.max(road.x1, road.x2) + road.width ||
                  z < Math.min(road.z1, road.z2) - road.width || z > Math.max(road.z1, road.z2) + road.width) return false;
              const t = THREE.MathUtils.clamp(((x - road.x1) * vx + (z - road.z1) * vz) / (vx * vx + vz * vz), 0, 1);
              return Math.hypot(x - road.x1 - vx * t, z - road.z1 - vz * t) < road.width / 2 + 4;
            })) continue;
            const size = 7 + (seed % 5);
            addTree(trunks, crowns, x, options.heightAt(x, z) + 0.05, z, size);
            treeCount += 1;
            inLand += 1;
          }
        }
      }
      if (trunks.positions.length) {
        const mesh = new THREE.Mesh(createGeometry(trunks), options.treeTrunkMaterial);
        mesh.name = 'osm-mapped-tree-trunks';
        chunkGroup.add(mesh);
      }
      if (crowns.positions.length) {
        const mesh = new THREE.Mesh(createGeometry(crowns), options.treeCrownMaterial);
        mesh.name = 'osm-mapped-tree-crowns';
        chunkGroup.add(mesh);
      }
    }

    if (buildDerivedLods && midRoadBuffers.positions.length) midGroup.add(new THREE.Mesh(createGeometry(midRoadBuffers), options.roadMaterial));
    if (buildDerivedLods && farRoadBuffers.positions.length) farGroup.add(new THREE.Mesh(createGeometry(farRoadBuffers), options.roadMaterial));
    const addMassesToGroup = (group: THREE.Group, masses: ReadonlyMap<string, BuildingMassing>, material: THREE.Material, heightScale: number, heightBias: number): void => {
      const buffers: GeometryBuffers = { positions: [], normals: [] };
      for (const mass of masses.values()) {
        const centerX = (mass.minX + mass.maxX) / 2;
        const centerZ = (mass.minZ + mass.maxZ) / 2;
        const padding = masses === farMasses ? 16 : 7;
        const footprint: Array<[number, number]> = [
          [mass.minX - padding, mass.minZ - padding], [mass.maxX + padding, mass.minZ - padding],
          [mass.maxX + padding, mass.maxZ + padding], [mass.minX - padding, mass.maxZ + padding],
        ];
        const height = THREE.MathUtils.clamp(mass.maxHeight * heightScale + heightBias, 10, 165);
        addBuilding(buffers, footprint, options.heightAt(centerX, centerZ) + 0.09, height);
      }
      if (buffers.positions.length) group.add(new THREE.Mesh(createGeometry(buffers), material));
    };
    if (buildDerivedLods) addMassesToGroup(midGroup, midMasses, options.buildingMaterials[2], 0.72, 7);
    if (buildDerivedLods) addMassesToGroup(farGroup, farMasses, options.buildingMaterials[1], 0.5, 9);
    if (buildDerivedLods && waterBuffers.positions.length) {
      const farWater = new THREE.Mesh(createGeometry(waterBuffers), options.waterMaterial);
      farGroup.add(farWater);
    }

    if (chunkGroup.children.length) {
      scene.add(chunkGroup);
      groups.push(chunkGroup);
      if (options.streamRadius) {
        const centerX = (chunk.x + 0.5) * cityData.chunkSize;
        const centerZ = (chunk.z + 0.5) * cityData.chunkSize;
        chunkGroup.visible = false;
        if (midGroup.children.length) {
          midGroup.visible = false;
          scene.add(midGroup);
        }
        if (farGroup.children.length) {
          farGroup.visible = false;
          scene.add(farGroup);
        }
        streamedChunkGroups.push({
          detail: chunkGroup,
          mid: midGroup.children.length ? midGroup : undefined,
          far: farGroup.children.length ? farGroup : undefined,
          x: centerX,
          z: centerZ,
          detailRadius: options.streamRadius,
          midRadius: options.midRadius ?? 20_000,
          farRadius: options.farRadius ?? 35_000,
        });
      }
    }
  }
  return { roadSegments, obstacleBounds, waterBounds, groups };
}

export function disposeOsmGroups(groups: ReadonlyArray<THREE.Group>): void {
  const disposed = new Set(groups);
  // `streamedChunkGroups` is module-scoped for the legacy static streamer.
  // Remove evicted groups from it too, otherwise city switches can retain
  // stale group references indefinitely even after scene removal.
  for (let index = streamedChunkGroups.length - 1; index >= 0; index -= 1) {
    const chunk = streamedChunkGroups[index];
    if (disposed.has(chunk.detail) || (chunk.mid && disposed.has(chunk.mid)) || (chunk.far && disposed.has(chunk.far))) {
      streamedChunkGroups.splice(index, 1);
    }
  }
  for (const group of groups) {
    group.removeFromParent();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) monsterTargetMeshes.delete(object);
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
    });
    group.clear();
  }
}
