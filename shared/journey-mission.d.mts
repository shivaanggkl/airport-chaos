export type JourneyPoint = Readonly<{ x: number; y: number; z: number }>;
export const journeyDallas01: Readonly<{
  id: 'journey-dallas-01'; cityId: 'dallas'; name: 'DFW SKY RUSH'; chapter: 'ROOKIE LEAGUE';
  timeLimitMs: 62000; firstClearCredits: 250;
  gates: readonly { x: number; z: number; altitude: number; radius: number }[];
}>;
export function crossesJourneyGate(from: JourneyPoint, to: JourneyPoint, gateIndex: number, terrainHeight: number): boolean;
