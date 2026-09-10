export type CityAirport = Readonly<{
  id: string;
  x: number;
  z: number;
  heading: number;
  runwayWidth: number;
  runwayLength: number;
}>;
export const cityAirports: Record<'milwaukee' | 'dallas', readonly CityAirport[]>;
export function airportForCity(cityId: 'milwaukee' | 'dallas', airportId: string): CityAirport | undefined;
