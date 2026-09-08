import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';

export type AircraftDefinition = {
  name: string; creditsRequired: number; maxSpeed: number; groundMaxSpeed: number; acceleration: number; drag: number;
  groundAcceleration: number; groundDrag: number; idleThrottle: number; throttleResponse: number; throttleDecay: number;
  lift: number; stallSpeed: number; pitchRate: number; maxClimbPitch: number; pitchReturnRate: number; climbLiftBoost: number;
  rollRate: number; rollInputResponse: number; yawRate: number; groundSteering: number; stability: number; inertia: number;
  bankTurn: number; alignmentRate: number; cameraDamping: number; cameraFrameScale: number; cameraHeight: number;
  takeoffSpeed: number; safeLandingSpeed: number; safeDescentRate: number; landingTilt: number;
  bodyColor: number; accentColor: number; bodyLength: number; bodyRadius: number; noseLength: number; wingSpan: number;
  wingDepth: number; tailSpan: number; enginePods: number;
};

export const aircraftDefinitions: Record<AircraftType, AircraftDefinition> = {
  trainer: { name: 'TRAINER', creditsRequired: 0, maxSpeed: 52, groundMaxSpeed: 40, acceleration: 8.2, drag: 5.5, groundAcceleration: 14.5, groundDrag: 12, idleThrottle: 0.02, throttleResponse: 0.42, throttleDecay: 0.1, lift: 1.28, stallSpeed: 15, pitchRate: 1, maxClimbPitch: 0.25, pitchReturnRate: 1.35, climbLiftBoost: 1.16, rollRate: 1.05, rollInputResponse: 4.5, yawRate: 1.3, groundSteering: 1.3, stability: 0.48, inertia: 0.88, bankTurn: 0.95, alignmentRate: 1.12, cameraDamping: 4.7, cameraFrameScale: 0.94, cameraHeight: 3.7, takeoffSpeed: 24, safeLandingSpeed: 48, safeDescentRate: 8.5, landingTilt: 0.62, bodyColor: 0xf2f4f7, accentColor: 0x145da0, bodyLength: 5.2, bodyRadius: 0.68, noseLength: 1.4, wingSpan: 8.4, wingDepth: 1.45, tailSpan: 3.4, enginePods: 0 },
  privateJet: { name: 'PRIVATE JET', creditsRequired: 500, maxSpeed: 94, groundMaxSpeed: 66, acceleration: 12, drag: 2.35, groundAcceleration: 10.5, groundDrag: 6.2, idleThrottle: 0.025, throttleResponse: 0.38, throttleDecay: 0.075, lift: 1.13, stallSpeed: 25.5, pitchRate: 0.7, maxClimbPitch: 0.23, pitchReturnRate: 1.05, climbLiftBoost: 1.08, rollRate: 1.8, rollInputResponse: 5.2, yawRate: 0.86, groundSteering: 0.92, stability: 0.58, inertia: 1.45, bankTurn: 0.74, alignmentRate: 0.76, cameraDamping: 3.7, cameraFrameScale: 1.03, cameraHeight: 4, takeoffSpeed: 38, safeLandingSpeed: 62, safeDescentRate: 7.2, landingTilt: 0.46, bodyColor: 0xf4f1ea, accentColor: 0x7b4fc9, bodyLength: 7, bodyRadius: 0.72, noseLength: 2, wingSpan: 7.2, wingDepth: 1.15, tailSpan: 3.2, enginePods: 2 },
  cargo: { name: 'CARGO PLANE', creditsRequired: 1000, maxSpeed: 68, groundMaxSpeed: 56, acceleration: 5.4, drag: 2.15, groundAcceleration: 8.2, groundDrag: 4.6, idleThrottle: 0.04, throttleResponse: 0.3, throttleDecay: 0.055, lift: 1.24, stallSpeed: 29, pitchRate: 0.56, maxClimbPitch: 0.21, pitchReturnRate: 0.9, climbLiftBoost: 1.13, rollRate: 1.15, rollInputResponse: 2.5, yawRate: 0.78, groundSteering: 0.82, stability: 0.68, inertia: 1.9, bankTurn: 0.54, alignmentRate: 0.52, cameraDamping: 3.15, cameraFrameScale: 1.08, cameraHeight: 4.6, takeoffSpeed: 44, safeLandingSpeed: 70, safeDescentRate: 8.2, landingTilt: 0.5, bodyColor: 0xc8d0d6, accentColor: 0x355d3f, bodyLength: 7.2, bodyRadius: 1, noseLength: 1.7, wingSpan: 11.5, wingDepth: 1.8, tailSpan: 4.5, enginePods: 4 },
  fighter: { name: 'FIGHTER-STYLE JET', creditsRequired: 2000, maxSpeed: 145, groundMaxSpeed: 82, acceleration: 27, drag: 5.7, groundAcceleration: 27, groundDrag: 8.5, idleThrottle: 0.01, throttleResponse: 0.72, throttleDecay: 0.16, lift: 1.4, stallSpeed: 34, pitchRate: 1.3, maxClimbPitch: 0.3, pitchReturnRate: 1.6, climbLiftBoost: 1.08, rollRate: 3.1, rollInputResponse: 7, yawRate: 1.5, groundSteering: 1.04, stability: 0.22, inertia: 0.62, bankTurn: 1.62, alignmentRate: 1.65, cameraDamping: 5.8, cameraFrameScale: 0.91, cameraHeight: 3.5, takeoffSpeed: 37, safeLandingSpeed: 54, safeDescentRate: 5, landingTilt: 0.32, bodyColor: 0x727d86, accentColor: 0xb52a2a, bodyLength: 6, bodyRadius: 0.58, noseLength: 2.5, wingSpan: 6.8, wingDepth: 2.2, tailSpan: 2.8, enginePods: 2 },
};

export { aircraftMuzzleSockets };

export const aircraftPitch = (definition: AircraftDefinition): string => {
  if (definition === aircraftDefinitions.privateJet) return 'Premium fast travel with smooth, efficient cruise.';
  if (definition === aircraftDefinitions.cargo) return 'Heavy, deliberate handling built for demanding cargo runs.';
  if (definition === aircraftDefinitions.fighter) return 'Extreme speed, agility, and combat performance.';
  return 'Beginner-friendly takeoffs, recovery, and landings.';
};

export function garageStats(definition: AircraftDefinition): ReadonlyArray<{ label: string; value: number }> {
  return [
    { label: 'Speed', value: definition.maxSpeed / 145 },
    { label: 'Acceleration', value: definition.acceleration / 27 },
    { label: 'Handling', value: (definition.rollRate + definition.yawRate) / 4.6 },
    { label: 'Climb', value: definition.lift * definition.maxClimbPitch / 0.42 },
    { label: 'Stability', value: definition.stability / 0.68 },
    { label: 'Landing', value: (definition.landingTilt + definition.safeDescentRate / 10) / 1.47 },
  ].map(({ label, value }) => ({ label, value: Math.round(Math.max(0.1, Math.min(1, value)) * 5) }));
}
