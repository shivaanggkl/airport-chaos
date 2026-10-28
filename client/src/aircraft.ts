import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftFlightEnvelope, MPH_PER_METER_PER_SECOND } from '../../shared/aircraft-flight-envelope.mjs';
import { aircraftEconomy } from '../../shared/aircraft-economy.mjs';
import { aircraftVisualConfig } from '../../shared/aircraft-visual-rules.mjs';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';

export type AircraftDefinition = {
  name: string; callsign: string; access: 'free' | 'credits' | 'premium'; creditsRequired: number; maxSpeed: number; groundMaxSpeed: number; acceleration: number; drag: number;
  groundAcceleration: number; groundDrag: number; idleThrottle: number; throttleResponse: number; throttleDecay: number;
  lift: number; stallSpeed: number; pitchRate: number; maxClimbPitch: number; pitchReturnRate: number; climbLiftBoost: number;
  maxDivePitch?: number; pitchInputRise?: number; pitchInputRelease?: number;
  rollRate: number; rollInputResponse: number; rollInputRelease?: number; rollLevelRate?: number;
  yawRate: number; groundSteering: number; stability: number; inertia: number;
  bankTurn: number; alignmentRate: number; cameraDamping: number; cameraFrameScale: number; cameraHeight: number;
  boostDrain?: number; boostRegen?: number; boostThrust?: number; boostMaxSpeed?: number; overspeedDecaySeconds: number;
  airbrakeDrag?: number; airbrakeResponse?: number;
  takeoffSpeed: number; minimumTakeoffRoll: number; safeLandingSpeed: number; safeDescentRate: number; landingTilt: number;
  bodyColor: number; accentColor: number; bodyLength: number; bodyRadius: number; noseLength: number; wingSpan: number;
  wingDepth: number; tailSpan: number; enginePods: number;
  livery: { id: string; name: string; baseColor: number; primaryColor: number; accentColor: number };
};

export const aircraftDefinitions: Record<AircraftType, AircraftDefinition> = {
  trainer: { ...aircraftFlightEnvelope.trainer, name: 'SKYRIFT SCOUT', callsign: 'BLUEJAY', access: aircraftEconomy.trainer.access, creditsRequired: aircraftEconomy.trainer.credits, idleThrottle: 0.02, throttleResponse: 0.5, throttleDecay: 0.1, lift: 1.28, pitchInputRise: 7.5, pitchInputRelease: 2.7, pitchReturnRate: 1.35, climbLiftBoost: 1.16, rollInputRelease: 5.2, rollLevelRate: 1.05, stability: 0.48, cameraDamping: 4.7, cameraFrameScale: 0.94, cameraHeight: 3.7, bodyColor: 0x5aa9f4, accentColor: 0x77d8f2, bodyLength: 5.2, bodyRadius: 0.68, noseLength: 1.4, wingSpan: 8.4, wingDepth: 1.45, tailSpan: 3.4, enginePods: 0, livery: { id: 'bluejay-skybolt', name: 'SKYWAVE BLUE', baseColor: 0x5aa9f4, primaryColor: 0x77d8f2, accentColor: 0xc8d2dc } },
  privateJet: { ...aircraftFlightEnvelope.privateJet, name: 'WAYFARER JET', callsign: 'NIGHTOWL', access: aircraftEconomy.privateJet.access, creditsRequired: aircraftEconomy.privateJet.credits, idleThrottle: 0.025, throttleResponse: 0.46, throttleDecay: 0.075, lift: 1.13, pitchInputRise: 6.1, pitchInputRelease: 2.2, pitchReturnRate: 1.05, climbLiftBoost: 1.08, rollInputRelease: 4.0, rollLevelRate: 0.72, stability: 0.58, cameraDamping: 3.7, cameraFrameScale: 1.03, cameraHeight: 4, bodyColor: 0xe8f2fa, accentColor: 0x215eac, bodyLength: 9.5, bodyRadius: 1.1, noseLength: 2.5, wingSpan: 11, wingDepth: 1.65, tailSpan: 4.6, enginePods: 2, livery: { id: 'nightowl-sky-blue', name: 'SKY BLUE', baseColor: 0xe8f2fa, primaryColor: 0x215eac, accentColor: 0x14365d } },
  cargo: { ...aircraftFlightEnvelope.cargo, name: 'GRAVITAS CARGO', callsign: 'MAMMOTH', access: aircraftEconomy.cargo.access, creditsRequired: aircraftEconomy.cargo.credits, idleThrottle: 0.04, throttleResponse: 0.38, throttleDecay: 0.055, lift: 1.24, pitchInputRise: 4.3, pitchInputRelease: 1.45, pitchReturnRate: 0.9, climbLiftBoost: 1.13, rollInputRelease: 2.15, rollLevelRate: 0.42, stability: 0.68, cameraDamping: 3.15, cameraFrameScale: 1.08, cameraHeight: 4.6, bodyColor: 0xd8b76a, accentColor: 0xc7ccd2, bodyLength: 7.2, bodyRadius: 1, noseLength: 1.7, wingSpan: 11.5, wingDepth: 1.8, tailSpan: 4.5, enginePods: 4, livery: { id: 'mammoth-sand', name: 'LEGACY GOLD', baseColor: 0xd8b76a, primaryColor: 0xc7ccd2, accentColor: 0xa9783e } },
  fighter: { ...aircraftFlightEnvelope.fighter, name: 'REDSPEAR FIGHTER', callsign: 'FIREHAWK', access: aircraftEconomy.fighter.access, creditsRequired: aircraftEconomy.fighter.credits, idleThrottle: 0.01, throttleResponse: 0.88, throttleDecay: 0.16, lift: 1.4, pitchInputRise: 10, pitchInputRelease: 3.2, pitchReturnRate: 1.6, climbLiftBoost: 1.08, rollInputRelease: 7.2, rollLevelRate: 1.38, stability: 0.22, cameraDamping: 5.8, cameraFrameScale: 0.91, cameraHeight: 3.5, bodyColor: 0xe8eced, accentColor: 0xd52030, bodyLength: 6, bodyRadius: 0.58, noseLength: 2.5, wingSpan: 6.8, wingDepth: 2.2, tailSpan: 2.8, enginePods: 1, livery: { id: 'firehawk-inferno', name: 'FIREHAWK INFERNO', baseColor: 0xe8eced, primaryColor: 0xd52030, accentColor: 0xbfcbd0 } },
};

