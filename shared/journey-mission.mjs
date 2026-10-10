import { dfwSpeedGates, whiteRockLowGates, downtownPrecisionGates, lasColinasFlybyGates, addisonClimbGates } from './city-challenges.mjs';
import { cityAirports } from './city-airports.mjs';
import { repairsForCity } from './city-repairs.mjs';

export const journeyDallas01 = Object.freeze({
  id: 'journey-dallas-01',
  cityId: 'dallas',
  name: 'DFW SKY RUSH',
  chapter: 'ROOKIE LEAGUE',
  timeLimitMs: 62_000,
  firstClearCredits: 250,
  gates: dfwSpeedGates,
});

export const journeyDallas02 = Object.freeze({
  id: 'journey-dallas-02', cityId: 'dallas', name: 'HUNTER SHOWDOWN',
  chapter: 'ROOKIE LEAGUE', firstClearCredits: 350, targetHealth: 200,
  arenaRadius: 25_000, arenaCenter: Object.freeze({ x: cityAirports.dallas[0].x, z: cityAirports.dallas[0].z }),
});

export const journeyDallas03 = Object.freeze({
  id: 'journey-dallas-03', cityId: 'dallas', name: 'WHITE ROCK SKIMMER',
  chapter: 'ROOKIE LEAGUE', timeLimitMs: 64_000, firstClearCredits: 450,
  startAirportId: 'love', gates: whiteRockLowGates,
});

export const journeyDallas04 = Object.freeze({
  id: 'journey-dallas-04', cityId: 'dallas', name: 'CLAIM THE SKIES',
  chapter: 'ROOKIE LEAGUE', firstClearCredits: 500,
  startAirportId: 'love', territoryId: 'white-rock', holdMs: 30_000,
});

export const journeyDallas05 = Object.freeze({
  id: 'journey-dallas-05', cityId: 'dallas', name: 'DOWNTOWN NEEDLE',
  chapter: 'ROOKIE LEAGUE', timeLimitMs: 72_000, firstClearCredits: 600,
  startAirportId: 'love', gates: downtownPrecisionGates,
});

export const journeyDallas06 = Object.freeze({
  id: 'journey-dallas-06', cityId: 'dallas', name: 'ROOKIE CHAMPIONSHIP',
  chapter: 'ROOKIE LEAGUE', timeLimitMs: 120_000, firstClearCredits: 750,
  startAirportId: 'love', finishAirportId: 'dfw',
  gates: Object.freeze([
    ...lasColinasFlybyGates.slice().reverse(),
    { x: -17_800, z: -9_000, altitude: 430, radius: 70 },
    { x: -20_500, z: -7_300, altitude: 350, radius: 68 },
    { x: -22_800, z: -8_600, altitude: 250, radius: 70 },
  ]),
});

export const journeyDallas07 = Object.freeze({
  id: 'journey-dallas-07', cityId: 'dallas', name: 'SKY ELEVATOR',
  chapter: 'SKY ADVENTURES', timeLimitMs: 66_000, firstClearCredits: 850,
  startAirportId: 'addison', gates: addisonClimbGates,
});

export const journeyDallas08 = Object.freeze({
  id: 'journey-dallas-08', cityId: 'dallas', name: 'STAY ON HIS SIX',
  chapter: 'SKY ADVENTURES', firstClearCredits: 950,
  startAirportId: 'love', followMs: 15_000,
  minDistance: 80, maxDistance: 280, maxTailAngle: 40 * Math.PI / 180,
  maxHeadingDifference: 45 * Math.PI / 180, maxAltitudeDifference: 100,
  // A broad circuit northwest of Love Field. The server's existing bot
  // steering and terrain clearance determine the actual flown trajectory.
  leaderRoute: Object.freeze([
    { x: -5_140, z: -10_500 }, { x: -5_900, z: -13_200 },
    { x: -8_600, z: -15_200 }, { x: -11_200, z: -13_700 },
    { x: -12_000, z: -10_600 }, { x: -9_800, z: -8_500 },
    { x: -7_100, z: -8_900 },
  ]),
});

