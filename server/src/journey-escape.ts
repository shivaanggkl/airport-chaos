/** A server tick can only earn escape time after a live, close pursuit was observed. */
export function escapeInterval(
  pilot: { x: number; z: number }, hunter: { x: number; z: number },
  threshold: number, pilotReady: boolean, hunterReady: boolean, previouslyEngaged: boolean,
): { distance: number; engaged: boolean; valid: boolean } {
  const distance = Math.hypot(pilot.x - hunter.x, pilot.z - hunter.z);
  const ready = Number.isFinite(distance) && pilotReady && hunterReady;
  const engaged = previouslyEngaged || ready && distance < threshold;
  return { distance, engaged, valid: ready && engaged && distance >= threshold };
}
