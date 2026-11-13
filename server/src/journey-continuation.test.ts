import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as catalog from '../../shared/journey-mission.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { RewardedAdStore, type RewardedAdConfiguration } from './rewarded-ads.js';

const adUnitId = 'ca-app-pub-3940256099942544/5224354917';
const configuration: RewardedAdConfiguration = { enabled: true, ios: { enabled: false }, android: { enabled: true, adUnitId }, webEnabled: false, providerRewardAmount: '1' };

test('all retained missions continue only after a bound verified ad, preserving progress and capping bonus time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'journey-continuation-'));
  try {
    const path = join(directory, 'profiles.sqlite');
    const profiles = new PlayerProfileStore(path);
    profiles.getOrCreate('pilot', 'Pilot'); profiles.getOrCreate('other', 'Other');
    const ads = new RewardedAdStore(path, configuration);
    const journeys = new JourneyAttemptStore(path, true);
    const db = new DatabaseSync(path);
    const credits = profiles.getOrCreate('pilot', 'Pilot').credits;
    for (const [index, missionId] of catalog.journeyMissionOrder.entries()) {
      const definition = Object.values(catalog).find((entry: any) => entry?.id === missionId) as { timeLimitMs: number };
      const start = 1_000_000 + index * 1_000_000;
      const ready = journeys.launch('pilot', 'trainer', start - 100, missionId);
      // Fixture represents an authoritative mid-flight checkpoint, including damaged enemies.
      db.prepare(`UPDATE journey_attempts SET status='RACING',started_at=?,deadline_at=?,gate_index=2,rookie_gate_index=2,lake_gate_index=2,ascent_gate_index=2,
        slalom_gate_index=2,needle_gate_index=2,golden_championship_gate_index=2,championship_gate_index=2,monster_health=137,
        fortress_left_health=0,fortress_right_health=42,rear_guard_kills=1,crossfire_kills=1,capture_ms=8000 WHERE attempt_id=?`)
        .run(start, start + definition.timeLimitMs, ready.attemptId);
      const elapsed = index % 3 === 0 ? 1_000 : index % 3 === 1 ? 90_000 : definition.timeLimitMs;
      const failedAt = start + elapsed;
      const failure = journeys.fail('pilot', ready.attemptId, missionId===catalog.journeyDallas15.id ? 'ENEMY_ESCAPED' : elapsed === definition.timeLimitMs ? 'TIME_UP' : index>=18 ? 'MONSTER_KILLED' : 'CRASHED', failedAt)!;
      assert.equal(journeys.saveContinuation('pilot',ready.attemptId,failedAt,{position:{x:0,y:1000,z:0},heading:0,bots:[]}),true);
      const reopened = new JourneyAttemptStore(path,true);
      assert.ok(reopened.continuation('pilot',ready.attemptId,failedAt+1),'checkpoint survives restart');
      assert.equal(reopened.continuation('other',ready.attemptId,failedAt+1),undefined);
      const key = `${ready.attemptId}:${failedAt}`;
      const created = ads.createAttempt('pilot', 'android', failedAt + 1, key);
      assert.ok(created.ok); if (!created.ok) throw new Error('ad unavailable');
      const adId = created.attempt.attemptId;
      assert.equal(created.attempt.rewardCredits, 0);
      const recovered = ads.createAttempt('pilot','android',failedAt+2,key);
      assert.ok(recovered.ok && recovered.attempt.attemptId===adId,'issuance retry returns same video attempt');
      assert.equal(journeys.continueAfterAd('pilot', ready.attemptId, adId, failedAt + 2), undefined);
      ads.recordClientEvent('pilot', adId, 'qualified', failedAt + 3);
      assert.equal(journeys.continueAfterAd('pilot', ready.attemptId, adId, failedAt + 4), undefined, 'client qualification is not proof');
      const reward = { adUnit: adUnitId, customData: adId, rewardAmount: '1', rewardItem: 'reward', timestamp: failedAt + 4, transactionId: `verified-${index}` };
      assert.equal(ads.grantVerifiedReward(reward, failedAt + 4).rewarded, true);
      const recoveredReward = ads.createAttempt('pilot','android',failedAt+5,key);
      assert.ok(recoveredReward.ok && recoveredReward.attempt.attemptId===adId,'verified video recovered without another ad');
      assert.equal(journeys.continueAfterAd('other', ready.attemptId, adId, failedAt + 5), undefined);
      const now = failedAt + 30_000;
      const resumed = journeys.continueAfterAd('pilot', ready.attemptId, adId, now)!;
      assert.ok(resumed);
      assert.equal(resumed.deadlineAt! - now, Math.min(definition.timeLimitMs, Math.max(0, definition.timeLimitMs - elapsed) + 60_000));
      assert.equal(resumed.startedAt! - failure.startedAt!, now - failedAt, 'ad wait is excluded');
      assert.equal(resumed.status, 'RACING'); assert.equal(resumed.failureReason, null);
      for (const field of ['captureMs','gateIndex','monsterHealth','fortressLeftHealth','fortressRightHealth','rearGuardKills','crossfireKills','targetId','secondaryTargetId'] as const)
        assert.equal(resumed[field], failure[field], `${missionId}: ${field}`);
      assert.equal(journeys.continueAfterAd('pilot', ready.attemptId, adId, now + 1), undefined, 'no duplicate redemption');
      assert.equal(ads.grantVerifiedReward(reward, now + 1).duplicate, true);
      journeys.fail('pilot', ready.attemptId, 'CRASHED', now + 2);
      assert.equal(journeys.saveContinuation('pilot',ready.attemptId,now+2,{}),false,'only one continuation per attempt');
      assert.equal(journeys.continueAfterAd('pilot', ready.attemptId, adId, now + 3), undefined, 'old ad cannot restore a new failure');
      assert.equal(profiles.getOrCreate('pilot', 'Pilot').credits, credits, 'continuation never grants credits');
    }
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('expired and unsupported checkpoints cannot grant continuation', () => {
  const directory=mkdtempSync(join(tmpdir(),'journey-expiry-'));
  try {
    const path=join(directory,'profiles.sqlite'), profiles=new PlayerProfileStore(path);
    profiles.getOrCreate('pilot','Pilot');
    const ads=new RewardedAdStore(path,configuration), journeys=new JourneyAttemptStore(path,true), db=new DatabaseSync(path);
    const a=journeys.launch('pilot','trainer',1000,catalog.journeyDallas01.id);
    db.prepare("UPDATE journey_attempts SET status='RACING',started_at=1000,deadline_at=181000 WHERE attempt_id=?").run(a.attemptId);
    journeys.fail('pilot',a.attemptId,'CRASHED',2000);
    assert.equal(ads.createAttempt('pilot','android',2001,`${a.attemptId}:2000`).ok,false,'no checkpoint, no ad');
    journeys.saveContinuation('pilot',a.attemptId,2000,{});
    assert.equal(journeys.continuation('pilot',a.attemptId,602000),undefined);
    assert.equal(ads.createAttempt('pilot','android',602000,`${a.attemptId}:2000`).ok,false,'expired checkpoint, no ad');
    journeys.discardContinuation('pilot',a.attemptId);
    assert.equal(journeys.continuation('pilot',a.attemptId,2001),undefined,'abandonment clears eligibility');
    db.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
