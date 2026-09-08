import * as THREE from 'three';

export type TerrainAirportZone = {
  x: number;
  z: number;
  heading: number;
  runwayLength: number;
  safetyHalfWidth: number;
};

export type TerrainHeightSampler = (x: number, z: number) => number;

const TERRAIN_HALF_SIZE = 6_000;
const TERRAIN_SEGMENTS = 160;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function gaussian(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number, height: number): number {
  const dx = (x - centerX) / radiusX;
  const dz = (z - centerZ) / radiusZ;
  return Math.exp(-(dx * dx + dz * dz) * 2.2) * height;
}

function rawTerrainHeight(x: number, z: number): number {
  // A compact, deterministic elevation field authored for City 1's fixed bounds.
  const rolling =
    Math.sin((x + z * 0.32) * 0.0011) * 8 +
    Math.cos((z - x * 0.24) * 0.00155) * 5;
  const countryside = gaussian(x, z, -3000, 3500, 2400, 2100, 34);
  const foothills = gaussian(x, z, -4100, -2600, 2200, 1900, 105);
  const mountainRidge =
    gaussian(x, z, -5100, -4700, 1800, 1050, 260) +
    gaussian(x, z, -2550, -5400, 1600, 820, 155);
  const lakeBasin = gaussian(x, z, -280, -3717, 720, 1120, 24);
  const coastShelf = gaussian(x, z, 4800, 2100, 1500, 1900, 13);
  return rolling + countryside + foothills + mountainRidge - lakeBasin - coastShelf;
}

function airportFlattening(x: number, z: number, airport: TerrainAirportZone): number {
  const offsetX = x - airport.x;
  const offsetZ = z - airport.z;
  const cosine = Math.cos(airport.heading);
  const sine = Math.sin(airport.heading);
  const localX = offsetX * cosine - offsetZ * sine;
  const localZ = offsetX * sine + offsetZ * cosine;
  const beyondX = Math.max(0, Math.abs(localX) - airport.safetyHalfWidth);
  const beyondZ = Math.max(0, Math.abs(localZ) - airport.runwayLength / 2 - 220);
  return 1 - smoothstep(0, 260, Math.hypot(beyondX, beyondZ));
}

export function createTerrainHeightSampler(airports: ReadonlyArray<TerrainAirportZone>): TerrainHeightSampler {
  return (x, z) => {
    const rawHeight = rawTerrainHeight(x, z);
    let flattening = 0;
    for (const airport of airports) flattening = Math.max(flattening, airportFlattening(x, z, airport));
    return rawHeight * (1 - flattening);
  };
}

export function createTerrainMesh(heightAt: TerrainHeightSampler, material: THREE.Material): THREE.Mesh {
  const verticesPerSide = TERRAIN_SEGMENTS + 1;
  const positions = new Float32Array(verticesPerSide * verticesPerSide * 3);
  const uvs = new Float32Array(verticesPerSide * verticesPerSide * 2);
  const indices: number[] = [];
  let vertex = 0;
  let uv = 0;
  for (let row = 0; row <= TERRAIN_SEGMENTS; row += 1) {
    const z = THREE.MathUtils.lerp(-TERRAIN_HALF_SIZE, TERRAIN_HALF_SIZE, row / TERRAIN_SEGMENTS);
    for (let column = 0; column <= TERRAIN_SEGMENTS; column += 1) {
      const x = THREE.MathUtils.lerp(-TERRAIN_HALF_SIZE, TERRAIN_HALF_SIZE, column / TERRAIN_SEGMENTS);
      positions[vertex] = x;
      positions[vertex + 1] = heightAt(x, z);
      positions[vertex + 2] = z;
      uvs[uv] = column / TERRAIN_SEGMENTS;
      uvs[uv + 1] = row / TERRAIN_SEGMENTS;
      vertex += 3;
      uv += 2;
    }
  }
  for (let row = 0; row < TERRAIN_SEGMENTS; row += 1) {
    for (let column = 0; column < TERRAIN_SEGMENTS; column += 1) {
      const a = row * verticesPerSide + column;
      const b = a + 1;
      const c = a + verticesPerSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -2;
  return mesh;
}

function createCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.48, 'rgba(230,244,255,0.4)');
  gradient.addColorStop(1, 'rgba(235,245,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function addCloudLayer(scene: THREE.Scene): void {
  const clouds = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: createCloudTexture(), transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false }),
    24,
  );
  const transform = new THREE.Object3D();
  for (let index = 0; index < 24; index += 1) {
    const x = -5500 + (index * 1789) % 11_000;
    const z = -5300 + (index * 997) % 10_600;
    const y = 820 + (index % 5) * 190;
    const sizeX = 760 + (index % 4) * 190;
    const sizeZ = 380 + (index % 3) * 150;
    transform.position.set(x, y, z);
    transform.rotation.set(-Math.PI / 2, (index % 7) * 0.31, 0);
    transform.scale.set(sizeX, sizeZ, 1);
    transform.updateMatrix();
    clouds.setMatrixAt(index, transform.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  clouds.renderOrder = 1;
  scene.add(clouds);
}
