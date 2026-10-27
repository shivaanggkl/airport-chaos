import { TransportArrivalSequence } from './transport-arrival.ts';
import * as THREE from 'three';
import { TransportDefeatSequence } from './transport-defeat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { transportTuning, type TransportStateMessage, type TransportPoint } from '../../shared/giant-incoming.mjs';
import { journeyDallas11 } from '../../shared/journey-mission.mjs';
export type { TransportStateMessage } from '../../shared/giant-incoming.mjs';
function roundedBayShape(width: number, height: number): THREE.Shape {
    const half = width / 2, radius = .45;
    const s = new THREE.Shape();
    s.moveTo(-half, 0); s.lineTo(half, 0); s.lineTo(half, height-radius);
    s.quadraticCurveTo(half, height, half-radius, height);
    s.lineTo(-half+radius, height); s.quadraticCurveTo(-half, height, -half, height-radius);
    s.closePath(); return s;
}
function fortressBay(level: THREE.Group) {
    const {hatch}=journeyDallas11;
    const bay = new THREE.Group(); bay.position.set(0,hatch.bottom,hatch.z); level.add(bay);
    const dark = new THREE.MeshStandardMaterial({ color: 0x10191d, metalness: .72, roughness: .55, side: THREE.DoubleSide });
    const rim = new THREE.MeshStandardMaterial({ color: 0x596a6d, metalness: .72, roughness: .43, side: THREE.DoubleSide });
    const steel = new THREE.MeshStandardMaterial({ color: 0x343d3f, metalness: .8, roughness: .5, side: THREE.DoubleSide });
    const orange = new THREE.MeshStandardMaterial({ color: 0xb56220, emissive: 0x7d2805, emissiveIntensity: .35, metalness: .5, roughness: .48 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x:number,y:number,z:number,parent:THREE.Object3D=bay) => {
        const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    // Two nested curved panels sit against the existing rear fuselage, keeping the bay recessed.
    add(new THREE.ShapeGeometry(roundedBayShape(hatch.width,hatch.height)),rim,0,0,0);
    const interior=add(new THREE.ShapeGeometry(roundedBayShape(3.55,3.05)),dark,0,.15,.04);
    for(const x of [-1.52,1.52]){
        add(new THREE.BoxGeometry(.12,2.8,.2),steel,x,1.6,.12);
        add(new THREE.BoxGeometry(.16,.16,1.55),rim,x,.2,.8).rotation.x=-.1;
    }
    for(const y of [.7,1.35,2,2.65]) add(new THREE.BoxGeometry(3.05,.1,.14),steel,0,y,.11);
    // Exposed machinery is compact and readable without a glowing disk or new texture.
    const machine=new THREE.Group();machine.position.set(0,journeyDallas11.coreLocal.y-hatch.bottom,.18);bay.add(machine);
    add(new THREE.BoxGeometry(1.65,1.4,.35),steel,0,0,0,machine);
    for(const x of [-.48,0,.48])for(const y of [-.38,0,.38])add(new THREE.BoxGeometry(.2,.22,.08),orange,x,y,.23,machine);
    for(const x of [-.95,.95])add(new THREE.CylinderGeometry(.18,.18,1.15,8),rim,x,0,.05,machine).rotation.z=Math.PI/2;
    const door=new THREE.Group();door.position.set(0,0,.12);bay.add(door);
    add(new THREE.ShapeGeometry(roundedBayShape(3.7,3.2)),steel,0,0,0,door);
    for(const x of [-1.25,-.63,0,.63,1.25]) add(new THREE.BoxGeometry(.07,2.7,.07),rim,x,1.55,.06,door);
    for(const y of [.7,1.4,2.1,2.75]) add(new THREE.BoxGeometry(3.25,.08,.08),rim,0,y,.07,door);
    const arms:THREE.Object3D[]=[];
    for(const x of [-1.7,1.7]){
        const arm=add(new THREE.CylinderGeometry(.055,.055,3.2,6),rim,x,-.75,1.2);
        arm.rotation.x=.85;arms.push(arm);
    }
    arms.forEach(a=>a.visible=false); interior.visible=false; machine.visible=false;
    return {bay,door,interior,machine,arms};
}
/** Attempt-owned view: no targets or resources are registered in Free Fly. */
export class GiantIncomingView {
    readonly root = new THREE.Group();
    readonly ready: Promise<void>;
    readonly position = new THREE.Vector3();
    readonly fortressTargetPosition = new THREE.Vector3();
    private readonly fortressTargetScratch = new THREE.Vector3();
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
    beginArrival(escorts: readonly THREE.Group[] = [], missionName?: string):Promise<void>{
        this.levels.forEach((level,index)=>{level.visible=index===0;});
        this.arrival=new TransportArrivalSequence(this.root,this.terrain,this.scene,escorts,missionName);
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
    private sideGuns: { yaw: THREE.Object3D; pitch: THREE.Object3D; muzzle: THREE.Object3D }[][] = [];
    private fortressBays: ReturnType<typeof fortressBay>[] = [];
    private fortressMarkers: THREE.Mesh[][] = [];
    private hatchOpen = 0;
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
    constructor(private scene: THREE.Scene, private readonly terrain:(x:number,z:number)=>number = ()=>0,
        private readonly crossfire = false, private readonly fortress = false) {
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
                if (this.crossfire) {
                    const original = level.getObjectByName('RearGunYaw')!;
                    this.sideGuns.push(([-1, 1] as const).map(side => {
                        const yaw = original.clone(true);
                        yaw.name = side < 0 ? 'LeftGunYaw' : 'RightGunYaw';
                        yaw.position.set(side * 11, 4.699999809265137, 0);
                        yaw.rotation.y = side * Math.PI / 2;
                        level.add(yaw);
                        return { yaw, pitch: yaw.getObjectByName('RearGunPitch')!, muzzle: yaw.getObjectByName('RearGunMuzzle')! };
                    }));
                }
                if (this.fortress) {
                    level.getObjectByName('RearGunYaw')!.visible=false;
                    this.fortressBays.push(fortressBay(level));
                    const markers = ([-1,1] as const).map(side=>{
                        const marker=new THREE.Mesh(new THREE.RingGeometry(2.1,2.35,24),new THREE.MeshBasicMaterial({color:0xff4545,side:THREE.DoubleSide,transparent:true,opacity:.85,depthTest:false}));
                        marker.position.set(side*11,4.7,2.4);level.add(marker);return marker;
                    });
                    this.fortressMarkers.push(markers);
                }
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
    targetedFortressSide(player:THREE.Vector3,heading:number):'left'|'right'{
        if(!this.fortress || !this.state?.fortress)return 'left';
        const health=this.state.fortress;
        if(health.leftHealth<=0)return 'right';if(health.rightHealth<=0)return 'left';
        const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading));
        let best:'left'|'right'='left',score=-Infinity;
        for(const [side,x] of [['left',-11],['right',11]] as const){
            this.fortressTargetScratch.set(x,4.7,0);this.root.localToWorld(this.fortressTargetScratch);
            this.fortressTargetScratch.sub(player).normalize();
            const dot=this.fortressTargetScratch.dot(forward);if(dot>score){score=dot;best=side;}
        }
        return best;
    }
    updateFortressTarget(player:THREE.Vector3,heading:number):'left'|'right'|'core'{
        const phase=this.state?.fortress;
        const side=phase?.leftHealth===0 && phase.rightHealth===0?'core':this.targetedFortressSide(player,heading);
        this.fortressTargetPosition.set(side==='left'?-11:side==='right'?11:journeyDallas11.coreLocal.x,
            side==='core'?journeyDallas11.coreLocal.y:4.7,side==='core'?journeyDallas11.coreLocal.z:0);
        this.root.localToWorld(this.fortressTargetPosition);
        return side;
    }
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
            if(this.fortress && s.fortress){
                const exposed=s.fortress.phase === 'CORE' || s.fortress.phase == null && s.fortress.leftHealth===0 && s.fortress.rightHealth===0;
                this.hatchOpen=THREE.MathUtils.damp(this.hatchOpen,exposed?1:0,3,delta);
                const bay=this.fortressBays[lod]!;
                bay.door.rotation.x=this.hatchOpen*2.05;
                bay.interior.visible=bay.machine.visible=this.hatchOpen>.1;
                bay.arms.forEach(arm=>arm.visible=this.hatchOpen>.55);
                this.fortressMarkers[lod]![0]!.visible=s.fortress.phase!=='ESCORTS' && s.fortress.leftHealth>0;
                this.fortressMarkers[lod]![1]!.visible=s.fortress.phase!=='ESCORTS' && s.fortress.rightHealth>0;
                this.sideGuns[lod]![0]!.yaw.visible=s.fortress.leftHealth>0;
                this.sideGuns[lod]![1]!.yaw.visible=s.fortress.rightHealth>0;
            }
            for (const fan of this.fans[lod]!)
                fan.rotation.z += delta * 8;
            this.guns[lod]!.yaw.rotation.y = s.crossfireGuns?.[0]?.yaw ?? s.gunYaw;
            this.guns[lod]!.pitch.rotation.x = -(s.crossfireGuns?.[0]?.pitch ?? s.gunPitch);
            for (let side = 0; side < (this.sideGuns[lod]?.length ?? 0); side++) {
                const gun = this.sideGuns[lod]![side]!, state = s.crossfireGuns?.[side + 1];
                gun.yaw.rotation.y = (side === 0 ? -1 : 1) * Math.PI / 2 + (state?.yaw ?? 0);
                gun.pitch.rotation.x = -(state?.pitch ?? 0);
            }
            const warningGun = s.activeGun ?? 0;
            const warning = !this.final && (s.crossfireGuns?.[warningGun]?.warningUntil ?? s.warningUntil) > s.serverNow;
            if (warning && !this.wasWarning)
                this.onWarning?.();
            this.wasWarning = warning;
            this.warning.visible = warning;
            this.root.updateMatrixWorld(true);
            (warningGun ? this.sideGuns[lod]?.[warningGun - 1]?.muzzle : this.levels[lod]!.getObjectByName('RearGunMuzzle'))?.getWorldPosition(this.warning.position);
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
