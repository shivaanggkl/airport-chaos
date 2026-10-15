export const monsterHandSwipe: Readonly<{
  durationMs: number;
  cooldownMs: number;
  activationRadius: number;
  hitRadius: number;
  damage: number;
  maxReachRatio: number;
  rest: Readonly<{ x: number; y: number; z: number }>;
  armOrigin: Readonly<{ x: number; y: number; z: number }>;
}>;
export function monsterHandSwipeWeight(progress: number): number;
