import { dfwSpeedGates } from './city-challenges.mjs';

export const journeyDallas01 = Object.freeze({
  id: 'journey-dallas-01',
  cityId: 'dallas',
  name: 'DFW SKY RUSH',
  chapter: 'ROOKIE LEAGUE',
  timeLimitMs: 62_000,
  firstClearCredits: 250,
  gates: dfwSpeedGates,
});

// Cross the face of the ring in route order, within its illuminated opening.
// The caller supplies the authoritative terrain elevation at the gate.
export function crossesJourneyGate(from, to, gateIndex, terrainHeight) {
  const gate = journeyDallas01.gates[gateIndex];
  if (!gate || !Number.isFinite(terrainHeight)) return false;
  const previous = journeyDallas01.gates[Math.max(0, gateIndex - 1)];
  const next = journeyDallas01.gates[Math.min(journeyDallas01.gates.length - 1, gateIndex + 1)];
  const directionX = next.x - previous.x;
  const directionZ = next.z - previous.z;
  const length = Math.hypot(directionX, directionZ);
  if (length < 1) return false;
  const normalX = directionX / length;
  const normalZ = directionZ / length;
  const before = (from.x - gate.x) * normalX + (from.z - gate.z) * normalZ;
  const after = (to.x - gate.x) * normalX + (to.z - gate.z) * normalZ;
  if (before >= 0 || after < 0 || after === before) return false;
  const fraction = -before / (after - before);
  const x = from.x + (to.x - from.x) * fraction - gate.x;
  const y = from.y + (to.y - from.y) * fraction - terrainHeight - gate.altitude;
  const z = from.z + (to.z - from.z) * fraction - gate.z;
  return x * x + y * y + z * z <= (gate.radius * 0.92) ** 2;
}
