import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { journeyDallas01, journeyDallas03, journeyDallas05 } from '../shared/journey-mission.mjs';
import { ObjectiveApproachHint, ObjectiveGuidance, confirmedGateObjective, confirmedHunterObjective, formatObjectiveDistance, lowAltitudeGateInstruction, precisionGateBearing, precisionGateGuidance, projectMissionObjective, territoryGuidance } from '../client/src/objective-guidance';

function camera(): THREE.PerspectiveCamera {
  const result = new THREE.PerspectiveCamera(60, 844 / 390, 2, 10_000);
  result.position.set(0, 0, 0);
  result.lookAt(0, 0, -1);
  result.updateMatrixWorld(true);
  return result;
}

test('the active camera points at a visible gate, off-screen sides, and a target behind', () => {
  const view = camera();
  const front = projectMissionObjective(view, new THREE.Vector3(0, 0, -500), 40, 844, 390);
  assert.equal(front.kind, 'marker');
  assert.ok(front.x > 390 && front.x < 455);
  const right = projectMissionObjective(view, new THREE.Vector3(1000, 0, -500), 40, 844, 390);
  assert.equal(right.kind, 'arrow');
  assert.ok(right.x > 700 && Math.abs(right.angle) < .5);
  const left = projectMissionObjective(view, new THREE.Vector3(-1000, 0, -500), 40, 844, 390);
  assert.equal(left.kind, 'arrow');
  assert.ok(left.x < 145 && Math.abs(left.angle) > 2.5);
  const behind = projectMissionObjective(view, new THREE.Vector3(0, 0, 500), 40, 844, 390);
  assert.equal(behind.kind, 'arrow');
  assert.ok(Number.isFinite(behind.x) && Number.isFinite(behind.y));
  assert.ok(behind.y > 280);
  const above = projectMissionObjective(view, new THREE.Vector3(0, 1000, -500), 40, 844, 390);
  assert.equal(above.kind, 'arrow');
  assert.ok(above.y < 160 && above.angle < 0);
  const below = projectMissionObjective(view, new THREE.Vector3(0, -1000, -500), 40, 844, 390);
  assert.equal(below.kind, 'arrow');
  assert.ok(below.y > 280 && below.angle > 0);
  view.lookAt(1, 0, 0);
  view.updateMatrixWorld(true);
  const rotated = projectMissionObjective(view, new THREE.Vector3(500, 0, 0), 40, 844, 390);
  assert.equal(rotated.kind, 'marker');
});

test('projection avoids a HUD obstacle and remains valid with camera zoom', () => {
  const view = camera();
  const gate = new THREE.Vector3(0, 0, -500);
  const blocked = projectMissionObjective(view, gate, 40, 844, 390, [{ left: 340, top: 125, right: 510, bottom: 230 }]);
  assert.equal(blocked.kind, 'arrow');
  assert.ok(Number.isFinite(blocked.x) && Number.isFinite(blocked.y));
  view.zoom = 2;
  view.updateProjectionMatrix();
  const zoomed = projectMissionObjective(view, new THREE.Vector3(1000, 0, -500), 40, 844, 390);
  assert.equal(zoomed.kind, 'arrow');
  assert.ok(zoomed.x >= 0 && zoomed.x <= 844);
});

test('mobile edge guidance avoids the mission box, radar, joystick and fire zones', () => {
  const view = camera();
  const obstacles = [
    { left: 8, top: 70, right: 268, bottom: 205 },
    { left: 710, top: 50, right: 836, bottom: 205 },
    { left: 90, top: 250, right: 275, bottom: 390 },
    { left: 610, top: 250, right: 805, bottom: 390 },
  ];
  const arrow = projectMissionObjective(view, new THREE.Vector3(-1000, 0, -500), 40, 844, 390, obstacles);
  assert.equal(arrow.kind, 'arrow');
  for (const rect of obstacles) assert.equal(
    arrow.x + 99 > rect.left - 7 && arrow.x - 99 < rect.right + 7 &&
    arrow.y + 23 > rect.top - 7 && arrow.y - 23 < rect.bottom + 7, false,
  );
  const resized = projectMissionObjective(view, new THREE.Vector3(1000, 0, -500), 40, 1280, 720);
  assert.ok(resized.x > arrow.x);
  const withNotch = projectMissionObjective(view, new THREE.Vector3(-1000, 0, -500), 40, 844, 390,
    [], { left: 59, right: 0, top: 0, bottom: 0 });
  assert.ok(withNotch.x - 99 >= 59);
});

