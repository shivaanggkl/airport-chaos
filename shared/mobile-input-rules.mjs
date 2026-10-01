export const normalizeTouchMode=value=>value==='on'||value==='off'?value:'auto';
export const normalizeGraphicsQuality=value=>value==='high'||value==='balanced'||value==='low'?value:'auto';
export function touchControlsEnabled(mode,coarse,narrow){return mode==='on'||(mode==='auto'&&(coarse||narrow));}
export function mobileControlStyle(x,y,scale){return{left:`${x}%`,top:`${y}%`,scale:`${scale}`};}
export function resolvedGraphicsQuality(mode,coarse,narrow){return mode==='auto'?(coarse||narrow?'balanced':'high'):mode;}
export function joystickInput(x,y,dead=.18,horizontalCurve=2.3,verticalCurve=1.75){const magnitude=Math.hypot(x,y);if(magnitude<=dead)return{x:0,y:0};const limited=Math.min(1,magnitude);const travel=(limited-dead)/(1-dead);const directionX=x/magnitude,directionY=y/magnitude;const diagonalTurnWeight=1-.22*Math.abs(directionY);return{x:directionX*Math.pow(travel,horizontalCurve)*diagonalTurnWeight,y:directionY*Math.pow(travel,verticalCurve)};}
export function joystickKnobPosition(x,y,maxTravel=30){const magnitude=Math.hypot(x,y);const scale=magnitude>1?1/magnitude:1;return{x:x*scale*maxTravel,y:y*scale*maxTravel};}
export function throttleLeverState(pointerY,top,height,boostZoneRatio=.18){const safeHeight=Math.max(1,height);const ratio=Math.max(0,Math.min(1,(pointerY-top)/safeHeight));const boost=ratio<boostZoneRatio;const normalRange=Math.max(.01,1-boostZoneRatio);return{throttle:Math.max(0,Math.min(1,(1-ratio)/normalRange)),boost,handlePercent:boost?Math.max(3,ratio*100):ratio*100};}
export function mobileIdleBrakeRequested(throttleTarget){return throttleTarget!==undefined&&throttleTarget<=.08;}
export function pinchZoomFactor(previousDistance,currentDistance){return previousDistance>0&&currentDistance>0?Math.max(.84,Math.min(1.16,previousDistance/currentDistance)):1;}
