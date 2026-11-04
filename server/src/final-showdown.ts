import { journeyDallas18 } from '../../shared/journey-mission.mjs';

/** Per-opponent, server-owned pacing; ordinary Legendary weapons stay unchanged. */
export type FinalShowdownBurst = { shots: number; nextShotAt: number };
export function finalShowdownFireReady(burst: FinalShowdownBurst, now: number): boolean {
  return now >= burst.nextShotAt;
}
export function recordFinalShowdownShot(burst: FinalShowdownBurst, now: number): void {
  burst.shots += 1;
  const ended = burst.shots >= journeyDallas18.burstShots;
  burst.nextShotAt = now + (ended ? journeyDallas18.burstPauseMs : journeyDallas18.shotIntervalMs);
  if (ended) burst.shots = 0;
}
