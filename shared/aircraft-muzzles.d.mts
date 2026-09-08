export type AircraftMuzzleSocket = Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  forward: Readonly<{ x: number; y: number; z: number }>;
}>;
export const aircraftMuzzleSockets: Readonly<Record<'trainer' | 'privateJet' | 'cargo' | 'fighter', AircraftMuzzleSocket>>;
