/** Local visual fixture only: never a mission, combat target, or pursuit simulation. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function createGiantTransportDallasPreview(scene: THREE.Scene) {
  const models = await Promise.all(['near', 'mid', 'far'].map(lod => new GLTFLoader().loadAsync(`/assets/models/enemies/giant-transport-${lod}.glb`)));
  const materialsByName = new Map<string, THREE.Material>();
  for (const model of models) model.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const mapped = original.map(material => {
      const shared = materialsByName.get(material.name);
      if (!shared) { materialsByName.set(material.name, material); return material; }
      if (shared !== material) { const map = (material as THREE.MeshStandardMaterial).map; map?.dispose(); (map?.image as ImageBitmap)?.close?.(); material.dispose(); }
      return shared;
    });
    object.material = Array.isArray(object.material) ? mapped : mapped[0];
  });
  const levels = models.map(model => model.scene);
  const root = new THREE.Group();
  root.name = 'development-transport-visual-fixture';
  root.scale.setScalar(1);
  root.visible = false;
  for (const level of levels) root.add(level);
  const transportLocalCenter = new THREE.Box3().setFromObject(levels[0]).getCenter(new THREE.Vector3());
  const playerLocalCenter = new THREE.Vector3(), playerCenter = new THREE.Vector3(), transportCenter = new THREE.Vector3(), offset = new THREE.Vector3(), forward = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  scene.add(root);
  const fans = levels.map(level => [0, 1, 2, 3].map(i => level.getObjectByName(`EngineFan_${i}`)!));
  const guns = levels.map(level => ({ yaw: level.getObjectByName('RearGunYaw')!, pitch: level.getObjectByName('RearGunPitch')! }));
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;bottom:max(56px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);color:#fff;background:#08213bcc;padding:5px 9px;font:12px system-ui;pointer-events:none;z-index:10000;white-space:nowrap';
  document.body.append(label);
  let elapsed = 0, disposed = false, distance = 95, selectedLod = 0, playerInitialized = false, yawAngle = 0;
  let activeCamera: THREE.PerspectiveCamera | undefined;
  const selectDistance = (value: number) => {
    if (![95, 190, 380].includes(value)) return;
    distance = value; selectedLod = value < 150 ? 0 : value < 300 ? 1 : 2;
    levels.forEach((level, i) => level.visible = i === selectedLod);
    label.textContent = `VISUAL FIXTURE · ${distance} center units · ${['Near', 'Mid', 'Far'][selectedLod]} · fixed separation, no pursuit/combat`;
  };
  selectDistance(95);
  const fixture = {
    update(delta: number, player: THREE.Object3D, active: boolean, camera: THREE.PerspectiveCamera) {
      activeCamera = camera;
      if (disposed) return;
      root.visible = active; label.hidden = !active;
      if (!active) return;
      player.updateWorldMatrix(true, false);
      if (!playerInitialized) {
        inverse.copy(player.matrixWorld).invert();
        new THREE.Box3().setFromObject(player).getCenter(playerLocalCenter).applyMatrix4(inverse);
        forward.set(0, 0, -1).applyQuaternion(player.quaternion);
        yawAngle = Math.atan2(-forward.x, -forward.z);
        playerInitialized = true;
      }
      elapsed += delta;
      playerCenter.copy(playerLocalCenter).applyMatrix4(player.matrixWorld);
      forward.set(0, 0, -1).applyQuaternion(player.quaternion); forward.y = 0; forward.normalize();
      const desiredYaw = Math.atan2(-forward.x, -forward.z) + Math.sin(elapsed * .18) * .20;
      const difference = Math.atan2(Math.sin(desiredYaw - yawAngle), Math.cos(desiredYaw - yawAngle));
      yawAngle += THREE.MathUtils.clamp(difference, -delta * .15, delta * .15);
      root.rotation.set(0, yawAngle, Math.sin(elapsed * .3) * .06, 'YXZ');
      // Center means each aircraft's local static mesh bounds center, transformed into world space.
      // The 5-unit vertical separation is included in the documented total, not added to it.
      transportCenter.copy(playerCenter).addScaledVector(forward, Math.sqrt(distance * distance - 25)); transportCenter.y += 5;
      offset.copy(transportLocalCenter).multiply(root.scale).applyQuaternion(root.quaternion);
      root.position.copy(transportCenter).sub(offset);
      for (const fan of fans[selectedLod]) fan.rotation.z += delta * 5;
      guns[selectedLod].yaw.rotation.y = Math.sin(elapsed * .5) * .2;
      guns[selectedLod].pitch.rotation.x = Math.sin(elapsed * .35) * .1;
    },
    inspect: () => ({ scale: root.scale.x, targetCenterSeparation: distance, measuredCenterSeparation: transportCenter.distanceTo(playerCenter), centerConvention: 'transformed local static mesh bounds centers', playerCenter: playerCenter.toArray(), transportCenter: transportCenter.toArray(), position: root.position.toArray(), visible: root.visible, lod: ['near', 'mid', 'far'][selectedLod], camera: { kind: 'unchanged gameplay chase camera', position: activeCamera?.position.toArray(), fov: activeCamera?.fov } }),
    setDistance: selectDistance,
    dispose() {
      if (disposed) return;
      disposed = true; scene.remove(root); label.remove();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      root.traverse(object => { if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); const map = (material as THREE.MeshStandardMaterial).map; if (map) textures.add(map); }
      } });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) { texture.dispose(); (texture.image as ImageBitmap)?.close?.(); }
      window.removeEventListener('pagehide', fixture.dispose);
    },
  };
  window.addEventListener('pagehide', fixture.dispose);
  Object.assign(window, { giantTransportDallasQA: fixture });
  return fixture;
}
