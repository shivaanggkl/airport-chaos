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

export type CompactCityData = {
  v: number;
  source: string;
  attribution: string;
  license: string;
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
const roadWidths = [9, 11, 14, 18, 30, 4] as const;
const roadColors = [0x41484c, 0x3c4347, 0x363d42, 0x30383d, 0x293238, 0x665f55] as const;
const color = new THREE.Color();

function pushTriangle(buffers: GeometryBuffers, a: readonly number[], b: readonly number[], c: readonly number[], normal: readonly number[], uv?: readonly number[]): void {
  buffers.positions.push(...a, ...b, ...c);
  buffers.normals.push(...normal, ...normal, ...normal);
  if (buffers.uvs) buffers.uvs.push(...(uv ?? [0, 0, 1, 0, 1, 1]));
}

function createGeometry(buffers: GeometryBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  if (buffers.colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  if (buffers.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
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

function addBuilding(buffers: GeometryBuffers, points: ReadonlyArray<readonly [number, number]>, baseY: number, height: number): void {
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const triangle of triangles) {
    const a = points[triangle[0]];
    const b = points[triangle[1]];
    const c = points[triangle[2]];
    pushTriangle(buffers, [a[0], baseY + height, a[1]], [c[0], baseY + height, c[1]], [b[0], baseY + height, b[1]], [0, 1, 0], [0.002, 0.002, 0.002, 0.002, 0.002, 0.002]);
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
    pushTriangle(buffers, [x1, baseY, z1], [x2, baseY, z2], [x2, baseY + height, z2], normal, [0, 0, u, 0, u, v]);
    pushTriangle(buffers, [x1, baseY, z1], [x2, baseY + height, z2], [x1, baseY + height, z1], normal, [0, 0, u, v, 0, v]);
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
    buildingMaterials: ReadonlyArray<THREE.Material>;
    waterMaterial: THREE.Material;
    landMaterials: ReadonlyArray<THREE.Material>;
    isExcluded: (x: number, z: number, padding: number) => boolean;
    heightAt: (x: number, z: number) => number;
    // Dallas already streams separately preprocessed NEAR/MID/FAR chunks.
    // Callers that only render one of those files must not allocate the
    // legacy derived LODs or collision return arrays just to discard them.
    collectCollisionData?: boolean;
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
    const highwayAccentBuffers: GeometryBuffers = { positions: [], normals: [] };
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
      const a = [x1 + offsetX, startY, z1 + offsetZ] as const;
      const b = [x1 - offsetX, startY, z1 - offsetZ] as const;
      const c = [x2 - offsetX, endY, z2 - offsetZ] as const;
      const d = [x2 + offsetX, endY, z2 + offsetZ] as const;
      addRoadSurface(roadBuffers, a, b, c, d);
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
    if (roadBuffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(roadBuffers), options.roadMaterial));
    if (highwayAccentBuffers.positions.length && options.highwayAccentMaterial) chunkGroup.add(new THREE.Mesh(createGeometry(highwayAccentBuffers), options.highwayAccentMaterial));

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
      if (buffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(buffers), options.aerowayMaterials![kind]));
    });

    const buildingBuffers = options.buildingMaterials.map((): GeometryBuffers => ({ positions: [], normals: [], uvs: [] }));
    const midMasses = new Map<string, BuildingMassing>();
    const farMasses = new Map<string, BuildingMassing>();
    for (const building of chunk.b) {
      const height = building[0];
      const family = building[1];
      // v2 adds a compact height-provenance code; v3 also fixes the building's sampled base elevation.
      const points = flatPolygon(building, cityData.v >= 3 ? 4 : cityData.v >= 2 ? 3 : 2);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 8)) continue;
      const baseY = (cityData.v >= 3 ? building[3] : options.heightAt(box.x, box.z)) + 0.08;
      addBuilding(buildingBuffers[family] ?? buildingBuffers[2], points, baseY, height);
      if (buildDerivedLods) {
        addMassing(midMasses, box, height, 360);
        addMassing(farMasses, box, height, 1000);
      }
      if (collectCollisionData) obstacleBounds.push({ x: box.x, z: box.z, halfX: (box.maxX - box.minX) / 2, halfZ: (box.maxZ - box.minZ) / 2, height, baseY, polygon: points });
    }
    buildingBuffers.forEach((buffers, family) => {
      if (buffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(buffers), options.buildingMaterials[family]));
    });

    const waterBuffers: GeometryBuffers = { positions: [], normals: [] };
    for (const water of chunk.w) {
      const points = flatPolygon(water);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 4)) continue;
      const surfaceY = options.heightAt(box.x, box.z) + 0.16;
      addSurfacePolygon(waterBuffers, points, surfaceY);
      if (collectCollisionData) waterBounds.push({ ...box, surfaceY, polygon: points });
    }
    if (waterBuffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(waterBuffers), options.waterMaterial));

    const landBuffers = options.landMaterials.map((): GeometryBuffers => ({ positions: [], normals: [] }));
    for (const land of chunk.p) {
      const family = land[0];
      const points = flatPolygon(land, 1);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 2)) continue;
      addSurfacePolygon(landBuffers[family] ?? landBuffers[0], points, (x, z) => options.heightAt(x, z) + 0.045 + family * 0.004);
    }
    landBuffers.forEach((buffers, family) => {
      if (buffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(buffers), options.landMaterials[family]));
    });

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
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    group.clear();
  }
}
