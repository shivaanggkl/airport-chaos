import { cityAirports, aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { competitiveModes } from '../../shared/competitive-modes.mjs';

const dfw = cityAirports.dallas.find(airport => airport.id === 'dfw')!;

export function skyDuelRunwaySpawn(slot: 0 | 1, runwayElevation: number): {
  position: { x: number; y: number; z: number }; heading: number;
} {
  const lateral = competitiveModes.skyDuel.runwayLaterals[slot];
  const along = Math.min(dfw.runwayLength * 0.32, dfw.runwayLength * 0.5 - 120);
  const sine = Math.sin(dfw.heading), cosine = Math.cos(dfw.heading);
  return {
    position: {
      x: dfw.x + lateral * cosine + along * sine,
      y: runwayElevation + aircraftGroundOffset,
      z: dfw.z - lateral * sine + along * cosine,
    },
    heading: dfw.heading,
  };
}
