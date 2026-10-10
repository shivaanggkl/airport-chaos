import { journeyDallas08 } from './journey-mission.mjs';

/** The leader's forward vector is the same -Z/Y-heading convention as flight. */
export function journeyFormationStatus(pilot, leader, mission = journeyDallas08) {
  if (!pilot || !leader || !pilot.airborne || !leader.airborne ||
      ![pilot.position.x, pilot.position.y, pilot.position.z, pilot.heading,
        leader.position.x, leader.position.y, leader.position.z, leader.heading].every(Number.isFinite) ||
      !Number.isFinite(pilot.speed) || !Number.isFinite(leader.speed) ||
      pilot.speed < 40 || leader.speed < 40) return 'AIRBORNE_REQUIRED';
  const dx = pilot.position.x - leader.position.x;
  const dz = pilot.position.z - leader.position.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance < 1) return 'TOO_CLOSE';
  const forwardX = -Math.sin(leader.heading);
  const forwardZ = -Math.cos(leader.heading);
  const behind = -(dx * forwardX + dz * forwardZ) / distance;
  if (!Number.isFinite(behind) || behind < Math.cos(mission.maxTailAngle)) return 'GET_BEHIND';
  if (distance < mission.minDistance) return 'TOO_CLOSE';
  if (distance > mission.maxDistance) return 'TOO_FAR';
  if (Math.abs(pilot.position.y - leader.position.y) > mission.maxAltitudeDifference) return 'ALTITUDE';
  const headingDifference = Math.atan2(Math.sin(pilot.heading - leader.heading), Math.cos(pilot.heading - leader.heading));
  if (Math.abs(headingDifference) > mission.maxHeadingDifference) return 'ALIGN';
  return 'VALID';
}
