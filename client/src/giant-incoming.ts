import { TransportArrivalSequence } from './transport-arrival';
import * as THREE from 'three';
import { TransportDefeatSequence } from './transport-defeat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { transportTuning, type TransportStateMessage, type TransportPoint } from '../../shared/giant-incoming.mjs';
export type { TransportStateMessage } from '../../shared/giant-incoming.mjs';
/** Attempt-owned view: no targets or resources are registered in Free Fly. */
export class GiantIncomingView {
    readonly root = new THREE.Group();
    readonly ready: Promise<void>;
    readonly position = new THREE.Vector3();
    private levels: THREE.Group[] = [];
    private state?: TransportStateMessage;
    private receivedAt = 0;
    private disposed = false;
    private defeat?: TransportDefeatSequence;
    private arrival?: TransportArrivalSequence;
    private arrivalResolve?:()=>void;
    get arrivalActive():boolean{return !!this.arrival;}
    get arrivalShowsPlayer():boolean{return this.arrival?.showsPlayer??false;}
    skipArrival():void{this.arrival?.skip();}
    beginArrival():Promise<void>{
        this.levels.forEach((level,index)=>{level.visible=index===0;});
        this.arrival=new TransportArrivalSequence(this.root,this.terrain);
        return new Promise(resolve=>{this.arrivalResolve=resolve;});
    }
    private resolveDefeat!: () => void;
    readonly defeatFinished = new Promise<void>(resolve => { this.resolveDefeat = resolve; });
    private defeatEnded = false;
    onCrashImpact?: () => void;
    get defeatActive(): boolean { return !!this.defeat && !this.defeatEnded; }
    get defeatComplete(): boolean { return this.defeatEnded; }
    updateDefeatCamera(camera:THREE.Camera,delta:number,player:THREE.Object3D,
        chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
        if(this.arrival)this.arrival.frame(camera,delta,player,chasePosition,chaseTarget);
        else this.defeat?.frame(camera,delta);
    }
    private elapsed = 0;
    private final?: 'defeat' | 'timeout';
    private finalAt = 0;
    private hitSequence = 0;
    private fans: THREE.Object3D[][] = [];
    private guns: {
        yaw: THREE.Object3D;
        pitch: THREE.Object3D;
    }[] = [];
    private tracerGeometry = new THREE.CylinderGeometry(.55, .55, 17, 5);
    private tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd15a, toneMapped: false });
    private tracers = Array.from({ length: 9 }, () => new THREE.Mesh(this.tracerGeometry, this.tracerMaterial));
    private warningGeometry = new THREE.SphereGeometry(5, 8, 6);
    private warningMaterial = new THREE.MeshBasicMaterial({ color: 0xffce45, toneMapped: false });
    private warning = new THREE.Mesh(this.warningGeometry, this.warningMaterial);
    private particleGeometry = new THREE.BufferGeometry();
    private particleMaterial = new THREE.PointsMaterial({ size: 8, color: 0xffffff, vertexColors: true, transparent: true, opacity: .75, depthWrite: false, sizeAttenuation: true });
    private particles: THREE.Points;
    private positions = new Float32Array(96 * 3);
    private colors = new Float32Array(96 * 3);
    private velocities = new Float32Array(96 * 3);
    private life = new Float32Array(96);
    private cursor = 0;
    private direction = new THREE.Vector3();
    private up = new THREE.Vector3(0, 1, 0);
    onHit?: () => void;
    onWarning?: () => void;
    private wasWarning = false;
    constructor(private scene: THREE.Scene, private readonly terrain:(x:number,z:number)=>number = ()=>0) {
        this.root.rotation.order = 'YXZ';
        this.root.name = 'mission-07-transport';
        this.root.scale.setScalar(transportTuning.scale);
        this.root.visible = false;
        scene.add(this.root);
        this.tracers.forEach(t => { t.visible = false; scene.add(t); });
        this.warning.visible = false;
        scene.add(this.warning);
        this.positions.fill(1e8);
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.particles.frustumCulled = false;
        scene.add(this.particles);
        this.ready = Promise.allSettled(['near', 'mid', 'far'].map(lod => new GLTFLoader().loadAsync(`/assets/models/enemies/giant-transport-${lod}.glb`))).then(results => {
            this.levels = results.flatMap(r => r.status === 'fulfilled' ? [r.value.scene] : []);
            for (const level of this.levels) {
                this.root.add(level);
                this.fans.push([0, 1, 2, 3].map(i => level.getObjectByName(`EngineFan_${i}`)!));
                this.guns.push({ yaw: level.getObjectByName('RearGunYaw')!, pitch: level.getObjectByName('RearGunPitch')! });
            }
            if (this.disposed || results.some(r => r.status === 'rejected')) {
                this.releaseModels();
                if (!this.disposed)
                    throw new Error('Transport LOD could not load');
                return;
            }
            this.levels.forEach((l, i) => l.visible = i === 0);
        });
    }
    get hasState(): boolean { return this.state !== undefined; }
    setState(state: TransportStateMessage) { if (this.disposed || this.final)
        return; if (!this.state)
        this.root.rotation.y = state.pose.yaw; this.state = state; this.receivedAt = performance.now(); this.position.set(state.pose.x, state.pose.y, state.pose.z); if (state.hitSequence > this.hitSequence) {
        this.hitSequence = state.hitSequence;
        if (state.hitPosition)
            this.emit(state.hitPosition, 8, 30, .35);
        this.onHit?.();
    } }
    finish(kind: 'defeat' | 'timeout') {
        if (this.final || this.disposed) return;
        this.final=kind; this.finalAt=this.elapsed;
        this.arrival?.dispose();this.arrival=undefined;this.arrivalResolve?.();this.arrivalResolve=undefined;
        this.tracers.forEach(t=>t.visible=false);this.warning.visible=false;
        if(kind==='defeat' && this.state && this.levels.length){
            this.levels.forEach((level,index)=>{level.visible=index===0;});
            this.root.visible=true;
            this.defeat=new TransportDefeatSequence(this.scene,this.root,this.state.pose.velocity,this.terrain);
            this.defeat.onImpact=()=>this.onCrashImpact?.();
        }else if(kind==='defeat'){this.defeatEnded=true;this.resolveDefeat();}
    }
    private emit(p: TransportPoint, count: number, speed: number, life: number, smoke = false) { for (let i = 0; i < count; i++) {
        const n = this.cursor++ % 96;
        this.positions[n * 3] = p.x;
        this.positions[n * 3 + 1] = p.y;
        this.positions[n * 3 + 2] = p.z;
        for (let a = 0; a < 3; a++)
            this.velocities[n * 3 + a] = (Math.random() - .5) * speed;
        this.life[n] = life;
        this.colors[n * 3] = smoke ? .36 : 1;
        this.colors[n * 3 + 1] = smoke ? .38 : .65;
        this.colors[n * 3 + 2] = smoke ? .4 : .2;
    } }
    update(delta: number, camera: THREE.Camera) {
        if (this.disposed)
            return;
        this.elapsed += delta;
        if(this.arrival){
            this.arrival.update(delta);this.position.copy(this.root.position);
            for(const fan of this.fans[0]??[])fan.rotation.z+=delta*8;
            if(this.arrival.complete){this.arrival.dispose();this.arrival=undefined;this.root.visible=false;this.arrivalResolve?.();this.arrivalResolve=undefined;}
            return;
        }
        if (this.final === 'timeout' && this.elapsed - this.finalAt > 2) {
            this.dispose();
            return;
        }
        if(this.defeat){
            this.defeat.update(delta);this.position.copy(this.root.position);
            if(this.defeat.complete){this.defeatEnded=true;this.resolveDefeat();this.dispose();return;}
        }
        const s = this.state;
        if (s && this.levels.length && !this.disposed && !this.defeat) {
            this.root.visible = !this.final || this.elapsed - this.finalAt < 2;
            const ahead = Math.min(.15, (performance.now() - this.receivedAt) / 1000);
            this.position.set(s.pose.x + s.pose.velocity.x * ahead, s.pose.y, s.pose.z + s.pose.velocity.z * ahead);
            this.root.position.copy(this.position);
            const turn = THREE.MathUtils.clamp(Math.atan2(Math.sin(s.pose.yaw - this.root.rotation.y), Math.cos(s.pose.yaw - this.root.rotation.y)), -delta * .8, delta * .8);
            this.root.rotation.y += turn;
            this.root.rotation.z = s.pose.roll;
            const distance = camera.position.distanceTo(this.position), lod = distance < 650 ? 0 : distance < 2200 ? 1 : 2;
            this.levels.forEach((l, i) => l.visible = i === lod);
            for (const fan of this.fans[lod]!)
                fan.rotation.z += delta * 8;
            this.guns[lod]!.yaw.rotation.y = s.gunYaw;
            this.guns[lod]!.pitch.rotation.x = -s.gunPitch;
            const warning = !this.final && s.warningUntil > s.serverNow;
            if (warning && !this.wasWarning)
                this.onWarning?.();
            this.wasWarning = warning;
            this.warning.visible = warning;
            this.root.updateMatrixWorld(true);
            this.levels[lod]!.getObjectByName('RearGunMuzzle')!.getWorldPosition(this.warning.position);
            this.warning.scale.setScalar(1 + Math.sin(this.elapsed * 16) * .2);
            this.tracers.forEach((t, i) => { const shot = s.shots[i]; t.visible = !!shot && !this.final; if (!shot)
                return; t.position.set(shot.position.x + shot.direction.x * shot.speed * ahead, shot.position.y + shot.direction.y * shot.speed * ahead, shot.position.z + shot.direction.z * shot.speed * ahead); this.direction.set(shot.direction.x, shot.direction.y, shot.direction.z); t.quaternion.setFromUnitVectors(this.up, this.direction); });
            if (!this.final && s.health < transportTuning.health * .6 && Math.random() < delta * (s.health < transportTuning.health * .25 ? 16 : 5)) {
                const socket = this.levels[lod]!.getObjectByName(`EngineSmoke_${Math.floor(Math.random() * 4)}`)!;
                const p = socket.getWorldPosition(new THREE.Vector3());
                this.emit(p, 1, 7, 1.2, true);
            }

        }
        for (let i = 0; i < 96; i++) {
            if (this.life[i]! <= 0)
                continue;
            this.life[i] -= delta;
            for (let a = 0; a < 3; a++)
                this.positions[i * 3 + a] += this.velocities[i * 3 + a]! * delta;
            this.velocities[i * 3 + 1] -= delta * 12;
            if (this.life[i]! <= 0)
                this.positions[i * 3 + 1] = 1e8;
        }
        this.particleGeometry.attributes.position!.needsUpdate = true;
        this.particleGeometry.attributes.color!.needsUpdate = true;
    }
    private releaseModels() { const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(); this.root.traverse(o => { if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            materials.add(m);
            const map = (m as THREE.MeshStandardMaterial).map;
            if (map)
                textures.add(map);
        }
    } }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => { t.dispose(); (t.image as ImageBitmap)?.close?.(); }); this.root.clear(); }
    dispose() { if (this.disposed)
        return; this.disposed = true; this.arrival?.dispose();this.arrival=undefined;this.arrivalResolve?.();this.arrivalResolve=undefined;
        this.defeat?.dispose(); this.defeatEnded=true; this.resolveDefeat(); this.scene.remove(this.root, this.warning, this.particles, ...this.tracers); this.releaseModels(); this.tracerGeometry.dispose(); this.tracerMaterial.dispose(); this.warningGeometry.dispose(); this.warningMaterial.dispose(); this.particleGeometry.dispose(); this.particleMaterial.dispose(); }
}
