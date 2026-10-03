import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { creditReceipt, reconcileCreditSnapshot } from '../../shared/credit-receipts.mjs';
import { PlayerProfileStore } from './player-profiles.js';

test('persisted balance increase produces an exact one-time toast receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-credit-receipt-'));
  try {
    const path = join(directory, 'profiles.sqlite');
    const store = new PlayerProfileStore(path);
    const pilotId = 'credit-receipt-test-pilot';
    const before = store.getOrCreate(pilotId, 'Pilot');
    const database = new DatabaseSync(path);
    database.prepare('UPDATE player_profiles SET credits=credits+? WHERE pilot_id=?').run(475, pilotId);
    const after = store.getOrCreate(pilotId, 'Pilot');
    assert.equal(after.credits - before.credits, 475);
    assert.equal(after.creditRevision, before.creditRevision + 1);
    const receipt = creditReceipt(before.credits, after.credits, 'receipt-1', 'Mission Complete')!;
    assert.deepEqual(receipt, { rewardId: 'receipt-1', delta: 475, newBalance: after.credits, source: 'Mission Complete' });
    const seen = new Set<string>();
    const first = reconcileCreditSnapshot(before.credits, before.creditRevision, after.credits, after.creditRevision, receipt, seen);
    assert.deepEqual(first, { accepted: true, toastDelta: 475, rewardId: 'receipt-1' });
    seen.add(first.rewardId!);
    assert.equal(reconcileCreditSnapshot(before.credits, before.creditRevision, after.credits, after.creditRevision, receipt, seen).toastDelta, 0);
    assert.equal(reconcileCreditSnapshot(after.credits, after.creditRevision, after.credits, after.creditRevision, receipt, seen).toastDelta, 0);

    database.prepare('UPDATE player_profiles SET credits=credits+? WHERE pilot_id=?').run(25, pilotId);
    const latest = store.getOrCreate(pilotId, 'Pilot');
    const newer = creditReceipt(after.credits, latest.credits, 'receipt-2', 'Flight Distance')!;
    assert.equal(reconcileCreditSnapshot(after.credits, after.creditRevision, latest.credits, latest.creditRevision, newer, seen).toastDelta, 25);
    assert.deepEqual(reconcileCreditSnapshot(latest.credits, latest.creditRevision, after.credits, after.creditRevision, receipt, seen), { accepted: false, toastDelta: 0 });
    assert.deepEqual(reconcileCreditSnapshot(latest.credits, latest.creditRevision, after.credits, latest.creditRevision, receipt, seen), { accepted: false, toastDelta: 0 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('rolled-back, zero, and capped rewards produce no credit toast', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-credit-rollback-'));
  try {
    const path = join(directory, 'profiles.sqlite');
    const store = new PlayerProfileStore(path);
    const pilotId = 'credit-rollback-test-pilot';
    const before = store.getOrCreate(pilotId, 'Pilot');
    const database = new DatabaseSync(path);
    database.exec('BEGIN IMMEDIATE');
    database.prepare('UPDATE player_profiles SET credits=credits+500 WHERE pilot_id=?').run(pilotId);
    database.exec('ROLLBACK');
    const afterRollback = store.getOrCreate(pilotId, 'Pilot');
    assert.equal(afterRollback.credits, before.credits);
    assert.equal(afterRollback.creditRevision, before.creditRevision);
    assert.equal(creditReceipt(before.credits, afterRollback.credits, 'rollback', 'Reward'), undefined);
    assert.equal(reconcileCreditSnapshot(before.credits, before.creditRevision, afterRollback.credits, afterRollback.creditRevision, undefined, new Set()).toastDelta, 0);

    database.prepare('UPDATE player_profiles SET credits=1000000 WHERE pilot_id=?').run(pilotId);
    const capped = store.getOrCreate(pilotId, 'Pilot');
    database.prepare('UPDATE player_profiles SET credits=MIN(1000000,credits+500) WHERE pilot_id=?').run(pilotId);
    const cappedAgain = store.getOrCreate(pilotId, 'Pilot');
    assert.equal(cappedAgain.creditRevision, capped.creditRevision);
    assert.equal(creditReceipt(capped.credits, cappedAgain.credits, 'capped', 'Reward'), undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('all credit feedback comes from the authoritative profile receipt, not gameplay reward estimates', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(server, /reconcilePaidFirehawk\(profileStore\.getOrCreate\(player\.pilotId, player\.displayName\)\)/);
  assert.match(server, /creditReceipt\(previousCredits, current\.credits, randomUUID\(\)/);
  assert.match(client, /credits = profile\.credits;/);
  assert.match(client, /creditsElement\.textContent = credits\.toLocaleString\(\)/);
  assert.match(client, /if \(creditUpdate\.toastDelta > 0 && creditUpdate\.rewardId\)/);
  assert.doesNotMatch(client, /silentDistanceCredits|pendingProfileCredits/);
});
