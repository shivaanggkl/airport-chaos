export type CityId = 'milwaukee' | 'dallas';
export type RepairBeacon = Readonly<
  | { id: string; x: number; z: number; radius: number; maxAltitude: number; kind?: undefined }
  | { id: string; x: number; z: number; radius: number; altitudeAgl: number; kind: 'heart' }
>;
export const cityRepairBeacons: Readonly<Record<CityId, readonly RepairBeacon[]>>;
export function repairsForCity(cityId: CityId): readonly RepairBeacon[];
