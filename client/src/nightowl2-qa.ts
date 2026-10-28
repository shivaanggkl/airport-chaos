import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

if (!import.meta.env.DEV) throw new Error('Nightowl2 visual QA is only available in development.');

type Pane = {
  host: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model?: THREE.Group;
  loadMs?: number;
};

const loader = new GLTFLoader();
const status = document.querySelector<HTMLElement>('#status')!;
const panes: Pane[] = ['current-view', 'candidate-view'].map(id => {
  const host = document.querySelector<HTMLElement>(`#${id}`)!;
  const renderer = new THREE.WebGLRenderer({ canvas: host.querySelector('canvas')!, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102139);
  scene.add(new THREE.HemisphereLight(0xd7eaff, 0x455b74, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 3.3); key.position.set(-8, 14, -10); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9e3ff, 2.1); rim.position.set(8, 6, 10); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  return { host, renderer, scene, camera };
});

const variants = [
  { name: 'SKY BLUE · DEFAULT', primary: 0x215eac, accent: 0x14365d },
  { name: 'SUNSET RED', primary: 0xb92832, accent: 0x5c2027 },
  { name: 'FOREST GREEN', primary: 0x24805c, accent: 0x153e35 },
  { name: 'PREMIUM GOLD', primary: 0xb5892f, accent: 0x493a1a },
] as const;

let variantIndex = 0;
let yaw = 0.83;
let pitch = 0.22;
let zoom = 1;
let needsRender = true;
const pointers = new Map<number, { x: number; y: number }>();
let pinchDistance = 0;

function normalizedModel(source: THREE.Group): THREE.Group {
  const model = source.clone(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(22 / Math.max(size.x, size.z));
  return root;
}

function applyVariant(root: THREE.Group): void {
  const variant = variants[variantIndex];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const paint of materials) {
      if (!(paint instanceof THREE.MeshStandardMaterial)) continue;
      if (paint.name === 'N2_PAINT_PRIMARY') paint.color.setHex(variant.primary);
      if (paint.name === 'N2_PAINT_ACCENT') paint.color.setHex(variant.accent);
    }
  });
  needsRender = true;
}

function render(): void {
  if (!needsRender) return;
  needsRender = false;
  for (const pane of panes) {
    const width = Math.max(1, pane.host.clientWidth);
    const height = Math.max(1, pane.host.clientHeight);
    pane.renderer.setSize(width, height, false);
    pane.camera.aspect = width / height;
    pane.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * 29 * zoom,
      Math.sin(pitch) * 29 * zoom, -Math.cos(yaw) * Math.cos(pitch) * 29 * zoom);
    pane.camera.lookAt(0, 0, 0);
    pane.camera.updateProjectionMatrix();
    pane.renderer.render(pane.scene, pane.camera);
  }
}

function animate(): void {
  render();
  requestAnimationFrame(animate);
}

function viewButton(label: string, targetYaw: number, targetPitch: number): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  button.addEventListener('click', () => {
    yaw = targetYaw; pitch = targetPitch; zoom = 1; needsRender = true;
    for (const peer of document.querySelectorAll<HTMLButtonElement>('#camera-views button')) {
      peer.setAttribute('aria-pressed', String(peer === button));
    }
  });
  document.querySelector('#camera-views')!.append(button);
  return button;
}

viewButton('FRONT ¾', 0.83, 0.22).setAttribute('aria-pressed', 'true');
viewButton('SIDE', Math.PI / 2, 0);
viewButton('FRONT', 0, 0);
viewButton('REAR', Math.PI, 0);
viewButton('TOP', 0, Math.PI / 2 - 0.02);
viewButton('REAR ¾', Math.PI * 0.76, 0.22);

for (const [index, variant] of variants.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = variant.name;
  button.setAttribute('aria-pressed', String(index === 0));
  button.addEventListener('click', () => {
    variantIndex = index;
    const candidate = panes[1].model;
    if (candidate) applyVariant(candidate);
    for (const peer of document.querySelectorAll<HTMLButtonElement>('#paint-views button')) {
      peer.setAttribute('aria-pressed', String(peer === button));
    }
  });
  document.querySelector('#paint-views')!.append(button);
}

for (const pane of panes) {
  pane.host.addEventListener('pointerdown', event => {
    pane.host.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  pane.host.addEventListener('pointermove', event => {
    const prior = pointers.get(event.pointerId);
    if (!prior) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      yaw += (event.clientX - prior.x) * 0.008;
      pitch = THREE.MathUtils.clamp(pitch + (event.clientY - prior.y) * 0.006, -1.4, 1.55);
      needsRender = true;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0) zoom = THREE.MathUtils.clamp(zoom * pinchDistance / nextDistance, 0.6, 1.9);
      pinchDistance = nextDistance;
      needsRender = true;
    }
  });
  const endPointer = (event: PointerEvent) => { pointers.delete(event.pointerId); pinchDistance = 0; };
  pane.host.addEventListener('pointerup', endPointer);
  pane.host.addEventListener('pointercancel', endPointer);
  pane.host.addEventListener('wheel', event => {
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * (event.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.9);
    needsRender = true;
  }, { passive: false });
}
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') yaw -= 0.12;
  else if (event.key === 'ArrowRight') yaw += 0.12;
  else if (event.key === 'ArrowUp') pitch = Math.min(1.55, pitch + 0.12);
  else if (event.key === 'ArrowDown') pitch = Math.max(-1.4, pitch - 0.12);
  else return;
  needsRender = true;
});
new ResizeObserver(() => { needsRender = true; }).observe(document.body);
animate();

void Promise.all([
  loader.loadAsync('/qa-assets/nightowl-backup1.glb'),
  loader.loadAsync('/assets/models/aircraft/private-jet.glb'),
].map(async (request, index) => {
  const started = performance.now();
  const loaded = await request;
  const model = normalizedModel(loaded.scene);
  panes[index].model = model;
  panes[index].loadMs = performance.now() - started;
  panes[index].scene.add(model);
  if (index === 1) applyVariant(model);
  needsRender = true;
})).then(() => {
  render();
  const candidate = panes[1];
  status.textContent = `Actual Three.js GLBs loaded · NIGHTOWL2 ${Math.round(candidate.loadMs ?? 0)} ms · ${candidate.renderer.info.render.triangles.toLocaleString()} rendered triangles · ${candidate.renderer.info.render.calls} draw calls`;
}).catch(error => {
  status.textContent = `MODEL LOAD FAILED: ${error instanceof Error ? error.message : String(error)}`;
  status.style.color = '#ff6d6d';
});
