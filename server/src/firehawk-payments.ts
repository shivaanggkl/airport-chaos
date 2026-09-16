import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import Stripe from 'stripe';
import { aircraftEconomy, firehawkProduct } from '../../shared/aircraft-economy.mjs';

export type StripeMode = 'test' | 'live';
export type PurchaseMetrics = {
  purchases: number; grossRevenue: number; refundedPurchases: number; refundedAmount: number; netRevenue: number;
  rows: Array<{ pilotId: string; reference: string; amount: number; refundedAmount: number; status: string; paidAt: number; email?: string }>;
};
export type PurchaseMetricsByMode = Record<StripeMode, PurchaseMetrics>;

function configuredStripeMode(): StripeMode { return process.env.STRIPE_MODE === 'live' ? 'live' : 'test'; }
export function stripeModeForLivemode(livemode: boolean): StripeMode { return livemode ? 'live' : 'test'; }
export function stripeModeAcceptsEvent(mode: StripeMode, livemode: boolean): boolean { return stripeModeForLivemode(livemode) === mode; }

export type CompletedFirehawkPurchase = {
  pilotId: string; sessionId: string; reference: string; stripeMode: StripeMode; customerEmail?: string;
};
export type FirehawkRefund = {
  pilotId: string; stripeMode: StripeMode; reference: string; refundedAmount: number; refundDelta: number; fullRefund: boolean;
};

function recoveryHash(code: string): string {
  return createHash('sha256').update(code.replace(/-/g, '').trim().toUpperCase()).digest('hex');
}

function newRecoveryCode(): string {
  return randomBytes(15).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(20, 'X').slice(0, 20).match(/.{1,4}/g)!.join('-');
}

export class FirehawkPayments {
  readonly enabled: boolean;
  readonly mode: StripeMode;
  private readonly stripe?: Stripe;
  private readonly webhookSecret?: string;
  private readonly priceId?: string;
  private readonly database: DatabaseSync;

