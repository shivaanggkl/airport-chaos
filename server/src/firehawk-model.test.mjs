import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftVisualConfig } from '../../shared/aircraft-visual-rules.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';

const binary = readFileSync(new URL('../../client/public/assets/models/aircraft/fighter.glb', import.meta.url));
const model = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
const primitives = model.meshes.flatMap(mesh => mesh.primitives);
const bounds = primitives.map(primitive => model.accessors[primitive.attributes.POSITION]).reduce((result, accessor) => {
  for (let axis = 0; axis < 3; axis += 1) {
    result.min[axis] = Math.min(result.min[axis], accessor.min[axis]);
    result.max[axis] = Math.max(result.max[axis], accessor.max[axis]);
  }
  return result;
}, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const span = bounds.max[0] - bounds.min[0];
const length = bounds.max[2] - bounds.min[2];
const scale = Math.min(6.8 / span, 8.5 / length);
const centerY = (bounds.min[1] + bounds.max[1]) / 2;
const centerZ = (bounds.min[2] + bounds.max[2]) / 2;

test('Firehawk has a compact single-engine model and unchanged purchase identity', () => {
  const triangles = primitives.reduce((total, primitive) => total +
    (primitive.indices === undefined ? model.accessors[primitive.attributes.POSITION].count : model.accessors[primitive.indices].count) / 3, 0);
  assert.ok(binary.length < 1_500_000);
  assert.ok(triangles < 12_000);
  assert.ok(primitives.length <= 14);
  assert.ok(length / span > 1.45 && length / span < 1.52);
  for (const slot of ['AC_LIVERY_BASE', 'AC_LIVERY_PRIMARY', 'AC_LIVERY_ACCENT', 'AC_FIREHAWK_FIN', 'AC_FIREHAWK_MARK', 'AC_PANEL_LINES', 'AC_INLET_VOID', 'AC_GLASS', 'AC_DARK', 'AC_METAL', 'AC_TIRE']) {
    assert.ok(model.materials.some(material => material.name === slot), `missing ${slot}`);
  }
  const sockets = model.nodes.filter(node => node.name === 'ExhaustSocket_Main');
  assert.equal(sockets.length, 1);
  assert.ok(Math.abs(sockets[0].translation[1] - -0.02) < 0.001);
  assert.ok(Math.abs(sockets[0].translation[2] - 4.18) < 0.001);
  const gear = model.nodes.find(node => node.name === 'FighterLandingGear');
  assert.ok(gear, 'visual landing gear must be grouped for airborne stowage');
  assert.ok(gear.children?.length > 0);
  assert.ok(gear.children.every(index => model.nodes[index].mesh !== undefined));
  const inferno = cosmeticCatalog.find(item => item.id === 'firehawk-inferno');
  assert.equal(inferno.aircraftRestriction, 'fighter');
  assert.equal(inferno.skyTokenPrice, 2_400);
  assert.deepEqual(inferno.visualConfig, { base: 0xb2bec6, primary: 0xd52030, accent: 0x9eacb6 });
});

test('Firehawk muzzle, wheel contacts, and exhaust align with the normalized model', () => {
  const normalizedNoseZ = (bounds.min[2] - centerZ) * scale;
  assert.ok(Math.abs(aircraftMuzzleSockets.fighter.position.z - (normalizedNoseZ - 0.12)) < 0.025);
  assert.ok(Math.abs(aircraftMuzzleSockets.fighter.position.y - (-0.12 - centerY) * scale) < 0.025);
  const contacts = aircraftVisualConfig.fighter.groundContacts;
  for (const contact of contacts) {
    assert.ok(Math.abs(contact.y - (bounds.min[1] - centerY) * scale) < 0.025);
  }
  assert.deepEqual(contacts.map(contact => contact.x), [-0.795, 0.795, 0]);
  assert.ok(Math.abs(contacts[0].z - (0.81 - centerZ) * scale) < 0.025);
  assert.ok(Math.abs(contacts[2].z - (-2.68 - centerZ) * scale) < 0.025);
  const exhaust = aircraftVisualConfig.fighter.effectAnchors[0];
  assert.ok(Math.abs(exhaust.y - (-0.02 - centerY) * scale) < 0.025);
  assert.ok(Math.abs(exhaust.z - (4.18 - centerZ) * scale) < 0.025);
});
