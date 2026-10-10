export type FormationState = Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  heading: number; speed: number; airborne: boolean;
}>;
export type FormationStatus = 'AIRBORNE_REQUIRED' | 'TOO_CLOSE' | 'GET_BEHIND' | 'TOO_FAR' | 'ALTITUDE' | 'ALIGN' | 'VALID';
export function journeyFormationStatus(pilot: FormationState, leader: FormationState): FormationStatus;
