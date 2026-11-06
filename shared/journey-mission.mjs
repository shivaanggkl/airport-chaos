import { transportTuning } from './giant-incoming.mjs';
import { remoteAircraftScale } from './remote-aircraft-visual-rules.mjs';
import { addisonClimbGates } from './city-challenges.mjs';
import { cityAirports } from './city-airports.mjs';

export const journeyPauseLimitMs = 120_000;

export const journeyDallas01 = Object.freeze({
  id: 'journey-dallas-01',
  cityId: 'dallas',
  name: 'ROOKIE RUSH',
  chapter: 'GOLDEN GATES',
  timeLimitMs: 150_000,
  firstClearCredits: 250,
  airborneSpawn: Object.freeze({ x: -7_800, z: -9_900, altitude: 780, heading: -2.49, speed: 650 }),
  // Love Field and the skyline fill the opening view. A broad clockwise arc
  // ends beside the Trinity without asking new pilots for a sharp turn.
  gates: Object.freeze([
    { x: -5_700, z: -7_800, altitude: 780, radius: 340 },
    { x: -2_600, z: -5_100, altitude: 785, radius: 335 },
    { x: 600, z: -2_200, altitude: 790, radius: 330 },
    { x: 4_000, z: 800, altitude: 800, radius: 325 },
    { x: 7_000, z: 3_900, altitude: 810, radius: 320 },
    { x: 6_800, z: 7_200, altitude: 810, radius: 315 },
    { x: 3_400, z: 9_600, altitude: 800, radius: 310 },
    { x: -1_500, z: 8_500, altitude: 790, radius: 305 },
    { x: -4_800, z: 6_000, altitude: 785, radius: 300 },
    { x: -5_100, z: 2_300, altitude: 780, radius: 350 },
  ]),
});

export const journeyDallas02 = Object.freeze({
  id: 'journey-dallas-02', cityId: 'dallas', name: 'LAKE RACER',
  chapter: 'GOLDEN GATES', firstClearCredits: 350, timeLimitMs: 150_000,
  airborneSpawn: Object.freeze({ x: -6_000, z: -14_000, altitude: 770, heading: -2.11, speed: 650 }),
  // Broad S-bends carry new racers east around White Rock Lake.
  gates: Object.freeze([
    { x: -3_500, z: -12_500, altitude: 770, radius: 320 },
    { x: 500, z: -13_500, altitude: 780, radius: 315 },
    { x: 5_300, z: -11_200, altitude: 795, radius: 310 },
    { x: 9_500, z: -9_000, altitude: 810, radius: 305 },
    { x: 11_500, z: -5_000, altitude: 825, radius: 300 },
    { x: 10_000, z: -1_000, altitude: 840, radius: 295 },
    { x: 6_500, z: 2_000, altitude: 850, radius: 290 },
    { x: 2_500, z: 1_000, altitude: 845, radius: 285 },
    { x: -500, z: -2_500, altitude: 825, radius: 285 },
    { x: -3_500, z: -6_000, altitude: 800, radius: 330 },
  ]),
});

export const journeyDallas03 = Object.freeze({
  id: 'journey-dallas-03', cityId: 'dallas', name: 'GOLDEN ASCENT',
  chapter: 'GOLDEN GATES', timeLimitMs: 160_000, firstClearCredits: 450,
  airborneSpawn: Object.freeze({ x: -11_000, z: -20_000, altitude: 650, heading: -1.25, speed: 650 }),
  // Climb around Addison and North Dallas, then descend on the return arc.
  gates: Object.freeze([
    { x: -8_000, z: -21_000, altitude: 680, radius: 310 },
    { x: -4_000, z: -21_000, altitude: 740, radius: 300 },
    { x: 0, z: -20_000, altitude: 810, radius: 290 },
    { x: 4_000, z: -17_500, altitude: 880, radius: 285 },
    { x: 5_500, z: -13_000, altitude: 950, radius: 280 },
    { x: 3_500, z: -9_000, altitude: 1_030, radius: 275 },
    { x: 0, z: -6_500, altitude: 990, radius: 270 },
    { x: -4_500, z: -8_000, altitude: 920, radius: 265 },
    { x: -8_500, z: -11_500, altitude: 830, radius: 260 },
    { x: -10_000, z: -16_000, altitude: 750, radius: 330 },
  ]),
});

