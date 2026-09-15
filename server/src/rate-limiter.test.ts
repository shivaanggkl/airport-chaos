import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { BoundedRateLimiter, normalizeIp, trustedClientIp } from './rate-limiter.js';

const limiter = new BoundedRateLimiter(3, 1_000_000);
const rule = { limit: 2, windowMs: 1_000 };
assert.equal(limiter.attempt('checkout-pilot', 'pilot-a', rule, 0).allowed, true);
assert.equal(limiter.attempt('checkout-pilot', 'pilot-a', rule, 1).allowed, true);
assert.equal(limiter.attempt('checkout-pilot', 'pilot-a', rule, 2).allowed, false);
assert.equal(limiter.attempt('checkout-ip', '203.0.113.1', rule, 2).allowed, true);
assert.equal(limiter.attempt('checkout-ip', '203.0.113.2', rule, 2).allowed, true);
assert.equal(limiter.size, 3);
limiter.attempt('checkout-ip', '203.0.113.3', rule, 2);
assert.equal(limiter.size, 3, 'bucket count remains bounded');
assert.equal(limiter.prune(1_003), 3, 'expired buckets are pruned');
assert.equal(limiter.size, 0);

assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
assert.equal(normalizeIp('[2001:DB8::1]:443'), '2001:db8::1');
assert.equal(normalizeIp('bad-client-controlled-value'), undefined);
const request = {
  headers: { 'x-forwarded-for': 'spoofed, 203.0.113.9' },
  socket: { remoteAddress: '::ffff:127.0.0.1' },
} as unknown as IncomingMessage;
assert.equal(trustedClientIp(request, false), '127.0.0.1', 'public forwarding headers are ignored off Render');
assert.equal(trustedClientIp(request, true), '203.0.113.9', 'the Render-owned final forwarding hop is used');

const issuance = new BoundedRateLimiter();
const issuanceRule = { limit: 30, windowMs: 60 * 60_000 };
for (let index = 0; index < 30; index += 1) assert.equal(issuance.attempt('session-ip', '198.51.100.1', issuanceRule, index).allowed, true);
assert.equal(issuance.attempt('session-ip', '198.51.100.1', issuanceRule, 31).allowed, false);

const checkout = new BoundedRateLimiter();
const pilotRule = { limit: 5, windowMs: 10 * 60_000 };
const ipRule = { limit: 10, windowMs: 10 * 60_000 };
for (let index = 0; index < 5; index += 1) assert.equal(checkout.attempt('pilot', 'pilot-a', pilotRule, index).allowed, true);
assert.equal(checkout.attempt('pilot', 'pilot-a', pilotRule, 6).allowed, false);
for (let index = 0; index < 10; index += 1) assert.equal(checkout.attempt('ip', '203.0.113.5', ipRule, index).allowed, true);
assert.equal(checkout.attempt('ip', '203.0.113.5', ipRule, 11).allowed, false, 'a fresh pilot cannot bypass the IP limit');

console.log('rate limiter tests passed');
