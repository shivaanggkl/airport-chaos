import { Capacitor } from '@capacitor/core';
import { resolveTransport } from '../../shared/native-transport.mjs';

const transport = resolveTransport({
  native: Capacitor.isNativePlatform(),
  development: import.meta.env.DEV,
  pageOrigin: window.location.origin,
  webSocketOverride: import.meta.env.VITE_WS_URL,
});

export const apiOrigin = transport.apiOrigin;
export const nativeRuntimeOrigin = Capacitor.isNativePlatform() ? window.location.origin : undefined;

export function apiUrl(path: string): URL {
  return new URL(path, apiOrigin);
}

export function realtimeUrl(): URL {
  return new URL(transport.websocketOrigin);
}

export async function apiFetch(pathOrUrl: string | URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const url = pathOrUrl instanceof URL ? pathOrUrl : apiUrl(pathOrUrl);
  if (url.origin !== apiOrigin) throw new Error('Backend request origin rejected.');

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
