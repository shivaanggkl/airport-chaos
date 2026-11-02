import * as THREE from 'three';
import { disposeOsmGroups } from './osm-city';
import { type PortalGate } from '../../shared/intercity-portals.mjs';
/** One reusable gateway and capped, camera-relative transit effect. No second renderer. */
export class IntercityVisuals {
    readonly gateway = new THREE.Group();
    readonly tunnel = new THREE.Group();
    readonly obstacles: Array<{
        x: number;
        z: number;
        halfX: number;
        halfZ: number;
        height: number;
        baseY: number;
    }> = [];
    private readonly energy: THREE.Mesh;
    private readonly sparks: THREE.Points;
    private readonly clouds: THREE.Sprite[] = [];
    private readonly towers:Array<{tower:THREE.Mesh;spine:THREE.Mesh;side:number}>=[];
    private readonly transitParticles: THREE.Points;
    private readonly cloudMaterial: THREE.SpriteMaterial;
    private readonly title = document.createElement('div');
    private readonly curtain = document.createElement('div');
    private readonly geometries = new Set<THREE.BufferGeometry>();
    private readonly materials = new Set<THREE.Material>();
    private readonly textures = new Set<THREE.Texture>();
    private elapsed = 0;
    private arrivalUntil = 0;
    private inTransit = false;
    private gate?: PortalGate;
    private opacity = 0;
    constructor(private readonly scene: THREE.Scene, root: HTMLElement) {
        const gold = new THREE.MeshStandardMaterial({ color: 0xffce4f, metalness: .72, roughness: .22, emissive: 0xb98010, emissiveIntensity: .35 });
        const white = new THREE.MeshBasicMaterial({ color: 0xfff7d0, toneMapped: false });
        const cyan = new THREE.MeshBasicMaterial({ color: 0x65ecff, transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
        this.materials.add(gold);
        this.materials.add(white);
        this.materials.add(cyan);
        const ring = (radius: number, tube: number, material: THREE.Material) => {
            const geometry = new THREE.TorusGeometry(radius, tube, 8, 96);
            this.geometries.add(geometry);
            const mesh = new THREE.Mesh(geometry, material);
            this.gateway.add(mesh);
            return mesh;
        };
        ring(184, 10, gold);
        ring(174, 2, white);
        this.energy = ring(191, 1.5, cyan);
        const towerGeometry = new THREE.CylinderGeometry(15, 28, 450, 6);
        this.geometries.add(towerGeometry);
        for (const x of [-240, 240]) {
            const tower = new THREE.Mesh(towerGeometry, gold);
            tower.position.set(x, 10, 0);
            this.gateway.add(tower);
            const spineGeometry = new THREE.BoxGeometry(3, 400, 3);
            this.geometries.add(spineGeometry);
            const spine = new THREE.Mesh(spineGeometry, white);
            spine.position.set(x, 10, 28);
            this.gateway.add(spine);this.towers.push({tower,spine,side:x});
        }
        const positions = new Float32Array(192 * 3);
        for (let i = 0; i < 192; i++) {
            const a = i / 192 * Math.PI * 2;
            positions[i * 3] = Math.cos(a) * 185;
            positions[i * 3 + 1] = Math.sin(a) * 185;
            positions[i * 3 + 2] = Math.sin(i * 9.4) * 9;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometries.add(geometry);
        const sparkMaterial = new THREE.PointsMaterial({ color: 0xffdf77, size: 4, transparent: true, opacity: .9, depthWrite: false, toneMapped: false });
        this.materials.add(sparkMaterial);
        this.sparks = new THREE.Points(geometry, sparkMaterial);
        this.gateway.add(this.sparks);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d')!;
        const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(90,115,145,.7)');
        gradient.addColorStop(.45, 'rgba(34,48,74,.58)');
        gradient.addColorStop(1, 'rgba(5,10,22,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        const texture = new THREE.CanvasTexture(canvas);
        this.textures.add(texture);
        this.cloudMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, color: 0x536785 });
        this.materials.add(this.cloudMaterial);
        for (let i = 0; i < 36; i++) {
            const cloud = new THREE.Sprite(this.cloudMaterial);
            const a = i * 2.399963;
            cloud.position.set(Math.cos(a) * (10 + i % 5 * 7), Math.sin(a) * (8 + i % 4 * 6), -15 - i * 9);
            cloud.scale.setScalar(50 + i % 5 * 15);
            this.tunnel.add(cloud);
            this.clouds.push(cloud);
        }
        const particles = new Float32Array(96 * 3), colors = new Float32Array(96 * 3);
        for (let i = 0; i < 96; i++) {
            const angle = i * 2.399963, radius = 12 + i % 11 * 3;
            particles[i * 3] = Math.cos(angle) * radius;
            particles[i * 3 + 1] = Math.sin(angle) * radius;
            particles[i * 3 + 2] = -i * 3;
            const color = new THREE.Color(i % 5 === 0 ? 0x62ddff : i % 3 === 0 ? 0xffffff : 0xffce51);
            color.toArray(colors, i * 3);
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particles, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometries.add(particleGeometry);
        const particleMaterial = new THREE.PointsMaterial({ size: .55, vertexColors: true, transparent: true, opacity: .65, depthWrite: false, toneMapped: false });
        this.materials.add(particleMaterial);
        this.transitParticles = new THREE.Points(particleGeometry, particleMaterial);
        this.tunnel.add(this.transitParticles);
        this.tunnel.visible = false;
        scene.add(this.gateway, this.tunnel);
        this.title.className = 'intercity-title';
        this.title.hidden = true;
        this.title.setAttribute('role', 'status');
        this.curtain.className = 'intercity-curtain';
        this.curtain.style.opacity = '0';
        root.append(this.curtain, this.title);
    }
    setGate(gate: PortalGate | undefined,terrain?:(x:number,z:number)=>number): void {
        this.gate = gate;
        this.gateway.visible = !this.inTransit && Boolean(gate);
        this.obstacles.length = 0;
        if (!gate)
            return;
        this.gateway.position.set(gate.x, gate.y, gate.z);
        this.gateway.rotation.y = gate.heading;
        for(const item of this.towers){
            const x=gate.x+Math.cos(gate.heading)*item.side,z=gate.z-Math.sin(gate.heading)*item.side;
            const ground=terrain?.(x,z)??gate.y-215;
            item.tower.position.y=ground+225-gate.y;item.spine.position.y=ground+225-gate.y;
            this.obstacles.push({x,z,halfX:30,halfZ:30,height:450,baseY:ground});
        }
    }
    setTransit(active: boolean, destination = ''): void {
        this.inTransit = active;
        this.tunnel.visible = active;
        this.gateway.visible = !active && Boolean(this.gate);
        this.title.hidden = !active;
        this.title.textContent = `FLYING TO ${destination.toUpperCase()}`;
    }
    showArrival(name: string): void { this.arrivalUntil=this.elapsed+2.4; this.title.textContent = name.toUpperCase(); this.title.hidden = false; }
    setDarkness(opacity: number): void { this.opacity = opacity; this.curtain.style.opacity = String(opacity); }
    update(delta: number, camera: THREE.Camera, position: THREE.Vector3, inTransit: boolean): void {
        this.elapsed += delta;
        this.sparks.rotation.z = this.elapsed * .13;
        this.energy.scale.setScalar(1 + Math.sin(this.elapsed * 2) * .012);
        if (inTransit) {
            this.tunnel.position.copy(camera.position);
            this.tunnel.quaternion.copy(camera.quaternion);
            for (const cloud of this.clouds) {
                cloud.position.z += delta * 100;
                if (cloud.position.z > 15)
                    cloud.position.z -= 330;
            }
            const positions = this.transitParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i < positions.count; i++) {
                let z = positions.getZ(i) + delta * 130;
                if (z > 10)
                    z -= 300;
                positions.setZ(i, z);
            }
            positions.needsUpdate = true;
            this.cloudMaterial.opacity = Math.max(0, Math.min(1, this.opacity * 2));
        }
        else if (this.elapsed < this.arrivalUntil) { this.title.hidden=false; }
        else if (this.gate) {
            const distance = Math.hypot(position.x - this.gate.x, position.z - this.gate.z);
            if (distance < 5000) {
                this.title.hidden = false;
                this.title.textContent = `ENTER ${this.gate.destination.toUpperCase()} · ${(distance / 1000).toFixed(1)} KM`;
            }
            else
                this.title.hidden = true;
        }
    }
    dispose(): void {
        this.gateway.removeFromParent();
        this.tunnel.removeFromParent();
        for (const item of this.geometries)
            item.dispose();
        for (const item of this.materials)
            item.dispose();
        for (const item of this.textures)
            item.dispose();
        this.title.remove();
        this.curtain.remove();
    }
}
/** Own only city scenery resources. Aircraft and persistent HUD resources are never traversed. */
export function disposeCityScene(scene: THREE.Scene): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
                materials.add(material);
        }
        if (object instanceof THREE.Sprite)
            materials.add(object.material);
    });
    for (const material of materials)
        for (const value of Object.values(material))
            if (value instanceof THREE.Texture)
                textures.add(value);
    for (const geometry of geometries)
        geometry.dispose();
    for (const material of materials)
        material.dispose();
    for (const texture of textures)
        texture.dispose();
    disposeOsmGroups(scene.children.filter((object): object is THREE.Group => object instanceof THREE.Group));
    scene.clear();
    scene.removeFromParent();
}
/** Upload and compile small batches under cloud cover, rather than stalling the arrival frame. */
export async function prepareCityGpu(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera, lighting: THREE.Scene, deadline: number, fog: THREE.Scene['fog'], signal:AbortSignal,extraRoots:readonly THREE.Object3D[]=[]): Promise<void> {
    const stage = new THREE.Scene();
    stage.fog = fog?.clone() ?? null;
    lighting.traverseVisible(object => { if (object instanceof THREE.Light)
        stage.add(object.clone()); });
    const meshes: THREE.Object3D[] = [];
    const roots:readonly THREE.Object3D[]=[world,...extraRoots];
    world.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
    for(const root of roots){root.updateWorldMatrix(true,true);root.traverse(object=>{
        if(!(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points||object instanceof THREE.Sprite)||!object.visible)return;
        for(let parent=object.parent;parent&&parent!==root;parent=parent.parent)if(!parent.visible)return;
        if(object.frustumCulled&&!frustum.intersectsObject(object))return;
        meshes.push(object);
    });}
    const previousTarget = renderer.getRenderTarget();
    try {
        for (let start = 0; start < meshes.length; start += 8) {
            if(signal.aborted)throw new DOMException('City preparation cancelled','AbortError');
            if (performance.now() > deadline)
                throw new Error('Destination GPU preparation timed out');
            const belongsToWorld = (object: THREE.Object3D) => { for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent)
                if (roots.includes(parent)&&parent.parent!==null)
                    return true; return false; };
            const batch = meshes.slice(start, start + 8).filter(belongsToWorld).map(object => {
                const proxy = object.clone(false);
                proxy.matrixAutoUpdate = false;
                proxy.matrix.copy(object.matrixWorld);
                proxy.frustumCulled = false;
                proxy.visible = true;
                if (proxy instanceof THREE.InstancedMesh && object instanceof THREE.InstancedMesh) {
                    proxy.instanceMatrix = object.instanceMatrix;
                    proxy.instanceColor = object.instanceColor;
                }
                stage.add(proxy);
                return { object, proxy };
            });
            try {
                await cityPreparationStep(renderer.compileAsync(stage,camera),signal,deadline-performance.now());
                // Streaming can retire a LOD while shaders compile. Never upload its disposed buffers again.
                for (const item of batch)
                    if (!belongsToWorld(item.object))
                        stage.remove(item.proxy);
                // Warm the exact display shader variant without changing a single visible pixel.
                // An offscreen target would compile a different tone-mapping/output variant.
                const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
                const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
                const materials=new Set<THREE.Material>();
                for(const item of batch){const object=item.proxy as THREE.Mesh;if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
                const masks=[...materials].map(material=>({material,color:material.colorWrite,depth:material.depthWrite,test:material.depthTest,stencil:material.stencilWrite}));
                try{
                    for(const {material} of masks){material.colorWrite=false;material.depthWrite=false;material.depthTest=false;material.stencilWrite=false;}
                    renderer.setRenderTarget(null);renderer.autoClear=false;renderer.setViewport(0,0,32,32);renderer.setScissorTest(false);
                    renderer.render(stage,camera);
                }finally{
                    for(const mask of masks){mask.material.colorWrite=mask.color;mask.material.depthWrite=mask.depth;mask.material.depthTest=mask.test;mask.material.stencilWrite=mask.stencil;}
                    renderer.autoClear=autoClear;renderer.resetState();renderer.setRenderTarget(previousTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
                }
            }
            finally {
                for (const item of batch)
                    stage.remove(item.proxy);
            }
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
    }
    finally {
        renderer.setRenderTarget(previousTarget);
        stage.clear();
    }
}

export async function cityPreparationStep<T>(work:Promise<T>,signal:AbortSignal,timeoutMs:number):Promise<T> {
    let timeout:ReturnType<typeof setTimeout>|undefined;
    let abort:()=>void=()=>{};
    try {
        if(signal.aborted)throw new DOMException('City preparation cancelled','AbortError');
        return await Promise.race([work,new Promise<never>((_,reject)=>{
            abort=()=>reject(new DOMException('City preparation cancelled','AbortError'));
            signal.addEventListener('abort',abort,{once:true});
            timeout=setTimeout(()=>reject(new Error('City preparation timed out')),Math.max(1,timeoutMs));
        })]);
    }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
