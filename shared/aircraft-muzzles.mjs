/**
 * Canonical model-local gun sockets. Aircraft roots use Three.js Euler order
 * YXZ and every normalized aircraft faces local -Z. Fighter is intentionally
 * shorter here: its source GLB is uniformly scaled by wing span before its
 * legacy Y flip, placing the rendered nose at roughly local Z -3.0.
 */
export const aircraftMuzzleSockets = Object.freeze({
  trainer: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: -3.42 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  privateJet: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: -4.62 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  cargo: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: -4.57 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  fighter: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: -3.08 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
});
