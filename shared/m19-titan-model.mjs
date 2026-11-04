// Measured bind-world anchors from the existing GLB. Engine/source forward is +Z.
// Legacy fitted collision geometry was authored after a pi Y rotation.
export const m19Model = Object.freeze({
    url: '/assets/models/monsters/monster-arrival.glb', forwardYaw: 0, neckAimWeight: .35, legacyYawOffset: Math.PI, clips: ['Idle', 'Walk', 'Turn', 'AttackWindup', 'AttackRelease', 'Recovery', 'Hit', 'Defeat', 'TimeoutAttack'], lods: ['MonsterNear', 'MonsterMid', 'MonsterFar'],
    anchors: { body: [0, .49014264, 0], neck: [0, .77007270, .02499375], head: [0, .87004772, .09997508], mouth: [0, .83005773, .48987768],
        'hand-left': [-.41989524, .30019012, .11996998], 'hand-right': [.41989524, .30019012, .11996998],
        'elbow-left': [-.37990522, .47014760, .01499626], 'elbow-right': [.37990522, .47014760, .01499626],
        'shoulder-left': [-.30992266, .62011012, .01499626], 'shoulder-right': [.30992266, .62011012, .01499626],
        'hip-left': [-.15996005, .37017262, -.02999251], 'hip-right': [.15996005, .37017262, -.02999251],
        'knee-left': [-.22994266, .20021500, .00999746], 'knee-right': [.22994266, .20021500, .00999746],
        'foot-left': [-.22994275, .07024747, .11996998], 'foot-right': [.22994275, .07024747, .11996998],
        tail: [.06998250, .26020014, -.38990271], 'tail-base': [0, .32018510, -.10997254], 'tail-mid': [0, .25020259, -.26993264] },
    bones: { 'hip-left': 'LeftThigh', 'hip-right': 'RightThigh', 'knee-left': 'LeftShin', 'knee-right': 'RightShin', 'elbow-left': 'LeftForearm', 'elbow-right': 'RightForearm', body: 'Spine', neck: 'Neck', head: 'Head', mouth: 'Mouth', 'hand-left': 'LeftHand', 'hand-right': 'RightHand',
        'shoulder-left': 'LeftUpperArm', 'shoulder-right': 'RightUpperArm', 'foot-left': 'LeftFoot', 'foot-right': 'RightFoot', tail: 'TailTip', 'tail-base': 'TailBase', 'tail-mid': 'TailMid' },
});
export function m19ModelPoint(point, height = 960) { return { x: -point.x * height, y: point.y * height, z: -point.z * height }; }
export function m19LegacyYaw(yaw) { return yaw + m19Model.legacyYawOffset; }
