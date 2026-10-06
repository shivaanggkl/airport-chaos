import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCombatSuppressPlacement,
  resolveAdPlacementPresentation,
  type AdPlacementPresentationSpec,
} from '../../shared/ad-placement-rules.mjs';

test('combat HUD suppression never hides the complete sponsor blimp', () => {
  assert.equal(canCombatSuppressPlacement('SPONSOR_BLIMP'), false);
  assert.equal(canCombatSuppressPlacement('SKYBOARD'), true);
  assert.equal(canCombatSuppressPlacement('HIGHWAY_BILLBOARD'), true);
});

function placement(type: AdPlacementPresentationSpec['type']): AdPlacementPresentationSpec {
  return {
    type,
    position: { x: 10, y: 400, z: 30 },
    size: { x: 100, y: 40, z: 3 },
  };
}

test('airborne ads double altitude and visible size exactly once at placement resolution', () => {
  const skyboardSpec = placement('SKYBOARD');
  const skyboard = resolveAdPlacementPresentation(skyboardSpec);
  const skyGate = resolveAdPlacementPresentation(placement('SKY_GATE'));
  const blimp = resolveAdPlacementPresentation(placement('SPONSOR_BLIMP'));

  assert.deepEqual(skyboard.position, { x: 10, y: 800, z: 30 });
  assert.deepEqual(skyboard.size, { x: 200, y: 80, z: 3 });
  assert.deepEqual(skyGate.position, { x: 10, y: 800, z: 30 });
  assert.deepEqual(skyGate.size, { x: 200, y: 80, z: 3 });
  assert.deepEqual(blimp.position, { x: 10, y: 800, z: 30 });
  assert.deepEqual(blimp.size, { x: 200, y: 80, z: 6 });

  assert.deepEqual(skyboardSpec.position, { x: 10, y: 400, z: 30 });
  assert.deepEqual(skyboardSpec.size, { x: 100, y: 40, z: 3 });
  assert.deepEqual(resolveAdPlacementPresentation(skyboardSpec).position, skyboard.position);
  assert.deepEqual(resolveAdPlacementPresentation(skyboardSpec).size, skyboard.size);
});

test('non-airborne advertising placement remains unchanged', () => {
  const billboardSpec = placement('HIGHWAY_BILLBOARD');
  const billboard = resolveAdPlacementPresentation(billboardSpec);

  assert.deepEqual(billboard.position, billboardSpec.position);
  assert.deepEqual(billboard.size, billboardSpec.size);
});
