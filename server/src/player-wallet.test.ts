import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { PlayerProfileStore } from './player-profiles.js';
import { PlayerWallet } from './player-wallet.js';

function temporaryDatabase(prefix: string): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return { directory, path: join(directory, 'profiles.sqlite') };
}

test('wallet migration preserves Credits and initializes Sky Tokens to zero', () => {
  const temporary = temporaryDatabase('airport-chaos-wallet-migration-');
  try {
    const legacy = new DatabaseSync(temporary.path);
    legacy.exec(`CREATE TABLE player_profiles (
      pilot_id TEXT PRIMARY KEY, pilot_name TEXT NOT NULL, credits INTEGER NOT NULL DEFAULT 0,
      credit_revision INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0,
      selected_aircraft TEXT NOT NULL DEFAULT 'trainer', total_distance REAL NOT NULL DEFAULT 0,
      successful_landings INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0, discoveries TEXT NOT NULL DEFAULT '{}',
      challenge_completions INTEGER NOT NULL DEFAULT 0, event_completions INTEGER NOT NULL DEFAULT 0,
      legacy_imported INTEGER NOT NULL DEFAULT 0, owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]',
      objectives TEXT NOT NULL DEFAULT '{}', mastery TEXT NOT NULL DEFAULT '{}',
      economy_version INTEGER NOT NULL DEFAULT 3, aircraft_entitlements TEXT NOT NULL DEFAULT '[]',
      missions TEXT NOT NULL DEFAULT '{}', fighter_trial TEXT NOT NULL DEFAULT '{"status":"available"}'
    )`);
    legacy.prepare('INSERT INTO player_profiles (pilot_id,pilot_name,credits) VALUES (?,?,?)')
      .run('existing-pilot', 'Existing Pilot', 17_303);
    legacy.close();

    const profiles = new PlayerProfileStore(temporary.path);
    const existing = profiles.getOrCreate('existing-pilot', 'Existing Pilot');
    const created = profiles.getOrCreate('new-pilot', 'New Pilot');
    assert.equal(existing.credits, 17_303);
    assert.equal(existing.skyTokens, 0);
    assert.equal(created.skyTokens, 0);
    assert.deepEqual(profiles.walletBalances('existing-pilot'), { credits: 17_303, skyTokens: 0 });
    const reopened = new PlayerProfileStore(temporary.path);
    assert.deepEqual(reopened.walletBalances('existing-pilot'), { credits: 17_303, skyTokens: 0 });
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test('wallet mutations are integer-safe, non-negative, auditable, and idempotent', () => {
  const temporary = temporaryDatabase('airport-chaos-wallet-mutations-');
  try {
    const profiles = new PlayerProfileStore(temporary.path);
    profiles.getOrCreate('wallet-pilot', 'Wallet Pilot');
    const database = new DatabaseSync(temporary.path);
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const wallet = new PlayerWallet(database);

    const credited = wallet.credit({
      pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 500, reason: 'ADMIN_ADJUSTMENT',
      idempotencyKey: 'test-credit-1', referenceId: 'test-credit', createdAt: 1_000,
    });
    assert.equal(credited.ok, true);
    assert.equal(credited.balance, 500);
    const duplicate = wallet.credit({
      pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 500, reason: 'ADMIN_ADJUSTMENT',
      idempotencyKey: 'test-credit-1', referenceId: 'test-credit', createdAt: 1_001,
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.balance, 500);
    assert.equal(wallet.credit({
      pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 499, reason: 'ADMIN_ADJUSTMENT', idempotencyKey: 'test-credit-1',
    }).code, 'INVALID_MUTATION');
    assert.equal(wallet.debit({ pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 200, reason: 'ADMIN_ADJUSTMENT' }).balance, 300);

    const beforeFailedLedger = (database.prepare('SELECT COUNT(*) AS total FROM wallet_transactions').get() as { total: number }).total;
    assert.equal(wallet.debit({ pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 301, reason: 'ADMIN_ADJUSTMENT' }).code, 'INSUFFICIENT_FUNDS');
    assert.equal(wallet.credit({ pilotId: 'wallet-pilot', currency: 'CREDITS', amount: 1.5, reason: 'ADMIN_ADJUSTMENT' }).code, 'INVALID_MUTATION');
    assert.equal(wallet.credit({ pilotId: 'wallet-pilot', currency: 'CREDITS', amount: -1, reason: 'ADMIN_ADJUSTMENT' }).code, 'INVALID_MUTATION');
    assert.equal(wallet.credit({ pilotId: 'forged-pilot', currency: 'CREDITS', amount: 1, reason: 'ADMIN_ADJUSTMENT' }).code, 'PROFILE_NOT_FOUND');
    assert.deepEqual(wallet.balances('wallet-pilot'), { credits: 300, skyTokens: 0 });
    assert.throws(() => database.prepare('UPDATE player_profiles SET credits=-1 WHERE pilot_id=?').run('wallet-pilot'), /cannot be negative/);
    assert.throws(() => database.prepare('UPDATE player_profiles SET sky_tokens=-1 WHERE pilot_id=?').run('wallet-pilot'), /cannot be negative/);
    assert.equal((database.prepare('SELECT COUNT(*) AS total FROM wallet_transactions').get() as { total: number }).total, beforeFailedLedger);

    const transactions = database.prepare('SELECT currency,direction,amount,balance_after,reason,reference_id FROM wallet_transactions WHERE pilot_id=? ORDER BY created_at, rowid')
      .all('wallet-pilot').map((transaction) => ({ ...transaction }));
    assert.deepEqual(transactions, [
      { currency: 'CREDITS', direction: 'CREDIT', amount: 500, balance_after: 500, reason: 'ADMIN_ADJUSTMENT', reference_id: 'test-credit' },
      { currency: 'CREDITS', direction: 'DEBIT', amount: 200, balance_after: 300, reason: 'ADMIN_ADJUSTMENT', reference_id: null },
    ]);
    database.close();
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test('aircraft grant and Credit debit commit together or roll back together', () => {
  const temporary = temporaryDatabase('airport-chaos-wallet-atomic-');
  try {
    const profiles = new PlayerProfileStore(temporary.path);
    profiles.getOrCreate('atomic-pilot', 'Atomic Pilot');
    profiles.awardServerReward('atomic-pilot', 12_000, undefined, 'ADMIN_ADJUSTMENT');
    const database = new DatabaseSync(temporary.path);
    database.exec(`CREATE TRIGGER reject_aircraft_grant BEFORE UPDATE OF owned_aircraft ON player_profiles
      BEGIN SELECT RAISE(ABORT, 'simulated grant failure'); END`);
    assert.throws(() => profiles.purchaseAircraft('atomic-pilot', 'cargo'), /simulated grant failure/);
    const after = profiles.getOrCreate('atomic-pilot', 'Atomic Pilot');
    assert.equal(after.credits, 12_000);
    assert.equal(after.unlockedAircraft.includes('cargo'), false);
    assert.equal((database.prepare("SELECT COUNT(*) AS total FROM wallet_transactions WHERE pilot_id=? AND reason='AIRCRAFT_PURCHASE'").get('atomic-pilot') as { total: number }).total, 0);
    database.close();
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test('independent purchase requests cannot overspend the same Credit balance', async () => {
  const temporary = temporaryDatabase('airport-chaos-wallet-double-spend-');
  try {
    const first = new PlayerProfileStore(temporary.path);
    const second = new PlayerProfileStore(temporary.path);
    first.getOrCreate('spend-pilot', 'Spend Pilot');
    first.awardServerReward('spend-pilot', 30_000, undefined, 'ADMIN_ADJUSTMENT');
    const [cargo, privateJet] = await Promise.all([
      new Promise<ReturnType<PlayerProfileStore['purchaseAircraft']>>((resolve) => setImmediate(() => resolve(first.purchaseAircraft('spend-pilot', 'cargo')))),
      new Promise<ReturnType<PlayerProfileStore['purchaseAircraft']>>((resolve) => setImmediate(() => resolve(second.purchaseAircraft('spend-pilot', 'privateJet')))),
    ]);
    assert.equal(Number(cargo.ok) + Number(privateJet.ok), 1);
    const final = first.getOrCreate('spend-pilot', 'Spend Pilot');
    assert.ok(final.credits >= 0);
    const database = new DatabaseSync(temporary.path);
    assert.equal((database.prepare("SELECT COUNT(*) AS total FROM wallet_transactions WHERE pilot_id=? AND reason='AIRCRAFT_PURCHASE'").get('spend-pilot') as { total: number }).total, 1);
    database.close();
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});
