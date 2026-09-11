import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AircraftAssetType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';

type AssetKey =
  | AircraftAssetType
  | 'airportTerminal'
  | 'airportHangar'
  | 'airportTower'
  | 'landmarkA'
  | 'landmarkB'
  | 'landmarkC'
  | 'landmarkD'
  | 'landmarkE'
  | 'tree';

type SceneryAssetOptions = {
  position: THREE.Vector3Like;
  rotationY?: number;
  size: THREE.Vector3Like;
  maxDistance: number;
};

export type AssetInstance = {
  x: number;
  y: number;
  z: number;
  height: number;
  rotationY: number;
};

const urls: Record<AssetKey, string> = {
  trainer: '/assets/models/aircraft/trainer.glb',
  privateJet: '/assets/models/aircraft/private-jet.glb',
  cargo: '/assets/models/aircraft/cargo.glb',
  fighter: '/assets/models/aircraft/fighter.glb',
  airportTerminal: '/assets/models/airport/commercial/terminal.glb',
  airportHangar: '/assets/models/airport/industrial/hangar.glb',
  airportTower: '/assets/models/airport/commercial/control-tower.glb',
  landmarkA: '/assets/models/landmarks/building-skyscraper-a.glb',
  landmarkB: '/assets/models/landmarks/building-skyscraper-b.glb',
  landmarkC: '/assets/models/landmarks/building-skyscraper-c.glb',
  landmarkD: '/assets/models/landmarks/building-skyscraper-d.glb',
  landmarkE: '/assets/models/landmarks/building-skyscraper-e.glb',
  tree: '/assets/models/nature/tree.glb',
};

const loader = new GLTFLoader();
const cache = new Map<AssetKey, Promise<THREE.Group>>();
const aircraftAssetVersion = 'airport-chaos-original-v1';
const bounds = new THREE.Box3();
const size = new THREE.Vector3();
const center = new THREE.Vector3();
const instanceTransform = new THREE.Object3D();

function markSharedAsset(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.userData.sharedAsset = true;
  });
}

function loadAsset(key: AssetKey): Promise<THREE.Group> {
  const cached = cache.get(key);
  if (cached) return cached;
  const assetUrl = key === 'trainer' || key === 'privateJet' || key === 'cargo' || key === 'fighter'
    ? `${urls[key]}?v=${aircraftAssetVersion}`
    : urls[key];
  const request = loader.loadAsync(assetUrl).then((gltf) => {
    markSharedAsset(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  });
  cache.set(key, request);
  return request;
}

function normalizedClone(
  source: THREE.Group,
  target: THREE.Vector3Like,
  uniform: boolean,
  centerVertically: boolean,
): THREE.Group {
  const clone = source.clone(true);
  const root = new THREE.Group();
  root.add(clone);
  root.updateMatrixWorld(true);
  bounds.setFromObject(root).getSize(size);

  if (uniform) {
    const scale = Math.min(target.x / Math.max(size.x, 0.001), target.z / Math.max(size.z, 0.001));
    root.scale.setScalar(scale);
  } else {
    root.scale.set(
      target.x / Math.max(size.x, 0.001),
      target.y / Math.max(size.y, 0.001),
      target.z / Math.max(size.z, 0.001),
    );
  }

  root.updateMatrixWorld(true);
  bounds.setFromObject(root);
  bounds.getCenter(center);
  root.position.set(-center.x, centerVertically ? -center.y : -bounds.min.y, -center.z);
  markSharedAsset(root);
  return root;
}

export function preloadAircraftAssets(): void {
  for (const type of ['trainer', 'privateJet', 'cargo', 'fighter'] as const) {
    void loadAsset(type).catch(() => undefined);
  }
}

export function attachAircraftAsset(
  plane: THREE.Group,
  fallback: THREE.Object3D,
  type: AircraftAssetType,
  targetLength: number,
  targetSpan: number,
  onLoaded?: () => void,
): void {
  plane.userData.assetStatus = 'loading';
  void loadAsset(type)
    .then((source) => {
      const model = normalizedClone(source, { x: targetSpan, y: targetSpan, z: targetLength }, true, true);
      // Every original Airport Chaos airframe is authored nose-forward on -Z,
      // matching the shared flight, muzzle, exhaust and remote-render roots.
      model.rotation.y = 0;
      model.name = `aircraft-asset-${type}`;
      plane.add(model);
      const propellers: THREE.Object3D[] = [];
      model.traverse((object) => { if (object.name.startsWith('Propeller_') && !object.name.endsWith('_Blades')) propellers.push(object); });
      plane.userData.assetPropellers = propellers;
      fallback.visible = false;
      plane.userData.assetStatus = 'loaded';
      onLoaded?.();
    })
    .catch(() => {
      fallback.visible = true;
      plane.userData.assetStatus = 'fallback';
    });
}

export function addSceneryAsset(scene: THREE.Scene, key: AssetKey, options: SceneryAssetOptions): void {
  void loadAsset(key)
    .then((source) => {
      const model = normalizedClone(source, options.size, false, false);
      const lod = new THREE.LOD();
      lod.name = `detail-${key}`;
      lod.position.set(options.position.x, options.position.y, options.position.z);
      lod.rotation.y = options.rotationY ?? 0;
      lod.addLevel(model, 0);
      lod.addLevel(new THREE.Group(), options.maxDistance);
      scene.add(lod);
    })
    .catch(() => undefined);
}

export function replaceTreesWithInstancedAsset(
  scene: THREE.Scene,
  placements: ReadonlyArray<AssetInstance>,
  fallbacks: ReadonlyArray<THREE.Object3D>,
): void {
  void loadAsset('tree')
    .then((source) => {
      source.updateMatrixWorld(true);
      bounds.setFromObject(source);
      bounds.getCenter(center);
      const sourceHeight = Math.max(bounds.max.y - bounds.min.y, 0.001);
      const detailGroup = new THREE.Group();
      detailGroup.name = 'instanced-tree-assets';

      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        const instances = new THREE.InstancedMesh(geometry, object.material, placements.length);
        instances.castShadow = false;
        instances.receiveShadow = false;
        instances.userData.sharedAsset = true;
        placements.forEach((placement, index) => {
          const scale = placement.height / sourceHeight;
          instanceTransform.position.set(placement.x, placement.y, placement.z);
          instanceTransform.rotation.set(0, placement.rotationY, 0);
          instanceTransform.scale.setScalar(scale);
          instanceTransform.updateMatrix();
          instances.setMatrixAt(index, instanceTransform.matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        detailGroup.add(instances);
      });

      if (detailGroup.children.length === 0) return;
      scene.add(detailGroup);
      for (const fallback of fallbacks) fallback.visible = false;
    })
    .catch(() => undefined);
}
