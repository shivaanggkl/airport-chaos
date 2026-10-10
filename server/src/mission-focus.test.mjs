import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { excludesFocusedBotInteraction, missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { focusedTerritoryCaptureId, focusedTerritoryParticipantAllowed, isFocusedTerritoryDefender } from './focused-territory-defender.js';

test('only active Missions 1–7 attempts have focus rules', () => {
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
  for (const missionId of ['journey-dallas-02', 'journey-dallas-03', 'journey-dallas-04', 'journey-dallas-05', 'journey-dallas-06', 'journey-dallas-07']) {
    for (const status of ['APPROACH', 'RACING']) {
      assert.deepEqual(missionFocusForAttempt({ missionId, status }),
        missionFocusForAttempt({ missionId: 'journey-dallas-01', status }));
    }
    for (const status of ['READY', 'COMPLETED', 'FAILED', 'ABANDONED']) {
      assert.equal(missionFocusForAttempt({ missionId, status }), null);
    }
  }
  for (const missionId of ['journey-dallas-08']) {
    assert.equal(missionFocusForAttempt({ missionId, status: 'RACING' }), null);
  }
  assert.equal(missionFocusForAttempt({ missionId: 'journey-dallas-03', status: 'READY', aiIsolated: true }), null);
  assert.equal(missionFocusForAttempt(null), null);
});

test('only the live White Rock defender assigned to this focused pilot is interactive', () => {
  const territory = { defenderBotId: 'defender-a', capturingPlayerId: 'pilot-a' };
  const defender = { lifeState: 'alive', bot: { defenseTerritoryId: 'white-rock', defenseTargetId: 'pilot-a' } };
  const allowed = (focusedAttemptId, linkedAttemptId, pilotId, botId, state = territory, bot = defender) =>
    isFocusedTerritoryDefender(focusedAttemptId, linkedAttemptId, pilotId, botId, 'white-rock', state, bot);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a'), true);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a', { ...territory, capturingPlayerId: 'pilot-b' }), true);
  assert.equal(allowed(undefined, 'attempt-a', 'pilot-a', 'defender-a'), false);
  assert.equal(allowed('attempt-old', 'attempt-new', 'pilot-a', 'defender-a'), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-b', 'defender-a'), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'other-bot'), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a', { ...territory, defenderBotId: undefined }), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a', territory, { ...defender, lifeState: 'destroyed' }), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a', territory,
    { ...defender, bot: { ...defender.bot, defenseTerritoryId: 'downtown' } }), false);
  assert.equal(allowed('attempt-a', 'attempt-a', 'pilot-a', 'defender-a', territory,
    { ...defender, bot: { ...defender.bot, defenseTargetId: 'pilot-b' } }), false);
  assert.equal(excludesFocusedBotInteraction(true, false, false, true, true), false);
  assert.equal(excludesFocusedBotInteraction(true, false, false, true, false), true);
});

test('focused Mission 4 pilot contributes only to White Rock with the linked attempt', () => {
  assert.equal(focusedTerritoryParticipantAllowed(false, undefined, undefined), true);
  assert.equal(focusedTerritoryParticipantAllowed(true, 'attempt-a', 'attempt-a'), true);
  assert.equal(focusedTerritoryParticipantAllowed(true, undefined, 'attempt-a'), false);
  assert.equal(focusedTerritoryParticipantAllowed(true, 'attempt-old', 'attempt-new'), false);
  assert.equal(focusedTerritoryCaptureId('white-rock', 'attempt-a', 'white-rock'), 'white-rock');
  assert.equal(focusedTerritoryCaptureId('downtown', 'attempt-a', 'white-rock'), undefined);
  assert.equal(focusedTerritoryCaptureId('downtown', undefined, 'white-rock'), 'downtown');
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
  assert.match(server, /missionFocusHunterTargets\.set\(playerId, attempt\.targetId\)/);
  assert.match(server, /hunter\?\.journeyTargetPlayerId === pilotId && hunter\.journeyAttemptId === playerJourneyAttempts\.get\(pilotId\)/);
  assert.match(server, /focusedBotInteractionExcluded\(ownerId, owner, victimId, victim\)/);
  assert.match(server, /focusedBotInteractionExcluded\(projectile\.ownerId, owner, playerId, player\)/);
  assert.match(server, /focusedBotInteractionExcluded\(firstId, first, secondId, second\)/);
  assert.match(server, /missionFocusHunterTargets\.delete\(playerId\)/);
  assert.match(server, /missionFocusTerritoryAttempts\.set\(playerId, attempt\.attemptId\)/);
  assert.match(server, /missionFocusTerritoryAttempts\.delete\(playerId\)/);
  assert.match(server, /isFocusedTerritoryDefender\(missionFocusTerritoryAttempts\.get\(pilotId\), playerJourneyAttempts\.get\(pilotId\)/);
  assert.doesNotMatch(server, /message\.aiIsolated|message\.missionFocusHunterTarget/);
});
