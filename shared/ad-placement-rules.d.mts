export type AdPlacementType =
  | 'PREMIUM_BUILDING_WRAP'
  | 'GROUND_SPONSOR'
  | 'AIRPORT_GROUND_SPONSOR'
  | 'ROOFTOP_BILLBOARD'
  | 'AIRPORT_SPONSOR'
  | 'HIGHWAY_BILLBOARD'
  | 'SKYBOARD'
  | 'SKY_GATE'
  | 'SPONSOR_BLIMP'
  | 'RING_SPONSOR'
  | 'EVENT_SPONSOR'
  | 'AIRCRAFT_LIVERY';

export type AdPlacementVector = { x: number; y: number; z: number };

export type AdPlacementPresentationSpec = {
  type: AdPlacementType;
  position: AdPlacementVector;
  size: AdPlacementVector;
};

export const airborneAdVisibilityMultiplier: 2;

export function isAirborneAdPlacement(type: AdPlacementType): boolean;

export function canCombatSuppressPlacement(type: AdPlacementType): boolean;

export function resolveAdPlacementPresentation(spec: AdPlacementPresentationSpec): {
  position: AdPlacementVector;
  size: AdPlacementVector;
};
