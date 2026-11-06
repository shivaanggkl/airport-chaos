import {pursuitWarlord} from '../../shared/pursuit-warlord.mjs';
import {huntingWarlord} from '../../shared/hunting-warlord.mjs';
import {strikingWarlord} from '../../shared/striking-warlord.mjs';
import {MonsterVictory,MONSTER_VICTORY,MONSTER_VICTORY_SECONDS} from './monster-victory';
import * as THREE from 'three';
import {M19_TIMEOUT} from './monster-timeout';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import type { TitanPresentation } from '../../shared/titan-pose.mjs';
import{applyTitanJointAim,titanLocomotionNode}from '../../shared/titan-animation.mjs';
import type { AuthoredAnimation } from '../../shared/titan-animation.mjs';
let cached: Promise<GLTF> | undefined;
const load = () => cached ??= new GLTFLoader().loadAsync(model.url).catch(error => { cached = undefined; throw error; });
const motionKeys=['idle','run','turn','punch','shoot','hit'] as const;
const motionNames=new Set(motionKeys.map(key=>model.clips[key]!.name));
const loops=new Map(['idle','walk','run','turn'].map(key=>[model.clips[key]!.name,model.clips[key]!.duration]));
/** Interpolate through the loop seam, never rewind the entire authored gait. */
export function mixAshenClipTime(clip:string,from:number,to:number,weight:number):number{const duration=loops.get(clip);if(!duration)return from+(to-from)*weight;const delta=((to-from+duration/2)%duration+duration)%duration-duration/2;return((from+delta*weight)%duration+duration)%duration;}

