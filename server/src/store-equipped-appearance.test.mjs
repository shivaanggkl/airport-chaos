import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { storeFeatured, storeAircraft, storeItemState, isStoreItemEquipped, storeEquipAppearanceId } from '../../client/src/store-catalog.ts';

const red = storeFeatured.find(item => item.id === 'fighter');
const gray = storeFeatured.find(item => item.id === 'firehawk-stealth-gray');
const profile = () => ({ selectedAircraft: 'fighter', unlockedAircraft: ['trainer', 'fighter'],
 aircraftEntitlements: [firehawkProduct.entitlement], cosmetics: {
 ownedIds: ['firehawk-inferno', 'firehawk-stealth-gray', 'firehawk-midnight-black'],
 equipped: { 'livery:fighter': 'firehawk-stealth-gray' },
 }});

test('only the active Firehawk appearance is equipped; ownership remains independent', () => {
 const current = profile();
 for (const [appearance, redEquipped, grayEquipped] of [
  ['firehawk-inferno', true, false], ['firehawk-stealth-gray', false, true], ['firehawk-midnight-black', false, false],
 ]) {
  current.cosmetics.equipped['livery:fighter'] = appearance;
  assert.deepEqual([isStoreItemEquipped(red, current), isStoreItemEquipped(gray, current)], [redEquipped, grayEquipped]);
  assert.equal(storeItemState(red, current), redEquipped ? 'EQUIPPED' : 'OWNED');
  assert.equal(storeItemState(gray, current), grayEquipped ? 'EQUIPPED' : 'OWNED');
 }
 current.selectedAircraft = 'trainer';
 assert.equal(isStoreItemEquipped(gray, current), false);
 assert.equal(storeItemState(gray, current), 'OWNED');
 for (const item of storeAircraft.filter(item => item.aircraftType !== 'fighter'))
  assert.equal(storeEquipAppearanceId(item), undefined, 'other aircraft offers preserve the current appearance');
 const store = readFileSync(new URL('../../client/src/game-store.ts', import.meta.url), 'utf8');
 assert.match(store, /const equipped = this.profile \? isStoreItemEquipped\(item, this.profile\) : false/);
});

const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const equipSource = bootstrap.slice(bootstrap.indexOf('async function equipStoreItem('), bootstrap.indexOf('async function startStoreFirehawkTrial('));
function fixture(confirmAppearance = true) {
 const current = profile(), requests = [];
 const context = vm.createContext({ garageProfile: current, storeEquipAppearanceId, isStoreItemEquipped,
  apiUrl: () => new URL('https://example.invalid/api/profile'), garageIdentity: { pilotId: 'pilot', displayName: 'Pilot' },
  apiFetch: async (_url, options) => {
   const payload = JSON.parse(options.body); requests.push(payload);
   if (payload.equipCosmetic && confirmAppearance) current.cosmetics.equipped['livery:fighter'] = payload.equipCosmetic;
   if (payload.equipAircraft) current.selectedAircraft = payload.equipAircraft;
   return { ok: true, json: async () => current };
  },
  applyAuthoritativeHomeProfile() {}, audioManager: { playEffect() {}, playConfirm() {} },
  garage: { updateProfile() {} }, gameStore: { update() {} }, hubAccount: { state: 'account' },
  hapticsManager: { emit() {} }, recordProductIntent() {}, aircraftDisplayName: () => 'FIREHAWK',
 });
 vm.runInContext(ts.transpileModule(equipSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }}).outputText, context);
 return { current, requests, equip: item => context.equipStoreItem(item) };
}
test('equipping either featured Firehawk selects its shown appearance through the existing server API', async () => {
 const { current, requests, equip } = fixture();
 assert.equal((await equip(red)).ok, true);
 assert.equal(current.cosmetics.equipped['livery:fighter'], 'firehawk-inferno');
 assert.deepEqual(requests, [{ equipCosmetic: 'firehawk-inferno' }]);
 assert.equal((await equip(red)).ok, true);
 assert.equal(requests.length, 1, 'already selected appearance makes no repeat request');
 current.selectedAircraft = 'trainer';
 assert.equal((await equip(gray)).ok, true);
 assert.deepEqual(requests.slice(1), [{ equipCosmetic: 'firehawk-stealth-gray' }, { equipAircraft: 'fighter' }]);
 assert.equal(isStoreItemEquipped(gray, current), true);
 assert.equal(isStoreItemEquipped(red, current), false);
});
test('unconfirmed appearance changes do not report a successful equip', async () => {
 const { equip } = fixture(false);
 const result = await equip(red);
 assert.equal(result.ok, false);
 assert.equal(result.message, 'AIRCRAFT CHANGE NOT CONFIRMED');
});
