import { cityAirports } from '../../shared/city-airports.mjs';

type HorizontalPoint = { x: number; z: number };

const turnInset = 3_000;
const hardInset = 20;
// Preserve the established Dallas Hunter envelope for later combat missions;
// it no longer belongs to Mission 2's race definition.
export const journeyHunterArena = { center: { x: cityAirports.dallas[0].x, z: cityAirports.dallas[0].z }, radius: 25_000 };

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

export function journeyHunterSteeringTarget(position: HorizontalPoint, forward: HorizontalPoint, waypoint: HorizontalPoint): HorizontalPoint {
  const target = boundJourneyHunterPoint(waypoint);
  const dx = position.x - journeyHunterArena.center.x;
  const dz = position.z - journeyHunterArena.center.z;
  const turnAt = journeyHunterArena.radius - turnInset;
  if (Math.abs(dx) >= turnAt && dx * forward.x > 0) target.x = journeyHunterArena.center.x;
  if (Math.abs(dz) >= turnAt && dz * forward.z > 0) target.z = journeyHunterArena.center.z;
  return target;
}

export function keepJourneyHunterInside<T extends HorizontalPoint>(position: T): T {
  return boundJourneyHunterPoint(position, hardInset);
}
