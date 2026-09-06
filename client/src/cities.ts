export type CityId = 'milwaukee' | 'dallas';
export type CityStatus = 'available' | 'coming-soon';
export type VisualQaPreset = {
  id: string;
  label: string;
  x: number;
  z: number;
  altitude: number;
  heading: number;
  pitch?: number;
  onGround?: boolean;
};
export type CityWorldModule = Omit<typeof import('./world'), 'WORLD_SIZE'> & {
  WORLD_SIZE: number;
  visualQaPresets?: ReadonlyArray<VisualQaPreset>;
  mapLayer?: import('./world-map').WorldMapLayer;
  updateWorldStreaming?: (position: import('three').Vector3) => void;
  disposeWorldStreaming?: () => void;
};

export type CityDefinition = {
  id: CityId;
  displayName: string;
  status: CityStatus;
  spawn: { airportId: string };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  loadWorld?: () => Promise<CityWorldModule>;
};

export const CITY_QUERY_PARAM = 'city';

export const cities: readonly CityDefinition[] = [
  {
    id: 'milwaukee',
    displayName: 'Milwaukee',
    status: 'available',
    spawn: { airportId: 'central' },
    bounds: { minX: -6000, maxX: 6000, minZ: -6000, maxZ: 6000 },
    loadWorld: () => import('./world'),
  },
  {
    id: 'dallas',
    displayName: 'Dallas',
    status: 'available',
    spawn: { airportId: 'dfw' },
    bounds: { minX: -25_000, maxX: 25_000, minZ: -25_000, maxZ: 25_000 },
    loadWorld: () => import('./dallas-world'),
  },
];

export function getCity(cityId: string | null): CityDefinition | undefined {
  return cities.find((city) => city.id === cityId);
}

export function activeCityFromUrl(): CityDefinition | undefined {
  return getCity(new URLSearchParams(window.location.search).get(CITY_QUERY_PARAM));
}
