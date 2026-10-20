import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyInteractionExcluded } from './journey-isolation.js';

const pilot = {};
const assignedBot = { bot: { journeyAttemptId: 'attempt-1', journeyTargetPlayerId: 'pilot-1' } };
const otherBot = { bot: { journeyAttemptId: 'attempt-2', journeyTargetPlayerId: 'pilot-2' } };
const ambientBot = { bot: {} };

test('Journey pilots interact only with AI assigned to their own attempt', () => {
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, 'attempt-1', 'pilot-2', pilot, undefined), true);
  assert.equal(journeyInteractionExcluded('pilot-2', pilot, undefined, 'pilot-1', pilot, 'attempt-1'), true);
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, 'attempt-1', 'ambient', ambientBot, undefined), true);
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, 'attempt-1', 'assigned', assignedBot, undefined), false);
  assert.equal(journeyInteractionExcluded('assigned', assignedBot, undefined, 'pilot-1', pilot, 'attempt-1'), false);
  assert.equal(journeyInteractionExcluded('pilot-2', pilot, undefined, 'assigned', assignedBot, undefined), true);
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, 'attempt-1', 'other', otherBot, undefined), true);
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, 'attempt-1', 'pilot-2', pilot, 'attempt-2'), true);
  assert.equal(journeyInteractionExcluded('pilot-1', pilot, undefined, 'pilot-2', pilot, undefined), false);
});
