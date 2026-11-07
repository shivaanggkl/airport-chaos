import { cityAirports } from '../../shared/city-airports.mjs';
import { DALLAS_WORLD_SCALE } from '../../shared/dallas-world-scale.mjs';

type HorizontalPoint = { x: number; z: number };

const turnInset = 3_000 * DALLAS_WORLD_SCALE;
const hardInset = 20;
// Preserve the established Dallas Hunter envelope for later combat missions;
// it no longer belongs to Mission 2's race definition.
export const journeyHunterArena = { center: { x: cityAirports.dallas[0].x, z: cityAirports.dallas[0].z }, radius: 25_000 * DALLAS_WORLD_SCALE };

export function insideJourneyHunterArena(point: HorizontalPoint): boolean {
  return Math.abs(point.x - journeyHunterArena.center.x) <= journeyHunterArena.radius &&
    Math.abs(point.z - journeyHunterArena.center.z) <= journeyHunterArena.radius;
}

export function boundJourneyHunterPoint<T extends HorizontalPoint>(point: T, inset = turnInset): T {
  const limit = journeyHunterArena.radius - inset;
  return {
    ...point,
    x: Math.max(journeyHunterArena.center.x - limit, Math.min(journeyHunterArena.center.x + limit, point.x)),
    z: Math.max(journeyHunterArena.center.z - limit, Math.min(journeyHunterArena.center.z + limit, point.z)),
  };
}

export function journeyHunterSteeringTarget(position: HorizontalPoint, forward: HorizontalPoint, waypoint: HorizontalPoint, worldHalfExtent?: number): HorizontalPoint {
  const target = boundJourneyHunterPoint(waypoint);
  const dx = position.x - journeyHunterArena.center.x;
  const dz = position.z - journeyHunterArena.center.z;
  const turnAt = journeyHunterArena.radius - turnInset;
  if (Math.abs(dx) >= turnAt && dx * forward.x > 0) target.x = journeyHunterArena.center.x;
  if (Math.abs(dz) >= turnAt && dz * forward.z > 0) target.z = journeyHunterArena.center.z;
  if (worldHalfExtent !== undefined) {
    // M10's compact encounter must also respect the city's actual world, not
    // only the older DFW-centered Hunter envelope. Turn early, without snapping.
    const limit = worldHalfExtent - turnInset * 2;
    target.x = Math.max(-limit, Math.min(limit, target.x));
    target.z = Math.max(-limit, Math.min(limit, target.z));
    if (Math.abs(position.x) >= limit && position.x * forward.x > 0) target.x = 0;
    if (Math.abs(position.z) >= limit && position.z * forward.z > 0) target.z = 0;
  }
  return target;
}

export function keepJourneyHunterInside<T extends HorizontalPoint>(position: T): T {
  return boundJourneyHunterPoint(position, hardInset);
}
