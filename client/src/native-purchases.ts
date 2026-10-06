import { Capacitor, registerPlugin } from '@capacitor/core';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { apiFetch, apiUrl } from './transport';

export type NativePurchaseProvider = 'apple' | 'google';
export type NativeStoreOffer = { productId: string; localizedPrice: string; displayName?: string };
type NativeStoreResult = {
  state: 'purchased' | 'pending' | 'cancelled' | 'notFound';
  productId: string;
  transactionId?: string;
  signedTransaction?: string;
  purchaseToken?: string;
};
type PurchaseContext = { contextId: string; storeAccountId: string; productId: string };

const NativePurchase = registerPlugin<{
  getProduct(options: { productId: string }): Promise<NativeStoreOffer>;
  purchase(options: { productId: string; accountToken: string; storeAccountId: string }): Promise<NativeStoreResult>;
  restore(options: { productId: string }): Promise<NativeStoreResult>;
  finish(options: { transactionId?: string; productId?: string; purchaseToken?: string }): Promise<void>;
}>('NativePurchase');

const platform = Capacitor.getPlatform();
export const nativePurchaseProvider: NativePurchaseProvider | undefined = Capacitor.isNativePlatform()
  ? platform === 'ios' ? 'apple' : platform === 'android' ? 'google' : undefined
  : undefined;

function productId(): string {
  return nativePurchaseProvider === 'apple' ? firehawkProduct.appleProductId : firehawkProduct.googleProductId;
}

async function purchaseContext(action: 'purchase' | 'restore'): Promise<PurchaseContext> {
  if (!nativePurchaseProvider) throw new Error('Native store is unavailable.');
  const response = await apiFetch(apiUrl('/api/firehawk/native/context'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: nativePurchaseProvider, action }),
  });
  const result = await response.json() as Partial<PurchaseContext> & { error?: string };
  if (!response.ok || !result.contextId || !result.storeAccountId || result.productId !== productId()) {
    throw new Error(result.error ?? 'Native store is unavailable.');
  }
  return result as PurchaseContext;
}

async function verify(result: NativeStoreResult, context: PurchaseContext): Promise<{ profile: unknown; transactionId: string }> {
  if (!nativePurchaseProvider || result.state !== 'purchased') throw new Error('Unable to verify purchase. Try again.');
  const response = await apiFetch(apiUrl('/api/firehawk/native/verify'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      provider: nativePurchaseProvider,
      contextId: context.contextId,
      signedTransaction: result.signedTransaction,
      purchaseToken: result.purchaseToken,
    }),
  }, 20_000);
  const payload = await response.json() as { profile?: unknown; transactionId?: string; error?: string };
  if (!response.ok || !payload.profile || !payload.transactionId) throw new Error(payload.error ?? 'Unable to verify purchase. Try again.');
  if (nativePurchaseProvider === 'apple' && result.transactionId) {
    await NativePurchase.finish({ transactionId: result.transactionId });
  }
  return { profile: payload.profile, transactionId: payload.transactionId };
}

export async function loadNativeFirehawkOffer(): Promise<NativeStoreOffer | undefined> {
  if (!nativePurchaseProvider) return undefined;
  const offer = await NativePurchase.getProduct({ productId: productId() });
  if (offer.productId !== productId() || !offer.localizedPrice?.trim()) throw new Error('Native store returned an invalid product.');
  return offer;
}

export async function purchaseNativeFirehawk(): Promise<{ state: 'cancelled' | 'pending' | 'completed'; profile?: unknown }> {
  if (!nativePurchaseProvider) throw new Error('Native store is unavailable.');
  const context = await purchaseContext('purchase');
  const result = await NativePurchase.purchase({ productId: context.productId, accountToken: context.contextId, storeAccountId: context.storeAccountId });
  if (result.state === 'cancelled') return { state: 'cancelled' };
  if (result.state === 'pending') return { state: 'pending' };
  const verified = await verify(result, context);
  return { state: 'completed', profile: verified.profile };
}

