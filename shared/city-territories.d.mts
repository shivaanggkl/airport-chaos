export type CityTerritory = {
  id: string;
  cityId: 'milwaukee' | 'dallas';
  displayName: string;
  center: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  captureWeight: number;
  mapColor?: string;
};
export const cityTerritories: Record<'milwaukee' | 'dallas', readonly CityTerritory[]>;
export function territoriesForCity(cityId: string): readonly CityTerritory[];
