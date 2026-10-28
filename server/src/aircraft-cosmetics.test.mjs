import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { applyAircraftCosmetics, applyReinforcementEscortPaint } from '../../client/src/aircraft-cosmetics.js';
import { cosmeticCatalog, defaultCosmeticIds, fallbackLiveryIds } from '../../shared/cosmetics.mjs';
import { journeyDallas08, journeyDallas09 } from '../../shared/journey-mission.mjs';

const expected = [
  ['bluejay-classic', 'LEGACY WHITE', 'trainer', 'credits', 750, 75, 0xf4f7fb, 0x3d7be0, 0x7fd8f6],
  ['bluejay-skybolt', 'SKYWAVE BLUE', 'trainer', 'included', 0, 0, 0x5aa9f4, 0x77d8f2, 0xc8d2dc],
  ['bluejay-aurora', 'AURORA ROSE', 'trainer', 'credits', 1_500, 125, 0x9b7bea, 0xf07cb4, 0x67d6c7],
  ['mammoth-sand', 'LEGACY GOLD', 'cargo', 'credits', 13_000, 600, 0xd8b76a, 0xc7ccd2, 0xa9783e],
  ['mammoth-arctic-rescue', 'ARCTIC RESCUE', 'cargo', 'credits', 15_000, 750, 0xd9e1e8, 0xf39a5a, 0x5b7fa3],
  ['mammoth-desert-sand', 'FOREST TITAN', 'cargo', 'credits', 14_000, 650, 0x8fae73, 0xc7b88c, 0x626b73],
  ['nightowl-sky-blue', 'SKY BLUE', 'privateJet', 'credits', 33_000, 1_350, 0xe8f2fa, 0x215eac, 0x14365d],
  ['nightowl-sunset-red', 'SUNSET RED', 'privateJet', 'credits', 33_000, 1_350, 0xe8f2fa, 0xb92832, 0x5c2027],
  ['nightowl-forest-green', 'FOREST GREEN', 'privateJet', 'credits', 33_000, 1_350, 0xe8f2fa, 0x24805c, 0x153e35],
  ['nightowl-premium-gold', 'PREMIUM GOLD', 'privateJet', 'credits', 33_000, 1_350, 0xe8f2fa, 0xb5892f, 0x493a1a],
  ['nightowl-forest', 'LEGACY GREEN', 'privateJet', 'credits', 31_000, 1_300, 0x4f9b71, 0x8fd8b5, 0xc6cfd5],
  ['nightowl-midnight-executive', 'AZURE EXECUTIVE', 'privateJet', 'credits', 32_000, 1_350, 0x5b9fe3, 0x9edcf6, 0xc5cdd6],
  ['nightowl-royal-violet', 'ROYAL VIOLET', 'privateJet', 'credits', 33_000, 1_450, 0x8f73d9, 0xa8b0ba, 0xd6b86a],
  ['firehawk-inferno', 'FIREHAWK INFERNO', 'fighter', 'tokens', 0, 2_400, 0xe8eced, 0xd52030, 0xbfcbd0],
];

test('catalog contains four purchasable Nightowl airliner paints and retained legacy entitlements', () => {
  assert.deepEqual(cosmeticCatalog.map(item => [
    item.id, item.displayName, item.aircraftRestriction, item.unlockType, item.creditPrice, item.skyTokenPrice,
    item.visualConfig.base, item.visualConfig.primary, item.visualConfig.accent,
  ]), expected);
  assert.deepEqual(Object.fromEntries(['trainer', 'cargo', 'privateJet', 'fighter'].map(type => [type, cosmeticCatalog.filter(item => item.aircraftRestriction === type && !item.retired).length])), { trainer: 3, cargo: 3, privateJet: 4, fighter: 1 });
  assert.deepEqual(cosmeticCatalog.filter(item => item.retired).map(item => item.id), ['nightowl-forest', 'nightowl-midnight-executive', 'nightowl-royal-violet']);
  assert.deepEqual(defaultCosmeticIds, ['bluejay-skybolt']);
  assert.deepEqual(fallbackLiveryIds, { trainer: 'bluejay-skybolt', cargo: undefined, privateJet: undefined, fighter: undefined });
});

test('all palettes and premium finishes apply through the shared local, preview, and remote material path', () => {
  for (const [id, , aircraft, , , , base, primary, accent] of expected) {
    const root = new THREE.Group();
    const materialFor = (name) => { const material = new THREE.MeshStandardMaterial({ color: 0 }); material.name = name; return material; };
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(), materialFor('AC_LIVERY_BASE'));
    const primaryMesh = new THREE.Mesh(new THREE.BoxGeometry(), materialFor('AC_LIVERY_PRIMARY'));
    const accentMesh = new THREE.Mesh(new THREE.BoxGeometry(), materialFor('AC_LIVERY_ACCENT'));
    root.add(baseMesh, primaryMesh, accentMesh);
    applyAircraftCosmetics(root, aircraft, { [`livery:${aircraft}`]: id });
    assert.equal(baseMesh.material.color.getHex(), base);
    assert.equal(primaryMesh.material.color.getHex(), primary);
    assert.equal(accentMesh.material.color.getHex(), accent);
    assert.deepEqual([baseMesh.material.roughness, baseMesh.material.metalness], [0.24, 0.16]);
    assert.deepEqual([primaryMesh.material.roughness, primaryMesh.material.metalness], [0.20, 0.28]);
    assert.deepEqual([accentMesh.material.roughness, accentMesh.material.metalness], [0.18, 0.42]);
  }
});

