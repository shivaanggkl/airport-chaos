import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  Environment,
  InAppOwnershipType,
  SignedDataVerifier,
  Type,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';

export type NativePurchaseProvider = 'apple' | 'google';
export type PurchaseAccount = { accountId?: string; pilotId: string };
export type VerifiedNativePurchase = {
  provider: NativePurchaseProvider;
  providerTransactionId: string;
  providerOriginalId?: string;
  productId: string;
  environment: 'sandbox' | 'production';
  purchasedAt: number;
  amountCents?: number;
  currency?: string;
  accountBinding?: string;
  active: boolean;
  acknowledged?: boolean;
};
export type NativePurchaseGrant = {
  ok: boolean;
  reason?: 'ACCOUNT_REQUIRED' | 'INVALID_CONTEXT' | 'ACCOUNT_MISMATCH' | 'PURCHASE_INACTIVE';
  pilotId?: string;
  source?: string;
  duplicate?: boolean;
};

type PurchaseContextRow = {
  context_id: string; store_account_id: string; account_id: string; pilot_id: string;
  provider: NativePurchaseProvider; intent: 'purchase' | 'restore'; expires_at: number; consumed_at: number | null;
};
type LedgerRow = {
  provider: NativePurchaseProvider; provider_transaction_id: string; account_id: string | null;
  pilot_id: string; source: string; status: string;
};

const contextLifetimeMs = 30 * 60_000;
const productIds: Record<NativePurchaseProvider, string> = {
  apple: firehawkProduct.appleProductId,
  google: firehawkProduct.googleProductId,
};

function digest(value: string): string { return createHash('sha256').update(value).digest('base64url'); }
function safeIdentifier(value: string | undefined, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9._:-]+$/.test(value);
}

