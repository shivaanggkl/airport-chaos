import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { allowedOAuthReturn, sameOriginJsonRequest } from './auth-request-security.js';

function request(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers } as IncomingMessage;
}

test('account mutations accept exact web/native origins and reject cross-site CSRF requests', () => {
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', origin: 'https://fly.vadensoftware.com', 'content-type': 'application/json' })), true);
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', origin: 'capacitor://localhost', 'content-type': 'application/json' })), true);
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', origin: 'https://localhost', 'content-type': 'application/json' })), true);
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', origin: 'https://attacker.example', 'content-type': 'application/json' })), false);
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', origin: 'https://fly.vadensoftware.com', 'content-type': 'text/plain' })), false);
  assert.equal(sameOriginJsonRequest(request({ host: 'fly.vadensoftware.com', 'content-type': 'application/json' })), false);
});

test('OAuth return destination is restricted to explicit origins', () => {
  const production = 'https://fly.vadensoftware.com';
  assert.equal(allowedOAuthReturn('https://fly.vadensoftware.com/?city=dallas', production, production), 'https://fly.vadensoftware.com/?city=dallas');
  assert.equal(allowedOAuthReturn('https://attacker.example/steal', production, production), undefined);
  assert.equal(allowedOAuthReturn('https://fly.vadensoftware.com@attacker.example/steal', production, production), undefined);
  assert.equal(allowedOAuthReturn('javascript:alert(1)', production, production), undefined);
});
