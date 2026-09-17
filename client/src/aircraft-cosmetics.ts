import * as THREE from 'three';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { aircraftDefinitions, type AircraftType } from './aircraft';

// Retain the selection on the root so asynchronously loaded GLBs use the same
// palette as the fallback, Garage, and replicated aircraft.
export function applyAircraftCosmetics(root: THREE.Object3D, type: AircraftType, equipped: Record<string, string>): void {
  root.userData.equippedCosmetics = { ...equipped };
  const definition = aircraftDefinitions[type];
  const item = cosmeticCatalog.find(entry => entry.id === equipped[`livery:${type}`] && entry.category === 'livery' && entry.aircraftRestriction === type);
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
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
        const color = palette[material.name as keyof typeof palette];
        if (color !== undefined) material.color.setHex(color);
      }
    }
  });
  const contrail = cosmeticCatalog.find(entry => entry.id === equipped.contrail && entry.category === 'contrail');
  const visuals = root.userData.visuals;
  if (visuals?.boostMaterial) visuals.boostMaterial.color.setHex(contrail?.visualConfig.color ?? (type === 'fighter' ? 0xff4d1f : type === 'trainer' ? 0xd8f4ff : 0x9eeaff));
}
