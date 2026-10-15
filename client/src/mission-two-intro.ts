import * as THREE from 'three';

export const MISSION_TWO_INTRO_SWEEP_MS = 5_500;
export const MISSION_TWO_INTRO_DURATION_MS = 6_500;

type GatePosition = Readonly<{ x: number; z: number; altitude: number }>;

/** A camera-only pass over each real Lake Racer gate; the aircraft stays at its spawn. */
export class MissionTwoIntroPath {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly point = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();

  constructor(spawn: THREE.Vector3, gates: readonly GatePosition[], heightAt: (x: number, z: number) => number) {
    this.curve = new THREE.CatmullRomCurve3([
      spawn.clone(),
      ...gates.map(gate => new THREE.Vector3(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z)),
    ], false, 'centripetal');
  }

  sample(elapsedMs: number, position: THREE.Vector3, target: THREE.Vector3): void {
    // getPoint traverses one curve segment per gate, so the camera visits all ten.
    const progress = THREE.MathUtils.clamp(elapsedMs / MISSION_TWO_INTRO_SWEEP_MS, 0, 1);
    this.curve.getPoint(progress, this.point);
    this.curve.getPoint(Math.min(1, progress + .004), this.ahead);
    if (progress >= .996) this.curve.getPoint(progress - .004, this.ahead);
    this.ahead.sub(this.point);
    if (progress >= .996) this.ahead.negate();
    this.ahead.normalize();
    position.copy(this.point).addScaledVector(this.ahead, -650);
    position.y += 240;
    target.copy(this.point).addScaledVector(this.ahead, 1_350);
  }
}