/** Supplied 65-bone Mixamo skeleton, authored clip playback and normal cross-fades. No procedural replacement rig. */
export class AshenWarlordModel {
    readonly root = new THREE.Group();
    readonly ready: Promise<void>;
    groundAt?: (x: number, z: number) => number;
    onFootContact?: (p: THREE.Vector3) => void;
    onLanding?: (p: THREE.Vector3) => void;
    private instance?: THREE.Group;
    private mesh?: THREE.SkinnedMesh;
    private mixer?: THREE.AnimationMixer;
    private aimBones:{node:number;bone:THREE.Object3D;base:THREE.Quaternion}[]=[];
    private aimInput=new Float64Array(4);
    private aimOutput=new Float64Array(4);
    private actions = new Map<string, THREE.AnimationAction>();
    private materials: THREE.MeshStandardMaterial[] = [];
    private frame: TitanPresentation | null = null;
    private disposed = false;
    private ending: 'defeat' | 'timeout' | null = null;
    private endingTime = 0;
    private endingFrom?:AuthoredAnimation;
    private victory?:MonsterVictory;
    private fallback = 'idle';
    private clock = 0;
    private introTime: number | null = null;
    setIntroTime(seconds: number | null): void { this.introTime = seconds; }
    private flash = 0;
    private grounded = [true, true];
    private footAt = [-10, -10];
    private temp = new THREE.Vector3();
    private core = new THREE.Vector3();
    constructor(source?: Promise<GLTF>,private readonly stationary=false,private readonly striking=false,private readonly hunting=false,private readonly pursuit=false) { this.ready = (source ?? load()).then(g => { if (this.disposed)
        return; const object = cloneSkeleton(g.scene) as THREE.Group; object.name = 'ashen-warlord-supplied-mixamo'; object.scale.setScalar(model.height); this.instance = object; this.root.add(object); object.traverse(o => { if (o instanceof THREE.SkinnedMesh) {
        this.mesh = o;
        o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .55, 0), 1.8);
        const clone = (m: THREE.Material) => { const copy = (m as THREE.MeshStandardMaterial).clone(); this.materials.push(copy); return copy; };
        o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    } }); this.mixer = new THREE.AnimationMixer(object); for (const clip of g.animations) {
        if(!((this.stationary||this.striking)?(this.striking?(this.pursuit?pursuitWarlord:this.hunting?huntingWarlord:strikingWarlord).motions:['idle','punch','roar','defeat']).map(key=>model.clips[key]!.name).includes(clip.name):motionNames.has(clip.name)))continue;
        if((this.stationary||this.striking)&&![model.clips.idle!.name,model.clips.turn!.name,...(this.hunting?[model.clips.walk!.name]:[]),...(this.pursuit?[model.clips.run!.name]:[])].includes(clip.name)){const action=this.mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}
        const action = this.mixer.clipAction(clip);
        action.play();
        action.enabled = false;
        this.actions.set(clip.name, action);
        const lower=(track:THREE.KeyframeTrack)=>titanLocomotionNode(track.name)||/Hips\.(position|quaternion)$/.test(track.name);
        for(const [suffix,tracks]of [['#upper',clip.tracks.filter(t=>!lower(t))],['#lower',clip.tracks.filter(lower)]]as const){const variant=new THREE.AnimationClip(clip.name+suffix,clip.duration,[...tracks]);const a=this.mixer.clipAction(variant);a.play();a.enabled=false;this.actions.set(variant.name,a);}
    }
    for(const key of['neck','head']){const bone=object.getObjectByName(model.bones[key]!);if(bone)this.aimBones.push({node:model.boneNodes[key]!,bone,base:bone.quaternion.clone()});}
    for (const c of (this.striking?(this.pursuit?pursuitWarlord:this.hunting?huntingWarlord:strikingWarlord).motions:this.stationary?['idle','punch','roar','defeat']:motionKeys).map(key=>model.clips[key]!))
        if (!this.actions.has(c.name))
            throw Error('Missing supplied clip ' + c.name); this.apply({ clip: model.clips.idle!.name, time: 0, blend: 1, offsetY: 0 }); }); }
    setTitanPose(frame: TitanPresentation): void { this.frame = frame; }
    setMotion(x: number, z: number, yaw: number, _phase: number, _aimYaw: number, _aimPitch: number): void { if (!this.frame)
        this.fallback = Math.hypot(x, z) > .5 ? 'run' : Math.abs(yaw) > .015 ? 'turn' : 'idle'; }
    setJumpProgress(_progress: number | null): void { /* Ground-only M19; retained model interface. */ }
    setHandSwipe(swipe: {
        side: 'left' | 'right';
        target: {
            x: number;
            y: number;
            z: number;
        };
        progress: number;
    } | null): void { if (!this.frame && swipe)
        this.fallback = 'punch'; }
    windup(): void { if (!this.frame) {
        this.fallback = 'idle';
        this.clock = 0;
    } }
    release(): void { if (!this.frame) {
        this.fallback = 'shoot';
        this.clock = 0;
    } }
    recover(): void { if (!this.frame) {
        this.fallback = 'idle';
        this.clock = 0;
    } }
    hit(): void { this.flash = .2; }
    finish(kind: 'defeat' | 'timeout'): void { if (this.ending)
        return; this.endingFrom=this.frame?.animation?{...this.frame.animation}:undefined; this.ending = kind; this.endingTime = 0; if(kind==='defeat'&&!this.stationary&&!this.striking)this.root.visible=false; }
    beginVictory(scene:THREE.Scene):void{
        if(!this.stationary||this.victory)return;
        this.victory=new MonsterVictory(scene);for(const material of this.materials)this.victory.attach(material);
    }
    mouthPosition(out: THREE.Vector3): boolean { const p = this.frame?.limbs.mouth; if (p) {
        out.set(p.x, p.y, p.z);
        return true;
    } return false; }
    corePosition(out: THREE.Vector3): boolean { if (!this.mesh)
        return false; out.set(0, 0, 0); for (const v of model.coreSupport) {
        this.mesh.getVertexPosition(v.index!, this.temp);
        this.mesh.localToWorld(this.temp);
        out.addScaledVector(this.temp, 1 / model.coreSupport.length);
    } return true; }
    handPosition(side: 'left' | 'right', out: THREE.Vector3): boolean { if (!this.mesh)
        return false; out.set(0, 0, 0); const points = model.handSupport[side]!; for (const v of points) {
        this.mesh.getVertexPosition(v.index!, this.temp);
        this.mesh.localToWorld(this.temp);
        out.addScaledVector(this.temp, 1 / points.length);
    } return true; }
    private apply(a: AuthoredAnimation): void { if (!this.mixer || !this.instance)
        return; for(const b of this.aimBones)b.bone.quaternion.copy(b.base);
        for (const action of this.actions.values()) {
        action.enabled = false;
        action.setEffectiveWeight(0);
    } const suffix=a.locomotion?'#upper':'';
        const current = this.actions.get(a.clip+suffix); if (!current)
        throw Error('Unknown authored clip ' + a.clip); current.enabled = true; current.time = a.time; current.setEffectiveWeight(a.previousClip ? Math.max(0, Math.min(1, a.blend)) : 1); if (a.previousClip && a.blend < 1) {
        const old = this.actions.get(a.previousClip+suffix);
        if (old) {
            old.enabled = true;
            old.time = a.previousTime ?? 0;
            old.setEffectiveWeight(1 - a.blend);
        }
    }
    if(a.locomotion){const lower=this.actions.get(a.locomotion.clip+'#lower');if(lower){lower.enabled=true;lower.time=a.locomotion.time;lower.setEffectiveWeight(1);}}
    this.mixer.update(0);
    for(const b of this.aimBones){b.base.copy(b.bone.quaternion);const aim=a.aim?.find(x=>x.node===b.node);if(aim){b.bone.quaternion.toArray(this.aimInput);applyTitanJointAim(this.aimInput,aim.yaw,aim.pitch,this.aimOutput);b.bone.quaternion.fromArray(this.aimOutput);}}
    this.instance.position.y = a.offsetY * model.height; this.root.updateMatrixWorld(true); this.mesh?.skeleton.update(); }
    update(dt: number, _distance: number, _hitPulse: number): void {
        if (!this.instance || this.disposed)
            return;
        this.clock += dt;
        this.flash = Math.max(0, this.flash - dt);
        let a = this.frame?.animation;
        if (this.ending) {
            this.endingTime += dt;
            if(this.stationary||this.striking){
                const key=this.ending==='defeat'?'defeat':'roar',clip=model.clips[key]!;
                const t=Math.min(this.endingTime,this.victory?MONSTER_VICTORY.blastSeconds:clip.duration);
                this.apply({clip:clip.name,time:t,previousClip:this.endingFrom?.clip??model.clips.idle!.name,previousTime:this.endingFrom?.time??this.clock%model.clips.idle!.duration,blend:Math.min(1,this.endingTime/.2),offsetY:0});
                if(this.mesh){
                    let low=Infinity;
                    for(const point of model.support){this.mesh.getVertexPosition(point.index!,this.temp);this.mesh.localToWorld(this.temp);low=Math.min(low,this.temp.y);}
                    this.instance.position.y+=this.root.position.y-low;this.root.updateMatrixWorld(true);
                }
                if(this.ending==='defeat'){
                    if(this.victory&&this.mesh){
                        this.victory.update(this.endingTime,this.mesh,this.root);
                        if(this.endingTime>=MONSTER_VICTORY_SECONDS)this.root.visible=false;
                    }else{
                        const opacity=1-Math.max(0,Math.min(1,(this.endingTime-clip.duration)/.7));
                        for(const material of this.materials){material.transparent=opacity<1;material.opacity=opacity;}
                        if(this.endingTime>=clip.duration+.7)this.root.visible=false;
                    }
                }
            }else{
            const firing=this.ending==='timeout'&&this.endingTime>=M19_TIMEOUT.shootAt&&this.endingTime<M19_TIMEOUT.shootAt+3.1;
            const clip = firing?model.clips.shoot!:model.clips.idle!;
            const t=this.endingTime-M19_TIMEOUT.shootAt;
            const blend=firing?Math.min(1,t/.2,(3.1-t)/.25):1;
            this.apply({clip:clip.name,time:firing?t:this.endingTime%clip.duration,previousClip:firing?model.clips.idle!.name:undefined,previousTime:this.endingTime%model.clips.idle!.duration,blend,offsetY:0});
        }
        }
        else if((this.stationary||this.striking)&&this.introTime!==null&&!this.frame){
            const t=this.introTime,clip=model.clips.roar!,local=t-.45;
            const roaring=local>=0&&local<clip.duration;
            this.apply(roaring?{clip:clip.name,time:local,previousClip:model.clips.idle!.name,previousTime:t%model.clips.idle!.duration,blend:Math.min(1,local/.2,(clip.duration-local)/.2),offsetY:0}:{clip:model.clips.idle!.name,time:t%model.clips.idle!.duration,blend:1,offsetY:0});
        }
        else if (this.introTime !== null && !this.frame) {
            // Two full authored strikes, with a short idle lead-in and recovery.
            const t=this.introTime, punch=model.clips.punch!, idle=model.clips.idle!;
            const strike=t>=.45&&t<4.95;
            const local=(t-.45)%punch.duration;
            const blend=strike?Math.min(1,local/.2,(punch.duration-local)/.2):0;
            this.apply(strike?{clip:punch.name,time:Math.max(0,local),previousClip:idle.name,previousTime:t%idle.duration,blend,offsetY:0}:{clip:idle.name,time:t%idle.duration,blend:1,offsetY:0});
        }
        else if (a)
            this.apply(a);
        else {
            const clip = model.clips[this.fallback]!;
            this.apply({ clip: clip.name, time: this.clock % clip.duration, blend: 1, offsetY: 0 });
        }
        for (const m of this.materials) {
            m.emissiveIntensity = 1 + this.flash * .6;
        }
        if (this.frame && Math.hypot(this.frame.velocity.x, this.frame.velocity.z) > 1)
            for (const [i, key] of ['foot-left', 'foot-right'].entries()) {
                const p = this.frame.feet[key];
                if (!p)
                    continue;
                const low = p.y - (this.groundAt?.(p.x, p.z) ?? this.root.position.y) < 100;
                if (low && !this.grounded[i] && this.clock - this.footAt[i]! > .3) {
                    this.footAt[i] = this.clock;
                    this.temp.set(p.x, p.y, p.z);
                    this.onFootContact?.(this.temp);
                }
                this.grounded[i] = low;
            }
    }
    dispose(): void { if (this.disposed)
        return; this.disposed = true; this.victory?.dispose(); this.victory=undefined; this.mixer?.stopAllAction(); if (this.instance)
        this.mixer?.uncacheRoot(this.instance); for (const m of this.materials)
        m.dispose(); this.root.clear(); this.frame = null; }
}
