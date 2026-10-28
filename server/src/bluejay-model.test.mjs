import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftVisualConfig } from '../../shared/aircraft-visual-rules.mjs';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';

const binary = readFileSync(new URL('../../client/public/assets/models/aircraft/trainer.glb', import.meta.url));
const jsonLength = binary.readUInt32LE(12);
const model = JSON.parse(binary.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryStart = 20 + jsonLength + 8;

function positions(accessorIndex) {
  const accessor = model.accessors[accessorIndex];
  const view = model.bufferViews[accessor.bufferView];
  const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  return Array.from({ length: accessor.count }, (_, index) => [0, 4, 8].map(component =>
    binary.readFloatLE(offset + index * stride + component)));
}

test('baked Bluejay remains a compact shared airframe with paint slots and two propeller blades', () => {
  const primitives = model.meshes.flatMap(mesh => mesh.primitives);
  const triangles = primitives.reduce((total, primitive) => total +
    (primitive.indices === undefined
      ? model.accessors[primitive.attributes.POSITION].count
      : model.accessors[primitive.indices].count) / 3, 0);
  assert.ok(binary.length < 500_000, `Bluejay GLB grew to ${binary.length} bytes`);
  assert.ok(triangles < 8_000, `Bluejay grew to ${triangles} triangles`);
  assert.ok(primitives.length <= 8, `Bluejay uses ${primitives.length} draw calls`);
  for (const slot of ['AC_LIVERY_BASE', 'AC_LIVERY_PRIMARY', 'AC_LIVERY_ACCENT', 'AC_GLASS']) {
    assert.ok(model.materials.some(material => material.name === slot), `missing ${slot}`);
  }
  const pivot = model.nodes.find(node => node.name === 'Propeller_Main');
  const blades = model.nodes.find(node => node.name === 'Propeller_Main_Blades');
  assert.ok(pivot && blades && pivot.children?.includes(model.nodes.indexOf(blades)));
  const bladePositions = positions(model.meshes[blades.mesh].primitives[0].attributes.POSITION);
  assert.ok(Math.max(...bladePositions.map(vertex => Math.abs(vertex[0]))) < 0.14,
    'a horizontal pair of blades would restore the old four-blade cross');
  assert.ok(Math.min(...bladePositions.map(vertex => vertex[1])) < -0.8);
  assert.ok(Math.max(...bladePositions.map(vertex => vertex[1])) > 0.8);
});

test('Bluejay tire, nose and aft-effect anchors match its normalized baked geometry', () => {
  const bounds = model.meshes.flatMap(mesh => mesh.primitives.map(primitive =>
    model.accessors[primitive.attributes.POSITION])).reduce((result, accessor) => {
    for (let axis = 0; axis < 3; axis += 1) {
      result.min[axis] = Math.min(result.min[axis], accessor.min[axis]);
      result.max[axis] = Math.max(result.max[axis], accessor.max[axis]);
    }
    return result;
  }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const scale = Math.min(8.4 / (bounds.max[0] - bounds.min[0]),
    6.6 / (bounds.max[2] - bounds.min[2]));
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const contacts = aircraftVisualConfig.trainer.groundContacts;
  for (const contact of contacts) {
    assert.ok(Math.abs(contact.y - (bounds.min[1] - centerY) * scale) < 0.025,
      `tire contact at ${contact.y} misses rendered wheel bottoms`);
  }
  assert.deepEqual(contacts.map(contact => contact.x), [-0.96, 0.96, 0]);
  assert.ok(contacts[2].z < -2, 'nosewheel must be under the new forward cowling');
  const nose = (bounds.min[2] - centerZ) * scale;
  assert.ok(aircraftMuzzleSockets.trainer.position.z < nose - 0.08,
    'muzzle must remain in front of the visible spinner');
  assert.ok(Math.abs(aircraftVisualConfig.trainer.effectAnchors[0].z -
    (bounds.max[2] - centerZ) * scale) < 0.1,
  'boost effect must remain at the actual aft fuselage');
});
