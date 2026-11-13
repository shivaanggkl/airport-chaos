import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { journeyDallasCapture01 as mission } from '../../shared/journey-mission.mjs';

const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = main.indexOf('function updateTerritoryBorderVisibility(');
const code = ts.transpileModule(main.slice(start, main.indexOf('function updateTerritoryLabels(', start)),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('capture perimeter stays complete from spawn, through entry and inside; whole-boundary fading is bounded and restores other gameplay', () => {
  const target = territoriesForCity('dallas').find(item => item.id === mission.territoryId)!;
  const wall = { visible: false }, camera = { position: { x: mission.airborneSpawn.x, z: mission.airborneSpawn.z } };
  const material = { uniforms: { overview: { value: 0 } } };
  const context = createContext({ THREE, camera, airplane: camera, territoryWallMaterial: material,
    territoryBorders: [{ definition: target, wall }], focusedTerritoryTargetId: () => target.id,
    missionFocus: {}, missionCaptureIntroPath: undefined, flightLaunchState: 'complete', flightLaunchSkipStartedAt: undefined,
    flightLaunchStartedAt: 0, territoryBorderRefreshAt: 0, pulsingTerritory: undefined,
    territoryPulseMesh: { visible: false }, territoryWallsQaDisabled: false, guidedTutorialActive: false, territoryWallCullDistance: 10000 });
  runInContext(code, context);
  let now = 1000;
  const update = () => { context.now = now += 600; runInContext('updateTerritoryBorderVisibility(now)', context); };
  for (const x of [mission.airborneSpawn.x, target.bounds.minX - 15000, target.bounds.minX - 1000, target.center.x, target.bounds.maxX + 15000]) {
    camera.position.x = x; update();
    assert.equal(material.uniforms.overview.value, 1, 'every segment shares full opacity, including distant opposite walls');
    assert.equal(wall.visible, true);
  }
  camera.position.x = target.bounds.minX - 37500; update();
  assert.equal(material.uniforms.overview.value, 0.5); assert.equal(wall.visible, true);
  camera.position.x = target.bounds.minX - 46000; update();
  assert.equal(material.uniforms.overview.value, 0); assert.equal(wall.visible, false);
  camera.position.x = mission.airborneSpawn.x; context.focusedTerritoryTargetId = () => null; context.missionFocus = null; update();
  assert.equal(material.uniforms.overview.value, 0); assert.equal(wall.visible, false, 'unrelated gameplay keeps its existing culling');
  context.focusedTerritoryTargetId = () => target.id; context.missionFocus = {}; context.territoryWallsQaDisabled = true; update();
  assert.equal(wall.visible, false, 'existing explicit visibility controls still apply');
});
