export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export const aircraftMaxHealth: Readonly<Record<AircraftType, number>>;
export function maxHealthForAircraft(aircraftType: AircraftType): number;
