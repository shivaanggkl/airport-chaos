import * as THREE from 'three';

import {createTerrainHeightSampler} from '../../shared/milwaukee-terrain.mjs';
export {createTerrainHeightSampler};
export type {TerrainAirportZone,TerrainHeightSampler} from '../../shared/milwaukee-terrain.mjs';
import type {TerrainHeightSampler} from '../../shared/milwaukee-terrain.mjs';

const TERRAIN_HALF_SIZE = 6_000;
const TERRAIN_SEGMENTS = 160;

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