test('only confirmed active attempts select the next gate and retry selects Gate 1', () => {
  const from = (gateIndex: number, status = 'RACING', attemptId = 'first') =>
    confirmedGateObjective({ attemptId, gateIndex, status }, journeyDallas01.gates, () => 10);
  const first = from(0, 'APPROACH');
  assert.ok(first);
  assert.equal(first?.label, 'GATE 1');
  assert.equal(first.position.x, journeyDallas01.gates[0].x);
  assert.equal(first.position.y, journeyDallas01.gates[0].altitude + 10);
  assert.equal(from(0)?.id, first.id); // visual proximity cannot advance it
  for (let index = 1; index < 4; index++) assert.equal(from(index)?.label, `GATE ${index + 1}`);
  assert.equal(from(4, 'COMPLETED'), null);
  assert.equal(from(1, 'FAILED'), null);
  assert.equal(from(2, 'ABANDONED'), null);
  assert.equal(from(5), null);
  assert.equal(from(0, 'APPROACH', 'retry')?.label, 'GATE 1');
  assert.notEqual(from(0, 'APPROACH', 'retry')?.id, first.id);
  assert.equal(formatObjectiveDistance(1_250), '1.3 KM');
  assert.equal(formatObjectiveDistance(200), '200 M');
});

test('White Rock guidance uses shared confirmed gate definitions and resets on retry', () => {
  const from = (gateIndex: number, status = 'RACING', attemptId = 'white-rock') =>
    confirmedGateObjective({ attemptId, gateIndex, status }, journeyDallas03.gates, () => 24);
  assert.equal(from(0, 'APPROACH')?.label, 'GATE 1');
  for (let index = 0; index < 4; index++) {
    const objective = from(index);
    assert.equal(objective?.position.x, journeyDallas03.gates[index].x);
    assert.equal(objective?.position.y, journeyDallas03.gates[index].altitude + 24);
    assert.equal(objective?.radius, journeyDallas03.gates[index].radius);
  }
  assert.equal(from(3)?.label, 'GATE 4');
  assert.equal(from(4, 'COMPLETED'), null);
  assert.equal(from(0, 'APPROACH', 'retry')?.label, 'GATE 1');
  assert.notEqual(from(0, 'APPROACH', 'retry')?.id, from(0, 'APPROACH')?.id);
});

test('White Rock instructions respond to distance and AGL without advancing a gate', () => {
  const instruction = (distance: number, altitudeAgl: number, rejected = false) =>
    lowAltitudeGateInstruction(3, false, distance, altitudeAgl, 290, rejected, false);
  assert.equal(lowAltitudeGateInstruction(1, true, 8_000, 0, 290, false, false), 'TAKE OFF — FOLLOW THE GOLD ARROW');
  assert.equal(instruction(2_000, 350), 'FOLLOW THE ARROW TO GATE 3');
  assert.equal(instruction(850, 315), 'GATE 3 BELOW — DESCEND');
  assert.equal(instruction(180, 295), 'TOO HIGH — DESCEND');
  assert.equal(instruction(300, 295, true), 'TOO HIGH — DESCEND');
  assert.equal(instruction(300, 285, true), 'FOLLOW THE ARROW TO GATE 3');
  assert.equal(instruction(180, 285), 'FLY THROUGH GATE 3');
  assert.equal(lowAltitudeGateInstruction(3, false, 500, 285, 290, false, true), 'GATE 2 CLEARED!');
});

