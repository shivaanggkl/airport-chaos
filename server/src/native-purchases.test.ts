import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { NativePurchaseLedger, googleNotificationToken, type VerifiedNativePurchase } from './native-purchases.js';
import { PlayerProfileStore } from './player-profiles.js';

function databasePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'airport-chaos-native-purchase-')), 'profiles.sqlite');
}

function applePurchase(contextId: string, transactionId = '2000000123456789'): VerifiedNativePurchase {
  return {
    provider: 'apple',
    providerTransactionId: transactionId,
    providerOriginalId: '2000000123456700',
    productId: firehawkProduct.appleProductId,
    environment: 'sandbox',
    purchasedAt: 1_800_000_000_000,
    amountCents: firehawkProduct.amountCents,
    currency: firehawkProduct.currency,
    accountBinding: contextId,
    active: true,
  };
}

function googlePurchase(storeAccountId: string, transactionId = 'purchase-token-digest-0001'): VerifiedNativePurchase {
  return {
    provider: 'google',
    providerTransactionId: transactionId,
    providerOriginalId: 'GPA.1234-5678-9012-34567',
    productId: firehawkProduct.googleProductId,
    environment: 'sandbox',
    purchasedAt: 1_800_000_000_000,
    accountBinding: storeAccountId,
    active: true,
    acknowledged: false,
  };
}

test('Firehawk uses exact $24 shared product configuration on every storefront', () => {
  assert.deepEqual(firehawkProduct, {
    productId: 'firehawk',
    appleProductId: 'com.vadensoftware.airportchaos.firehawk',
    googleProductId: 'firehawk',
    displayPrice: '$24.00',
    amountCents: 2400,
    currency: 'usd',
    entitlement: 'REDSPEAR_FIGHTER_PREMIUM',
  });
});

test('native purchase contexts require an account and bind Apple proof to account and pilot', () => {
  const ledger = new NativePurchaseLedger(databasePath());
  assert.equal(ledger.createContext({ pilotId: 'guest-pilot' }, 'apple'), undefined);
  const identity = { accountId: 'account-a', pilotId: 'pilot-a' };
  const context = ledger.createContext(identity, 'apple', 1_000)!;
  assert.equal(context.productId, firehawkProduct.appleProductId);

  const wrongAccount = ledger.recordVerified({ accountId: 'account-b', pilotId: 'pilot-b' }, context.contextId, applePurchase(context.contextId), 2_000);
  assert.deepEqual(wrongAccount, { ok: false, reason: 'INVALID_CONTEXT' });
  const granted = ledger.recordVerified(identity, context.contextId, applePurchase(context.contextId), 2_000);
  assert.equal(granted.ok, true);
  assert.equal(granted.duplicate, false);
  assert.match(granted.source ?? '', /^apple:/);
});

test('verified native transaction is idempotent for its owner and cannot be replayed by Account B', () => {
  const ledger = new NativePurchaseLedger(databasePath());
  const accountA = { accountId: 'account-a', pilotId: 'pilot-a' };
  const context = ledger.createContext(accountA, 'apple')!;
  const purchase = applePurchase(context.contextId);
  assert.equal(ledger.recordVerified(accountA, context.contextId, purchase).ok, true);

  const repeat = ledger.recordVerified(accountA, 'expired-or-new-context', purchase);
  assert.equal(repeat.ok, true);
  assert.equal(repeat.duplicate, true);
  const accountB = ledger.recordVerified({ accountId: 'account-b', pilotId: 'pilot-b' }, 'anything', purchase);
  assert.deepEqual(accountB, { ok: false, reason: 'ACCOUNT_MISMATCH' });
});

test('restore is idempotent for a known owner and can recover only a purchase-bound transaction', () => {
  const ledger = new NativePurchaseLedger(databasePath());
  const accountA = { accountId: 'account-a', pilotId: 'pilot-a' };
  const purchaseContext = ledger.createContext(accountA, 'apple', 'purchase')!;
  const purchase = applePurchase(purchaseContext.contextId);
  assert.equal(ledger.recordVerified(accountA, purchaseContext.contextId, purchase).ok, true);
  const knownRestore = ledger.createContext(accountA, 'apple', 'restore')!;
  assert.deepEqual(ledger.recordVerified(accountA, knownRestore.contextId, purchase), {
    ok: true, pilotId: accountA.pilotId, source: ledger.activeNativeSourcesForPilot(accountA.pilotId)[0], duplicate: true,
  });

  const recoverablePurchaseContext = ledger.createContext(accountA, 'apple', 'purchase')!;
  const restoreContext = ledger.createContext(accountA, 'apple', 'restore')!;
  const recoverablePurchase = { ...applePurchase(recoverablePurchaseContext.contextId, '2000000123456798'), providerOriginalId: '2000000123456798' };
  assert.equal(ledger.recordVerified(accountA, restoreContext.contextId, recoverablePurchase).ok, true);

  const restoreOnlyContext = ledger.createContext(accountA, 'apple', 'restore')!;
  assert.deepEqual(ledger.recordVerified(accountA, restoreOnlyContext.contextId, applePurchase(restoreOnlyContext.contextId, '2000000123456799')),
    { ok: false, reason: 'INVALID_CONTEXT' });
});

