/**
 * Canonical model-local gun sockets. Aircraft roots use Three.js Euler order
 * YXZ and every normalized aircraft faces local -Z. Measured AFTER uniform
 * scaling and centering. Each socket sits 0.12m ahead of the rendered tip;
 * tip height matters too: the model bounds' center is not the nose's height.
 */
export const aircraftMuzzleSockets = Object.freeze({
  trainer: Object.freeze({ position: Object.freeze({ x: 0, y: -0.38, z: -3.37 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  privateJet: Object.freeze({ position: Object.freeze({ x: 0, y: -0.714, z: -5.884 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  cargo: Object.freeze({ position: Object.freeze({ x: 0, y: -0.28, z: -4.48 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  fighter: Object.freeze({ position: Object.freeze({ x: 0, y: -0.479, z: -4.370 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
});
