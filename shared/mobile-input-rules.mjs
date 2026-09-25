export const normalizeTouchMode=value=>value==='on'||value==='off'?value:'auto';
export const normalizeGraphicsQuality=value=>value==='high'||value==='balanced'||value==='low'?value:'auto';
export function resolvedGraphicsQuality(mode,coarse,narrow){return mode==='auto'?(coarse||narrow?'balanced':'high'):mode;}
export function joystickInput(x,y,dead=.16,curve=1.65){const shape=value=>{const magnitude=Math.min(1,Math.abs(value));if(magnitude<=dead)return 0;return Math.sign(value)*Math.pow((magnitude-dead)/(1-dead),curve);};return{x:shape(x),y:shape(y)};}
export function throttleLeverState(pointerY,top,height,boostZoneRatio=.18){const safeHeight=Math.max(1,height);const ratio=Math.max(0,Math.min(1,(pointerY-top)/safeHeight));const boost=ratio<boostZoneRatio;const normalRange=Math.max(.01,1-boostZoneRatio);return{throttle:Math.max(0,Math.min(1,(1-ratio)/normalRange)),boost,handlePercent:boost?Math.max(3,ratio*100):ratio*100};}
export function mobileIdleBrakeRequested(throttleTarget){return throttleTarget!==undefined&&throttleTarget<=.08;}
export function pinchZoomFactor(previousDistance,currentDistance){return previousDistance>0&&currentDistance>0?Math.max(.84,Math.min(1.16,previousDistance/currentDistance)):1;}
