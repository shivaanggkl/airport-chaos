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

test('30 slots use the four approved chapter boundaries and preserve curved layout', () => {
  assert.equal(missionJourneyStages.length, 30);
  assert.equal(chapterNames.length, 4);
  assert.deepEqual(chapterNames, ['ROOKIE PILOT','RISING ACE','SKY COMMANDER','DR. BOSS RISING']);
  assert.deepEqual([1,2,3,4].map(chapter => missionJourneyStages.filter(stage => stage.chapter === chapter).length), [9,9,10,2]);
  assert.ok(missionJourneyStages.every((stage,index) => !index || stage.x > missionJourneyStages[index-1].x && stage.y < missionJourneyStages[index-1].y));
  assert.match(view, /missionJourneyStages\[stage.number\]\?\.chapter !== stage.chapter/);
});

test('locked missions show details while only their Play action stays disabled', () => {
  assert.doesNotMatch(view, /button\.disabled = this\.cityLocked \|\| status === 'locked'/);
  assert.doesNotMatch(styles, /\.mission-journey-node\.is-locked[^\n]*pointer-events: none/);
  assert.match(view, /this\.detail\.querySelector<HTMLElement>\('\[data-mission-objective\]'\)!\.textContent = card\.description/);
  assert.match(view, /if \(playButton\.disabled \|\|[^\n]+\) return/);
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

test('all playable details preserve gameplay rewards, clocks and objectives by stable identity', () => {
  assert.equal(missionJourneyDetails.length, 21);
  assert.deepEqual(missionJourneyDetails.map(detail=>detail.id),journeyMissions.journeyMissionOrder);
  for (const detail of missionJourneyDetails) {
    const definition = Object.values(journeyMissions).find(definition => definition?.id === detail.id);
    const slot = journeyMissions.journeyCatalog.find(slot => slot.id === detail.id);
    assert.equal(detail.title, slot.title);
    assert.equal(detail.rewardCredits, definition.firstClearCredits);
    const limit = definition.timeLimitMs;
    assert.equal(detail.timeLimit, `${Math.floor(limit / 60_000)}:${String(Math.floor(limit / 1000) % 60).padStart(2, '0')}`);
    assert.ok(detail.description);
    if (Number(detail.id.slice(-2)) <= 6) assert.equal(detail.description,definition.objective);
  }
});

test('all nine interspersed placeholders remain gray, selectable and unlaunchable even in local QA',()=>{
 const placeholders=missionJourneyStages.filter(s=>s.implementation==='placeholder');
 assert.deepEqual(placeholders.map(s=>s.number),[7,8,12,15,16,20,21,26,27]);
 for(const completed of [Array(30).fill(false),Array(30).fill(true)]){
  const state=missionJourneyStatuses(completed,Array(30).fill(true),false);
  assert(placeholders.every(s=>state.statuses[s.number-1]==='locked'));
 }
 assert.match(view,/play.hidden = false; play.disabled = true; play.textContent = 'COMING SOON'/);
 assert.match(styles,/\.mission-journey-node\.is-placeholder/);
 assert.match(view,/textContent = stage.title/);
 assert.match(view,/implementation === 'playable'/);
 assert.match(view,/segments\[part\]!.getPointAtLength/);
});
