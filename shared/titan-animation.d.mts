export type AuthoredAnimation={clip:string;time:number;previousClip?:string;previousTime?:number;blend:number;offsetY:number;locomotion?:{clip:string;time:number};aim?:{node:number;yaw:number;pitch:number}[]};
export type AnimationSupport={index?:number;position:readonly number[];joints:readonly number[];weights:readonly number[]};
export type AnimationAsset={nodes:{name:string;position:readonly number[];rotation:readonly number[];scale:readonly number[];children:number[]}[];parents:number[];order:number[];clips:Record<string,{duration:number;tracks:unknown[]}>;joints:number[];inverses:Float32Array};
export function readTitanAnimationAsset(bytes:Uint8Array):AnimationAsset;
export function transformTitanPoint(matrix:ArrayLike<number>,p:readonly number[]):{x:number;y:number;z:number};
export function quaternionMix(a:ArrayLike<number>,b:ArrayLike<number>,t:number,out:Float64Array):Float64Array;
export class TitanAnimationSampler{constructor(asset:AnimationAsset);asset:AnimationAsset;world:Float64Array[];skin:Float64Array[];evaluate(frame:AuthoredAnimation):this;point(vertex:AnimationSupport):{x:number;y:number;z:number};}

export function applyTitanJointAim(q:ArrayLike<number>,yaw:number,pitch:number,out:Float64Array):Float64Array;
export function titanLocomotionNode(name:string):boolean;
export function calibrateTitanGait(asset:AnimationAsset,clipName:string,feet:number[]):{stride:number;distanceCurve:number[]};
export function titanGaitTime(clip:{duration:number;distanceCurve?:readonly number[]},phase:number):number;