const recoveryHeart = repairsForCity('dallas').find(beacon => beacon.id === 'outer-northwest-heart' && beacon.kind === 'heart');
if (!recoveryHeart) throw new Error('Dallas recovery Heart is unavailable');
export const journeyDallas09 = Object.freeze({
  id: 'journey-dallas-09', cityId: 'dallas', name: 'ONE HEART LEFT',
  chapter: 'SKY ADVENTURES', firstClearCredits: 1_050,
  startAirportId: 'dfw', startHealthFraction: 0.6,
  heartId: recoveryHeart.id,
  heart: recoveryHeart,
});

// A broad, low-variation S course west of the authored downtown skyline.
// Shared by rendering and server swept-crossing validation.
export const journeyDallas10 = Object.freeze({
  id: 'journey-dallas-10', cityId: 'dallas', name: 'SKYLINE SLALOM',
  chapter: 'SKY ADVENTURES', timeLimitMs: 85_000, firstClearCredits: 1_150,
  startAirportId: 'love',
  gates: Object.freeze([
    { x: -4_400, z: -3_300, altitude: 390, radius: 100 },
    { x: -2_800, z: -1_700, altitude: 400, radius: 100 },
    { x: -4_400, z: -100, altitude: 410, radius: 100 },
    { x: -2_800, z: 1_500, altitude: 400, radius: 100 },
    { x: -4_400, z: 3_100, altitude: 410, radius: 100 },
  ]),
});

// A straight, obstacle-clear corridor west of Downtown. The first four
// gates descend; the final gate asks for a controlled recovery climb.
export const journeyDallas11 = Object.freeze({
  id: 'journey-dallas-11', cityId: 'dallas', name: 'GRAVITY DROP',
  chapter: 'SKY ADVENTURES', timeLimitMs: 75_000, firstClearCredits: 1_250,
  prepareMs: 3_000,
  airborneSpawn: Object.freeze({ x: -5_000, z: -9_000, altitude: 1_650, heading: Math.PI, speed: 220 }),
  gates: Object.freeze([
    { x: -5_000, z: -6_500, altitude: 1_550, radius: 110 },
    { x: -5_000, z: -3_500, altitude: 1_250, radius: 110 },
    { x: -5_000, z: -500, altitude: 950, radius: 110 },
    { x: -5_000, z: 2_500, altitude: 650, radius: 110 },
    { x: -5_000, z: 5_500, altitude: 950, radius: 110 },
  ]),
});

// Northbound from Love Field through clear airspace west of Addison. The
// 1.35 km legs make the 150 m climb and descent achievable at Bluejay pitch.
export const journeyDallas12 = Object.freeze({
  id: 'journey-dallas-12', cityId: 'dallas', name: 'SKY PENDULUM',
  chapter: 'SKY ADVENTURES', timeLimitMs: 120_000, firstClearCredits: 1_500,
  startAirportId: 'love',
  gates: Object.freeze([
    { x: -5_140, z: -11_200, altitude: 550, radius: 110 },
    { x: -5_140, z: -12_550, altitude: 700, radius: 110 },
    { x: -5_140, z: -13_900, altitude: 850, radius: 110 },
    { x: -5_140, z: -15_250, altitude: 700, radius: 110 },
    { x: -5_140, z: -16_600, altitude: 550, radius: 110 },
    { x: -5_140, z: -17_950, altitude: 400, radius: 110 },
  ]),
});

