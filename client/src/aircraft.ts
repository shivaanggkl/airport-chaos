import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';

export type AircraftDefinition = {
  name: string; creditsRequired: number; maxSpeed: number; groundMaxSpeed: number; acceleration: number; drag: number;
  groundAcceleration: number; groundDrag: number; idleThrottle: number; throttleResponse: number; throttleDecay: number;
  lift: number; stallSpeed: number; pitchRate: number; maxClimbPitch: number; pitchReturnRate: number; climbLiftBoost: number;
  maxDivePitch?: number; pitchInputRise?: number; pitchInputRelease?: number;
  rollRate: number; rollInputResponse: number; rollInputRelease?: number; rollLevelRate?: number;
  yawRate: number; groundSteering: number; stability: number; inertia: number;
  bankTurn: number; alignmentRate: number; cameraDamping: number; cameraFrameScale: number; cameraHeight: number;
  boostDrain?: number; boostRegen?: number; boostThrust?: number; boostMaxSpeed?: number;
  airbrakeDrag?: number; airbrakeResponse?: number;
  takeoffSpeed: number; safeLandingSpeed: number; safeDescentRate: number; landingTilt: number;
  bodyColor: number; accentColor: number; bodyLength: number; bodyRadius: number; noseLength: number; wingSpan: number;
  wingDepth: number; tailSpan: number; enginePods: number;
};

export const aircraftDefinitions: Record<AircraftType, AircraftDefinition> = {
  trainer: { ...aircraftFlightEnvelope.trainer, name: 'TRAINER', creditsRequired: 0, idleThrottle: 0.02, throttleResponse: 0.5, throttleDecay: 0.1, lift: 1.28, pitchInputRise: 7.5, pitchInputRelease: 2.7, pitchReturnRate: 1.35, climbLiftBoost: 1.16, rollInputRelease: 5.2, rollLevelRate: 1.05, stability: 0.48, cameraDamping: 4.7, cameraFrameScale: 0.94, cameraHeight: 3.7, bodyColor: 0xf2f4f7, accentColor: 0x145da0, bodyLength: 5.2, bodyRadius: 0.68, noseLength: 1.4, wingSpan: 8.4, wingDepth: 1.45, tailSpan: 3.4, enginePods: 0 },
  privateJet: { ...aircraftFlightEnvelope.privateJet, name: 'PRIVATE JET', creditsRequired: 500, idleThrottle: 0.025, throttleResponse: 0.46, throttleDecay: 0.075, lift: 1.13, pitchInputRise: 6.1, pitchInputRelease: 2.2, pitchReturnRate: 1.05, climbLiftBoost: 1.08, rollInputRelease: 4.0, rollLevelRate: 0.72, stability: 0.58, cameraDamping: 3.7, cameraFrameScale: 1.03, cameraHeight: 4, bodyColor: 0xf4f1ea, accentColor: 0x7b4fc9, bodyLength: 7, bodyRadius: 0.72, noseLength: 2, wingSpan: 7.2, wingDepth: 1.15, tailSpan: 3.2, enginePods: 2 },
  cargo: { ...aircraftFlightEnvelope.cargo, name: 'CARGO PLANE', creditsRequired: 1000, idleThrottle: 0.04, throttleResponse: 0.38, throttleDecay: 0.055, lift: 1.24, pitchInputRise: 4.3, pitchInputRelease: 1.45, pitchReturnRate: 0.9, climbLiftBoost: 1.13, rollInputRelease: 2.15, rollLevelRate: 0.42, stability: 0.68, cameraDamping: 3.15, cameraFrameScale: 1.08, cameraHeight: 4.6, bodyColor: 0xc8d0d6, accentColor: 0x355d3f, bodyLength: 7.2, bodyRadius: 1, noseLength: 1.7, wingSpan: 11.5, wingDepth: 1.8, tailSpan: 4.5, enginePods: 4 },
  fighter: { ...aircraftFlightEnvelope.fighter, name: 'FIGHTER-STYLE JET', creditsRequired: 2000, idleThrottle: 0.01, throttleResponse: 0.88, throttleDecay: 0.16, lift: 1.4, pitchInputRise: 10, pitchInputRelease: 3.2, pitchReturnRate: 1.6, climbLiftBoost: 1.08, rollInputRelease: 7.2, rollLevelRate: 1.38, stability: 0.22, cameraDamping: 5.8, cameraFrameScale: 0.91, cameraHeight: 3.5, bodyColor: 0x727d86, accentColor: 0xb52a2a, bodyLength: 6, bodyRadius: 0.58, noseLength: 2.5, wingSpan: 6.8, wingDepth: 2.2, tailSpan: 2.8, enginePods: 2 },
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
    { label: 'Speed', value: definition.maxSpeed / aircraftFlightEnvelope.fighter.maxSpeed },
    { label: 'Acceleration', value: definition.acceleration / aircraftFlightEnvelope.fighter.acceleration },
    { label: 'Handling', value: (definition.rollRate + definition.yawRate) / 4.6 },
    { label: 'Climb', value: definition.lift * definition.maxClimbPitch / 0.42 },
    { label: 'Stability', value: definition.stability / 0.68 },
    { label: 'Landing', value: (definition.landingTilt + definition.safeDescentRate / 10) / 1.47 },
  ].map(({ label, value }) => ({ label, value: Math.round(Math.max(0.1, Math.min(1, value)) * 5) }));
}
