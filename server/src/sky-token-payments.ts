import Stripe from 'stripe';
import { skyTokenPack, skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';

const packIds = Object.keys(skyTokenPacks) as SkyTokenPackId[];
export const skyTokenStripeCatalog: Readonly<Record<SkyTokenPackId, Readonly<{ tokens: number; test: string; live: string }>>> = Object.freeze({
  SKY_TOKENS_100: Object.freeze({ tokens: skyTokenPacks.SKY_TOKENS_100.tokens, test: 'price_1UNLxIEggQDpuQ3Q4tKIr0wv', live: 'price_1UNLiNEggQDpuQ3QXQdzfoWl' }),
  SKY_TOKENS_500: Object.freeze({ tokens: skyTokenPacks.SKY_TOKENS_500.tokens, test: 'price_1UNLxQEggQDpuQ3Q9PvnSOnv', live: 'price_1UNLmSEggQDpuQ3QeGUVkzOY' }),
  SKY_TOKENS_1200: Object.freeze({ tokens: skyTokenPacks.SKY_TOKENS_1200.tokens, test: 'price_1UNLxVEggQDpuQ3Q2hmcE6v1', live: 'price_1UNLmXEggQDpuQ3QzLnds85A' }),
  SKY_TOKENS_2400: Object.freeze({ tokens: skyTokenPacks.SKY_TOKENS_2400.tokens, test: 'price_1UNLxaEggQDpuQ3Qn3wfuSgt', live: 'price_1UNLmcEggQDpuQ3QfPJ1cmta' }),
});

export const productionWebOrigin = 'https://fly.vadensoftware.com';

export function skyTokenStripePrices(mode: 'test' | 'live', catalog: Partial<typeof skyTokenStripeCatalog> = skyTokenStripeCatalog): Record<SkyTokenPackId, string> | undefined {
  if (packIds.some(id => catalog[id]?.tokens !== skyTokenPacks[id].tokens || !/^price_[A-Za-z0-9]+$/.test(catalog[id]?.[mode] ?? ''))) return undefined;
  return Object.fromEntries(packIds.map(id => [id, catalog[id]![mode]])) as Record<SkyTokenPackId, string>;
}

const priceEnv: Record<SkyTokenPackId, string> = {
  SKY_TOKENS_100: 'STRIPE_SKY_TOKENS_100_PRICE_ID',
  SKY_TOKENS_500: 'STRIPE_SKY_TOKENS_500_PRICE_ID',
  SKY_TOKENS_1200: 'STRIPE_SKY_TOKENS_1200_PRICE_ID',
  SKY_TOKENS_2400: 'STRIPE_SKY_TOKENS_2400_PRICE_ID',
};

export class SkyTokenPayments {
  readonly enabled: boolean;
  private readonly stripe?: Stripe;
  private readonly prices: Record<SkyTokenPackId, string>;
  private readonly mode: 'test' | 'live';

  constructor(mode: 'test' | 'live') {
    this.mode = mode;
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key?.startsWith(mode === 'live' ? 'sk_live_' : 'sk_test_') ? new Stripe(key) : undefined;
    const selectedPrices = skyTokenStripePrices(mode);
    this.prices = selectedPrices ?? {} as Record<SkyTokenPackId, string>;
    const configuredOrigin = process.env.AIRPORT_CHAOS_WEB_ORIGIN?.trim();
    let originValid = false;
    try {
      const origin = new URL(configuredOrigin ?? '');
      originValid = origin.href === `${origin.origin}/` && (origin.protocol === 'https:' || origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') &&
        (mode === 'live' ? origin.origin === productionWebOrigin : origin.origin !== productionWebOrigin);
    } catch { /* Missing or malformed origin keeps checkout disabled. */ }
    this.enabled = process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED === 'true' &&
      process.env.STRIPE_MODE === mode && (mode === 'test' || process.env.AIRPORT_CHAOS_SKY_TOKEN_LIVE_ENABLED === 'true') &&
      originValid && Boolean(this.stripe) && Boolean(selectedPrices) &&
      /^whsec_[A-Za-z0-9]+$/.test(process.env.STRIPE_WEBHOOK_SECRET ?? '') &&
      packIds.every(id => !process.env[priceEnv[id]]?.trim() || process.env[priceEnv[id]]?.trim() === this.prices[id]);
  }

  async createCheckout(pilotId: string, accountId: string, packId: SkyTokenPackId, origin: string): Promise<{ url: string; sessionId: string }> {
    if (!this.enabled || !this.stripe || !skyTokenPack(packId)) throw new Error('TOKEN_CHECKOUT_UNAVAILABLE');
    const pack = skyTokenPacks[packId];
    const price = await this.stripe.prices.retrieve(this.prices[packId]);
    if (!price.active || price.livemode !== (this.mode === 'live') || price.type !== 'one_time' ||
        price.currency !== 'usd' || price.unit_amount !== pack.usdCents) throw new Error('TOKEN_PRICE_INVALID');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment', line_items: [{ price: this.prices[packId], quantity: 1 }],
      success_url: `${origin}/?token_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?token_checkout=cancel`,
      metadata: { purchaseType: 'sky_tokens', pilotId, accountId, packId },
      payment_intent_data: { metadata: { purchaseType: 'sky_tokens', pilotId, accountId, packId } },
    });
    if (!session.url) throw new Error('TOKEN_CHECKOUT_UNAVAILABLE');
    return { url: session.url, sessionId: session.id };
  }

  async paidCheckout(event: Stripe.Event): Promise<{
    pilotId: string; accountId: string; packId: SkyTokenPackId; productId: string;
    transactionId: string; paymentIntentId?: string; amountCents: number; currency: string; environment: string; purchasedAt: number;
    initialRefundedQuantity: number;
  } | undefined> {
    if (!this.stripe || (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded')) return undefined;
    const supplied = event.data.object as Stripe.Checkout.Session;
    if (supplied.metadata?.purchaseType !== 'sky_tokens') return undefined;
    const session = await this.stripe.checkout.sessions.retrieve(supplied.id);
    if (session.livemode !== (this.mode === 'live')) throw new Error('TOKEN_CHECKOUT_MODE_MISMATCH');
    const packId = session.metadata?.packId as SkyTokenPackId;
    const pack = skyTokenPack(packId);
    const priceId = this.prices[packId];
    if (!pack || !priceId || session.payment_status !== 'paid' || session.currency !== 'usd' || session.amount_total !== pack.usdCents ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(session.metadata?.pilotId ?? '') ||
        !/^[a-f0-9-]{36}$/i.test(session.metadata?.accountId ?? '')) throw new Error('TOKEN_CHECKOUT_INVALID');
    const lines = await this.stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
    if (lines.data.length !== 1 || lines.data[0]?.price?.id !== priceId || lines.data[0]?.quantity !== 1) throw new Error('TOKEN_CHECKOUT_PRICE_MISMATCH');
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId) throw new Error('TOKEN_CHECKOUT_PAYMENT_MISSING');
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    if (intent.status !== 'succeeded' || intent.amount !== pack.usdCents || intent.currency !== 'usd') throw new Error('TOKEN_CHECKOUT_PAYMENT_INVALID');
    const charge = typeof intent.latest_charge === 'string' ? undefined : intent.latest_charge;
    const refundedCents = charge?.amount_refunded ?? 0;
    const initialRefundedQuantity = Math.floor(pack.tokens * refundedCents / pack.usdCents);
    return { pilotId: session.metadata!.pilotId!, accountId: session.metadata!.accountId!, packId,
      productId: priceId, transactionId: session.id, paymentIntentId,
      amountCents: pack.usdCents, currency: 'usd', environment: session.livemode ? 'live' : 'test', purchasedAt: event.created * 1000,
      initialRefundedQuantity };
  }

  async isSkyTokenPaymentIntent(paymentIntentId: string): Promise<boolean> {
    if (!this.stripe) return false;
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return intent.metadata.purchaseType === 'sky_tokens';
  }
}
