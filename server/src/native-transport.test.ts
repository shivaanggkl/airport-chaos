import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NATIVE_APP_ORIGINS, PRODUCTION_BACKEND_ORIGIN, reconnectDelay, resolveTransport } from '../../shared/native-transport.mjs';
import { isTrustedRequestOrigin } from './request-origin.js';

test('native transport uses the single secure production backend while web remains same-origin', () => {
  assert.equal(PRODUCTION_BACKEND_ORIGIN, 'https://fly.vadensoftware.com');
  assert.deepEqual(resolveTransport({ native: true, development: false, pageOrigin: 'capacitor://localhost' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.deepEqual(resolveTransport({ native: true, development: false, pageOrigin: 'https://localhost' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.deepEqual(resolveTransport({ native: false, development: false, pageOrigin: 'https://fly.vadensoftware.com' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.throws(() => resolveTransport({ native: false, development: false, pageOrigin: 'http://production.example' }), /requires HTTPS/);
});

test('native and web origin allowlist is exact', () => {
  assert.deepEqual(NATIVE_APP_ORIGINS, ['capacitor://localhost', 'https://localhost']);
  for (const origin of NATIVE_APP_ORIGINS) {
    assert.equal(isTrustedRequestOrigin(origin, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), true);
  }
  assert.equal(isTrustedRequestOrigin(PRODUCTION_BACKEND_ORIGIN, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), true);
  assert.equal(isTrustedRequestOrigin('https://attacker.example', 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
  assert.equal(isTrustedRequestOrigin('capacitor://attacker.example', 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
  assert.equal(isTrustedRequestOrigin(undefined, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
});

test('reconnect backoff is bounded and jittered', () => {
  assert.equal(reconnectDelay(0, () => 0), 600);
  assert.equal(reconnectDelay(0, () => 1), 900);
  assert.ok(reconnectDelay(4, () => 0.5) > reconnectDelay(1, () => 0.5));
  assert.equal(reconnectDelay(20, () => 1), 30_000);
});

test('client uses one transport for REST and WebSocket and has no Capacitor server URL', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../../client/src/transport.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../../client/src/firehawk-checkout.ts', import.meta.url), 'utf8');
  const capacitor = readFileSync(new URL('../../capacitor.config.ts', import.meta.url), 'utf8');
  assert.match(main, /await realtimeUrl\(\)/);
  assert.match(main, /apiFetch\(apiUrl\(/);
  assert.match(bootstrap, /apiFetch/);
  assert.match(checkout, /apiFetch/);
  assert.match(transport, /Capacitor\.getPlatform\(\) === 'ios'/);
  assert.match(transport, /SecureSessionHttp\.request/);
  assert.match(transport, /apiFetch\('\/api\/realtime-ticket'/);
  assert.doesNotMatch(transport, /localStorage|sessionStorage/);
  assert.match(transport, /fetch\(url, \{ \.\.\.init, credentials: 'include'/);
  assert.doesNotMatch(main, /new URL\(import\.meta\.env\.VITE_WS_URL/);
  assert.doesNotMatch(capacitor, /server:\s*\{[^}]*url:/s);
});

test('iOS secure session transport keeps cookies native and constrains its production boundary', () => {
  const swift = readFileSync(new URL('../../ios/App/App/SecureSessionTransport.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../ios/App/App/Info.plist', import.meta.url), 'utf8');
  const capacitor = readFileSync(new URL('../../capacitor.config.ts', import.meta.url), 'utf8');
  assert.match(swift, /https:\/\/fly\.vadensoftware\.com/);
  assert.match(swift, /private let nativeOrigin = "capacitor:\/\/localhost"/);
  assert.match(swift, /lowerName != "set-cookie" && lowerName != "set-cookie2"/);
  assert.match(swift, /WKWebsiteDataStore\.default\(\)\.httpCookieStore\.setCookie/);
  assert.doesNotMatch(swift, /call\.resolve\([^)]*(?:cookie|token)/is);
  assert.match(plist, /<key>WKAppBoundDomains<\/key>[\s\S]*<string>fly\.vadensoftware\.com<\/string>/);
  assert.match(capacitor, /limitsNavigationsToAppBoundDomains:\s*true/);
  assert.doesNotMatch(capacitor, /CapacitorHttp|CapacitorCookies/);
});

test('realtime ticket issuance requires an existing authoritative session', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const route = server.slice(server.indexOf("if (requestUrl.pathname === '/api/realtime-ticket')"), server.indexOf('const publicPolicy'));
  assert.match(route, /pilotSessions\.resolveSession\(request\.headers\.cookie\)/);
  assert.match(route, /jsonResponse\(response, 401, \{ error: 'Secure session required\.' \}\)/);
  assert.doesNotMatch(route, /authenticatedIdentity\(/);
});
