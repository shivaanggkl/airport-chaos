import type { IncomingMessage, ServerResponse } from 'node:http';
import { NATIVE_APP_ORIGINS } from '../../shared/native-transport.mjs';

const nativeOrigins = new Set<string>(NATIVE_APP_ORIGINS);

function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (nativeOrigins.has(value)) return value;
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? undefined : origin;
  } catch { return undefined; }
}

export function isNativeAppOrigin(value: string | undefined): boolean {
  return Boolean(value && nativeOrigins.has(value));
}

export function isTrustedRequestOrigin(originValue: string | undefined, hostValue: string | undefined, configuredWebOrigin: string): boolean {
  const origin = normalizedOrigin(originValue);
  if (!origin) return false;
  if (nativeOrigins.has(origin)) return true;

  const configured = normalizedOrigin(configuredWebOrigin);
  if (configured && origin === configured) return true;

  const host = String(hostValue ?? '').toLowerCase();
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.protocol === 'https:' && parsed.host.toLowerCase() === host) return true;
  const localHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  return localHost && parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

export function applyCors(request: IncomingMessage, response: ServerResponse, configuredWebOrigin: string): boolean {
  const origin = String(request.headers.origin ?? '');
  if (!origin) return true;
  if (!isTrustedRequestOrigin(origin, request.headers.host, configuredWebOrigin)) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  return true;
}
