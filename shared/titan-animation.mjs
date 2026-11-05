// Trusted glTF skeletal-curve evaluation. This samples authored clips; it creates no poses or AI decisions.
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function readTitanAnimationAsset(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67)
        throw Error('Invalid GLB');
    const length = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))), offset = 28 + length;
    const accessor = i => { const a = json.accessors[i], b = json.bufferViews[a.bufferView], width = sizes[a.type]; if (a.componentType !== 5126)
        throw Error('Skeletal curves must be float'); const out = new Float32Array(a.count * width); const data = new DataView(bytes.buffer, bytes.byteOffset + offset + (b.byteOffset ?? 0) + (a.byteOffset ?? 0)); for (let k = 0; k < a.count; k++)
        for (let j = 0; j < width; j++)
            out[k * width + j] = data.getFloat32(k * (b.byteStride ?? width * 4) + j * 4, true); return out; };
    const nodes = json.nodes.map(n => ({ name: n.name ?? '', position: n.translation ?? [0, 0, 0], rotation: n.rotation ?? [0, 0, 0, 1], scale: n.scale ?? [1, 1, 1], children: n.children ?? [] }));
    const parents = nodes.map(() => -1);
    nodes.forEach((n, i) => n.children.forEach(c => parents[c] = i));
    const order = [];
    function visit(i) { order.push(i); nodes[i].children.forEach(visit); }
    parents.forEach((p, i) => { if (p < 0)
        visit(i); });
    const clips = Object.fromEntries((json.animations ?? []).map(a => [a.name, { duration: Math.max(...a.samplers.map(s => json.accessors[s.input].max?.[0] ?? 0)), tracks: a.channels.map(c => { const s = a.samplers[c.sampler]; if (s.interpolation && s.interpolation !== 'LINEAR')
                throw Error('Unsupported curve interpolation'); return { node: c.target.node, path: c.target.path, times: accessor(s.input), values: accessor(s.output) }; }) }]));
    return { nodes, parents, order, clips, joints: json.skins[0].joints, inverses: accessor(json.skins[0].inverseBindMatrices) };
}
export function quaternionMix(a, b, t, out) { let dot = 0; for (let i = 0; i < 4; i++)
    dot += a[i] * b[i]; const sign = dot < 0 ? -1 : 1; dot = Math.min(1, Math.abs(dot)); let x = 1 - t, y = t; if (dot < .9995) {
    const theta = Math.acos(dot), s = Math.sin(theta);
    x = Math.sin((1 - t) * theta) / s;
    y = Math.sin(t * theta) / s;
} let len = 0; for (let i = 0; i < 4; i++) {
    out[i] = a[i] * x + b[i] * y * sign;
    len += out[i] * out[i];
} len = Math.sqrt(len) || 1; for (let i = 0; i < 4; i++)
    out[i] /= len; return out; }
function matrix(p, q, s, out) { const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2; out.set([(1 - yy - zz) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - xx - zz) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - xx - yy) * s[2], 0, p[0], p[1], p[2], 1]); }
function multiply(a, b, o) { for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; }
export function transformTitanPoint(matrix, p) { return { x: matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12], y: matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13], z: matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14] }; }
export class TitanAnimationSampler {
    constructor(asset) { this.asset = asset; const make = () => asset.nodes.map(n => ({ position: Float64Array.from(n.position), rotation: Float64Array.from(n.rotation), scale: Float64Array.from(n.scale) })); this.a = make(); this.b = make(); this.local = asset.nodes.map(() => new Float64Array(16)); this.world = asset.nodes.map(() => new Float64Array(16)); this.skin = asset.joints.map(() => new Float64Array(16)); this.q = new Float64Array(4); }
    sampleClip(name, time, poses) { const a = this.asset, clip = a.clips[name]; if (!clip)
        throw Error('Unknown authored animation ' + name); for (let i = 0; i < a.nodes.length; i++)
        for (const key of ['position', 'rotation', 'scale'])
            poses[i][key].set(a.nodes[i][key]); time = Math.min(clip.duration, Math.max(0, time)); for (const tr of clip.tracks) {
        let lo = 0, hi = tr.times.length - 1;
        while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (tr.times[m] > time)
                hi = m;
            else
                lo = m;
        }
        const t = Math.max(0, Math.min(1, (time - tr.times[lo]) / Math.max(1e-9, tr.times[hi] - tr.times[lo]))), width = tr.path === 'rotation' ? 4 : 3, key = tr.path === 'translation' ? 'position' : tr.path, out = poses[tr.node][key], v = tr.values;
        if (key === 'rotation')
            quaternionMix(v.subarray(lo * 4, lo * 4 + 4), v.subarray(hi * 4, hi * 4 + 4), t, out);
        else
            for (let j = 0; j < width; j++)
                out[j] = v[lo * width + j] * (1 - t) + v[hi * width + j] * t;
    } }
    evaluate(frame) { this.sampleClip(frame.clip, frame.time, this.a); if (frame.previousClip && frame.blend < 1)
        this.sampleClip(frame.previousClip, frame.previousTime ?? 0, this.b); for (const i of this.asset.order) {
        const p = this.a[i];
        if (frame.previousClip && frame.blend < 1) {
            const b = this.b[i], t = frame.blend;
            for (const key of ['position', 'scale'])
                for (let j = 0; j < 3; j++)
                    p[key][j] = b[key][j] * (1 - t) + p[key][j] * t;
            quaternionMix(b.rotation, p.rotation, t, p.rotation);
        }
        matrix(p.position, p.rotation, p.scale, this.local[i]);
        const parent = this.asset.parents[i];
        if (parent < 0)
            this.world[i].set(this.local[i]);
        else
            multiply(this.world[parent], this.local[i], this.world[i]);
    } for (let j = 0; j < this.asset.joints.length; j++)
        multiply(this.world[this.asset.joints[j]], this.asset.inverses.subarray(j * 16, j * 16 + 16), this.skin[j]); return this; }
    point(vertex) { let x = 0, y = 0, z = 0; for (let k = 0; k < 4; k++) {
        const w = vertex.weights[k];
        if (w <= 0)
            continue;
        const m = this.skin[vertex.joints[k]], p = vertex.position;
        x += w * (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]);
        y += w * (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]);
        z += w * (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]);
    } return { x, y, z }; }
}
