import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';

const duelAirports = [
  cityAirports.dallas.find(airport => airport.id === 'dfw')!,
  cityAirports.dallas.find(airport => airport.id === 'love')!,
] as const;

export const skyDuelAirportIds = [duelAirports[0].id, duelAirports[1].id] as const;
export const skyDuelArenaCenter = {
  x: (duelAirports[0].x + duelAirports[1].x) / 2,
  z: (duelAirports[0].z + duelAirports[1].z) / 2,
};

export function skyDuelRunwaySpawn(slot: 0 | 1, runwayElevation: number): {
  position: { x: number; y: number; z: number }; heading: number;
} {
  const airport = duelAirports[slot];
  const along = Math.min(airport.runwayLength * 0.32, airport.runwayLength * 0.5 - 120);
  const sine = Math.sin(airport.heading);
  const cosine = Math.cos(airport.heading);
  return {
    position: {
      x: airport.x + along * sine,
      y: runwayElevation + aircraftGroundOffset,
      z: airport.z + along * cosine,
    },
    heading: airport.heading,
  };
}
