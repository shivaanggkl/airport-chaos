import { aircraftMuzzleSockets } from './aircraft-muzzles.mjs';

// A common arcade-world scale for every view of an aircraft. The larger
// airframes remain distinct while Mammoth fits the narrowest 28 m runway.
export const aircraftPresentationScale = Object.freeze({
  trainer: 1,
  privateJet: 18 / 11,
  cargo: 21 / 11.5,
  fighter: 8 / 6.8,
});

export const aircraftPresentationMuzzleSockets = Object.freeze(Object.fromEntries(
  Object.entries(aircraftMuzzleSockets).map(([type, socket]) => {
    const scale = aircraftPresentationScale[type];
    return [type, Object.freeze({
      position: Object.freeze({
        x: socket.position.x * scale,
        y: socket.position.y * scale,
        z: socket.position.z * scale,
      }),
      forward: socket.forward,
    })];
  }),
));
