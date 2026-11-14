import * as THREE from 'three';

import { captureMissionInstructions } from './mission-journey-content';

type CaptureTerritory = Readonly<{
  displayName: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  center: Readonly<{ x: number; z: number }>;
}>;

/** Presentation-only lesson. Never moves the player or changes capture state. */
export class MissionCaptureIntroPath {
  get sweepMs():number {return this.defense?11_500:14_000;}
  get durationMs():number {return this.defense?12_000:15_000;}
  private readonly radius: number;
  private readonly focus: THREE.Vector3;
  private readonly streamingFocus: THREE.Vector3;

  constructor(territory: CaptureTerritory, _captureMs: number,
    heightAt: (x: number, z: number) => number, readonly defense?:{player:THREE.Group;invader:THREE.Group}) {
    const { minX, maxX, minZ, maxZ } = territory.bounds;
    const { x, z } = territory.center;
    const ground = heightAt(x, z);
    // Fit the complete territory, not just its western edge, on every viewport.
    this.radius = Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2, 1_000);
    this.focus = new THREE.Vector3(x, ground + 450, z);
    this.streamingFocus = this.focus.clone();
  }

  text(elapsed: number): string {
    if(this.defense)return elapsed<3000?'TERRITORY DEFENSE':elapsed<6000?'Take off and capture LAS COLINAS.':elapsed<9000?'Stay inside to capture the territory.':'Hold for 2 minutes. Defend against the invader!';
    if (elapsed < 3_000) return 'CAPTURE 1 TERRITORY';
    return captureMissionInstructions.join('\n');
  }

  showsTerritory(elapsed: number): boolean { return this.defense?elapsed>=3000&&elapsed<6000:elapsed >= 2_500 && elapsed < this.sweepMs + 500; }

  showsCaptureRow(elapsed: number): boolean { return !this.defense && elapsed >= 3_000 && elapsed < this.durationMs; }

  demonstrationPercent(elapsed: number): number | undefined {
    if (!this.showsCaptureRow(elapsed)) return undefined;
    return Math.max(45, Math.round(THREE.MathUtils.clamp((elapsed - 11_000) / 3_000, 0, 1) * 100));
  }

  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, aspect = 16 / 9): void {
    if(this.defense){
      if(elapsed<3000){
        target.copy(this.defense.player.position);position.copy(chasePosition);return;
      }
      if(elapsed>=6000){
        const invader=this.defense.invader;target.copy(invader.position);
        position.set(invader.position.x-800,invader.position.y+250,invader.position.z+1100);
        const blend=THREE.MathUtils.smoothstep(elapsed,9000,12000);
        position.lerp(chasePosition,blend);target.lerp(chaseTarget,blend);return;
      }
    }
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
    if(this.defense)return 0;
    if (elapsed >= 2_000 && elapsed < 3_000) return 1 - Math.abs(elapsed - 2_500) / 500;
    if (elapsed >= this.sweepMs) return 1 - Math.abs(elapsed - this.sweepMs - 500) / 500;
    return 0;
  }

  streamingPosition(): THREE.Vector3 { return this.streamingFocus; }
}