  constructor(databasePath: string, mode = configuredStripeMode()) {
    this.mode = mode;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.priceId = process.env.STRIPE_FIREHAWK_PRICE_ID;
    const modeMatches = Boolean(secretKey && (mode === 'test' ? secretKey.startsWith('sk_test_') : secretKey.startsWith('sk_live_')));
    this.enabled = Boolean(modeMatches && this.webhookSecret && this.priceId);
    if (modeMatches && secretKey) this.stripe = new Stripe(secretKey);
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS firehawk_purchases (
        stripe_event_id TEXT NOT NULL UNIQUE,
        checkout_session_id TEXT NOT NULL UNIQUE,
        payment_intent_id TEXT,
        pilot_id TEXT NOT NULL,
        entitlement TEXT NOT NULL,
        product TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        stripe_mode TEXT NOT NULL DEFAULT 'test',
        customer_email TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS firehawk_purchases_pilot_status ON firehawk_purchases(pilot_id,status);
    `);
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN recovery_hash TEXT'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN recovery_created_at INTEGER'); } catch { /* already migrated */ }
    // Every pre-mode row was created by the sandbox-only build. SQLite applies
    // this DEFAULT to existing rows, retaining QA history without treating it
    // as commercial revenue or a future LIVE entitlement.
    try { this.database.exec("ALTER TABLE firehawk_purchases ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'test'"); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN entitled_pilot_id TEXT'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN refund_updated_at INTEGER'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN refunded_at INTEGER'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE firehawk_purchases ADD COLUMN last_refund_event_id TEXT'); } catch { /* already migrated */ }
    this.database.exec('UPDATE firehawk_purchases SET entitled_pilot_id=pilot_id WHERE entitled_pilot_id IS NULL');
    this.database.exec('CREATE UNIQUE INDEX IF NOT EXISTS firehawk_purchase_recovery_hash ON firehawk_purchases(recovery_hash) WHERE recovery_hash IS NOT NULL');
    this.database.exec('CREATE INDEX IF NOT EXISTS firehawk_purchases_mode_status ON firehawk_purchases(stripe_mode,status)');
    this.database.exec('CREATE INDEX IF NOT EXISTS firehawk_purchases_payment_mode ON firehawk_purchases(payment_intent_id,stripe_mode)');
  }

  async createCheckout(pilotId: string, origin: string): Promise<{ url: string; sessionId: string }> {
    if (!this.enabled || !this.stripe || !this.priceId) throw new Error('CHECKOUT_UNAVAILABLE');
    const entry = aircraftEconomy.fighter;
    if (entry.access !== 'premium' || entry.entitlement !== firehawkProduct.entitlement || entry.usdPrice !== firehawkProduct.displayPrice) throw new Error('PRODUCT_CONFIG_INVALID');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: this.priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { pilotId, entitlement: firehawkProduct.entitlement, product: firehawkProduct.productId },
      payment_intent_data: { metadata: { pilotId, entitlement: firehawkProduct.entitlement, product: firehawkProduct.productId } },
    });
    if (!session.url) throw new Error('CHECKOUT_UNAVAILABLE');
    return { url: session.url, sessionId: session.id };
  }

  verifyEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!this.stripe || !this.webhookSecret || !signature) throw new Error('INVALID_SIGNATURE');
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    if (!stripeModeAcceptsEvent(this.mode, event.livemode)) throw new Error('STRIPE_MODE_MISMATCH');
    return event;
  }

  async recordPaidCheckout(event: Stripe.Event): Promise<CompletedFirehawkPurchase | undefined> {
    if (!this.stripe || !this.priceId || event.type !== 'checkout.session.completed' || !stripeModeAcceptsEvent(this.mode, event.livemode)) return undefined;
    const supplied = event.data.object;
    const session = await this.stripe.checkout.sessions.retrieve(supplied.id);
    const lines = await this.stripe.checkout.sessions.listLineItems(supplied.id, { limit: 10 });
    const pilotId = session.metadata?.pilotId;
    const stripeMode = stripeModeForLivemode(session.livemode);
    if (stripeMode !== this.mode || session.payment_status !== 'paid' || session.amount_total !== firehawkProduct.amountCents || session.currency !== firehawkProduct.currency ||
      session.metadata?.entitlement !== firehawkProduct.entitlement || session.metadata?.product !== firehawkProduct.productId ||
      typeof pilotId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(pilotId) ||
      lines.data.length !== 1 || lines.data[0]?.price?.id !== this.priceId || lines.data[0]?.quantity !== 1) return undefined;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const email = session.customer_details?.email?.trim().slice(0, 254) || undefined;
    const inserted = this.database.prepare(`INSERT OR IGNORE INTO firehawk_purchases
      (stripe_event_id,checkout_session_id,payment_intent_id,pilot_id,entitled_pilot_id,entitlement,product,amount,currency,status,stripe_mode,customer_email,created_at,paid_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(event.id, session.id, paymentIntentId ?? null, pilotId, pilotId, firehawkProduct.entitlement, firehawkProduct.productId, firehawkProduct.amountCents,
        firehawkProduct.currency, 'paid', stripeMode, email ?? null, event.created * 1000, Date.now());
    if (inserted.changes === 0) return undefined;
    return { pilotId, sessionId: session.id, reference: session.id.slice(-12), stripeMode, customerEmail: email };
  }

  recordRefund(event: Stripe.Event): FirehawkRefund | undefined {
    if (event.type !== 'charge.refunded' || !stripeModeAcceptsEvent(this.mode, event.livemode)) return undefined;
    const charge = event.data.object;
    const stripeMode = stripeModeForLivemode(charge.livemode);
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId || stripeMode !== this.mode || charge.currency !== firehawkProduct.currency || !Number.isSafeInteger(charge.amount_refunded)) return undefined;
    const row = this.database.prepare(`SELECT checkout_session_id,COALESCE(entitled_pilot_id,pilot_id) entitled_pilot_id,amount,refunded_amount,status
      FROM firehawk_purchases WHERE payment_intent_id=? AND stripe_mode=? AND entitlement=? AND product=? LIMIT 1`)
      .get(paymentIntentId, stripeMode, firehawkProduct.entitlement, firehawkProduct.productId) as {
        checkout_session_id: string; entitled_pilot_id: string; amount: number; refunded_amount: number; status: string;
      } | undefined;
    if (!row || charge.amount !== row.amount || row.amount !== firehawkProduct.amountCents) return undefined;
    const refundedAmount = Math.max(0, Math.min(row.amount, charge.amount_refunded));
    if (refundedAmount <= row.refunded_amount) return undefined;
    const fullRefund = refundedAmount >= row.amount;
    const updated = this.database.prepare(`UPDATE firehawk_purchases SET refunded_amount=?,refund_updated_at=?,refunded_at=CASE WHEN ? THEN ? ELSE refunded_at END,
      status=CASE WHEN ? THEN 'refunded' ELSE status END,recovery_hash=CASE WHEN ? THEN NULL ELSE recovery_hash END,
      recovery_created_at=CASE WHEN ? THEN NULL ELSE recovery_created_at END,last_refund_event_id=?
      WHERE checkout_session_id=? AND stripe_mode=? AND refunded_amount<?`)
      .run(refundedAmount, event.created * 1000, fullRefund ? 1 : 0, fullRefund ? event.created * 1000 : null,
        fullRefund ? 1 : 0, fullRefund ? 1 : 0, fullRefund ? 1 : 0, event.id, row.checkout_session_id, stripeMode, refundedAmount);
    if (updated.changes === 0) return undefined;
    return { pilotId: row.entitled_pilot_id, stripeMode, reference: row.checkout_session_id.slice(-12), refundedAmount,
      refundDelta: refundedAmount - row.refunded_amount, fullRefund };
  }

  completedForPilot(pilotId: string): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM firehawk_purchases WHERE COALESCE(entitled_pilot_id,pilot_id)=? AND entitlement=? AND status='paid' AND stripe_mode=? LIMIT 1`).get(pilotId, firehawkProduct.entitlement, this.mode));
  }

  activeEntitlementOwners(): Array<{ pilotId: string; stripeMode: StripeMode }> {
    return this.database.prepare(`SELECT DISTINCT COALESCE(entitled_pilot_id,pilot_id) AS pilotId,stripe_mode AS stripeMode
      FROM firehawk_purchases WHERE entitlement=? AND status='paid'`).all(firehawkProduct.entitlement) as Array<{ pilotId: string; stripeMode: StripeMode }>;
  }

  status(pilotId: string, sessionId: string): { status: 'completed' | 'pending'; reference?: string; recoveryCode?: string } {
    const row = this.database.prepare(`SELECT checkout_session_id FROM firehawk_purchases WHERE pilot_id=? AND checkout_session_id=? AND status='paid' AND stripe_mode=?`).get(pilotId, sessionId, this.mode) as { checkout_session_id: string } | undefined;
    if (!row) return { status: 'pending' };
    const code = newRecoveryCode();
    const created = this.database.prepare('UPDATE firehawk_purchases SET recovery_hash=?,recovery_created_at=? WHERE pilot_id=? AND checkout_session_id=? AND recovery_hash IS NULL')
      .run(recoveryHash(code), Date.now(), pilotId, sessionId);
    return { status: 'completed', reference: row.checkout_session_id.slice(-12), recoveryCode: created.changes > 0 ? code : undefined };
  }

  restore(code: string, pilotId: string): { ok: boolean; recoveryCode?: string; reference?: string; previousPilotId?: string; stripeMode?: StripeMode } {
    const normalized = code.replace(/-/g, '').trim().toUpperCase();
    if (!/^[A-Z0-9]{20}$/.test(normalized)) return { ok: false };
    const row = this.database.prepare("SELECT checkout_session_id,COALESCE(entitled_pilot_id,pilot_id) entitled_pilot_id,stripe_mode FROM firehawk_purchases WHERE recovery_hash=? AND status='paid' AND stripe_mode=?").get(recoveryHash(normalized), this.mode) as { checkout_session_id: string; entitled_pilot_id: string; stripe_mode: StripeMode } | undefined;
    if (!row) return { ok: false };
    const replacement = newRecoveryCode();
    const rotated = this.database.prepare("UPDATE firehawk_purchases SET recovery_hash=?,recovery_created_at=?,entitled_pilot_id=? WHERE checkout_session_id=? AND recovery_hash=? AND status='paid' AND stripe_mode=?")
      .run(recoveryHash(replacement), Date.now(), pilotId, row.checkout_session_id, recoveryHash(normalized), this.mode);
    return rotated.changes > 0 ? { ok: true, recoveryCode: replacement, reference: row.checkout_session_id.slice(-12), previousPilotId: row.entitled_pilot_id, stripeMode: row.stripe_mode } : { ok: false };
  }

  metrics(): PurchaseMetricsByMode {
    const forMode = (mode: StripeMode): PurchaseMetrics => {
      const rows = this.database.prepare(`SELECT COALESCE(entitled_pilot_id,pilot_id) pilot_id,checkout_session_id,amount,refunded_amount,status,paid_at,customer_email FROM firehawk_purchases WHERE stripe_mode=? ORDER BY paid_at DESC LIMIT 30`).all(mode) as Array<{ pilot_id: string; checkout_session_id: string; amount: number; refunded_amount: number; status: string; paid_at: number; customer_email?: string }>;
      const summary = this.database.prepare(`SELECT COALESCE(SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END),0) purchases,COALESCE(SUM(amount),0) gross_revenue,
        COALESCE(SUM(CASE WHEN refunded_amount>0 THEN 1 ELSE 0 END),0) refunded_purchases,COALESCE(SUM(refunded_amount),0) refunded_amount,
        COALESCE(SUM(amount-refunded_amount),0) net_revenue FROM firehawk_purchases WHERE stripe_mode=?`).get(mode) as { purchases: number; gross_revenue: number; refunded_purchases: number; refunded_amount: number; net_revenue: number };
      return { purchases: summary.purchases, grossRevenue: summary.gross_revenue, refundedPurchases: summary.refunded_purchases,
        refundedAmount: summary.refunded_amount, netRevenue: summary.net_revenue,
        rows: rows.map(row => ({ pilotId: row.pilot_id, reference: row.checkout_session_id.slice(-12), amount: row.amount,
          refundedAmount: row.refunded_amount, status: row.status, paidAt: row.paid_at, email: row.customer_email })) };
    };
    return { live: forMode('live'), test: forMode('test') };
  }
}
