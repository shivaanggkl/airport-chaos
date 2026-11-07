import assert from 'node:assert/strict';
import test from 'node:test';
import { aircraftDefinitions, aircraftSpeedCapsMph, garageStats } from '../../client/src/aircraft.js';

test('Store and Hangar aircraft speed details match the current flight caps', () => {
  const expected = {
    trainer: { normal: 3600, boost: 4608, speedBars: 3 },
    cargo: { normal: 4200, boost: 5250, speedBars: 3 },
    privateJet: { normal: 5400, boost: 7020, speedBars: 4 },
    fighter: { normal: 6000, boost: 8100, speedBars: 5 },
  };
  for (const type of Object.keys(expected)) {
    const details = expected[type];
    assert.deepEqual(aircraftSpeedCapsMph(aircraftDefinitions[type]), { normal: details.normal, boost: details.boost });
    assert.equal(garageStats(aircraftDefinitions[type]).find(({ label }) => label === 'Speed')?.value, details.speedBars);
  }
});

test('acceleration bars reflect flight thrust after aircraft inertia', () => {
  const rating = (type) => garageStats(aircraftDefinitions[type]).find(({ label }) => label === 'Acceleration').value;
  assert.ok(rating('fighter') > rating('privateJet'));
  assert.ok(rating('trainer') > rating('cargo'));
});
