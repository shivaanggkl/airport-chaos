import test from 'node:test';
import assert from 'node:assert/strict';
import { excludesFocusedBotInteraction, missionFocusForAttempt } from '../../shared/mission-focus.mjs';

test('only an active DFW Sky Rush attempt has Mission 1 focus rules', () => {
  for (const status of ['APPROACH', 'RACING']) {
    const config = missionFocusForAttempt({ missionId: 'journey-dallas-01', status });
    assert.equal(config?.showMissionObjectives, true);
    assert.equal(config?.showUnrelatedAirportLabels, false);
    assert.equal(config?.showUnrelatedLandmarkLabels, false);
    assert.equal(config?.showUnrelatedTerritoryLabels, false);
    assert.equal(config?.showUnrelatedChallengeMarkers, false);
    assert.equal(config?.showAmbientAIAircraft, false);
    assert.equal(config?.showAmbientAIMarkers, false);
  }
  for (const status of ['READY', 'COMPLETED', 'FAILED', 'ABANDONED']) {
    assert.equal(missionFocusForAttempt({ missionId: 'journey-dallas-01', status }), null);
  }
  for (const missionId of ['journey-dallas-02', 'journey-dallas-03', 'journey-dallas-04', 'journey-dallas-05']) {
    assert.equal(missionFocusForAttempt({ missionId, status: 'RACING' }), null);
  }
  assert.equal(missionFocusForAttempt(null), null);
});

test('bot interaction exclusion is reciprocal and leaves humans and other pilots unchanged', () => {
  assert.equal(excludesFocusedBotInteraction(false, true, true, false), true); // bot shot into focused pilot
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true); // focused pilot shot into hidden bot
  assert.equal(excludesFocusedBotInteraction(true, false, false, false), false); // human opponent stays interactive
  assert.equal(excludesFocusedBotInteraction(false, true, false, false), false); // bot vs ordinary pilot
  assert.equal(excludesFocusedBotInteraction(false, false, false, true), false); // ordinary pilot vs bot
});