test('inactive, wrong-product, expired, and already-consumed purchase contexts do not grant', () => {
  const ledger = new NativePurchaseLedger(databasePath());
  const identity = { accountId: 'account-a', pilotId: 'pilot-a' };
  const inactiveContext = ledger.createContext(identity, 'apple')!;
  assert.deepEqual(ledger.recordVerified(identity, inactiveContext.contextId, { ...applePurchase(inactiveContext.contextId), active: false }),
    { ok: false, reason: 'PURCHASE_INACTIVE' });
  const productContext = ledger.createContext(identity, 'apple')!;
  assert.deepEqual(ledger.recordVerified(identity, productContext.contextId, { ...applePurchase(productContext.contextId), productId: 'fake-product' }),
    { ok: false, reason: 'INVALID_CONTEXT' });
  const expiredContext = ledger.createContext(identity, 'apple', 1_000)!;
  assert.deepEqual(ledger.recordVerified(identity, expiredContext.contextId, applePurchase(expiredContext.contextId), 31 * 60_000),
    { ok: false, reason: 'INVALID_CONTEXT' });

  const consumedContext = ledger.createContext(identity, 'apple')!;
  assert.equal(ledger.recordVerified(identity, consumedContext.contextId, applePurchase(consumedContext.contextId, '2000000123456790')).ok, true);
  assert.deepEqual(ledger.recordVerified(identity, consumedContext.contextId, applePurchase(consumedContext.contextId, '2000000123456791')),
    { ok: false, reason: 'INVALID_CONTEXT' });
});

test('Google purchase uses obfuscated account binding and revocation removes only its source', () => {
  const path = databasePath();
  const ledger = new NativePurchaseLedger(path);
  const profiles = new PlayerProfileStore(path);
  const identity = { accountId: 'account-a', pilotId: 'pilot-a' };
  profiles.getOrCreate(identity.pilotId, 'Pilot A');
  profiles.getOrCreate('pilot-b', 'Pilot B');
  const context = ledger.createContext(identity, 'google')!;
  const grant = ledger.recordVerified(identity, context.contextId, googlePurchase(context.storeAccountId));
  assert.equal(grant.ok, true);
  const owned = profiles.grantAircraftEntitlements(identity.pilotId, ['fighter'], grant.source!);
  assert.equal(owned?.aircraftEntitlements.includes(firehawkProduct.entitlement), true);
  assert.equal(profiles.getOrCreate('pilot-b', 'Pilot B').aircraftEntitlements.includes(firehawkProduct.entitlement), false);

  const revoked = ledger.revoke('google', 'purchase-token-digest-0001');
  assert.deepEqual(revoked, { pilotId: identity.pilotId, source: grant.source });
  const removed = profiles.revokeAircraftEntitlementSource(identity.pilotId, 'fighter', revoked!.source);
  assert.equal(removed?.aircraftEntitlements.includes(firehawkProduct.entitlement), false);
  assert.equal(ledger.revoke('google', 'purchase-token-digest-0001'), undefined);
});

test('existing Stripe and legacy entitlement sources remain authoritative', () => {
  const path = databasePath();
  const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('legacy-owner', 'Legacy Owner');
  profiles.grantAircraftEntitlements('legacy-owner', ['fighter'], 'stripe:live');
  const ledger = new NativePurchaseLedger(path);
  ledger.recordStripePurchase({ transactionId: 'cs_test_24', originalId: 'pi_test_24', accountId: 'account-a', pilotId: 'pilot-a', mode: 'test' });
  assert.deepEqual(ledger.activeEntitlementOwners().find(row => row.pilotId === 'pilot-a')?.source, 'stripe:test');
  assert.equal(profiles.getOrCreate('legacy-owner', 'Legacy Owner').aircraftEntitlements.includes(firehawkProduct.entitlement), true);
});

test('store notifications are idempotent and Google Pub/Sub payload accepts only Firehawk', () => {
  const ledger = new NativePurchaseLedger(databasePath());
  assert.equal(ledger.recordNotification('apple', 'notification-1'), true);
  assert.equal(ledger.recordNotification('apple', 'notification-1'), false);
  assert.equal(ledger.recordNotification('apple', ''), false);
  const body = (sku: string) => ({ message: { data: Buffer.from(JSON.stringify({
    oneTimeProductNotification: { sku, purchaseToken: 'play-token-12345678901234567890' },
  })).toString('base64') } });
  assert.equal(googleNotificationToken(body('firehawk')), 'play-token-12345678901234567890');
  assert.equal(googleNotificationToken(body('other-product')), undefined);
  assert.equal(googleNotificationToken({ message: { data: 'not-base64-json' } }), undefined);
});

test('native adapters keep proof server-bound and handle localized price, pending, restore, and StoreKit finish', () => {
  const root = join(import.meta.dirname, '../..');
  const client = readFileSync(join(root, 'client/src/native-purchases.ts'), 'utf8');
  const ios = readFileSync(join(root, 'native-auth/ios/Sources/NativeAuthPlugin/NativePurchasePlugin.swift'), 'utf8');
  const android = readFileSync(join(root, 'native-auth/android/src/main/java/com/vadensoftware/airportchaos/nativeauth/NativePurchasePlugin.java'), 'utf8');
  assert.match(client, /\/api\/firehawk\/native\/verify/);
  assert.match(client, /purchaseContext\('purchase'\)/);
  assert.match(client, /purchaseContext\('restore'\)/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.match(ios, /Transaction\.currentEntitlements/);
  assert.match(ios, /AppStore\.sync\(\)/);
  assert.match(ios, /displayPrice/);
  assert.match(android, /Purchase\.PurchaseState\.PENDING/);
  assert.match(android, /queryPurchasesAsync/);
  assert.match(android, /getFormattedPrice/);
  assert.doesNotMatch(android, /acknowledgePurchase/);
});
