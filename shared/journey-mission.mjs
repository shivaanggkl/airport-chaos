import { dfwSpeedGates, whiteRockLowGates } from './city-challenges.mjs';
import { cityAirports } from './city-airports.mjs';

export const journeyDallas01 = Object.freeze({
  id: 'journey-dallas-01',
  cityId: 'dallas',
  name: 'DFW SKY RUSH',
  chapter: 'ROOKIE LEAGUE',
  timeLimitMs: 62_000,
  firstClearCredits: 250,
  gates: dfwSpeedGates,
});

export const journeyDallas02 = Object.freeze({
  id: 'journey-dallas-02', cityId: 'dallas', name: 'HUNTER SHOWDOWN',
  chapter: 'ROOKIE LEAGUE', firstClearCredits: 350, targetHealth: 200,
  arenaRadius: 25_000, arenaCenter: Object.freeze({ x: cityAirports.dallas[0].x, z: cityAirports.dallas[0].z }),
});

export const journeyDallas03 = Object.freeze({
  id: 'journey-dallas-03', cityId: 'dallas', name: 'WHITE ROCK SKIMMER',
  chapter: 'ROOKIE LEAGUE', timeLimitMs: 64_000, firstClearCredits: 450,
  startAirportId: 'love', gates: whiteRockLowGates,
});

// Cross the face of the ring in route order, within its illuminated opening.
// The caller supplies the authoritative terrain elevation at the gate.
export function journeyGateCrossing(from, to, gateIndex, terrainHeight, mission = journeyDallas01) {
  const gate = mission.gates[gateIndex];
  if (!gate || !Number.isFinite(terrainHeight)) return false;
  const previous = mission.gates[Math.max(0, gateIndex - 1)];
  const next = mission.gates[Math.min(mission.gates.length - 1, gateIndex + 1)];
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
  if (x * x + z * z > (gate.radius * 0.92) ** 2) return false;
  if (gate.maxAltitude !== undefined && y + gate.altitude > gate.maxAltitude) return 'TOO_HIGH';
  return x * x + y * y + z * z <= (gate.radius * 0.92) ** 2 ? 'VALID' : false;
}
export function crossesJourneyGate(from, to, gateIndex, terrainHeight) {
  return journeyGateCrossing(from, to, gateIndex, terrainHeight) === 'VALID';
}
