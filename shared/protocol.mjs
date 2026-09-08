// This number is intentionally shared by the browser and the Node server.
// Increment it whenever a websocket payload changes incompatibly.
export const PROTOCOL_VERSION = 2;
// Combat lock geometry is intentionally shared: the client renders the exact
// same boresight cone that the server validates.
export const LOCK_ANGLE = 0.15;
