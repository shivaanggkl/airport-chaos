import * as THREE from 'three';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { monsterJumpMotion } from '../../shared/monster-motion.mjs';
import { monsterGeometry } from '../../shared/monster-arrival-geometry.mjs';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

type FootRig = { hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D;
  length1: number; length2: number; rest: THREE.Vector3; restRotation: THREE.Quaternion;
  animationRotations: THREE.Quaternion[]; anchor: THREE.Vector3; swingStart: THREE.Vector3; swingEnd: THREE.Vector3; swinging: boolean };

type ClipName = 'Idle' | 'Walk' | 'Turn' | 'AttackWindup' | 'AttackRelease'
  | 'Recovery' | 'Hit' | 'Defeat' | 'TimeoutAttack';

const modelUrl = '/assets/models/monsters/monster-arrival.glb';
const loader = new GLTFLoader();
let cached: Promise<GLTF> | undefined;

function loadSource(): Promise<GLTF> {
  cached ??= loader.loadAsync(modelUrl).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

/** One Mission 19 instance of the supplied, skinned creature. Geometry is cached. */
export class MonsterArrivalModel {
  readonly root = new THREE.Group();
  readonly ready: Promise<void>;
  private instance?: THREE.Group;
  private mixer?: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private near?: THREE.Object3D;
  private mid?: THREE.Object3D;
  private far?: THREE.Object3D;
  private leftFoot?: THREE.Object3D;
  private rightFoot?: THREE.Object3D;
  private head?: THREE.Object3D;
  private neck?: THREE.Object3D;
  private readonly neckAnimationRotation = new THREE.Quaternion();
  private active?: ClipName;
  private transient?: ClipName;
  private walking = false;
  private windupActive = false;
  private ending: 'defeat' | 'timeout' | null = null;
  private disposed = false;
  private hitCooldown = 0;
  private readonly feet: FootRig[] = [];
  private jumpProgress: number | null = null;
  private landingContact = false;
  private phase = 0;
  private phaseRate = 0;
  private velocityX = 0;
  private velocityZ = 0;
  private yawRate = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private readonly headAnimationRotation = new THREE.Quaternion();
  private headAimApplied = false;
  private feetApplied = false;
  private jumpArmsApplied = false;
  private readonly jumpArms: {bone:THREE.Object3D;rotation:THREE.Quaternion;flex:number}[] = [];
  private readonly scratch = Array.from({ length: 10 }, () => new THREE.Vector3());
  private readonly rotations = Array.from({ length: 5 }, () => new THREE.Quaternion());
  private readonly up = new THREE.Vector3(0,1,0);
  private mouth?: THREE.Object3D;
  groundAt?: (x: number, z: number) => number;
  onFootContact?: (position: THREE.Vector3) => void;
  onLanding?: (position: THREE.Vector3) => void;

  constructor(source?: Promise<GLTF>) {
    this.ready = (source ?? loadSource()).then((gltf) => {
      if (this.disposed) return;
      const instance = cloneSkeleton(gltf.scene) as THREE.Group;
      instance.name = 'monster-arrival-supplied-model';
      instance.scale.setScalar(journeyDallas19.monster.height);
      instance.position.y = 0; // Repaired asset has a ground-contact origin and unit height.
      instance.rotation.y = Math.PI; // Source faces +Z; Mission 19's authoritative forward axis is -Z.
      this.root.add(instance);
      this.instance = instance;
      this.near = instance.getObjectByName('MonsterNear');
      this.mid = instance.getObjectByName('MonsterMid');
      this.far = instance.getObjectByName('MonsterFar');
      this.leftFoot = instance.getObjectByName('LeftFoot');
      this.rightFoot = instance.getObjectByName('RightFoot');
      this.head = instance.getObjectByName('Head');
      this.neck = instance.getObjectByName('Neck');
      this.mouth = instance.getObjectByName('Mouth');
      for(const side of ['Left','Right'])for(const [part,flex] of [['UpperArm',-.18],['Forearm',.3]] as const){
        const bone=instance.getObjectByName(side+part);
        if(bone)this.jumpArms.push({bone,rotation:bone.quaternion.clone(),flex});
      }
      if (!this.near || !this.mid || !this.far || !this.leftFoot || !this.rightFoot || !this.head || !this.neck || !this.mouth) {
        throw new Error('Mission 19 creature is missing its authored LOD or rig nodes');
      }
      this.mid.visible = false;
      this.far.visible = false;
      const cloned = new Map<THREE.Material, THREE.Material>();
      instance.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = false;
        object.receiveShadow = false;
        if (object instanceof THREE.SkinnedMesh) {
          object.computeBoundingSphere();
          if (object.boundingSphere) object.boundingSphere.radius *= 1.4;
        }
        const originals = Array.isArray(object.material) ? object.material : [object.material];
        const replacements = originals.map((material) => {
          let local = cloned.get(material);
          if (!local) {
            const copy = material.clone();
            cloned.set(material, copy);
            local = copy;
            if (local instanceof THREE.MeshStandardMaterial) {
              this.materials.push(local);
            }
          }
          return local;
        });
        object.material = Array.isArray(object.material) ? replacements : replacements[0]!;
      });
      this.root.updateMatrixWorld(true);
      for (const side of ['Left','Right']) {
        const hip=instance.getObjectByName(side+'Thigh')!, knee=instance.getObjectByName(side+'Shin')!, ankle=instance.getObjectByName(side+'Foot')!;
        const h=hip.getWorldPosition(new THREE.Vector3()), k=knee.getWorldPosition(new THREE.Vector3()), f=ankle.getWorldPosition(new THREE.Vector3());
        const rest=this.root.worldToLocal(f.clone());
        const restRotation=this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(ankle.getWorldQuaternion(new THREE.Quaternion()));
        this.feet.push({hip,knee,ankle,animationRotations:[hip.quaternion.clone(),knee.quaternion.clone(),ankle.quaternion.clone()],length1:h.distanceTo(k),length2:k.distanceTo(f),rest,restRotation,
          anchor:f.clone(),swingStart:f.clone(),swingEnd:f.clone(),swinging:false});
      }
      this.mixer = new THREE.AnimationMixer(instance);
      for (const clip of gltf.animations) {
        this.actions.set(clip.name as ClipName, this.mixer.clipAction(clip));
      }
      this.play(this.ending === 'defeat' ? 'Defeat' : this.ending === 'timeout' ? 'TimeoutAttack'
        : this.windupActive ? 'AttackWindup' : this.walking ? 'Walk' : 'Idle');
    });
  }

  private play(name: ClipName): void {
    const action = this.actions.get(name);
    if (!action || this.active === name) return;
    const previous = this.active && this.actions.get(this.active);
    action.reset();
    action.enabled = true;
    action.setLoop(name === 'Idle' || name === 'Walk' || name === 'Turn' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = name !== 'Idle' && name !== 'Walk' && name !== 'Turn';
    action.play();
    if (previous) action.crossFadeFrom(previous, 0.16, true);
    this.active = name;
  }

  setWalking(walking: boolean): void {
    this.walking = walking;
    if (!this.ending && !this.windupActive && !this.transient) this.play(walking ? 'Walk' : 'Idle');
  }

  windup(): void {
    if (this.ending) return;
    this.windupActive = true;
    this.transient = undefined;
    this.play('AttackWindup');
  }

  release(): void {
    if (this.ending) return;
    this.windupActive = false;
    this.transient = 'AttackRelease';
    this.play('AttackRelease');
  }

  recover(): void {
    if (this.ending || this.transient === 'AttackRelease') return;
    this.windupActive = false;
    this.transient = 'Recovery';
    this.play('Recovery');
  }

  hit(): void {
    if (this.ending || this.windupActive || this.transient === 'AttackRelease' || this.hitCooldown > 0) return;
    this.hitCooldown = 0.35;
    this.transient = 'Hit';
    this.play('Hit');
  }

  turn(): void {
    if (this.ending || this.windupActive || this.transient || !this.walking) return;
    this.transient = 'Turn';
    this.play('Turn');
  }

  finish(kind: 'defeat' | 'timeout'): void {
    this.ending = kind;
    this.jumpProgress=null;this.landingContact=false;
    this.windupActive = false;
    this.transient = undefined;
    this.play(kind === 'defeat' ? 'Defeat' : 'TimeoutAttack');
  }

  footPosition(side: 'left' | 'right', out: THREE.Vector3): boolean {
    const bone = side === 'left' ? this.leftFoot : this.rightFoot;
    if (!bone) return false;
    bone.getWorldPosition(out);
    return true;
  }

  headObject(): THREE.Object3D | undefined { return this.head; }

  mouthPosition(out: THREE.Vector3): boolean {
    if (!this.mouth) return false;
    this.mouth.getWorldPosition(out); return true;
  }

  setJumpProgress(progress: number | null): void {
    if(this.jumpProgress!==null && this.jumpProgress<monsterJumpMotion.landingStart && (progress===null||progress>=monsterJumpMotion.landingStart))this.landingContact=true;
    this.jumpProgress=progress;
  }

  setMotion(x: number, z: number, yawRate: number, phase: number, aimYaw: number, aimPitch: number): void {
    this.velocityX=x;this.velocityZ=z;this.yawRate=yawRate;
    this.phaseRate=Math.max(Math.hypot(x,z)/14/(journeyDallas19.monster.height/480),Math.abs(yawRate)/(Math.PI/12)*1.6)/4.8;
    const error=((phase-this.phase+.5)%1+1)%1-.5;
    this.phase+=error*.35;
    this.aimYaw=THREE.MathUtils.clamp(aimYaw,-Math.PI/10,Math.PI/10);
    this.aimPitch=THREE.MathUtils.clamp(aimPitch,-.42,.42);
    const moving=this.jumpProgress===null && Math.hypot(x,z)>.25;
    this.walking=moving;
    if (!this.ending && !this.windupActive && !this.transient) this.play(moving?'Walk':Math.abs(yawRate)>.015?'Turn':'Idle');
  }

  private rotateBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
    const [world,change,parent]=this.rotations;
    bone.getWorldQuaternion(world!);
    change!.setFromUnitVectors(from.normalize(),to.normalize());
    bone.parent!.getWorldQuaternion(parent!).invert();
    bone.quaternion.copy(parent!).multiply(change!).multiply(world!);
    bone.updateWorldMatrix(false,true);
  }

  private plantFeet(): void {
    const h=journeyDallas19.monster.height;
    this.root.updateMatrixWorld(true);
    for (let side=0;side<this.feet.length;side++) {
      const foot=this.feet[side]!;
      foot.animationRotations[0]!.copy(foot.hip.quaternion);
      foot.animationRotations[1]!.copy(foot.knee.quaternion);
      foot.animationRotations[2]!.copy(foot.ankle.quaternion);
      const phase=((this.phase+side*.5)%1+1)%1;
      const swing=this.jumpProgress===null && phase<.45 && this.phaseRate>.001 && !this.windupActive;
      const [nominal,target,hip,knee,ankle,axis,pole,desiredKnee,from,to]=this.scratch;
      nominal!.copy(foot.rest);this.root.localToWorld(nominal!);
      const ground=this.groundAt?.(nominal!.x,nominal!.z) ?? this.root.position.y;
      nominal!.y=ground+monsterGeometry.footHeight*h;
      if (swing && !foot.swinging) {
        foot.swingStart.copy(foot.anchor);foot.swingEnd.copy(nominal!);
        const ahead=1.6;
        foot.swingEnd.x+=this.velocityX*ahead;foot.swingEnd.z+=this.velocityZ*ahead;
        foot.swingEnd.y=(this.groundAt?.(foot.swingEnd.x,foot.swingEnd.z) ?? ground)+monsterGeometry.footHeight*h;
      }
      if (this.jumpProgress===null && !swing && foot.swinging) {
        foot.anchor.copy(foot.swingEnd);
        target!.copy(foot.anchor);target!.y-=monsterGeometry.footHeight*h;
        this.onFootContact?.(target!);
      }
      foot.swinging=swing;
      target!.copy(foot.anchor);
      if (swing) {
        const t=phase/.45,eased=t*t*(3-2*t);
        target!.lerpVectors(foot.swingStart,foot.swingEnd,eased);
        target!.y+=Math.sin(Math.PI*t)*h*.045;
      }
      // The initial pose may arrive before the first state or on sloped terrain.
      if (this.phaseRate===0 && !this.windupActive && !this.transient) { foot.anchor.copy(nominal!);target!.copy(nominal!); }
      if(this.jumpProgress!==null){
        // Both legs travel with the body in the air, with a controlled knee tuck.
        // Anticipation and landing use the existing terrain-backed foot IK.
        target!.copy(foot.rest);this.root.localToWorld(target!);
        const air=(this.jumpProgress-monsterJumpMotion.anticipationEnd)/(monsterJumpMotion.landingStart-monsterJumpMotion.anticipationEnd);
        if(air>0 && air<1)target!.y+=Math.sin(Math.PI*air)*h*.075;
        else target!.y=ground+monsterGeometry.footHeight*h;
        foot.anchor.copy(target!);foot.swinging=false;
      }
      if(this.landingContact){
        const contact=this.scratch[0]!;contact.copy(target!);contact.y=ground;
        this.onLanding?.(contact);
      }
      foot.hip.getWorldPosition(hip!);foot.knee.getWorldPosition(knee!);foot.ankle.getWorldPosition(ankle!);
      axis!.subVectors(target!,hip!);const distance=THREE.MathUtils.clamp(axis!.length(),Math.abs(foot.length1-foot.length2)+.01,foot.length1+foot.length2-.01);axis!.normalize();
      const a=(foot.length1**2-foot.length2**2+distance**2)/(2*distance);
      pole!.set(-Math.sin(this.root.rotation.y),0,-Math.cos(this.root.rotation.y));pole!.addScaledVector(axis!,-pole!.dot(axis!));pole!.normalize();
      desiredKnee!.copy(hip!).addScaledVector(axis!,a).addScaledVector(pole!,Math.sqrt(Math.max(0,foot.length1**2-a*a)));
      from!.subVectors(knee!,hip!);to!.subVectors(desiredKnee!,hip!);this.rotateBone(foot.hip,from!,to!);
      foot.knee.getWorldPosition(knee!);foot.ankle.getWorldPosition(ankle!);
      from!.subVectors(ankle!,knee!);to!.subVectors(target!,knee!);this.rotateBone(foot.knee,from!,to!);
      const [world,,parent]=this.rotations;
      this.root.getWorldQuaternion(world!).multiply(foot.restRotation);
      foot.ankle.parent!.getWorldQuaternion(parent!).invert();foot.ankle.quaternion.copy(parent!).multiply(world!);
      foot.ankle.updateWorldMatrix(false,true);
    }
    this.landingContact=false;
  }

  update(delta: number, distance: number, hitPulse: number): void {
    this.hitCooldown = Math.max(0, this.hitCooldown - delta);
    // The mixer skips writing unchanged track samples. Restore the authored
    // pose before applying this frame's aim, otherwise the offset compounds.
    if (this.headAimApplied) {
      this.head?.quaternion.copy(this.headAnimationRotation);
      this.neck?.quaternion.copy(this.neckAnimationRotation);
    }
    this.headAimApplied = false;
    if (this.feetApplied) {
      for (const foot of this.feet) {
        foot.hip.quaternion.copy(foot.animationRotations[0]!);
        foot.knee.quaternion.copy(foot.animationRotations[1]!);
        foot.ankle.quaternion.copy(foot.animationRotations[2]!);
      }
    }
    this.feetApplied = false;
    if(this.jumpArmsApplied)for(const arm of this.jumpArms)arm.bone.quaternion.copy(arm.rotation);
    this.jumpArmsApplied=false;
    const walk = this.actions.get('Walk');
    if (walk) walk.setEffectiveTimeScale(this.jumpProgress===null?this.phaseRate*walk.getClip().duration:0);
    this.mixer?.update(delta);
    if(this.jumpProgress===null)this.phase+=delta*this.phaseRate;
    if(this.jumpProgress!==null && !this.ending){
      const tuck=Math.sin(Math.PI*this.jumpProgress);
      this.scratch[0]!.set(Math.cos(this.root.rotation.y),0,-Math.sin(this.root.rotation.y));
      for(const arm of this.jumpArms){
        arm.rotation.copy(arm.bone.quaternion);
        const [world,change,parent]=this.rotations;
        arm.bone.getWorldQuaternion(world!);change!.setFromAxisAngle(this.scratch[0]!,arm.flex*tuck);world!.premultiply(change!);
        arm.bone.parent!.getWorldQuaternion(parent!).invert();arm.bone.quaternion.copy(parent!).multiply(world!);
        arm.bone.updateWorldMatrix(false,true);
      }
      this.jumpArmsApplied=true;
    }
    if (!this.ending && this.head) {
      const [world,aim,parent]=this.rotations;
      this.root.updateMatrixWorld(true);
      this.headAnimationRotation.copy(this.head.quaternion);
      this.neckAnimationRotation.copy(this.neck!.quaternion);
      this.headAimApplied = true;
      // A small neck lead connects aiming to the torso; the head completes it.
      for (let i=0;i<2;i++) {
        const bone=i===0?this.neck!:this.head,fraction=i===0?.35:.65;
        bone.getWorldQuaternion(world!);
        aim!.setFromAxisAngle(this.up,this.aimYaw*fraction);world!.premultiply(aim!);
        this.scratch[0]!.set(Math.cos(this.root.rotation.y),0,-Math.sin(this.root.rotation.y));
        aim!.setFromAxisAngle(this.scratch[0]!,this.aimPitch*fraction);world!.premultiply(aim!);
        bone.parent!.getWorldQuaternion(parent!).invert();bone.quaternion.copy(parent!).multiply(world!);
        bone.updateWorldMatrix(false,true);
      }
      this.plantFeet();
      this.feetApplied = true;
    }
    if (this.near && this.mid && this.far) {
      // LOD thresholds scale with the doubled creature; culling bounds include motion.
      const near = distance < journeyDallas19.monster.height * 10;
      const mid = !near && distance < journeyDallas19.monster.height * 18.75;
      this.near.visible = near;
      this.mid.visible = mid;
      this.far.visible = !near && !mid;
    }
    if (!this.ending && this.transient) {
      const action = this.actions.get(this.transient);
      if (action && action.time >= action.getClip().duration - 0.025) {
        if (this.transient === 'AttackRelease') {
          this.transient = 'Recovery';
          this.play('Recovery');
        } else {
          this.transient = undefined;
          this.play(this.windupActive ? 'AttackWindup' : this.walking ? 'Walk' : 'Idle');
        }
      }
    }
    for (const material of this.materials) {
      const hide = material.name.includes('Monster skin') || material.name.includes('Terracotta') || material.name.includes('clay') || material.name.includes('Maroon');
      if (!hide) continue;
      material.emissive.setHex(0xff8d53);
      material.emissiveIntensity = hitPulse * 1.35;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.instance) this.mixer?.uncacheRoot(this.instance);
    // Cloned skeletons own their per-instance GPU bone textures. Cached source
    // geometry remains reusable; Retry must release only the instance textures.
    const skeletons = new Set<THREE.Skeleton>();
    this.instance?.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
    this.root.clear();
  }
}
