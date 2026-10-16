import { aircraftCreditPrice, aircraftDisplayOrder } from './aircraft-economy.mjs';
import { aircraftSkyTokenPrice } from './sky-token-economy.mjs';
import { cosmeticCatalog, cosmeticUnlockPrice } from './cosmetics.mjs';

// Public display prices only. Purchase handlers independently validate the
// product, entitlement, balance, and current server-side price.
export function publicStoreCatalog() {
  const paints = cosmeticCatalog.map(item => {
    const priced = item.unlockType === 'credits' || item.unlockType === 'tokens';
    return {
      id: item.id,
      kind: 'paint',
      free: item.unlockType === 'free',
      included: item.unlockType === 'included',
      ...(priced ? {
        ...(item.unlockType === 'credits' ? { credits: cosmeticUnlockPrice(item) } : {}),
        tokens: cosmeticUnlockPrice(item, 'SKY_TOKENS'),
      } : {}),
    };
  });
  const aircraft = aircraftDisplayOrder.map(type => ({
    id: type,
    kind: 'aircraft',
    ...(type === 'trainer' ? { free: true } : {}),
    ...(aircraftCreditPrice(type) !== undefined ? { credits: aircraftCreditPrice(type) } : {}),
    ...(aircraftSkyTokenPrice(type) !== undefined ? { tokens: aircraftSkyTokenPrice(type) } : {}),
  }));
  return [...aircraft, ...paints];
}
