import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { REWARDED_AD_MAX_REWARDS, REWARDED_AD_WINDOW_MS, rewardedAdCredits } from '../../shared/rewarded-ads.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { AdMobSsvVerifier, RewardedAdStore, rewardedAdConfiguration, type RewardedAdConfiguration, type VerifiedAdMobReward } from './rewarded-ads.js';

const adUnitId = 'ca-app-pub-3940256099942544/5224354917';
const configuration: RewardedAdConfiguration = {
  enabled: true,
  ios: { enabled: true, adUnitId: 'ca-app-pub-3940256099942544/1712485313' },
  android: { enabled: true, adUnitId },
  webEnabled: false,
  providerRewardAmount: '1',
};

test('production rewarded videos default off on every platform', () => {
  const settings = rewardedAdConfiguration({ NODE_ENV: 'production' });
  assert.equal(settings.enabled, false);
  assert.equal(settings.ios.enabled, false);
  assert.equal(settings.android.enabled, false);
  assert.equal(settings.webEnabled, false);
});

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

test('free claim unlocks ads; verified first ad grants 50 Credits once', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-ad-');
  try {
    const now = Date.UTC(2026, 0, 1);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now).remaining, 0);
    assert.deepEqual(fixture.store.createAttempt('rewarded-pilot', 'android', now), {
      ok: false, code: 'CLAIM_REQUIRED', status: fixture.store.status('rewarded-pilot', 'android', now),
    });
    assert.equal(fixture.profiles.claimDailyReward('rewarded-pilot', now)?.credits, 25);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now).remaining, REWARDED_AD_MAX_REWARDS);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const secondDevice = new RewardedAdStore(fixture.path, configuration);
    assert.equal(secondDevice.createAttempt('rewarded-pilot', 'android', now)?.ok, false);

    const granted = fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'provider-transaction-1', now + 1), now + 1);
    assert.deepEqual({ ok: granted.ok, duplicate: granted.duplicate, rewarded: granted.rewarded }, { ok: true, duplicate: false, rewarded: true });
    assert.equal(granted.rewardCredits, 50);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 75);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now + 1).remaining, 3);
    assert.equal(secondDevice.status('rewarded-pilot', 'android', now + 1).remaining, 3);
    assert.equal(fixture.store.attemptStatus('rewarded-pilot', created.attempt.attemptId, now + 1)?.rewardCredits, 50);

    const replay = secondDevice.grantVerifiedReward(verified(created.attempt.attemptId, 'provider-transaction-1', now + 1), now + 2);
    assert.deepEqual({ ok: replay.ok, duplicate: replay.duplicate, rewarded: replay.rewarded }, { ok: true, duplicate: true, rewarded: true });
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 75);

    const database = new DatabaseSync(fixture.path);
    const ledger = database.prepare("SELECT currency,direction,amount,reason,reference_id FROM wallet_transactions WHERE pilot_id=? AND reason='REWARDED_AD'")
      .all('rewarded-pilot').map(row => ({ ...row }));
    assert.deepEqual(ledger, [{ currency: 'CREDITS', direction: 'CREDIT', amount: 50, reason: 'REWARDED_AD', reference_id: created.attempt.attemptId }]);
    database.close();
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('four optional ads pay 50, 75, 100, 150 Credits per hourly chain', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-window-');
  try {
    const start = Date.UTC(2026, 1, 1);
    fixture.profiles.claimDailyReward('rewarded-pilot', start);
    const earlyClose = fixture.store.createAttempt('rewarded-pilot', 'android', start);
    assert.equal(earlyClose.ok, true);
    if (!earlyClose.ok) return;
    fixture.store.recordClientEvent('rewarded-pilot', earlyClose.attempt.attemptId, 'closed', start + 1);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + 1).remaining, 4);

    for (let index = 0; index < 4; index += 1) {
      const now = start + 10 + index * 10;
      const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
      assert.equal(created.ok, true);
      if (!created.ok) return;
      assert.equal(created.attempt.rewardCredits, rewardedAdCredits[index]);
      const granted = fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, `provider-window-${index}`, now + 1), now + 1);
      assert.equal(granted.rewarded, true);
      assert.equal(granted.rewardCredits, rewardedAdCredits[index]);
    }
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + 100).remaining, 0);
    assert.equal(fixture.store.createAttempt('rewarded-pilot', 'android', start + 100).ok, false);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 400);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + REWARDED_AD_WINDOW_MS).remaining, 0);
    fixture.profiles.claimDailyReward('rewarded-pilot', start + REWARDED_AD_WINDOW_MS);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + REWARDED_AD_WINDOW_MS).remaining, 4);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', start + REWARDED_AD_WINDOW_MS).rewardCredits, 50);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('invalid, expired, mismatched, and cross-account reward events grant no ad Credits', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-reject-');
  try {
    fixture.profiles.getOrCreate('other-pilot', 'Other Pilot');
    const now = Date.UTC(2026, 2, 1);
    fixture.profiles.claimDailyReward('rewarded-pilot', now);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(fixture.store.attemptStatus('other-pilot', created.attempt.attemptId, now), undefined);
    assert.equal(fixture.store.recordClientEvent('other-pilot', created.attempt.attemptId, 'qualified', now), undefined);
    assert.equal(fixture.store.grantVerifiedReward({ ...verified(created.attempt.attemptId, 'wrong-unit', now + 1), adUnit: 'unexpected' }, now + 1).rewarded, false);
    assert.equal(fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'expired-event', created.attempt.expiresAt + 1), created.attempt.expiresAt + 1).rewarded, false);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 25);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', created.attempt.expiresAt + 1).remaining, 4);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('a video completed after the Daily Reward hour cannot grant Credits', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-window-end-');
  try {
    const start = Date.UTC(2026, 2, 2);
    fixture.profiles.claimDailyReward('rewarded-pilot', start);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', start + REWARDED_AD_WINDOW_MS - 1_000);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expiry = start + REWARDED_AD_WINDOW_MS;
    assert.equal(fixture.store.status('rewarded-pilot', 'android', expiry - 1).remaining, 4);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', expiry).remaining, 0);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', expiry + 1).remaining, 0);
    const after = fixture.store.grantVerifiedReward(
      verified(created.attempt.attemptId, 'provider-after-window-plus-one', expiry + 1), expiry + 1_000,
    );
    assert.equal(after.rewarded, false);
    const late = fixture.store.grantVerifiedReward(
      verified(created.attempt.attemptId, 'provider-after-window', expiry),
      expiry + 1_000,
    );
    assert.equal(late.rewarded, false);
    assert.equal(late.code, 'CLAIM_REQUIRED');
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 25);
    const completedInTime = fixture.store.grantVerifiedReward(
      verified(created.attempt.attemptId, 'provider-before-window', expiry - 1),
      expiry + 2_000,
    );
    assert.equal(completedInTime.rewardCredits, 50, 'a delayed signed callback may verify an ad completed in time');
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 75);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('wallet, ledger, attempt, and allowance roll back together when reward completion cannot commit', () => {
  const fixture = databaseFixture('airport-chaos-rewarded-rollback-');
  try {
    const now = Date.UTC(2026, 3, 1);
    fixture.profiles.claimDailyReward('rewarded-pilot', now);
    const created = fixture.store.createAttempt('rewarded-pilot', 'android', now);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const database = new DatabaseSync(fixture.path);
    database.exec("CREATE TRIGGER reject_reward_completion BEFORE UPDATE OF status ON rewarded_ad_attempts WHEN NEW.status='REWARDED' BEGIN SELECT RAISE(ABORT, 'forced reward failure'); END;");
    assert.throws(() => fixture.store.grantVerifiedReward(verified(created.attempt.attemptId, 'rollback-event', now + 1), now + 1), /forced reward failure/);
    assert.equal(fixture.profiles.getOrCreate('rewarded-pilot', 'Rewarded Pilot').credits, 25);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason='REWARDED_AD'").get() as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM rewarded_ad_provider_transactions').get() as { count: number }).count, 0);
    assert.equal(fixture.store.status('rewarded-pilot', 'android', now + 2).remaining, 4);
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
  assert.match(bootstrap, /hubRewardedAdStatus && rewardedAdProvider/);
  assert.match(bootstrap, /VERIFYING|verifying/);
  assert.match(menu, /WATCH & EARN[\s\S]*: 'WATCH'/);
  assert.doesNotMatch(`${ios}\n${android}`, /credits|wallet|REWARDED_AD/i);
});

test('P8 allows only explicit nondeployed test configuration; production flags cannot activate ads', () => {
  for (const env of [
    { NODE_ENV: 'production', AIRPORT_CHAOS_DEV_QA: '1', AIRPORT_CHAOS_REWARDED_ADS_ENABLED: 'true' },
    { NODE_ENV: 'development', RENDER_SERVICE_ID: 'host', AIRPORT_CHAOS_DEV_QA: '1', AIRPORT_CHAOS_REWARDED_ADS_ENABLED: 'true' },
    { NODE_ENV: 'development' },
  ]) assert.equal(rewardedAdConfiguration(env).enabled, false);
  const qa = rewardedAdConfiguration({ NODE_ENV: 'test', AIRPORT_CHAOS_DEV_QA: '1' });
  assert.equal(qa.ios.enabled, true); assert.equal(qa.android.enabled, true); assert.equal(qa.webEnabled, false);
  const live = rewardedAdConfiguration({ NODE_ENV: 'test', AIRPORT_CHAOS_DEV_QA: '1', AIRPORT_CHAOS_ADMOB_ANDROID_REWARDED_AD_UNIT_ID: 'ca-app-pub-1234567890123456/1234567890' });
  assert.equal(live.android.enabled, false);
});

test('SSV key cache expires within 24 hours, rotates unknown keys and fails closed on unavailable keys', async () => {
  const pairs = [1, 2].map(() => generateKeyPairSync('ec', { namedCurve: 'prime256v1' }));
  const now = Date.UTC(2026, 9, 29);
  let requests = 0;
  const verifier = new AdMobSsvVerifier(async () => { requests++; return new Response(JSON.stringify({ keys: pairs.map((pair, i) => ({ keyId: i + 1, pem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() })) })); });
  const url = (keyId: number) => {
    const content = `ad_unit=${encodeURIComponent(adUnitId)}&custom_data=test-attempt&reward_amount=1&reward_item=reward&timestamp=${now}&transaction_id=test-transaction`;
    return `/ssv?${content}&signature=${sign('sha256', Buffer.from(content), pairs[keyId - 1].privateKey).toString('base64url')}&key_id=${keyId}`;
  };
  await verifier.verify(url(1), now); await verifier.verify(url(2), now + 1000); assert.equal(requests, 1);
  await verifier.verify(url(1), now + 24 * 3600000); assert.equal(requests, 2);
  await assert.rejects(verifier.verify(url(1).replace('key_id=1','key_id=999'), now + 24 * 3600000), /Unknown callback key/);
  assert.equal(requests, 3);
  await assert.rejects(new AdMobSsvVerifier(async () => new Response('', {status:503})).verify(url(1), now), /retrieve/);
  await assert.rejects(new AdMobSsvVerifier(async () => new Response('{"keys":[]}')).verify(url(1), now), /No callback keys/);
  await assert.rejects(verifier.verify(url(1).replace('key_id=1','key_id=2'), now), /signature/);
});

test('provider metadata and client completion cannot establish a Credits grant', () => {
  const f = databaseFixture('airport-p8-provider-');
  try {
    const now = Date.now(); f.profiles.claimDailyReward('rewarded-pilot', now);
    const attempt = f.store.createAttempt('rewarded-pilot','android',now); assert.ok(attempt.ok); if (!attempt.ok) return;
    f.store.recordClientEvent('rewarded-pilot',attempt.attempt.attemptId,'qualified',now + 1);
    assert.equal(f.profiles.getOrCreate('rewarded-pilot','Rewarded Pilot').credits,25);
    assert.equal(f.store.grantVerifiedReward({...verified(attempt.attempt.attemptId,'wrong-amount',now + 1),rewardAmount:'50'},now + 1).rewarded,false);
    const strict = new RewardedAdStore(f.path,{...configuration,providerRewardItem:'reward'});
    assert.equal(strict.grantVerifiedReward({...verified(attempt.attempt.attemptId,'wrong-item',now + 1),rewardItem:'unexpected'},now + 1).rewarded,false);
    const accepted = strict.grantVerifiedReward({...verified(attempt.attempt.attemptId,'correct-item',now + 1),rewardItem:'reward'},now + 1);
    assert.equal(accepted.rewardCredits,50);
    f.store.recordClientEvent('rewarded-pilot',attempt.attempt.attemptId,'failed',now + 2);
    assert.equal(f.store.attemptStatus('rewarded-pilot',attempt.attempt.attemptId,now + 2)?.attemptStatus,'REWARDED');
  } finally { rmSync(f.directory,{recursive:true,force:true}); }
});

test('native privacy entry, test-only serving, cleanup and advisory completion failure guards remain connected', () => {
  const ios = readFileSync(new URL('../../native-auth/ios/Sources/NativeAuthPlugin/NativeRewardedAdPlugin.swift', import.meta.url),'utf8');
  const android = readFileSync(new URL('../../native-auth/android/src/main/java/com/vadensoftware/airportchaos/nativeauth/NativeRewardedAdPlugin.java', import.meta.url),'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url),'utf8');
  const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url),'utf8');
  assert.match(ios, /#if DEBUG/); assert.match(ios, /canRequestAds/); assert.match(ios, /presentPrivacyOptionsForm/);
  assert.match(android, /FLAG_DEBUGGABLE/); assert.match(android, /showPrivacyOptionsForm/); assert.match(android, /handleOnDestroy/);
  assert.match(bootstrap, /recordRewardedAdEvent\(attempt.attemptId, 'qualified'\)\.catch\(\(\) => undefined\)/);
  assert.match(bootstrap, /rewardedAdProvider\.discard/);
  assert.match(bootstrap, /!result.rewardedAds.activeAttempt && hubRewardedAdPhase === 'verifying'/);
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),'utf8');
  assert.match(manifest, /com.google.android.gms.permission.AD_ID" tools:node="remove/);
  assert.match(menu, /Video Ad Privacy Options/); assert.match(menu, /Report a video ad/);
});


