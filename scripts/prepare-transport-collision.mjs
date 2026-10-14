// Derive authoritative surfaces from the same exported mesh, not a giant box.
import { readFileSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';
const file = new URL('../client/public/assets/models/enemies/giant-transport-near.glb', import.meta.url);
const bytes = readFileSync(file), n = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + n)), bin = 28 + n;
function accessor(id) {
    const a = json.accessors[id], v = json.bufferViews[a.bufferView], size = { SCALAR: 1, VEC3: 3 }[a.type];
    const read = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[a.componentType], width = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, j) => bytes[read](bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? size * width) + j * width)));
}
const triangles = [];
const gunTriangles = [];
function visit(id, parent, gun = false) {
    const node = json.nodes[id];
    gun = gun || node.name === 'RearGunYaw';
    const matrix = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    matrix.premultiply(parent);
    if (node.mesh !== undefined)
        for (const p of json.meshes[node.mesh].primitives) {
            const verts = accessor(p.attributes.POSITION).map(v => new Vector3(...v).applyMatrix4(matrix).toArray()), indices = accessor(p.indices).flat();
            for (let i = 0; i < indices.length; i += 3)
                (gun && gunTriangles.push(triangles.length), triangles.push(indices.slice(i, i + 3).flatMap(k => verts[k].map(v => Math.round(v * 100000) / 100000))));
        }
    for (const child of node.children ?? [])
        visit(child, matrix, gun);
}
for (const root of json.scenes[json.scene ?? 0].nodes)
    visit(root, new Matrix4());
writeFileSync(new URL('../shared/giant-transport-collision.json', import.meta.url), JSON.stringify({ source: 'giant-transport-near.glb', triangles, gunTriangles }));
console.log({ triangles: triangles.length });