export async function restoreNativeFirehawk(): Promise<{ state: 'notFound' | 'completed'; profile?: unknown }> {
  if (!nativePurchaseProvider) throw new Error('Native store is unavailable.');
  const context = await purchaseContext('restore');
  const result = await NativePurchase.restore({ productId: context.productId });
  if (result.state === 'notFound') return { state: 'notFound' };
  const verified = await verify(result, context);
  return { state: 'completed', profile: verified.profile };
}

function skyTokenProductId(packId: SkyTokenPackId): string {
  const pack = skyTokenPacks[packId];
  return nativePurchaseProvider === 'apple' ? pack.appleProductId : pack.googleProductId;
}

export async function loadNativeSkyTokenOffers(): Promise<Partial<Record<SkyTokenPackId, NativeStoreOffer>>> {
  if (!nativePurchaseProvider) return {};
  const offers: Partial<Record<SkyTokenPackId, NativeStoreOffer>> = {};
  for (const packId of Object.keys(skyTokenPacks) as SkyTokenPackId[]) {
    const productId = skyTokenProductId(packId);
    try {
      const offer = await NativePurchase.getProduct({ productId });
      if (offer.productId === productId && offer.localizedPrice?.trim()) offers[packId] = offer;
    } catch { /* A missing storefront product stays unavailable. */ }
  }
  return offers;
}

async function verifySkyTokenPurchase(result: NativeStoreResult, contextId?: string): Promise<{ profile: unknown; reference: string; applied: boolean }> {
  if (!nativePurchaseProvider || result.state !== 'purchased') throw new Error('Unable to verify purchase. Please try again.');
  const response = await apiFetch(apiUrl('/api/sky-tokens/native/verify'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      contextId, productId: result.productId, signedTransaction: result.signedTransaction, purchaseToken: result.purchaseToken,
    }),
  }, 20_000);
  const payload = await response.json() as { profile?: unknown; reference?: string; applied?: boolean; error?: string };
  if (!response.ok || !payload.profile || !payload.reference) throw new Error(payload.error ?? 'Unable to verify purchase. Please try again.');
  try {
    if (nativePurchaseProvider === 'apple' && result.transactionId) await NativePurchase.finish({ transactionId: result.transactionId });
    if (nativePurchaseProvider === 'google' && result.purchaseToken) await NativePurchase.finish({ productId: result.productId, purchaseToken: result.purchaseToken });
  } catch { /* The verified wallet grant is durable; unfinished provider purchases can be recovered. */ }
  return { profile: payload.profile, reference: payload.reference, applied: payload.applied === true };
}

export async function purchaseNativeSkyTokenPack(packId: SkyTokenPackId): Promise<{ state: 'cancelled' | 'pending' | 'completed'; profile?: unknown; reference?: string; applied?: boolean }> {
  if (!nativePurchaseProvider) throw new Error('Native store is unavailable.');
  const response = await apiFetch(apiUrl('/api/sky-tokens/native/context'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId }),
  });
  const context = await response.json() as Partial<PurchaseContext> & { error?: string };
  if (!response.ok || !context.contextId || !context.storeAccountId || context.productId !== skyTokenProductId(packId))
    throw new Error(context.error ?? 'Native store is unavailable.');
  const result = await NativePurchase.purchase({ productId: context.productId, accountToken: context.contextId, storeAccountId: context.storeAccountId });
  if (result.state === 'cancelled' || result.state === 'pending') return { state: result.state };
  return { state: 'completed', ...await verifySkyTokenPurchase(result, context.contextId) };
}

export async function recoverNativeSkyTokenPurchases(): Promise<unknown | undefined> {
  if (!nativePurchaseProvider) return undefined;
  let profile: unknown;
  for (const packId of Object.keys(skyTokenPacks) as SkyTokenPackId[]) {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const result = await NativePurchase.restore({ productId: skyTokenProductId(packId) });
        const reference = result.transactionId ?? result.purchaseToken;
        if (result.state !== 'purchased' || !reference || seen.has(reference)) break;
        seen.add(reference);
        profile = (await verifySkyTokenPurchase(result)).profile;
      } catch { break; /* A failed recovery remains available on the next app launch. */ }
    }
  }
  return profile;
}
