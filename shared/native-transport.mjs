export const PRODUCTION_BACKEND_ORIGIN = 'https://fly.vadensoftware.com';

// Capacitor 8 defaults, verified against the generated native runtimes:
// iOS uses its custom asset scheme; Android uses the HTTPS local asset server.
export const NATIVE_APP_ORIGINS = Object.freeze([
  'capacitor://localhost',
  'https://localhost',
]);

function isLoopback(url) {
  return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:');
}

export function resolveTransport({ native, development, pageOrigin, webSocketOverride }) {
  if (native) {
    const api = new URL(PRODUCTION_BACKEND_ORIGIN);
    if (api.protocol !== 'https:') throw new Error('Native production transport requires HTTPS.');
    const websocket = new URL(api);
    websocket.protocol = 'wss:';
    return { apiOrigin: api.origin, websocketOrigin: websocket.origin };
  }

  if (development) {
    const websocket = new URL(webSocketOverride || 'ws://localhost:8091');
    if (!isLoopback(websocket) && websocket.protocol !== 'wss:') {
      throw new Error('Non-loopback development transport requires WSS.');
    }
    const api = new URL(websocket);
    api.protocol = websocket.protocol === 'wss:' ? 'https:' : 'http:';
    return { apiOrigin: api.origin, websocketOrigin: websocket.origin };
  }

  const api = new URL(pageOrigin);
  if (api.protocol !== 'https:' && !isLoopback(api)) throw new Error('Production web transport requires HTTPS.');
  const websocket = new URL(api);
  websocket.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  return { apiOrigin: api.origin, websocketOrigin: websocket.origin };
}

export function reconnectDelay(attempt, random = Math.random) {
  const exponent = Math.max(0, Math.min(6, Math.trunc(attempt)));
  const base = Math.min(30_000, 750 * (2 ** exponent));
  const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
  return Math.min(30_000, Math.round(base * jitter));
}
