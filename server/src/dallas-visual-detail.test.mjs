import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { addOsmCityData, disposeOsmGroups } from '../../client/src/osm-city.ts';

const chunk = JSON.parse(readFileSync(new URL('../../client/public/data/dallas/near/2_-5.json', import.meta.url), 'utf8'));

test('mapped near detail stays inside building collision heights, clear of roads, and disposes on exit', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, vertexColors: true });
  const result = addOsmCityData(scene, { v: 3, chunkSize: 2000, chunks: [chunk] }, {
    roadMaterial: material, buildingMaterials: Array.from({ length: 5 }, () => material),
    waterMaterial: material, landMaterials: Array.from({ length: 8 }, () => material),
    roofMaterial: material, drivewayMaterial: material, bridgeTrimMaterial: material,
    shorelineMaterial: material, treeTrunkMaterial: material, treeCrownMaterial: material,
    isExcluded: () => false, heightAt: () => 150,
  });
  const group = result.groups[0];
  const roof = group.children.find(child => child.name === 'osm-residential-roofs');
  const trees = group.children.find(child => child.name === 'osm-mapped-tree-trunks');
  const drives = group.children.find(child => child.name === 'osm-driveways-and-parking');
  assert.ok(roof && trees && drives, 'residential, landscape, and driveway detail all render in the mapped chunk');
  const positions = roof.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 250))) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    assert.ok(result.obstacleBounds.some(obstacle =>
      x >= obstacle.x - obstacle.halfX - 0.01 && x <= obstacle.x + obstacle.halfX + 0.01 &&
      z >= obstacle.z - obstacle.halfZ - 0.01 && z <= obstacle.z + obstacle.halfZ + 0.01 &&
      y <= obstacle.baseY + obstacle.height + 0.01), `roof vertex ${i} remains in mapped collision envelope`);
  }
  const trunkPositions = trees.geometry.getAttribute('position');
  for (let i = 0; i < trunkPositions.count; i += 24) {
    const x = trunkPositions.getX(i), z = trunkPositions.getZ(i);
    assert.ok(result.roadSegments.every(road => {
      const dx = road.x2 - road.x1, dz = road.z2 - road.z1;
      const t = Math.max(0, Math.min(1, ((x - road.x1) * dx + (z - road.z1) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - road.x1 - dx * t, z - road.z1 - dz * t) >= road.width / 2 + 3.5;
    }), `tree ${i} clears mapped roads`);
  }
  let disposed = 0;
  for (const child of group.children) if (child instanceof THREE.Mesh || child instanceof THREE.Points) child.geometry.addEventListener('dispose', () => disposed++);
  const geometryCount = group.children.filter(child => child instanceof THREE.Mesh || child instanceof THREE.Points).length;
  disposeOsmGroups(result.groups);
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, geometryCount);
  material.dispose();
});
