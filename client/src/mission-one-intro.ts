import * as THREE from 'three';

const RUNWAY_SHOT_MS = 1_500;
const RUNWAY_DEPARTURE_MS = 2_000;
const GATE_SWEEP_MS = 10_000;
export const MISSION_ONE_INTRO_SWEEP_MS = RUNWAY_SHOT_MS + RUNWAY_DEPARTURE_MS + GATE_SWEEP_MS;
export const MISSION_ONE_INTRO_DURATION_MS = MISSION_ONE_INTRO_SWEEP_MS + 1_000;

type GatePosition = Readonly<{ x: number; z: number; altitude: number }>;

/** Camera-only preview from the runway through the real Mission 1 course. The aircraft never moves. */
export class MissionOneIntroPath {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly point = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly coursePosition = new THREE.Vector3();
  private readonly courseTarget = new THREE.Vector3();

  constructor(spawn: THREE.Vector3, gates: readonly GatePosition[], heightAt: (x: number, z: number) => number) {
    this.curve = new THREE.CatmullRomCurve3([
      spawn.clone(),
      ...gates.map(gate => new THREE.Vector3(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z)),
    ], false, 'centripetal');
  }

  sample(elapsedMs: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3): void {
    if (elapsedMs < RUNWAY_SHOT_MS) {
      position.copy(chasePosition);
      target.copy(chaseTarget);
      return;
    }
    const gateElapsed = Math.max(0, elapsedMs - RUNWAY_SHOT_MS - RUNWAY_DEPARTURE_MS);
    const progress = THREE.MathUtils.clamp(gateElapsed / GATE_SWEEP_MS, 0, 1);
    this.curve.getPointAt(progress, this.point);
    this.curve.getTangentAt(Math.min(progress, .999), this.tangent);
    this.coursePosition.copy(this.point).addScaledVector(this.tangent, -650);
    this.coursePosition.y += 240;
    this.courseTarget.copy(this.point).addScaledVector(this.tangent, 1_350);
    if (elapsedMs < RUNWAY_SHOT_MS + RUNWAY_DEPARTURE_MS) {
      const departure = THREE.MathUtils.smoothstep(elapsedMs - RUNWAY_SHOT_MS, 0, RUNWAY_DEPARTURE_MS);
      position.lerpVectors(chasePosition, this.coursePosition, departure);
      target.lerpVectors(chaseTarget, this.courseTarget, departure);
    } else {
      position.copy(this.coursePosition);
      target.copy(this.courseTarget);
    }
  }

  fov(elapsedMs: number, chaseFov: number): number {
    const departure = THREE.MathUtils.smoothstep(elapsedMs, RUNWAY_SHOT_MS, RUNWAY_SHOT_MS + RUNWAY_DEPARTURE_MS);
    return THREE.MathUtils.lerp(chaseFov, 63, departure);
  }
}
