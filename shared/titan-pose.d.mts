export type TitanVector = {
    x: number;
    y: number;
    z: number;
};
export type TitanTiming = {
    warning: number;
    windup: number;
    active: number;
    recovery: number;
    cooldown: number;
};
export const titanStages: readonly string[];
export function titanTimeline(ability: TitanTiming, elapsed: number): {
    stage: string;
    progress: number;
};
export function titanAnchor(root: TitanVector, yaw: number, local: TitanVector): TitanVector;
export function titanLimbPose(root: TitanVector, yaw: number, joint: TitanVector, ability: {
    arcStart?: number;
    arcEnd?: number;
    reach?: number;
}, progress: number): TitanVector;
export function titanAttackPose(root: TitanVector, yaw: number, joint: TitanVector, ability: {
    arcStart?: number;
    arcEnd?: number;
    reach?: number;
}, stage: string, progress: number, mirror?: boolean): TitanVector;
export function titanAimedJoint(root: TitanVector, yaw: number, local: TitanVector, pivot: TitanVector, aimYaw: number, aimPitch: number): TitanVector;
/** Renderer consumes these authoritative anchors; it never computes damage or chooses a tactic. */
export type TitanPresentation = {
    encounterId: string;
    time: number;
    health: number;
    position: TitanVector;
    velocity: TitanVector;
    locomotion: 'idle' | 'walk' | 'run' | 'sidestep' | 'jump' | 'charge' | 'recover' | 'defeat';
    yaw: number;
    headYaw: number;
    headPitch: number;
    gait: number;
    feet: Readonly<Record<string, TitanVector>>;
    limbs: Readonly<Record<string, TitanVector>>;
    ability: null | {
        id: string;
        eventId: string;
        stage: string;
        progress: number;
        animation: string;
        comboDepth: number;
        origin: TitanVector;
        direction: TitanVector;
    };
    projectiles: readonly {
        id: string;
        position: TitanVector;
        radius: number;
    }[];
};
