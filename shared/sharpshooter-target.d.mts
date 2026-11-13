export type SharpshooterTarget = {stage:number;x:number;y:number;z:number;heading:number;activatedAt:number};
export function sharpshooterTargetPose<T extends {x:number;y:number;z:number}>(target:SharpshooterTarget,elapsedMs:number,out:T):T;
