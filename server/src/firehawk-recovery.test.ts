import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { AnalyticsStore } from './analytics.js';
import { FirehawkPayments, stripeModeAcceptsEvent } from './firehawk-payments.js';

test('paid purchase emits one recovery code and successful restore rotates it', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-recovery-')), 'profiles.sqlite');
  const payments = new FirehawkPayments(databasePath, 'test');
  const database = new DatabaseSync(databasePath);
  database.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,pilot_id,entitlement,product,amount,currency,status,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run('evt_paid', 'cs_paid', 'paid-pilot-0000001', firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 1, 1);
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

test('legacy sandbox rows migrate to TEST and never reconcile or restore in LIVE mode', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-stripe-mode-')), 'profiles.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE firehawk_purchases (
    stripe_event_id TEXT NOT NULL UNIQUE, checkout_session_id TEXT NOT NULL UNIQUE, payment_intent_id TEXT,
    pilot_id TEXT NOT NULL, entitlement TEXT NOT NULL, product TEXT NOT NULL, amount INTEGER NOT NULL,
    currency TEXT NOT NULL, status TEXT NOT NULL, customer_email TEXT, created_at INTEGER NOT NULL, paid_at INTEGER NOT NULL
  )`);
  legacy.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,pilot_id,entitlement,product,amount,currency,status,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run('evt_legacy_test', 'cs_legacy_test', 'legacy-test-pilot-01', firehawkProduct.entitlement,
      firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 1, 1);

  const testPayments = new FirehawkPayments(databasePath, 'test');
  const migrated = legacy.prepare('SELECT stripe_mode FROM firehawk_purchases WHERE stripe_event_id=?').get('evt_legacy_test') as { stripe_mode: string };
  assert.equal(migrated.stripe_mode, 'test');
  assert.equal(testPayments.completedForPilot('legacy-test-pilot-01'), true);
  const status = testPayments.status('legacy-test-pilot-01', 'cs_legacy_test');
  assert.ok(status.recoveryCode);

  const livePayments = new FirehawkPayments(databasePath, 'live');
  assert.equal(livePayments.completedForPilot('legacy-test-pilot-01'), false);
  assert.equal(livePayments.status('legacy-test-pilot-01', 'cs_legacy_test').status, 'pending');
  assert.equal(livePayments.restore(status.recoveryCode!).ok, false);
  assert.equal(testPayments.metrics().test.purchases, 1);
  assert.equal(testPayments.metrics().live.purchases, 0);
});

test('configured Stripe mode accepts only matching authoritative livemode events', () => {
  assert.equal(stripeModeAcceptsEvent('test', false), true);
  assert.equal(stripeModeAcceptsEvent('test', true), false);
  assert.equal(stripeModeAcceptsEvent('live', true), true);
  assert.equal(stripeModeAcceptsEvent('live', false), false);
});

test('admin purchase reporting separates LIVE revenue from TEST sandbox value', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-stripe-metrics-')), 'profiles.sqlite');
  const payments = new FirehawkPayments(databasePath, 'test');
  const database = new DatabaseSync(databasePath);
  const insert = database.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,pilot_id,entitlement,product,amount,currency,status,stripe_mode,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  insert.run('evt_test', 'cs_test', 'test-metrics-pilot-01', firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 'test', 1, 1);
  insert.run('evt_live', 'cs_live', 'live-metrics-pilot-01', firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 'live', 1, 1);
  const metrics = payments.metrics();
  assert.equal(metrics.test.revenue, firehawkProduct.amountCents);
  assert.equal(metrics.live.revenue, firehawkProduct.amountCents);
  const analytics = new AnalyticsStore(databasePath);
  analytics.recordEvent({ pilotId: 'test-metrics-pilot-01', environment: 'production', host: 'fly.vadensoftware.com' }, 'fighter_checkout_created', { metadata: { stripeMode: 'test' } });
  analytics.recordEvent({ pilotId: 'live-metrics-pilot-01', environment: 'production', host: 'fly.vadensoftware.com' }, 'fighter_checkout_created', { metadata: { stripeMode: 'live' } });
  const html = analytics.dashboardHtml(true, Date.now(), metrics, 'test');
  assert.match(html, /STRIPE TEST MODE \/ SANDBOX/);
  assert.match(html, /LIVE · Firehawk purchases/);
  assert.match(html, /TEST · Firehawk purchases/);
  assert.match(html, /Gross revenue/);
  assert.match(html, /Sandbox value/);
  assert.match(html, /Checkout starts<\/span><b>1<\/b>/);
});
