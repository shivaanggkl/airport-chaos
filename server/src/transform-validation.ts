export type AcceptedPosition = { x: number; y: number; z: number };
export type AcceptedRotation = { x: number; y: number; z: number };

export type TransformEnvelope = {
  maxSpeed: number;
  boostMaxSpeed: number;
  acceleration: number;
};

export type RotationEnvelope = {
  pitchRate: number;
  rollRate: number;
  yawRate: number;
  bankTurn: number;
};

export type TransformValidationResult =
  | { accepted: true; elapsedSeconds: number; distance: number; velocity: AcceptedPosition }
  | { accepted: false; reason: 'MALFORMED' | 'WORLD_BOUNDS' | 'VERTICAL_JUMP' | 'DISPLACEMENT'; elapsedSeconds: number; distance: number; allowedDistance: number };

const minimumPacketSeconds = 0.05;
const maximumCatchupSeconds = 1.5;
const baseNetworkSlackMeters = 18;
const baseAngularSlackRadians = 0.22;

function yxzQuaternion(rotation: AcceptedRotation): readonly [number, number, number, number] {
  const c1 = Math.cos(rotation.x * 0.5), c2 = Math.cos(rotation.y * 0.5), c3 = Math.cos(rotation.z * 0.5);
  const s1 = Math.sin(rotation.x * 0.5), s2 = Math.sin(rotation.y * 0.5), s3 = Math.sin(rotation.z * 0.5);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

export function validateClientRotation(
  previous: AcceptedRotation,
  submitted: AcceptedRotation,
  elapsedMs: number,
  envelope: RotationEnvelope,
): { accepted: true; angularDistance: number; allowedAngularDistance: number } | { accepted: false; reason: 'ANGULAR_RATE'; angularDistance: number; allowedAngularDistance: number } {
  const previousQuaternion = yxzQuaternion(previous);
  const submittedQuaternion = yxzQuaternion(submitted);
  const dot = Math.abs(previousQuaternion[0] * submittedQuaternion[0] + previousQuaternion[1] * submittedQuaternion[1] +
    previousQuaternion[2] * submittedQuaternion[2] + previousQuaternion[3] * submittedQuaternion[3]);
  const angularDistance = 2 * Math.acos(Math.min(1, dot));
  const elapsedSeconds = Math.min(maximumCatchupSeconds, Math.max(minimumPacketSeconds, elapsedMs / 1000));
  const approvedAngularRate = Math.hypot(envelope.pitchRate, envelope.rollRate, envelope.yawRate + envelope.bankTurn);
  const allowedAngularDistance = approvedAngularRate * elapsedSeconds * 1.35 + baseAngularSlackRadians;
  return angularDistance <= allowedAngularDistance
    ? { accepted: true, angularDistance, allowedAngularDistance }
    : { accepted: false, reason: 'ANGULAR_RATE', angularDistance, allowedAngularDistance };
}

/**
 * Validates an ordinary client transform against the most recently accepted
 * server position. The full approved Boost ceiling is used so packet ordering
 * around Shift transitions cannot create false positives.
 */
export function validateClientTransform(
  previous: AcceptedPosition,
  submitted: AcceptedPosition,
  elapsedMs: number,
  envelope: TransformEnvelope,
  stuntAllowanceMeters = 0,
  worldBounds?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
): TransformValidationResult {
  const values = [submitted.x, submitted.y, submitted.z];
  if (!values.every(Number.isFinite)) {
    return { accepted: false, reason: 'MALFORMED', elapsedSeconds: 0, distance: Infinity, allowedDistance: 0 };
  }
  if (worldBounds && (submitted.x < worldBounds.minX || submitted.x > worldBounds.maxX || submitted.y < worldBounds.minY || submitted.y > worldBounds.maxY || submitted.z < worldBounds.minZ || submitted.z > worldBounds.maxZ)) {
    return { accepted: false, reason: 'WORLD_BOUNDS', elapsedSeconds: 0, distance: Infinity, allowedDistance: 0 };
  }
  const elapsedSeconds = Math.min(maximumCatchupSeconds, Math.max(minimumPacketSeconds, elapsedMs / 1000));
  const dx = submitted.x - previous.x;
  const dy = submitted.y - previous.y;
  const dz = submitted.z - previous.z;
  const distance = Math.hypot(dx, dy, dz);
  const approvedBoostSpeed = envelope.maxSpeed * envelope.boostMaxSpeed;
  const accelerationSlack = 0.5 * envelope.acceleration * elapsedSeconds * elapsedSeconds;
  const allowedDistance = approvedBoostSpeed * elapsedSeconds * 1.12 + accelerationSlack + baseNetworkSlackMeters + Math.max(0, stuntAllowanceMeters);
  // Normal aircraft pitch limits keep vertical velocity well below total
  // airspeed. This generous independent ceiling catches altitude teleports
  // without rejecting dives, climbs, packet skips, or stunt attitude changes.
  const allowedVertical = approvedBoostSpeed * elapsedSeconds * 0.72 + accelerationSlack + baseNetworkSlackMeters + Math.max(0, stuntAllowanceMeters * 0.35);
  if (Math.abs(dy) > allowedVertical) return { accepted: false, reason: 'VERTICAL_JUMP', elapsedSeconds, distance, allowedDistance };
  if (distance > allowedDistance) return { accepted: false, reason: 'DISPLACEMENT', elapsedSeconds, distance, allowedDistance };
  return { accepted: true, elapsedSeconds, distance, velocity: { x: dx / elapsedSeconds, y: dy / elapsedSeconds, z: dz / elapsedSeconds } };
}
