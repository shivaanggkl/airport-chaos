import * as THREE from 'three';

const projectileGeometry = new THREE.SphereGeometry(0.5, 12, 8);
export const projectileMaterial = new THREE.MeshPhongMaterial({
  color: 0xdc143c,
  emissive: 0x580818,
  shininess: 24,
  toneMapped: false,
});
const opponentProjectileMaterial = projectileMaterial.clone();
opponentProjectileMaterial.color.setHex(0xff8c00);

export function projectileMaterialForOpponent(opponent: boolean): THREE.MeshPhongMaterial {
  return opponent ? opponentProjectileMaterial : projectileMaterial;
}

export function createProjectileCore(opponent = false): THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial> {
  const core = new THREE.Mesh(projectileGeometry, projectileMaterialForOpponent(opponent));
  core.renderOrder = 3;
  return core;
}

export function projectileRoundDiameter(point: THREE.Vector3, camera: THREE.PerspectiveCamera, viewportHeight: number): number {
  const inverse = camera.matrixWorldInverse.elements;
  const depth = -(inverse[2]! * point.x + inverse[6]! * point.y + inverse[10]! * point.z + inverse[14]!);
  const focalPixels = Math.max(1, camera.projectionMatrix.elements[5]! * viewportHeight / 2);
  return Math.max(camera.near, depth) * 16 / focalPixels;
}

export function fitProjectileRound(mesh: THREE.Object3D, traveled: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
  mesh.scale.setScalar(Math.min(projectileRoundDiameter(mesh.position, camera, viewportHeight), Math.max(0, traveled * 2)));
}

export function projectileForwardStep(step: number, positionError: number, blend: number): number {
  return step + THREE.MathUtils.clamp(positionError * blend, -step * 0.15, step * 0.15);
}
