import * as THREE from 'three';

type CaptureTerritory = Readonly<{
  displayName: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  center: Readonly<{ x: number; z: number }>;
}>;

/** Presentation-only lesson. Never moves the player or changes capture state. */
export class MissionCaptureIntroPath {
  readonly sweepMs = 14_000;
  readonly durationMs = 15_000;
  private readonly radius: number;
  private readonly focus: THREE.Vector3;
  private readonly streamingFocus: THREE.Vector3;

  constructor(territory: CaptureTerritory, private readonly captureMs: number,
    heightAt: (x: number, z: number) => number) {
    const { minX, maxX, minZ, maxZ } = territory.bounds;
    const { x, z } = territory.center;
    const ground = heightAt(x, z);
    // Fit the complete territory, not just its western edge, on every viewport.
    this.radius = Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2, 1_000);
    this.focus = new THREE.Vector3(x, ground + 450, z);
    this.streamingFocus = this.focus.clone();
  }

  text(elapsed: number): string {
    if (elapsed < 3_000) return 'CAPTURE 1 TERRITORY';
    if (elapsed < 7_000) return 'Fly inside the marked Las Colinas boundary.';
    if (elapsed < 11_000) return `Stay inside for ${this.captureMs / 1_000} seconds to capture it.`;
    if (elapsed < 14_000) return 'Progress fills as you stay inside.';
    return 'Reach 100% to capture the territory.';
  }

  showsTerritory(elapsed: number): boolean { return elapsed >= 2_500 && elapsed < this.sweepMs + 500; }

  showsCaptureRow(elapsed: number): boolean { return elapsed >= 7_000 && elapsed < this.durationMs; }

  demonstrationPercent(elapsed: number): number | undefined {
    if (!this.showsCaptureRow(elapsed)) return undefined;
    return Math.round(THREE.MathUtils.clamp((elapsed - 11_000) / 3_000, 0, 1) * 100);
  }

  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, aspect = 16 / 9): void {
    if (!this.showsTerritory(elapsed)) {
      position.copy(chasePosition); target.copy(chaseTarget); return;
    }
    const progress = THREE.MathUtils.smoothstep(elapsed, 2_500, this.sweepMs);
    const verticalHalfFov = THREE.MathUtils.degToRad(58 / 2);
    const limitingHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.min(1, Math.max(0.5, aspect)));
    const distance = this.radius / Math.sin(limitingHalfFov) * 1.28;
    const angle = THREE.MathUtils.lerp(-0.25, 0.15, progress);
    position.set(this.focus.x + Math.sin(angle) * distance * 0.36,
      this.focus.y + distance * Math.sqrt(1 - 0.36 ** 2),
      this.focus.z + Math.cos(angle) * distance * 0.36);
    target.copy(this.focus);
  }

  fov(elapsed: number, chaseFov: number): number { return this.showsTerritory(elapsed) ? 58 : chaseFov; }

  wipe(elapsed: number): number {
    if (elapsed >= 2_000 && elapsed < 3_000) return 1 - Math.abs(elapsed - 2_500) / 500;
    if (elapsed >= this.sweepMs) return 1 - Math.abs(elapsed - this.sweepMs - 500) / 500;
    return 0;
  }

  streamingPosition(): THREE.Vector3 { return this.streamingFocus; }
}
