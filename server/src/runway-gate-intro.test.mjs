import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { JourneyGateSystem } from '../../client/src/journey-gates.ts';
import { MissionOneIntroPath, MISSION_ONE_INTRO_DURATION_MS, MISSION_ONE_INTRO_SWEEP_MS } from '../../client/src/mission-one-intro.ts';
import { MissionTwoIntroPath, MISSION_TWO_INTRO_DURATION_MS, MISSION_TWO_INTRO_SWEEP_MS } from '../../client/src/mission-two-intro.ts';
import { MissionThreeIntroPath, MISSION_THREE_INTRO_DURATION_MS, MISSION_THREE_INTRO_SWEEP_MS } from '../../client/src/mission-three-intro.ts';
import { MissionFourIntroPath, MISSION_FOUR_INTRO_DURATION_MS, MISSION_FOUR_INTRO_SWEEP_MS } from '../../client/src/mission-four-intro.ts';
import { MissionFiveIntroPath, MISSION_FIVE_INTRO_DURATION_MS, MISSION_FIVE_INTRO_SWEEP_MS } from '../../client/src/mission-five-intro.ts';
import { MissionSixIntroPath, MISSION_SIX_INTRO_DURATION_MS, MISSION_SIX_INTRO_SWEEP_MS } from '../../client/src/mission-six-intro.ts';
import { journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06 } from '../../shared/journey-mission.mjs';

for (const [missionNumber, IntroPath, sweepMs, durationMs, gates] of [
  [2, MissionTwoIntroPath, MISSION_TWO_INTRO_SWEEP_MS, MISSION_TWO_INTRO_DURATION_MS, journeyDallas02.gates],
  [3, MissionThreeIntroPath, MISSION_THREE_INTRO_SWEEP_MS, MISSION_THREE_INTRO_DURATION_MS, journeyDallas03.gates],
  [4, MissionFourIntroPath, MISSION_FOUR_INTRO_SWEEP_MS, MISSION_FOUR_INTRO_DURATION_MS, journeyDallas04.gates],
  [5, MissionFiveIntroPath, MISSION_FIVE_INTRO_SWEEP_MS, MISSION_FIVE_INTRO_DURATION_MS, journeyDallas05.gates],
  [6, MissionSixIntroPath, MISSION_SIX_INTRO_SWEEP_MS, MISSION_SIX_INTRO_DURATION_MS, journeyDallas06.gates],
]) test(`Mission ${missionNumber} reuses the Mission 1 runway view and previews every real gate`, () => {
  assert.equal(IntroPath, MissionOneIntroPath);
  assert.equal(sweepMs, MISSION_ONE_INTRO_SWEEP_MS);
  assert.equal(durationMs, MISSION_ONE_INTRO_DURATION_MS);

  const intro = new IntroPath(new THREE.Vector3(0, 0, 0), gates, () => 0);
  const chasePosition = new THREE.Vector3(0, 12, 18);
  const chaseTarget = new THREE.Vector3(0, 3, -30);
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  intro.sample(0, position, target, chasePosition, chaseTarget);
  assert.ok(position.equals(chasePosition));
  assert.ok(target.equals(chaseTarget));
  assert.equal(intro.fov(0, 70), 70);

  const closest = gates.map(() => Infinity);
  for (let time = 3_500; time <= sweepMs; time += 50) {
    intro.sample(time, position, target, chasePosition, chaseTarget);
    const x = position.x + (target.x - position.x) * .325;
    const z = position.z + (target.z - position.z) * .325;
    gates.forEach((gate, index) => {
      closest[index] = Math.min(closest[index], Math.hypot(x - gate.x, z - gate.z));
    });
  }
  assert.ok(closest.every(distance => distance < 1_000), `gate distances: ${closest.join(', ')}`);
  assert.equal(intro.fov(3_500, 70), 63);
});

for (const mission of [journeyDallas04, journeyDallas05, journeyDallas06]) test(`${mission.name} shows all gates during the shared cinematic`, () => {
  const scene = new THREE.Scene();
  const gates = new JourneyGateSystem(scene, () => 0, mission);
  gates.setProgress(0, true);
  gates.setCoursePreview(true);
  assert.equal(scene.children.filter(gate => gate.visible).length, mission.gates.length);
  gates.setCoursePreview(false);
  assert.equal(scene.children.filter(gate => gate.visible).length, mission === journeyDallas04 ? 1 : 2);
  gates.dispose();
});
