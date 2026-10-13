import assert from 'node:assert/strict';
import test from 'node:test';
import { launchModeFromUrl } from '../../client/src/launch-mode.ts';

test('explicit launch mode wins over a stale Journey attempt', () => {
  assert.equal(launchModeFromUrl('?launchMode=free-fly&journeyAttempt=stale'), 'free-fly');
  assert.equal(launchModeFromUrl('?launchMode=missions'), 'missions');
});

test('legacy Journey links keep mission mode', () => {
  assert.equal(launchModeFromUrl('?journeyAttempt=existing'), 'missions');
  assert.equal(launchModeFromUrl('?city=milwaukee'), 'free-fly');
});
