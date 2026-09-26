export type AircraftVisualType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type AircraftEffectAnchor = Readonly<{ x: number; y: number; z: number; radius: number; boostLength?: number }>;
export type AircraftGroundContact = Readonly<{ x: number; y: number; z: number }>;
export type AircraftVisualConfig = Readonly<{
  effectAnchors: ReadonlyArray<AircraftEffectAnchor>;
  groundContacts: ReadonlyArray<AircraftGroundContact>;
}>;

export const DESTRUCTION_EFFECT_DURATION_SECONDS: number;
export const DESTRUCTION_FRAGMENT_COUNT: number;
export const MAX_DESTRUCTION_EFFECTS: number;
export const aircraftVisualConfig: Readonly<Record<AircraftVisualType, AircraftVisualConfig>>;
export function groundContactVisualOffset(
  contacts: ReadonlyArray<AircraftGroundContact>,
  quaternion: Readonly<{ x: number; y: number; z: number; w: number }>,
  rootClearance: number,
): number;
