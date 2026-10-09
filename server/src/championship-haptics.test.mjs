import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emitConfirmedJourneyFeedback } from '../../client/src/haptics-manager.ts';

test('Gate 6 is a checkpoint and verified landing alone emits victory feedback', () => {
  const events = [];
  const manager = { emit(event) { events.push(event); } };
  const prior = { attemptId: 'championship', missionId: 'journey-dallas-06', status: 'RACING', gateIndex: 5 };
  const landing = { ...prior, gateIndex: 6 };
  emitConfirmedJourneyFeedback(manager, prior, landing);
  assert.deepEqual(events, ['checkpoint']);
  emitConfirmedJourneyFeedback(manager, landing, { ...landing, status: 'COMPLETED' });
  assert.deepEqual(events, ['checkpoint', 'missionSuccess']);
});
