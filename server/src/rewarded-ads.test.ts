import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { REWARDED_AD_CREDITS, REWARDED_AD_MAX_REWARDS, REWARDED_AD_WINDOW_MS } from '../../shared/rewarded-ads.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { AdMobSsvVerifier, RewardedAdStore, type RewardedAdConfiguration, type VerifiedAdMobReward } from './rewarded-ads.js';

const adUnitId = 'ca-app-pub-3940256099942544/5224354917';
const configuration: RewardedAdConfiguration = {
  enabled: true,
  ios: { enabled: true, adUnitId: 'ca-app-pub-3940256099942544/1712485313' },
  android: { enabled: true, adUnitId },
  webEnabled: false,
  providerRewardAmount: '1',
};

function databaseFixture(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const path = join(directory, 'profiles.sqlite');
  const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot');
  return { directory, path, profiles, store: new RewardedAdStore(path, configuration) };
}

function verified(attemptId: string, transactionId: string, timestamp: number): VerifiedAdMobReward {
  return { adUnit: adUnitId, customData: attemptId, rewardAmount: '1', rewardItem: 'reward', timestamp, transactionId };
}

test('verified rewards grant exactly 250 Credits, enforce one active attempt, and replay idempotently', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-ad-');
  try {
    const now = Date.UTC(2026, 0, 1);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now).remaining, REWARDED_AD_MAX_REWARDS);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const secondDevice = new RewardedAdStore(fixture.path, configuration);
    assert.equal(secondDevice.createAttempt('rewarded-pilot', 'android', now)?.ok, false);

    const granted = fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'provider-transaction-1', now + 1), now + 1);
    assert.deepEqual({ ok: granted.ok, duplicate: granted.duplicate, rewarded: granted.rewarded }, { ok: true, duplicate: false, rewarded: true });
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, REWARDED_AD_CREDITS);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now + 1).remaining, 2);

    const replay = secondDevice.grantVerifiedReward(verified(created.attempt.attemptId, 'provider-transaction-1', now + 1), now + 2);
    assert.deepEqual({ ok: replay.ok, duplicate: replay.duplicate, rewarded: replay.rewarded }, { ok: true, duplicate: true, rewarded: true });
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, REWARDED_AD_CREDITS);

    const database = new DatabaseSync(fixture.path);
    const ledger = database.prepare("SELECT currency,direction,amount,reason,reference_id FROM wallet_transactions WHERE pilot_id=? AND reason='REWARDED_AD'")
      .all('rewarded-pilot').map(row => ({ ...row }));
    assert.deepEqual(ledger, [{ currency: 'CREDITS', direction: 'CREDIT', amount: 250, reason: 'REWARDED_AD', reference_id: created.attempt.attemptId }]);
    database.close();
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('only successful verified rewards consume the global three-per-24-hour allowance', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-window-');
  try {
    const start = Date.UTC(2026, 1, 1);
    const earlyClose = fixture.store.createAttempt('rewarded-pilot', 'android', start);
    assert.equal(earlyClose.ok, true);
    if (!earlyClose.ok) return;
    fixture.store.recordClientEvent('rewarded-pilot', earlyClose.attempt.attemptId, 'closed', start + 1);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + 1).remaining, 3);

    for (let index = 0; index < 3; index += 1) {
      const now = start + 10 + index * 10;
      const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
      assert.equal(created.ok, true);
      if (!created.ok) return;
      assert.equal(fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, `provider-window-${index}`, now + 1), now + 1).rewarded, true);
    }
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + 100).remaining, 0);
    assert.equal(fixture.store.createAttempt('rewarded-pilot', 'android', start + 100).ok, false);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 750);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + 11 + REWARDED_AD_WINDOW_MS).remaining, 3);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('invalid, expired, mismatched, and cross-account reward events grant zero Credits', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-reject-');
  try {
    fixture.profiles.getOrCreate('other-pilot', 'Other Pilot');
    const now = Date.UTC(2026, 2, 1);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(fixture.store.attemptStatus('other-pilot', created.attempt.attemptId, now), undefined);
    assert.equal(fixture.store.recordClientEvent('other-pilot', created.attempt.attemptId, 'qualified', now), undefined);
    assert.equal(fixture.store.grantVerifiedReward({ ...verified(created.attempt.attemptId, 'wrong-unit', now + 1), adUnit: 'unexpected' }, now + 1).rewarded, false);
    assert.equal(fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'expired-event', created.attempt.expiresAt + 1), created.attempt.expiresAt + 1).rewarded, false);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 0);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', created.attempt.expiresAt + 1).remaining, 3);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('wallet, ledger, attempt, and allowance roll back together when reward completion cannot commit', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-rollback-');
  try {
    const now = Date.UTC(2026, 3, 1);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const database = new DatabaseSync(fixture.path);
    database.exec("CREATE TRIGGER reject_reward_completion BEFORE UPDATE OF status ON rewarded_ad_attempts WHEN NEW.status='REWARDED' BEGIN SELECT RAISE(ABORT, 'forced reward failure'); END;");
    assert.throws(() => fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'rollback-event', now + 1), now + 1), /forced reward failure/);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 0);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason='REWARDED_AD'").get() as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM rewarded_ad_provider_transactions').get() as { count: number }).count, 0);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now + 2).remaining, 3);
    database.close();
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('AdMob SSV verification preserves signed parameter order and rejects tampering', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = 42;
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ keys: [{ keyId, pem }] }), { status: 200 });
  const verifier = new AdMobSsvVerifier(fetcher);
  const timestamp = Date.UTC(2026, 4, 1);
  const content = `ad_unit=${encodeURIComponent(adUnitId)}&custom_data=opaque-attempt&reward_amount=1&reward_item=reward&timestamp=${timestamp}&transaction_id=provider-signed-1`;
  const signature = sign('sha256', Buffer.from(content), privateKey).toString('base64url');
  const url = `/api/rewarded-ads/admob/ssv?${content}&signature=${signature}&key_id=${keyId}`;
  assert.equal((await verifier.verify(url, timestamp)).transactionId, 'provider-signed-1');
  await assert.rejects(verifier.verify(url.replace('reward_amount=1', 'reward_amount=2'), timestamp), /signature/);
});

test('shared client hides unsupported web ads and native callbacks cannot mutate Credits directly', () => {
  const provider = readFileSync(new URL('../../client/src/rewarded-ads.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../../native-auth/ios/Sources/NativeAuthPlugin/NativeRewardedAdPlugin.swift', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../../native-auth/android/src/main/java/com/vadensoftware/airportchaos/nativeauth/NativeRewardedAdPlugin.java', import.meta.url), 'utf8');
  assert.match(provider, /Capacitor\.isNativePlatform\(\)/);
  assert.match(bootstrap, /hubRewardedAdStatus\?\.supported && rewardedAdProvider/);
  assert.match(bootstrap, /VERIFYING|verifying/);
  assert.match(menu, /WATCH & EARN[\s\S]*WATCH VIDEO/);
  assert.doesNotMatch(`${ios}\n${android}`, /credits|wallet|REWARDED_AD/i);
});
