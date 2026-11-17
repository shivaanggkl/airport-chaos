export const normalizeTouchMode=value=>value==='on'||value==='off'?value:'auto';
export const normalizeGraphicsQuality=value=>value==='high'||value==='balanced'||value==='low'?value:'auto';
export function touchControlsEnabled(mode,coarse,narrow){return mode==='on'||(mode==='auto'&&(coarse||narrow));}
export function mobileControlStyle(x,y,scale){return{left:`${x}%`,top:`${y}%`,scale:`${scale}`};}
export function resolvedGraphicsQuality(mode,coarse,narrow){return mode==='auto'?(coarse||narrow?'balanced':'high'):mode;}
export function joystickInput(x,y,dead=.18,horizontalCurve=2.3,verticalCurve=1.75){const magnitude=Math.hypot(x,y);if(magnitude<=dead)return{x:0,y:0};const limited=Math.min(1,magnitude);const travel=(limited-dead)/(1-dead);const directionX=x/magnitude,directionY=y/magnitude;const diagonalTurnWeight=1-.22*Math.abs(directionY);return{x:directionX*Math.pow(travel,horizontalCurve)*diagonalTurnWeight,y:directionY*Math.pow(travel,verticalCurve)};}
const joystickTenEdgeVertices=[[0,-1],[.5,-.8],[.9,-.36],[.9,.36],[.5,.8],[0,1],[-.5,.8],[-.9,.36],[-.9,-.36],[-.5,-.8]];
function joystickTenEdgeRadius(directionX,directionY){let radius=Infinity;for(let index=0;index<joystickTenEdgeVertices.length;index+=1){const [ax,ay]=joystickTenEdgeVertices[index], [bx,by]=joystickTenEdgeVertices[(index+1)%joystickTenEdgeVertices.length];const edgeX=bx-ax,edgeY=by-ay,denominator=directionX*edgeY-directionY*edgeX;if(Math.abs(denominator)<1e-9)continue;const rayDistance=(ax*edgeY-ay*edgeX)/denominator,edgeProgress=(ax*directionY-ay*directionX)/denominator;if(rayDistance>=0&&edgeProgress>=0&&edgeProgress<=1)radius=Math.min(radius,rayDistance);}return Number.isFinite(radius)?radius:1;}
export function joystickTenEdgeInput(x,y){const magnitude=Math.hypot(x,y);if(magnitude===0)return{x:0,y:0};const directionX=x/magnitude,directionY=y/magnitude;const boundary=joystickTenEdgeRadius(directionX,directionY),travel=Math.min(1,magnitude/boundary);return{x:directionX*travel,y:directionY*travel};}
export function joystickKnobPosition(x,y,maxTravel=30){const magnitude=Math.hypot(x,y);if(magnitude===0)return{x:0,y:0};const directionX=x/magnitude,directionY=y/magnitude;const distance=Math.min(magnitude,joystickTenEdgeRadius(directionX,directionY));return{x:directionX*distance*maxTravel,y:directionY*distance*maxTravel};}
// Four touch detents reuse existing SLOW/CRUISE targets; FAST requests normal maximum.
export const mobileThrottleStops=Object.freeze([0,.30/.82,.50/.82,1]);
export const mobileThrottleNames=Object.freeze(['IDLE','SLOW','CRUISE','FAST']);
export function mobileThrottleSelection(value){
  const request=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
  return mobileThrottleStops.reduce((nearest,stop)=>Math.abs(stop-request)<Math.abs(nearest-request)?stop:nearest,0);
}
export function throttleLeverState(pointerY,top,height,previousThrottle){
  const travel=1-Math.max(0,Math.min(1,(pointerY-top)/Math.max(1,height)));
  let index=Math.round(travel*3);
  const previous=mobileThrottleStops.indexOf(previousThrottle);
  // Stay in the selected detent until the finger clearly crosses its boundary.
  if(previous>=0 && Math.abs(travel-previous/3)<=1/6+.04)index=previous;
  return{throttle:mobileThrottleStops[index],boost:false,handlePercent:(1-index/3)*100};
}
export function mobileIdleBrakeRequested(throttleTarget,boostHeld=false){return !boostHeld&&throttleTarget!==undefined&&throttleTarget<=.08;}
export function pinchZoomFactor(previousDistance,currentDistance){return previousDistance>0&&currentDistance>0?Math.max(.84,Math.min(1.16,previousDistance/currentDistance)):1;}
