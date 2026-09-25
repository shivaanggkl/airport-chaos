export const normalizeTouchMode=value=>value==='on'||value==='off'?value:'auto';
export const normalizeGraphicsQuality=value=>value==='high'||value==='balanced'||value==='low'?value:'auto';
export function resolvedGraphicsQuality(mode,coarse,narrow){return mode==='auto'?(coarse||narrow?'balanced':'high'):mode;}
export function joystickActions(x,y,dead=.28){const actions=[];if(x<-dead)actions.push('yawLeft','rollLeft');if(x>dead)actions.push('yawRight','rollRight');if(y<-dead)actions.push('pitchUp');if(y>dead)actions.push('pitchDown');return actions;}
export function throttleLeverState(pointerY,top,height,boostZoneRatio=.18){const safeHeight=Math.max(1,height);const ratio=Math.max(0,Math.min(1,(pointerY-top)/safeHeight));const boost=ratio<boostZoneRatio;const normalRange=Math.max(.01,1-boostZoneRatio);return{throttle:Math.max(0,Math.min(1,(1-ratio)/normalRange)),boost,handlePercent:boost?Math.max(3,ratio*100):ratio*100};}
export function pinchZoomFactor(previousDistance,currentDistance){return previousDistance>0&&currentDistance>0?Math.max(.84,Math.min(1.16,previousDistance/currentDistance)):1;}
