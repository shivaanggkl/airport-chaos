import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type Stripe from 'stripe';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { AnalyticsStore } from './analytics.js';
import { FirehawkPayments, stripeModeAcceptsEvent } from './firehawk-payments.js';
import { PlayerProfileStore } from './player-profiles.js';

function refundEvent(id: string, livemode: boolean, amountRefunded: number): Stripe.Event {
  return { id, type: 'charge.refunded', livemode, created: 1_800_000_000, data: { object: {
    id: 'ch_refund', object: 'charge', livemode, paid: true, amount: firehawkProduct.amountCents,
    amount_refunded: amountRefunded, currency: firehawkProduct.currency, payment_intent: 'pi_refund',
  } } } as unknown as Stripe.Event;
}

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
  const restored = payments.restore(status.recoveryCode!, 'restored-pilot-00001');
  assert.equal(restored.ok, true);
  assert.notEqual(restored.recoveryCode, status.recoveryCode);
  assert.equal(payments.restore(status.recoveryCode!, 'restored-pilot-00001').ok, false);
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
  assert.equal(livePayments.restore(status.recoveryCode!, 'legacy-live-pilot01').ok, false);
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
  assert.equal(metrics.test.grossRevenue, firehawkProduct.amountCents);
  assert.equal(metrics.live.grossRevenue, firehawkProduct.amountCents);
  const analytics = new AnalyticsStore(databasePath);
  analytics.recordEvent({ pilotId: 'test-metrics-pilot-01', environment: 'production', host: 'fly.vadensoftware.com' }, 'fighter_checkout_created', { metadata: { stripeMode: 'test' } });
  analytics.recordEvent({ pilotId: 'live-metrics-pilot-01', environment: 'production', host: 'fly.vadensoftware.com' }, 'fighter_checkout_created', { metadata: { stripeMode: 'live' } });
  const html = analytics.dashboardHtml(true, Date.now(), metrics, 'test');
  assert.match(html, /STRIPE TEST MODE \/ SANDBOX/);
  assert.match(html, /LIVE · Firehawk purchases/);
  assert.match(html, /TEST · Firehawk purchases/);
  assert.match(html, /Gross sales/);
  assert.match(html, /Sandbox gross/);
  assert.match(html, /Checkout starts<\/span><b>1<\/b>/);
});

test('partial then full refund is cumulative, idempotent, and invalidates recovery', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-refund-')), 'profiles.sqlite');
  const payments = new FirehawkPayments(databasePath, 'test');
  const database = new DatabaseSync(databasePath);
  database.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,payment_intent_id,pilot_id,entitled_pilot_id,entitlement,product,amount,currency,status,stripe_mode,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('evt_purchase', 'cs_refund', 'pi_refund', 'refund-pilot-00001', 'refund-pilot-00001',
      firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 'test', 1, 1);
  const status = payments.status('refund-pilot-00001', 'cs_refund');
  assert.ok(status.recoveryCode);

  const partial = payments.recordRefund(refundEvent('evt_partial', false, 300));
  assert.equal(partial?.fullRefund, false);
  assert.equal(payments.completedForPilot('refund-pilot-00001'), true);
  assert.equal(payments.metrics().test.netRevenue, firehawkProduct.amountCents - 300);

  const full = payments.recordRefund(refundEvent('evt_full', false, firehawkProduct.amountCents));
  assert.equal(full?.fullRefund, true);
  assert.equal(full?.refundDelta, firehawkProduct.amountCents - 300);
  assert.equal(payments.completedForPilot('refund-pilot-00001'), false);
  assert.equal(payments.restore(status.recoveryCode!, 'other-pilot-000001').ok, false);
  assert.equal(payments.recordRefund(refundEvent('evt_full_duplicate', false, firehawkProduct.amountCents)), undefined);
  const metrics = payments.metrics().test;
  assert.equal(metrics.purchases, 0);
  assert.equal(metrics.refundedPurchases, 1);
  assert.equal(metrics.refundedAmount, firehawkProduct.amountCents);
  assert.equal(metrics.netRevenue, 0);
});