const fastestAircraftSpeed = Math.max(...Object.values(aircraftDefinitions).map(({ maxSpeed }) => maxSpeed));
const strongestAircraftAcceleration = Math.max(...Object.values(aircraftDefinitions).map(({ acceleration, inertia }) => acceleration / inertia));

export function aircraftDisplayName(type: AircraftType): string {
  return `${aircraftDefinitions[type].name} "${aircraftDefinitions[type].callsign}"`;
}

export const aircraftEffectAnchors = Object.fromEntries(
  (Object.keys(aircraftVisualConfig) as AircraftType[]).map((type) => [type, aircraftVisualConfig[type].effectAnchors]),
) as Record<AircraftType, (typeof aircraftVisualConfig)[AircraftType]['effectAnchors']>;

export const aircraftGroundContacts = Object.fromEntries(
  (Object.keys(aircraftVisualConfig) as AircraftType[]).map((type) => [type, aircraftVisualConfig[type].groundContacts]),
) as Record<AircraftType, (typeof aircraftVisualConfig)[AircraftType]['groundContacts']>;

export { aircraftMuzzleSockets };

export const aircraftPitch = (definition: AircraftDefinition): string => {
  if (definition === aircraftDefinitions.privateJet) return 'Premium fast travel with smooth, efficient cruise.';
  if (definition === aircraftDefinitions.cargo) return 'Heavy, deliberate handling built for demanding cargo runs.';
  if (definition === aircraftDefinitions.fighter) return 'Extreme speed, agility, and combat performance.';
  return 'Beginner-friendly takeoffs, recovery, and landings.';
};

export function aircraftSpeedCapsMph(definition: AircraftDefinition): { normal: number; boost: number } {
  const normal = definition.maxSpeed * MPH_PER_METER_PER_SECOND;
  return {
    normal: Math.round(normal),
    boost: Math.round(normal * (definition.boostMaxSpeed ?? 1.15)),
  };
}

export function garageStats(definition: AircraftDefinition): ReadonlyArray<{ label: string; value: number }> {
  const speedRating = Math.max(1, Math.floor(definition.maxSpeed / fastestAircraftSpeed * 5));
  const otherStats = [
    { label: 'Acceleration', value: (definition.acceleration / definition.inertia) / strongestAircraftAcceleration },
    { label: 'Handling', value: (definition.rollRate + definition.yawRate) / 4.6 },
    { label: 'Climb', value: definition.lift * definition.maxClimbPitch / 0.42 },
    { label: 'Stability', value: definition.stability / 0.68 },
    { label: 'Landing', value: (definition.landingTilt + definition.safeDescentRate / 10) / 1.47 },
  ].map(({ label, value }) => ({ label, value: Math.round(Math.max(0.1, Math.min(1, value)) * 5) }));
  return [{ label: 'Speed', value: speedRating }, ...otherStats];
}
