import { Capacitor, registerPlugin } from '@capacitor/core';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
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
  finish(options: { transactionId: string }): Promise<void>;
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
