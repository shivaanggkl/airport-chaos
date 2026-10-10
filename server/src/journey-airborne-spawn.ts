import type { JourneyAttempt } from './journey-attempts.js';

type AirborneMission = Readonly<{
  id: string;
  airborneSpawn: Readonly<{ x: number; z: number; altitude: number; heading: number; speed: number }>;
}>;

/** Called only after the authenticated attempt has entered APPROACH. The
 * server computes world Y and sends the result; no client coordinates are read. */
export function authorizedJourneyAirborneSpawn(
  attempt: Pick<JourneyAttempt, 'missionId' | 'status'> | undefined,
  mission: AirborneMission,
  terrainAt: (x: number, z: number) => number,
): { position: { x: number; y: number; z: number }; heading: number; speed: number } | undefined {
  if (attempt?.missionId !== mission.id || attempt.status !== 'APPROACH') return undefined;
  const { x, z, altitude, heading, speed } = mission.airborneSpawn;
  const terrain = terrainAt(x, z);
  if (![x, z, altitude, heading, speed, terrain].every(Number.isFinite) || altitude <= 0 || speed <= 0)
    throw new Error('Invalid Journey airborne spawn');
  return { position: { x, y: terrain + altitude, z }, heading, speed };
}
