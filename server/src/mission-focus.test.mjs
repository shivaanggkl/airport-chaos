import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { excludesFocusedBotInteraction, missionFocusForAttempt } from '../../shared/mission-focus.mjs';

test('only active Missions 1–24 attempts have focus rules', () => {
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
  for (const missionId of ['journey-dallas-02', 'journey-dallas-03', 'journey-dallas-04', 'journey-dallas-05', 'journey-dallas-06', 'journey-dallas-07', 'journey-dallas-08', 'journey-dallas-09', 'journey-dallas-10', 'journey-dallas-11', 'journey-dallas-12', 'journey-dallas-13', 'journey-dallas-14', 'journey-dallas-15', 'journey-dallas-16', 'journey-dallas-17', 'journey-dallas-18', 'journey-dallas-19', 'journey-dallas-20', 'journey-dallas-21', 'journey-dallas-22', 'journey-dallas-23', 'journey-dallas-24']) {
    for (const status of ['APPROACH', 'RACING']) {
      assert.deepEqual(missionFocusForAttempt({ missionId, status }),
        missionFocusForAttempt({ missionId: 'journey-dallas-01', status }));
    }
    for (const status of ['READY', 'COMPLETED', 'FAILED', 'ABANDONED']) {
      assert.equal(missionFocusForAttempt({ missionId, status }), null);
    }
  }
  for (const missionId of ['journey-dallas-25']) {
    assert.equal(missionFocusForAttempt({ missionId, status: 'RACING' }), null);
  }
  assert.equal(missionFocusForAttempt({ missionId: 'journey-dallas-03', status: 'READY', aiIsolated: true }), null);
  assert.equal(missionFocusForAttempt(null), null);
});

test('focused Mission 4 race never assigns a territory defender', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /missionFocusTerritoryAttempts/);
  assert.doesNotMatch(server, /assignedFocusedDefender/);
});

test('bot interaction exclusion is reciprocal and leaves humans and other pilots unchanged', () => {
  assert.equal(excludesFocusedBotInteraction(false, true, true, false), true); // bot shot into focused pilot
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true); // focused pilot shot into hidden bot
  assert.equal(excludesFocusedBotInteraction(true, false, false, false), false); // human opponent stays interactive
  assert.equal(excludesFocusedBotInteraction(false, true, false, false), false); // bot vs ordinary pilot
  assert.equal(excludesFocusedBotInteraction(false, false, false, true), false); // ordinary pilot vs bot
  assert.equal(excludesFocusedBotInteraction(true, false, false, true, true), false); // assigned Hunter is targetable
  assert.equal(excludesFocusedBotInteraction(false, true, true, false, false, true), false); // assigned Hunter can hit pilot
  assert.equal(excludesFocusedBotInteraction(true, false, false, true, false), true); // other bot remains excluded
  assert.equal(excludesFocusedBotInteraction(false, true, true, false, false, false), true); // other bot cannot hit pilot
  assert.equal(excludesFocusedBotInteraction(true, false, false, true), true); // Mission 5 has no bot exception
  assert.equal(excludesFocusedBotInteraction(false, true, true, false), true); // its hidden bot cannot retaliate
});

test('only the server-owned attempt and bot owner authorize the Hunter exception across combat paths', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /missionFocusHunterTargets\.set\(playerId, focusedTargetId\)/);
  assert.match(server, /attempt\.missionId === journeyDallas09\.id \|\| attempt\.missionId === journeyDallas14\.id/);
  assert.match(server, /hunter\?\.journeyTargetPlayerId === pilotId && hunter\.journeyAttemptId === playerJourneyAttempts\.get\(pilotId\)/);
  assert.match(server, /focusedBotInteractionExcluded\(ownerId, owner, victimId, victim\)/);
  assert.match(server, /focusedBotInteractionExcluded\(projectile\.ownerId, owner, playerId, player\)/);
  assert.match(server, /focusedBotInteractionExcluded\(firstId, first, secondId, second\)/);
  assert.match(server, /missionFocusHunterTargets\.delete\(playerId\)/);
  assert.doesNotMatch(server, /message\.aiIsolated|message\.missionFocusHunterTarget/);
});