export const journeyDallas04 = Object.freeze({
  id: 'journey-dallas-04', cityId: 'dallas', name: 'DOWNTOWN SLALOM',
  chapter: 'GOLDEN GATES', firstClearCredits: 500, timeLimitMs: 160_000,
  airborneSpawn: Object.freeze({ x: -8_500, z: -12_000, altitude: 850, heading: -2.36, speed: 650 }),
  // A measured left-right slalom crosses Downtown and the Trinity corridor.
  gates: Object.freeze([
    { x: -6_000, z: -10_000, altitude: 850, radius: 325 },
    { x: -3_000, z: -7_300, altitude: 865, radius: 310 },
    { x: -4_500, z: -3_300, altitude: 900, radius: 300 },
    { x: -2_300, z: 700, altitude: 935, radius: 290 },
    { x: -4_200, z: 4_300, altitude: 960, radius: 280 },
    { x: -1_700, z: 7_800, altitude: 945, radius: 275 },
    { x: 2_300, z: 9_200, altitude: 910, radius: 270 },
    { x: 5_000, z: 5_700, altitude: 880, radius: 265 },
    { x: 3_200, z: 1_600, altitude: 860, radius: 260 },
    { x: 5_000, z: -3_000, altitude: 850, radius: 340 },
  ]),
});

export const journeyDallas05 = Object.freeze({
  id: 'journey-dallas-05', cityId: 'dallas', name: 'NEEDLE RUSH',
  chapter: 'GOLDEN GATES', timeLimitMs: 160_000, firstClearCredits: 600,
  airborneSpawn: Object.freeze({ x: -22_000, z: -14_000, altitude: 700, heading: -1.80, speed: 650 }),
  // Race from DFW through Las Colinas to tight Trinity-side gates.
  gates: Object.freeze([
    { x: -18_500, z: -13_200, altitude: 730, radius: 300 },
    { x: -15_000, z: -15_000, altitude: 755, radius: 290 },
    { x: -11_500, z: -13_000, altitude: 780, radius: 275 },
    { x: -9_000, z: -9_000, altitude: 810, radius: 260 },
    { x: -12_000, z: -5_500, altitude: 840, radius: 250 },
    { x: -14_500, z: -1_500, altitude: 870, radius: 240 },
    { x: -11_000, z: 2_500, altitude: 900, radius: 230 },
    { x: -7_000, z: 4_000, altitude: 880, radius: 220 },
    { x: -4_300, z: 2_300, altitude: 840, radius: 215 },
    { x: -5_000, z: -2_000, altitude: 800, radius: 320 },
  ]),
});

export const journeyDallas06 = Object.freeze({
  id: 'journey-dallas-06', cityId: 'dallas', name: 'GOLDEN CHAMPIONSHIP',
  chapter: 'GOLDEN GATES', timeLimitMs: 160_000, firstClearCredits: 750,
  airborneSpawn: Object.freeze({ x: 7_000, z: -14_000, altitude: 760, heading: 3.00, speed: 650 }),
  // White Rock, Trinity and Dallas Executive link east to south Dallas.
  gates: Object.freeze([
    { x: 6_500, z: -10_500, altitude: 780, radius: 300 },
    { x: 10_000, z: -7_500, altitude: 820, radius: 290 },
    { x: 12_000, z: -3_000, altitude: 860, radius: 280 },
    { x: 8_500, z: 1_000, altitude: 900, radius: 265 },
    { x: 3_500, z: 4_000, altitude: 850, radius: 255 },
    { x: -1_000, z: 3_500, altitude: 920, radius: 245 },
    { x: -4_100, z: 2_300, altitude: 980, radius: 235 },
    { x: -8_500, z: 4_000, altitude: 900, radius: 225 },
    { x: -10_000, z: 8_500, altitude: 820, radius: 205 },
    { x: -6_700, z: 11_000, altitude: 780, radius: 340 },
  ]),
});

