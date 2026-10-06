import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import Stripe from 'stripe';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { aircraftSkyTokenPrices, skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { googleVoidedPurchaseNotification } from './native-purchases.js';
import { FirehawkPayments } from './firehawk-payments.js';
import { PlayerProfileStore } from './player-profiles.js';
import { SkyTokenPayments, productionWebOrigin, skyTokenStripeCatalog, skyTokenStripePrices } from './sky-token-payments.js';

function fixture(): { store: PlayerProfileStore; db: DatabaseSync; path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-tokens-'));
  const path = join(directory, 'profiles.sqlite');
  const store = new PlayerProfileStore(path);
  store.getOrCreate('token-pilot', 'Token Pilot');
  store.getOrCreate('other-pilot', 'Other Pilot');
  const db = new DatabaseSync(path);
  return { store, db, path, cleanup: () => { db.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function stripePurchase(store: PlayerProfileStore, transactionId: string, packId: SkyTokenPackId, refunded = 0) {
  return store.recordVerifiedSkyTokenPurchase({ pilotId: 'token-pilot', accountId: 'account-one', provider: 'stripe',
    transactionId, packId, productId: `price_${packId}`, environment: 'test', amountCents: Number(packId.slice(11)),
    currency: 'usd', paymentIntentId: `pi_${transactionId}`, initialRefundedQuantity: refunded });
}

test('verified Token packs are durable, once-only wallet grants with a purchase record', () => {
  const { store, db, cleanup } = fixture();
  try {
    assert.equal(store.walletBalances('token-pilot')?.skyTokens, 0);
    const longReference = `cs_${'a'.repeat(260)}`;
    assert.equal(stripePurchase(store, longReference, 'SKY_TOKENS_500').profile.skyTokens, 500);
    assert.equal(stripePurchase(store, longReference, 'SKY_TOKENS_500').applied, false);
    assert.throws(() => store.recordVerifiedSkyTokenPurchase({ pilotId: 'other-pilot', accountId: 'account-two', provider: 'stripe',
      transactionId: longReference, packId: 'SKY_TOKENS_500', productId: 'price_other', environment: 'test' }), /ACCOUNT_MISMATCH/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reason='SKY_TOKEN_PURCHASE'").get() as { n: number }).n, 1);
    assert.equal((db.prepare("SELECT quantity FROM sky_token_purchases WHERE provider='stripe'").get() as { quantity: number }).quantity, 500);
  } finally { cleanup(); }
});

test('approved packs and aircraft Token prices keep the exact 100-Token base unit', () => {
  assert.deepEqual(Object.values(skyTokenPacks).map(pack => [pack.tokens, pack.usdCents]),
    [[100, 100], [500, 500], [1200, 1200], [2400, 2400]]);
  assert.deepEqual(aircraftSkyTokenPrices, { cargo: 500, privateJet: 1200, fighter: 2400 });
});

test('the server resolves all four approved Stripe Price IDs separately for test and live', () => {
  assert.deepEqual(skyTokenStripePrices('test'), {
    SKY_TOKENS_100: 'price_1UNLxIEggQDpuQ3Q4tKIr0wv',
    SKY_TOKENS_500: 'price_1UNLxQEggQDpuQ3Q9PvnSOnv',
    SKY_TOKENS_1200: 'price_1UNLxVEggQDpuQ3Q2hmcE6v1',
    SKY_TOKENS_2400: 'price_1UNLxaEggQDpuQ3Qn3wfuSgt',
  });
  assert.deepEqual(skyTokenStripePrices('live'), {
    SKY_TOKENS_100: 'price_1UNLiNEggQDpuQ3QXQdzfoWl',
    SKY_TOKENS_500: 'price_1UNLmSEggQDpuQ3QeGUVkzOY',
    SKY_TOKENS_1200: 'price_1UNLmXEggQDpuQ3QzLnds85A',
    SKY_TOKENS_2400: 'price_1UNLmcEggQDpuQ3QfPJ1cmta',
  });
  assert.equal(skyTokenStripePrices('test', { ...skyTokenStripeCatalog, SKY_TOKENS_500: undefined }), undefined);
});

test('checkout validates the provider Price and uses only the selected environment catalog', async () => {
  for (const mode of ['test', 'live'] as const) {
    const payments = new SkyTokenPayments(mode);
    const selected = skyTokenStripePrices(mode)!;
    const created: Array<{ price: string; successUrl: string; cancelUrl: string; packId: string }> = [];
    let activePack: SkyTokenPackId = 'SKY_TOKENS_100';
    let validPrice = true;
    Object.assign(payments, { enabled: true, stripe: {
      prices: { retrieve: async (priceId: string) => ({ active: true, livemode: mode === 'live', type: 'one_time',
        currency: 'usd', unit_amount: validPrice ? skyTokenPacks[activePack].usdCents : 1, id: priceId }) },
      checkout: { sessions: { create: async (input: { line_items: Array<{ price: string }>; success_url: string; cancel_url: string; metadata: { packId: string } }) => {
        created.push({ price: input.line_items[0]!.price, successUrl: input.success_url, cancelUrl: input.cancel_url, packId: input.metadata.packId });
        return { id: 'cs_test_checkout', url: 'https://checkout.stripe.com/test' };
      } } },
    } });
    const origin = mode === 'test' ? 'https://airport-chaos-staging.onrender.com' : productionWebOrigin;
    for (const id of Object.keys(skyTokenPacks) as SkyTokenPackId[]) {
      activePack = id;
      await payments.createCheckout('token-pilot-12345', '12345678-1234-1234-1234-123456789abc', id, origin);
      assert.deepEqual(created.at(-1), { price: selected[id],
        successUrl: `${origin}/?token_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/?token_checkout=cancel`, packId: id });
    }
    validPrice = false;
    await assert.rejects(payments.createCheckout('token-pilot-12345', '12345678-1234-1234-1234-123456789abc', activePack, origin), /TOKEN_PRICE_INVALID/);
    assert.equal(created.length, 4);
  }
});

test('Stripe delayed-payment success verifies the same checkout and a partial refund reverses exact integer Tokens', async () => {
  const payments = new SkyTokenPayments('test');
  Object.assign(payments, {
    prices: { SKY_TOKENS_100: 'price_100' },
    stripe: {
      checkout: { sessions: {
        retrieve: async () => ({ id: 'cs_paid_100', metadata: { purchaseType: 'sky_tokens', pilotId: 'token-pilot-12345',
          accountId: '12345678-1234-1234-1234-123456789abc', packId: 'SKY_TOKENS_100' }, payment_status: 'paid',
          currency: 'usd', amount_total: 100, payment_intent: 'pi_paid_100', livemode: false }),
        listLineItems: async () => ({ data: [{ price: { id: 'price_100' }, quantity: 1 }] }),
      } },
      paymentIntents: { retrieve: async () => ({ status: 'succeeded', amount: 100, currency: 'usd',
        latest_charge: { amount_refunded: 1 } }) },
    },
  });
  const event = { type: 'checkout.session.async_payment_succeeded', created: 1000,
    data: { object: { id: 'cs_paid_100', metadata: { purchaseType: 'sky_tokens' } } } } as unknown as Parameters<SkyTokenPayments['paidCheckout']>[0];
  const purchase = await payments.paidCheckout(event);
  assert.equal(purchase?.packId, 'SKY_TOKENS_100');
  assert.equal(purchase?.initialRefundedQuantity, 1);
  assert.equal(await payments.paidCheckout({ ...event, type: 'checkout.session.async_payment_failed' } as Parameters<SkyTokenPayments['paidCheckout']>[0]), undefined);
});

test('Stripe Token checkout fails closed for missing and mismatched environment configuration', () => {
  const keys = ['AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED', 'AIRPORT_CHAOS_SKY_TOKEN_LIVE_ENABLED', 'AIRPORT_CHAOS_WEB_ORIGIN',
    'STRIPE_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'STRIPE_SKY_TOKENS_100_PRICE_ID', 'STRIPE_SKY_TOKENS_500_PRICE_ID',
    'STRIPE_SKY_TOKENS_1200_PRICE_ID', 'STRIPE_SKY_TOKENS_2400_PRICE_ID'] as const;
  const original = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED = 'true';
    process.env.AIRPORT_CHAOS_WEB_ORIGIN = 'https://staging.example.test';
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_test_only';
    assert.equal(new SkyTokenPayments('test').enabled, false);
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_localtest';
    assert.equal(new SkyTokenPayments('test').enabled, true);
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(new SkyTokenPayments('test').enabled, false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_test_only';
    process.env.STRIPE_MODE = 'live';
    assert.equal(new SkyTokenPayments('test').enabled, false);
    process.env.STRIPE_MODE = 'test';
    process.env.AIRPORT_CHAOS_WEB_ORIGIN = productionWebOrigin;
    assert.equal(new SkyTokenPayments('test').enabled, false);
    process.env.AIRPORT_CHAOS_WEB_ORIGIN = 'https://staging.example.test';
    process.env.STRIPE_SKY_TOKENS_500_PRICE_ID = skyTokenStripeCatalog.SKY_TOKENS_500.live;
    assert.equal(new SkyTokenPayments('test').enabled, false);
    delete process.env.STRIPE_SKY_TOKENS_500_PRICE_ID;
    process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED = 'false';
    assert.equal(new SkyTokenPayments('test').enabled, false);
    process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED = 'true';
    process.env.STRIPE_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_live_local_test_only';
    process.env.AIRPORT_CHAOS_WEB_ORIGIN = productionWebOrigin;
    assert.equal(new SkyTokenPayments('live').enabled, false);
    process.env.AIRPORT_CHAOS_SKY_TOKEN_LIVE_ENABLED = 'true';
    assert.equal(new SkyTokenPayments('live').enabled, true);
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_test_only';
    assert.equal(new SkyTokenPayments('live').enabled, false);
  } finally {
    keys.forEach((key, index) => { const value = original[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  }
});

test('the existing webhook verifies its signature and rejects the wrong Stripe environment', () => {
  const { path, cleanup } = fixture();
  const keys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;
  const original = keys.map(key => process.env[key]);
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_test_only';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_localtest';
    const webhook = new FirehawkPayments(path, 'test');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signed = (livemode: boolean) => {
      const body = Buffer.from(JSON.stringify({ id: 'evt_test', type: 'checkout.session.async_payment_failed', livemode,
        data: { object: { id: 'cs_test' } } }));
      const signature = stripe.webhooks.generateTestHeaderString({ payload: body.toString(), secret: process.env.STRIPE_WEBHOOK_SECRET! });
      return { body, signature };
    };
    const testEvent = signed(false);
    assert.equal(webhook.verifyEvent(testEvent.body, testEvent.signature).type, 'checkout.session.async_payment_failed');
    assert.throws(() => webhook.verifyEvent(Buffer.from(testEvent.body.toString().replace('failed', 'succeeded')), testEvent.signature));
    const liveEvent = signed(true);
    assert.throws(() => webhook.verifyEvent(liveEvent.body, liveEvent.signature), /STRIPE_MODE_MISMATCH/);
  } finally {
    keys.forEach((key, index) => { const value = original[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    cleanup();
  }
});

test('all four verified packs grant exact amounts and 4,100 Tokens buy all three aircraft with zero remainder', () => {
  const { store, db, cleanup } = fixture();
  try {
    assert.equal(store.recordVerifiedSkyTokenPurchase({ pilotId: 'other-pilot', accountId: 'account-two', provider: 'stripe',
      transactionId: 'cs_pack_100', packId: 'SKY_TOKENS_100', productId: 'price_100', environment: 'test' }).profile.skyTokens, 100);
    assert.equal(stripePurchase(store, 'cs_pack_500', 'SKY_TOKENS_500').profile.skyTokens, 500);
    assert.equal(stripePurchase(store, 'cs_pack_1200', 'SKY_TOKENS_1200').profile.skyTokens, 1700);
    assert.equal(stripePurchase(store, 'cs_pack_2400', 'SKY_TOKENS_2400').profile.skyTokens, 4100);
    for (const aircraft of ['cargo', 'privateJet', 'fighter'] as const)
      assert.equal(store.purchaseAircraftWithSkyTokens('token-pilot', aircraft).ok, true);
    const profile = store.getOrCreate('token-pilot', 'Token Pilot');
    assert.equal(profile.skyTokens, 0);
    assert.ok((['cargo', 'privateJet', 'fighter'] as const).every(aircraft => profile.unlockedAircraft.includes(aircraft)));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reason='SKY_TOKEN_SPEND'").get() as { n: number }).n, 3);
  } finally { cleanup(); }
});

test('Token aircraft unlock spends atomically once and grants canonical ownership', () => {
  const { store, db, cleanup } = fixture();
  try {
    stripePurchase(store, 'cs_purchase_1200', 'SKY_TOKENS_1200');
    const first = store.purchaseAircraftWithSkyTokens('token-pilot', 'privateJet');
    assert.equal(first.ok, true); assert.equal(first.profile?.skyTokens, 0);
    assert.ok(first.profile?.unlockedAircraft.includes('privateJet'));
    assert.equal(store.purchaseAircraftWithSkyTokens('token-pilot', 'privateJet').profile?.skyTokens, 0);
    assert.equal(store.purchaseAircraftWithSkyTokens('token-pilot', 'fighter').ok, false);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reason='SKY_TOKEN_SPEND'").get() as { n: number }).n, 1);
    stripePurchase(store, 'cs_purchase_2400', 'SKY_TOKENS_2400');
    const fighter = store.purchaseAircraftWithSkyTokens('token-pilot', 'fighter');
    assert.equal(fighter.ok, true);
    assert.ok(fighter.profile?.aircraftEntitlements.includes(firehawkProduct.entitlement));
    assert.equal((db.prepare("SELECT source FROM aircraft_entitlement_sources WHERE pilot_id='token-pilot' AND source='sky_tokens'").get() as { source: string }).source, 'sky_tokens');
  } finally { cleanup(); }
});

test('verified refunds never make a wallet negative and later purchases settle deficit first', () => {
  const { store, db, cleanup } = fixture();
  try {
    stripePurchase(store, 'cs_refund_1200', 'SKY_TOKENS_1200');
    store.purchaseAircraftWithSkyTokens('token-pilot', 'privateJet');
    const refund = store.refundVerifiedSkyTokenPurchase('stripe', 'cs_refund_1200', 1200);
    assert.equal(refund.applied, true); assert.equal(refund.profile?.skyTokens, 0);
    assert.match(store.purchaseAircraftWithSkyTokens('token-pilot', 'cargo').reason ?? '', /REFUNDED SKY TOKENS/);
    assert.equal(store.refundVerifiedSkyTokenPurchase('stripe', 'cs_refund_1200', 1200).applied, false);
    assert.equal(stripePurchase(store, 'cs_refund_1200', 'SKY_TOKENS_1200').applied, false);
    assert.equal((db.prepare("SELECT sky_token_deficit AS n FROM player_profiles WHERE pilot_id='token-pilot'").get() as { n: number }).n, 1200);
    assert.equal(stripePurchase(store, 'cs_replenish_500', 'SKY_TOKENS_500').profile.skyTokens, 0);
    assert.equal((db.prepare("SELECT sky_token_deficit AS n FROM player_profiles WHERE pilot_id='token-pilot'").get() as { n: number }).n, 700);
    assert.equal(stripePurchase(store, 'cs_replenish_1200', 'SKY_TOKENS_1200').profile.skyTokens, 500);
    assert.equal((db.prepare("SELECT sky_token_deficit AS n FROM player_profiles WHERE pilot_id='token-pilot'").get() as { n: number }).n, 0);
  } finally { cleanup(); }
});

test('a one-cent Stripe partial refund reverses one Token once', () => {
  const { store, db, cleanup } = fixture();
  try {
    stripePurchase(store, 'cs_partial_100', 'SKY_TOKENS_100');
    assert.equal(store.refundVerifiedSkyTokenPurchase('stripe', 'cs_partial_100', 1).profile?.skyTokens, 99);
    assert.equal(store.refundVerifiedSkyTokenPurchase('stripe', 'cs_partial_100', 1).applied, false);
    const purchase = db.prepare("SELECT status,refunded_quantity FROM sky_token_purchases WHERE provider_transaction_id='cs_partial_100'")
      .get() as { status: string; refunded_quantity: number };
    assert.equal(purchase.status, 'partially_refunded');
    assert.equal(purchase.refunded_quantity, 1);
  } finally { cleanup(); }
});

test('a zero-balance pilot can buy and unlock Mammoth for 500 Tokens without spending Credits', () => {
  const { store, cleanup } = fixture();
  try {
    const beforeCredits = store.walletBalances('token-pilot')?.credits;
    stripePurchase(store, 'cs_mammoth_500', 'SKY_TOKENS_500');
    const unlock = store.purchaseAircraftWithSkyTokens('token-pilot', 'cargo');
    assert.equal(unlock.ok, true);
    assert.equal(unlock.profile?.skyTokens, 0);
    assert.equal(unlock.profile?.credits, beforeCredits);
    assert.ok(unlock.profile?.unlockedAircraft.includes('cargo'));
  } finally { cleanup(); }
});

test('already refunded checkout never grants its returned Tokens', () => {
  const { store, db, cleanup } = fixture();
  try {
    const result = stripePurchase(store, 'cs_refunded_before_webhook', 'SKY_TOKENS_500', 500);
    assert.equal(result.profile.skyTokens, 0);
    assert.equal(store.skyTokenPurchaseStatus('token-pilot', 'cs_refunded_before_webhook'), 'refunded');
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE currency='SKY_TOKENS'").get() as { n: number }).n, 0);
  } finally { cleanup(); }
});

test('native purchase context binds verified transaction to its account and product', () => {
  const { store, cleanup } = fixture();
  try {
    const context = store.createSkyTokenPurchaseContext('token-pilot', 'account-one', 'apple', 'SKY_TOKENS_500')!;
    const purchase = { pilotId: 'token-pilot', accountId: 'account-one', provider: 'apple' as const,
      transactionId: 'apple-transaction-12345', packId: 'SKY_TOKENS_500' as const, productId: context.productId,
      environment: 'sandbox', accountBinding: context.contextId, purchasedAt: Date.now() };
    assert.throws(() => store.recordVerifiedSkyTokenPurchase({ ...purchase, accountBinding: 'forged-context' }), /CONTEXT_INVALID/);
    assert.equal(store.recordVerifiedSkyTokenPurchase(purchase).profile.skyTokens, 500);
    assert.equal(store.recordVerifiedSkyTokenPurchase(purchase).applied, false);
  } finally { cleanup(); }
});

test('a verified native revocation received before purchase blocks stale purchase proof', () => {
  const { store, cleanup } = fixture();
  try {
    const context = store.createSkyTokenPurchaseContext('token-pilot', 'account-one', 'apple', 'SKY_TOKENS_500')!;
    assert.equal(store.refundVerifiedSkyTokenPurchase('apple', 'apple-revoked-12345', 500).applied, false);
    assert.throws(() => store.recordVerifiedSkyTokenPurchase({ pilotId: 'token-pilot', accountId: 'account-one', provider: 'apple',
      transactionId: 'apple-revoked-12345', packId: 'SKY_TOKENS_500', productId: context.productId,
      environment: 'sandbox', accountBinding: context.contextId, purchasedAt: Date.now() }), /REVOKED/);
    assert.equal(store.walletBalances('token-pilot')?.skyTokens, 0);
  } finally { cleanup(); }
});

test('an older Token purchase table gains the payment-intent index without losing records', () => {
  const { store, db, path, cleanup } = fixture();
  try {
    stripePurchase(store, 'cs_legacy_purchase', 'SKY_TOKENS_500');
    db.exec('DROP INDEX sky_token_purchases_payment_intent; ALTER TABLE sky_token_purchases DROP COLUMN payment_intent_id');
    new PlayerProfileStore(path);
    const columns = db.prepare('PRAGMA table_info(sky_token_purchases)').all() as Array<{ name: string }>;
    assert.ok(columns.some(column => column.name === 'payment_intent_id'));
    assert.equal((db.prepare("SELECT quantity FROM sky_token_purchases WHERE provider_transaction_id='cs_legacy_purchase'")
      .get() as { quantity: number }).quantity, 500);
  } finally { cleanup(); }
});

test('independent profile-store instances cannot spend the same Tokens twice', () => {
  const { store, db, path, cleanup } = fixture();
  try {
    stripePurchase(store, 'cs_cross_instance', 'SKY_TOKENS_1200');
    const other = new PlayerProfileStore(path);
    assert.equal(store.purchaseAircraftWithSkyTokens('token-pilot', 'privateJet').ok, true);
    assert.equal(other.purchaseAircraftWithSkyTokens('token-pilot', 'privateJet').profile?.skyTokens, 0);
    assert.equal(other.purchaseAircraftWithSkyTokens('token-pilot', 'cargo').ok, false);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reason='SKY_TOKEN_SPEND'").get() as { n: number }).n, 1);
  } finally { cleanup(); }
});

test('only a voided one-time purchase for this app reaches the Google refund path', () => {
  const notification = (packageName: string, productType: number) => ({ message: { data: Buffer.from(JSON.stringify({
    packageName, voidedPurchaseNotification: { productType, refundType: 1, purchaseToken: 'purchase-token-from-play-123456' },
  })).toString('base64') } });
  assert.equal(googleVoidedPurchaseNotification(notification('com.vadensoftware.airportchaos', 2)), 'purchase-token-from-play-123456');
  assert.equal(googleVoidedPurchaseNotification(notification('another.app', 2)), undefined);
  assert.equal(googleVoidedPurchaseNotification(notification('com.vadensoftware.airportchaos', 1)), undefined);
});
