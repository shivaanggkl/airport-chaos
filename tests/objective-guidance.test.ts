import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { journeyDallas01 } from '../shared/journey-mission.mjs';
import { ObjectiveApproachHint, ObjectiveGuidance, confirmedGateObjective, formatObjectiveDistance, projectMissionObjective } from '../client/src/objective-guidance';

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
    guidance.setObjective(null);
    assert.equal(marker.hidden, true);
    assert.equal(arrow.hidden, true);
    guidance.dispose();
    assert.equal(root.children[0].removed, true);
  } finally {
    Object.assign(globalThis, { document: originalDocument, innerWidth: originalWidth, innerHeight: originalHeight });
  }
});
