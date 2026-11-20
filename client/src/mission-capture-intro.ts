import * as THREE from 'three';

import { captureMissionInstructions, territoryDefenseInstructions, captureThreeInstructions } from './mission-journey-content';

type CaptureTerritory = Readonly<{
  id?: string;
  displayName: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  center: Readonly<{ x: number; z: number }>;
}>;

/** Presentation-only lesson. Never moves the player or changes capture state. */
export class MissionCaptureIntroPath {
  get sweepMs():number {return this.sequence?11_500:this.defense?11_500:14_000;}
  get durationMs():number {return this.sequence?12_000:this.defense?12_000:15_000;}
  private readonly radius: number;
  private readonly sequenceFrames: {territory:CaptureTerritory;focus:THREE.Vector3;radius:number}[];
  private readonly focus: THREE.Vector3;
  private readonly streamingFocus: THREE.Vector3;

  constructor(territory: CaptureTerritory, _captureMs: number,
    heightAt: (x: number, z: number) => number, readonly defense?:{player:THREE.Group;invader:THREE.Group},readonly sequence?:{player:THREE.Group;territories:readonly CaptureTerritory[];instructions?:readonly string[];owners?:readonly Readonly<{territoryId:string;name:string}>[]}) {
    const { minX, maxX, minZ, maxZ } = territory.bounds;
    const { x, z } = territory.center;
    const ground = heightAt(x, z);
    // Fit the complete territory, not just its western edge, on every viewport.
    this.radius = Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2, 1_000);
    this.focus = new THREE.Vector3(x, ground + 450, z);
    this.streamingFocus = this.focus.clone();
    this.sequenceFrames=(sequence?.territories??[]).map(territory=>({territory,focus:new THREE.Vector3(territory.center.x,heightAt(territory.center.x,territory.center.z)+450,territory.center.z),
      radius:Math.hypot((territory.bounds.maxX-territory.bounds.minX)/2,(territory.bounds.maxZ-territory.bounds.minZ)/2,1000)}));
  }

  territoryAt(elapsed:number):CaptureTerritory|undefined{return this.sequenceFrames[Math.min(this.sequenceFrames.length-1,elapsed<6000?0:elapsed<8000?1:2)]?.territory;}

  text(elapsed: number): string {
    if(this.sequence){
      const territory=this.territoryAt(elapsed),owner=this.sequence.owners?.find(owner=>owner.territoryId===territory?.id);
      const ownership=owner&&territory&&this.showsTerritory(elapsed)?`${territory.displayName.toUpperCase()} · ${owner.name}\n`:'';
      return ownership+(this.sequence.instructions??captureThreeInstructions).join('\n');
    }
    if(this.defense)return territoryDefenseInstructions.join('\n');
    return captureMissionInstructions.join('\n');
  }

  showsTerritory(elapsed: number): boolean { return this.sequence?elapsed>=3000&&elapsed<10000:this.defense?elapsed>=3000&&elapsed<6000:elapsed >= 2_500 && elapsed < this.sweepMs + 500; }

  showsCaptureRow(elapsed: number): boolean { return !this.sequence && !this.defense && elapsed >= 3_000 && elapsed < this.durationMs; }

  demonstrationPercent(elapsed: number): number | undefined {
    if (!this.showsCaptureRow(elapsed)) return undefined;
    return Math.max(45, Math.round(THREE.MathUtils.clamp((elapsed - 11_000) / 3_000, 0, 1) * 100));
  }

  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, aspect = 16 / 9): void {
    if(this.sequence){
      if(elapsed<3000){position.copy(chasePosition);target.copy(this.sequence.player.position);this.streamingFocus.copy(this.sequence.player.position);return;}
      const frame=this.sequenceFrames[Math.min(this.sequenceFrames.length-1,elapsed<6000?0:elapsed<8000?1:2)]!;
      const halfFov=Math.atan(Math.tan(THREE.MathUtils.degToRad(29))*Math.min(1,Math.max(.5,aspect)));
      const distance=frame.radius/Math.sin(halfFov)*1.28;
      this.shotSequence(position,target,frame.focus,distance);
      const blend=THREE.MathUtils.smoothstep(elapsed,10000,12000);position.lerp(chasePosition,blend);target.lerp(chaseTarget,blend);this.streamingFocus.copy(target);return;
    }
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
    if(this.defense||this.sequence)return 0;
    if (elapsed >= 2_000 && elapsed < 3_000) return 1 - Math.abs(elapsed - 2_500) / 500;
    if (elapsed >= this.sweepMs) return 1 - Math.abs(elapsed - this.sweepMs - 500) / 500;
    return 0;
  }

  private shotSequence(position:THREE.Vector3,target:THREE.Vector3,focus:THREE.Vector3,distance:number):void{
    position.set(focus.x-distance*.12,focus.y+distance*.94,focus.z+distance*.32);target.copy(focus);
  }

  streamingPosition(): THREE.Vector3 { return this.streamingFocus; }
}
