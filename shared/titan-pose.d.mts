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
    pivot?: TitanVector;
    lift?: number;
}, progress: number): TitanVector;
export function titanAttackPose(root: TitanVector, yaw: number, joint: TitanVector, ability: {
    arcStart?: number;
    arcEnd?: number;
    reach?: number;
    pivot?: TitanVector;
    lift?: number;
}, stage: string, progress: number, mirror?: boolean): TitanVector;
export function titanAimedJoint(root: TitanVector, yaw: number, local: TitanVector, pivot: TitanVector, aimYaw: number, aimPitch: number): TitanVector;
/** Renderer consumes these authoritative anchors; it never computes damage or chooses a tactic. */
export type TitanPresentation = {
    encounterId: string;
    time: number;
    health: number;
    poseOffsetY?: number;
    position: TitanVector;
    velocity: TitanVector;
    locomotion: 'idle' | 'walk' | 'run' | 'sidestep' | 'jump' | 'charge' | 'recover' | 'defeat';
    yaw: number;
    yawVelocity?: number;
    headYaw: number;
    headPitch: number;
    gait: number;
    gaitRate?: number;
    feet: Readonly<Record<string, TitanVector>>;
    limbs: Readonly<Record<string, TitanVector>>;
    ability: null | {
        id: string;
        radius?: number;
        eventId: string;
        stage: string;
        progress: number;
        animation: string;
        heldObject?: {
            id: string;
            position: TitanVector;
            radius: number;
        };
        comboDepth: number;
        origin: TitanVector;
        direction: TitanVector;
        beamLength?: number;
    };
    projectiles: readonly {
        id: string;
        position: TitanVector;
        radius: number;
        velocity?: TitanVector;
        ability?: string;
    }[];
};
export function titanChain(start: TitanVector, joint: TitanVector, end: TitanVector, target: TitanVector, pole: TitanVector): {
    joint: TitanVector;
    end: TitanVector;
};
export function titanRotateOffset(point: TitanVector, origin: TitanVector, from: TitanVector, to: TitanVector): TitanVector;
