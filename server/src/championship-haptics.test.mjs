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

test('Skyline Slalom confirms Gates 1–4 once and reserves victory feedback for Gate 5', () => {
  const events = [];
  const manager = { emit(event) { events.push(event); } };
  let previous = { attemptId: 'slalom', missionId: 'journey-dallas-10', status: 'APPROACH', gateIndex: 0 };
  for (let gateIndex = 1; gateIndex <= 4; gateIndex += 1) {
    const next = { ...previous, status: 'RACING', gateIndex };
    emitConfirmedJourneyFeedback(manager, previous, next);
    previous = next;
  }
  emitConfirmedJourneyFeedback(manager, previous, { ...previous, status: 'COMPLETED', gateIndex: 5 });
  assert.deepEqual(events, ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'missionSuccess']);
});
