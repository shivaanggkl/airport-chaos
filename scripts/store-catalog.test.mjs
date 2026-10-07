import test from 'node:test';
import assert from 'node:assert/strict';
import { storeAircraft, storePaints, storeFeatured, storeItemState } from '../client/src/store-catalog.ts';

const byId = (items, id) => items.find(item => item.id === id);
const newPilot = {
  credits: 0, skyTokens: 0, selectedAircraft: 'trainer', unlockedAircraft: ['trainer'],
  cosmetics: { ownedIds: [], equipped: {} },
};

test('Store catalog uses the approved aircraft and paint prices', () => {
  assert.equal(byId(storeAircraft, 'trainer').creditPrice, undefined);
  assert.deepEqual([byId(storeAircraft, 'cargo').creditPrice, byId(storeAircraft, 'cargo').tokenPrice], [12000, 500]);
  assert.deepEqual([byId(storeAircraft, 'privateJet').creditPrice, byId(storeAircraft, 'privateJet').tokenPrice], [30000, 1200]);
  assert.deepEqual([byId(storeAircraft, 'fighter').creditPrice, byId(storeAircraft, 'fighter').tokenPrice], [undefined, 2400]);
  for (const [id, credits, tokens] of [
    ['mammoth-sand', 1500, 100], ['mammoth-desert-sand', 2500, 200], ['mammoth-arctic-rescue', 4000, 300],
    ['nightowl-forest', 2000, 100], ['nightowl-midnight-executive', 3500, 200], ['nightowl-royal-violet', 5000, 300],
  ]) assert.deepEqual([byId(storePaints, id).creditPrice, byId(storePaints, id).tokenPrice], [credits, tokens]);
  assert.equal(byId(storePaints, 'firehawk-inferno').included, true);
  assert.deepEqual(storeFeatured.map(item => item.id), ['fighter', 'privateJet', 'cargo', 'mammoth-arctic-rescue', 'nightowl-royal-violet']);
});

test('Store ownership states never treat a preview or trial as permanent ownership', () => {
  assert.equal(storeItemState(byId(storePaints, 'mammoth-sand'), newPilot), 'REQUIRES AIRCRAFT');
  assert.equal(storeItemState(byId(storeAircraft, 'fighter'), { ...newPilot, fighterTrial: { status: 'active' } }), 'LOCKED');
  assert.equal(storeItemState(byId(storePaints, 'firehawk-inferno'), { ...newPilot, fighterTrial: { status: 'active' } }), 'REQUIRES AIRCRAFT');
  assert.equal(storeItemState(byId(storePaints, 'mammoth-sand'), { ...newPilot, unlockedAircraft: ['trainer', 'cargo'] }), 'LOCKED');
  assert.equal(storeItemState(byId(storePaints, 'mammoth-sand'), { ...newPilot, unlockedAircraft: ['trainer', 'cargo'], cosmetics: { ownedIds: ['mammoth-sand'], equipped: {} } }), 'OWNED');
});
