/** Preserve the supplied rig/mesh/clips; remove root drift and add only a texture-derived emissive mask. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readTitanAnimationAsset, TitanAnimationSampler } from '../shared/titan-animation.mjs';
const root = new URL('../', import.meta.url), source = process.argv[2] ?? '/Users/shiva/Downloads/ashen-warlord-m19.glb', original = fs.readFileSync(source), jsonLength = original.readUInt32LE(12), json = JSON.parse(original.subarray(20, 20 + jsonLength)), bin = Buffer.from(original.subarray(28 + jsonLength));
const hips = json.nodes.findIndex(n => n.name === 'mixamorig:Hips'), base = json.nodes[hips], baseYaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...base.rotation), 'YXZ').y;
function values(i) { const a = json.accessors[i], b = json.bufferViews[a.bufferView]; return new Float32Array(bin.buffer, bin.byteOffset + (b.byteOffset ?? 0) + (a.byteOffset ?? 0), a.count * (a.type === 'VEC3' ? 3 : 4)); }
for (const a of json.animations)
    for (const s of a.samplers)
        if (s.interpolation === 'STEP')
            s.interpolation = 'LINEAR';
for (const a of json.animations)
    for (const c of a.channels.filter(c => c.target.node === hips)) {
        const array = values(a.samplers[c.sampler].output);
        if (c.target.path === 'translation')
            for (let i = 0; i < array.length; i += 3) {
                array[i] = base.translation[0];
                array[i + 2] = base.translation[2];
            }
        if (c.target.path === 'rotation')
            for (let i = 0; i < array.length; i += 4) {
                const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(array, i), 'YXZ');
                e.y = baseYaw;
                new THREE.Quaternion().setFromEuler(e).toArray(array, i);
            }
    }
const mask = fs.readFileSync(new URL('assets/ashen-warlord/emissive.png', root)), pad = Buffer.alloc((4 - bin.length % 4) % 4), start = bin.length + pad.length, content = Buffer.concat([bin, pad, mask]);
json.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: mask.length });
json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: 'image/png', name: 'Ashen red-only emissive' });
json.textures.push({ source: json.images.length - 1 });
json.materials[0].emissiveTexture = { index: json.textures.length - 1 };
json.materials[0].emissiveFactor = [.5, .5, .5];
json.buffers[0].byteLength = content.length;
function pack() { let j = Buffer.from(JSON.stringify(json)); j = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 32)]); const b = Buffer.concat([content, Buffer.alloc((4 - content.length % 4) % 4)]), out = Buffer.alloc(28 + j.length + b.length); out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(j.length, 12); out.writeUInt32LE(0x4e4f534a, 16); j.copy(out, 20); out.writeUInt32LE(b.length, 20 + j.length); out.writeUInt32LE(0x004e4942, 24 + j.length); b.copy(out, 28 + j.length); return out; }
const bytes = pack();
fs.writeFileSync(new URL('client/public/assets/models/monsters/ashen-warlord.glb', root), bytes);
const loader = new GLTFLoader();
loader.register(() => ({ name: 'OFFLINE_TEXTURE_SKIP', loadTexture: async () => new THREE.Texture() }));
const g = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
g.scene.updateMatrixWorld(true);
let mesh;
g.scene.traverse(o => { if (o.isSkinnedMesh)
    mesh = o; });
const asset = readTitanAnimationAsset(bytes), sampler = new TitanAnimationSampler(asset), position = mesh.geometry.attributes.position, joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight, uv = mesh.geometry.attributes.uv;
const boneNames = { body: 'Spine', neck: 'Neck', head: 'Head', 'hand-left': 'LeftHand', 'hand-right': 'RightHand', 'elbow-left': 'LeftForeArm', 'elbow-right': 'RightForeArm', 'shoulder-left': 'LeftArm', 'shoulder-right': 'RightArm', 'hip-left': 'LeftUpLeg', 'hip-right': 'RightUpLeg', 'knee-left': 'LeftLeg', 'knee-right': 'RightLeg', 'foot-left': 'LeftFoot', 'foot-right': 'RightFoot' };
const nodeFor = name => asset.nodes.findIndex(n => n.name === `mixamorig:${name}`);
const boneNodes = Object.fromEntries(Object.entries(boneNames).map(([k, n]) => [k, nodeFor(n)])), bones = Object.fromEntries(Object.entries(boneNames).map(([k, n]) => [k, THREE.PropertyBinding.sanitizeNodeName(`mixamorig:${n}`)]));
const coreIndices=new Set(JSON.parse(fs.readFileSync(new URL('assets/ashen-warlord/landmarks.json',root))).coreIndices);
const supports = [], points = [], grouped = new Map(), core = [];
const main = new Set([...Object.values(boneNames), 'Hips', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder']);
const reference = { clip: 'standing_relax.001', time: 0, blend: 1, offsetY: 0 };
sampler.evaluate(reference);
const v = new THREE.Vector3(), p = new THREE.Vector3();
for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const vertex = { index: i, position: v.toArray(), joints: [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)], weights: [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)] };
    points.push(vertex);
    let bone = mesh.skeleton.bones[vertex.joints[vertex.weights.indexOf(Math.max(...vertex.weights))]], name = bone.name.replace('mixamorig', '');
    if (name.startsWith('LeftHand'))
        name = 'LeftHand';
    if (name.startsWith('RightHand'))
        name = 'RightHand';
    if (name.startsWith('LeftToe'))
        name = 'LeftFoot';
    if (name.startsWith('RightToe'))
        name = 'RightFoot';
    if (name === 'HeadTop_End')
        name = 'Head';
    if (!main.has(name))
        throw Error('Unmapped weighted body part ' + name);
    const node = nodeFor(name), groupKey = name.startsWith('Spine') ? `${node}:${v.x<-.03?'left':v.x>.03?'right':'center'}:${Math.floor(v.y/.08)}` : String(node), group = grouped.get(groupKey) ?? [];
    const j = asset.joints.indexOf(node);
    if (j < 0)
        throw Error(name);
    p.copy(v).applyMatrix4(new THREE.Matrix4().fromArray(asset.inverses, j * 16));
    if (!(coreIndices.has(i)&&sampler.point(vertex).z>0))
        group.push(p.toArray());
    grouped.set(groupKey, group);
    // The source crystal is at the upper chest, in front of the torso.
    if (coreIndices.has(i))
        core.push(vertex);
}
// Distributed support samples include feet, hands and torso for grounded death/landing blending.
for (const key of Object.values(boneNames)) {
    const matching = points.filter(v => { const dominant = v.joints[v.weights.indexOf(Math.max(...v.weights))]; return mesh.skeleton.bones[dominant].name.includes(key); });
    matching.sort((a, b) => a.position[1] - b.position[1]);
    const take = key.includes('Foot') ? 12 : 4;
    supports.push(...matching.slice(0, take));
}
for (let i = 0; i < points.length; i += Math.ceil(points.length / 96))
    supports.push(points[i]);
const handSupport = Object.fromEntries(['left', 'right'].map(side => { const label = side[0].toUpperCase() + side.slice(1), list = points.filter(v => mesh.skeleton.bones[v.joints[v.weights.indexOf(Math.max(...v.weights))]].name.startsWith('mixamorig' + label + 'Hand')); return [side, list.filter((_, i) => i % Math.max(1, Math.floor(list.length / 20)) === 0).slice(0, 24)]; }));
const mouthSupport=points.filter(v=>Math.abs(v.position[0])<.014&&v.position[1]>.875&&v.position[1]<.895&&v.position[2]>.07).filter((_,i)=>i%3===0).slice(0,24);
const forwardCore=core.filter(v=>sampler.point(v).z>0).sort((a,b)=>sampler.point(b).z-sampler.point(a).z);
const exposedCore=forwardCore.slice(0,Math.max(8,Math.ceil(forwardCore.length*.25)));if(exposedCore.length<4)throw Error('Forward-facing textured core absent');
const coreSupport = exposedCore.filter((_, i) => i % Math.max(1, Math.floor(exposedCore.length / 24)) === 0).slice(0, 32);
if (coreSupport.length < 4)
    throw Error('Core landmarks absent');
const mean = vs => vs.reduce((a, p) => ({ x: a.x + p.x / vs.length, y: a.y + p.y / vs.length, z: a.z + p.z / vs.length }), { x: 0, y: 0, z: 0 });
const lower = Math.min(...supports.map(v => sampler.point(v).y));
const anchors = Object.fromEntries(Object.entries(boneNodes).map(([k, i]) => { const m = sampler.world[i]; return [k, [m[12], m[13] - lower, m[14]]]; }));
anchors.gem = Object.values(mean(coreSupport.map(v => sampler.point(v))));
anchors.gem[1] -= lower;
anchors.mouth = [anchors.head[0], anchors.head[1] + .035, anchors.head[2] + .06];
bones.gem = bones.body;
bones.mouth = bones.head;
const regions = [];
for (const [key, vs] of grouped) {
    if (vs.length < 4)
        continue;
    const node = Number(key.split(':')[0]);
    const lo = [0, 1, 2].map(k => Math.min(...vs.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...vs.map(p => p[k]))), offset = lo.map((x, i) => (x + hi[i]) / 2), radii = lo.map((x, i) => Math.max(.008, (hi[i] - x) / 2));
    regions.push({ node, part: asset.nodes[node].name + (key.includes(':') ? ':' + key.split(':').slice(1).join('-') : ''), offset, radii });
}
const map = { idle: 'standing_relax.001', walk: 'walk.001', run: 'run.001', turn: 'turn.001', punch: 'box_01.001', roar: 'angry_03.001', jump: 'jump.001', landing: 'jump_down.001', clap: 'clap.001', charge: 'cast_a_spell.001', shoot: 'shoot.001', hit: 'hit_to_body_01.001', defeat: 'defeat_02.001' };
const clips = Object.fromEntries(Object.entries(map).map(([k, name]) => [k, { name, duration: asset.clips[name].duration }]));
for (const key of ['walk', 'run']) {
    const c = clips[key], zs = [];
    for (let t = 0; t < c.duration; t += 1 / 60) {
        sampler.evaluate({ clip: c.name, time: t, blend: 1, offsetY: 0 });
        zs.push(sampler.world[boneNodes['foot-left']][14]);
    }
    c.stride = Math.max(.12, (Math.max(...zs) - Math.min(...zs)) * 2);
}
// Offline contact bake: sample the actual skinned surface, not an invented floor/foot pose.
const supportIds=new Set(supports.map(v=>v.index));for(const clip of Object.values(clips))for(let frame=0;frame<=16;frame++){sampler.evaluate({clip:clip.name,time:clip.duration*frame/16,blend:1,offsetY:0});let low=Infinity,lowest;for(const v of points){const y=sampler.point(v).y;if(y<low){low=y;lowest=v;}}if(lowest&&!supportIds.has(lowest.index)){supports.push(lowest);supportIds.add(lowest.index);}}
const attackBounds = {};
for (const [key, start, end] of [['punch', .55, .85], ['clap', .1, .35]]) {
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let t = start; t <= end + .001; t += 1 / 60) {
        sampler.evaluate({ clip: clips[key].name, time: t, blend: 1, offsetY: 0 });
        const low = Math.min(...supports.map(v => sampler.point(v).y));
        for (const side of ['left', 'right']) {
            const list = handSupport[side], p = mean(list.map(v => sampler.point(v)));
            p.y -= low;
            for (const k of ['x', 'y', 'z']) {
                min[k] = Math.min(min[k], p[k] * 960 - 45);
                max[k] = Math.max(max[k], p[k] * 960 + 45);
            }
        }
    }
    attackBounds[key] = { min, max };
}
const metadata = { url: '/assets/models/monsters/ashen-warlord.glb', forwardYaw: 0, legacyYawOffset: 0, neckAimWeight: 0, height: 960, sourceHeight: 1, anchors, bones, boneNodes, clips, lods: [], support: supports, coreSupport, mouthSupport, handSupport, regions, attackBounds };
fs.writeFileSync(new URL('shared/ashen-warlord-model.mjs', root), '// Supplied Mixamo rig and authored clips. Generated by prepare-ashen-mixamo.mjs.\nexport const ashenWarlordModel=Object.freeze(' + JSON.stringify(metadata) + ');\n');
sampler.evaluate(reference);
const geometry = { sourceHeight: 1, footHeight: anchors['foot-left'][1], footX: Math.abs(anchors['foot-left'][0]), footZ: -anchors['foot-left'][2], spheres: regions.map((r, i) => { const m = sampler.world[r.node], p = new THREE.Vector3(...r.offset).applyMatrix4(new THREE.Matrix4().fromArray(m)); return { part: r.part + '0', x: -p.x, y: p.y - lower, z: -p.z, radius: Math.max(...r.radii), radii: { x: Math.hypot(m[0]*r.radii[0],m[4]*r.radii[1],m[8]*r.radii[2]), y: Math.hypot(m[1]*r.radii[0],m[5]*r.radii[1],m[9]*r.radii[2]), z: Math.hypot(m[2]*r.radii[0],m[6]*r.radii[1],m[10]*r.radii[2]) } }; }) };
fs.writeFileSync(new URL('shared/ashen-warlord-geometry.mjs', root), '// Source-mesh body regions used for conservative navigation; damage follows animated bones.\nexport const ashenWarlordGeometry=Object.freeze(' + JSON.stringify(geometry) + ');\n');
fs.writeFileSync(new URL('assets/ashen-warlord/source-manifest.json', root), JSON.stringify({ sourceFile: source.split('/').at(-1), sourceSha256: crypto.createHash('sha256').update(original).digest('hex'), runtimeSha256: crypto.createHash('sha256').update(bytes).digest('hex'), triangles: 42179, bones: 65, clips, changes: ['In-place horizontal root translation', 'Removed accumulated hips yaw', 'Smooth interpolation of existing keyed samples', 'Red-only emissive mask; original texture preserved'] }, null, 2) + '\n');
console.log(JSON.stringify({ bytes: bytes.length, corePoints: coreSupport.length, supportPoints: supports.length, regions: regions.length, clips }));
