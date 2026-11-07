import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { missionTimePreset } from '../../client/src/mission-time-presets.ts';

test('all 24 Dallas missions use Evening, including their cinematics', () => {
  const expected = Array(24).fill('evening');
  assert.deepEqual(Array.from({length:24},(_,i)=>missionTimePreset(i+1)),expected);
});

test('missions skip the chooser and reapply defaults from the received mission', () => {
  const bootstrap=readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const launch=bootstrap.slice(bootstrap.indexOf('async function playJourneyMission'),bootstrap.indexOf('const PENDING_FLY_STORAGE_KEY'));
  assert.doesNotMatch(launch,/showTimeSelection\(/);
  assert.match(launch,/await enterCity\(dallas, missionTimePreset\(missionNumber\)\)/);
  assert.match(main,/setLocalTimePreset\(missionTimePreset\(missionNumber\)\)/);
  assert.match(bootstrap,/function showTimeSelection\(/,'existing presets and optional time UI implementation remain preserved');
});

test('Sky Duel consistently enters Evening without a time chooser', () => {
  const bootstrap=readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  assert.match(bootstrap,/modeOverride === 'sky-duel' \? 'evening'/);
  assert.match(bootstrap,/enterCity\(city, selectedHomeMultiplayerMode === 'assault' \? 'day' : 'evening', false, selectedHomeMultiplayerMode === 'assault' \? 'air-assault' : 'sky-duel'\)/);
  assert.match(main,/skyDuelMode \? 'evening'/);
});
