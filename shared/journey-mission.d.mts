export type JourneyPoint = Readonly<{ x: number; y: number; z: number }>;
export const journeyDallas01: Readonly<{
  id: 'journey-dallas-01'; cityId: 'dallas'; name: 'DFW SKY RUSH'; chapter: 'ROOKIE LEAGUE';
  timeLimitMs: 62000; firstClearCredits: 250;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas02: Readonly<{
  id: 'journey-dallas-02'; cityId: 'dallas'; name: 'HUNTER SHOWDOWN'; chapter: 'ROOKIE LEAGUE';
  firstClearCredits: 350; targetHealth: 200; arenaRadius: 25000;
  arenaCenter: Readonly<{ x: number; z: number }>;
}>;
export const journeyDallas03: Readonly<{
  id: 'journey-dallas-03'; cityId: 'dallas'; name: 'WHITE ROCK SKIMMER'; chapter: 'ROOKIE LEAGUE';
  timeLimitMs: 64000; firstClearCredits: 450; startAirportId: 'love';
  gates: readonly { x: number; z: number; altitude: number; radius: number; maxAltitude: number }[];
}>;
export const journeyDallas04: Readonly<{
  id: 'journey-dallas-04'; cityId: 'dallas'; name: 'CLAIM THE SKIES'; chapter: 'ROOKIE LEAGUE';
  firstClearCredits: 500; startAirportId: 'love'; territoryId: 'white-rock'; holdMs: 30000;
}>;
export const journeyDallas05: Readonly<{
  id: 'journey-dallas-05'; cityId: 'dallas'; name: 'DOWNTOWN NEEDLE'; chapter: 'ROOKIE LEAGUE';
  timeLimitMs: 72000; firstClearCredits: 600; startAirportId: 'love';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas06: Readonly<{
  id: 'journey-dallas-06'; cityId: 'dallas'; name: 'ROOKIE CHAMPIONSHIP'; chapter: 'ROOKIE LEAGUE';
  timeLimitMs: 120000; firstClearCredits: 750; startAirportId: 'love'; finishAirportId: 'dfw';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas07: Readonly<{
  id: 'journey-dallas-07'; cityId: 'dallas'; name: 'SKY ELEVATOR'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 66000; firstClearCredits: 850; startAirportId: 'addison';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas08: Readonly<{
  id: 'journey-dallas-08'; cityId: 'dallas'; name: 'STAY ON HIS SIX'; chapter: 'SKY ADVENTURES';
  firstClearCredits: 950; startAirportId: 'love'; followMs: 15000;
  minDistance: 80; maxDistance: 280; maxTailAngle: number;
  maxHeadingDifference: number; maxAltitudeDifference: 100;
  leaderRoute: readonly Readonly<{ x: number; z: number }>[];
}>;
export const journeyDallas09: Readonly<{
  id: 'journey-dallas-09'; cityId: 'dallas'; name: 'ONE HEART LEFT'; chapter: 'SKY ADVENTURES';
  firstClearCredits: 1050; startAirportId: 'dfw'; startHealthFraction: 0.6;
  heartId: 'outer-northwest-heart';
  heart: { id: string; kind: 'heart'; x: number; z: number; radius: number; altitudeAgl: number };
}>;
export const journeyDallas10: Readonly<{
  id: 'journey-dallas-10'; cityId: 'dallas'; name: 'SKYLINE SLALOM'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 85000; firstClearCredits: 1150; startAirportId: 'love';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas11: Readonly<{
  id: 'journey-dallas-11'; cityId: 'dallas'; name: 'GRAVITY DROP'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 75000; firstClearCredits: 1250; prepareMs: 3000;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas12: Readonly<{
  id: 'journey-dallas-12'; cityId: 'dallas'; name: 'SKY PENDULUM'; chapter: 'SKY ADVENTURES';
  timeLimitMs: 120000; firstClearCredits: 1500; startAirportId: 'love';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas13: Readonly<{
  id: 'journey-dallas-13'; cityId: 'dallas'; name: 'REDLINE RUSH'; chapter: 'HIGH STAKES';
  timeLimitMs: 90000; firstClearCredits: 1650; startAirportId: 'love';
  speedThresholds: Readonly<Record<'trainer' | 'privateJet' | 'cargo' | 'fighter', number>>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas14: Readonly<{
  id: 'journey-dallas-14'; cityId: 'dallas'; name: 'ESCAPE VECTOR'; chapter: 'HIGH STAKES';
  firstClearCredits: 1800; startAirportId: 'love'; escapeDistance: 450; escapeMs: 10000;
}>;
export const journeyDallas15: Readonly<{
  id: 'journey-dallas-15'; cityId: 'dallas'; name: 'ACE INTERCEPT'; chapter: 'HIGH STAKES';
  firstClearCredits: 1950; startAirportId: 'love'; bossName: 'ACE HUNTER'; bossHealth: 300;
}>;
export const journeyDallas16: Readonly<{
  id: 'journey-dallas-16'; cityId: 'dallas'; name: 'CROSSFIRE ESCAPE'; chapter: 'HIGH STAKES';
  firstClearCredits: 2100; startAirportId: 'love';
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas17: Readonly<{
  id: 'journey-dallas-17'; cityId: 'dallas'; name: 'CRITICAL APPROACH'; chapter: 'HIGH STAKES';
  firstClearCredits: 2250; startHealthFraction: 0.45; finishAirportId: 'dfw'; requiredLandingScore: 780;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  heartId: 'mission-17-dfw-heart';
  heart: Readonly<{ id: string; kind: 'heart'; x: number; z: number; radius: number; altitudeAgl: number }>;
}>;
export const journeyDallas18: Readonly<{
  id: 'journey-dallas-18'; cityId: 'dallas'; name: 'SKY SIEGE'; chapter: 'HIGH STAKES';
  firstClearCredits: 2400; startAirportId: 'love'; territoryId: 'las-colinas';
  captureMs: 24000; defenseMs: 40000; defenseRadius: 2800; hunterDelayMs: 2500;
}>;
export const journeyDallas19: Readonly<{
  id: 'journey-dallas-19'; cityId: 'dallas'; name: 'WANTED BREAKOUT'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 2550; prepareMs: 3000; timeLimitMs: 75000;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  hunterOffset: Readonly<{ x: number; z: number }>;
  exit: Readonly<{ x: number; z: number; altitude: number; radius: number; normalX: number; normalZ: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export const journeyDallas20: Readonly<{
  id: 'journey-dallas-20'; cityId: 'dallas'; name: 'SKYLINE SWITCHBACK'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 2700; startAirportId: 'love'; timeLimitMs: 110000;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export const journeyDallas21: Readonly<{
  id: 'journey-dallas-21'; cityId: 'dallas'; name: 'TWO FRONTS'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 2850; startAirportId: 'love'; alphaTerritoryId: 'addison';
  bravoTerritoryId: 'dallas-executive'; captureMs: 6000; transferMs: 120000;
}>;
export const journeyDallas22: Readonly<{
  id: 'journey-dallas-22'; cityId: 'dallas'; name: 'PERFECT APPROACH'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 3000; prepareMs: 3000; finishAirportId: 'dfw'; approachRestartZ: number;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export const journeyDallas23: Readonly<{
  id: 'journey-dallas-23'; cityId: 'dallas'; name: 'DOUBLE TROUBLE'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 3150; startAirportId: 'love'; hunterHealth: 200;
  heartId: 'mission-23-repair-heart'; heartRadius: 115; hunterTwoDelayMs: 2500;
}>;
export const journeyDallas24: Readonly<{
  id: 'journey-dallas-24'; cityId: 'dallas'; name: 'LEGENDARY CHAMPIONSHIP'; chapter: 'LEGENDARY SKIES';
  firstClearCredits: 4000; startAirportId: 'love'; finishAirportId: 'dfw'; bossHealth: 300;
  gates: readonly { x: number; z: number; altitude: number; radius: number;
    normalX: number; normalY: number; normalZ: number }[];
}>;
export function journeyExitCrossing(from: JourneyPoint, to: JourneyPoint, terrainHeight: number,
  mission?: typeof journeyDallas19): boolean;
export function journeyGateCrossing(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number,
  mission?: typeof journeyDallas01 | typeof journeyDallas03 | typeof journeyDallas05 | typeof journeyDallas06 | typeof journeyDallas07 | typeof journeyDallas10 | typeof journeyDallas11 | typeof journeyDallas12 | typeof journeyDallas13 | typeof journeyDallas16 | typeof journeyDallas20 | typeof journeyDallas22 | typeof journeyDallas24): false | 'VALID' | 'TOO_HIGH';
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;
