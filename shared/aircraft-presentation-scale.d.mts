export type AircraftPresentationType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export const aircraftPresentationScale: Readonly<Record<AircraftPresentationType, number>>;
export const aircraftPresentationMuzzleSockets: Readonly<Record<AircraftPresentationType, import('./aircraft-muzzles.mjs').AircraftMuzzleSocket>>;
