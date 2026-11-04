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
    return titanAnchor(root, yaw, { x: joint.x + Math.sin(angle) * reach, y: joint.y, z: joint.z + Math.cos(angle) * reach });
}
export function titanAttackPose(root, yaw, joint, ability, stage, progress, mirror = false) {
    const curve = { ...ability, arcStart: mirror ? -(ability.arcStart ?? 0) : ability.arcStart, arcEnd: mirror ? -(ability.arcEnd ?? 0) : ability.arcEnd };
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
    const horizontal = sy * x + cy * z;
    return titanAnchor(root, yaw, { x: pivot.x + cy * x - sy * z, y: pivot.y + cp * y + sp * horizontal, z: pivot.z - sp * y + cp * horizontal });
}
