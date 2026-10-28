import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { cosmeticCatalog, cosmeticUnlockPrice } from '../../shared/cosmetics.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { PlayerWallet } from './player-wallet.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-combo-commerce-'));
  const path = join(directory, 'profiles.sqlite');
  const store = new PlayerProfileStore(path);
  const database = new DatabaseSync(path);
  const wallet = new PlayerWallet(database);
  return { store, database, wallet, path, cleanup: () => { database.close(); rmSync(directory, { recursive: true, force: true }); } };
}

const prices: Record<string, [number | undefined, number]> = {
  'bluejay-classic': [750, 75], 'bluejay-aurora': [1_500, 125],
  'mammoth-sand': [13_000, 600], 'mammoth-desert-sand': [14_000, 650], 'mammoth-arctic-rescue': [15_000, 750],
  'nightowl-sky-blue': [33_000, 1_350], 'nightowl-sunset-red': [33_000, 1_350],
  'nightowl-forest-green': [33_000, 1_350], 'nightowl-premium-gold': [33_000, 1_350],
  'firehawk-inferno': [undefined, 2_400],
};

test('every aircraft and appearance combination has one fixed catalog price', () => {
  assert.equal(cosmeticCatalog.filter(item => !item.retired).length, 11);
  for (const item of cosmeticCatalog) {
    if (item.retired) {
      assert.equal(cosmeticUnlockPrice(item), undefined);
      assert.equal(cosmeticUnlockPrice(item, 'SKY_TOKENS'), undefined);
      continue;
    }
    if (item.id === 'bluejay-skybolt') {
      assert.equal(item.unlockType, 'included');
      assert.deepEqual([item.creditPrice, item.skyTokenPrice], [0, 0]);
    } else assert.deepEqual([cosmeticUnlockPrice(item), cosmeticUnlockPrice(item, 'SKY_TOKENS')], prices[item.id]);
  }
});

test('aircraft-only purchases are unavailable; each selected appearance atomically unlocks its aircraft', () => {
  const { store, database, wallet, path, cleanup } = fixture();
  try {
    for (const [type, id] of [['cargo', 'mammoth-sand'], ['privateJet', 'nightowl-sky-blue']] as const) {
      assert.match(store.purchaseAircraft('pilot', type).reason ?? '', /CHOOSE AN APPEARANCE/);
      assert.match(store.purchaseAircraftWithSkyTokens('pilot', type).reason ?? '', /CHOOSE AN APPEARANCE/);
      for (const currency of ['CREDITS', 'SKY_TOKENS'] as const) {
        const pilotId = `${type}-${currency}`;
        const price = prices[id]![currency === 'CREDITS' ? 0 : 1]!;
        store.getOrCreate(pilotId, 'Pilot');
        if (currency === 'CREDITS') store.awardServerReward(pilotId, price);
        else wallet.credit({ pilotId, currency, amount: price, reason: 'ADMIN_ADJUSTMENT' });
        const bought = store.purchaseCosmetic(pilotId, id, currency);
        assert.equal(bought.ok, true);
        assert.ok(bought.profile?.unlockedAircraft.includes(type));
        assert.ok(bought.profile?.cosmetics.ownedIds.includes(id));
        assert.equal(bought.profile?.cosmetics.equipped[`livery:${type}`], id);
        assert.equal(new PlayerProfileStore(path).purchaseCosmetic(pilotId, id, currency).ok, false);
        assert.equal(store.walletBalances(pilotId)?.[currency === 'CREDITS' ? 'credits' : 'skyTokens'], 0);
        assert.equal((database.prepare('SELECT COUNT(*) n FROM wallet_transactions WHERE pilot_id=? AND reference_id=?').get(pilotId, `cosmetic:${id}`) as { n: number }).n, 1);
      }
    }
  } finally { cleanup(); }
});

test('buying another appearance keeps its full listed price, even after reload', () => {
  const { store, database, path, cleanup } = fixture();
  try {
    for (const [pilotId, type, first, second, fullPrice] of [
      ['mammoth', 'cargo', 'mammoth-arctic-rescue', 'mammoth-sand', 13_000],
      ['nightowl', 'privateJet', 'nightowl-premium-gold', 'nightowl-sunset-red', 33_000],
    ] as const) {
      store.getOrCreate(pilotId, 'Pilot');
      store.awardServerReward(pilotId, 100_000);
      assert.equal(store.purchaseCosmetic(pilotId, first).ok, true);
      const before = store.walletBalances(pilotId)!.credits;
      const reopened = new PlayerProfileStore(path);
      assert.equal(reopened.purchaseCosmetic(pilotId, second).ok, true);
      assert.equal(reopened.walletBalances(pilotId)!.credits, before - fullPrice);
      assert.equal(reopened.getOrCreate(pilotId, 'Pilot').cosmetics.equipped[`livery:${type}`], second);
      assert.equal((database.prepare('SELECT amount FROM wallet_transactions WHERE pilot_id=? AND reference_id=?').get(pilotId, `cosmetic:${second}`) as { amount: number }).amount, fullPrice);
    }
  } finally { cleanup(); }
});

