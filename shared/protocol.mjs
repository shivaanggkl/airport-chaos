// This number is intentionally shared by the browser and the Node server.
// Increment it whenever a websocket payload changes incompatibly.
export const PROTOCOL_VERSION = 30;
// One authoritative range drives acquisition, projectile travel,
// intercept feasibility, and Hunter firing eligibility.
export const COMBAT_RANGE = 4500;
export const BASE_PROJECTILE_SPEED = 520;
export const FIRE_RATE_PER_SECOND = Object.freeze({
  trainer: 3.0,
  cargo: 4.2,
  privateJet: 4.8,
  fighter: 6.6,
});
export function fireIntervalMs(aircraftType) {
  return 1_000 / (FIRE_RATE_PER_SECOND[aircraftType] ?? FIRE_RATE_PER_SECOND.trainer);
}
export const PROJECTILE_DAMAGE_BY_AIRCRAFT = Object.freeze({
  trainer: 25,
  cargo: 30,
  privateJet: 35,
  fighter: 40,
});
export function projectileDamageForAircraft(aircraftType) {
  return PROJECTILE_DAMAGE_BY_AIRCRAFT[aircraftType] ?? PROJECTILE_DAMAGE_BY_AIRCRAFT.trainer;
}
// Muzzle speed is relative to the firing aircraft, not a fixed world speed
// that a boosted aircraft can overtake. Keep the validated aim unchanged.
export function ballisticShotSpeed(velocity, direction) {
  return BASE_PROJECTILE_SPEED + Math.max(0, velocity.x * direction.x + velocity.y * direction.y + velocity.z * direction.z);
}
const finiteCombatVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);
// Solve the existing longitudinal launch-speed model for one straight shot.
export function ballisticIntercept(origin, shooterVelocity, targetPosition, targetVelocity) {
  if (![origin, shooterVelocity, targetPosition, targetVelocity].every(finiteCombatVector)) return null;
  const rx = targetPosition.x - origin.x, ry = targetPosition.y - origin.y, rz = targetPosition.z - origin.z;
  const range = Math.hypot(rx, ry, rz);
  if (range < 0.000001 || range > COMBAT_RANGE) return null;
  const at = seconds => {
    const x = rx + targetVelocity.x * seconds, y = ry + targetVelocity.y * seconds, z = rz + targetVelocity.z * seconds;
    const distance = Math.hypot(x, y, z);
    if (distance < 0.000001) return { direction: { x: 0, y: 0, z: -1 }, distance: 0, speed: BASE_PROJECTILE_SPEED };
    const direction = { x: x / distance, y: y / distance, z: z / distance };
    return { direction, distance, speed: ballisticShotSpeed(shooterVelocity, direction) };
  };
  let low = 0, high = 0;
  const lifetime = COMBAT_RANGE / BASE_PROJECTILE_SPEED;
  for (let step = 1; step <= 64; step += 1) {
    high = lifetime * step / 64;
    const sample = at(high);
    if (sample.distance <= sample.speed * high) break;
    low = high;
  }
  if (low === high) return null;
  for (let step = 0; step < 26; step += 1) {
    const middle = (low + high) / 2, sample = at(middle);
    if (sample.distance > sample.speed * middle) low = middle; else high = middle;
  }
  const solution = at(high);
  if (solution.distance > COMBAT_RANGE || Math.abs(solution.distance - solution.speed * high) > 0.01) return null;
  return { direction: solution.direction, speed: solution.speed, seconds: high,
    point: { x: origin.x + solution.direction.x * solution.distance,
      y: origin.y + solution.direction.y * solution.distance, z: origin.z + solution.direction.z * solution.distance } };
}

// Retain the existing direction-only API for callers that do not need lead time.
export function ballisticInterceptDirection(origin, shooterVelocity, targetPosition, targetVelocity) {
  return ballisticIntercept(origin, shooterVelocity, targetPosition, targetVelocity)?.direction ?? null;
}
// The client renders this angular lock circle; the server validates the same cone.
// At a 590px-tall, 58° chase view it projects to about a 32px radius.
export const LOCK_ANGLE = 0.060;

// Search, automatic travel, and manual bias share a forward-only cone.
// At the 590px-tall, 58° chase view, these project to 200px and 100px.
const chaseFocalLength = 590 / (2 * Math.tan(58 * Math.PI / 360));
export const AIM_ENVELOPE = Math.atan(200 / chaseFocalLength);
export const AIM_MAX_OFFSET = Math.atan(100 / chaseFocalLength);
export const AIM_MANUAL_OFFSET = 0.160;
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

export function biasAim(goal, horizontalInput, verticalInput) {
  const axis = input => typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= 1 ? input : 0;
  goal.x += Math.tan(AIM_MANUAL_OFFSET) * axis(horizontalInput);
  goal.y += Math.tan(AIM_MANUAL_OFFSET) * axis(verticalInput);
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
