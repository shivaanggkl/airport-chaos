import assert from 'node:assert/strict';
import test from 'node:test';
import { storeJourneyRewardReceipt, takeJourneyRewardReceipt, takeJourneyCompletionReceipt } from '../../client/src/journey-reward-receipt.ts';

test('journey credit animation uses the completed pilot attempt once', () => {
  const previousStorage = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
  };
  try {
    storeJourneyRewardReceipt('attempt-1', 'pilot-1', 250);
    assert.equal(takeJourneyRewardReceipt('attempt-1', 'pilot-2'), 0);
    assert.equal(takeJourneyRewardReceipt('attempt-1', 'pilot-1'), 0);
    storeJourneyRewardReceipt('attempt-1', 'pilot-1', 250);
    assert.equal(takeJourneyRewardReceipt('attempt-2', 'pilot-1'), 0);
    storeJourneyRewardReceipt('attempt-1', 'pilot-1', 250);
    assert.equal(takeJourneyRewardReceipt('attempt-1', 'pilot-1'), 250);
    assert.equal(takeJourneyRewardReceipt('attempt-1', 'pilot-1'), 0);
    storeJourneyRewardReceipt('final-replay', 'pilot-1', 0, 'journey-dallas-19');
    assert.deepEqual(takeJourneyCompletionReceipt('final-replay','pilot-1'),{credits:0,missionId:'journey-dallas-19'});
    assert.equal(takeJourneyCompletionReceipt('final-replay','pilot-1'),undefined);
    storeJourneyRewardReceipt('final-first', 'pilot-1', 4000, 'journey-dallas-19');
    assert.deepEqual(takeJourneyCompletionReceipt('final-first','pilot-1'),{credits:4000,missionId:'journey-dallas-19'});
    storeJourneyRewardReceipt('replay', 'pilot-1', 0);
    assert.equal(takeJourneyRewardReceipt('replay', 'pilot-1'), 0);
  } finally {
    globalThis.sessionStorage = previousStorage;
  }
});