export const journeyDallas07 = Object.freeze({
  id: 'journey-dallas-07', cityId: 'dallas', name: 'GIANT PLANE',
  chapter: 'SKY SIEGE', timeLimitMs: transportTuning.durationMs, firstClearCredits: 850,
  startAirportId: 'dfw', gates: Object.freeze([]), bossHealth: transportTuning.health,
});

export const journeyDallas08 = Object.freeze({
  id: 'journey-dallas-08', cityId: 'dallas', name: 'GIANT PLANE & TWO ESCORTS',
  chapter: 'SKY ADVENTURES', firstClearCredits: 950,
  startAirportId: 'dfw', timeLimitMs: 300_000, bossHealth: transportTuning.health,
  escortHealth: 1_000, escortCount: 2, escortScale: remoteAircraftScale, escortFireDelayMs: 5_000,
  escortAircraft: Object.freeze(['trainer', 'trainer']),
  escortLiveries: Object.freeze(['bluejay-skybolt', 'bluejay-aurora']),
  escortBurstIntervalMs: 6_000, escortShotSpacingMs: 250, escortShotDamage: 10,
  followMs: 15_000,
  minDistance: 80, maxDistance: 450, maxTailAngle: 40 * Math.PI / 180,
  maxHeadingDifference: 45 * Math.PI / 180, maxAltitudeDifference: 100,
  // Match the free Bluejay's MED throttle so pilots can hold formation
  // without boost or a purchased aircraft.
  leaderCruiseFactor: 0.45,
  // A broad circuit northwest of Love Field. The server's existing bot
  // steering and terrain clearance determine the actual flown trajectory.
  leaderRoute: Object.freeze([
    { x: -5_140, z: -10_500 }, { x: -5_900, z: -13_200 },
    { x: -8_600, z: -15_200 }, { x: -11_200, z: -13_700 },
    { x: -12_000, z: -10_600 }, { x: -9_800, z: -8_500 },
    { x: -7_100, z: -8_900 },
  ]),
});

export const journeyDallas09 = Object.freeze({
  id: 'journey-dallas-09', cityId: 'dallas', name: 'GIANT PLANE & THREE ESCORTS',
  chapter: 'SKY ADVENTURES', firstClearCredits: 1_050,
  startAirportId: 'dfw', timeLimitMs: 330_000, bossHealth: transportTuning.health,
  escortCount: 3, initialEscortCount: 3, escortScale: remoteAircraftScale,
  escortHealth: Object.freeze([75, 125, 175]),
  escortAircraft: Object.freeze(['trainer', 'cargo', 'privateJet']),
  escortLiveries: Object.freeze(['bluejay-aurora', 'mammoth-sand', 'nightowl-forest']),
  reinforcementThreshold: 0.5, reinforcementWarningMs: 3_000, reinforcementFireDelayMs: 3_000,
  escortFireDelayMs: 5_000, escortBurstIntervalMs: 4_000,
  initialEscortBurstIntervalMs: 6_000, escortShotSpacingMs: 250, escortShotDamage: 10,
});

