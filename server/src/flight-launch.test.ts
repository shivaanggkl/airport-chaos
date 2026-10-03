import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  FLIGHT_LAUNCH_DURATION_MS,
  FLIGHT_LAUNCH_HUD_FADE_MS,
  FLIGHT_LAUNCH_MIN_SKIP_MS,
  FLIGHT_LAUNCH_SWEEP_MS,
  flightLaunchProgress,
} from '../../shared/flight-launch-rules.mjs';

test('flight launch timing preserves sweep, protected skip window, HUD fade, and handoff', () => {
  assert.equal(FLIGHT_LAUNCH_DURATION_MS, 2_800);
  assert.equal(FLIGHT_LAUNCH_SWEEP_MS, 1_500);
  assert.equal(FLIGHT_LAUNCH_HUD_FADE_MS, 500);
  assert.equal(FLIGHT_LAUNCH_MIN_SKIP_MS, 500);
  assert.deepEqual(flightLaunchProgress(0), { canSkip: false, sweep: 0, handoff: 0, hudOpacity: 0, complete: false });
  assert.equal(flightLaunchProgress(499).canSkip, false);
  assert.equal(flightLaunchProgress(500).canSkip, true);
  assert.equal(flightLaunchProgress(1_500).sweep, 1);
  assert.equal(flightLaunchProgress(2_299).hudOpacity, 0);
  assert.ok(flightLaunchProgress(2_550).hudOpacity > 0);
  assert.equal(flightLaunchProgress(2_800).hudOpacity, 1);
  assert.equal(flightLaunchProgress(2_800).complete, true);
});

test('normal launch is client-presentational, aircraft-sized, input-gated, and excluded from training', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(main, /!trainingRequested && !message\.tutorialMode/);
  assert.match(main, /cameraFrameSize/);
  assert.match(main, /defaultChaseDistance/);
  assert.match(main, /launchCinematicBlocksInput\(\)/);
  assert.match(main, /clearHeldActions\(\);[\s\S]*mobileInput\.reset\(\)/);
  assert.match(main, /registerUiBackLayer\(\{[\s\S]*flight-launch-cinematic/);
  assert.doesNotMatch(main, /airplane\.position\.(?:lerp|add).*launch/i);
  assert.match(css, /launch-cinematic-active/);
  assert.match(css, /--launch-hud-opacity/);
});
