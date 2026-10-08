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
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;
