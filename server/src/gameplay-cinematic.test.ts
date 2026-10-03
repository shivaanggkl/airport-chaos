import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  GAMEPLAY_CINEMATIC_PRIORITY,
  PERFECT_LANDING_DURATION_MS,
  REGION_ENTRY_DURATION_MS,
  TAKEOFF_CINEMATIC_DURATION_MS,
  cinematicProgress,
  isPerfectLandingGrade,
  regionCinematicPresentation,
} from '../../shared/gameplay-cinematic-rules.mjs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('gameplay cinematic timing and priority are bounded and deterministic', () => {
  assert.deepEqual(GAMEPLAY_CINEMATIC_PRIORITY, {
    TAKEOFF: 1, REGION_ENTRY: 2, MISSION_COMPLETE: 3, PERFECT_LANDING: 4,
  });
  assert.equal(TAKEOFF_CINEMATIC_DURATION_MS, 700);
  assert.equal(REGION_ENTRY_DURATION_MS, 1_350);
  assert.equal(PERFECT_LANDING_DURATION_MS, 1_200);
  assert.equal(cinematicProgress(350, TAKEOFF_CINEMATIC_DURATION_MS), 0.5);
  assert.equal(cinematicProgress(2_000, PERFECT_LANDING_DURATION_MS), 1);
});

test('region presentations are configured per city and perfect tiers are explicit', () => {
  assert.deepEqual(regionCinematicPresentation('dallas', 'Metroplex'), {
    title: 'DOWNTOWN DALLAS', subtitle: 'URBAN FLIGHT ZONE',
  });
  assert.equal(regionCinematicPresentation('milwaukee', 'Lake Coast')?.title, 'LAKE COAST');
  assert.equal(regionCinematicPresentation('dallas', 'unknown'), undefined);
  assert.equal(isPerfectLandingGrade('PERFECT'), true);
  assert.equal(isPerfectLandingGrade('LEGENDARY'), true);
  assert.equal(isPerfectLandingGrade('SMOOTH'), false);
});

test('client uses one director and server owns presentation-trigger facts', () => {
  const main = read('client/src/main.ts');
  const director = read('client/src/cinematic-director.ts');
  const server = read('server/src/index.ts');
  const styles = read('client/src/style.css');
  assert.match(main, /new CinematicDirector/);
  assert.match(main, /message\.type === 'takeoffConfirmed'/);
  assert.match(main, /message\.type === 'missionCompleted'[\s\S]*requestMissionComplete/);
  assert.match(main, /message\.type === 'landingScored'[\s\S]*requestPerfectLanding/);
  assert.match(main, /lockingThreatIds\.size > 0[\s\S]*flightLaunchState === 'pending'/);
  assert.match(main, /kind !== 'PERFECT_LANDING'\) return;[\s\S]*clearHeldActions/);
  assert.match(main, /cinematicFrame\?\.kind === 'TAKEOFF'[\s\S]*defaultChaseDistance \* 0\.1/);
  assert.match(main, /cinematicFrame\?\.kind === 'PERFECT_LANDING'[\s\S]*cameraFrameSize/);
  assert.match(main, /visibilitychange[\s\S]*cinematicDirector\.clearPresentation/);
  assert.match(main, /airport-chaos-city-exit[\s\S]*cinematicDirector\.dispose/);
  assert.match(director, /GAMEPLAY_CINEMATIC_PRIORITY/);
  assert.match(director, /isSkippable\(\)/);
  assert.match(director, /seenRegions\.has/);
  assert.match(server, /type: 'takeoffConfirmed'/);
  assert.match(server, /type: 'landingScored'[\s\S]*credits: landingCredits/);
  assert.match(styles, /gameplay-cinematic-banner[\s\S]*env\(safe-area-inset-top\)/);
  assert.match(styles, /max-width: 900px[\s\S]*orientation: landscape/);
  assert.doesNotMatch(director, /new AudioContext|new WebGLRenderer/);
});
