import { transportTuning } from './giant-incoming.mjs';
import { remoteAircraftScale } from './remote-aircraft-visual-rules.mjs';
import { addisonClimbGates } from './city-challenges.mjs';
import { cityAirports } from './city-airports.mjs';
import { DALLAS_WORLD_SCALE, scaleDallasPoint } from './dallas-world-scale.mjs';

export const journeyPauseLimitMs = 120_000;

const baseJourneyDallas01 = Object.freeze({
  id: 'journey-dallas-01',
  cityId: 'dallas',
  name: 'ROOKIE RUSH',
  objective: 'Fly through 10 Golden Gates before time runs out.',
  chapter: 'GOLDEN GATES',
  timeLimitMs: 60_000, // 3:00 after the single Dallas world-scale conversion.
  firstClearCredits: 250,
  airborneSpawn: Object.freeze({ x: -6_200, z: -8_400, altitude: 840, heading: -Math.PI * .75, speed: 650 }),
  // Love Field and the skyline fill the opening view. A broad clockwise arc
  // ends beside the Trinity without asking new pilots for a sharp turn.
  gates: Object.freeze([
    { x: -5360, z: -7560, altitude: 840, radius: 340 },
    { x: -3340, z: -5760, altitude: 845, radius: 335 },
    { x: -1580, z: -4165, altitude: 850, radius: 330 },
    { x: 290, z: -2515, altitude: 860, radius: 325 },
    { x: 2200, z: -900, altitude: 870, radius: 320 },
    { x: 2400, z: 1300, altitude: 870, radius: 315 },
    { x: 1000, z: 3300, altitude: 860, radius: 310 },
    { x: -1300, z: 4000, altitude: 850, radius: 305 },
    { x: -3500, z: 3500, altitude: 845, radius: 300 },
    { x: -5100, z: 1800, altitude: 840, radius: 350 },
  ]),
});

const baseJourneyDallas02 = Object.freeze({
  id: 'journey-dallas-02', cityId: 'dallas', name: 'LAKE RACER',
  objective: 'Fly through 10 Golden Gates before time runs out.',
  courseRevision: 1,
  chapter: 'GOLDEN GATES', firstClearCredits: 350, timeLimitMs: 65_000, // 3:15 after Dallas scaling.
  airborneSpawn: Object.freeze({ x: 462.3333333333333, z: -15_441, altitude: 770, heading: -Math.PI / 2, speed: 650 }),
  // Two broad opposing bends pass along White Rock Lake's western approach.
  gates: Object.freeze([
    { x: 1629, z: -15441, altitude: 770, radius: 320 },
    { x: 4162, z: -15441, altitude: 780, radius: 315 },
    { x: 6238, z: -13988, altitude: 795, radius: 310 },
    { x: 7104, z: -11607, altitude: 810, radius: 305 },
    { x: 6238, z: -9227, altitude: 825, radius: 300 },
    { x: 4162, z: -7773, altitude: 840, radius: 295 },
    { x: 3296, z: -5393, altitude: 850, radius: 290 },
    { x: 4162, z: -3012, altitude: 845, radius: 285 },
    { x: 6238, z: -1559, altitude: 825, radius: 285 },
    { x: 8771, z: -1559, altitude: 800, radius: 330 },
  ]),
});

const baseJourneyDallas03 = Object.freeze({
  id: 'journey-dallas-03', cityId: 'dallas', name: 'GOLDEN ASCENT',
  objective: 'Fly through 10 Golden Gates while climbing and descending before time runs out.',
  courseRevision: 1,
  chapter: 'GOLDEN GATES', timeLimitMs: 70_000, firstClearCredits: 450, // 3:30 after Dallas scaling.
  airborneSpawn: Object.freeze({ x: -5366.666666666667, z: -20_000, altitude: 700, heading: -Math.PI / 2, speed: 650 }),
  // Broad North Dallas arc: gates 1–5 climb, then gates 6–10 descend.
  gates: Object.freeze([
    { x: -4200, z: -20000, altitude: 700, radius: 310 },
    { x: -1467, z: -20000, altitude: 800, radius: 300 },
    { x: 1225, z: -19525, altitude: 900, radius: 290 },
    { x: 3702, z: -18370, altitude: 1000, radius: 285 },
    { x: 5459, z: -16276, altitude: 1100, radius: 280 },
    { x: 5934, z: -13585, altitude: 1020, radius: 275 },
    { x: 4999, z: -11016, altitude: 940, radius: 270 },
    { x: 2905, z: -9259, altitude: 860, radius: 265 },
    { x: 213, z: -8784, altitude: 780, radius: 260 },
    { x: -2355, z: -9719, altitude: 700, radius: 330 },
  ]),
});

