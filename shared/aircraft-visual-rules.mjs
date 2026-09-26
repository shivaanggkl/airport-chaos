export const DESTRUCTION_EFFECT_DURATION_SECONDS = 0.9;
export const DESTRUCTION_FRAGMENT_COUNT = 6;
export const MAX_DESTRUCTION_EFFECTS = 6;

export const aircraftVisualConfig = Object.freeze({
  trainer: Object.freeze({
    // Normalized SKYRIFT SCOUT aft-fuselage center and authored prop-wash length.
    effectAnchors: Object.freeze([
      Object.freeze({ x: 0, y: -0.35, z: 3.25, radius: 0.575, boostLength: 3.2 }),
    ]),
    groundContacts: Object.freeze([
      Object.freeze({ x: -1.02, y: -1.235, z: 0.64 }),
      Object.freeze({ x: 1.02, y: -1.235, z: 0.64 }),
      Object.freeze({ x: 0, y: -1.235, z: -1.46 }),
    ]),
  }),
  privateJet: Object.freeze({
    effectAnchors: Object.freeze([
      Object.freeze({ x: -2.02, y: -0.75, z: 0.98, radius: 0.31 }),
      Object.freeze({ x: 2.02, y: -0.75, z: 0.98, radius: 0.31 }),
    ]),
    groundContacts: Object.freeze([
      Object.freeze({ x: -1.18, y: -1.121, z: 0.89 }),
      Object.freeze({ x: 1.18, y: -1.121, z: 0.89 }),
      Object.freeze({ x: 0, y: -1.121, z: -2.45 }),
    ]),
  }),
  cargo: Object.freeze({
    effectAnchors: Object.freeze([
      Object.freeze({ x: -3.85, y: 0.17, z: 0.88, radius: 0.24 }),
      Object.freeze({ x: -2.05, y: 0.17, z: 0.44, radius: 0.27 }),
      Object.freeze({ x: 2.05, y: 0.17, z: 0.44, radius: 0.27 }),
      Object.freeze({ x: 3.85, y: 0.17, z: 0.88, radius: 0.24 }),
    ]),
    groundContacts: Object.freeze([
      Object.freeze({ x: -0.92, y: -1.224, z: 1.38 }),
      Object.freeze({ x: 0.92, y: -1.224, z: 1.38 }),
      Object.freeze({ x: 0, y: -1.224, z: -2.67 }),
    ]),
  }),
  fighter: Object.freeze({
    // Primitive fallback only; the loaded REDSPEAR uses ExhaustSocket_Main.
    effectAnchors: Object.freeze([
      Object.freeze({ x: 0, y: -0.18, z: 2.9, radius: 0.46 }),
    ]),
    groundContacts: Object.freeze([
      Object.freeze({ x: -0.89, y: -1.15, z: 0.72 }),
      Object.freeze({ x: 0.89, y: -1.15, z: 0.72 }),
      Object.freeze({ x: 0, y: -1.15, z: -2.32 }),
    ]),
  }),
});

// Returns the smallest local +Y airframe offset that keeps every configured
// wheel/contact at or above the ground while the network/physics root rotates.
export function groundContactVisualOffset(contacts, quaternion, rootClearance) {
  const { x, y, z, w } = quaternion;
  const worldYFromX = 2 * (x * y + z * w);
  const worldYFromY = 1 - 2 * (x * x + z * z);
  const worldYFromZ = 2 * (y * z - x * w);
  if (worldYFromY <= 0.1) return 0;

  let lowestWorldY = Number.POSITIVE_INFINITY;
  for (const contact of contacts) {
    lowestWorldY = Math.min(lowestWorldY,
      worldYFromX * contact.x + worldYFromY * contact.y + worldYFromZ * contact.z);
  }
  return Math.max(0, (-rootClearance - lowestWorldY) / worldYFromY);
}
