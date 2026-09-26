import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { applyAircraftCosmetics } from '../../client/src/aircraft-cosmetics.js';
import { cosmeticCatalog, defaultCosmeticIds, fallbackLiveryIds } from '../../shared/cosmetics.mjs';

const expected = [
  ['bluejay-classic', 'LEGACY WHITE', 'trainer', 'free', 0, 0xf4f7fb, 0x3d7be0, 0x7fd8f6],
  ['bluejay-skybolt', 'SKYWAVE BLUE', 'trainer', 'free', 0, 0x5aa9f4, 0x77d8f2, 0xc8d2dc],
  ['bluejay-aurora', 'AURORA ROSE', 'trainer', 'free', 0, 0x9b7bea, 0xf07cb4, 0x67d6c7],
  ['mammoth-sand', 'LEGACY GOLD', 'cargo', 'free', 0, 0xd8b76a, 0xc7ccd2, 0xa9783e],
  ['mammoth-arctic-rescue', 'ARCTIC RESCUE', 'cargo', 'credits', 4_000, 0xd9e1e8, 0xf39a5a, 0x5b7fa3],
  ['mammoth-desert-sand', 'FOREST TITAN', 'cargo', 'credits', 2_500, 0x8fae73, 0xc7b88c, 0x626b73],
  ['nightowl-forest', 'LEGACY GREEN', 'privateJet', 'free', 0, 0x4f9b71, 0x8fd8b5, 0xc6cfd5],
  ['nightowl-midnight-executive', 'AZURE EXECUTIVE', 'privateJet', 'credits', 3_500, 0x5b9fe3, 0x9edcf6, 0xc5cdd6],
  ['nightowl-royal-violet', 'ROYAL VIOLET', 'privateJet', 'credits', 5_000, 0x8f73d9, 0xa8b0ba, 0xd6b86a],
  ['firehawk-inferno', 'FIREHAWK INFERNO', 'fighter', 'included', 0, 0xd73a46, 0x4a5158, 0xd4af37],
];

test('final catalog contains exactly the ten approved aircraft cosmetics', () => {
  assert.deepEqual(cosmeticCatalog.map(item => [
    item.id, item.displayName, item.aircraftRestriction, item.unlockType, item.creditPrice,
    item.visualConfig.base, item.visualConfig.primary, item.visualConfig.accent,
  ]), expected);
  assert.deepEqual(Object.fromEntries(['trainer', 'cargo', 'privateJet', 'fighter'].map(type => [type, cosmeticCatalog.filter(item => item.aircraftRestriction === type).length])), { trainer: 3, cargo: 3, privateJet: 3, fighter: 1 });
  assert.deepEqual(defaultCosmeticIds, ['bluejay-classic', 'bluejay-skybolt', 'bluejay-aurora', 'mammoth-sand', 'nightowl-forest']);
  assert.deepEqual(fallbackLiveryIds, { trainer: 'bluejay-skybolt', cargo: 'mammoth-sand', privateJet: 'nightowl-forest', fighter: 'firehawk-inferno' });
});

test('all ten palettes and premium finishes apply through the shared local, preview, and remote material path', () => {
  for (const [id, , aircraft, , , base, primary, accent] of expected) {
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

test('Garage is aircraft-filtered and multiplayer reuses the same equipped cosmetic payload', () => {
  const garage = readFileSync(new URL('../../client/src/garage.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(garage, /cosmeticCatalog\.filter\(entry => entry\.aircraftRestriction === this\.selected\)/);
  assert.match(garage, /INCLUDED WITH FIREHAWK/);
  assert.match(garage, /UNLOCK — \$\{item\.creditPrice\.toLocaleString\(\)\} CREDITS/);
  assert.doesNotMatch(garage, /data-garage-premium hidden><b>REDSPEAR FIGHTER/);
  assert.match(garage, /data-garage-trial-summary>Trial: 5 minutes/);
  assert.match(garage, /Fastest and most agile combat aircraft in Airport Chaos\./);
  assert.match(garage, /premium\.hidden = this\.selected !== 'fighter' \|\| owned/);
  assert.match(garage, /this\.selected === 'fighter' \? 0\.9 : 1/);
  assert.match(client, /player\.equippedCosmetics[^\n]*applyEquippedLivery/);
  assert.match(server, /equippedCosmetics: player\.profile\?\.cosmetics\?\.equipped \?\? \{\}/);
  assert.match(server, /type: 'cosmeticChanged'[\s\S]*equipped: result\.profile\.cosmetics\.equipped/);
  assert.match(css, /@media \(max-width: 680px\)[^\n]*\.garage-cosmetic-list/);
  assert.match(css, /\.garage-premium \{ display:grid; gap:7px; margin:8px 0 0; \}/);
});