const baseJourneyDallas04 = Object.freeze({
  id: 'journey-dallas-04', cityId: 'dallas', name: 'DOWNTOWN SLALOM',
  objective: 'Fly through 10 Golden Gates while making alternating turns before time runs out.',
  courseRevision: 1,
  chapter: 'GOLDEN GATES', firstClearCredits: 500, timeLimitMs: 70_000, // 3:30 after Dallas scaling.
  airborneSpawn: Object.freeze({ x: -13466.666666666667, z: 1000, altitude: 850, heading: -Math.PI / 2, speed: 650 }),
  // Alternating 30-degree turns cross the western approach, Trinity and Downtown.
  gates: Object.freeze([
    { x: -12300, z: 1000, altitude: 850, radius: 325 },
    { x: -9563, z: 1733, altitude: 865, radius: 310 },
    { x: -6826, z: 1000, altitude: 900, radius: 300 },
    { x: -4090, z: 1733, altitude: 935, radius: 290 },
    { x: -1353, z: 1000, altitude: 960, radius: 280 },
    { x: 1384, z: 1733, altitude: 945, radius: 275 },
    { x: 4121, z: 1000, altitude: 910, radius: 270 },
    { x: 6858, z: 1733, altitude: 880, radius: 265 },
    { x: 9594, z: 1000, altitude: 860, radius: 260 },
    { x: 12331, z: 1733, altitude: 850, radius: 340 },
  ]),
});

const baseJourneyDallas05 = Object.freeze({
  id: 'journey-dallas-05', cityId: 'dallas', name: 'NEEDLE RUSH',
  objective: 'Fly through 10 increasingly precise Golden Gates before time runs out.',
  courseRevision: 1,
  chapter: 'GOLDEN GATES', timeLimitMs: 75_000, firstClearCredits: 600, // 3:45 after Dallas scaling.
  airborneSpawn: Object.freeze({ x: -15666.666666666667, z: -12500, altitude: 730, heading: -Math.PI / 2, speed: 650 }),
  // Las Colinas to Trinity: gradual bends keep the shrinking openings easy to line up.
  gates: Object.freeze([
    { x: -14500, z: -12500, altitude: 730, radius: 300 },
    { x: -11513, z: -11973, altitude: 755, radius: 290 },
    { x: -8764, z: -10691, altitude: 780, radius: 275 },
    { x: -6440, z: -8742, altitude: 810, radius: 260 },
    { x: -4700, z: -6257, altitude: 840, radius: 250 },
    { x: -3663, z: -3406, altitude: 870, radius: 245 },
    { x: -3398, z: -385, altitude: 900, radius: 240 },
    { x: -3925, z: 2603, altitude: 880, radius: 235 },
    { x: -5207, z: 5352, altitude: 840, radius: 230 },
    { x: -7157, z: 7675, altitude: 800, radius: 225 },
  ]),
});

const baseJourneyDallas06 = Object.freeze({
  id: 'journey-dallas-06', cityId: 'dallas', name: 'GOLDEN CHAMPIONSHIP',
  objective: 'Fly through 10 Golden Gates before time runs out.',
  courseRevision: 1,
  chapter: 'GOLDEN GATES', timeLimitMs: 80_000, firstClearCredits: 750, // 4:00 after Dallas scaling.
  airborneSpawn: Object.freeze({ x: 5900, z: -8720, altitude: 780, heading: Math.atan2(900, -720), speed: 650 }),
  // White Rock to Trinity and Executive: broad curves, alternating turns, then a precise finish.
  gates: Object.freeze([
    { x: 5000, z: -8000, altitude: 780, radius: 300 },
    { x: 2500, z: -6000, altitude: 820, radius: 290 },
    { x: -700, z: -6000, altitude: 860, radius: 280 },
    { x: -3000, z: -3800, altitude: 900, radius: 265 },
    { x: -5800, z: -3000, altitude: 850, radius: 255 },
    { x: -6400, z: -450, altitude: 920, radius: 245 },
    { x: -4100, z: 2300, altitude: 980, radius: 235 },
    { x: -4100, z: 5500, altitude: 900, radius: 225 },
    { x: -5300, z: 8500, altitude: 820, radius: 215 },
    { x: -6700, z: 11400, altitude: 780, radius: 205 },
  ]),
});

