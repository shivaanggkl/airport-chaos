import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyCatalog, journeyMissionOrder, journeyDallasMostWantedSurvival01 } from '../../shared/journey-mission.mjs';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';
import { JourneyAttemptStore } from './journey-attempts.ts';

test('M26 retains its identity and preview copy but cannot launch, including local QA', () => {
  const id = journeyDallasMostWantedSurvival01.id;
  const slot = journeyCatalog[25];
  assert.equal(journeyCatalog.length, 30);
  assert.equal(slot.id, id);
  assert.equal(slot.number, 26);
  assert.equal(slot.title, 'SURVIVAL');
  assert.equal(slot.implementation, 'placeholder');
  assert.equal(journeyMissionOrder.includes(id), false);
  const detail = missionJourneyDetails.find(mission => mission.id === id);
  assert.equal(detail.title, 'SURVIVAL');
  assert.equal(detail.description, 'Stay alive for 2 minutes to win');
  for (const unlocked of [false, true]) {
    assert.equal(JourneyAttemptStore.prototype.canAccessMission.call({
      qaMissionAccess: () => unlocked,
      progress: () => ({ completed: true }),
    }, 'pilot', id), false);
  }
  assert.equal(journeyCatalog[24].id, 'journey-dallas-18');
  assert.equal(journeyCatalog[26].implementation, 'placeholder');
  assert.equal(journeyCatalog[27].id, 'journey-dallas-12');
});