// Northbound open-air corridor from Love Field. The wider rings and slight
// lateral bends reward sustained speed rather than precision steering.
export const journeyDallas13 = Object.freeze({
  id: 'journey-dallas-13', cityId: 'dallas', name: 'REDLINE RUSH',
  chapter: 'HIGH STAKES', timeLimitMs: 90_000, firstClearCredits: 1_650,
  startAirportId: 'love',
  // Rounded to 10 world units/s from 75% of each aircraft's sustained
  // straight-flight speed at the mobile FAST position (~85% throttle).
  speedThresholds: Object.freeze({ trainer: 640, privateJet: 830, cargo: 660, fighter: 960 }),
  gates: Object.freeze([
    { x: -5_140, z: -10_500, altitude: 480, radius: 135 },
    { x: -5_300, z: -12_000, altitude: 480, radius: 135 },
    { x: -5_120, z: -13_100, altitude: 485, radius: 135 },
    { x: -5_320, z: -14_200, altitude: 480, radius: 135 },
    { x: -5_140, z: -15_300, altitude: 480, radius: 135 },
  ]),
});

export const journeyDallas14 = Object.freeze({
  id: 'journey-dallas-14', cityId: 'dallas', name: 'ESCAPE VECTOR',
  chapter: 'HIGH STAKES', firstClearCredits: 1_800,
  startAirportId: 'love', escapeDistance: 450, escapeMs: 10_000,
});

export const journeyDallas15 = Object.freeze({
  id: 'journey-dallas-15', cityId: 'dallas', name: 'ACE INTERCEPT',
  chapter: 'HIGH STAKES', firstClearCredits: 1_950,
  startAirportId: 'love', bossName: 'ACE HUNTER', bossHealth: 300,
});

// Broad northbound turns through open airspace west of Addison. No race clock:
// the Hunters, introduced at confirmed gates 1 and 3, supply the pressure.
export const journeyDallas16 = Object.freeze({
  id: 'journey-dallas-16', cityId: 'dallas', name: 'CROSSFIRE ESCAPE',
  chapter: 'HIGH STAKES', firstClearCredits: 2_100, startAirportId: 'love',
  gates: Object.freeze([
    { x: -5_140, z: -10_700, altitude: 470, radius: 145 },
    { x: -6_050, z: -13_300, altitude: 485, radius: 145 },
    { x: -4_700, z: -15_900, altitude: 500, radius: 145 },
    { x: -6_050, z: -18_500, altitude: 485, radius: 145 },
    { x: -5_000, z: -21_100, altitude: 470, radius: 145 },
  ]),
});

// North-to-south DFW recovery corridor; the Heart is mission-owned and does
// not become a Free Flight pickup. Runway approach follows DFW's real axis.
export const journeyDallas17 = Object.freeze({
  id: 'journey-dallas-17', cityId: 'dallas', name: 'CRITICAL APPROACH',
  chapter: 'HIGH STAKES', firstClearCredits: 2_250,
  startHealthFraction: 0.45, finishAirportId: 'dfw', requiredLandingScore: 780,
  airborneSpawn: Object.freeze({ x: -22_800, z: -22_500, altitude: 470, heading: Math.PI, speed: 120 }),
  heartId: 'mission-17-dfw-heart',
  heart: Object.freeze({ id: 'mission-17-dfw-heart', kind: 'heart', x: -22_800, z: -19_500, radius: 115, altitudeAgl: 380 }),
});

// The capture uses the existing Las Colinas territory rectangle. The smaller
// mission-only defense circle gives the pilot a readable aerial area to hold.
export const journeyDallas18 = Object.freeze({
  id: 'journey-dallas-18', cityId: 'dallas', name: 'SKY SIEGE',
  chapter: 'HIGH STAKES', firstClearCredits: 2_400,
  startAirportId: 'love', territoryId: 'las-colinas',
  captureMs: 24_000, defenseMs: 40_000, defenseRadius: 2_800,
  hunterDelayMs: 2_500,
});