test('refund mode isolation and entitlement sources preserve tester access', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-refund-source-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  profiles.getOrCreate('source-pilot-00001', 'Tester');
  profiles.grantAircraftEntitlements('source-pilot-00001', ['fighter'], 'tester');
  profiles.grantAircraftEntitlements('source-pilot-00001', ['fighter'], 'stripe:test');
  const payments = new FirehawkPayments(databasePath, 'test');
  const database = new DatabaseSync(databasePath);
  database.prepare(`INSERT INTO firehawk_purchases
    (stripe_event_id,checkout_session_id,payment_intent_id,pilot_id,entitled_pilot_id,entitlement,product,amount,currency,status,stripe_mode,created_at,paid_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('evt_source', 'cs_source', 'pi_refund', 'source-pilot-00001', 'source-pilot-00001',
      firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, 'paid', 'test', 1, 1);
  assert.equal(payments.recordRefund(refundEvent('evt_wrong_mode', true, firehawkProduct.amountCents)), undefined);
  const refund = payments.recordRefund(refundEvent('evt_source_refund', false, firehawkProduct.amountCents));
  assert.equal(refund?.fullRefund, true);
  const profile = profiles.revokeAircraftEntitlementSource('source-pilot-00001', 'fighter', 'stripe:test');
  assert.equal(profile?.aircraftEntitlements.includes(firehawkProduct.entitlement), true);
  assert.equal(profile?.unlockedAircraft.includes('fighter'), true);
});

test('removing the final paid source locks Firehawk and falls selection back to trainer', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-refund-lock-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  profiles.getOrCreate('lock-pilot-0000001', 'Paid pilot');
  profiles.grantAircraftEntitlements('lock-pilot-0000001', ['fighter'], 'stripe:test');
  const equipped = profiles.equipAircraft('lock-pilot-0000001', 'fighter');
  assert.equal(equipped?.selectedAircraft, 'fighter');
  const revoked = profiles.revokeAircraftEntitlementSource('lock-pilot-0000001', 'fighter', 'stripe:test');
  assert.equal(revoked?.selectedAircraft, 'trainer');
  assert.equal(revoked?.unlockedAircraft.includes('fighter'), false);
  assert.equal(profiles.equipAircraft('lock-pilot-0000001', 'fighter')?.selectedAircraft, 'trainer');
});

test('Firehawk trial is temporary usable access and survives refresh until a post-expiry boundary', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-flow-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const pilotId = 'trial-pilot-0000001';
  const initial = profiles.getOrCreate(pilotId, 'Trial pilot');
  assert.equal(initial.aircraftEntitlements.includes(firehawkProduct.entitlement), false);
  assert.equal(initial.unlockedAircraft.includes('fighter'), false);

  const requested = profiles.requestFighterTrial(pilotId);
  assert.equal(requested.ok, true);
  assert.equal(requested.profile?.fighterTrial.status, 'pending');
  assert.equal(requested.profile?.fighterTrial.startedAt, undefined);
  assert.equal(requested.profile?.unlockedAircraft.includes('fighter'), true);

  const startedAt = 10_000;
  const active = profiles.activateFighterTrial(pilotId, startedAt)!;
  assert.equal(active.selectedAircraft, 'fighter');
  assert.equal(active.aircraftEntitlements.includes(firehawkProduct.entitlement), false);
  assert.equal(active.fighterTrial.expiresAt, startedAt + 5 * 60_000);
  assert.equal(profiles.getOrCreate(pilotId, 'Trial pilot').selectedAircraft, 'fighter');

  const afterProgress = profiles.updateProgress(pilotId, {
    totalDistance: 2_000,
    successfulLandings: 0,
    discoveries: { dallas: ['trial-flight-discovery'] },
  })!;
  assert.equal(afterProgress.fighterTrial.status, 'active');
  assert.equal(afterProgress.selectedAircraft, 'fighter');
  assert.equal(afterProgress.unlockedAircraft.includes('fighter'), true);

  const afterReward = profiles.awardServerReward(pilotId, 5)!;
  assert.equal(afterReward.selectedAircraft, 'fighter');
  assert.equal(afterReward.fighterTrial.status, 'active');

  const afterNonExpiredBoundary = profiles.consumeExpiredFighterTrial(pilotId, startedAt + 200_000)!;
  assert.equal(afterNonExpiredBoundary.selectedAircraft, 'fighter');
  assert.equal(afterNonExpiredBoundary.fighterTrial.status, 'active');

  const expiredInFlight = profiles.getOrCreate(pilotId, 'Trial pilot');
  assert.equal(expiredInFlight.fighterTrial.status, 'active');
  assert.equal(expiredInFlight.selectedAircraft, 'fighter');
  const consumed = profiles.consumeExpiredFighterTrial(pilotId, startedAt + 5 * 60_000)!;
  assert.equal(consumed.fighterTrial.status, 'consumed');
  assert.equal(consumed.selectedAircraft, 'trainer');
  assert.equal(consumed.unlockedAircraft.includes('fighter'), false);
});

test('legacy hydration cannot replace a non-expired active Firehawk trial with trainer', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-import-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const pilotId = 'trial-import-000001';
  profiles.getOrCreate(pilotId, 'Trial import');
  assert.equal(profiles.requestFighterTrial(pilotId).ok, true);
  const active = profiles.activateFighterTrial(pilotId, 20_000)!;
  assert.equal(active.selectedAircraft, 'fighter');

  const imported = profiles.importLegacy(pilotId, { selectedAircraft: 'trainer' });
  assert.equal(imported.fighterTrial.status, 'active');
  assert.equal(imported.selectedAircraft, 'fighter');
});

test('trial expiry consumes once without resetting an independently entitled Firehawk owner', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-trial-owner-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const pilotId = 'trial-owner-0000001';
  profiles.getOrCreate(pilotId, 'Trial owner');
  assert.equal(profiles.requestFighterTrial(pilotId).ok, true);
  const active = profiles.activateFighterTrial(pilotId, 30_000)!;
  assert.equal(active.selectedAircraft, 'fighter');
  profiles.grantAircraftEntitlements(pilotId, ['fighter'], 'tester');

  const consumed = profiles.consumeExpiredFighterTrial(pilotId, active.fighterTrial.expiresAt)!;
  assert.equal(consumed.fighterTrial.status, 'consumed');
  assert.equal(consumed.selectedAircraft, 'fighter');
  assert.equal(consumed.unlockedAircraft.includes('fighter'), true);
  assert.equal(profiles.requestFighterTrial(pilotId).profile?.fighterTrial.status, 'consumed');
});
