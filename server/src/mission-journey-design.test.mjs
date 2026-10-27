import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chapterNames, missionJourneyStages, missionJourneyStatuses } from '../../client/src/mission-journey-model.js';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.js';
import * as journeyMissions from '../../shared/journey-mission.mjs';

const view = readFileSync(new URL('../../client/src/mission-journey.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../client/src/mission-journey.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');

test('all 24 unique missions occupy four ordered, balanced chapters', () => {
  assert.equal(missionJourneyStages.length, 24);
  assert.deepEqual(missionJourneyStages.map(stage => stage.number), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(new Set(missionJourneyStages.map(stage => stage.id)).size, 24);
  assert.equal(chapterNames.length, 4);
  for (let chapter = 1; chapter <= 4; chapter++) {
    const stages = missionJourneyStages.filter(stage => stage.chapter === chapter);
    assert.deepEqual(stages.map(stage => stage.number), Array.from({ length: 6 }, (_, index) => (chapter - 1) * 6 + index + 1));
  }
  assert.ok(missionJourneyStages.every((stage, index) => index === 0 || stage.x > missionJourneyStages[index - 1].x));
  assert.ok(missionJourneyStages.every((stage, index) => index === 0 || stage.y < missionJourneyStages[index - 1].y));
  assert.ok(missionJourneyStages.every(stage => stage.y > 25 && stage.y < 75));
  assert.match(view, /stage\.number % 6 === 0 \? '<em class="mission-journey-crown"/);
});

test('mission state follows progression, including chapter boundaries and full completion', () => {
  const completed = Array.from({ length: 24 }, (_, index) => index < 3);
  const eligible = Array.from({ length: 24 }, (_, index) => index === 3);
  let state = missionJourneyStatuses(completed, eligible, false);
  assert.equal(state.currentMission, 4);
  assert.deepEqual(state.statuses.slice(0, 6), ['completed', 'completed', 'completed', 'current', 'locked', 'locked']);
  completed.fill(false); completed.fill(true, 0, 6); eligible.fill(false); eligible[6] = true;
  state = missionJourneyStatuses(completed, eligible, false);
  assert.equal(state.currentMission, 7);
  assert.equal(state.statuses[5], 'completed');
  assert.equal(state.statuses[6], 'current');
  assert.equal(state.statuses[23], 'locked');
  completed.fill(true);
  state = missionJourneyStatuses(completed, eligible, false);
  assert.equal(state.currentMission, 0);
  assert.ok(state.statuses.every(status => status === 'completed'));
});

test('locked missions show details while only their Play action stays disabled', () => {
  assert.doesNotMatch(view, /button\.disabled = this\.cityLocked \|\| status === 'locked'/);
  assert.doesNotMatch(styles, /\.mission-journey-node\.is-locked[^\n]*pointer-events: none/);
  assert.match(view, /this\.detail\.querySelector<HTMLElement>\('\[data-mission-objective\]'\)!\.textContent = card\.description/);
  assert.match(view, /if \(playButton\.disabled\) return/);
  assert.match(view, /play\.disabled = locked/);
  assert.match(view, /play\.hidden = false/);
  assert.match(view, /completed \? 'REPLAY MISSION/);
  assert.match(bootstrap, /missionJourney\.selectedMissionNumber/);
  assert.match(bootstrap, /\/api\/journey\/dallas\/\$\{mission\}\/launch/);
});

test('locked Dallas remains viewable while its missions cannot launch', () => {
  const locked = missionJourneyStatuses(Array(24).fill(false), Array(24).fill(false), false);
  assert.ok(locked.statuses.every(status => status === 'locked'));
  assert.match(bootstrap, /cta: unlocked \?[^\n]+: 'LOCKED', locked: !unlocked, disabled: !unlocked && cityJourneyMode !== 'missions'/);
  assert.match(bootstrap, /missionJourney\.setCityLocked\(!dallasUnlocked\(\)\)/);
  assert.match(bootstrap, /if \(!dallasUnlocked\(\)\) return;\s+cityJourneyMode = 'missions'/);
  assert.match(view, /const locked = this\.cityLocked \|\|/);
});

test('mission selection supports pointer, keyboard and compact landscape layout', () => {
  assert.match(view, /button\.addEventListener\('click', \(\) => this\.select\(stage\.number, true, true\)\)/);
  assert.match(view, /button\.addEventListener\('keydown', event => this\.handleNodeKeydown/);
  assert.match(view, /ArrowRight|ArrowDown/);
  assert.match(view, /target\.focus\(\)|next\.focus\(\)/);
  assert.match(view, /this\.renderDetails\(\)/);
  assert.match(view, /this\.suppressTap = this\.dragged/);
  assert.match(view, /this\.revealMission\(next, true\)/);
  assert.match(styles, /touch-action: pan-x/);
  assert.match(styles, /overflow-x: auto/);
  assert.match(styles, /@media \(max-height: 480px\) and \(orientation: landscape\)/);
  assert.match(styles, /overflow: hidden/);
  assert.match(shell, /:is\(\.home-hangar, \.city-selector, \.mission-journey\) \{ background: var\(--menu-background\)/);
  assert.doesNotMatch(view, /mission-journey-pagination|data-chapter-next/);
});

test('all 24 mission details use live titles, rewards and clocks with distinct accurate copy', () => {
  assert.equal(missionJourneyDetails.length, 24);
  assert.equal(new Set(missionJourneyDetails.map(detail => detail.description)).size, 24);
  for (let index = 0; index < 24; index++) {
    const detail = missionJourneyDetails[index];
    const definition = journeyMissions[`journeyDallas${String(index + 1).padStart(2, '0')}`];
    assert.equal(detail.id, missionJourneyStages[index].id);
    assert.equal(detail.title, definition.name);
    assert.equal(detail.rewardCredits, definition.firstClearCredits);
    const limit = index === 20 ? definition.transferMs : definition.timeLimitMs;
    assert.equal(detail.timeLimit, limit === undefined ? 'NO LIMIT'
      : `${Math.floor(limit / 60_000)}:${String(Math.floor(limit / 1000) % 60).padStart(2, '0')}`);
    assert.ok(detail.title && detail.description && detail.rewardCredits > 0);
    assert.ok(detail.description.split(/\s+/).length <= 13, `Mission ${index + 1} copy is too long`);
    assert.match(detail.timeLimit, /^(?:\d+:\d{2}|NO LIMIT)$/);
  }
  assert.match(missionJourneyDetails[7].description, /behind the transport for 15 seconds/);
  assert.match(missionJourneyDetails[11].description, /guards, both turrets, then the exposed core/);
  assert.match(missionJourneyDetails[15].description, /five gates while escaping two Hunters/);
  assert.equal(missionJourneyDetails[15].timeLimit, 'NO LIMIT');
  assert.equal(missionJourneyDetails[19].title, 'SKYLINE SWITCHBACK');
  assert.equal(missionJourneyDetails[23].title, 'LEGENDARY CHAMPIONSHIP');
  assert.doesNotMatch(view, /mission-journey-detail-image|>OBJECTIVE</);
  assert.match(view, /context-action context-action--gold mission-journey-play/);
  assert.match(view, /\/media\/hub\/credits\.avif/);
});