test('Bluejay optional paints are separate; Firehawk plus Inferno is one Token unlock', () => {
  const { store, wallet, cleanup } = fixture();
  try {
    assert.deepEqual(store.getOrCreate('bluejay', 'Pilot').cosmetics.ownedIds, ['bluejay-skybolt']);
    assert.equal(store.purchaseCosmetic('bluejay', 'bluejay-classic').ok, false);
    store.awardServerReward('bluejay', 750);
    assert.equal(store.purchaseCosmetic('bluejay', 'bluejay-classic').ok, true);
    assert.equal(store.getOrCreate('bluejay', 'Pilot').cosmetics.ownedIds.includes('bluejay-aurora'), false);
    store.getOrCreate('firehawk', 'Pilot');
    wallet.credit({ pilotId: 'firehawk', currency: 'SKY_TOKENS', amount: 2_400, reason: 'ADMIN_ADJUSTMENT' });
    assert.equal(store.purchaseCosmetic('firehawk', 'firehawk-inferno', 'CREDITS').ok, false);
    const result = store.purchaseAircraftWithSkyTokens('firehawk', 'fighter');
    assert.equal(result.ok, true);
    assert.equal(result.profile?.skyTokens, 0);
    assert.ok(result.profile?.unlockedAircraft.includes('fighter'));
    assert.ok(result.profile?.cosmetics.ownedIds.includes('firehawk-inferno'));
    assert.equal(store.purchaseCosmetic('firehawk', 'firehawk-inferno', 'SKY_TOKENS').ok, false);
    store.getOrCreate('firehawk-paint', 'Pilot');
    wallet.credit({ pilotId: 'firehawk-paint', currency: 'SKY_TOKENS', amount: 2_400, reason: 'ADMIN_ADJUSTMENT' });
    const paintRoute = store.purchaseCosmetic('firehawk-paint', 'firehawk-inferno', 'SKY_TOKENS');
    assert.equal(paintRoute.ok, true);
    assert.ok(paintRoute.profile?.unlockedAircraft.includes('fighter'));
    assert.equal(paintRoute.profile?.cosmetics.equipped['livery:fighter'], 'firehawk-inferno');
    assert.equal(paintRoute.profile?.skyTokens, 0);
  } finally { cleanup(); }
});

test('invalid currency, insufficient balance, and failed entitlement write never debit', () => {
  const { store, database, wallet, cleanup } = fixture();
  try {
    store.getOrCreate('pilot', 'Pilot');
    assert.equal(store.purchaseCosmetic('pilot', 'mammoth-sand', 'FORGED').ok, false);
    assert.equal(store.purchaseCosmetic('pilot', 'not-a-paint').ok, false);
    assert.equal(store.purchaseCosmetic('pilot', 'mammoth-sand').ok, false);
    assert.equal(store.getOrCreate('pilot', 'Pilot').unlockedAircraft.includes('cargo'), false);
    store.awardServerReward('pilot', 13_000);
    database.exec(`CREATE TRIGGER reject_combo BEFORE INSERT ON pilot_cosmetics
      WHEN NEW.cosmetic_id='mammoth-sand' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
    assert.throws(() => store.purchaseCosmetic('pilot', 'mammoth-sand'), /test rollback/);
    assert.equal(store.walletBalances('pilot')!.credits, 13_000);
    assert.equal(store.getOrCreate('pilot', 'Pilot').unlockedAircraft.includes('cargo'), false);
    assert.equal((database.prepare("SELECT COUNT(*) n FROM wallet_transactions WHERE reference_id='cosmetic:mammoth-sand'").get() as { n: number }).n, 0);
    database.exec('DROP TRIGGER reject_combo');
    wallet.credit({ pilotId: 'pilot', currency: 'SKY_TOKENS', amount: 600, reason: 'ADMIN_ADJUSTMENT' });
    assert.equal(store.purchaseCosmetic('pilot', 'mammoth-sand', 'SKY_TOKENS').ok, true);
    assert.equal(store.walletBalances('pilot')!.credits, 13_000);
  } finally { cleanup(); }
});

test('migration keeps historical ownership and grants a usable paint only to preexisting aircraft owners', () => {
  const { store, database, path, cleanup } = fixture();
  try {
    store.getOrCreate('legacy', 'Pilot');
    store.awardServerReward('legacy', 7_000);
    database.prepare("UPDATE player_profiles SET owned_aircraft='[\"trainer\",\"cargo\",\"privateJet\"]' WHERE pilot_id='legacy'").run();
    database.prepare("DELETE FROM profile_store_metadata WHERE key='aircraft_appearance_bundle_v1'").run();
    const before = store.walletBalances('legacy');
    const migrated = new PlayerProfileStore(path).getOrCreate('legacy', 'Pilot');
    assert.ok(migrated.unlockedAircraft.includes('cargo'));
    assert.ok(migrated.unlockedAircraft.includes('privateJet'));
    assert.ok(migrated.cosmetics.ownedIds.includes('mammoth-sand'));
    assert.ok(migrated.cosmetics.ownedIds.includes('nightowl-forest'));
    assert.equal(migrated.cosmetics.equipped['livery:privateJet'], 'nightowl-forest');
    assert.equal(store.equipCosmetic('legacy', 'nightowl-forest').ok, true);
    assert.deepEqual(store.walletBalances('legacy'), before);
    new PlayerProfileStore(path);
    assert.equal((database.prepare("SELECT COUNT(*) n FROM pilot_cosmetics WHERE pilot_id='legacy' AND cosmetic_id IN ('mammoth-sand','nightowl-forest')").get() as { n: number }).n, 2);
    assert.equal(store.getOrCreate('new', 'Pilot').cosmetics.ownedIds.includes('mammoth-sand'), false);
    assert.equal(store.purchaseCosmetic('new', 'nightowl-forest').reason, 'COSMETIC NOT PURCHASABLE');
  } finally { cleanup(); }
});
