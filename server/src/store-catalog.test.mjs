import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { publicStoreCatalog } from '../../shared/store-catalog.mjs';
import { cosmeticCatalog, cosmeticUnlockPrice } from '../../shared/cosmetics.mjs';

test('Store and Hangar use fixed authoritative aircraft and paint prices', () => {
  const offers = new Map(publicStoreCatalog().map(item => [item.id, item]));
  assert.deepEqual([offers.get('trainer').free, offers.get('trainer').credits], [true, undefined]);
  assert.deepEqual([offers.get('cargo').credits, offers.get('cargo').tokens], [13_000, 600]);
  assert.deepEqual([offers.get('privateJet').credits, offers.get('privateJet').tokens], [33_000, 1_350]);
  assert.deepEqual([offers.get('fighter').credits, offers.get('fighter').tokens], [undefined, 2_400]);
  for (const item of cosmeticCatalog.filter(item => !item.retired)) {
    const offer = offers.get(item.id);
    assert.ok(offer);
    assert.equal(offer.credits, cosmeticUnlockPrice(item));
    assert.equal(offer.tokens, cosmeticUnlockPrice(item, 'SKY_TOKENS'));
    assert.equal(offer.firstCredits, undefined);
    assert.equal(offer.firstTokens, undefined);
  }
  for (const item of cosmeticCatalog.filter(item => item.retired)) assert.equal(offers.has(item.id), false);
  const store = readFileSync(new URL('../../client/src/game-store.ts', import.meta.url), 'utf8');
  const garage = readFileSync(new URL('../../client/src/garage.ts', import.meta.url), 'utf8');
  assert.match(store, /offer\.credits/);
  assert.match(store, /offer\.tokens/);
  assert.match(garage, /cosmeticUnlockPrice\(lockedAppearance/);
  assert.match(garage, /cosmeticCatalog\.filter\(entry => entry\.aircraftRestriction === this\.selected &&[\s\S]*!entry\.retired/);
});
