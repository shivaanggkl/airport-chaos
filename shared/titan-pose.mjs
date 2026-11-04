// Pure presentation/collision contract. Local coordinates are meters; +Z is forward.
export const titanStages = Object.freeze(['SELECT', 'WARNING', 'WINDUP', 'ACTIVE', 'RECOVERY', 'COOLDOWN']);
export function titanTimeline(ability, elapsed) {
    let start = 0;
    for (const [stage, duration] of [['WARNING', ability.warning], ['WINDUP', ability.windup], ['ACTIVE', ability.active], ['RECOVERY', ability.recovery], ['COOLDOWN', ability.cooldown]]) {
        if (elapsed < start + duration)
            return { stage, progress: duration > 0 ? Math.max(0, (elapsed - start) / duration) : 1 };
        start += duration;
    }
    return { stage: 'DONE', progress: 1 };
}
export function titanAnchor(root, yaw, local) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: root.x + c * local.x + s * local.z, y: root.y + local.y, z: root.z - s * local.x + c * local.z };
}
// The renderer must use these exact end-effector anchors, not a second attack curve.
export function titanLimbPose(root, yaw, joint, ability, progress) {
    const angle = (ability.arcStart ?? -.8) + ((ability.arcEnd ?? .8) - (ability.arcStart ?? -.8)) * progress;
    const reach = ability.reach ?? 0;
    const pivot = ability.pivot ?? joint;
    return titanAnchor(root, yaw, { x: pivot.x + Math.sin(angle) * reach, y: pivot.y + Math.sin(Math.PI * progress) * (ability.lift ?? 0), z: pivot.z + Math.cos(angle) * reach });
}
export function titanAttackPose(root, yaw, joint, ability, stage, progress, mirror = false) {
    const curve = { ...ability, pivot: mirror && ability.pivot ? { ...ability.pivot, x: -ability.pivot.x } : ability.pivot, arcStart: mirror ? -(ability.arcStart ?? 0) : ability.arcStart, arcEnd: mirror ? -(ability.arcEnd ?? 0) : ability.arcEnd };
    const rest = titanAnchor(root, yaw, joint);
    if (stage === 'ACTIVE')
        return titanLimbPose(root, yaw, joint, curve, progress);
    const p = stage === 'WINDUP' ? 0 : 1, extended = titanLimbPose(root, yaw, joint, curve, p);
    const u = stage === 'WINDUP' ? progress : stage === 'RECOVERY' ? 1 - progress : 0, weight = u * u * (3 - 2 * u);
    return { x: rest.x + (extended.x - rest.x) * weight, y: rest.y + (extended.y - rest.y) * weight, z: rest.z + (extended.z - rest.z) * weight };
}
export function titanAimedJoint(root, yaw, local, pivot, aimYaw, aimPitch) {
    const x = local.x - pivot.x, y = local.y - pivot.y, z = local.z - pivot.z;
    const cy = Math.cos(aimYaw), sy = Math.sin(aimYaw), cp = Math.cos(aimPitch), sp = Math.sin(aimPitch);
    const depth = -sp * y + cp * z;
    return titanAnchor(root, yaw, { x: pivot.x + cy * x + sy * depth, y: pivot.y + cp * y + sp * z, z: pivot.z - sy * x + cy * depth });
}
// Shared two-bone IK; renderer and collision adapter use the same reachable endpoint.
export function titanChain(start, joint, end, target, pole) {
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), len = a => Math.hypot(a.x, a.y, a.z), dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const l1 = len(sub(joint, start)), l2 = len(sub(end, joint)), v = sub(target, start), d = Math.max(Math.abs(l1 - l2) + .01, Math.min(l1 + l2 - .01, len(v))), n = len(v) || 1, axis = { x: v.x / n, y: v.y / n, z: v.z / n };
    const projection = dot(pole, axis), p = { x: pole.x - axis.x * projection, y: pole.y - axis.y * projection, z: pole.z - axis.z * projection }, pl = len(p) || 1;
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), b = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { joint: { x: start.x + axis.x * a + p.x / pl * b, y: start.y + axis.y * a + p.y / pl * b, z: start.z + axis.z * a + p.z / pl * b }, end: { x: start.x + axis.x * d, y: start.y + axis.y * d, z: start.z + axis.z * d } };
}
export function titanRotateOffset(point, origin, from, to) {
    const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }, a = norm(from), b = norm(to), cross = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }, c = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const v = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
    if (c < -.99999)
        return { x: origin.x - v.x, y: origin.y - v.y, z: origin.z - v.z };
    const cv = { x: cross.y * v.z - cross.z * v.y, y: cross.z * v.x - cross.x * v.z, z: cross.x * v.y - cross.y * v.x }, cc = { x: cross.y * cv.z - cross.z * cv.y, y: cross.z * cv.x - cross.x * cv.z, z: cross.x * cv.y - cross.y * cv.x };
    return { x: origin.x + v.x + cv.x + cc.x / (1 + c), y: origin.y + v.y + cv.y + cc.y / (1 + c), z: origin.z + v.z + cv.z + cc.z / (1 + c) };
}