export const journeyDallas10 = Object.freeze({
  id: 'journey-dallas-10', cityId: 'dallas', name: 'GIANT PLANE & FOUR ESCORTS',
  chapter: 'SKY ADVENTURES', timeLimitMs: 330_000, firstClearCredits: 1_150,
  startAirportId: 'dfw', bossHealth: transportTuning.health,
  escortCount: 4, escortScale: remoteAircraftScale,
  escortHealth: Object.freeze([175, 225, 175, 225]),
  escortAircraft: Object.freeze(['privateJet', 'cargo', 'privateJet', 'cargo']),
  escortLiveries: Object.freeze(['nightowl-forest', 'mammoth-sand', 'nightowl-royal-violet', 'mammoth-desert-sand']),
  escortFireDelayMs: 5_000, escortBurstIntervalMs: 6_000,
  escortShotSpacingMs: 250, escortShotDamage: 10,
  gunBurstIntervalMs: 3_000, gunWarningMs: 1_000,
  gunShotSpacingMs: 250, gunShotDamage: 10,
});

export const journeyDallas11 = Object.freeze({
  id: 'journey-dallas-11', cityId: 'dallas', name: 'ARMORED GIANT PLANE',
  chapter: 'SKY ADVENTURES', timeLimitMs: 330_000, firstClearCredits: 1_250,
  startAirportId: 'dfw', turretHealth: 250, coreHealth: 1_500,
  hatch: Object.freeze({ z: 22.05, bottom: -0.45, width: 3.85, height: 3.35 }),
  coreLocal: Object.freeze({ x: 0, y: 1.2, z: 21.2 }), coreRadius: 0.9,
  gunBurstIntervalMs: 3_000, gunWarningMs: 1_000,
  gunShotSpacingMs: 250, gunShotDamage: 10,
});

export const journeyDallas12 = Object.freeze({
  id: 'journey-dallas-12', cityId: 'dallas', name: 'ARMORED GIANT PLANE & TWO ESCORTS',
  chapter: 'SKY ADVENTURES', timeLimitMs: 360_000, firstClearCredits: 1_500,
  startAirportId: 'dfw', turretHealth: journeyDallas11.turretHealth, coreHealth: 1_750,
  escortCount: 2, escortScale: journeyDallas10.escortScale,
  escortHealth: Object.freeze([175, 225]),
  escortAircraft: Object.freeze(['privateJet', 'fighter']),
  escortLiveries: Object.freeze(['nightowl-forest', 'firehawk-inferno']),
  escortFireDelayMs: journeyDallas10.escortFireDelayMs,
  escortBurstIntervalMs: journeyDallas10.escortBurstIntervalMs,
  escortShotSpacingMs: journeyDallas10.escortShotSpacingMs,
  escortShotDamage: journeyDallas10.escortShotDamage,
  gunBurstIntervalMs: journeyDallas11.gunBurstIntervalMs,
  gunWarningMs: journeyDallas11.gunWarningMs,
  gunShotSpacingMs: journeyDallas11.gunShotSpacingMs,
  gunShotDamage: journeyDallas11.gunShotDamage,
});

// Northbound open-air corridor from Love Field. The wider rings and slight
// lateral bends reward sustained speed rather than precision steering.
// Keep the historical mission ID: this is displayed Journey slot 7.
const firstContactDfw = { x: -22_800, z: -13_600 };
const firstContactBearing = Math.hypot(firstContactDfw.x, firstContactDfw.z);
export const journeyDallas13 = Object.freeze({
  id: 'journey-dallas-13', cityId: 'dallas', name: 'FIRST CONTACT',
  chapter: 'SKY HUNTERS', timeLimitMs: 240_000, firstClearCredits: 1_650,
  startAirportId: 'dfw', enemyAircraft: 'privateJet', enemyLivery: 'nightowl-sunset-red',
  enemyHealth: 150, enemyAltitude: 800, aggressionDistance: 10_000,
  patrolRadius: 1_500, cruiseSpeed: 400,
  enemySpawn: Object.freeze({
    x: firstContactDfw.x - firstContactDfw.x / firstContactBearing * 20_000,
    z: firstContactDfw.z - firstContactDfw.z / firstContactBearing * 20_000,
  }),
});

