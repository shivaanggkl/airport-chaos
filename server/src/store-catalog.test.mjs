import assert from 'node:assert/strict';
import test from 'node:test';
import { publicStoreCatalog } from '../../shared/store-catalog.mjs';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { cosmeticCatalog, cosmeticUnlockPrice } from '../../shared/cosmetics.mjs';

test('Store display prices follow the shared purchase catalog', () => {
  const offers = new Map(publicStoreCatalog().map(item => [item.id, item]));
  assert.equal(offers.get('fighter').usdDisplayPrice, firehawkProduct.displayPrice);
  assert.equal(offers.get('cargo').fromCredits, 13_500);
  assert.equal(offers.get('privateJet').fromCredits, 32_000);
  for (const cosmetic of cosmeticCatalog) {
    const offer = offers.get(cosmetic.id);
    assert.ok(offer);
    if (cosmetic.unlockType !== 'credits') continue;
    assert.equal(offer.credits, cosmeticUnlockPrice(cosmetic, true));
    assert.equal(offer.firstCredits, cosmeticUnlockPrice(cosmetic, false));
    assert.equal(offer.tokens, cosmeticUnlockPrice(cosmetic, true, 'SKY_TOKENS'));
    assert.equal(offer.firstTokens, cosmeticUnlockPrice(cosmetic, false, 'SKY_TOKENS'));
  }
});
