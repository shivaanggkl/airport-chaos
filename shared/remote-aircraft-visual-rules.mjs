import { aircraftPresentationScale } from './aircraft-presentation-scale.mjs';

const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

// Match the Rear Guard escort silhouette at flying distance, but return to
// physical size near the pilot so close aircraft do not eclipse the view.
export const remoteAircraftScale = 16;
export const aircraftHitRadii = Object.freeze({
  trainer: 2.4,
  privateJet: 3.4 * aircraftPresentationScale.privateJet,
  cargo: 3.6 * aircraftPresentationScale.cargo,
  fighter: 2.4 * aircraftPresentationScale.fighter,
});
export function remoteAircraftVisualScale(distance) {
  return Math.max(1, Math.min(remoteAircraftScale, distance * remoteAircraftScale / 900));
}
export function remoteAircraftContactRadius(type, distance) {
  return aircraftHitRadii[type] * 1.6 * remoteAircraftVisualScale(distance);
}
export function remoteAircraftCollisionRadius(type, distance) {
  return remoteAircraftContactRadius(type, distance) + 2.5;
}
export function remoteAircraftNearMissRadius(type, distance) {
  return remoteAircraftContactRadius(type, distance) + 12;
}

/**
 * Screen-space width for the non-collidable remote-aircraft contact marker.
 * Keep distant contacts readable without making them look artificially close.
 */
export function remoteProxyPixelWidth(distance) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  if (safeDistance < 550) return 20 + (16 - 20) * smoothstep(safeDistance, 350, 550);
  if (safeDistance < 900) return 16;
  if (safeDistance < 1_300) return 16 + (12 - 16) * smoothstep(safeDistance, 900, 1_300);
  return 12;
}

/** Keep 5 Hz bot transforms moving between packets without changing authority. */
export function remoteInterpolationDuration(previous, packetInterval, isBot) {
  const target = isBot
    ? Math.max(0.24, Math.min(0.33, packetInterval * 1.2))
    : Math.max(0.09, Math.min(0.2, packetInterval * 1.08));
  return previous + (target - previous) * 0.35;
}

/** Brief, fading visual prediction when a transform arrives late. */
export function remotePredictionSeconds(timeSinceUpdate, interpolationDuration, isBot) {
  const overdue = Math.max(0, timeSinceUpdate - interpolationDuration);
  const limit = isBot ? 0.24 : 0.18;
  return limit * Math.tanh(overdue / limit);
}