// The one broad exit is fixed northwest of the downtown skyline, beyond DFW.
export const journeyDallas19 = Object.freeze({
  id: 'journey-dallas-19', cityId: 'dallas', name: 'WANTED BREAKOUT',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 2_550,
  prepareMs: 3_000, timeLimitMs: 75_000,
  airborneSpawn: Object.freeze({ x: -2_600, z: -3_000, altitude: 1_200, heading: 0.795, speed: 220 }),
  hunterOffset: Object.freeze({ x: 1_200, z: 8_500 }),
  exit: Object.freeze({ x: -24_000, z: -24_000, altitude: 1_200, radius: 330,
    normalX: -21.4 / Math.hypot(21.4, 21), normalZ: -21 / Math.hypot(21.4, 21) }),
  gates: Object.freeze([{ x: -24_000, z: -24_000, altitude: 1_200, radius: 330 }]),
});

// Love Field to the open west side of the skyline. Each forward leg has room
// for a 170 m pitch reversal; normals follow the measured 3D approach slopes.
export const journeyDallas20 = Object.freeze({
  id: 'journey-dallas-20', cityId: 'dallas', name: 'SKYLINE SWITCHBACK',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 2_700,
  startAirportId: 'love', timeLimitMs: 110_000,
  gates: Object.freeze([
    { x: -4_400, z: -3_300, altitude: 560, radius: 90, normalX: .16180, normalY: .11984, normalZ: .97952 },
    { x: -3_900, z: -1_900, altitude: 390, radius: 90, normalX: .33405, normalY: -.11630, normalZ: .93535 },
    { x: -3_400, z: -500, altitude: 560, radius: 90, normalX: .33412, normalY: .11451, normalZ: .93555 },
    { x: -3_000, z: 900, altitude: 390, radius: 90, normalX: .27302, normalY: -.11097, normalZ: .95558 },
    { x: -2_600, z: 2_300, altitude: 560, radius: 90, normalX: .27239, normalY: .12996, normalZ: .95337 },
    { x: -2_200, z: 3_700, altitude: 390, radius: 90, normalX: .27271, normalY: -.12070, normalZ: .95449 },
  ]),
});

export const journeyDallas21 = Object.freeze({
  id: 'journey-dallas-21', cityId: 'dallas', name: 'TWO FRONTS',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 2_850,
  startAirportId: 'love', alphaTerritoryId: 'addison', bravoTerritoryId: 'dallas-executive',
  captureMs: 6_000, transferMs: 120_000,
});

// North-to-south on DFW's existing runway axis. Gate 3 leaves a long, clear
// stabilization leg before the north threshold and the server's touchdown zone.
export const journeyDallas22 = Object.freeze({
  id: 'journey-dallas-22', cityId: 'dallas', name: 'PERFECT APPROACH',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 3_000,
  prepareMs: 3_000, finishAirportId: 'dfw', approachRestartZ: -23_400,
  airborneSpawn: Object.freeze({ x: -22_800, z: -23_800, altitude: 525, heading: Math.PI, speed: 120 }),
  gates: Object.freeze([
    { x: -22_800, z: -22_500, altitude: 460, radius: 180, normalX: 0, normalY: -0.04494, normalZ: 0.99899 },
    { x: -22_800, z: -21_000, altitude: 370, radius: 125, normalX: 0, normalY: -0.06750, normalZ: 0.99772 },
    { x: -22_800, z: -19_000, altitude: 240, radius: 80, normalX: 0, normalY: -0.07375, normalZ: 0.99727 },
  ]),
});

export const journeyDallas23 = Object.freeze({
  id: 'journey-dallas-23', cityId: 'dallas', name: 'DOUBLE TROUBLE',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 3_150, startAirportId: 'love',
  hunterHealth: 200, heartId: 'mission-23-repair-heart', heartRadius: 115,
  hunterTwoDelayMs: 2_500,
});

