import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { PlayerWallet } from './player-wallet.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-cosmetic-commerce-'));
  const path = join(directory, 'profiles.sqlite');
  const store = new PlayerProfileStore(path);
  const database = new DatabaseSync(path);
  const wallet = new PlayerWallet(database);
  return { store, database, wallet, path, cleanup: () => { database.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('all six existing paid paints unlock for either full currency price exactly once', () => {
  const { store, database, wallet, cleanup } = fixture();
  try {
    for (const item of cosmeticCatalog.filter(paint => paint.unlockType === 'credits')) {
      for (const currency of ['CREDITS', 'SKY_TOKENS'] as const) {
        const pilotId = `${item.id}-${currency}`;
        store.getOrCreate(pilotId, 'Paint Pilot');
        store.awardServerReward(pilotId, 100_000);
        assert.equal(store.purchaseAircraft(pilotId, item.aircraftRestriction).ok, true);
        if (currency === 'SKY_TOKENS') assert.equal(wallet.credit({ pilotId, currency, amount: item.skyTokenPrice,
          reason: 'ADMIN_ADJUSTMENT' }).ok, true);
        const before = store.walletBalances(pilotId)!;
        assert.equal(store.equipCosmetic(pilotId, item.id).ok, false);
        const first = store.purchaseCosmetic(pilotId, item.id, currency);
        assert.equal(first.ok, true); assert.equal(first.purchased, true);
        assert.equal(first.profile?.cosmetics.ownedIds.includes(item.id), true);
        assert.equal(first.profile?.cosmetics.equipped[`livery:${item.aircraftRestriction}`], undefined);
        assert.equal(store.purchaseCosmetic(pilotId, item.id, currency).purchased, false);
        assert.equal(store.equipCosmetic(pilotId, item.id).ok, true);
        const price = currency === 'CREDITS' ? item.creditPrice : item.skyTokenPrice;
        assert.equal(store.walletBalances(pilotId)![currency === 'CREDITS' ? 'credits' : 'skyTokens'],
          before[currency === 'CREDITS' ? 'credits' : 'skyTokens'] - price);
        const ledger = database.prepare(`SELECT currency,direction,amount,reason,reference_id,context_json
          FROM wallet_transactions WHERE pilot_id=? AND reference_id=?`).all(pilotId, `cosmetic:${item.id}`) as Array<{
          currency: string; direction: string; amount: number; reason: string; reference_id: string; context_json: string;
        }>;
        assert.equal(ledger.length, 1);
        assert.deepEqual([ledger[0]!.currency, ledger[0]!.direction, ledger[0]!.amount, ledger[0]!.reason],
          [currency, 'DEBIT', price, currency === 'CREDITS' ? 'COSMETIC_PURCHASE' : 'SKY_TOKEN_SPEND']);
        assert.deepEqual(JSON.parse(ledger[0]!.context_json), { cosmeticId: item.id, aircraft: item.aircraftRestriction });
      }
    }
  } finally { cleanup(); }
});

test('invalid, unaffordable, and rolled-back paint purchases never grant ownership or debit', () => {
  const { store, database, wallet, cleanup } = fixture();
  try {
    const pilotId = 'paint-reject';
    store.getOrCreate(pilotId, 'Paint Pilot');
    assert.equal(store.purchaseCosmetic(pilotId, 'mammoth-sand', 'SKY_TOKENS').ok, false);
    store.awardServerReward(pilotId, 100_000);
    assert.equal(store.purchaseAircraft(pilotId, 'cargo').ok, true);
    assert.equal(store.purchaseCosmetic(pilotId, 'mammoth-sand', 'FORGED').ok, false);
    const creditsBefore = store.walletBalances(pilotId)!.credits;
    assert.equal(store.purchaseCosmetic(pilotId, 'mammoth-sand', 'SKY_TOKENS').ok, false);
    assert.equal(store.walletBalances(pilotId)!.credits, creditsBefore);
    database.exec(`CREATE TRIGGER reject_paint BEFORE INSERT ON pilot_cosmetics
      WHEN NEW.cosmetic_id='mammoth-sand' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
    assert.throws(() => store.purchaseCosmetic(pilotId, 'mammoth-sand', 'CREDITS'), /test rollback/);
    assert.equal(store.walletBalances(pilotId)!.credits, creditsBefore);
    assert.equal(store.getOrCreate(pilotId, 'Paint Pilot').cosmetics.ownedIds.includes('mammoth-sand'), false);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reference_id='cosmetic:mammoth-sand'").get() as { n: number }).n, 0);
    database.exec('DROP TRIGGER reject_paint');
    assert.equal(wallet.credit({ pilotId, currency: 'SKY_TOKENS', amount: 100, reason: 'ADMIN_ADJUSTMENT' }).ok, true);
    assert.equal(store.purchaseCosmetic(pilotId, 'mammoth-sand', 'SKY_TOKENS').ok, true);
  } finally { cleanup(); }
});

test('independent account sessions cannot pay twice for the same paint', () => {
  const { store, database, path, cleanup } = fixture();
  try {
    const pilotId = 'two-sessions';
    store.getOrCreate(pilotId, 'Paint Pilot');
    store.awardServerReward(pilotId, 100_000);
    store.purchaseAircraft(pilotId, 'cargo');
    const other = new PlayerProfileStore(path);
    const before = store.walletBalances(pilotId)!.credits;
    assert.equal(store.purchaseCosmetic(pilotId, 'mammoth-sand').purchased, true);
    assert.equal(other.purchaseCosmetic(pilotId, 'mammoth-sand').purchased, false);
    assert.equal(store.walletBalances(pilotId)!.credits, before - 1_500);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id=? AND idempotency_key='cosmetic:mammoth-sand'").get(pilotId) as { n: number }).n, 1);
  } finally { cleanup(); }
});

test('legacy base paints migrate once for existing accounts while new accounts start without them', () => {
  const { store, database, path, cleanup } = fixture();
  try {
    store.getOrCreate('old-pilot', 'Old Pilot');
    database.prepare("DELETE FROM pilot_cosmetics WHERE pilot_id='old-pilot' AND cosmetic_id IN ('mammoth-sand','nightowl-forest')").run();
    database.prepare("DELETE FROM profile_store_metadata WHERE key='priced_legacy_paints_v1'").run();
    const migrated = new PlayerProfileStore(path);
    const old = migrated.getOrCreate('old-pilot', 'Old Pilot');
    assert.equal(old.cosmetics.ownedIds.includes('mammoth-sand'), true);
    assert.equal(old.cosmetics.ownedIds.includes('nightowl-forest'), true);
    const fresh = migrated.getOrCreate('new-pilot', 'New Pilot');
    assert.equal(fresh.cosmetics.ownedIds.includes('mammoth-sand'), false);
    assert.equal(fresh.cosmetics.ownedIds.includes('nightowl-forest'), false);
    new PlayerProfileStore(path);
    assert.equal((database.prepare("SELECT COUNT(*) AS n FROM pilot_cosmetics WHERE pilot_id='old-pilot' AND cosmetic_id IN ('mammoth-sand','nightowl-forest')").get() as { n: number }).n, 2);
  } finally { cleanup(); }
});