export const journeyDallas14 = Object.freeze({
  id: 'journey-dallas-14', cityId: 'dallas', name: 'SURPRISE ATTACK',
  chapter: 'SKY HUNTERS', timeLimitMs: 240_000, firstClearCredits: 1_800,
  startAirportId: 'love', enemyAircraft: 'trainer', enemyLivery: 'bluejay-aurora',
  enemyHealth: 150, enemyAltitude: 800, aggressionDistance: 10_000,
  patrolRadius: 1_500, cruiseSpeed: 460, warningMs: 3_000, rearApproachMs: 18_000,
  // Northbound from Love Field with a 4 km lateral offset; exactly 20 km horizontal.
  enemySpawn: Object.freeze({ x: -5_140 - 4_000, z: -7_780 - Math.sqrt(20_000 ** 2 - 4_000 ** 2) }),
});

export const journeyDallas15 = Object.freeze({
  id: 'journey-dallas-15', cityId: 'dallas', name: 'HOT PURSUIT',
  chapter: 'SKY HUNTERS', firstClearCredits: 1_950, timeLimitMs: 300_000,
  startAirportId: 'addison', bossName: 'ESCAPING MAMMOTH', bossHealth: 200,
  enemyAircraft: 'cargo', enemyLivery: 'mammoth-sand', enemyAltitude: 800,
  enemySpawn: Object.freeze({x:-16_500,z:-13_200}), cruiseSpeed: 420, threatDistance: 10_000, arrivalRadius: 650,
  // Keep the final leg inside the established Hunter airspace turning margin.
  escapeRoute: Object.freeze([Object.freeze({x:-21_500,z:8_000}),Object.freeze({x:-3_000,z:8_000})]),
});

// Two independently flying opponents share permission to initiate shots.
export const journeyDallas16 = Object.freeze({
  id:'journey-dallas-16',cityId:'dallas',name:'DOUBLE THREAT',chapter:'SKY HUNTERS',
  firstClearCredits:2_100,startAirportId:'dfw',timeLimitMs:300_000,enemyHealth:100,aggressionDistance:10_000,
  enemies:Object.freeze([
    Object.freeze({aircraft:'privateJet',livery:'nightowl-sunset-red',x:-13_000,z:-18_000,altitude:750}),
    Object.freeze({aircraft:'trainer',livery:'bluejay-skybolt',x:-13_000,z:-8_000,altitude:900}),
  ]),
  gates:Object.freeze([]),
});

// A heavy, aggressive opponent uses the same single-enemy combat lifecycle.
export const journeyDallas17 = Object.freeze({
  id: 'journey-dallas-17', cityId: 'dallas', name: 'IRON HUNTER', chapter: 'SKY HUNTERS', firstClearCredits: 2_250,
  startAirportId: 'executive', timeLimitMs: 360_000, enemyAircraft: 'cargo', enemyLivery: 'mammoth-desert-sand', enemyHealth: 250,
  enemyAltitude: 800, aggressionDistance: 10_000, patrolRadius: 2_000, cruiseSpeed: 400,
  enemySpawn: Object.freeze({ x: -15_100, z: 0 }),
});

// Chapter 2 finale; weapon pacing and damage are private to this encounter.
export const journeyDallas18 = Object.freeze({
  id: 'journey-dallas-18', cityId: 'dallas', name: 'FINAL SHOWDOWN', chapter: 'SKY HUNTERS', firstClearCredits: 2_400,
  startAirportId: 'dfw', timeLimitMs: 420_000, enemyAircraft: 'fighter', enemyLivery: 'firehawk-inferno', enemyHealth: 300,
  enemyAltitude: 900, aggressionDistance: 10_000, patrolRadius: 2_500, cruiseSpeed: 600,
  enemySpawn: Object.freeze({ x: -4_800, z: -13_600 }),
  enemyDamage: 20, shotIntervalMs: 750, burstShots: 2, burstPauseMs: 2_000,
});

