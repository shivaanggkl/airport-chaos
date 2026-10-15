import * as THREE from 'three';

export const MISSION_ONE_INTRO_SWEEP_MS = 10_000;
export const MISSION_ONE_INTRO_DURATION_MS = 11_000;

type GatePosition = Readonly<{ x: number; z: number; altitude: number }>;

/** Camera-only preview of the real Mission 1 course. The aircraft never moves. */
export class MissionOneIntroPath {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly point = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();

  constructor(spawn: THREE.Vector3, gates: readonly GatePosition[], heightAt: (x: number, z: number) => number) {
    this.curve = new THREE.CatmullRomCurve3([
      spawn.clone(),
      ...gates.map(gate => new THREE.Vector3(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z)),
    ], false, 'centripetal');
  }

  sample(elapsedMs: number, position: THREE.Vector3, target: THREE.Vector3): void {
    const progress = THREE.MathUtils.clamp(elapsedMs / MISSION_ONE_INTRO_SWEEP_MS, 0, 1);
    this.curve.getPointAt(progress, this.point);
    this.curve.getTangentAt(Math.min(progress, .999), this.tangent);
    position.copy(this.point).addScaledVector(this.tangent, -650);
    position.y += 240;
    target.copy(this.point).addScaledVector(this.tangent, 1_350);
  }
}
