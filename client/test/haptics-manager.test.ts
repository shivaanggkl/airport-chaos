import assert from 'node:assert/strict';
import test from 'node:test';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';
import { emitConfirmedJourneyFeedback, emitConfirmedProfileRewardFeedback, HapticsManager } from '../src/haptics-manager';

function fixture(values = new Map<string, string>()) {
  const calls: string[] = [];
  let clock = 1_000;
  let visible = true;
  let native = true;
  let reject = false;
  const manager = new HapticsManager({
    adapter: {
      impact: (options) => { calls.push(`impact:${options?.style}`); return reject ? Promise.reject(new Error('unavailable')) : Promise.resolve(); },
      notification: (options) => { calls.push(`notification:${options?.type}`); return reject ? Promise.reject(new Error('unavailable')) : Promise.resolve(); },
    },
    nativeAvailable: () => native,
    visible: () => visible,
    now: () => clock,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
  });
  return { manager, calls, values, advance: (ms: number) => { clock += ms; }, setVisible: (value: boolean) => { visible = value; }, setNative: (value: boolean) => { native = value; }, setReject: (value: boolean) => { reject = value; } };
}

test('semantic events use the intended native feedback and independent cooldowns', () => {
  const f = fixture();
  f.manager.emit('selection');
  f.manager.emit('selection');
  f.manager.emit('confirmation');
  f.manager.emit('damage');
  f.manager.emit('damage');
  f.advance(300);
  f.manager.emit('damage');
  f.manager.emit('checkpoint', 'attempt:1');
  f.manager.emit('checkpoint', 'attempt:1');
  f.manager.emit('missionSuccess', 'attempt');
  f.manager.emit('destruction', 'victim-1');
  f.manager.emit('destruction', 'victim-1');
  f.manager.emit('rewardSuccess', 'purchase');
  f.manager.emit('failure', 'failed-attempt');
  assert.deepEqual(f.calls, [
    `impact:${ImpactStyle.Medium}`, `impact:${ImpactStyle.Heavy}`,
    `impact:${ImpactStyle.Heavy}`, `impact:${ImpactStyle.Heavy}`,
    `impact:${ImpactStyle.Medium}`, `notification:${NotificationType.Success}`,
    `impact:${ImpactStyle.Heavy}`,
    `notification:${NotificationType.Success}`, `notification:${NotificationType.Warning}`,
  ]);
});

test('OFF, browser fallback, hidden state, persistence, and duplicate receipts suppress native calls', () => {
  const f = fixture();
  f.manager.setEnabled(false);
  f.manager.emit('missionSuccess', 'one');
  assert.equal(f.values.get('airport-chaos-haptics-enabled-v1'), 'off');
  assert.equal(fixture(f.values).manager.isEnabled(), false);
  f.manager.setEnabled(true);
  f.setVisible(false);
  f.manager.emit('rewardSuccess', 'purchase');
  f.setVisible(true);
  f.setNative(false);
  f.manager.emit('selection');
  f.setNative(true);
  f.manager.emit('rewardSuccess', 'purchase');
  f.manager.emit('rewardSuccess', 'purchase');
  assert.deepEqual(f.calls, [`notification:${NotificationType.Success}`]);
});

test('native rejection cannot reject the game event handler', async () => {
  const f = fixture();
  f.setReject(true);
  assert.doesNotThrow(() => f.manager.emit('selection'));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.calls, [`impact:${ImpactStyle.Medium}`]);
});

test('the gameplay Journey handler vibrates on confirmed gates, victory, and failure only once', () => {
  const f = fixture();
  const active = { attemptId: 'flight-1', status: 'RACING', gateIndex: 0 };
  emitConfirmedJourneyFeedback(f.manager, null, { ...active, gateIndex: 2 }); // Restored history is silent.
  for (let gate = 1; gate <= 3; gate += 1) {
    f.advance(150);
    emitConfirmedJourneyFeedback(f.manager, { ...active, gateIndex: gate - 1 }, { ...active, gateIndex: gate });
  }
  emitConfirmedJourneyFeedback(f.manager, { ...active, gateIndex: 3 }, { ...active, status: 'COMPLETED', gateIndex: 4 });
  emitConfirmedJourneyFeedback(f.manager, { ...active, gateIndex: 3 }, { ...active, status: 'COMPLETED', gateIndex: 4 });
  emitConfirmedJourneyFeedback(f.manager, { attemptId: 'flight-2', status: 'RACING', gateIndex: 0 }, { attemptId: 'flight-2', status: 'COMPLETED', gateIndex: 0 });
  emitConfirmedJourneyFeedback(f.manager, { attemptId: 'flight-3', status: 'RACING', gateIndex: 0 }, { attemptId: 'flight-3', status: 'FAILED', gateIndex: 0 });
  assert.deepEqual(f.calls, [
    `impact:${ImpactStyle.Medium}`, `impact:${ImpactStyle.Medium}`, `impact:${ImpactStyle.Medium}`,
    `notification:${NotificationType.Success}`, `notification:${NotificationType.Success}`,
    `notification:${NotificationType.Warning}`,
  ]);
});

test('season and weekly rewards vibrate only when a confirmed claim changes their state', () => {
  const f = fixture();
  const before = { season: { seasonId: 's1', rewards: [{ id: 'r1', state: 'claimable' }], weeklyEvent: { weeklyEventId: 'w1', rewarded: false } } };
  const seasonClaimed = { season: { ...before.season, rewards: [{ id: 'r1', state: 'claimed' }] } };
  const weeklyClaimed = { season: { ...seasonClaimed.season, weeklyEvent: { weeklyEventId: 'w1', rewarded: true } } };
  emitConfirmedProfileRewardFeedback(f.manager, before, seasonClaimed, 'Profile Sync');
  emitConfirmedProfileRewardFeedback(f.manager, before, seasonClaimed, 'Season Reward Claimed');
  emitConfirmedProfileRewardFeedback(f.manager, seasonClaimed, seasonClaimed, 'Season Reward Claimed');
  emitConfirmedProfileRewardFeedback(f.manager, seasonClaimed, weeklyClaimed, 'Weekly Event Reward Claimed');
  emitConfirmedProfileRewardFeedback(f.manager, seasonClaimed, weeklyClaimed, 'Weekly Event Reward Claimed');
  assert.deepEqual(f.calls, [`notification:${NotificationType.Success}`, `notification:${NotificationType.Success}`]);
});
