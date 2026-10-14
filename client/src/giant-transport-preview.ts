/** Development-only asset review. No imports from mission or authoritative systems. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTimeVisuals } from './time-visuals';
import { attachAircraftAsset } from './assets';
import { aircraftDefinitions } from './aircraft';
if (!import.meta.env.DEV)
    throw new Error('Asset preview is development-only');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = false;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 1000);
const hemisphere = new THREE.HemisphereLight(0xd4efff, 0x587443, 2.78), sun = new THREE.DirectionalLight(0xffd39a, 3.72);
scene.add(hemisphere, sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x40564c, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -5.2;
scene.add(floor);
// Scale is strictly a preview transform, independent of aircraft mechanics.
const previewScale = 1;
const transport = new THREE.Group();
transport.scale.setScalar(previewScale);
scene.add(transport);
const loader = new GLTFLoader();
const models = await Promise.all(['near', 'mid', 'far'].map(lod => loader.loadAsync(`/assets/models/enemies/${new URLSearchParams(location.search).get('revision') === 'before' ? 'before/' : ''}giant-transport-${lod}.glb`)));
// All LODs use the same four materials and one panel texture.
const sharedMaterials = new Map<string, THREE.Material>();
const discarded = new Set<THREE.Material>();
const discardedTextures = new Set<THREE.Texture>();
for (const model of models)
    model.scene.traverse(o => { if (o instanceof THREE.Mesh) {
        const original = Array.isArray(o.material) ? o.material : [o.material];
        const mapped = original.map(m => { const existing = sharedMaterials.get(m.name); if (existing && existing !== m) {
            discarded.add(m);
            const texture = (m as THREE.MeshStandardMaterial).map;
            if (texture)
                discardedTextures.add(texture);
            return existing;
        } sharedMaterials.set(m.name, m); return m; });
        o.material = Array.isArray(o.material) ? mapped : mapped[0];
    } });
for (const texture of discardedTextures) {
    texture.dispose();
    (texture.image as ImageBitmap)?.close?.();
}
for (const material of discarded)
    material.dispose();
const levels = models.map(m => m.scene);
for (const [i, m] of levels.entries()) {
    m.visible = i === 0;
    transport.add(m);
}
const bluejay = new THREE.Group(), fallback = new THREE.Group();
bluejay.add(fallback);
scene.add(bluejay);
const trainer = aircraftDefinitions.trainer;
await attachAircraftAsset(bluejay, fallback, 'trainer', trainer.bodyLength + trainer.noseLength, trainer.wingSpan);
bluejay.position.set(-13, 0, 39);
bluejay.visible = false;
const target = new THREE.Vector3(0, 2, 0), viewOffset = new THREE.Vector3(), followTarget = new THREE.Vector3();
let motion = false, start = performance.now(), level = 0, currentView = 'three-quarter';
const frames: number[] = [], cpu: number[] = [], gpu: number[] = [];
const gl = renderer.getContext() as WebGL2RenderingContext, timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const queries: WebGLQuery[] = [];
function fitReferenceFrame() {
    if (currentView === 'chase') return;
    const v = new THREE.Vector3();
    for (let iteration = 0; iteration < 7; iteration++) {
        camera.updateMatrixWorld(); transport.updateMatrixWorld(true);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        levels[level].traverse(object => { if (object instanceof THREE.Mesh) {
            const positions = object.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                v.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
                minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
            }
        } });
        const factor = THREE.MathUtils.clamp(Math.max((maxX - minX) / 1.82, (maxY - minY) / 1.72), .75, 1.3);
        camera.position.sub(target).multiplyScalar(factor).add(target); camera.lookAt(target);
        if (Math.abs(factor - 1) < .005) break;
    }
}
function view(name: string) { currentView = name; transport.position.set(0, 0, 0); transport.rotation.set(0, 0, 0); bluejay.visible = name === 'chase'; const poses: Record<string, number[]> = { front: [0, 3, -53], side: [48, 3, 0], rear: [0, 4, 54], top: [0, 78, .01], 'three-quarter': [28, 8, -48], chase: [-18, 17, 82] }; const p = poses[name] ?? poses['three-quarter']; camera.position.set(p[0], p[1], p[2]); camera.up.set(0, 1, 0); camera.lookAt(target); fitReferenceFrame(); viewOffset.copy(camera.position); }
function preset(time: string) { if (time === 'neutral') {
    scene.background = new THREE.Color(0x293442);
    hemisphere.color.set(0xffffff);
    hemisphere.groundColor.set(0x59616a);
    hemisphere.intensity = 1.6;
    sun.color.set(0xffffff);
    sun.intensity = 2.6;
    sun.position.set(-30, 45, -40);
    renderer.toneMappingExposure = 1;
    floor.material.color.set(0x323b43);
}
else {
    const v = createTimeVisuals(true)[time as 'day' | 'dusk' | 'evening'];
    scene.background = new THREE.Color(v.background);
    hemisphere.color.set(v.ambientSky);
    hemisphere.groundColor.set(v.ambientGround);
    hemisphere.intensity = v.ambientIntensity;
    sun.color.set(v.sunColor);
    sun.intensity = v.sunIntensity;
    sun.position.set(v.sunPosition[0], v.sunPosition[1], v.sunPosition[2]);
    renderer.toneMappingExposure = time === 'evening' ? .82 : 1.23;
    floor.material.color.set(0x40564c);
} renderer.render(scene, camera); }
function lod(i: number) { level = i; levels.forEach((m, j) => m.visible = j === i); }
function inspect() { const box = new THREE.Box3().setFromObject(levels[0]), size = box.getSize(new THREE.Vector3()); const result: {
    triangles: number;
    meshes: number;
    materials: string[];
    textures: number[];
}[] = []; for (const m of levels) {
    let triangles = 0, meshes = 0;
    const materials = new Set<string>(), textures = new Set<number>();
    m.traverse(o => { if (o instanceof THREE.Mesh) {
        meshes++;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
            materials.add(mat.name);
            const tex = (mat as THREE.MeshStandardMaterial).map;
            if (tex)
                textures.add(tex.image.width);
        }
    } });
    result.push({ triangles, meshes, materials: [...materials], textures: [...textures] });
} return { dimensions: size.toArray(), bounds: { min: box.min.toArray(), max: box.max.toArray() }, previewScale, bluejaySpan: trainer.wingSpan, levels: result }; }
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))
    button.onclick = () => view(button.dataset.view!);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-time]'))
    button.onclick = () => preset(button.dataset.time!);
document.querySelector<HTMLButtonElement>('#motion')!.onclick = () => { motion = !motion; start = performance.now(); };
document.querySelector<HTMLButtonElement>('#lod')!.onclick = () => lod((level + 1) % 3);
const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
window.addEventListener('resize', resize);
let disposed = false;
let last = performance.now();
function frame(now: number) {
    if (disposed)
        return;
    const dt = Math.min((now - last) / 1000, .1);
    frames.push(now - last);
    if (frames.length > 1200)
        frames.shift();
    last = now;
    for (const m of levels) {
        for (let i = 0; i < 4; i++) {
            const fan = m.getObjectByName(`EngineFan_${i}`);
            if (fan)
                fan.rotation.z += dt * 6;
        }
        const yaw = m.getObjectByName('RearGunYaw'), pitch = m.getObjectByName('RearGunPitch');
        if (yaw)
            yaw.rotation.y = Math.sin((now - start) / 1500) * .25;
        if (pitch)
            pitch.rotation.x = Math.sin((now - start) / 2200) * .15;
    }
    if (motion) {
        const t = (now - start) / 1000;
        transport.rotation.y = Math.sin(t * .25) * .6;
        transport.rotation.z = Math.sin(t * .25) * .14;
        transport.position.x += -Math.sin(transport.rotation.y) * 4 * dt;
        transport.position.y = Math.sin(t * .3) * .6;
        transport.position.z += -Math.cos(transport.rotation.y) * 4 * dt;
        camera.position.copy(viewOffset).add(transport.position);
        followTarget.copy(target).add(transport.position);
        camera.lookAt(followTarget);
    }
    while (timer && queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = queries.shift()!;
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
            gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            if (gpu.length > 1200)
                gpu.shift();
        }
        gl.deleteQuery(q);
    }
    const q = timer && queries.length < 4 ? gl.createQuery() : null;
    if (q)
        gl.beginQuery(timer!.TIME_ELAPSED_EXT, q);
    const begin = performance.now();
    renderer.render(scene, camera);
    if (q) {
        gl.endQuery(timer!.TIME_ELAPSED_EXT);
        queries.push(q);
    }
    cpu.push(performance.now() - begin);
    if (cpu.length > 1200)
        cpu.shift();
    requestAnimationFrame(frame);
}
function dispose() { disposed = true; window.removeEventListener('resize', resize); for (const q of queries)
    gl.deleteQuery(q); queries.length = 0; const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(); scene.traverse(o => { if (o instanceof THREE.Mesh) {
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        const tex = (m as THREE.MeshStandardMaterial).map;
        if (tex)
            textures.add(tex);
    }
} }); for (const g of geometries)
    g.dispose(); for (const m of materials)
    m.dispose(); for (const t of textures)
    t.dispose(); renderer.dispose(); return { geometries: geometries.size, materials: materials.size, textures: textures.size }; }
Object.assign(window, { transportQA: { view, preset, lod, inspect, cameraPose: () => ({ position: camera.position.toArray(), fov: camera.fov }), setCameraPose: (pose: {position:number[];fov:number}) => {camera.position.fromArray(pose.position);camera.fov=pose.fov;camera.lookAt(target);camera.updateProjectionMatrix();viewOffset.copy(camera.position);}, closeup: (name: string) => { bluejay.visible = false; const poses: Record<string, number[][]> = { engine: [[17, 2.2, -15], [12.75, .15, -5.5]], nose: [[7, 6, -24], [0, 3.5, -17.5]], gun: [[3, 6.5, 24], [0, 4.7, 18.6]], 'wing-root': [[12, 8, -10], [3.6, 3.8, -1]] }; const p = poses[name]; camera.position.set(...p[0] as [
            number,
            number,
            number
        ]); camera.lookAt(...p[1] as [
            number,
            number,
            number
        ]); }, showTransport: (v: boolean) => transport.visible = v, setMotion: (v: boolean) => { motion = v; start = performance.now(); }, stats: () => ({ frames: [...frames], cpu: [...cpu], gpu: [...gpu], gpuTimerAvailable: Boolean(timer), render: renderer.info.render, memory: renderer.info.memory, view: currentView }), resetStats: () => { frames.length = 0; cpu.length = 0; gpu.length = 0; }, dispose } });
view('three-quarter');
preset('neutral');
document.querySelector('output')!.textContent = 'DEVELOPMENT ASSET PREVIEW · No mission integration';
requestAnimationFrame(frame);
