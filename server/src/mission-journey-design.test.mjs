import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chapterNames, missionJourneyStages, missionJourneyStatuses } from '../../client/src/mission-journey-model.js';

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
    assert.ok(stages.every(stage => chapter % 2 === 1 ? stage.x < 50 : stage.x > 50));
    assert.ok(stages.every(stage => chapter <= 2 ? stage.y < 50 : stage.y > 50));
  }
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

test('locked missions stay disabled while completed missions can be replayed', () => {
  assert.match(view, /button\.disabled = this\.cityLocked \|\| status === 'locked'/);
  assert.match(view, /userSelected && this\.stageButtons\[number - 1\]\?\.disabled/);
  assert.match(view, /if \(this\.stageButtons\[this\.selectedStage - 1\]\?\.disabled\) return/);
  assert.match(view, /play\.disabled = locked/);
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
  assert.match(view, /this\.cityLocked \? 'Complete Milwaukee training to unlock Dallas missions\.'/);
});

test('mission selection supports pointer, keyboard and compact landscape layout', () => {
  assert.match(view, /button\.addEventListener\('click', \(\) => this\.select\(stage\.number, true, true\)\)/);
  assert.match(view, /button\.addEventListener\('keydown', event => this\.handleNodeKeydown/);
  assert.match(view, /ArrowRight|ArrowDown/);
  assert.match(view, /target\.focus\(\)|next\.focus\(\)/);
  assert.match(view, /this\.renderDetails\(\)/);
  assert.match(styles, /touch-action: manipulation/);
  assert.match(styles, /@media \(max-height: 480px\) and \(orientation: landscape\)/);
  assert.match(styles, /overflow: hidden/);
  assert.match(shell, /\.mission-journey \{ background: #092348 url\('\/media\/city-journey\/hangar\.jpg'\)/);
  assert.doesNotMatch(view, /mission-journey-pagination|data-chapter-next/);
});
