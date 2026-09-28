import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { allowedOAuthReturn, isAppleOAuthFormPostCallback, rejectsApiRequestOrigin, sameOriginJsonRequest } from './auth-request-security.js';

function request(headers: IncomingMessage['headers'], method = 'POST'): IncomingMessage {
  return { headers, method } as IncomingMessage;
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

test('only the exact Apple form_post callback bypasses the normal API Origin gate', () => {
  const callback = '/api/auth/oauth/apple/callback';
  const formPostWithoutOrigin = request({ host: 'fly.vadensoftware.com', 'content-type': 'application/x-www-form-urlencoded' });
  const formPostFromApple = request({ host: 'fly.vadensoftware.com', origin: 'https://appleid.apple.com', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' });
  assert.equal(isAppleOAuthFormPostCallback(formPostWithoutOrigin, callback), true);
  assert.equal(rejectsApiRequestOrigin(formPostWithoutOrigin, callback), false);
  assert.equal(rejectsApiRequestOrigin(formPostFromApple, callback), false);

  assert.equal(rejectsApiRequestOrigin(request({
    host: 'fly.vadensoftware.com', origin: 'https://attacker.example', 'content-type': 'application/json',
  }), '/api/auth/logout'), true, 'unrelated cross-origin API POST remains rejected');
  assert.equal(rejectsApiRequestOrigin(request({
    host: 'fly.vadensoftware.com', origin: 'https://attacker.example', 'content-type': 'application/json',
  }), callback), true, 'the callback exemption does not accept JSON');
  assert.equal(rejectsApiRequestOrigin(request({
    host: 'fly.vadensoftware.com', origin: 'https://attacker.example', 'content-type': 'application/x-www-form-urlencoded',
  }, 'GET'), callback), true, 'the callback exemption does not accept GET');
  assert.equal(rejectsApiRequestOrigin(request({
    host: 'fly.vadensoftware.com', origin: 'https://attacker.example', 'content-type': 'application/x-www-form-urlencoded',
  }), '/api/auth/oauth/google/callback'), true, 'the callback exemption is Apple-only');
});