test('concurrent provider deliveries and a restarted process commit one wallet reward', async () => {
  const f = databaseFixture('airport-p8-race-');
  try {
    const now = Date.now(); f.profiles.claimDailyReward('rewarded-pilot', now);
    const attempt = f.store.createAttempt('rewarded-pilot','android',now); assert.ok(attempt.ok); if (!attempt.ok) return;
    const reward = verified(attempt.attempt.attemptId,'same-provider-transaction',now + 1);
    const program = `import {RewardedAdStore} from ${JSON.stringify(new URL('./rewarded-ads.ts',import.meta.url).pathname)}; const s=new RewardedAdStore(process.argv[1],JSON.parse(process.argv[2])); console.log(JSON.stringify(s.grantVerifiedReward(JSON.parse(process.argv[3]),Number(process.argv[4]))));`;
    const run = () => new Promise<{duplicate:boolean;rewarded:boolean}>((resolve,reject) => {
      const child = spawn(new URL('../../node_modules/.bin/tsx',import.meta.url).pathname,['--eval',program,f.path,JSON.stringify(configuration),JSON.stringify(reward),String(now + 1)],{stdio:['ignore','pipe','pipe']});
      let output='',errors='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>errors+=v);
      child.on('error',reject);child.on('close',code=>{if(code!==0)reject(new Error(errors));else resolve(JSON.parse(output));});
    });
    const results = await Promise.all([run(),run()]);
    assert.equal(results.filter(v=>!v.duplicate && v.rewarded).length,1);
    assert.equal((await run()).duplicate,true);
    assert.equal(f.profiles.getOrCreate('rewarded-pilot','Rewarded Pilot').credits,75);
    const db=new DatabaseSync(f.path);assert.equal((db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reason='REWARDED_AD'").get() as {n:number}).n,1);db.close();
  }finally{rmSync(f.directory,{recursive:true,force:true});}
});
