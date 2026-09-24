export const normalizeTouchMode=value=>value==='on'||value==='off'?value:'auto';
export const normalizeGraphicsQuality=value=>value==='high'||value==='balanced'||value==='low'?value:'auto';
export function resolvedGraphicsQuality(mode,coarse,narrow){return mode==='auto'?(coarse||narrow?'balanced':'high'):mode;}
export function joystickActions(x,y,dead=.28){const actions=[];if(x<-dead)actions.push('yawLeft','rollLeft');if(x>dead)actions.push('yawRight','rollRight');if(y<-dead)actions.push('throttleUp');if(y>dead)actions.push('throttleDown');if(y<-.82)actions.push('boost');return actions;}
export function pinchZoomFactor(previousDistance,currentDistance){return previousDistance>0&&currentDistance>0?Math.max(.84,Math.min(1.16,previousDistance/currentDistance)):1;}
