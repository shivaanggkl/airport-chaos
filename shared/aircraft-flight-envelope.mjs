// Shared flight-envelope values used by both the player handling configuration
// and server-owned bot steering.  Keep this deliberately limited to physical
// controls so presentation, camera, and progression remain client concerns.
// One physical envelope drives both human flight and server-owned bots.
// These are deliberately arcade speeds; ground handling remains independent
// and the stronger airbrakes bring each aircraft back into its landing window.
export const KNOTS_PER_METER_PER_SECOND = 3600 / 1852;
const speedEnvelope = (normalKnots, boostKnots) => ({
  maxSpeed: normalKnots / KNOTS_PER_METER_PER_SECOND,
  boostMaxSpeed: boostKnots / normalKnots,
});
export const aircraftFlightEnvelope = Object.freeze({
  trainer: Object.freeze({ ...speedEnvelope(720, 972), groundMaxSpeed: 52, acceleration: 83, drag: 15, groundAcceleration: 17, groundDrag: 12, stallSpeed: 15, takeoffSpeed: 24, pitchRate: 1, maxClimbPitch: 0.25, maxDivePitch: 0.23, rollRate: 1.05, rollInputResponse: 4.5, yawRate: 1.3, groundSteering: 1.3, inertia: 0.88, bankTurn: 0.95, alignmentRate: 1.12, boostThrust: 2.45, boostDrain: 24, boostRegen: 13, overspeedDecaySeconds: 6, airbrakeDrag: 17, airbrakeResponse: 6, safeLandingSpeed: 72, safeDescentRate: 11, landingTilt: 0.7 }),
  privateJet: Object.freeze({ ...speedEnvelope(1200, 1620), groundMaxSpeed: 78, acceleration: 142, drag: 7, groundAcceleration: 13, groundDrag: 6.2, stallSpeed: 25.5, takeoffSpeed: 38, pitchRate: 0.7, maxClimbPitch: 0.23, maxDivePitch: 0.21, rollRate: 1.8, rollInputResponse: 5.2, yawRate: 0.86, groundSteering: 0.92, inertia: 1.45, bankTurn: 0.74, alignmentRate: 0.76, boostThrust: 2.7, boostDrain: 22, boostRegen: 11, overspeedDecaySeconds: 8, airbrakeDrag: 68, airbrakeResponse: 5, safeLandingSpeed: 100, safeDescentRate: 11, landingTilt: 0.56 }),
  cargo: Object.freeze({ ...speedEnvelope(900, 1215), groundMaxSpeed: 68, acceleration: 81, drag: 6.2, groundAcceleration: 10, groundDrag: 4.6, stallSpeed: 29, takeoffSpeed: 44, pitchRate: 0.56, maxClimbPitch: 0.21, maxDivePitch: 0.19, rollRate: 1.15, rollInputResponse: 2.5, yawRate: 0.78, groundSteering: 0.82, inertia: 1.9, bankTurn: 0.54, alignmentRate: 0.52, boostThrust: 2.85, boostDrain: 20, boostRegen: 10, overspeedDecaySeconds: 7, airbrakeDrag: 75, airbrakeResponse: 2.5, safeLandingSpeed: 95, safeDescentRate: 12, landingTilt: 0.62 }),
  fighter: Object.freeze({ ...speedEnvelope(2016, 2700), groundMaxSpeed: 98, acceleration: 273, drag: 23, groundAcceleration: 34, groundDrag: 8.5, stallSpeed: 34, takeoffSpeed: 37, pitchRate: 1.3, maxClimbPitch: 0.3, maxDivePitch: 0.28, rollRate: 3.1, rollInputResponse: 7, yawRate: 1.5, groundSteering: 1.04, inertia: 0.62, bankTurn: 1.62, alignmentRate: 1.65, boostThrust: 2.95, boostDrain: 32, boostRegen: 15, overspeedDecaySeconds: 9, airbrakeDrag: 34, airbrakeResponse: 7, safeLandingSpeed: 120, safeDescentRate: 9.5, landingTilt: 0.44 }),
});
