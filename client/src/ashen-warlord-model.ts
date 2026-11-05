import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import type { TitanPresentation } from '../../shared/titan-pose.mjs';
import type { AuthoredAnimation } from '../../shared/titan-animation.mjs';
let cached: Promise<GLTF> | undefined;
const load = () => cached ??= new GLTFLoader().loadAsync(model.url).catch(error => { cached = undefined; throw error; });
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
    private actions = new Map<string, THREE.AnimationAction>();
    private materials: THREE.MeshStandardMaterial[] = [];
    private frame: TitanPresentation | null = null;
    private disposed = false;
    private ending: 'defeat' | 'timeout' | null = null;
    private endingTime = 0;
    private fallback = 'idle';
    private clock = 0;
    private flash = 0;
    private wasAirborne = false;
    private grounded = [true, true];
    private footAt = [-10, -10];
    private temp = new THREE.Vector3();
    private core = new THREE.Vector3();
    constructor(source?: Promise<GLTF>) { this.ready = (source ?? load()).then(g => { if (this.disposed)
        return; const object = cloneSkeleton(g.scene) as THREE.Group; object.name = 'ashen-warlord-supplied-mixamo'; object.scale.setScalar(model.height); this.instance = object; this.root.add(object); object.traverse(o => { if (o instanceof THREE.SkinnedMesh) {
        this.mesh = o;
        o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .55, 0), 1.8);
        const clone = (m: THREE.Material) => { const copy = (m as THREE.MeshStandardMaterial).clone(); this.materials.push(copy); return copy; };
        o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    } }); this.mixer = new THREE.AnimationMixer(object); for (const clip of g.animations) {
        const action = this.mixer.clipAction(clip);
        action.play();
        action.enabled = false;
        this.actions.set(clip.name, action);
    } for (const c of Object.values(model.clips))
        if (!this.actions.has(c.name))
            throw Error('Missing supplied clip ' + c.name); this.apply({ clip: model.clips.idle!.name, time: 0, blend: 1, offsetY: 0 }); }); }
    setTitanPose(frame: TitanPresentation): void { this.frame = frame; }
    setMotion(x: number, z: number, yaw: number, _phase: number, _aimYaw: number, _aimPitch: number): void { if (!this.frame)
        this.fallback = Math.hypot(x, z) > .5 ? 'walk' : Math.abs(yaw) > .015 ? 'turn' : 'idle'; }
    setJumpProgress(progress: number | null): void { if (!this.frame && progress !== null)
        this.fallback = 'jump'; }
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
        this.fallback = 'charge';
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
        return; this.ending = kind; this.endingTime = 0; }
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
        return; for (const action of this.actions.values()) {
        action.enabled = false;
        action.setEffectiveWeight(0);
    } const current = this.actions.get(a.clip); if (!current)
        throw Error('Unknown authored clip ' + a.clip); current.enabled = true; current.time = a.time; current.setEffectiveWeight(a.previousClip ? Math.max(0, Math.min(1, a.blend)) : 1); if (a.previousClip && a.blend < 1) {
        const old = this.actions.get(a.previousClip);
        if (old) {
            old.enabled = true;
            old.time = a.previousTime ?? 0;
            old.setEffectiveWeight(1 - a.blend);
        }
    } this.mixer.update(0); this.instance.position.y = a.offsetY * model.height; this.root.updateMatrixWorld(true); this.mesh?.skeleton.update(); }
    update(dt: number, _distance: number, _hitPulse: number): void {
        if (!this.instance || this.disposed)
            return;
        this.clock += dt;
        this.flash = Math.max(0, this.flash - dt);
        let a = this.frame?.animation;
        if (this.ending) {
            this.endingTime += dt;
            const clip = model.clips[this.ending === 'defeat' ? 'defeat' : 'roar']!;
            a = { clip: clip.name, time: Math.min(clip.duration - 1e-5, this.endingTime), blend: 1, offsetY: 0 };
            this.apply(a);
            if (this.mesh) {
                let low = Infinity;
                for (const v of model.support) {
                    this.mesh.getVertexPosition(v.index!, this.temp);
                    low = Math.min(low, this.temp.y);
                }
                this.instance.position.y = -low * model.height;
            }
        }
        else if (a)
            this.apply(a);
        else {
            const clip = model.clips[this.fallback]!;
            this.apply({ clip: clip.name, time: this.clock % clip.duration, blend: 1, offsetY: 0 });
        }
        for (const m of this.materials) {
            if (this.ending === 'defeat') {
                const duration = model.clips.defeat!.duration;
                m.transparent = true;
                m.depthWrite = false;
                m.opacity = Math.max(0, Math.min(1, (duration - this.endingTime) / .8));
            }
            m.emissiveIntensity = 1 + this.flash * .6 + (this.frame?.ability?.id === 'energy-beam' && this.frame.ability.stage === 'WARNING' ? .4 : 0);
        }
        const airborne = this.frame?.locomotion === 'jump';
        if (this.wasAirborne && !airborne) {
            this.temp.copy(this.root.position);
            this.onLanding?.(this.temp);
        }
        this.wasAirborne = airborne;
        if (this.frame && !airborne && Math.hypot(this.frame.velocity.x, this.frame.velocity.z) > 1)
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
        return; this.disposed = true; this.mixer?.stopAllAction(); if (this.instance)
        this.mixer?.uncacheRoot(this.instance); for (const m of this.materials)
        m.dispose(); this.root.clear(); this.frame = null; }
}
