import { AIM_ENVELOPE, COMBAT_RANGE, insideDynamicLock, ballisticIntercept } from './protocol.mjs';

export const TARGET_SWITCH_DWELL_MS = 120;
export const TARGET_TURN_GRACE_MS = 300;
export const TARGET_SWITCH_MARGIN = 0.01;
export const SMART_ASSIST_CONE = AIM_ENVELOPE;

// Once interpolation reaches the current sample, the previous sample no
// longer contributes to the firing vector and must not extend its lifetime.
export function combatShotAimSample(from, to, blend) {
  return { from: blend === 1 ? to : from, to, blend };
}

export function combatAimBlend(previousReceivedAt, currentReceivedAt, now) {
  // A delayed update must not restart interpolation through an old sample.
  // Keep a margin inside the server's 600ms contributing-sample lifetime.
  if (now - previousReceivedAt >= 500) return 1;
  return Math.min(1, Math.max(0, (now - currentReceivedAt) / 100));
}

// Inputs are server-filtered candidates. A brief turn may retain selection,
// but never grants firing assistance to an unaligned or ineligible target.
export function selectCombatTarget(state, candidates, now) {
  const current = candidates.find(candidate => candidate.id === state.targetId);
  const aligned = candidates.filter(candidate => candidate.aligned);
  let best;
  for (const candidate of aligned) {
    if (!best || candidate.angle < best.angle || candidate.angle === best.angle &&
      (candidate.distance < best.distance || candidate.distance === best.distance && candidate.id < best.id)) best = candidate;
  }
  if (current?.aligned) state.lastAlignedAt = now;
  const retained = current && (current.aligned || now - state.lastAlignedAt <= TARGET_TURN_GRACE_MS);
  if (!retained || (!current.aligned && best)) {
    state.targetId = best?.id;
    state.lastAlignedAt = now;
    state.challengerId = undefined;
    return best;
  }
  if (!best || best.id === current.id || best.angle + TARGET_SWITCH_MARGIN >= current.angle) {
    state.challengerId = undefined;
    return current;
  }
  if (state.challengerId !== best.id) {
    state.challengerId = best.id;
    state.challengerSince = now;
  } else if (now - state.challengerSince >= TARGET_SWITCH_DWELL_MS) {
    state.targetId = best.id;
    state.lastAlignedAt = now;
    state.challengerId = undefined;
    return best;
  }
  return current;
}

const finiteVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);
// Solve the existing longitudinal launch-speed model, including its dependence
// on direction. This bounded root search avoids invalid quadratic roots and
// does not approximate inherited speed using an unrelated camera vector.
export const combatIntercept = ballisticIntercept;

// Camera-independent aim goal within the same bounded acquisition area.
// Callers filter the actual target through acquisition first. A moving target
// can need lead beyond the gun travel; clamp at the edge instead of snapping home.
export function assistedInterceptAim(localDirection, out) {
  out.x = out.y = 0;
  if (!finiteVector(localDirection) || localDirection.z >= -0.000001) return false;
  const x = localDirection.x / -localDirection.z, y = localDirection.y / -localDirection.z;
  const radius = Math.hypot(x, y), limit = Math.tan(Math.min(AIM_ENVELOPE, SMART_ASSIST_CONE));
  const scale = radius > limit ? limit / radius : 1;
  out.x = x * scale;
  out.y = y * scale;
  return true;
}

// Clip-space projection without division by a zero/negative W. The edge arrow
// uses camera-space bearing behind the camera instead of mirroring the point.
export function combatAimProjection(x, y, w, width, height, out) {
  const margin = 24, left = Math.min(margin, width / 2), top = Math.min(86, height * .18);
  const right = Math.max(left, width - margin), bottom = Math.max(top, height - 64);
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  let dx = Number.isFinite(x) ? x : 0, dy = Number.isFinite(y) ? -y : 1;
  const front = Number.isFinite(w) && w > 0.0001;
  if (front) {
    const sx = (x / w * .5 + .5) * width, sy = (-y / w * .5 + .5) * height;
    if (Number.isFinite(sx) && Number.isFinite(sy) && sx >= left && sx <= right && sy >= top && sy <= bottom) {
      out.x = sx; out.y = sy; out.edge = false; out.angle = 0; return out;
    }
    dx = sx - centerX; dy = sy - centerY;
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.00001) { dx = 0; dy = -1; }
  const extent = Math.min((right - left) / 2 / Math.max(Math.abs(dx), .00001),
    (bottom - top) / 2 / Math.max(Math.abs(dy), .00001));
  out.x = centerX + dx * extent; out.y = centerY + dy * extent;
  out.edge = true; out.angle = Math.atan2(dy, dx); return out;
}

// Lock acquisition uses the same angular tolerance at every distance.
// It confirms a reachable target, not an automatic or guaranteed damage event.
export function combatLockReady(localPoint, aim) {
  return finiteVector(localPoint) && Number.isFinite(aim.x) && Number.isFinite(aim.y) &&
    Math.hypot(localPoint.x, localPoint.y, localPoint.z) <= COMBAT_RANGE &&
    insideDynamicLock(localPoint.x, localPoint.y, localPoint.z, aim);
}
