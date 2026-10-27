import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { PlayerProfileStore } from './player-profiles.js';
import { PlayerWallet } from './player-wallet.js';
import { SkyDuelStore, duelElo } from './sky-duel-store.js';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'airport-chaos-duel-'));
  const path = join(dir, 'profiles.sqlite');
  const profiles = new PlayerProfileStore(path);
  for (const id of ['a', 'b', 'c']) profiles.getOrCreate(id, id);
  const db = new DatabaseSync(path);
  db.prepare('UPDATE player_profiles SET credits = 5000 WHERE pilot_id = ?').run('a');
  db.prepare('UPDATE player_profiles SET credits = 20000 WHERE pilot_id = ?').run('b');
  db.prepare('UPDATE player_profiles SET credits = 500 WHERE pilot_id = ?').run('c');
  db.close();
  const store = new SkyDuelStore(path);
  return { store, path, close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('Sky Duel reserves both stakes atomically, pays once, and updates both ratings', () => {
  const f = fixture();
  try {
    const reserved = f.store.reserve('a', 'b', 1);
    assert.equal(reserved.ok, true);
    if (!reserved.ok) return;
    assert.equal(f.store.balance('a'), 4500);
    assert.equal(f.store.balance('b'), 19500);
    assert.equal(f.store.reserve('a', 'c').ok, false);
    f.store.start(reserved.match.id, 2);
    const paid = f.store.settle(reserved.match.id, 'WIN_A', 3, 0, 3)!;
    assert.equal(paid.balanceA, 5500);
    assert.equal(paid.balanceB, 19500);
    assert.deepEqual([paid.ratingA, paid.ratingB], [{ rating: 1020, completed: 1 }, { rating: 980, completed: 1 }]);
    assert.deepEqual(f.store.settle(reserved.match.id, 'WIN_B', 0, 3, 4), paid);
    assert.equal(f.store.balance('a')! + f.store.balance('b')!, 25_000,
      'both balances and escrow conserve the original total');
    assert.equal(f.store.refundInterrupted().length, 0);
  } finally { f.close(); }
});

test('draw refunds; interrupted match refunds after reopen; failures never debit either player', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.store.reserve('a', 'missing'), { ok: false, reason: 'PROFILE_NOT_FOUND' });
    assert.equal(f.store.balance('a'), 5000);
    const first = f.store.reserve('a', 'b');
    assert.equal(first.ok, true);
    if (!first.ok) return;
    f.store.start(first.match.id);
    const draw = f.store.settle(first.match.id, 'DRAW', 2, 2)!;
    assert.equal(draw.balanceA, 5000);
    assert.equal(draw.balanceB, 20000);
    assert.equal(draw.ratingA.completed, 1);
    const second = f.store.reserve('a', 'b');
    assert.equal(second.ok, true);
    if (!second.ok) return;
    f.store.close();
    const reopened = new SkyDuelStore(f.path);
    assert.equal(reopened.refundInterrupted().length, 1);
    assert.equal(reopened.balance('a'), 5000);
    assert.equal(reopened.balance('b'), 20000);
    assert.equal(reopened.refundInterrupted().length, 0);
    reopened.close();
  } finally { rmSync(join(f.path, '..'), { recursive: true, force: true }); }
});

test('wallet cap rejects stake before either debit and Elo applies provisional and floor rules', () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.path);
    db.prepare('UPDATE player_profiles SET credits = 999501 WHERE pilot_id = ?').run('a');
    db.close();
    assert.deepEqual(f.store.reserve('a', 'b'), { ok: false, reason: 'WALLET_CAP' });
    assert.equal(f.store.balance('a'), 999501);
    assert.equal(f.store.balance('b'), 20000);
    assert.deepEqual(duelElo({ rating: 1000, completed: 10 }, { rating: 1000, completed: 10 }, 'WIN_A'),
      [{ rating: 1012, completed: 11 }, { rating: 988, completed: 11 }]);
  } finally { f.close(); }
});

test('a concurrent wallet action cannot spend held entry Credits', () => {
  const f = fixture();
  try {
    const reserved = f.store.reserve('a', 'b');
    assert.equal(reserved.ok, true);
    const db = new DatabaseSync(f.path);
    const wallet = new PlayerWallet(db);
    const attempted = wallet.debit({ pilotId: 'a', currency: 'CREDITS', amount: 4_501,
      reason: 'AIRCRAFT_PURCHASE', referenceId: 'separate-purchase', idempotencyKey: 'separate-purchase' });
    assert.equal(attempted.ok, false);
    assert.equal(f.store.balance('a'), 4_500);
    db.close();
  } finally { f.close(); }
});

test('AI contributes its own reserved stake; a human win pays 1,000 once and cancellation refunds both', () => {
  const f = fixture();
  const aiId = 'sky-duel-ai:a';
  try {
    const profiles = new PlayerProfileStore(f.path);
    profiles.getOrCreate(aiId, 'AI PLAYER');
    const first = f.store.reserveAi('a', aiId, 1);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(f.store.balance('a'), 4500);
    assert.equal(f.store.balance(aiId), 0);
    f.store.start(first.match.id, 2);
    const win = f.store.settle(first.match.id, 'WIN_A', 3, 0, 3, { a: false, b: false })!;
    assert.equal(win.balanceA, 5500);
    assert.equal(f.store.settle(first.match.id, 'WIN_A', 3, 0, 4)?.balanceA, 5500);

    const second = f.store.reserveAi('a', aiId, 5);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(f.store.balance('a'), 5000);
    assert.equal(f.store.balance(aiId), 0);
    f.store.settle(second.match.id, 'CANCELLED', 0, 0, 6);
    assert.equal(f.store.balance('a'), 5500);
    assert.equal(f.store.balance(aiId), 500);
  } finally { f.close(); }
});
