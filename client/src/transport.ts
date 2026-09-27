import { Capacitor, registerPlugin } from '@capacitor/core';
import { resolveTransport } from '../../shared/native-transport.mjs';

const transport = resolveTransport({
  native: Capacitor.isNativePlatform(),
  development: import.meta.env.DEV,
  pageOrigin: window.location.origin,
  webSocketOverride: import.meta.env.VITE_WS_URL,
});

export const apiOrigin = transport.apiOrigin;
const useIosNativeHttp = Capacitor.getPlatform() === 'ios';
type SecureSessionResponse = { status: number; url: string; headers: Record<string, string>; body: string };
const SecureSessionHttp = registerPlugin<{ request(options: {
  url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number;
}): Promise<SecureSessionResponse> }>('SecureSessionHttp');

export function apiUrl(path: string): URL {
  return new URL(path, apiOrigin);
}

export async function realtimeUrl(): Promise<URL> {
  const url = new URL(transport.websocketOrigin);
  if (!useIosNativeHttp) return url;
  const response = await apiFetch('/api/realtime-ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const result = await response.json() as { ticket?: string };
  if (!response.ok || !result.ticket || !/^[A-Za-z0-9_-]{40,128}$/.test(result.ticket)) {
    throw new Error('Unable to authorize realtime connection.');
  }
  // The ticket remains in memory only and is consumed by one WebSocket
  // handshake within the server's short expiry window.
  url.searchParams.set('ticket', result.ticket);
  return url;
}

export async function apiFetch(pathOrUrl: string | URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const url = pathOrUrl instanceof URL ? pathOrUrl : apiUrl(pathOrUrl);
  if (url.origin !== apiOrigin) throw new Error('Backend request origin rejected.');

  if (useIosNativeHttp) {
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (init.body !== undefined && init.body !== null && typeof init.body !== 'string') {
      throw new TypeError('iOS native API requests require a string body.');
    }
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const nativeResponse = await SecureSessionHttp.request({
      url: url.toString(),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
      timeoutMs,
    });
    const body = nativeResponse.status === 204 || nativeResponse.status === 205
      ? null
      : nativeResponse.body;
    return new Response(body, { status: nativeResponse.status, headers: nativeResponse.headers });
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, { ...init, credentials: 'include', signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
