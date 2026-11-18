import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { missionJourneyStages, missionJourneyStatuses, journeyMainCompleted } from '../../client/src/mission-journey-model.js';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.js';
import { journeyCategories } from '../../shared/journey-categories.mjs';
import * as missions from '../../shared/journey-mission.mjs';

const view = readFileSync(new URL('../../client/src/mission-journey.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../client/src/mission-journey.css', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');

test('six disconnected groups have six numbered nodes, a gentle rise, and no obsolete chapter UI', () => {
  assert.equal(missionJourneyStages.length, 42);
  for (const group of journeyCategories) {
    assert.deepEqual(missionJourneyStages.filter(stage => stage.categoryId === group.id).map(stage => stage.categoryNumber), [1,2,3,4,5,6]);
  }
  assert.match(view, /row.append\(route\)/);
  assert.match(view, /48 - index \* 15/);
  assert.doesNotMatch(view, /journey-chapter|journey-map|journey-segment/);
  assert.match(styles, /gap: 56px/);
  assert.match(styles, /flex: 0 0 266px/);
  assert.match(styles, /\.mission-journey-category-route polyline[^\n]+stroke-width: 2px/);
});

test('server eligibility drives nodes, while placeholders stay locked even with QA progress', () => {
  const none = Array(42).fill(false);
  assert.ok(missionJourneyStatuses(none, none, false).statuses.every(status => status === 'locked'));
  const heads = missionJourneyStages.map(stage => stage.kind === 'main' && stage.categoryNumber === 1);
  const state = missionJourneyStatuses(none, heads, false);
  assert.equal(state.currentMission, 1);
  assert.equal(state.statuses.filter(status => status === 'current' || status === 'available').length, 6);
  const all = missionJourneyStatuses(Array(42).fill(true), Array(42).fill(true), false);
  assert.equal(all.currentMission, 0);
  missionJourneyStages.forEach((stage, index) => assert.equal(all.statuses[index], stage.implementation === 'playable' ? 'completed' : 'locked'));
  assert.equal(journeyMainCompleted(Object.fromEntries(missions.journeyMissionOrder.map(id => [id, {completed:true}]))), 23);
  assert.match(view, /play.disabled = placeholder \|\| this.cityLocked/);
  assert.match(view, /placeholder \? 'COMING SOON'/);
  assert.match(bootstrap, /missionJourney.setCityLocked\(!dallasUnlocked\(\)\)/);
  assert.match(bootstrap, /stage.id === missionJourney.selectedMissionId/);
});

test('live detail definitions keep every playable reward, clock and description; Territory 4 retains its description', () => {
  for (const stage of missionJourneyStages.filter(stage => stage.implementation === 'playable')) {
    const card = missionJourneyDetails.find(card => card.id === stage.id);
    const definition = Object.values(missions).find(value => value?.id === stage.id);
    assert.ok(card?.description, stage.id);
    assert.equal(card.rewardCredits, definition.firstClearCredits);
    const time = definition.timeLimitMs;
    assert.equal(card.timeLimit, time === undefined ? 'NO LIMIT' : `${Math.floor(time/60000)}:${String(Math.floor(time/1000)%60).padStart(2,'0')}`);
  }
  assert.equal(missionJourneyDetails.find(card => card.id === 'placeholder-dallas-27').description, 'Capture 3 TERRITORIES\nHold them together for 1 minute');
  assert.match(view, /placeholder \? '—'/);
  assert.match(view, /card.description.split/);
  assert.doesNotMatch(styles, /\.mission-journey-detail.is-placeholder/);
});

test('only the track scrolls, with touch, wheel, keyboard and Special Pursuits return navigation', () => {
  assert.match(styles, /\.mission-journey \{[^\n]+position: fixed;[^\n]+overflow: hidden/);
  assert.match(styles, /\.mission-journey-viewport \{[^\n]+overflow-x: auto; overflow-y: hidden;[^\n]+touch-action: pan-x/);
  assert.match(styles, /\.mission-journey-detail \{[^\n]+position: absolute/);
  assert.match(styles, /@media \(max-height: 480px\) and \(orientation: landscape\)/);
  assert.match(view, /addEventListener\('wheel'/);
  assert.match(view, /ArrowRight/);
  assert.match(view, /Home/);
  assert.match(view, /focus\(\{ preventScroll: true \}\)/);
  assert.match(view, /this.mainScroll = this.viewport.scrollLeft/);
  assert.match(view, /this.viewport.scrollLeft = open \? 0 : this.mainScroll/);
  assert.match(view, /selected.categoryId !== 'plane-battles'/);
});
