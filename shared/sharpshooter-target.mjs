// Relative to the server-accepted launch position and heading; already world units.
export const sharpshooterPlacements = Object.freeze([
  Object.freeze({ angleDegrees: 0, distance: 2200, altitude: 0 }),
  Object.freeze({ angleDegrees: 35, distance: 3900, altitude: 500 }),
  Object.freeze({ angleDegrees: -40, distance: 5000, altitude: 1000 }),
  Object.freeze({ angleDegrees: 65, distance: 5200, altitude: 300 }),
  Object.freeze({ angleDegrees: -65, distance: 6500, altitude: 1400 }),
  Object.freeze({ angleDegrees: 0, distance: 8500, altitude: 1800 }),
]);

// A target's anchor never changes after activation. Motion uses mission elapsed
// time, so pausing/reconnecting preserves the same phase without frame packets.
export function sharpshooterTargetPose(target, elapsedMs, out) {
  const phase = target.stage === 2 ? Math.max(0, elapsedMs - target.activatedAt) * Math.PI * 2 / 8000 : 0;
  const offset = target.stage === 2 ? Math.sin(phase) * 150 : 0;
  out.x = target.x + Math.cos(target.heading) * offset;
  out.y = target.y;
  out.z = target.z - Math.sin(target.heading) * offset;
  return out;
}
