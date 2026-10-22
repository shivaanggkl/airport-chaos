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

test('mission preview and countdown cannot simulate flight or report a preflight crash', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(main, /const journeyPreflightActive = \(\): boolean => journeyMode &&[\s\S]*missionStartCountdownStartedAt !== null/);
  assert.match(main, /function endRun\([\s\S]*?if \(journeyPreflightActive\(\)\) return/);
  assert.match(main, /if \(!crashed && runStarted && !screenplayFlightPaused && !journeyPreflightActive\(\)/);
  assert.match(server, /if \(message\.type === 'journeyCrash'\) \{[\s\S]*?if \(player\.hasRespawnTransform\) failPlayerJourney\(playerId, 'CRASHED'\)/);
});

test('welcome aircraft selection does not respawn and fail a fresh Journey attempt', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const welcome = main.slice(main.indexOf("if (message.type === 'welcome')"), main.indexOf('} else if (!protocolReady'));
  assert.match(welcome, /applyServerProfile\(message\.profile, undefined, message\.selectionRevision, undefined, undefined, false, true\)/);
});

test('a terminal result stops an active intro before it can hand off to flight', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../../client/src/giant-incoming.ts', import.meta.url), 'utf8');
  assert.match(main, /function abortFlightLaunchCinematic\(\)[\s\S]*?flightLaunchState = 'disabled';[\s\S]*?clearFlightLaunchPresentation\(\)/);
  assert.match(main, /if \(message\.attempt\.status === 'COMPLETED' \|\| message\.attempt\.status === 'FAILED' \|\| message\.attempt\.status === 'ABANDONED'\) \{\s*cancelMissionStartCountdown\(\);\s*abortFlightLaunchCinematic\(\)/);
  assert.match(transport, /finish\(kind: 'defeat' \| 'timeout'\)[\s\S]*?this\.arrival\?\.dispose\(\);this\.arrival=undefined;this\.arrivalResolve\?\.\(\)/);
});

test('Journey timers wait for GO after the mission start countdown', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const countdown = main.slice(main.indexOf('function updateMissionStartCountdown()'), main.indexOf('function beginFlightLaunchCinematic()'));
  assert.match(countdown, /if \(remaining > 0\) \{[\s\S]*?return;[\s\S]*?missionStartCountdownStartedAt = null/);
  assert.match(countdown, /runStarted = true;[\s\S]*?type: 'journeyCountdownComplete', attemptId: journeyAttempt\.attemptId[\s\S]*?sendLocalState\(\)/);
  assert.match(server, /message\.type === 'journeyCountdownComplete'[\s\S]*?message\.attemptId === id && \(attempt\?\.status === 'APPROACH' \|\| attempt\?\.status === 'RACING'\)[\s\S]*?journeyCountdownComplete\.add\(id!\)/);
  assert.match(server, /attempt\?\.missionId===journeyDallas09\.id\) && attempt\.status==='APPROACH' && transportReady\.has\(attemptId\) && journeyCountdownComplete\.has\(attemptId\)/);
  assert.match(server, /journeyDallas19\.id && attempt\.status === 'APPROACH' && journeyCountdownComplete\.has\(attemptId\)/);
  assert.match(server, /journeyCountdownComplete\.add\(id!\);[\s\S]*?startRookieRush\(player\.pilotId, id!, now\)[\s\S]*?startTimedGateClock\(player\.pilotId, id!, now\)/);
  assert.match(server, /active && journeyCountdownComplete\.has\(journeyAttemptId\) && \(active\.missionId === journeyDallas01\.id/);
});