// One forward route from Love Field into the open west side of downtown.
export const journeyDallas24 = Object.freeze({
  id: 'journey-dallas-24', cityId: 'dallas', name: 'LEGENDARY CHAMPIONSHIP',
  chapter: 'LEGENDARY SKIES', startAirportId: 'love', finishAirportId: 'dfw',
  firstClearCredits: 4_000, bossHealth: 300,
  gates: Object.freeze([
    { x: -6_000, z: -10_500, altitude: 500, radius: 190, normalX: -.301, normalY: .105, normalZ: -.948 },
    { x: -7_600, z: -11_800, altitude: 570, radius: 130, normalX: -.775, normalY: .033, normalZ: -.631 },
    { x: -9_500, z: -13_100, altitude: 620, radius: 82, normalX: -.825, normalY: .017, normalZ: -.565 },
  ]),
});

/** Swept crossing for a single exit with an explicit arrival direction. */
export function journeyExitCrossing(from, to, terrainHeight, mission = journeyDallas19) {
  const gate = mission.exit;
  if (!Number.isFinite(terrainHeight)) return false;
  const before = (from.x - gate.x) * gate.normalX + (from.z - gate.z) * gate.normalZ;
  const after = (to.x - gate.x) * gate.normalX + (to.z - gate.z) * gate.normalZ;
  if (!(before < 0 && after >= 0)) return false;
  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const y = from.y + (to.y - from.y) * fraction - terrainHeight - gate.altitude;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  return x * x + y * y + z * z <= (gate.radius * 0.92) ** 2;
}

// Cross the face of the next ring within its illuminated opening. White Rock
// accepts either approach direction; DFW Sky Rush keeps its forward route.
// The caller supplies the authoritative terrain elevation at the gate.
export function journeyGateCrossing(from, to, gateIndex, terrainHeight, mission = journeyDallas01) {
  const gate = mission.gates[gateIndex];
  if (!gate || !Number.isFinite(terrainHeight)) return false;
  if (mission.id === journeyDallas20.id || mission.id === journeyDallas22.id || mission.id === journeyDallas24.id) {
    const centerY = terrainHeight + gate.altitude;
    const nx = gate.normalX, ny = gate.normalY, nz = gate.normalZ;
    const before = (from.x - gate.x) * nx + (from.y - centerY) * ny + (from.z - gate.z) * nz;
    const after = (to.x - gate.x) * nx + (to.y - centerY) * ny + (to.z - gate.z) * nz;
    if (!(before < 0 && after >= 0)) return false;
    const fraction = -before / (after - before);
    const dx = from.x + (to.x - from.x) * fraction - gate.x;
    const dy = from.y + (to.y - from.y) * fraction - centerY;
    const dz = from.z + (to.z - from.z) * fraction - gate.z;
    return dx * dx + dy * dy + dz * dz <= (gate.radius * .92) ** 2 ? 'VALID' : false;
  }
  const previous = mission.gates[Math.max(0, gateIndex - 1)];
  const next = mission.gates[Math.min(mission.gates.length - 1, gateIndex + 1)];
  const directionX = next.x - previous.x;
  const directionZ = next.z - previous.z;
  const length = Math.hypot(directionX, directionZ);
  if (length < 1) return false;
  const normalX = directionX / length;
  const normalZ = directionZ / length;
  const before = (from.x - gate.x) * normalX + (from.z - gate.z) * normalZ;
  const after = (to.x - gate.x) * normalX + (to.z - gate.z) * normalZ;
  const forward = before < 0 && after >= 0;
  const reverse = mission.id === journeyDallas03.id && before > 0 && after <= 0;
  if (!forward && !reverse) return false;
  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const y = from.y + (to.y - from.y) * fraction - terrainHeight - gate.altitude;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  if (x * x + z * z > (gate.radius * 0.92) ** 2) return false;
  if (gate.maxAltitude !== undefined && y + gate.altitude > gate.maxAltitude) return 'TOO_HIGH';
  return x * x + y * y + z * z <= (gate.radius * 0.92) ** 2 ? 'VALID' : false;
}
export function crossesJourneyGate(from, to, gateIndex, terrainHeight) {
  return journeyGateCrossing(from, to, gateIndex, terrainHeight) === 'VALID';
}
