// This number is intentionally shared by the browser and the Node server.
// Increment it whenever a websocket payload changes incompatibly.
// M19 runway-start handoff requires matching clients; old clients freeze until its former airborne clock starts.
export const PROTOCOL_VERSION = 37;
// Shared acquisition and projectile travel range.
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
export const ORDINARY_PROJECTILE_DAMAGE = 25;
export function projectileDamageForAircraft() {
  return ORDINARY_PROJECTILE_DAMAGE;
}

export function projectileLaunchVelocity(shooterVelocity, gunDirection, out = { x: 0, y: 0, z: 0 }) {
  const scale = BASE_PROJECTILE_SPEED / Math.hypot(gunDirection.x, gunDirection.y, gunDirection.z);
  out.x = shooterVelocity.x + gunDirection.x * scale;
  out.y = shooterVelocity.y + gunDirection.y * scale;
  out.z = shooterVelocity.z + gunDirection.z * scale;
  return out;
}

export function advanceProjectile(position, direction, speed, traveled, delta) {
  const step = Math.min(speed * delta, Math.max(0, COMBAT_RANGE - traveled));
  position.x += direction.x * step;
  position.y += direction.y * step;
  position.z += direction.z * step;
  return step;
}

export function ballisticShotSpeed(velocity, direction) {
  const launch = projectileLaunchVelocity(velocity, direction);
  return Math.hypot(launch.x, launch.y, launch.z);
}
export function localFiringDirection(aim, out) {
  const inverseLength = 1 / Math.hypot(aim.x, aim.y, 1);
  out.x = aim.x * inverseLength;
  out.y = aim.y * inverseLength;
  out.z = -inverseLength;
  return out;
}
const finiteCombatVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);
// Solve |targetOffset + relativeVelocity * t| = muzzleSpeed * t.
export function ballisticIntercept(origin, shooterVelocity, targetPosition, targetVelocity) {
  if (!finiteCombatVector(origin) || !finiteCombatVector(shooterVelocity) ||
      !finiteCombatVector(targetPosition) || !finiteCombatVector(targetVelocity)) return null;
  const rx = targetPosition.x - origin.x, ry = targetPosition.y - origin.y, rz = targetPosition.z - origin.z;
  const c = rx * rx + ry * ry + rz * rz;
  if (c < 1e-12 || c > COMBAT_RANGE ** 2) return null;
  const vx = targetVelocity.x - shooterVelocity.x, vy = targetVelocity.y - shooterVelocity.y, vz = targetVelocity.z - shooterVelocity.z;
  const a = vx * vx + vy * vy + vz * vz - BASE_PROJECTILE_SPEED ** 2;
  const b = 2 * (rx * vx + ry * vy + rz * vz);
  let seconds;
  if (Math.abs(a) < 1e-6) {
    seconds = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
    const first = q / a, second = c / q;
    seconds = Math.min(first > 0 ? first : Infinity, second > 0 ? second : Infinity);
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const distance = BASE_PROJECTILE_SPEED * seconds;
  const direction = { x: (rx + vx * seconds) / distance, y: (ry + vy * seconds) / distance, z: (rz + vz * seconds) / distance };
  const velocity = projectileLaunchVelocity(shooterVelocity, direction);
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 1e-6 || speed * seconds > COMBAT_RANGE) return null;
  return { direction, velocity, speed, seconds, point: {
    x: origin.x + velocity.x * seconds, y: origin.y + velocity.y * seconds, z: origin.z + velocity.z * seconds,
  } };
}

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
