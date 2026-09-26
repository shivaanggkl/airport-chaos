import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createAuthorizationUrl, exchangeAndVerifyProviderCode, pkceChallenge, verifyProviderIdToken, type OAuthProvider } from './oauth-providers.js';

const now = 1_700_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };

function token(provider: OAuthProvider, overrides: Record<string, unknown> = {}, key = privateKey): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    iss: provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com',
    aud: `${provider}-client`, sub: `${provider}-subject`, nonce: 'expected-nonce',
    iat: Math.floor(now / 1_000) - 10, exp: Math.floor(now / 1_000) + 300,
    email: provider === 'apple' ? 'pilot@privaterelay.appleid.com' : 'pilot@example.com', email_verified: true,
    name: provider === 'google' ? 'Cloud Pilot' : undefined,
    picture: provider === 'google' ? 'https://lh3.googleusercontent.com/a/test=s96-c' : undefined,
    ...overrides,
  })).toString('base64url');
  return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), key).toString('base64url')}`;
}

test('Google OIDC accepts a valid signed token and authorization uses state, nonce, and S256 PKCE', () => {
  const verified = verifyProviderIdToken('google', token('google'), { clientId: 'google-client', nonce: 'expected-nonce', now }, { keys: [jwk] });
  assert.deepEqual(
    { subject: verified.subject, email: verified.email, name: verified.displayName, avatar: verified.avatarUrl },
    { subject: 'google-subject', email: 'pilot@example.com', name: 'Cloud Pilot', avatar: 'https://lh3.googleusercontent.com/a/test=s96-c' },
  );
  const unsafeAvatar = verifyProviderIdToken('google', token('google', { picture: 'https://attacker.example/avatar.png' }), { clientId: 'google-client', nonce: 'expected-nonce', now }, { keys: [jwk] });
  assert.equal(unsafeAvatar.avatarUrl, undefined);
  const verifier = 'v'.repeat(64);
  const url = new URL(createAuthorizationUrl({ provider: 'google', clientId: 'google-client', redirectUri: 'https://game.example/api/auth/oauth/google/callback' }, {
    state: 'state', nonce: 'nonce', codeChallenge: pkceChallenge(verifier),
  }));
  assert.equal(url.searchParams.get('state'), 'state');
  assert.equal(url.searchParams.get('nonce'), 'nonce');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), pkceChallenge(verifier));
});

test('Google OIDC rejects invalid signature, issuer, audience, expiry, and nonce', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const options = { clientId: 'google-client', nonce: 'expected-nonce', now };
  for (const invalid of [
    token('google', {}, other),
    token('google', { iss: 'https://attacker.example' }),
    token('google', { aud: 'another-client' }),
    token('google', { exp: Math.floor(now / 1_000) - 1 }),
    token('google', { nonce: 'wrong' }),
  ]) assert.throws(() => verifyProviderIdToken('google', invalid, options, { keys: [jwk] }), /Provider authentication failed/);
});

test('Apple OIDC accepts verified private-relay email and works without email on later tokens', () => {
  const first = verifyProviderIdToken('apple', token('apple'), { clientId: 'apple-client', nonce: 'expected-nonce', now }, { keys: [jwk] });
  assert.equal(first.subject, 'apple-subject');
  assert.equal(first.email, 'pilot@privaterelay.appleid.com');
  assert.equal(first.avatarUrl, undefined);
  const later = verifyProviderIdToken('apple', token('apple', { email: undefined, email_verified: undefined }), { clientId: 'apple-client', nonce: 'expected-nonce', now }, { keys: [jwk] });
  assert.equal(later.subject, first.subject);
  assert.equal(later.email, undefined);
  const url = new URL(createAuthorizationUrl({ provider: 'apple', clientId: 'apple-client', redirectUri: 'https://game.example/api/auth/oauth/apple/callback' }, { state: 'state', nonce: 'nonce' }));
  assert.equal(url.searchParams.get('response_mode'), 'form_post');
  assert.equal(url.searchParams.get('scope'), 'name email');
});

test('Apple OIDC rejects wrong issuer, audience, expiry, nonce, and signature', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const options = { clientId: 'apple-client', nonce: 'expected-nonce', now };
  for (const invalid of [
    token('apple', { iss: 'https://attacker.example' }), token('apple', { aud: 'wrong' }),
    token('apple', { exp: Math.floor(now / 1_000) - 1 }), token('apple', { nonce: 'wrong' }), token('apple', {}, other),
  ]) assert.throws(() => verifyProviderIdToken('apple', invalid, options, { keys: [jwk] }), /Provider authentication failed/);
});

test('authorization codes are exchanged server-side before Google identity resolution', async () => {
  const signed = token('google', { iat: Math.floor(Date.now() / 1_000) - 10, exp: Math.floor(Date.now() / 1_000) + 300 });
  let tokenRequest = '';
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/token')) {
      tokenRequest = String(init?.body);
      return new Response(JSON.stringify({ id_token: signed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } });
  }) as typeof fetch;
  const verified = await exchangeAndVerifyProviderCode({
    provider: 'google', clientId: 'google-client', clientSecret: 'server-only-secret', redirectUri: 'https://game.example/api/auth/oauth/google/callback',
  }, { code: 'one-time-code', nonce: 'expected-nonce', codeVerifier: 'pkce-verifier' }, fetcher);
  assert.equal(verified.subject, 'google-subject');
  assert.match(tokenRequest, /code=one-time-code/); assert.match(tokenRequest, /code_verifier=pkce-verifier/); assert.match(tokenRequest, /client_secret=server-only-secret/);
});

test('Apple code exchange creates a short-lived ES256 client assertion on the server', async () => {
  const appleSigningKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const signed = token('apple', { iat: Math.floor(Date.now() / 1_000) - 10, exp: Math.floor(Date.now() / 1_000) + 300 });
  let tokenRequest = '';
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/token')) {
      tokenRequest = String(init?.body);
      return new Response(JSON.stringify({ id_token: signed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const verified = await exchangeAndVerifyProviderCode({
    provider: 'apple', clientId: 'apple-client', redirectUri: 'https://game.example/api/auth/oauth/apple/callback',
    teamId: 'TEAM123', keyId: 'KEY123', privateKey: appleSigningKey,
  }, { code: 'apple-code', nonce: 'expected-nonce' }, fetcher);
  assert.equal(verified.subject, 'apple-subject');
  const clientSecret = new URLSearchParams(tokenRequest).get('client_secret');
  assert.equal(clientSecret?.split('.').length, 3); assert.match(tokenRequest, /code=apple-code/);
});

test('provider tokens and server credentials are absent from client-authoritative gameplay source', () => {
  const client = [
    readFileSync(resolve('client/src/main.ts'), 'utf8'),
    readFileSync(resolve('client/src/pilot-menu.ts'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(client, /\bid_token\b|\baccess_token\b|GOOGLE_CLIENT_SECRET|APPLE_PRIVATE_KEY/);
  assert.match(client, /authorizationUrl/);
});