test('Nightowl airliner repaint changes its authored stripe materials without tinting glass', () => {
  const root = new THREE.Group();
  const add = name => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    material.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    root.add(mesh);
    return mesh;
  };
  const primary = add('N2_PAINT_PRIMARY');
  const accent = add('N2_PAINT_ACCENT');
  const glass = add('N2_CABIN_GLASS');
  applyAircraftCosmetics(root, 'privateJet', { 'livery:privateJet': 'nightowl-sunset-red' });
  assert.equal(primary.material.color.getHex(), 0xb92832);
  assert.equal(accent.material.color.getHex(), 0x5c2027);
  assert.equal(glass.material.color.getHex(), 0xffffff);
});

test('unpainted Mammoth and Nightowl render neutral internal finishes instead of locked catalog paints', () => {
  for (const [aircraft, expectedBase] of [['cargo', 0x8d9da9], ['privateJet', 0xb7c6d1]]) {
    const material = new THREE.MeshStandardMaterial({ color: 0 });
    material.name = 'AC_LIVERY_BASE';
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    applyAircraftCosmetics(root, aircraft, {});
    assert.equal(root.material.color.getHex(), expectedBase);
  }
});

test('Rear Guard uses separate blue and purple Bluejay paints without changing remote scale', () => {
  assert.deepEqual(journeyDallas08.escortAircraft, ['trainer', 'trainer']);
  assert.deepEqual(journeyDallas08.escortLiveries, ['bluejay-skybolt', 'bluejay-aurora']);
  journeyDallas08.escortAircraft.forEach((type, index) => {
    const root = new THREE.Group();
    const airframe = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    material.name = 'AC_LIVERY_BASE';
    const body = new THREE.Mesh(new THREE.BoxGeometry(), material);
    airframe.add(body);
    root.add(airframe);
    root.userData.airframeRoot = airframe;
    applyReinforcementEscortPaint(root, type, journeyDallas08.escortScale,
      { [`livery:${type}`]: journeyDallas08.escortLiveries[index] });
    assert.equal(root.scale.x, 1, 'remote position and UI anchors keep their world scale');
    assert.equal(airframe.scale.x, journeyDallas08.escortScale);
    assert.equal(body.material.color.getHex(), cosmeticCatalog.find(item => item.id === journeyDallas08.escortLiveries[index]).visualConfig.base);
  });
});

test('Reinforcements uses four catalog paints per escort without recoloring the player', () => {
  journeyDallas09.escortAircraft.forEach((type, index) => {
    const root = new THREE.Group();
    const airframe = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    material.name = 'AC_LIVERY_BASE';
    const body = new THREE.Mesh(new THREE.BoxGeometry(), material);
    airframe.add(body);
    root.add(airframe);
    root.userData.airframeRoot = airframe;
    applyReinforcementEscortPaint(root, type, journeyDallas09.escortScale,
      { [`livery:${type}`]: journeyDallas09.escortLiveries[index] });
    assert.equal(root.scale.x, 1);
    assert.equal(airframe.scale.x, journeyDallas09.escortScale);
    assert.equal(body.material.color.getHex(), cosmeticCatalog.find(item => item.id === journeyDallas09.escortLiveries[index]).visualConfig.base);
  });
});

test('Garage is aircraft-filtered and multiplayer reuses the same equipped cosmetic payload', () => {
  const garage = readFileSync(new URL('../../client/src/garage.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(garage, /cosmeticCatalog\.filter\(entry => entry\.aircraftRestriction === this\.selected &&[\s\S]*!entry\.retired/);
  assert.match(garage, /UNLOCK \$\{aircraftDefinitions\[this\.selected\]\.callsign\} \+ \$\{lockedAppearance!\.displayName\}/);
  assert.match(garage, /cosmeticUnlockPrice\(lockedAppearance/);
  assert.doesNotMatch(garage, /data-garage-premium hidden><b>REDSPEAR FIGHTER/);
  assert.match(garage, /data-garage-trial-summary>Trial: 5 minutes/);
  assert.match(garage, /aircraftRoles\[this\.selected\]/);
  assert.match(garage, /premium\.hidden = !profileReady \|\| this\.selected !== 'fighter' \|\| owned/);
  assert.match(garage, /buy\.hidden = owned/);
  assert.match(garage, /trialSummary\.hidden = !profileReady \|\| owned/);
  assert.match(garage, /exactHangarFrame && this\.selected === 'fighter' \? 0\.9/);
  assert.match(client, /player\.equippedCosmetics[^\n]*applyEquippedLivery/);
  assert.match(server, /equippedCosmetics: player\.profile\?\.cosmetics\?\.equipped \?\? \{\}/);
  assert.match(server, /type: 'cosmeticChanged'[\s\S]*equipped: result\.profile\.cosmetics\.equipped/);
  assert.match(css, /@media \(max-width:680px\)[\s\S]*\.garage-cosmetic-list/);
  assert.match(css, /\.garage-premium \{ display:grid; gap:6px; margin:0 0 6px; \}/);
});
