export type TouchControlsMode='auto'|'on'|'off';export type GraphicsQualityMode='auto'|'high'|'balanced'|'low';
export declare const normalizeTouchMode:(value:unknown)=>TouchControlsMode;export declare const normalizeGraphicsQuality:(value:unknown)=>GraphicsQualityMode;
export declare function resolvedGraphicsQuality(mode:GraphicsQualityMode,coarse:boolean,narrow:boolean):'high'|'balanced'|'low';
export declare function joystickInput(x:number,y:number,dead?:number,curve?:number):{x:number;y:number};
export declare function throttleLeverState(pointerY:number,top:number,height:number,boostZoneRatio?:number):{throttle:number;boost:boolean;handlePercent:number};
export declare function mobileIdleBrakeRequested(throttleTarget:number|undefined):boolean;
export declare function pinchZoomFactor(previousDistance:number,currentDistance:number):number;
