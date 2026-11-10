import * as THREE from 'three';
import { CrashSequence } from './crash-sequence';
import { journeyDallas13, journeyDallas14 } from '../../shared/journey-mission.mjs';
import { BASE_PROJECTILE_SPEED } from '../../shared/protocol.mjs';

type Destruction = {
  playerId: string; killerId?: string; cause?: string;
  position?: { x: number; y: number; z: number };
};

/** Presentation only: both success and the owned target's destruction come from the server. */
export class AircraftVictory {
  readonly position = new THREE.Vector3();
  readonly shotOrigin = new THREE.Vector3();
  readonly impactPosition = new THREE.Vector3();
  readonly bulletPosition = new THREE.Vector3();
  readonly pilotMuzzlePosition = new THREE.Vector3();
  readonly enemyPosition = new THREE.Vector3();
  private readonly enemyVelocity = new THREE.Vector3();
  private shotTravelSeconds = 0;
  private pilotTravel = 0;
  readonly shotDirection = new THREE.Vector3();
  readonly enemyRotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly shots = new Map<string, { origin: THREE.Vector3; speed: number }>();
  private replayReady = false;
  private replayElapsed = 0;
  private replayDuration = 0;
  private replayStarted = false;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly impactCamera = new THREE.Vector3();
  private readonly cameraSide = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraSeparation = new THREE.Vector3();
  private cameraClearance = 80;
  private gameplayCamera: { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null = null;
  private launchHold = 0;
  private readonly followCameraRotation = new THREE.Quaternion();
  private sequence: CrashSequence | null = null;
  private resultConfirmed = false;
  private destructionConfirmed = false;
  private waiting = 0;
  private elapsed = 0;
  complete = false;

  constructor(readonly attemptId: string, readonly targetId: string, private readonly pilotId: string, readonly mission: {readonly enemyAircraft: 'trainer' | 'privateJet' | 'cargo' | 'fighter'; readonly enemyLivery: string; readonly fromGameplayCamera?: boolean} = journeyDallas13) {}

  get pending(): boolean { return this.resultConfirmed && !this.complete; }
  get hasCamera(): boolean { return this.replayStarted || this.sequence !== null; }
  get hasReplay(): boolean { return this.replayReady; }
  get replaying(): boolean { return this.replayStarted && this.replayElapsed < this.replayDuration; }

  setTargetRadius(radius: number): void {
    if (Number.isFinite(radius) && radius > 0) this.cameraClearance = Math.max(80, radius * 2.5);
  }

  beginFromGameplayCamera(camera: THREE.PerspectiveCamera): void {
    if (this.gameplayCamera || this.replayStarted || !this.replayReady) return;
    this.gameplayCamera = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
    this.launchHold = .25;
    this.replayDuration += this.launchHold;
  }

  recordProjectile(message: { projectileId: string; ownerId: string; position: {x:number;y:number;z:number}; speed: number }): void {
    this.recordShot(message.projectileId, message.ownerId, message.position, message.speed);
  }

  private recordShot(id: string, owner: string, origin: {x:number;y:number;z:number}, speed: number): boolean {
    if (this.complete || this.replayReady || owner !== this.pilotId || !id || ![origin.x,origin.y,origin.z,speed].every(Number.isFinite) || speed <= 0) return false;
    this.shots.set(id, {origin:new THREE.Vector3().copy(origin),speed});
    // Covers even Firehawk’s full-rate shots over the maximum ballistic lifetime.
    if (this.shots.size > 64) this.shots.delete(this.shots.keys().next().value!);
    return true;
  }

  recordFatalHit(message: {playerId:string;shooterId:string;health:number;impactId?:string;impactPosition?:{x:number;y:number;z:number}}): void {
    if (this.complete || this.replayReady || message.health !== 0 || message.playerId !== this.targetId || message.shooterId !== this.pilotId) return;
    const shot = this.shots.get(message.impactId ?? '');
    const impact = message.impactPosition;
    if (!shot || !impact || ![impact.x,impact.y,impact.z].every(Number.isFinite)) return;
    this.shotOrigin.copy(shot.origin); this.impactPosition.copy(impact);
    this.shotDirection.subVectors(this.impactPosition,this.shotOrigin);
    const distance = this.shotDirection.length();
    if (distance < 1) return;
    this.shotDirection.divideScalar(distance);
    this.bulletPosition.copy(this.shotOrigin);
    this.pilotMuzzlePosition.copy(this.shotOrigin);
    this.shotTravelSeconds = distance / shot.speed;
    this.pilotTravel = Math.max(0,distance - BASE_PROJECTILE_SPEED * this.shotTravelSeconds);
    this.replayDuration = THREE.MathUtils.clamp(distance / shot.speed, .65, 1.4);
    this.cameraSide.crossVectors(this.shotDirection,THREE.Object3D.DEFAULT_UP).normalize();
    this.replayReady = true;
    this.shots.clear();
  }

  confirmSuccess(): void { this.resultConfirmed = true; }

  confirmDestruction(message: Destruction, heading: number, rotation?: {x:number;y:number;z:number}, velocity?: {x:number;y:number;z:number}): boolean {
    const p = message.position;
    if (this.complete || this.destructionConfirmed || message.playerId !== this.targetId ||
      message.killerId !== this.pilotId || message.cause !== 'combat' || !p ||
      ![p.x, p.y, p.z, heading].every(Number.isFinite)) return false;
    this.position.set(p.x, p.y, p.z);
    if (this.replayReady) {
      // The authoritative projectile impact is on an enlarged collision sphere,
      // not necessarily on the visible hull. End this presentation at the
      // confirmed aircraft position so the visible bullet actually hits it.
      this.impactPosition.copy(this.position);
      this.shotDirection.subVectors(this.impactPosition, this.shotOrigin).normalize();
      this.cameraSide.crossVectors(this.shotDirection, THREE.Object3D.DEFAULT_UP).normalize();
    }
    // M8's fast rear ambush must not become a second plane fly-by in the
    // finishing replay. Hold its confirmed pose while the final bullet travels.
    if (this.mission !== journeyDallas14 && velocity && [velocity.x,velocity.y,velocity.z].every(Number.isFinite)) this.enemyVelocity.copy(velocity);
    if (this.mission === journeyDallas14) this.pilotTravel = 0;
    this.enemyPosition.copy(this.position).addScaledVector(this.enemyVelocity,-this.shotTravelSeconds);
    if (!this.replayReady) this.impactPosition.copy(this.position);
    this.enemyRotation.set(rotation?.x ?? 0, heading, rotation?.z ?? 0, 'YXZ');
    // A close three-quarter view of the actual impact, never the player's location.
    this.cameraOffset.set(Math.sin(heading + .7) * 80, 24, Math.cos(heading + .7) * 80);
    this.destructionConfirmed = true;
    return true;
  }

  update(delta: number): { blast: boolean; complete: boolean; flash: number } {
    if (!this.pending) return { blast: false, complete: this.complete, flash: 0 };
    if (!this.destructionConfirmed) {
      // A reloaded completed mission has no live destruction event to replay.
      // Never invent an impact point or leave its result screen waiting forever.
      this.waiting += Math.max(0, delta);
      this.complete = this.waiting >= 1.5;
      return { blast: false, complete: this.complete, flash: 0 };
    }
    let blastDelta = Math.max(0, delta);
    if (this.replayReady && this.replayElapsed < this.replayDuration) {
      this.replayStarted = true;
      const remaining = this.replayDuration - this.replayElapsed;
      this.replayElapsed = Math.min(this.replayDuration, this.replayElapsed + blastDelta);
      const progress = THREE.MathUtils.clamp((this.replayElapsed - this.launchHold) / (this.replayDuration - this.launchHold), 0, 1);
      this.bulletPosition.lerpVectors(this.shotOrigin, this.impactPosition, progress);
      this.pilotMuzzlePosition.copy(this.shotOrigin).addScaledVector(this.shotDirection,this.pilotTravel * progress);
      this.enemyPosition.copy(this.position).addScaledVector(this.enemyVelocity,-this.shotTravelSeconds * (1-progress));
      if (this.replaying) return {blast:false,complete:false,flash:0};
      blastDelta = Math.max(0, blastDelta - remaining);
    }
    this.sequence ??= new CrashSequence(this.attemptId, 'ground');
    this.elapsed += blastDelta;
    const frame = this.sequence.update(blastDelta);
    this.complete = frame.complete;
    return frame;
  }

  updateCamera(camera: THREE.PerspectiveCamera): void {
    const pullback = 1 + Math.min(1, this.elapsed / 1.05) * .12;
    this.impactCamera.copy(this.impactPosition).addScaledVector(this.cameraOffset, pullback);
    if (this.replaying) {
      // Stay behind the visible bullet until contact, then cut to the close blast view.
      const follow = THREE.MathUtils.smoothstep(this.replayElapsed,.2,.5);
      camera.position.copy(this.pilotMuzzlePosition).lerp(this.bulletPosition,follow)
        .addScaledVector(this.shotDirection,-38).addScaledVector(this.cameraSide,12+12*follow);
      camera.position.y += 12;
      // Follow the moving opponent, rather than looking past it along the
      // bullet's original line while it crosses that line at high speed.
      this.cameraTarget.copy(this.enemyPosition);
      this.cameraSeparation.subVectors(camera.position, this.enemyPosition);
      if (this.cameraSeparation.length() < this.cameraClearance) {
        if (this.cameraSeparation.lengthSq() < .001) this.cameraSeparation.copy(this.shotDirection).negate();
        camera.position.copy(this.enemyPosition).add(this.cameraSeparation.setLength(this.cameraClearance));
      }
      camera.lookAt(this.cameraTarget);
      if (this.gameplayCamera) {
        const blend = THREE.MathUtils.smoothstep(this.replayElapsed, this.launchHold, this.launchHold + .3);
        camera.position.lerpVectors(this.gameplayCamera.position, camera.position, blend);
        this.followCameraRotation.copy(camera.quaternion);
        camera.quaternion.slerpQuaternions(this.gameplayCamera.quaternion, this.followCameraRotation, blend);
        if (camera.fov !== this.gameplayCamera.fov) {
          camera.fov = this.gameplayCamera.fov;
          camera.updateProjectionMatrix();
        }
      }
    } else {
      camera.position.copy(this.impactCamera);
      this.cameraSeparation.subVectors(camera.position, this.impactPosition).setLength(Math.max(this.cameraClearance, camera.position.distanceTo(this.impactPosition)));
      camera.position.copy(this.impactPosition).add(this.cameraSeparation);
      camera.lookAt(this.impactPosition);
    }
  }
}
