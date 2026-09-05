import * as THREE from 'three';
import cityDataJson from './data/city1-osm.json';

type CompactChunk = {
  x: number;
  z: number;
  r: number[];
  b: number[][];
  w: number[][];
  p: number[][];
};

type CompactCityData = {
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

const cityData = cityDataJson as unknown as CompactCityData;
const roadWidths = [9, 11, 14, 18, 30] as const;
const roadColors = [0x4d5051, 0x484b4d, 0x414548, 0x393e42, 0x30363a] as const;
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

export function addOsmCity(
  scene: THREE.Scene,
  options: {
    roadMaterial: THREE.Material;
    buildingMaterials: ReadonlyArray<THREE.Material>;
    waterMaterial: THREE.Material;
    landMaterials: ReadonlyArray<THREE.Material>;
    isExcluded: (x: number, z: number, padding: number) => boolean;
    heightAt: (x: number, z: number) => number;
  },
): { roadSegments: ImportedRoadSegment[]; obstacleBounds: ImportedObstacle[]; waterBounds: ImportedWater[] } {
  const roadSegments: ImportedRoadSegment[] = [];
  const obstacleBounds: ImportedObstacle[] = [];
  const waterBounds: ImportedWater[] = [];

  for (const chunk of cityData.chunks) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `osm-${chunk.x}-${chunk.z}`;

    const roadBuffers: GeometryBuffers = { positions: [], normals: [], colors: [] };
    for (let index = 0; index < chunk.r.length; index += 6) {
      const classification = chunk.r[index];
      const bridge = chunk.r[index + 1] === 1;
      const x1 = chunk.r[index + 2];
      const z1 = chunk.r[index + 3];
      const x2 = chunk.r[index + 4];
      const z2 = chunk.r[index + 5];
      const width = roadWidths[classification] ?? roadWidths[0];
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
      pushTriangle(roadBuffers, a, d, b, [0, 1, 0]);
      pushTriangle(roadBuffers, b, d, c, [0, 1, 0]);
      color.set(roadColors[classification] ?? roadColors[0]);
      for (let vertex = 0; vertex < 6; vertex += 1) roadBuffers.colors!.push(color.r, color.g, color.b);
      roadSegments.push({ x1, z1, x2, z2, width });
    }
    if (roadBuffers.positions.length) chunkGroup.add(new THREE.Mesh(createGeometry(roadBuffers), options.roadMaterial));

    const buildingBuffers = options.buildingMaterials.map((): GeometryBuffers => ({ positions: [], normals: [], uvs: [] }));
    for (const building of chunk.b) {
      const height = building[0];
      const family = building[1];
      const points = flatPolygon(building, 2);
      const box = bounds(points);
      if (options.isExcluded(box.x, box.z, Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 + 8)) continue;
      const baseY = options.heightAt(box.x, box.z) + 0.08;
      addBuilding(buildingBuffers[family] ?? buildingBuffers[2], points, baseY, height);
      obstacleBounds.push({ x: box.x, z: box.z, halfX: (box.maxX - box.minX) / 2, halfZ: (box.maxZ - box.minZ) / 2, height, baseY, polygon: points });
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
      waterBounds.push({ ...box, surfaceY, polygon: points });
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

    if (chunkGroup.children.length) scene.add(chunkGroup);
  }
  return { roadSegments, obstacleBounds, waterBounds };
}
