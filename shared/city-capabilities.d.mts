export type CityCapabilitySummary = {
  landableAirportIds: readonly string[];
  airportCount: number;
  discoveryTotal: number;
  objectiveSupportedTypes: readonly string[];
};
export const cityCapabilities: Record<'milwaukee' | 'dallas', CityCapabilitySummary>;
export function capabilitiesForCity(cityId: 'milwaukee' | 'dallas'): CityCapabilitySummary;
