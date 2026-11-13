import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MissionCaptureIntroPath } from '../../client/src/mission-capture-intro.js';
import { journeyDallasCapture01 as mission } from '../../shared/journey-mission.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { dallasElevationAt } from './dallas-elevation.js';

const territory = territoriesForCity('dallas').find(item => item.id === mission.territoryId)!;

test('M05 camera lesson uses real Las Colinas, clear capture instructions, and unchanged chase handoff', () => {
  const intro = new MissionCaptureIntroPath(territory, mission.captureDurationMs, dallasElevationAt);
  const chase = new THREE.Vector3(-68150, 1000, -28000), aim = new THREE.Vector3(-67000, 950, -28050);
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  const original = chase.clone();
  for (const elapsed of [0, 2499, 14500, 15000]) {
    intro.sample(elapsed, position, target, chase, aim);
    assert.deepEqual(position, chase); assert.deepEqual(target, aim);
    assert.equal(intro.fov(elapsed, 67), 67);
  }
  for (let elapsed = 2500; elapsed < 14500; elapsed += 100) {
    intro.sample(elapsed, position, target, chase, aim);
    assert.ok(position.toArray().every(Number.isFinite));
    assert.ok(position.y - dallasElevationAt(position.x, position.z) > 4000);
    assert.ok(target.x > territory.bounds.minX && target.x < territory.bounds.maxX);
    assert.ok(position.distanceTo(target) > 1000);
    assert.ok(intro.wipe(elapsed) >= 0 && intro.wipe(elapsed) <= 1);
  }
  assert.deepEqual(chase, original, 'preview never changes authoritative spawn or chase');
  assert.match(intro.text(0), /CAPTURE 1 TERRITORY/);
  assert.match(intro.text(4000), /inside.*marked boundary/);
  assert.match(intro.text(8000), /Keep flying inside for 24 seconds/);
  assert.match(intro.text(12000), /capture bar.*time runs out/);
  for (const elapsed of [0, 10999, 14500, 15000]) assert.equal(intro.showsCaptureBar(elapsed), false);
  for (const elapsed of [11000, 12000, 14499]) assert.equal(intro.showsCaptureBar(elapsed), true);
  assert.equal(intro.wipe(2500), 1); assert.equal(intro.wipe(14500), 1);
});

test('M05 uses shared intro lifecycle, skip, retry and countdown protections without Golden Gates aircraft previews', () => {
  const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /flightLaunchWelcomeHandled = false;\s+flightLaunchState = 'pending';\s+airborneIntroAwaiting = true/);
  assert.match(source, /missionCaptureIntroPath = new MissionCaptureIntroPath\(territory, journeyDallasCapture01.captureDurationMs, getTerrainHeight\)/);
  assert.match(source, /missionSixIntroPath \?\? missionCaptureIntroPath \?\? missionCombatIntroPath/);
  const reset = source.slice(source.indexOf('function clearFlightLaunchPresentation'), source.indexOf('function completeFlightLaunchCinematic'));
  assert.match(reset, /missionCaptureIntroPath = undefined/);
  assert.match(reset, /classList.remove\('golden-gates-intro', 'capture-intro-bar'\)/);
  assert.match(source, /classList.toggle\('capture-intro-bar', Boolean\(missionCaptureIntroPath && !skipped && missionCaptureIntroPath.showsCaptureBar\(elapsed\)\)\)/);
  const styles = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(styles, /#game-root.launch-cinematic-active.capture-intro-bar > #sky-challenge.journey-hud\s*\{\s*opacity: 1 !important;/);
  const network = source.slice(source.indexOf('function sendLocalState('), source.indexOf('function sendLocalState(') + 1200);
  assert.match(network, /missionStartCountdownPending/); assert.match(network, /missionCaptureIntroPath/);
  assert.match(source, /missionCaptureIntroPath \|\| missionCombatIntroPath\) && matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

 test('M05 overview frames all four real boundaries on wide and narrow viewports throughout its orbit', () => {
  const intro = new MissionCaptureIntroPath(territory, mission.captureDurationMs, dallasElevationAt);
  const { minX, maxX, minZ, maxZ } = territory.bounds;
  const position = new THREE.Vector3(), target = new THREE.Vector3();
  for (const aspect of [0.5, 0.75, 1, 16 / 9, 2.4]) {
    const camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 300000);
    for (const elapsed of [2500, 7000, 11000, 14000]) {
      intro.sample(elapsed, position, target, position, target, aspect);
      camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld();
      for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const height of [0, 914.4]) {
        const projected = new THREE.Vector3(x, dallasElevationAt(x, z) + height, z).project(camera);
        assert.ok(Math.abs(projected.x) < 0.85 && Math.abs(projected.y) < 0.85,
          `boundary must fit with title/safe-area margin at aspect ${aspect}, time ${elapsed}`);
        assert.ok(projected.z > -1 && projected.z < 1);
      }
    }
  }
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /mix\(1.0 - smoothstep\(fadeStart, fadeEnd, vDistance\), 1.0, overview\)/);
  assert.match(main, /fullBoundaryOpacity > 0 && focusedTerritory \|\| distanceSquared/);
  assert.match(main, /territoryWallMaterial.uniforms.overview.value = 0/);
});
