import cityDataJson from './data/city1-osm.json';
import type * as THREE from 'three';
import { addOsmCityData, type CompactCityData } from './osm-city';

const cityData = cityDataJson as unknown as CompactCityData;

export { type ImportedRoadSegment, type ImportedObstacle, type ImportedWater } from './osm-city';

export function addOsmCity(
  scene: THREE.Scene,
  options: Parameters<typeof addOsmCityData>[2],
): ReturnType<typeof addOsmCityData> {
  return addOsmCityData(scene, cityData, options);
}