test('Downtown objectives follow only accepted precision gates and reset for a new attempt', () => {
  const from = (gateIndex: number, status = 'RACING', attemptId = 'downtown') =>
    confirmedGateObjective({ attemptId, gateIndex, status }, journeyDallas05.gates, () => 17);
  assert.equal(from(0, 'APPROACH')?.label, 'GATE 1');
  for (let index = 0; index < 4; index++) {
    assert.equal(from(index)?.position.x, journeyDallas05.gates[index].x);
    assert.equal(from(index)?.position.y, journeyDallas05.gates[index].altitude + 17);
    assert.equal(from(index)?.radius, journeyDallas05.gates[index].radius);
  }
  assert.equal(from(2)?.label, 'GATE 3');
  assert.equal(from(3)?.label, 'GATE 4');
  assert.equal(from(4, 'COMPLETED'), null);
  assert.equal(from(3, 'FAILED'), null);
  assert.notEqual(from(0, 'APPROACH', 'retry')?.id, from(0, 'APPROACH')?.id);
});

test('Downtown guidance gives altitude, alignment, and stable actual-heading Gate 4 turns', () => {
  assert.ok(precisionGateBearing(0, 0, 0, 100, -100).angle > 0); // target right of northbound aircraft
  assert.ok(precisionGateBearing(0, 0, 0, -100, -100).angle < 0);
  assert.ok(Math.abs(precisionGateBearing(0, 0, Math.PI / 2, 100, -100).angle) > Math.PI / 2);
  assert.equal(precisionGateBearing(0, 0, 0, 0, -100).horizontalDistance, 100);
  const cue = (gate: number, distance: number, horizontal: number, height: number, bearing: number,
    previous: 'LEFT' | 'RIGHT' | null = null, cleared = false, announce = false) =>
    precisionGateGuidance(gate, false, distance, horizontal, height, 40, bearing, previous, cleared, announce);
  assert.equal(precisionGateGuidance(1, true, 8000, 8000, 100, 40, 0, null, false, false).instruction,
    'TAKE OFF — FOLLOW THE GOLD ARROW');
  assert.equal(cue(2, 3000, 3000, 100, 0).instruction, 'FOLLOW THE ARROW TO GATE 2');
  assert.equal(cue(2, 500, 500, 30, 0).instruction, 'GATE 2 ABOVE — CLIMB');
  assert.equal(cue(2, 500, 500, -30, 0).instruction, 'GATE 2 BELOW — DESCEND');
  assert.equal(cue(2, 120, 100, 0, 0).instruction, 'FLY THROUGH GATE 2');
  assert.equal(cue(2, 120, 100, 0, Math.PI / 2).instruction, 'FOLLOW THE ARROW TO GATE 2');
  assert.equal(cue(4, 600, 600, 0, Math.PI / 2, null, false, true).instruction, 'SHARP TURN AHEAD');
  const right = cue(4, 600, 600, 0, Math.PI / 2);
  const left = cue(4, 600, 600, 0, -Math.PI / 2);
  assert.equal(right.instruction, 'GATE 4 — TURN RIGHT');
  assert.equal(left.instruction, 'GATE 4 — TURN LEFT');
  assert.equal(cue(4, 500, 500, 0, .8, right.turnSide).turnSide, 'RIGHT');
  assert.equal(cue(4, 500, 500, 0, -Math.PI + .01, right.turnSide).turnSide, 'RIGHT');
  assert.equal(cue(4, 500, 500, 0, -Math.PI / 2, right.turnSide).turnSide, 'LEFT');
  assert.equal(cue(4, 500, 500, 0, .4, right.turnSide).turnSide, null);
  assert.equal(cue(4, 600, 600, 0, Math.PI / 2, null, true).instruction, 'GATE 3 CLEARED!');
});

