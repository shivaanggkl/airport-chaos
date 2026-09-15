import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { FirehawkPayments } from './firehawk-payments.js';

test('paid purchase emits one recovery code and successful restore rotates it', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-recovery-')), 'profiles.sqlite');
  const payments = new FirehawkPayments(databasePath);
  const database = new DatabaseSync(databasePath);
  database.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,pilot_id,entitlement,product,amount,currency,status,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run('evt_paid', 'cs_paid', 'paid-pilot-0000001', 'REDSPEAR_FIGHTER_PREMIUM', 'firehawk', 999, 'usd', 'paid', 1, 1);
  const status = payments.status('paid-pilot-0000001', 'cs_paid');
  assert.match(status.recoveryCode ?? '', /^(?:[A-Z0-9]{4}-){4}[A-Z0-9]{4}$/);
  assert.equal(payments.status('paid-pilot-0000001', 'cs_paid').recoveryCode, undefined);
  const restored = payments.restore(status.recoveryCode!);
  assert.equal(restored.ok, true);
  assert.notEqual(restored.recoveryCode, status.recoveryCode);
  assert.equal(payments.restore(status.recoveryCode!).ok, false);
  const stored = database.prepare('SELECT recovery_hash FROM firehawk_purchases').get() as { recovery_hash: string };
  assert.match(stored.recovery_hash, /^[a-f0-9]{64}$/);
  assert.equal(stored.recovery_hash.includes(status.recoveryCode!), false);
});
