// Relative to the server-accepted launch position and heading; already world units.
export const sharpshooterPlacements = Object.freeze([
  Object.freeze({ angleDegrees: 0, distance: 4200, altitude: 0 }),
  Object.freeze({ angleDegrees: 35, distance: 8000, altitude: 650 }),
  Object.freeze({ angleDegrees: -40, distance: 10500, altitude: 1300 }),
  Object.freeze({ angleDegrees: 65, distance: 12500, altitude: 400 }),
  Object.freeze({ angleDegrees: -65, distance: 14500, altitude: 1800 }),
  Object.freeze({ angleDegrees: 0, distance: 18000, altitude: 2400 }),
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
