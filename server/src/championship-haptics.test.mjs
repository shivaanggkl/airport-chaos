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

test('Gravity Drop confirms Gates 1–4 once and reserves victory feedback for Gate 5', () => {
  const events = [];
  const manager = { emit(event) { events.push(event); } };
  let previous = { attemptId: 'drop', missionId: 'journey-dallas-11', status: 'APPROACH', gateIndex: 0 };
  for (let gateIndex = 1; gateIndex <= 4; gateIndex += 1) {
    const next = { ...previous, status: 'RACING', gateIndex };
    emitConfirmedJourneyFeedback(manager, previous, next);
    previous = next;
  }
  emitConfirmedJourneyFeedback(manager, previous, { ...previous, status: 'COMPLETED', gateIndex: 5 });
  assert.deepEqual(events, ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'missionSuccess']);
});

test('Sky Pendulum confirms Gates 1–5 once and reserves victory feedback for Gate 6', () => {
  const events = [];
  const manager = { emit(event) { events.push(event); } };
  let previous = { attemptId: 'pendulum', missionId: 'journey-dallas-12', status: 'APPROACH', gateIndex: 0 };
  for (let gateIndex = 1; gateIndex <= 5; gateIndex += 1) {
    const next = { ...previous, status: 'RACING', gateIndex };
    emitConfirmedJourneyFeedback(manager, previous, next);
    previous = next;
  }
  emitConfirmedJourneyFeedback(manager, previous, { ...previous, status: 'COMPLETED', gateIndex: 6 });
  assert.deepEqual(events, ['checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'checkpoint', 'missionSuccess']);
});
