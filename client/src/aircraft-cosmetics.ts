import * as THREE from 'three';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { aircraftDefinitions, type AircraftType } from './aircraft';

const paintFinish = Object.freeze({
  AC_LIVERY_BASE: Object.freeze({ roughness: 0.24, metalness: 0.16 }),
  AC_LIVERY_PRIMARY: Object.freeze({ roughness: 0.20, metalness: 0.28 }),
  AC_LIVERY_ACCENT: Object.freeze({ roughness: 0.18, metalness: 0.42 }),
});

// Retain the selection on the root so asynchronously loaded GLBs use the same
// palette as the fallback, Garage, and replicated aircraft.
export function applyAircraftCosmetics(root: THREE.Object3D, type: AircraftType, equipped: Record<string, string>): void {
  root.userData.equippedCosmetics = { ...equipped };
  const definition = aircraftDefinitions[type];
  const item = cosmeticCatalog.find(entry => entry.id === equipped[`livery:${type}`] && entry.aircraftRestriction === type);
  const palette = {
    AC_LIVERY_BASE: item?.visualConfig.base ?? definition.livery.baseColor,
    AC_LIVERY_PRIMARY: item?.visualConfig.primary ?? definition.livery.primaryColor,
    AC_LIVERY_ACCENT: item?.visualConfig.accent ?? definition.livery.accentColor,
  };
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    if (!source.some(material => material.name in palette)) return;
    if (!object.userData.cosmeticMaterialsCloned) {
      object.material = Array.isArray(object.material) ? source.map(material => material.clone()) : source[0].clone();
      object.userData.cosmeticMaterialsCloned = true;
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const slot = material.name as keyof typeof palette;
      const finish = paintFinish[slot];
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
        const color = palette[slot];
        if (color !== undefined) material.color.setHex(color);
      }
      if (finish && material instanceof THREE.MeshStandardMaterial) {
        material.roughness = finish.roughness;
        material.metalness = finish.metalness;
        material.needsUpdate = true;
      } else if (finish && material instanceof THREE.MeshPhongMaterial) {
        material.shininess = 82;
        material.specular.setHex(0x9aa8b3);
        material.needsUpdate = true;
      }
    }
  });
  const visuals = root.userData.visuals;
  if (visuals?.boostMaterial) visuals.boostMaterial.color.setHex(type === 'fighter' ? 0xff4d1f : type === 'trainer' ? 0xd8f4ff : 0x9eeaff);
}
