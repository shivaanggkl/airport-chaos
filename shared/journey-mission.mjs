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

export const journeyDallas04 = Object.freeze({
  id: 'journey-dallas-04', cityId: 'dallas', name: 'CLAIM THE SKIES',
  chapter: 'ROOKIE LEAGUE', firstClearCredits: 500,
  startAirportId: 'love', territoryId: 'white-rock', holdMs: 30_000,
});

// Cross the face of the next ring within its illuminated opening. White Rock
// accepts either approach direction; DFW Sky Rush keeps its forward route.
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
  const forward = before < 0 && after >= 0;
  const reverse = mission.id === journeyDallas03.id && before > 0 && after <= 0;
  if (!forward && !reverse) return false;
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
