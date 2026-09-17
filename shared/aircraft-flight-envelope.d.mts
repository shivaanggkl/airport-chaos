export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export const FLIGHT_UNITS_PER_METER: number;
export const KNOTS_PER_METER_PER_SECOND: number;
export type AircraftFlightEnvelope = Readonly<{
  topSpeed: number; maxSpeed: number; groundMaxSpeed: number; acceleration: number; drag: number;
  groundAcceleration: number; groundDrag: number; stallSpeed: number; takeoffSpeed: number; minimumTakeoffRoll: number;
  pitchRate: number; maxClimbPitch: number; maxDivePitch: number; rollRate: number;
  rollInputResponse: number; yawRate: number; groundSteering: number; inertia: number;
  bankTurn: number; alignmentRate: number;
  boostThrust: number; boostMaxSpeed: number; boostDrain: number; boostRegen: number; overspeedDecaySeconds: number;
  airbrakeDrag: number; airbrakeResponse: number;
  safeLandingSpeed: number; safeDescentRate: number; landingTilt: number;
}>;
export const aircraftFlightEnvelope: Readonly<Record<AircraftType, AircraftFlightEnvelope>>;