export const journeyDallas19 = Object.freeze({
  id: 'journey-dallas-19', cityId: 'dallas', name: 'MONSTER ARRIVAL',
  chapter: 'CITY DEFENDERS', firstClearCredits: 2_550, startAirportId:'dfw', runwayStart:true,
  prepareMs: 0, timeLimitMs: 240_000, bossHealth: 2_500,
  monster: Object.freeze({ x: -5_500, z: -2_400, height: 960 }),
  airborneSpawn: Object.freeze({ x: -7_500, z: -3_555, altitude: 850, heading: -2.094, speed: 110 }),
});

// M20 retains its historical identity and reward, now a Titan boss encounter.
export const journeyDallas25 = Object.freeze({...journeyDallas19,id:'journey-dallas-25',bossHealth:500});

export const journeyDallas20 = Object.freeze({
  id:'journey-dallas-20',cityId:'dallas',name:'MONSTER STRIKES',chapter:'LEGENDARY SKIES',firstClearCredits:2700,
  prepareMs:0,timeLimitMs:240000,bossHealth:700,monster:Object.freeze({...journeyDallas19.monster,height:1920}),airborneSpawn:journeyDallas19.airborneSpawn,
  // Empty compatibility field: no gate can complete this boss mission.
  gates:Object.freeze([]),startAirportId:'love',
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

// The plane used by authoritative gate crossings.
export function journeyGatePlane(mission, gateIndex) {
  if(mission.id===journeyDallas20.id)return false;
  const gate = mission.gates[gateIndex];
  if (!gate) return null;
  const previous = mission.gates[Math.max(0, gateIndex - 1)];
  const next = mission.gates[Math.min(mission.gates.length - 1, gateIndex + 1)];
  const directionX = next.x - previous.x;
  const directionZ = next.z - previous.z;
  const length = Math.hypot(directionX, directionZ);
  if (length < 1) return null;
  return { normalX: directionX / length, normalZ: directionZ / length };
}

// Cross either face of the next Golden Gates ring within its accepted collision region.
// The caller supplies the authoritative terrain elevation at the gate.
export function journeyGateCrossing(from, to, gateIndex, terrainHeight, mission = journeyDallas01) {
  if(mission.id===journeyDallas20.id)return false;
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
  const plane = journeyGatePlane(mission, gateIndex);
  if (!plane) return false;
  const { normalX, normalZ } = plane;
  const before = (from.x - gate.x) * normalX + (from.z - gate.z) * normalZ;
  const after = (to.x - gate.x) * normalX + (to.z - gate.z) * normalZ;
  const crossed = (before < 0 && after >= 0) || (before > 0 && after <= 0);
  if (!crossed) return false;
  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const y = from.y + (to.y - from.y) * fraction - terrainHeight - gate.altitude;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  // Mission 4's solid torus reaches 1.12 radii. Include the existing 2.5-unit
  // aircraft collision sphere, but never the decorative 1.22-radius halo.
  const acceptedRadius = mission.id === journeyDallas04.id ? gate.radius * 1.12 + 2.5 + 1e-6 : gate.radius * .92;
  if (x * x + z * z > acceptedRadius ** 2) return false;
  if (gate.maxAltitude !== undefined && y + gate.altitude > gate.maxAltitude) return 'TOO_HIGH';
  return x * x + y * y + z * z <= acceptedRadius ** 2 ? 'VALID' : false;
}
export function crossesJourneyGate(from, to, gateIndex, terrainHeight) {
  return journeyGateCrossing(from, to, gateIndex, terrainHeight) === 'VALID';
}

// Journey slots can change without renaming persisted mission identities or reward receipts.
export const journeyMissionOrder = Object.freeze([1,2,3,4,5,6,13,14,15,16,17,18,7,8,9,10,11,12,25,20,21,22,23,19].map(number => `journey-dallas-${String(number).padStart(2,'0')}`));
export function journeyMissionSlot(missionId) { return journeyMissionOrder.indexOf(missionId) + 1; }
