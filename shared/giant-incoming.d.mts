export type TransportPoint = {
    x: number;
    y: number;
    z: number;
};
export type TransportPose = TransportPoint & {
    yaw: number;
    gunYaw?: number;
    gunPitch?: number;
    roll: number;
    velocity: TransportPoint;
};
export const transportTuning: Readonly<{
    scale: number;
    health: number;
    durationMs: number;
    speed: number;
    separation: number;
    warningMs: number;
    burstIntervalMs: number;
    shotSpacingMs: number;
    shotDamage: number;
    yawArc: number;
    pitchArc: number;
}>;
export const transportRouteLength: number;
export const transportFootprintRadius: number;
export const transportCourse: Readonly<{ start: {x:number;z:number}; whiteRock: {x:number;z:number}; end: {x:number;z:number}; exitX:number }>;
export function transportPose(elapsedMs: number, altitude?: number): TransportPose;
export function transportSpawn(groundHeight?: number): {
    position: TransportPoint;
    heading: number;
    speed: number;
};
export type TransportShotState = {
    id: string;
    position: TransportPoint;
    direction: TransportPoint;
    speed: number;
    traveled: number;
};
export type TransportStateMessage = {
    type: 'transportState';
    attemptId: string;
    pose: TransportPose;
    gunYaw: number;
    gunPitch: number;
    warningUntil: number;
    hitSequence: number;
    hitPosition?: TransportPoint;
    health: number;
    shots: TransportShotState[];
    serverNow: number;
};