test('territory guidance selects the real capture, defender, contest, hold and return objectives', () => {
  const state = (grounded: boolean, inside: boolean, owned: boolean, contested: boolean,
    capture: number, defenderId?: string, visible = false, hadControl = false) =>
    territoryGuidance(grounded, inside, owned, contested, capture, defenderId, visible, hadControl);
  assert.deepEqual(state(true, false, false, false, 0),
    { phase: 'NAVIGATE', instruction: 'TAKE OFF — FOLLOW THE GOLD ARROW', target: 'territory' });
  assert.deepEqual(state(false, false, false, false, 0),
    { phase: 'NAVIGATE', instruction: 'FLY INTO THE HIGHLIGHTED AREA', target: 'territory' });
  assert.equal(state(false, true, false, false, 65).instruction, 'STAY INSIDE TO CAPTURE');
  assert.deepEqual(state(false, true, false, false, 95, 'defender-a', true),
    { phase: 'BLOCKED', instruction: 'DEFEAT THE MARKED DEFENDER', target: 'defender' });
  assert.deepEqual(state(false, true, false, false, 95, 'defender-a', false),
    { phase: 'BLOCKED', instruction: 'DEFENDER ACTIVE — LOCATING TARGET', target: null });
  assert.deepEqual(state(false, true, false, false, 95),
    { phase: 'BLOCKED', instruction: 'CAPTURE BLOCKED — DEFENSE ACTIVE', target: null });
  assert.deepEqual(state(false, true, true, false, 0),
    { phase: 'DEFENDING', instruction: 'HOLD THE AREA FOR 30 SECONDS', target: null });
  assert.deepEqual(state(false, true, true, true, 0),
    { phase: 'CONTESTED', instruction: 'TERRITORY CONTESTED — DEFEND IT', target: null });
  assert.deepEqual(state(false, false, true, false, 0, undefined, false, true),
    { phase: 'RETURN', instruction: 'RETURN TO WHITE ROCK', target: 'territory' });
  assert.deepEqual(state(false, false, false, false, 0, undefined, false, true),
    { phase: 'RECAPTURE', instruction: 'RECAPTURE WHITE ROCK', target: 'territory' });
  assert.deepEqual(state(false, true, false, false, 0, undefined, false, true),
    { phase: 'RECAPTURE', instruction: 'RECAPTURE WHITE ROCK', target: 'territory' });
});

test('Hunter guidance follows only the live assigned bot and clears on replacement or completion', () => {
  const position = new THREE.Vector3(500, 220, -700);
  const attempt = { attemptId: 'mission-2-attempt', targetId: 'hunter-a', status: 'RACING' };
  const hunter = { id: 'hunter-a', position, isBot: true, lifeState: 'alive' };
  const objective = confirmedHunterObjective(attempt, hunter);
  assert.equal(objective?.label, 'HUNTER');
  assert.equal(objective?.position, position);
  assert.equal(confirmedHunterObjective(attempt, { ...hunter, id: 'hunter-b' }), null);
  assert.equal(confirmedHunterObjective(attempt, { ...hunter, isBot: false }), null);
  assert.equal(confirmedHunterObjective(attempt, { ...hunter, lifeState: 'destroyed' }), null);
  assert.equal(confirmedHunterObjective({ ...attempt, targetId: 'hunter-b' }, hunter), null);
  assert.equal(confirmedHunterObjective({ ...attempt, status: 'COMPLETED' }, hunter), null);
  assert.equal(confirmedHunterObjective({ ...attempt, status: 'FAILED' }, hunter), null);
  assert.notEqual(confirmedHunterObjective({ ...attempt, targetId: 'hunter-b' }, { ...hunter, id: 'hunter-b' })?.id, objective?.id);
});

