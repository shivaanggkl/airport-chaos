/**
 * Canonical model-local gun sockets. Aircraft roots use Three.js Euler order
 * YXZ and every normalized aircraft faces local -Z. Measured AFTER uniform
 * scaling, centering and the asset's legacy Y flip (which leaves the root's
 * translation unchanged). Each socket sits 0.12m ahead of the rendered tip;
 * tip height matters too: the model bounds' center is not the nose's height.
 */
export const aircraftMuzzleSockets = Object.freeze({
  trainer: Object.freeze({ position: Object.freeze({ x: 0.02, y: -0.785, z: -3.42 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  privateJet: Object.freeze({ position: Object.freeze({ x: -0.008, y: -0.574, z: -2.64 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  cargo: Object.freeze({ position: Object.freeze({ x: 0, y: -0.65, z: -4.57 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
  fighter: Object.freeze({ position: Object.freeze({ x: -0.015, y: -0.279, z: -4.39 }), forward: Object.freeze({ x: 0, y: 0, z: -1 }) }),
});
