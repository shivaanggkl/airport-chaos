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
export function journeyGateCrossing(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number,
  mission?: typeof journeyDallas01 | typeof journeyDallas03 | typeof journeyDallas05 | typeof journeyDallas06 | typeof journeyDallas07 | typeof journeyDallas10 | typeof journeyDallas11 | typeof journeyDallas12 | typeof journeyDallas13): false | 'VALID' | 'TOO_HIGH';
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;
