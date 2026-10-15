import { aircraftDisplayOrder, firehawkProduct } from './aircraft-economy.mjs';
import { aircraftSkyTokenPrice } from './sky-token-economy.mjs';
import { cosmeticCatalog, cosmeticUnlockPrice } from './cosmetics.mjs';

// Public display prices only. Purchase handlers independently validate the
// product, entitlement, balance, and current server-side price.
export function publicStoreCatalog() {
  const paints = cosmeticCatalog.map(item => {
    const priced = item.unlockType === 'credits';
    return {
      id: item.id,
      kind: 'paint',
      free: item.unlockType === 'free',
      included: item.unlockType === 'included',
      ...(priced ? {
        credits: item.creditPrice,
        firstCredits: cosmeticUnlockPrice(item, false),
        tokens: item.skyTokenPrice,
        firstTokens: cosmeticUnlockPrice(item, false, 'SKY_TOKENS'),
      } : {}),
    };
  });
  const firstPaintPrice = (type, key) => {
    const prices = paints
    .filter(item => cosmeticCatalog.find(paint => paint.id === item.id)?.aircraftRestriction === type && Number.isFinite(item[key]))
    .map(item => item[key]);
    return prices.length ? Math.min(...prices) : undefined;
  };
  const aircraft = aircraftDisplayOrder.map(type => ({
    id: type,
    kind: 'aircraft',
    ...(type === 'trainer' ? { free: true } : {}),
    ...(type === 'cargo' || type === 'privateJet' ? { fromCredits: firstPaintPrice(type, 'firstCredits') } : {}),
    ...(type === 'fighter' ? { usdDisplayPrice: firehawkProduct.displayPrice, tokens: aircraftSkyTokenPrice(type) } : {}),
  }));
  return [...aircraft, ...paints];
}
