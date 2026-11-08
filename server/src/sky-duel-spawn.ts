import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';

const airport = cityAirports.dallas.find(airport => airport.id === 'dfw')!;
export const skyDuelAirportIds = ['dfw', 'dfw'] as const;
export const skyDuelArenaCenter = { x: airport.x, z: airport.z };

export function skyDuelRunwaySpawn(slot: 0 | 1, runwayElevation: number): {
  position: { x: number; y: number; z: number }; heading: number;
} {
  const along = slot === 0 ? 2250 : -2250;
  return {
    position: {
      x: airport.x + along * Math.sin(airport.heading),
      y: runwayElevation + aircraftGroundOffset,
      z: airport.z + along * Math.cos(airport.heading),
    },
    // Aircraft forward is negative local Z: both slots depart away from center.
    heading: airport.heading + (slot === 0 ? Math.PI : 0),
  };
}
