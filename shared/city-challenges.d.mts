export type CityChallenge = { id: string; gateCount: number; timeLimit: number; reward: number; gates?: readonly { x: number; z: number; altitude: number; radius: number }[] };
export const dfwSpeedGates: readonly { x: number; z: number; altitude: number; radius: number }[];
export const cityChallenges: Record<'milwaukee' | 'dallas', readonly CityChallenge[]>;
export function challengeForCity(cityId: 'milwaukee' | 'dallas', challengeId: string): CityChallenge | undefined;
