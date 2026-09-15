import { DatabaseSync } from 'node:sqlite';
import Stripe from 'stripe';
import { aircraftEconomy } from '../../shared/aircraft-economy.mjs';

const entitlement = 'REDSPEAR_FIGHTER_PREMIUM';
const expectedAmount = 999;
const expectedCurrency = 'usd';

export type CompletedFirehawkPurchase = {
  pilotId: string; sessionId: string; reference: string; customerEmail?: string;
};

export class FirehawkPayments {
  readonly enabled: boolean;
  private readonly stripe?: Stripe;
  private readonly webhookSecret?: string;
  private readonly priceId?: string;
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const mode = process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
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
        customer_email TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS firehawk_purchases_pilot_status ON firehawk_purchases(pilot_id,status);
    `);
  }

  async createCheckout(pilotId: string, origin: string): Promise<{ url: string; sessionId: string }> {
    if (!this.enabled || !this.stripe || !this.priceId) throw new Error('CHECKOUT_UNAVAILABLE');
    const entry = aircraftEconomy.fighter;
    if (entry.access !== 'premium' || entry.entitlement !== entitlement || entry.usdPrice !== '$9.99') throw new Error('PRODUCT_CONFIG_INVALID');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: this.priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { pilotId, entitlement, product: 'firehawk' },
      payment_intent_data: { metadata: { pilotId, entitlement, product: 'firehawk' } },
    });
    if (!session.url) throw new Error('CHECKOUT_UNAVAILABLE');
    return { url: session.url, sessionId: session.id };
  }

  verifyEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!this.stripe || !this.webhookSecret || !signature) throw new Error('INVALID_SIGNATURE');
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async recordPaidCheckout(event: Stripe.Event): Promise<CompletedFirehawkPurchase | undefined> {
    if (!this.stripe || !this.priceId || event.type !== 'checkout.session.completed') return undefined;
    const supplied = event.data.object;
    const session = await this.stripe.checkout.sessions.retrieve(supplied.id);
    const lines = await this.stripe.checkout.sessions.listLineItems(supplied.id, { limit: 10 });
    const pilotId = session.metadata?.pilotId;
    if (session.payment_status !== 'paid' || session.amount_total !== expectedAmount || session.currency !== expectedCurrency ||
      session.metadata?.entitlement !== entitlement || session.metadata?.product !== 'firehawk' ||
      typeof pilotId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(pilotId) ||
      lines.data.length !== 1 || lines.data[0]?.price?.id !== this.priceId || lines.data[0]?.quantity !== 1) return undefined;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const email = session.customer_details?.email?.trim().slice(0, 254) || undefined;
    const inserted = this.database.prepare(`INSERT OR IGNORE INTO firehawk_purchases
      (stripe_event_id,checkout_session_id,payment_intent_id,pilot_id,entitlement,product,amount,currency,status,customer_email,created_at,paid_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(event.id, session.id, paymentIntentId ?? null, pilotId, entitlement, 'firehawk', expectedAmount,
        expectedCurrency, 'paid', email ?? null, event.created * 1000, Date.now());
    if (inserted.changes === 0) return undefined;
    return { pilotId, sessionId: session.id, reference: session.id.slice(-12), customerEmail: email };
  }

  completedForPilot(pilotId: string): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM firehawk_purchases WHERE pilot_id=? AND entitlement=? AND status='paid' LIMIT 1`).get(pilotId, entitlement));
  }

  status(pilotId: string, sessionId: string): { status: 'completed' | 'pending'; reference?: string } {
    const row = this.database.prepare(`SELECT checkout_session_id FROM firehawk_purchases WHERE pilot_id=? AND checkout_session_id=? AND status='paid'`).get(pilotId, sessionId) as { checkout_session_id: string } | undefined;
    return row ? { status: 'completed', reference: row.checkout_session_id.slice(-12) } : { status: 'pending' };
  }

  metrics(): { purchases: number; revenue: number; rows: Array<{ pilotId: string; reference: string; amount: number; paidAt: number; email?: string }> } {
    const rows = this.database.prepare(`SELECT pilot_id,checkout_session_id,amount,paid_at,customer_email FROM firehawk_purchases WHERE status='paid' ORDER BY paid_at DESC LIMIT 30`).all() as Array<{ pilot_id: string; checkout_session_id: string; amount: number; paid_at: number; customer_email?: string }>;
    const summary = this.database.prepare(`SELECT COUNT(*) purchases,COALESCE(SUM(amount),0) revenue FROM firehawk_purchases WHERE status='paid'`).get() as { purchases: number; revenue: number };
    return { purchases: summary.purchases, revenue: summary.revenue, rows: rows.map(row => ({ pilotId: row.pilot_id, reference: row.checkout_session_id.slice(-12), amount: row.amount, paidAt: row.paid_at, email: row.customer_email })) };
  }
}
