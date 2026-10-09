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
export function journeyGateCrossing(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number,
  mission?: typeof journeyDallas01 | typeof journeyDallas03): false | 'VALID' | 'TOO_HIGH';
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;