const baseJourneyDallas07 = Object.freeze({
  id: 'journey-dallas-07', cityId: 'dallas', name: 'GIANT PLANE',
  chapter: 'SKY SIEGE', timeLimitMs: transportTuning.durationMs, firstClearCredits: 850,
  startAirportId: 'dfw', gates: Object.freeze([]), bossHealth: transportTuning.health,
});

const baseJourneyDallas08 = Object.freeze({
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

const baseJourneyDallas09 = Object.freeze({
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

const baseJourneyDallas10 = Object.freeze({
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

const baseJourneyDallas11 = Object.freeze({
  id: 'journey-dallas-11', cityId: 'dallas', name: 'ARMORED GIANT PLANE',
  chapter: 'SKY ADVENTURES', timeLimitMs: 330_000, firstClearCredits: 1_250,
  startAirportId: 'dfw', turretHealth: 250, coreHealth: 1_500,
  hatch: Object.freeze({ z: 22.05, bottom: -0.45, width: 3.85, height: 3.35 }),
  coreLocal: Object.freeze({ x: 0, y: 1.2, z: 21.2 }), coreRadius: 0.9,
  gunBurstIntervalMs: 3_000, gunWarningMs: 1_000,
  gunShotSpacingMs: 250, gunShotDamage: 10,
});

const baseJourneyDallas12 = Object.freeze({
  id: 'journey-dallas-12', cityId: 'dallas', name: 'ARMORED GIANT PLANE & TWO ESCORTS',
  chapter: 'SKY ADVENTURES', timeLimitMs: 360_000, firstClearCredits: 1_500,
  startAirportId: 'dfw', turretHealth: baseJourneyDallas11.turretHealth, coreHealth: 1_750,
  escortCount: 2, escortScale: baseJourneyDallas10.escortScale,
  escortHealth: Object.freeze([175, 225]),
  escortAircraft: Object.freeze(['privateJet', 'fighter']),
  escortLiveries: Object.freeze(['nightowl-forest', 'firehawk-inferno']),
  escortFireDelayMs: baseJourneyDallas10.escortFireDelayMs,
  escortBurstIntervalMs: baseJourneyDallas10.escortBurstIntervalMs,
  escortShotSpacingMs: baseJourneyDallas10.escortShotSpacingMs,
  escortShotDamage: baseJourneyDallas10.escortShotDamage,
  gunBurstIntervalMs: baseJourneyDallas11.gunBurstIntervalMs,
  gunWarningMs: baseJourneyDallas11.gunWarningMs,
  gunShotSpacingMs: baseJourneyDallas11.gunShotSpacingMs,
  gunShotDamage: baseJourneyDallas11.gunShotDamage,
});

// Keep the historical identity: this combat mission is displayed Journey slot 7.
const firstContactDfw = { x: -22_800, z: -13_600 };
const baseJourneyDallas13 = Object.freeze({
  id: 'journey-dallas-13', cityId: 'dallas', name: 'FIRST CONTACT',
  chapter: 'SKY HUNTERS', timeLimitMs: 80_000, firstClearCredits: 1_650,
  startAirportId: 'dfw', enemyAircraft: 'privateJet', enemyLivery: 'nightowl-sunset-red',
  enemyHealth: 150, enemyAltitude: 800, aggressionDistance: 3_500,
  patrolRadius: 1_500, cruiseSpeed: 400,
  enemySpawn: Object.freeze({
    x: firstContactDfw.x + 300,
    z: firstContactDfw.z - 6_500,
  }),
});

const baseJourneyDallas14 = Object.freeze({
  id: 'journey-dallas-14', cityId: 'dallas', name: 'SURPRISE ATTACK',
  chapter: 'SKY HUNTERS', timeLimitMs: 80_000, firstClearCredits: 1_800,
  startAirportId: 'love', enemyAircraft: 'trainer', enemyLivery: 'bluejay-aurora',
  enemyHealth: 150, enemyAltitude: 800, aggressionDistance: 10_000,
  patrolRadius: 1_500, cruiseSpeed: 460, warningMs: 3_000, rearApproachMs: 18_000,
  // Trailing Love Field’s northbound departure, 16 km from the airport center.
  enemySpawn: Object.freeze({ x: -5_140 - 600, z: -7_780 + Math.sqrt((16_000 / 3) ** 2 - 600 ** 2) }),
});

const baseJourneyDallas15 = Object.freeze({
  id: 'journey-dallas-15', cityId: 'dallas', name: 'HOT PURSUIT',
  chapter: 'SKY HUNTERS', firstClearCredits: 1_950, timeLimitMs: 90_000,
  startAirportId: 'addison', bossName: 'ESCAPING MAMMOTH', bossHealth: 200,
  enemyAircraft: 'cargo', enemyLivery: 'mammoth-sand', enemyAltitude: 800,
  enemySpawn: Object.freeze({x:-23_000 / DALLAS_WORLD_SCALE,z:-74_000 / DALLAS_WORLD_SCALE}), cruiseSpeed: 420, threatDistance: 10_000, arrivalRadius: 650,
  // A continuous North Dallas escape corridor, kept inside the scaled world and Hunter turning margin.
  escapeRoute: Object.freeze([
    Object.freeze({x:-45_000 / DALLAS_WORLD_SCALE,z:-68_000 / DALLAS_WORLD_SCALE}),
    Object.freeze({x:-58_000 / DALLAS_WORLD_SCALE,z:-50_000 / DALLAS_WORLD_SCALE}),
    Object.freeze({x:-59_000 / DALLAS_WORLD_SCALE,z:-40_000 / DALLAS_WORLD_SCALE}),
  ]),
});

// Two independently flying opponents share permission to initiate shots.
const baseJourneyDallas16 = Object.freeze({
  id:'journey-dallas-16',cityId:'dallas',name:'DOUBLE THREAT',chapter:'SKY HUNTERS',
  firstClearCredits:2_100,startAirportId:'dfw',timeLimitMs:100_000,enemyHealth:100,aggressionDistance:8_000 / DALLAS_WORLD_SCALE,
  enemies:Object.freeze([
    Object.freeze({aircraft:'privateJet',livery:'nightowl-sunset-red',x:-65_000 / DALLAS_WORLD_SCALE,z:-53_500 / DALLAS_WORLD_SCALE,altitude:750}),
    Object.freeze({aircraft:'trainer',livery:'bluejay-skybolt',x:-57_000 / DALLAS_WORLD_SCALE,z:-51_000 / DALLAS_WORLD_SCALE,altitude:900}),
  ]),
  gates:Object.freeze([]),
});

// A heavy, aggressive opponent uses the same single-enemy combat lifecycle.
const baseJourneyDallas17 = Object.freeze({
  id: 'journey-dallas-17', cityId: 'dallas', name: 'IRON HUNTER', chapter: 'SKY HUNTERS', firstClearCredits: 2_250,
  startAirportId: 'executive', timeLimitMs: 110_000, enemyAircraft: 'cargo', enemyLivery: 'mammoth-desert-sand', enemyHealth: 250,
  enemyAltitude: 800, aggressionDistance: 6_000 / DALLAS_WORLD_SCALE, patrolRadius: 2_000, cruiseSpeed: 400,
  enemySpawn: Object.freeze({ x: -10_500 / DALLAS_WORLD_SCALE, z: 16_000 / DALLAS_WORLD_SCALE }),
});

// Chapter 2 finale; weapon pacing and damage are private to this encounter.
const baseJourneyDallas18 = Object.freeze({
  id: 'journey-dallas-18', cityId: 'dallas', name: 'FINAL SHOWDOWN', chapter: 'SKY HUNTERS', firstClearCredits: 2_400,
  startAirportId: 'dfw', timeLimitMs: 120_000, enemyAircraft: 'fighter', enemyLivery: 'firehawk-inferno', enemyHealth: 300,
  enemyAltitude: 900, aggressionDistance: 8_000 / DALLAS_WORLD_SCALE, patrolRadius: 2_500, cruiseSpeed: 600,
  enemySpawn: Object.freeze({ x: -47_500 / DALLAS_WORLD_SCALE, z: -48_000 / DALLAS_WORLD_SCALE }),
  enemyDamage: 20, shotIntervalMs: 750, burstShots: 2, burstPauseMs: 2_000,
});

const baseJourneyDallas19 = Object.freeze({
  id: 'journey-dallas-19', cityId: 'dallas', name: 'FINAL MONSTER BATTLE',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 4_000, startAirportId:'dfw', runwayStart:true,
  prepareMs: 0, timeLimitMs: 300_000, bossHealth: 1_500,
  monster: Object.freeze({ x: -5_500, z: -2_400, height: 1920 }),
  airborneSpawn: Object.freeze({ x: -7_500, z: -3_555, altitude: 850, heading: -2.094, speed: 110 }),
});

// Visible M19 keeps its approved beginner settings independently of the finale.
const baseJourneyDallas25 = Object.freeze({...baseJourneyDallas19,id:'journey-dallas-25',
 name:'MONSTER ARRIVAL',chapter:'CITY DEFENDERS',firstClearCredits:2550,timeLimitMs:240000,bossHealth:500,
 monster:Object.freeze({...baseJourneyDallas19.monster,height:960}),
});

const baseJourneyDallas20 = Object.freeze({
  id:'journey-dallas-20',cityId:'dallas',name:'MONSTER STRIKES',chapter:'LEGENDARY SKIES',firstClearCredits:2700,
  prepareMs:0,timeLimitMs:240000,bossHealth:700,monster:Object.freeze({...baseJourneyDallas19.monster,height:1920}),airborneSpawn:baseJourneyDallas19.airborneSpawn,
  // Empty compatibility field: no gate can complete this boss mission.
  gates:Object.freeze([]),startAirportId:'dfw',runwayStart:true,
});

const baseJourneyDallas21 = Object.freeze({
  id: 'journey-dallas-21', cityId: 'dallas', name: 'MONSTER HUNT',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 2_850,
  startAirportId: 'love', prepareMs:0,timeLimitMs:240000,bossHealth:900,monster:baseJourneyDallas20.monster,airborneSpawn:baseJourneyDallas20.airborneSpawn,
  // Compatibility metadata for historical territory records only.
  alphaTerritoryId: 'addison', bravoTerritoryId: 'dallas-executive',
  captureMs: 6_000, transferMs: 120_000,
});

const baseJourneyDallas22 = Object.freeze({
  id:'journey-dallas-22',cityId:'dallas',name:'MONSTER SHOWDOWN',chapter:'LEGENDARY SKIES',firstClearCredits:3000,
  startAirportId:'dfw',runwayStart:true,prepareMs:0,timeLimitMs:240000,bossHealth:1100,
  monster:baseJourneyDallas20.monster,airborneSpawn:baseJourneyDallas19.airborneSpawn,
  // Compatibility fields never advance the retired landing objective.
  finishAirportId:'dfw',approachRestartZ:-23400,gates:Object.freeze([]),
});

const baseJourneyDallas23 = Object.freeze({
  id: 'journey-dallas-23', cityId: 'dallas', name: 'MONSTER PURSUIT',
  chapter: 'LEGENDARY SKIES', firstClearCredits: 3_150, startAirportId: 'love',
  prepareMs:0,timeLimitMs:240000,bossHealth:1000,monster:baseJourneyDallas20.monster,airborneSpawn:baseJourneyDallas20.airborneSpawn,
  // Compatibility metadata only; no aircraft or repair-heart objectives remain.
  hunterHealth: 200, heartId: 'mission-23-repair-heart', heartRadius: 115,
  hunterTwoDelayMs: 2_500,
});

// One forward route from Love Field into the open west side of downtown.
const baseJourneyDallas24 = Object.freeze({
  id: 'journey-dallas-24', cityId: 'dallas', name: 'LEGENDARY CHAMPIONSHIP',
  chapter: 'LEGENDARY SKIES', startAirportId: 'love', finishAirportId: 'dfw',
  firstClearCredits: 4_000, bossHealth: 300,
  gates: Object.freeze([
    { x: -6_000, z: -10_500, altitude: 500, radius: 190, normalX: -.301, normalY: .105, normalZ: -.948 },
    { x: -7_600, z: -11_800, altitude: 570, radius: 130, normalX: -.775, normalY: .033, normalZ: -.631 },
    { x: -9_500, z: -13_100, altitude: 620, radius: 82, normalX: -.825, normalY: .017, normalZ: -.565 },
  ]),
});

// Mission coordinates are authored against the unscaled Dallas source map.
// Keep aircraft speed, handling, and model-local geometry unchanged.
const scaleDallasJourney = mission => Object.freeze({
  ...mission,
  ...(mission.timeLimitMs === undefined || mission.id === 'journey-dallas-07' ? {} : { timeLimitMs: mission.timeLimitMs * DALLAS_WORLD_SCALE }),
  ...(mission.airborneSpawn ? { airborneSpawn: Object.freeze({ ...scaleDallasPoint(mission.airborneSpawn), altitude: mission.airborneSpawn.altitude * DALLAS_WORLD_SCALE }) } : {}),
  ...(mission.gates ? { gates: Object.freeze(mission.gates.map(gate => Object.freeze({ ...scaleDallasPoint(gate), altitude: gate.altitude * DALLAS_WORLD_SCALE, radius: gate.radius * DALLAS_WORLD_SCALE }))) } : {}),
  ...(mission.leaderRoute ? { leaderRoute: Object.freeze(mission.leaderRoute.map(scaleDallasPoint)) } : {}),
  ...(mission.escapeRoute ? { escapeRoute: Object.freeze(mission.escapeRoute.map(scaleDallasPoint)) } : {}),
  ...(mission.enemySpawn ? { enemySpawn: Object.freeze(scaleDallasPoint(mission.enemySpawn)) } : {}),
  ...(mission.enemies ? { enemies: Object.freeze(mission.enemies.map(enemy => Object.freeze({ ...scaleDallasPoint(enemy), altitude: enemy.altitude * DALLAS_WORLD_SCALE }))) } : {}),
  ...(mission.monster ? { monster: Object.freeze(scaleDallasPoint(mission.monster)) } : {}),
  ...Object.fromEntries(['enemyAltitude', 'aggressionDistance', 'patrolRadius', 'threatDistance', 'arrivalRadius', 'approachRestartZ'].filter(key => mission[key] !== undefined).map(key => [key, mission[key] * DALLAS_WORLD_SCALE])),
});
export const journeyDallas01 = scaleDallasJourney(baseJourneyDallas01);
export const journeyDallas02 = scaleDallasJourney(baseJourneyDallas02);
export const journeyDallas03 = scaleDallasJourney(baseJourneyDallas03);
export const journeyDallas04 = scaleDallasJourney(baseJourneyDallas04);
export const journeyDallas05 = scaleDallasJourney(baseJourneyDallas05);
export const journeyDallas06 = scaleDallasJourney(baseJourneyDallas06);
export const journeyDallas07 = scaleDallasJourney(baseJourneyDallas07);
export const journeyDallas08 = scaleDallasJourney(baseJourneyDallas08);
export const journeyDallas09 = scaleDallasJourney(baseJourneyDallas09);
export const journeyDallas10 = scaleDallasJourney(baseJourneyDallas10);
export const journeyDallas11 = scaleDallasJourney(baseJourneyDallas11);
export const journeyDallas12 = scaleDallasJourney(baseJourneyDallas12);
export const journeyDallas13 = scaleDallasJourney(baseJourneyDallas13);
export const journeyDallas14 = scaleDallasJourney(baseJourneyDallas14);
export const journeyDallas15 = scaleDallasJourney(baseJourneyDallas15);
export const journeyDallas16 = scaleDallasJourney(baseJourneyDallas16);
export const journeyDallas17 = scaleDallasJourney(baseJourneyDallas17);
export const journeyDallas18 = scaleDallasJourney(baseJourneyDallas18);
export const journeyDallas19 = scaleDallasJourney(baseJourneyDallas19);
export const journeyDallas20 = scaleDallasJourney(baseJourneyDallas20);
export const journeyDallas21 = scaleDallasJourney(baseJourneyDallas21);
export const journeyDallas22 = scaleDallasJourney(baseJourneyDallas22);
export const journeyDallas23 = scaleDallasJourney(baseJourneyDallas23);
export const journeyDallas24 = scaleDallasJourney(baseJourneyDallas24);
export const journeyDallas25 = scaleDallasJourney(baseJourneyDallas25);

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