test('lost hint waits until airborne, appears once, and clears on approach', () => {
  const hint = new ObjectiveApproachHint();
  assert.equal(hint.update('gate-1', 1200, false, true, 0), false);
  assert.equal(hint.update('gate-1', 1200, false, true, 30_000), false);
  assert.equal(hint.update('gate-1', 1200, true, true, 30_100), false);
  assert.equal(hint.update('gate-1', 1200, true, true, 50_200), true);
  assert.equal(hint.update('gate-1', 1150, true, true, 50_300), false);
  assert.equal(hint.update('gate-1', 1150, true, true, 90_000), false);
  assert.equal(hint.update('gate-2', 800, true, false, 90_100), false);
  assert.equal(hint.update('gate-2', 800, true, true, 110_200), true);
  hint.reset();
  assert.equal(hint.update('gate-1', 1200, true, true, 110_300), false);
});

test('guidance shows one marker or arrow and removes both after completion or exit', () => {
  class Element {
    className = '';
    hidden = false;
    textContent = '';
    style: Record<string, string> = {};
    children: Element[] = [];
    removed = false;
    setAttribute(): void {}
    append(...children: Element[]): void { this.children.push(...children); }
    remove(): void { this.removed = true; }
    getClientRects(): unknown[] { return []; }
  }
  const originalDocument = globalThis.document;
  const originalWidth = globalThis.innerWidth;
  const originalHeight = globalThis.innerHeight;
  try {
    Object.assign(globalThis, {
      document: { createElement: () => new Element(), querySelector: () => null },
      innerWidth: 844, innerHeight: 390,
    });
    const root = new Element();
    const guidance = new ObjectiveGuidance(root as unknown as HTMLElement);
    const gate = confirmedGateObjective({ attemptId: 'server', gateIndex: 0, status: 'APPROACH' },
      journeyDallas01.gates, () => 0)!;
    const view = camera();
    view.position.copy(gate.position).add(new THREE.Vector3(0, 0, 650));
    view.lookAt(gate.position);
    view.updateMatrixWorld(true);
    guidance.setObjective(gate);
    guidance.update(view, new THREE.Vector3(gate.position.x, gate.position.y, gate.position.z + 650), 1, false, true, 0);
    const [marker, arrow] = root.children[0].children;
    assert.equal(marker.hidden, false);
    assert.equal(arrow.hidden, true);
    assert.equal(guidance.distanceMeters, 650);
    const next = confirmedGateObjective({ attemptId: 'server', gateIndex: 1, status: 'RACING' },
      journeyDallas01.gates, () => 0)!;
    guidance.setObjective(next);
    guidance.update(view, gate.position, 1, true, true, 200);
    assert.match(marker.textContent, /GATE 2/);
    assert.match(arrow.children[1].textContent, /GATE 2/);
    const retry = confirmedGateObjective({ attemptId: 'retry', gateIndex: 0, status: 'APPROACH' },
      journeyDallas01.gates, () => 0)!;
    guidance.setObjective(retry);
    guidance.update(view, gate.position, 1, false, true, 400);
    assert.match(marker.textContent, /GATE 1/);
    const hunterPosition = new THREE.Vector3(1000, 0, -500);
    guidance.setObjective(confirmedHunterObjective({ attemptId: 'hunter-attempt', targetId: 'hunter', status: 'RACING' },
      { id: 'hunter', position: hunterPosition, isBot: true, lifeState: 'alive' }));
    view.position.set(0, 0, 0);
    view.lookAt(0, 0, -1);
    view.updateMatrixWorld(true);
    guidance.update(view, new THREE.Vector3(), 1, true, true, 600);
    assert.equal(arrow.hidden, false);
    assert.match(arrow.children[1].textContent, /HUNTER/);
    hunterPosition.set(0, 0, -400);
    guidance.update(view, new THREE.Vector3(), 1, true, true, 800);
    assert.equal(marker.hidden, false);
    assert.equal(guidance.distanceMeters, 400);
    guidance.setObjective(null);
    assert.equal(marker.hidden, true);
    assert.equal(arrow.hidden, true);
    guidance.dispose();
    assert.equal(root.children[0].removed, true);
  } finally {
    Object.assign(globalThis, { document: originalDocument, innerWidth: originalWidth, innerHeight: originalHeight });
  }
});
