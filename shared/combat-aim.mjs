import { AIM_ENVELOPE, AIM_MAX_OFFSET, ballisticIntercept } from './protocol.mjs';

export const TARGET_SWITCH_DWELL_MS = 240;
export const TARGET_TURN_GRACE_MS = 300;
export const TARGET_SWITCH_MARGIN = 0.025;
export const SMART_ASSIST_CONE = 0.10;

// Inputs are server-filtered candidates. A brief turn may retain selection,
// but never grants firing assistance to an unaligned or ineligible target.
export function selectCombatTarget(state, candidates, now) {
  const current = candidates.find(candidate => candidate.id === state.targetId);
  const aligned = candidates.filter(candidate => candidate.aligned);
  const score = candidate => candidate.angle + candidate.distance * 0.000004 -
    (candidate.objective && candidate.angle < 0.12 ? 0.025 : 0);
  let best;
  for (const candidate of aligned) {
    if (!best || score(candidate) < score(best) || score(candidate) === score(best) && candidate.id < best.id) best = candidate;
  }
  if (current?.aligned) state.lastAlignedAt = now;
  const retained = current && (current.aligned || now - state.lastAlignedAt <= TARGET_TURN_GRACE_MS);
  if (!retained) {
    state.targetId = best?.id;
    state.lastAlignedAt = now;
    state.challengerId = undefined;
    return best;
  }
  if (!best || best.id === current.id || score(best) + TARGET_SWITCH_MARGIN >= score(current)) {
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

// Camera-independent aim goal. Only a narrow opportunity may move the gun;
// selection can survive a turn without pulling the weapon after that target.
export function assistedInterceptAim(localDirection, out, competitive = false) {
  out.x = out.y = 0;
  if (!finiteVector(localDirection) || localDirection.z >= -0.000001) return false;
  const angle = Math.atan2(Math.hypot(localDirection.x, localDirection.y), -localDirection.z);
  const limit = competitive ? AIM_MAX_OFFSET : SMART_ASSIST_CONE;
  if (angle > Math.min(AIM_ENVELOPE, limit)) return false;
  out.x = localDirection.x / -localDirection.z;
  out.y = localDirection.y / -localDirection.z;
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
