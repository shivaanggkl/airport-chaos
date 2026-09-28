import type { IncomingMessage } from 'node:http';
import { isTrustedRequestOrigin } from './request-origin.js';

export function sameOriginJsonRequest(request: IncomingMessage, configuredWebOrigin = 'https://fly.vadensoftware.com'): boolean {
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  const origin = String(request.headers.origin ?? '');
  if (!contentType.startsWith('application/json') || !origin || !request.headers.host) return false;
  return isTrustedRequestOrigin(origin, request.headers.host, configuredWebOrigin);
}

export function isAppleOAuthFormPostCallback(request: IncomingMessage, pathname: string): boolean {
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  return pathname === '/api/auth/oauth/apple/callback' && request.method === 'POST' &&
    contentType.startsWith('application/x-www-form-urlencoded');
}

export function rejectsApiRequestOrigin(
  request: IncomingMessage,
  pathname: string,
  configuredWebOrigin = 'https://fly.vadensoftware.com',
): boolean {
  const origin = String(request.headers.origin ?? '');
  if (!origin || !pathname.startsWith('/api/')) return false;
  if (isAppleOAuthFormPostCallback(request, pathname)) return false;
  return !isTrustedRequestOrigin(origin, request.headers.host, configuredWebOrigin);
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
