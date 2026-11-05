// Repair non-adjacent limb influences without altering the authored surface, rig or clips.
// Run once against the existing runtime GLB; safe to rerun (idempotent).
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url), file = readFileSync(path), jsonLength = file.readUInt32LE(12), doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString()), binStart = 28 + jsonLength, bin = file.subarray(binStart);
function accessor(id) { const a = doc.accessors[id], v = doc.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType], offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? bytes * n; return { count: a.count, n, get(i, j = 0) { const p = offset + i * stride + j * bytes; return a.componentType === 5126 ? bin.readFloatLE(p) : bytes === 1 ? bin.readUInt8(p) : bytes === 2 ? bin.readUInt16LE(p) : bin.readUInt32LE(p); }, set(i, j, value) { if (a.componentType !== 5126)
        throw Error('Expected float weights'); bin.writeFloatLE(value, offset + i * stride + j * bytes); } }; }
class Heap {
    items = [];
    push(x) { let i = this.items.push(x) - 1; while (i) {
        const p = (i - 1) >> 1;
        if (this.items[p][0] <= x[0])
            break;
        this.items[i] = this.items[p];
        i = p;
    } this.items[i] = x; }
    pop() { const out = this.items[0], last = this.items.pop(); if (this.items.length) {
        let i = 0;
        while (i * 2 + 1 < this.items.length) {
            let c = i * 2 + 1;
            if (c + 1 < this.items.length && this.items[c + 1][0] < this.items[c][0])
                c++;
            if (this.items[c][0] >= last[0])
                break;
            this.items[i] = this.items[c];
            i = c;
        }
        this.items[i] = last;
    } return out; }
}
let changed = 0;
for (const node of doc.nodes.filter(n => n.mesh !== undefined && n.skin !== undefined)) {
    const names = doc.skins[node.skin].joints.map(i => doc.nodes[i].name);
    for (const primitive of doc.meshes[node.mesh].primitives) {
        const p = accessor(primitive.attributes.POSITION), j = accessor(primitive.attributes.JOINTS_0), w = accessor(primitive.attributes.WEIGHTS_0), ix = accessor(primitive.indices), weld = new Map(), vertex = [], points = [], graph = [];
        for (let i = 0; i < p.count; i++) {
            const point = [p.get(i, 0), p.get(i, 1), p.get(i, 2)], key = point.map(v => Math.round(v * 1e6)).join(',');
            let id = weld.get(key);
            if (id === undefined) {
                id = points.length;
                weld.set(key, id);
                points.push(point);
                graph.push(new Map());
            }
            vertex[i] = id;
        }
        for (let i = 0; i < ix.count; i += 3)
            for (let k = 0; k < 3; k++) {
                const a = vertex[ix.get(i + k)], b = vertex[ix.get(i + (k + 1) % 3)];
                if (a === b)
                    continue;
                const d = Math.hypot(...points[a].map((v, k) => v - points[b][k]));
                graph[a].set(b, d);
                graph[b].set(a, d);
            }
        const family = n => /UpperArm|Forearm|Hand/.test(n) ? n.startsWith('Left') ? 'LeftArm' : 'RightArm' : /Thigh|Shin|Foot/.test(n) ? n.startsWith('Left') ? 'LeftLeg' : 'RightLeg' : null;
        const distances = {};
        for (const kind of ['LeftArm', 'RightArm', 'LeftLeg', 'RightLeg']) {
            const dist = new Float64Array(points.length).fill(Infinity), heap = new Heap();
            for (let i = 0; i < p.count; i++) {
                let weight = 0;
                for (let k = 0; k < 4; k++)
                    if (family(names[j.get(i, k)]) === kind)
                        weight += w.get(i, k);
                if (weight > .95 && (kind.endsWith('Arm') ? p.get(i, 1) > .4 && Math.abs(p.get(i, 0)) > .34 : p.get(i, 1) < .12 && Math.abs(p.get(i, 0)) < .30) && dist[vertex[i]] !== 0) {
                    dist[vertex[i]] = 0;
                    heap.push([0, vertex[i]]);
                }
            }
            while (heap.items.length) {
                const [d, a] = heap.pop();
                if (d !== dist[a])
                    continue;
                for (const [b, length] of graph[a])
                    if (d + length < dist[b]) {
                        dist[b] = d + length;
                        heap.push([dist[b], b]);
                    }
            }
            distances[kind] = dist;
        }
        for (let i = 0; i < p.count; i++) {
            const families = new Set();
            for (let k = 0; k < 4; k++)
                if (w.get(i, k) > .001) {
                    const f = family(names[j.get(i, k)]);
                    if (f)
                        families.add(f);
                }
            if (!families.size)
                continue;
            let winner = Object.keys(distances).sort((a, b) => distances[a][vertex[i]] - distances[b][vertex[i]])[0];
            if (!Number.isFinite(distances[winner][vertex[i]])) {
                const [x, y] = points[vertex[i]];
                winner = (x < 0 ? 'Left' : 'Right') + (Math.abs(x) > .33 && y > .14 ? 'Arm' : 'Leg');
            }
            const incompatible = [...families].some(f => f !== winner);
            if (!incompatible)
                continue;
            const side = winner.startsWith('Left') ? 'Left' : 'Right', sign = side === 'Left' ? -1 : 1, arm = winner.endsWith('Arm'), parts = arm ? ['UpperArm', 'Forearm', 'Hand'] : ['Thigh', 'Shin', 'Foot'];
            const anchors = arm ? [[sign * .309923, .620110, .014996], [sign * .379905, .470148, .014996], [sign * .419895, .300190, .119970], [sign * .419895, .2302, .19995]] : [[sign * .159960, .370173, -.029993], [sign * .229943, .200215, .009997], [sign * .229943, .070247, .119970], [sign * .229943, .0303, .24994]];
            const point = points[vertex[i]], raw = parts.map((part, k) => { const a = anchors[k], b = anchors[k + 1], d = b.map((v, k) => v - a[k]), l = d.reduce((n, v) => n + v * v, 0), t = Math.max(0, Math.min(1, d.reduce((n, v, k) => n + (point[k] - a[k]) * v, 0) / l)), length = Math.hypot(...point.map((v, k) => v - a[k] - t * d[k])); return 1 / Math.max(.04, length) ** 3; });
            const total = raw.reduce((a, b) => a + b, 0), values = [...raw.map(v => v / total), 0];
            for (let k = 0; k < 3; k++) {
                const index = names.indexOf(side + parts[k]);
                const a = doc.accessors[primitive.attributes.JOINTS_0], v = doc.bufferViews[a.bufferView], bytes = a.componentType === 5121 ? 1 : 2, offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? bytes * 4) + k * bytes;
                if (bytes === 1)
                    bin.writeUInt8(index, offset);
                else
                    bin.writeUInt16LE(index, offset);
            }
            // All weights below are already normalized.
            const normalization = 1;
            for (let k = 0; k < 4; k++)
                w.set(i, k, values[k] / normalization);
            changed++;
        }
    }
}
writeFileSync(path, file);
console.log(`Repaired ${changed} cross-limb vertices; original surface preserved.`);
// Refit only the repaired limb regions. Every other measured collision region stays intact.
const { monsterGeometry } = await import('../shared/monster-arrival-geometry.mjs');
const geometry = structuredClone(monsterGeometry), primitive = doc.meshes[doc.nodes.find(n => n.name === 'MonsterNear').mesh].primitives[0], p = accessor(primitive.attributes.POSITION), j = accessor(primitive.attributes.JOINTS_0), w = accessor(primitive.attributes.WEIGHTS_0), skin = doc.skins[doc.nodes.find(n => n.name === 'MonsterNear').skin], names = skin.joints.map(i => doc.nodes[i].name), regions = new Map();
const { m19Model } = await import('../shared/m19-titan-model.mjs');
for (let i = 0; i < p.count; i++) {
    let k = 0;
    for (let n = 1; n < 4; n++)
        if (w.get(i, n) > w.get(i, k))
            k = n;
    const name = names[j.get(i, k)];
    if (!/^(Left|Right)(UpperArm|Forearm|Hand|Thigh|Shin|Foot)$/.test(name))
        continue;
    const point = [p.get(i, 0), p.get(i, 1), p.get(i, 2)], side = name.startsWith('Left') ? 'left' : 'right';
    let bucket = 0;
    if (name.endsWith('Forearm')) {
        const a = m19Model.anchors[`elbow-${side}`], b = m19Model.anchors[`hand-${side}`], d = b.map((v, k) => v - a[k]), t = point.reduce((n, v, k) => n + (v - a[k]) * d[k], 0) / d.reduce((n, v) => n + v * v, 0);
        bucket = t < .5 ? 0 : 1;
    }
    const key = name + bucket;
    if (!regions.has(key))
        regions.set(key, []);
    regions.get(key).push(point);
}
geometry.spheres = geometry.spheres.filter(v => !/^(Left|Right)(UpperArm|Forearm|Hand|Thigh|Shin|Foot)\d$/.test(v.part));
for (const [part, points] of regions) {
    if (points.length < 8)
        continue;
    const c = [0, 1, 2].map(k => (Math.min(...points.map(p => p[k])) + Math.max(...points.map(p => p[k]))) / 2), r = [0, 1, 2].map(k => Math.max(.006, ...points.map(p => Math.abs(p[k] - c[k]))) * 1.06), ds = points.map(p => Math.hypot(...p.map((v, k) => v - c[k]))).sort((a, b) => a - b), round = v => Math.round(v * 1e6) / 1e6;
    geometry.spheres.push({ part, x: round(-c[0]), y: round(c[1]), z: round(-c[2]), radius: round(ds[Math.floor((ds.length - 1) * .99)]), radii: { x: round(r[0]), y: round(r[1]), z: round(r[2]) } });
}
geometry.spheres.sort((a, b) => a.part.localeCompare(b.part));
writeFileSync(new URL('../assets/monster-arrival/monster-arrival-geometry.json', import.meta.url), JSON.stringify(geometry, null, 2) + '\n');
writeFileSync(new URL('../shared/monster-arrival-geometry.mjs', import.meta.url), '// Fitted from the repaired bind mesh; scripts/repair-monster-limb-weights.mjs preserves anatomy.\nexport const monsterGeometry = Object.freeze(' + JSON.stringify(geometry) + ');\n');
// Re-bake the original ending clips' ground contact after correcting the skin.
// This is offline authoring: no vertex scans or ground-lift workaround in gameplay.
if (changed) {
    const THREE = await import('three'), { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'), gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
    const mesh = gltf.scene.getObjectByName('MonsterNear'), root = gltf.scene.getObjectByName('Root'), point = new THREE.Vector3(), zero = new THREE.Vector3();
    for (const name of ['Defeat', 'TimeoutAttack']) {
        const clip = gltf.animations.find(a => a.name === name), mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        const animation = doc.animations.find(a => a.name === name), channel = animation.channels.find(c => doc.nodes[c.target.node].name === 'Root' && c.target.path === 'translation'), sampler = animation.samplers[channel.sampler], times = accessor(sampler.input), values = accessor(sampler.output);
        for (let i = 0; i < times.count; i++) {
            mixer.setTime(times.get(i));
            gltf.scene.updateMatrixWorld(true);
            mesh.skeleton.update();
            let lowest = Infinity;
            for (let k = 0; k < mesh.geometry.attributes.position.count; k++) {
                point.fromBufferAttribute(mesh.geometry.attributes.position, k);
                mesh.applyBoneTransform(k, point);
                mesh.localToWorld(point);
                lowest = Math.min(lowest, point.y);
            }
            point.set(0, -lowest + .0007, 0);
            zero.set(0, 0, 0);
            root.parent.worldToLocal(point);
            root.parent.worldToLocal(zero);
            point.sub(zero);
            for (let k = 0; k < 3; k++)
                values.set(i, k, values.get(i, k) + point.getComponent(k));
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(gltf.scene);
    }
    writeFileSync(path, file);
}
