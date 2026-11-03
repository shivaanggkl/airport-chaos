import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { journeyDallas14 } from '../../shared/journey-mission.mjs';
import { hunterFlightIntercept } from './hunter-flight.js';

type V = { x: number; y: number; z: number };
export type AmbushState = { activatedAt: number; warningAt?: number; rearWarning?: boolean };

/** A steering intention, never a transform: the existing Hunter flight envelope flies it. */
export function ambushApproach(state: AmbushState, enemy: V, speed: number,
  pilot: { position: V; velocity: V; rotation: V }, now: number): V | undefined {
  if (state.warningAt !== undefined) return undefined;
  const dx = enemy.x - pilot.position.x, dz = enemy.z - pilot.position.z;
  const distance = Math.hypot(dx, dz);
  const forward = { x: -Math.sin(pilot.rotation.y), z: -Math.cos(pilot.rotation.y) };
  const rear = distance > 0 && (dx * forward.x + dz * forward.z) / distance < -.3;
  if ((rear && distance <= 4_000) || now - state.activatedAt >= journeyDallas14.rearApproachMs) {
    state.warningAt = now;
    state.rearWarning = rear && distance <= 4_000;
    return undefined;
  }
  const intercept = hunterFlightIntercept(enemy, speed, pilot.position, pilot.velocity);
  // Approach the trailing quarter, rather than the pilot's current position.
  return { x: intercept.x - forward.x * 1_800 + forward.z * 650,
    y: intercept.y + 60, z: intercept.z - forward.z * 1_800 - forward.x * 650 };
}

export function ambushCanFire(state: AmbushState | undefined, now: number): boolean {
  return state?.warningAt !== undefined && now >= state.warningAt + journeyDallas14.warningMs;
}

/** Closing speed is earned through normal acceleration, capped by Bluejay's real envelope. */
export function ambushCruiseSpeed(velocity: V): number {
  return Math.min(aircraftFlightEnvelope.trainer.maxSpeed,
    Math.max(journeyDallas14.cruiseSpeed, Math.hypot(velocity.x, velocity.z) * 1.1));
}
