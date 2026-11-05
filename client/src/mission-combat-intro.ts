import * as THREE from 'three';

export const MISSION_COMBAT_INTRO_SWEEP_MS = 8_000;
export const MISSION_COMBAT_INTRO_DURATION_MS = 9_000;

/** Shared staged-opponent reveal and player runway handoff. No gameplay entities move. */
export class CombatMissionIntroPath {
  private readonly offset = new THREE.Vector3();
  private readonly shotPosition = new THREE.Vector3();
  private readonly shotTarget = new THREE.Vector3();
  private readonly opponentRadius: number;
  private readonly opponentHeight:number;
  private readonly playerRadius: number;
  private readonly opponentOrigin: THREE.Vector3;
  private readonly departureDirection = new THREE.Vector3();
  constructor(readonly opponent: THREE.Group, private readonly player: THREE.Group, readonly missionNumber: 7 | 8 | 9 | 10 | 11 | 12 | 19 = 7) {
    this.opponentOrigin = opponent.position.clone();
    this.departureDirection.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, opponent.rotation.y);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(opponent).getSize(size);
    this.opponentHeight=size.y;
    this.opponentRadius = Math.max(18, size.x * 1.7, size.z * 1.5);
    new THREE.Box3().setFromObject(player).getSize(size);
    this.playerRadius = Math.max(14, size.x * 1.5, size.z * 1.3);
  }
  get sweepMs():number{return this.missionNumber===19?11000:MISSION_COMBAT_INTRO_SWEEP_MS;}
  get durationMs():number{return this.missionNumber===19?12000:MISSION_COMBAT_INTRO_DURATION_MS;}
  wipe(elapsed: number): number {
    if(this.missionNumber===19){if(elapsed<5500)return 0;if(elapsed<6000)return(elapsed-5500)/500;if(elapsed<6500)return 1-(elapsed-6000)/500;return elapsed<11000?0:elapsed<11500?(elapsed-11000)/500:(12000-elapsed)/500;}
    if (elapsed < 3_500) return 0;
    if (elapsed < 4_000) return (elapsed - 3_500) / 500;
    if (elapsed < 4_500) return 1 - (elapsed - 4_000) / 500;
    return elapsed < 8_000 ? 0 : elapsed < 8_500 ? (elapsed - 8_000) / 500 : (9_000 - elapsed) / 500;
  }
  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3): void {
    // M7 shows runway preparation; Later combat missions show a short, level airborne pass.
    // Only the temporary visual group moves, never a live opponent or the player.
    if (this.missionNumber !== 7 && this.missionNumber !== 19)
      this.opponent.position.copy(this.opponentOrigin).addScaledVector(this.departureDirection, Math.min(Math.max(0, elapsed), 4_000) * (this.missionNumber === 12 ? .6 : this.missionNumber === 9 ? .42 : .16));
    const boss=this.missionNumber===19,cut=boss?6000:4000;
    const enemyShot = elapsed < cut;
    const aircraft = enemyShot ? this.opponent : this.player;
    const t = THREE.MathUtils.smoothstep(elapsed, enemyShot ? 0 : cut+500, enemyShot ? cut-500 : this.sweepMs);
    const radius = enemyShot ? boss?this.opponentHeight*THREE.MathUtils.lerp(1.8,1.1,t):this.opponentRadius : this.playerRadius;
    const angle = enemyShot ? THREE.MathUtils.lerp(boss ? .65 : this.missionNumber === 12 ? -2.6 : this.missionNumber === 11 ? -2.8 : this.missionNumber === 9 ? .3 : this.missionNumber === 8 ? .7 : -2.2, boss ? -.45 : this.missionNumber === 12 ? -.9 : this.missionNumber === 11 ? -1.8 : this.missionNumber === 9 ? .9 : this.missionNumber === 8 ? 1.7 : -1.1, t) : THREE.MathUtils.lerp(1.7, 0, t);
    this.offset.set(Math.sin(angle) * radius, (boss&&enemyShot?this.opponentHeight*THREE.MathUtils.lerp(.25,.65,t):radius*.22), Math.cos(angle) * radius)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, aircraft.rotation.y);
    this.shotPosition.copy(aircraft.position).add(this.offset);
    this.shotTarget.copy(aircraft.position).addScaledVector(THREE.Object3D.DEFAULT_UP, boss&&enemyShot?this.opponentHeight*THREE.MathUtils.lerp(.5,.7,t):1);
    const handoff = enemyShot ? 0 : THREE.MathUtils.smoothstep(elapsed, this.sweepMs-1500, this.sweepMs);
    position.lerpVectors(this.shotPosition, chasePosition, handoff);
    target.lerpVectors(this.shotTarget, chaseTarget, handoff);
  }
  fov(elapsed: number, chaseFov: number): number {
    return THREE.MathUtils.lerp(48, chaseFov, THREE.MathUtils.smoothstep(elapsed, this.sweepMs-1500, this.sweepMs));
  }
  streamingPosition(elapsed: number): THREE.Vector3 {
    return elapsed < (this.missionNumber===19?6000:4000) ? this.opponent.position : this.player.position;
  }
}
