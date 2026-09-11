// This number is intentionally shared by the browser and the Node server.
// Increment it whenever a websocket payload changes incompatibly.
export const PROTOCOL_VERSION = 24;
// One authoritative range drives client acquisition, server assisted-hit
// validation, unlocked projectile travel, and Hunter firing eligibility.
export const COMBAT_RANGE = 2000;
// Muzzle speed is relative to the firing aircraft, not a fixed world speed
// that a boosted aircraft can overtake. Keep the validated aim unchanged.
export function ballisticShotSpeed(velocity, direction) {
  return 520 + Math.max(0, velocity.x * direction.x + velocity.y * direction.y + velocity.z * direction.z);
}
// Combat lock geometry is shared: the client renders the same small angular
// circle around the bounded assisted aim that the server validates.
// ~4.3° half-angle: roughly half the former on-screen lock-circle diameter.
export const LOCK_ANGLE = 0.075;

// Search is wider than the lock itself. Automatic assistance travels 6.6°;
// temporary vertical input can extend it, but never beyond the search envelope.
export const AIM_ENVELOPE = 0.20;
export const AIM_MAX_OFFSET = 0.115;
export const AIM_MANUAL_OFFSET = 0.10;
export const AIM_SWITCH_MARGIN = 0.015;
// A shot references server-issued samples, never client-provided aim coordinates.
export function interpolateAim(from, to, blend, out) {
  const t = Math.max(0, Math.min(1, blend));
  out.x = from.x + (to.x - from.x) * t;
  out.y = from.y + (to.y - from.y) * t;
  return out;
}
export function aimTargetScore(angle, distance) {
  return angle + distance * 0.000015;
}

// Aircraft-local coordinates: +X right, +Y up, -Z forward. Store aim as
// tangent-plane offsets, independent of camera, key bindings or screen size.
export function aimGoal(x, y, z, out) {
  const lateral = Math.hypot(x, y);
  if (!(z < -0.000001) || Math.atan2(lateral, -z) > AIM_ENVELOPE) return false;
  const scale = lateral > 0 ? Math.min(1 / -z, Math.tan(AIM_MAX_OFFSET) / lateral) : 0;
  out.x = x * scale;
  out.y = y * scale;
  return true;
}

export function biasAimVertically(goal, input) {
  const axis = typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= 1 ? input : 0;
  goal.y += Math.tan(AIM_MANUAL_OFFSET) * axis;
  const radius = Math.hypot(goal.x, goal.y);
  const limit = Math.tan(AIM_ENVELOPE);
  if (radius > limit) { goal.x *= limit / radius; goal.y *= limit / radius; }
}

export function stepAim(aim, goal, delta, maxOffset = AIM_MAX_OFFSET) {
  const dt = Math.max(0, Math.min(0.15, delta));
  const blend = 1 - Math.exp(-8 * dt);
  const dx = (goal.x - aim.x) * blend;
  const dy = (goal.y - aim.y) * blend;
  const length = Math.hypot(dx, dy);
  const scale = length > 0 ? Math.min(1, 0.32 * dt / length) : 0;
  aim.x += dx * scale;
  aim.y += dy * scale;
  const radius = Math.hypot(aim.x, aim.y);
  const limit = Math.tan(maxOffset);
  if (radius > limit) { aim.x *= limit / radius; aim.y *= limit / radius; }
}

export function insideDynamicLock(x, y, z, aim) {
  if (!(z < -0.000001) || Math.atan2(Math.hypot(x, y), -z) > AIM_ENVELOPE) return false;
  const cosine = (x * aim.x + y * aim.y - z) /
    (Math.hypot(x, y, z) * Math.hypot(aim.x, aim.y, 1));
  return cosine >= Math.cos(LOCK_ANGLE);
}
