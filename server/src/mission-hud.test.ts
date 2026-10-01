import assert from 'node:assert/strict';
import test from 'node:test';
import { cityMissionCatalog, type CityMission } from '../../shared/city-missions.mjs';
import { missionHudObjective, missionHudProgress } from '../../shared/mission-hud.mjs';

const missions = Object.values(cityMissionCatalog).flat();
const mission = (id: string) => missions.find((item) => item.id === id && item.cityId === 'dallas')!;

test('every current mission gets a concise useful HUD objective', () => {
  for (const definition of missions) {
    const objective = missionHudObjective(definition);
    assert.ok(objective.length > 8, `${definition.id} objective is not useful`);
    assert.ok(objective.length <= 72, `${definition.id} objective is too long: ${objective}`);
    assert.doesNotMatch(objective, /\n/);
  }
  assert.equal(missionHudObjective(mission('first-flight')), 'Stay airborne for 60 seconds');
  assert.equal(missionHudObjective(mission('first-landing')), 'Land at METRO CENTRAL AIRPORT');
  assert.equal(missionHudObjective(mission('three-territory-offensive')), 'Own South Metro, Canal District, and Central District together');
  assert.equal(missionHudObjective(mission('dallas-grand-tour')), 'Complete all 11 tour steps');
});

test('timers, counts, territories, kills, checkpoints, landing quality, distance, and tour steps expose real progress', () => {
  const cases: Array<[string, number, number, RegExp]> = [
    ['first-flight', 23, 60, /23 \/ 60 sec/],
    ['straight-run', 12_400, 24_000, /12\.4 \/ 24 km/],
    ['airport-tour', 2, 4, /2 \/ 4 landings/],
    ['speed-course', 2, 4, /2 \/ 4 gates/],
    ['south-metro-capture', 83, 300, /1:23 \/ 5:00/],
    ['airport-control', 2, 4, /2 \/ 4 territories/],
    ['vip-escort', 2, 4, /2 \/ 4 checkpoints/],
    ['golden-sky-run', 4, 6, /4 \/ 6 gates/],
    ['most-wanted', 3, 5, /3 \/ 5 Danger/],
    ['precision-landing', 620, 780, /620 \/ 780 points/],
    ['central-air-supremacy', 2, 3, /2 \/ 3 kills/],
    ['number-one-pilot', 83, 300, /1:23 \/ 5:00/],
    ['dallas-grand-tour', 4, 11, /4 \/ 11 steps/],
  ];
  for (const [id, value, target, expected] of cases) {
    const result = missionHudProgress(mission(id), { text: 'verbose gameplay guidance', value, target });
    assert.match(result.text, expected, id);
    assert.equal(result.barValue, value, id);
    assert.equal(result.barMax, target, id);
  }
});

test('binary missions show IN PROGRESS without a fake progress bar', () => {
  for (const id of ['first-landing', 'first-hunter', 'human-rival', 'ace-intercept']) {
    const result = missionHudProgress(mission(id), { text: 'dynamic guidance', value: 0, target: 1 });
    assert.deepEqual(result, { text: 'IN PROGRESS', barValue: undefined, barMax: undefined }, id);
  }
});

test('territory sequence remains supported even when absent from the current live catalog', () => {
  const definition = { ...mission('airport-control'), type: 'territorySequence' } as CityMission;
  const result = missionHudProgress(definition, { text: '', value: 2, target: 4 });
  assert.deepEqual(result, { text: '2 / 4 territories', barValue: 2, barMax: 4 });
});
