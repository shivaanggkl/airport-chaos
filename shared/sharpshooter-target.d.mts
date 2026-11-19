export const sharpshooterPlacements: readonly Readonly<{angleDegrees:number;distance:number;altitude:number}>[];
export type SharpshooterTarget = {stage:number;x:number;y:number;z:number;heading:number;activatedAt:number;motionAmplitude?:number;motionPeriodMs?:number};
export function sharpshooterTargetPose<T extends {x:number;y:number;z:number}>(target:SharpshooterTarget,elapsedMs:number,out:T):T;

export const movingTargetPlacements: readonly Readonly<{label:string;x:number;z:number;moving:boolean}>[];

export const doubleTroublePlacements: readonly Readonly<{label:string;x:number;z:number;moving:boolean}>[];