export class NativePurchaseLedger {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS firehawk_purchase_contexts (
        context_id TEXT PRIMARY KEY,
        store_account_id TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL,
        pilot_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        intent TEXT NOT NULL DEFAULT 'purchase',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS firehawk_purchase_contexts_expiry ON firehawk_purchase_contexts(expires_at);
      CREATE TABLE IF NOT EXISTS firehawk_purchase_ledger (
        provider TEXT NOT NULL,
        provider_transaction_id TEXT NOT NULL,
        provider_original_id TEXT,
        account_id TEXT,
        pilot_id TEXT NOT NULL,
        entitlement TEXT NOT NULL,
        product_id TEXT NOT NULL,
        amount INTEGER,
        currency TEXT,
        environment TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revoked_at INTEGER,
        PRIMARY KEY(provider,provider_transaction_id)
      );
      CREATE INDEX IF NOT EXISTS firehawk_purchase_ledger_account ON firehawk_purchase_ledger(account_id,status);
      CREATE INDEX IF NOT EXISTS firehawk_purchase_ledger_pilot ON firehawk_purchase_ledger(pilot_id,status);
      CREATE UNIQUE INDEX IF NOT EXISTS firehawk_purchase_ledger_original
        ON firehawk_purchase_ledger(provider,provider_original_id)
        WHERE provider_original_id IS NOT NULL AND provider IN ('apple','google');
      CREATE TABLE IF NOT EXISTS firehawk_purchase_notifications (
        provider TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        PRIMARY KEY(provider,notification_id)
      );
    `);
    try { this.database.exec("ALTER TABLE firehawk_purchase_contexts ADD COLUMN intent TEXT NOT NULL DEFAULT 'purchase'"); } catch { /* already migrated */ }
    this.importStripeHistory();
  }

  private importStripeHistory(): void {
    const exists = this.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='firehawk_purchases'").get();
    if (!exists) return;
    this.database.exec(`INSERT OR IGNORE INTO firehawk_purchase_ledger(
      provider,provider_transaction_id,provider_original_id,account_id,pilot_id,entitlement,product_id,amount,currency,environment,source,status,verified_at,updated_at,revoked_at
    ) SELECT 'stripe',checkout_session_id,payment_intent_id,account_id,COALESCE(entitled_pilot_id,pilot_id),entitlement,product,amount,currency,
      stripe_mode,'stripe:' || stripe_mode,CASE WHEN status='paid' THEN 'active' ELSE status END,paid_at,
      COALESCE(refund_updated_at,paid_at),refunded_at FROM firehawk_purchases`);
  }

  createContext(identity: PurchaseAccount, provider: NativePurchaseProvider, nowOrIntent: number | 'purchase' | 'restore' = Date.now(), intent: 'purchase' | 'restore' = 'purchase'): { contextId: string; storeAccountId: string; productId: string } | undefined {
    if (!identity.accountId) return undefined;
    const now = typeof nowOrIntent === 'number' ? nowOrIntent : Date.now();
    const resolvedIntent = typeof nowOrIntent === 'string' ? nowOrIntent : intent;
    const contextId = randomUUID();
    const storeAccountId = digest(`airport-chaos:${contextId}`);
    this.database.prepare(`INSERT INTO firehawk_purchase_contexts
      (context_id,store_account_id,account_id,pilot_id,provider,intent,created_at,expires_at,consumed_at)
      VALUES(?,?,?,?,?,?,?,?,NULL)`).run(contextId, storeAccountId, identity.accountId, identity.pilotId, provider, resolvedIntent, now, now + contextLifetimeMs);
    return { contextId, storeAccountId, productId: productIds[provider] };
  }

  recordVerified(identity: PurchaseAccount, contextId: string, purchase: VerifiedNativePurchase, now = Date.now()): NativePurchaseGrant {
    if (!identity.accountId) return { ok: false, reason: 'ACCOUNT_REQUIRED' };
    if (!purchase.active) return { ok: false, reason: 'PURCHASE_INACTIVE' };
    if (purchase.productId !== productIds[purchase.provider] || !safeIdentifier(purchase.providerTransactionId)) return { ok: false, reason: 'INVALID_CONTEXT' };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.database.prepare(`SELECT provider,provider_transaction_id,account_id,pilot_id,source,status
        FROM firehawk_purchase_ledger WHERE provider=? AND provider_transaction_id=?`).get(purchase.provider, purchase.providerTransactionId) as LedgerRow | undefined;
      if (existing) {
        if (existing.account_id !== identity.accountId || existing.pilot_id !== identity.pilotId) {
          this.database.exec('ROLLBACK'); return { ok: false, reason: 'ACCOUNT_MISMATCH' };
        }
        if (existing.status !== 'active') { this.database.exec('ROLLBACK'); return { ok: false, reason: 'PURCHASE_INACTIVE' }; }
        this.database.exec('COMMIT');
        return { ok: true, pilotId: existing.pilot_id, source: existing.source, duplicate: true };
      }
      const context = this.database.prepare(`SELECT context_id,store_account_id,account_id,pilot_id,provider,intent,expires_at,consumed_at
        FROM firehawk_purchase_contexts WHERE context_id=?`).get(contextId) as PurchaseContextRow | undefined;
      if (!context || context.consumed_at !== null || context.expires_at <= now || context.provider !== purchase.provider ||
          context.account_id !== identity.accountId || context.pilot_id !== identity.pilotId) {
        this.database.exec('ROLLBACK'); return { ok: false, reason: 'INVALID_CONTEXT' };
      }
      let purchaseContext: PurchaseContextRow | undefined = context;
      if (context.intent === 'restore') {
        const bindingColumn = purchase.provider === 'apple' ? 'context_id' : 'store_account_id';
        purchaseContext = this.database.prepare(`SELECT context_id,store_account_id,account_id,pilot_id,provider,intent,expires_at,consumed_at
          FROM firehawk_purchase_contexts WHERE ${bindingColumn}=?`).get(purchase.accountBinding ?? '') as PurchaseContextRow | undefined;
      }
      const expectedBinding = purchase.provider === 'apple' ? purchaseContext?.context_id : purchaseContext?.store_account_id;
      if (!purchaseContext || purchaseContext.intent !== 'purchase' || purchaseContext.consumed_at !== null ||
          purchaseContext.provider !== purchase.provider || purchaseContext.account_id !== identity.accountId ||
          purchaseContext.pilot_id !== identity.pilotId || purchase.accountBinding !== expectedBinding) {
        this.database.exec('ROLLBACK'); return { ok: false, reason: 'INVALID_CONTEXT' };
      }
      const source = `${purchase.provider}:${digest(purchase.providerTransactionId).slice(0, 48)}`;
      this.database.prepare(`INSERT INTO firehawk_purchase_ledger(
        provider,provider_transaction_id,provider_original_id,account_id,pilot_id,entitlement,product_id,amount,currency,environment,source,status,verified_at,updated_at,revoked_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(
        purchase.provider, purchase.providerTransactionId, purchase.providerOriginalId ?? null, identity.accountId, identity.pilotId,
        firehawkProduct.entitlement, purchase.productId, purchase.amountCents ?? null, purchase.currency ?? null,
        purchase.environment, source, 'active', now, now,
      );
      const consumed = this.database.prepare('UPDATE firehawk_purchase_contexts SET consumed_at=? WHERE context_id=? AND consumed_at IS NULL AND expires_at>?')
        .run(now, contextId, now);
      if (!consumed.changes) throw new Error('PURCHASE_CONTEXT_RACE');
      if (purchaseContext.context_id !== contextId) {
        const purchaseConsumed = this.database.prepare('UPDATE firehawk_purchase_contexts SET consumed_at=? WHERE context_id=? AND consumed_at IS NULL')
          .run(now, purchaseContext.context_id);
        if (!purchaseConsumed.changes) throw new Error('PURCHASE_CONTEXT_RACE');
      }
      this.database.exec('COMMIT');
      return { ok: true, pilotId: identity.pilotId, source, duplicate: false };
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* already rolled back */ }
      if (String(error).includes('UNIQUE constraint failed')) return { ok: false, reason: 'ACCOUNT_MISMATCH' };
      throw error;
    }
  }

  recordStripePurchase(input: { transactionId: string; originalId?: string; accountId?: string; pilotId: string; mode: 'test' | 'live'; verifiedAt?: number }): void {
    const now = input.verifiedAt ?? Date.now();
    this.database.prepare(`INSERT OR IGNORE INTO firehawk_purchase_ledger(
      provider,provider_transaction_id,provider_original_id,account_id,pilot_id,entitlement,product_id,amount,currency,environment,source,status,verified_at,updated_at,revoked_at
    ) VALUES('stripe',?,?,?,?,?,?,?,?,?,?,'active',?,?,NULL)`).run(
      input.transactionId, input.originalId ?? null, input.accountId ?? null, input.pilotId, firehawkProduct.entitlement,
      firehawkProduct.productId, firehawkProduct.amountCents, firehawkProduct.currency, input.mode, `stripe:${input.mode}`, now, now,
    );
  }

  recordStripeRefund(transactionId: string, refundedAt = Date.now()): void {
    this.database.prepare("UPDATE firehawk_purchase_ledger SET status='refunded',revoked_at=?,updated_at=? WHERE provider='stripe' AND provider_transaction_id=?")
      .run(refundedAt, refundedAt, transactionId);
  }

  recordNotification(provider: NativePurchaseProvider, notificationId: string, now = Date.now()): boolean {
    if (!safeIdentifier(notificationId, 256)) return false;
    return this.database.prepare('INSERT OR IGNORE INTO firehawk_purchase_notifications(provider,notification_id,received_at) VALUES(?,?,?)')
      .run(provider, notificationId, now).changes > 0;
  }

  revoke(provider: NativePurchaseProvider, providerTransactionId: string, now = Date.now()): { pilotId: string; source: string } | undefined {
    const row = this.database.prepare(`SELECT pilot_id,source,status FROM firehawk_purchase_ledger
      WHERE provider=? AND provider_transaction_id=?`).get(provider, providerTransactionId) as { pilot_id: string; source: string; status: string } | undefined;
    if (!row || row.status !== 'active') return undefined;
    const changed = this.database.prepare(`UPDATE firehawk_purchase_ledger SET status='revoked',revoked_at=?,updated_at=?
      WHERE provider=? AND provider_transaction_id=? AND status='active'`).run(now, now, provider, providerTransactionId);
    return changed.changes ? { pilotId: row.pilot_id, source: row.source } : undefined;
  }

  activeEntitlementOwners(): Array<{ pilotId: string; source: string }> {
    return this.database.prepare(`SELECT DISTINCT pilot_id AS pilotId,source FROM firehawk_purchase_ledger
      WHERE entitlement=? AND status='active'`).all(firehawkProduct.entitlement) as Array<{ pilotId: string; source: string }>;
  }

  activeNativeSourcesForPilot(pilotId: string): string[] {
    return (this.database.prepare(`SELECT DISTINCT source FROM firehawk_purchase_ledger
      WHERE pilot_id=? AND provider IN ('apple','google') AND entitlement=? AND status='active'`).all(pilotId, firehawkProduct.entitlement) as Array<{ source: string }>)
      .map(row => row.source);
  }

  hasActiveSource(pilotId: string, source: string): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM firehawk_purchase_ledger WHERE pilot_id=? AND source=? AND status='active' LIMIT 1`).get(pilotId, source));
  }

  prune(now = Date.now()): void {
    this.database.prepare('DELETE FROM firehawk_purchase_contexts WHERE expires_at<=?').run(now - 24 * 60 * 60_000);
  }
}

type GoogleProductPurchase = {
  purchaseTimeMillis?: string; purchaseState?: number; consumptionState?: number; orderId?: string;
  acknowledgementState?: number; purchaseType?: number; productId?: string; quantity?: number;
  obfuscatedExternalAccountId?: string; refundableQuantity?: number;
};

export class NativePurchaseVerifier {
  readonly appleEnabled: boolean;
  readonly googleEnabled: boolean;
  private readonly appleVerifier?: SignedDataVerifier;
  private readonly appleEnvironment?: Environment;
  private readonly googleAuth?: GoogleAuth;
  private readonly googlePushVerifier = new OAuth2Client();
  private readonly googlePushAudience?: string;
  private readonly googlePushServiceAccount?: string;

  constructor() {
    const environmentValue = process.env.AIRPORT_CHAOS_APPLE_IAP_ENVIRONMENT?.trim().toLowerCase();
    const environment = environmentValue === 'production' ? Environment.PRODUCTION : environmentValue === 'sandbox' ? Environment.SANDBOX : undefined;
    const roots = (process.env.AIRPORT_CHAOS_APPLE_IAP_ROOT_CERTIFICATES_BASE64 ?? '').split(',').map(value => value.trim()).filter(Boolean).map(value => Buffer.from(value, 'base64'));
    const appleIdValue = Number(process.env.AIRPORT_CHAOS_APPLE_IAP_APP_APPLE_ID);
    const appAppleId = Number.isSafeInteger(appleIdValue) && appleIdValue > 0 ? appleIdValue : undefined;
    if (environment && roots.length > 0 && (environment === Environment.SANDBOX || appAppleId)) {
      this.appleEnvironment = environment;
      this.appleVerifier = new SignedDataVerifier(roots, true, environment, 'com.vadensoftware.airportchaos', appAppleId);
    }
    this.appleEnabled = Boolean(this.appleVerifier);

    const serviceAccountValue = process.env.AIRPORT_CHAOS_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (serviceAccountValue) {
      try {
        const credentials = JSON.parse(serviceAccountValue) as { client_email?: string; private_key?: string };
        if (credentials.client_email && credentials.private_key) {
          this.googleAuth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
        }
      } catch { /* disabled rather than accepting malformed credentials */ }
    }
    this.googleEnabled = Boolean(this.googleAuth);
    this.googlePushAudience = process.env.AIRPORT_CHAOS_GOOGLE_PLAY_PUBSUB_AUDIENCE;
    this.googlePushServiceAccount = process.env.AIRPORT_CHAOS_GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT;
  }

  async verifyApple(signedTransaction: string): Promise<VerifiedNativePurchase> {
    if (!this.appleVerifier || !this.appleEnvironment || signedTransaction.length < 100 || signedTransaction.length > 32_000) throw new Error('APPLE_PURCHASE_UNAVAILABLE');
    const transaction = await this.appleVerifier.verifyAndDecodeTransaction(signedTransaction);
    const expectedEnvironment = this.appleEnvironment === Environment.PRODUCTION ? 'production' : 'sandbox';
    const active = transaction.revocationDate === undefined;
    if (!safeIdentifier(transaction.transactionId, 128) || transaction.productId !== firehawkProduct.appleProductId ||
        transaction.bundleId !== 'com.vadensoftware.airportchaos' || transaction.environment !== this.appleEnvironment ||
        transaction.type !== Type.NON_CONSUMABLE || transaction.inAppOwnershipType !== InAppOwnershipType.PURCHASED ||
        transaction.quantity !== 1 || !Number.isFinite(transaction.purchaseDate)) throw new Error('APPLE_PURCHASE_INVALID');
    const currency = typeof transaction.currency === 'string' ? transaction.currency.toLowerCase() : undefined;
    const amountCents = Number.isSafeInteger(transaction.price) ? Math.round(transaction.price! / 10) : undefined;
    if (currency === firehawkProduct.currency && amountCents !== firehawkProduct.amountCents) throw new Error('APPLE_PURCHASE_PRICE_MISMATCH');
    return {
      provider: 'apple', providerTransactionId: transaction.transactionId,
      providerOriginalId: safeIdentifier(transaction.originalTransactionId, 128) ? transaction.originalTransactionId : transaction.transactionId,
      productId: transaction.productId, environment: expectedEnvironment, purchasedAt: transaction.purchaseDate!,
      amountCents, currency, accountBinding: transaction.appAccountToken, active,
    };
  }

  async decodeAppleNotification(signedPayload: string): Promise<{ notificationId: string; purchase?: VerifiedNativePurchase }> {
    if (!this.appleVerifier || signedPayload.length < 100 || signedPayload.length > 64_000) throw new Error('APPLE_NOTIFICATION_INVALID');
    const notification = await this.appleVerifier.verifyAndDecodeNotification(signedPayload);
    if (!safeIdentifier(notification.notificationUUID, 128)) throw new Error('APPLE_NOTIFICATION_INVALID');
    const signedTransaction = notification.data?.signedTransactionInfo;
    return { notificationId: notification.notificationUUID, purchase: signedTransaction ? await this.verifyApple(signedTransaction) : undefined };
  }

  async verifyGoogle(purchaseToken: string): Promise<VerifiedNativePurchase> {
    const purchase = await this.googlePurchase(purchaseToken);
    if (purchase.productId !== firehawkProduct.googleProductId || (purchase.quantity ?? 1) !== 1 || purchase.consumptionState !== 0 ||
        !safeIdentifier(purchase.orderId, 256) || !Number.isFinite(Number(purchase.purchaseTimeMillis))) throw new Error('GOOGLE_PURCHASE_INVALID');
    return {
      provider: 'google', providerTransactionId: digest(purchaseToken), providerOriginalId: purchase.orderId,
      productId: purchase.productId, environment: purchase.purchaseType === 0 ? 'sandbox' : 'production',
      purchasedAt: Number(purchase.purchaseTimeMillis), accountBinding: purchase.obfuscatedExternalAccountId,
      active: purchase.purchaseState === 0 && (purchase.refundableQuantity === undefined || purchase.refundableQuantity > 0),
      acknowledged: purchase.acknowledgementState === 1,
    };
  }

  async acknowledgeGoogle(purchaseToken: string): Promise<void> {
    if (!this.googleAuth) throw new Error('GOOGLE_PURCHASE_UNAVAILABLE');
    const client = await this.googleAuth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error('GOOGLE_PURCHASE_UNAVAILABLE');
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.vadensoftware.airportchaos/purchases/products/${encodeURIComponent(firehawkProduct.googleProductId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok && response.status !== 409) throw new Error('GOOGLE_ACKNOWLEDGEMENT_FAILED');
  }

  async verifyGooglePushAuthorization(authorization: string | undefined): Promise<boolean> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !this.googlePushAudience || !this.googlePushServiceAccount) return false;
    try {
      const ticket = await this.googlePushVerifier.verifyIdToken({ idToken: token, audience: this.googlePushAudience });
      const payload = ticket.getPayload();
      return payload?.email === this.googlePushServiceAccount && payload.email_verified === true;
    } catch { return false; }
  }

  private async googlePurchase(purchaseToken: string): Promise<GoogleProductPurchase> {
    if (!this.googleAuth || purchaseToken.length < 20 || purchaseToken.length > 4_096) throw new Error('GOOGLE_PURCHASE_UNAVAILABLE');
    const client = await this.googleAuth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error('GOOGLE_PURCHASE_UNAVAILABLE');
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.vadensoftware.airportchaos/purchases/products/${encodeURIComponent(firehawkProduct.googleProductId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.token}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error('GOOGLE_PURCHASE_INVALID');
    return await response.json() as GoogleProductPurchase;
  }
}

export function googleNotificationToken(body: unknown): string | undefined {
  const message = body && typeof body === 'object' ? (body as { message?: { data?: unknown } }).message : undefined;
  if (!message || typeof message.data !== 'string' || message.data.length > 32_000) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as { oneTimeProductNotification?: { purchaseToken?: unknown; sku?: unknown } };
    const notification = decoded.oneTimeProductNotification;
    return notification?.sku === firehawkProduct.googleProductId && typeof notification.purchaseToken === 'string' ? notification.purchaseToken : undefined;
  } catch { return undefined; }
}
