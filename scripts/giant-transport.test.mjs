import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
function glb(level) { const b = readFileSync(new URL(`../client/public/assets/models/enemies/giant-transport-${level}.glb`, import.meta.url)); assert.equal(b.readUInt32LE(0), 0x46546c67); assert.equal(b.readUInt32LE(4), 2); assert.equal(b.readUInt32LE(8), b.length); const n = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + n).toString()); }
for (const [level, budget] of [['near', 20000], ['mid', 8000], ['far', 3000]])
    test(`${level}: geometry budget, shared materials, rigid pivots, and sockets`, () => { const j = glb(level); const triangles = j.meshes.flatMap(m => m.primitives).reduce((n, p) => n + j.accessors[p.indices].count / 3, 0); assert.ok(triangles <= budget, `${triangles} > ${budget}`); assert.equal(j.materials.length, 4); assert.equal(j.images.length, 1); const names = j.nodes.map(n => n.name); for (let i = 0; i < 4; i++) {
        assert.equal(names.filter(n => n === `EngineFan_${i}`).length, 1);
        assert.ok(names.includes(`EngineSmoke_${i}`));
        assert.ok(names.includes(`EngineDamage_${i}`));
    } for (const n of ['RearGunYaw', 'RearGunPitch', 'RearGunMuzzle', 'Upgrade_Dorsal', 'Upgrade_Ventral', 'CargoRamp'])
        assert.ok(names.includes(n), n); for (const a of j.accessors.filter(a => a.type === 'VEC3' && a.min && a.max)) {
        assert.ok([...a.min, ...a.max].every(Number.isFinite));
        assert.ok(a.min.every((v, i) => v <= a.max[i]));
    } });
test('preview is isolated from active missions and player aircraft configuration', () => { const main = readFileSync(new URL('../client/src/main.ts', import.meta.url), 'utf8'); assert.match(main, /import\.meta\.env\.DEV && visualQaMode/);
    assert.match(main, /get\('assetqa'\) === 'giant-transport'/);
    assert.match(main, /giantTransportAssetPreview\?\.update\(delta, airplane, !journeyMode, camera\)/); const preview = readFileSync(new URL('../client/src/giant-transport-preview.ts', import.meta.url), 'utf8'); assert.match(preview, /if \(!import\.meta\.env\.DEV\)/); assert.match(preview, /createTimeVisuals/); assert.doesNotMatch(preview, /journeyDallas|weaponDamage|firstClearCredits/); });
test('all exported fan blade faces point toward the forward intake', () => { for (const level of ['near', 'mid', 'far']) {
    const bytes = readFileSync(new URL(`../client/public/assets/models/enemies/giant-transport-${level}.glb`, import.meta.url));
    const length = bytes.readUInt32LE(12), j = JSON.parse(bytes.subarray(20, 20 + length).toString()), bin = 28 + length;
    for (let i = 0; i < 4; i++) {
        const node = j.nodes.find(n => n.name === `FanBlades_${i}`);
        assert.ok(node);
        for (const p of j.meshes[node.mesh].primitives) {
            const a = j.accessors[p.attributes.NORMAL], v = j.bufferViews[a.bufferView];
            for (let k = 0; k < a.count; k++) {
                const z = bytes.readFloatLE(bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + k * (v.byteStride ?? 12) + 8);
                assert.ok(z < -.9, `${level} fan ${i} reversed normal ${z}`);
            }
        }
    }
} });

test('paint and glazing UVs do not interpolate across the radial wrap seam', () => {
 for (const level of ['near', 'mid', 'far']) {
  const bytes=readFileSync(new URL(`../client/public/assets/models/enemies/giant-transport-${level}.glb`,import.meta.url));
  const length=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+length).toString()),bin=28+length;
  for (const mesh of j.meshes) for (const primitive of mesh.primitives) {
   const a=j.accessors[primitive.attributes.TEXCOORD_0],v=j.bufferViews[a.bufferView],indices=j.accessors[primitive.indices],iv=j.bufferViews[indices.bufferView];
   const indexSize=indices.componentType===5123?2:4;
   const index=k=>{const p=bin+(iv.byteOffset??0)+(indices.byteOffset??0)+k*indexSize;return indexSize===2?bytes.readUInt16LE(p):bytes.readUInt32LE(p)};
   const value=k=>bytes.readFloatLE(bin+(v.byteOffset??0)+(a.byteOffset??0)+k*(v.byteStride??8)+4);
   for(let k=0;k<indices.count;k+=3){const values=[value(index(k)),value(index(k+1)),value(index(k+2))];assert.ok(Math.max(...values)-Math.min(...values)<.1,`${level}: ${j.materials[primitive.material].name} mesh ${mesh.name} triangle ${k/3} UV ${values}`);}
  }
 }
});
test('Dallas fixture uses measured center separations and never mutates flight or camera',()=>{
 const fixture=readFileSync(new URL('../client/src/giant-transport-dallas-preview.ts',import.meta.url),'utf8');
 assert.match(fixture,/\[95, 190, 380\]/);assert.match(fixture,/measuredCenterSeparation: transportCenter.distanceTo\(playerCenter\)/);
 assert.doesNotMatch(fixture,/player\.(position|quaternion|rotation)\.(set|copy|add)|camera\.(position|fov)\s*=/);
 assert.match(fixture,/fixed separation, no pursuit\/combat/);
});
