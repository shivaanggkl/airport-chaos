import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { FIREHAWK_TRIAL_NETWORK_WINDOW_MS, TrialNetworkGuard } from './trial-network-guard.js';

const secret = 'test-only-firehawk-trial-network-secret-0001';

test('allows one new trial per network for 24 hours and persists across restart', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-network-')), 'profiles.sqlite');
  const firstGuard = new TrialNetworkGuard(databasePath, secret);
  const networkId = firstGuard.identify('203.0.113.8')!;
  const startedAt = Date.now();
  assert.deepEqual(firstGuard.authorizeNewTrial('available', false, networkId, startedAt), {
    allowed: true, claimed: true, retryAfterMs: 0,
  });
  assert.deepEqual(firstGuard.authorizeNewTrial('available', false, networkId, startedAt + 1), {
    allowed: false, claimed: false, reason: 'used', retryAfterMs: FIREHAWK_TRIAL_NETWORK_WINDOW_MS - 1,
  });

  const restartedGuard = new TrialNetworkGuard(databasePath, secret);
  assert.equal(restartedGuard.claim(networkId, startedAt + 60_000).allowed, false);
  assert.equal(restartedGuard.claim(networkId, startedAt + FIREHAWK_TRIAL_NETWORK_WINDOW_MS).allowed, true);
});

test('permanent owners and existing trial states do not consume network allowance', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-owner-')), 'profiles.sqlite');
  const guard = new TrialNetworkGuard(databasePath, secret);
  const networkId = guard.identify('192.0.2.15')!;
  const now = Date.now();
  assert.equal(guard.authorizeNewTrial('available', true, networkId, now).claimed, false);
  assert.equal(guard.authorizeNewTrial('active', false, networkId, now).claimed, false);
  assert.equal(guard.authorizeNewTrial('available', false, networkId, now).allowed, true);
});

test('allows a different network and never persists the raw IP', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-privacy-')), 'profiles.sqlite');
  const guard = new TrialNetworkGuard(databasePath, secret);
  const firstIp = '198.51.100.41';
  const secondIp = '198.51.100.42';
  const startedAt = Date.now();
  assert.equal(guard.claim(guard.identify(firstIp)!, startedAt).allowed, true);
  assert.equal(guard.claim(guard.identify(secondIp)!, startedAt + 1).allowed, true);

  const database = new DatabaseSync(databasePath);
  const rows = database.prepare('SELECT hashed_network_id, trial_started_at, expires_at FROM firehawk_trial_network_usage').all() as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(String(row.hashed_network_id))));
  assert.equal(JSON.stringify(rows).includes(firstIp), false);
  assert.equal(readFileSync(databasePath).includes(Buffer.from(firstIp)), false);
});

test('rejects use when a sufficiently strong server secret or trusted IP is unavailable', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-disabled-')), 'profiles.sqlite');
  const missingSecret = new TrialNetworkGuard(databasePath, undefined);
  assert.equal(missingSecret.enabled, false);
  assert.equal(missingSecret.identify('203.0.113.9'), undefined);
  const guard = new TrialNetworkGuard(databasePath, secret);
  assert.equal(guard.identify('unknown'), undefined);
});
