export type CheckoutIdentity = { pilotId: string; pilotName: string };

function endpoint(path: string): URL {
  return new URL(path, window.location.origin);
}

export async function beginFirehawkCheckout(identity: CheckoutIdentity): Promise<never> {
  const url = endpoint('/api/firehawk/checkout');
  url.searchParams.set('pilotId', identity.pilotId); url.searchParams.set('pilotName', identity.pilotName);
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const result = await response.json() as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error ?? 'Checkout unavailable');
  const checkout = new URL(result.url);
  if (checkout.protocol !== 'https:' || !checkout.hostname.endsWith('stripe.com')) throw new Error('Invalid checkout destination');
  window.location.assign(checkout.href);
  return new Promise<never>(() => undefined);
}

export async function verifyCheckoutReturn(identity: CheckoutIdentity): Promise<{ state: 'none' | 'cancelled' | 'completed' | 'pending'; reference?: string; recoveryCode?: string }> {
  const page = new URL(window.location.href); const checkout = page.searchParams.get('checkout');
  if (checkout === 'cancel') return { state: 'cancelled' };
  const sessionId = page.searchParams.get('session_id');
  if (checkout !== 'success' || !sessionId || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) return { state: 'none' };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const url = endpoint('/api/firehawk/purchase-status');
    url.searchParams.set('pilotId', identity.pilotId); url.searchParams.set('pilotName', identity.pilotName); url.searchParams.set('sessionId', sessionId);
    const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (response.ok) {
      const result = await response.json() as { status?: string; reference?: string; recoveryCode?: string };
      if (result.status === 'completed') return { state: 'completed', reference: result.reference, recoveryCode: result.recoveryCode };
    }
    if (attempt < 7) await new Promise(resolve => window.setTimeout(resolve, 1_500));
  }
  return { state: 'pending' };
}

export async function restoreFirehawkPurchase(recoveryCode: string): Promise<{ profile?: unknown; recoveryCode?: string; reference?: string }> {
  const response = await fetch(endpoint('/api/firehawk/restore'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recoveryCode }),
  });
  const result = await response.json() as { profile?: unknown; recoveryCode?: string; reference?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Purchase restore failed');
  return result;
}
