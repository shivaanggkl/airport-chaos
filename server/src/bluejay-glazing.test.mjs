import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const source = readFileSync(new URL('../../client/scripts/generate-airport-chaos-aircraft.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('aircraft.mjs', source, ts.ScriptTarget.Latest, true);
const glazing = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'scoutBodyMaterials');
const context = vm.createContext({ THREE });
vm.runInContext(glazing.getText(tree), context);

function area(geometry) {
  const p = geometry.getAttribute('position'); let total = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const cross = b.sub(a).cross(c.sub(a));
    assert.ok(cross.z > 0, 'partition must preserve winding and reject degenerate faces');
    total += cross.length() / 2;
  }
  return total;
}

test('flush glazing partitions the skin without overlapping paint, holes or raised panes', () => {
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute([-2.04, 0, 0, 1.55, 0, 0, 1.55, 1, 0, -2.04, 1, 0], 3));
  skin.setIndex([0, 1, 2, 0, 2, 3]); skin.computeVertexNormals();
  const { base, glass, primary } = context.scoutBodyMaterials(skin, [[-2.04, 0], [1.55, 0], [1.55, 1], [-2.04, 1]]);
  assert.ok(area(glass) > .5);
  assert.ok(Math.abs(area(base) + area(glass) + area(primary) - 3.59) < 1e-6, 'paint and glass must cover exactly the original skin');
  for (const geometry of [base, glass, primary]) {
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      assert.equal(p.getZ(i), 0, 'glazing must stay on the original face');
      assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(n, i).length() - 1) < 1e-6);
    }
  }
});

test('generated Bluejay keeps its original bounds, animation nodes and cosmetic material slots', () => {
  const data = readFileSync(new URL('../../client/public/assets/models/aircraft/trainer.glb', import.meta.url));
  assert.equal(data.toString('utf8', 0, 4), 'glTF');
  const jsonLength = data.readUInt32LE(12), json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  assert.equal(json.nodes.length, 10);
  assert.equal(json.meshes.length, 8);
  assert.ok(json.nodes.some(node => node.name === 'Propeller_Main'));
  assert.ok(json.materials.some(material => material.name === 'AC_GLASS'));
  assert.ok(json.materials.some(material => material.name === 'AC_LIVERY_BASE'));
  const start = 20 + jsonLength + 8;
  const bounds = new THREE.Box3();
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION], view = json.bufferViews[accessor.bufferView];
    for (let i = 0; i < accessor.count; i++) {
      const offset = start + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 12;
      const p = new THREE.Vector3(data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8));
      assert.ok([p.x, p.y, p.z].every(Number.isFinite)); bounds.expandByPoint(p);
    }
  }
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 8.4) < .01); assert.ok(Math.abs(size.y - 2.42) < .02); assert.ok(Math.abs(size.z - 6.5) < .01);
});

test('windshield and door glass follow one narrow A-pillar up to the wing, with a separate lower sill', () => {
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute([-2.04, 0, 0, 1.55, 0, 0, 1.55, 1, 0, -2.04, 1, 0], 3));
  skin.setIndex([0, 1, 2, 0, 2, 3]); skin.computeVertexNormals();
  const { glass } = context.scoutBodyMaterials(skin, [[-2.04, 0], [1.55, 0], [1.55, 1], [-2.04, 1]]);
  const positions = glass.getAttribute('position');
  const glazed = (z, height) => {
    const point = new THREE.Vector3(z, height, 0);
    for (let i = 0; i < positions.count; i += 3) {
      const triangle = new THREE.Triangle(...[0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, i + j)));
      if (triangle.containsPoint(point)) return true;
    }
    return false;
  };
  for (const height of [.5, .65, .8]) {
    const doorEdge = -1.74 + (height - .49) / (.82 - .49) * .64;
    assert.equal(glazed(doorEdge - .07, height), true, 'windshield must reach the shared pillar');
    assert.equal(glazed(doorEdge - .03, height), false, 'retain the narrow painted pillar');
    assert.equal(glazed(doorEdge + .02, height), true, 'door glass must meet the same pillar');
  }
  assert.equal(glazed(-.85, .99), true, 'windshield must continue up beneath the wing');
  assert.equal(glazed(-1.99, .98), false, 'leave a painted sill ahead of the windshield');
  assert.equal(glazed(-1.85, .5), false, 'do not extend glass down the cowling');
});

test('cowling and both side stripes form flush paint with an uninterrupted white separator', () => {
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute([.6, -.4, -2.92, .6, -.4, 2.8, .6, .6, 2.8, .6, .6, -2.92], 3));
  skin.setIndex([0, 2, 1, 0, 3, 2]); skin.computeVertexNormals();
  const { base, primary } = context.scoutBodyMaterials(skin, [[-2.92,-1],[2.8,-1],[2.8,-1],[-2.92,-1]]);
  const painted = (z, y) => {
    const p = primary.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const t = new THREE.Triangle(...[0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(p, i+j)));
      if (t.containsPoint(new THREE.Vector3(.6,y,z))) return true;
    }
    return false;
  };
  for (const [z,y] of [[-2.5,.3],[-1.9,.03],[-.5,.04],[-.5,-.10]]) assert.equal(painted(z,y), true);
  for (const [z,y] of [[-1.5,-.06],[-.5,-.05],[0,-.02]]) assert.equal(painted(z,y), false, 'white separator must remain clear');
  let totalArea = 0;
  for (const geometry of [base,primary]) {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p,i), b = new THREE.Vector3().fromBufferAttribute(p,i+1), c = new THREE.Vector3().fromBufferAttribute(p,i+2);
      for (const v of [a,b,c]) assert.ok(Math.abs(v.x-.6)<1e-6, 'paint must not protrude above the skin');
      totalArea += b.sub(a).cross(c.sub(a)).length()/2;
    }
  }
  assert.ok(Math.abs(totalArea-5.72)<1e-5, 'paint partition must introduce no gaps or overlaps');
});
