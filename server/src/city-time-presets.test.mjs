import assert from 'node:assert/strict';
import test from 'node:test';
import { getCity, resolveCityTimePreset } from '../../client/src/cities.ts';
import { createTimeVisuals } from '../../client/src/time-visuals.ts';
import { readFileSync } from 'node:fs';
import { DiscoverySystem } from '../../client/src/discoveries.ts';

test('Dallas always resolves to Evening, including old URL, portal and mode preferences', () => {
  const dallas = getCity('dallas');
  assert.ok(dallas);
  assert.deepEqual(dallas.timePresets, ['evening']);
  for (const value of ['day','dusk','night','evening','satellite',null,undefined])
    assert.equal(resolveCityTimePreset(dallas, value), 'evening');
});

test('multiplayer mode defaults pass through city policy before launch and initial rendering', () => {
  const bootstrap=readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  assert.match(bootstrap,/const timePreset = resolveCityTimePreset\(city, modeOverride === 'air-assault'/);
  assert.match(main,/let worldTimeOfDay: CityTimeOfDay = resolveCityTimePreset\(activeCity, airAssaultMode/);
  assert.match(main,/const preset = resolveCityTimePreset\(activeCity!, requestedPreset\)/);
  assert.match(main,/worldTimeOfDay = resolveCityTimePreset\(definition,/);
});

test('Milwaukee remains Day-only even with a Dallas preference or URL value', () => {
  const milwaukee = getCity('milwaukee');
  assert.ok(milwaukee);
  assert.deepEqual(milwaukee.timePresets, ['day']);
  assert.equal(resolveCityTimePreset(milwaukee, 'evening'), 'day');
  assert.equal(resolveCityTimePreset(milwaukee, 'dusk'), 'day');
  assert.equal(resolveCityTimePreset(milwaukee, 'night'), 'day');
  assert.equal(resolveCityTimePreset(milwaukee, 'satellite'), 'day');
});

test('Evening sun is before sunset while Day and Dusk retain their light values', () => {
  const presets = createTimeVisuals(true);
  assert.equal(presets.day.sunIntensity, 3.72);
  assert.equal(presets.dusk.sunIntensity, 1.68);
  assert.equal(presets.evening.sunIntensity, 2.25);
  assert.equal(presets.evening.duskAmount, 0);
  assert.equal(presets.evening.eveningAmount, 1);
  assert.equal('night' in presets, false);
  const [x, y, z] = presets.evening.sunPosition;
  const elevation = Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
  assert.ok(elevation >= 18 && elevation <= 22, `sun elevation ${elevation}`);
  assert.equal(createTimeVisuals(false).day.background, 0x76c9ed);
});

test('Dusk-only discoveries stay unavailable during Evening', () => {
  const discovered = new Set();
  const awarded = [];
  const system = new DiscoverySystem([
    { id: 'dusk-secret', name: 'Dusk Secret', type: 'secret', x: 0, z: 0, radius: 10, minAltitude: 0, maxAltitude: 100, credits: 1, timePreset: 'dusk' },
  ], discovered, { onDiscover: (definition) => awarded.push(definition.id), onSetComplete: () => {} });
  system.update(0.2, { x: 0, z: 0 }, 30, 'evening');
  assert.deepEqual(awarded, []);
  system.update(0.2, { x: 0, z: 0 }, 30, 'dusk');
  assert.deepEqual(awarded, ['dusk-secret']);
});
