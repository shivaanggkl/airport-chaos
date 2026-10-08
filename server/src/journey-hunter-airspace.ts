import { journeyDallas02 } from '../../shared/journey-mission.mjs';

type HorizontalPoint = { x: number; z: number };

const turnInset = 3_000;
const hardInset = 20;

export function insideJourneyHunterArena(point: HorizontalPoint): boolean {
  return Math.abs(point.x - journeyDallas02.arenaCenter.x) <= journeyDallas02.arenaRadius &&
    Math.abs(point.z - journeyDallas02.arenaCenter.z) <= journeyDallas02.arenaRadius;
}

export function boundJourneyHunterPoint<T extends HorizontalPoint>(point: T, inset = turnInset): T {
  const limit = journeyDallas02.arenaRadius - inset;
  return {
    ...point,
    x: Math.max(journeyDallas02.arenaCenter.x - limit, Math.min(journeyDallas02.arenaCenter.x + limit, point.x)),
    z: Math.max(journeyDallas02.arenaCenter.z - limit, Math.min(journeyDallas02.arenaCenter.z + limit, point.z)),
  };
}

export function journeyHunterSteeringTarget(position: HorizontalPoint, forward: HorizontalPoint, waypoint: HorizontalPoint): HorizontalPoint {
  const target = boundJourneyHunterPoint(waypoint);
  const dx = position.x - journeyDallas02.arenaCenter.x;
  const dz = position.z - journeyDallas02.arenaCenter.z;
  const turnAt = journeyDallas02.arenaRadius - turnInset;
  if (Math.abs(dx) >= turnAt && dx * forward.x > 0) target.x = journeyDallas02.arenaCenter.x;
  if (Math.abs(dz) >= turnAt && dz * forward.z > 0) target.z = journeyDallas02.arenaCenter.z;
  return target;
}

export function keepJourneyHunterInside<T extends HorizontalPoint>(position: T): T {
  return boundJourneyHunterPoint(position, hardInset);
}
