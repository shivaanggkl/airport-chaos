import type { IncomingMessage } from 'node:http';

export function sameOriginJsonRequest(request: IncomingMessage): boolean {
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  const origin = String(request.headers.origin ?? '');
  if (!contentType.startsWith('application/json') || !origin || !request.headers.host) return false;
  try {
    const parsed = new URL(origin);
    const host = request.headers.host.toLowerCase();
    const local = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
    const localOrigin = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    return (parsed.host.toLowerCase() === host && parsed.protocol === 'https:') || (local && localOrigin);
  } catch { return false; }
}

export function allowedOAuthReturn(value: unknown, requestOrigin: string, configuredOrigin: string): string | undefined {
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const target = new URL(value);
    if (target.username || target.password || !['http:', 'https:'].includes(target.protocol)) return undefined;
    const allowedOrigins = new Set([requestOrigin, configuredOrigin].filter(Boolean));
    return allowedOrigins.has(target.origin) ? target.toString() : undefined;
  } catch { return undefined; }
}
