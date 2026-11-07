import * as THREE from 'three';

/** Render-only Golden Gates framing. Gameplay/network transforms are restored in the same frame. */
export class MissionOneAircraftPreview {
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly offset = new THREE.Vector3();
  private readonly relativeRotation = new THREE.Quaternion();
  private readonly chaseInverse = new THREE.Quaternion();
  private readonly look = new THREE.Matrix4();
  private aircraft: THREE.Object3D | undefined;

  begin(aircraft: THREE.Object3D, camera: THREE.PerspectiveCamera,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, chaseFov: number): void {
    this.aircraft = aircraft;
    this.position.copy(aircraft.position);
    this.rotation.copy(aircraft.quaternion);
    this.look.lookAt(chasePosition, chaseTarget, camera.up);
    this.chaseInverse.setFromRotationMatrix(this.look).invert();
    this.offset.copy(this.position).sub(chasePosition).applyQuaternion(this.chaseInverse);
    // A wider course-preview lens must not make the aircraft shrink.
    this.offset.z *= Math.tan(THREE.MathUtils.degToRad(chaseFov / 2)) /
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    this.relativeRotation.copy(this.chaseInverse).multiply(this.rotation);
    aircraft.position.copy(this.offset).applyQuaternion(camera.quaternion).add(camera.position);
    aircraft.quaternion.copy(camera.quaternion).multiply(this.relativeRotation);
    aircraft.updateMatrixWorld(true);
  }

  end(): void {
    if (!this.aircraft) return;
    this.aircraft.position.copy(this.position);
    this.aircraft.quaternion.copy(this.rotation);
    this.aircraft.updateMatrixWorld(true);
    this.aircraft = undefined;
  }
}
