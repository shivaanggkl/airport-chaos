import { journeyDallasMostWantedSurvival01 as mission } from '../../shared/journey-mission.mjs';

type V={x:number;y:number;z:number};
export type SurvivalHunter={id:string|null;generation:number;health:number;nextSpawnAt:number|null;fireAt:number;position:V;rotation:V;velocity:V;speed:number};
export type SurvivalState={goAt:number|null;outsideSince:number|null;updatedAt:number;incomingUntil:number;
  lastShooter:string|null;shooterUntil:number;pilot:{position:V;rotation:V;velocity:V;health:number;acceptedAt:number};hunters:[SurvivalHunter,SurvivalHunter]};
export function insideSurvivalArea(point:{x:number;z:number},inset=0):boolean {
  const b=mission.bounds;
  return Number.isFinite(point.x)&&Number.isFinite(point.z)&&point.x>=b.minX+inset&&point.x<=b.maxX-inset&&point.z>=b.minZ+inset&&point.z<=b.maxZ-inset;
}
/** Relative candidates use the existing flight heading convention; the server supplies clearance. */
export function survivalReplacement(slot:0|1,pilot:SurvivalState['pilot'],others:readonly V[],safeAltitude:(x:number,z:number)=>number):{position:V;rotation:V}|undefined {
  const yaw=pilot.rotation.y,fx=-Math.sin(yaw),fz=-Math.cos(yaw),lx=-Math.cos(yaw),lz=Math.sin(yaw);
  const order=slot===0?[[-1,1],[-1,-1],[1,1],[1,-1]]:[[-1,-1],[-1,1],[1,-1],[1,1]];
  for(const [behind,left] of order){
    const x=pilot.position.x-fx*behind!*4000+lx*left!*2500,z=pilot.position.z-fz*behind!*4000+lz*left!*2500;
    if(!insideSurvivalArea({x,z},1500)||others.some(p=>Math.hypot(p.x-x,p.z-z)<2200))continue;
    const y=Math.max(pilot.position.y,safeAltitude(x,z));if(!Number.isFinite(y))continue;
    return {position:{x,y,z},rotation:{x:0,y:Math.atan2(x-pilot.position.x,z-pilot.position.z),z:0}};
  }
  return undefined;
}
export function survivalSteering(position:V,forward:{x:number;z:number},goal:V):V {
  const b=mission.bounds,inset=3000,centerX=(b.minX+b.maxX)/2,centerZ=(b.minZ+b.maxZ)/2;
  let x=Math.max(b.minX+inset,Math.min(b.maxX-inset,goal.x)),z=Math.max(b.minZ+inset,Math.min(b.maxZ-inset,goal.z));
  if(position.x<b.minX+inset&&forward.x<0||position.x>b.maxX-inset&&forward.x>0)x=centerX;
  if(position.z<b.minZ+inset&&forward.z<0||position.z>b.maxZ-inset&&forward.z>0)z=centerZ;
  return {x,y:goal.y,z};
}
export function shiftSurvival(state:SurvivalState,elapsed:number):void {
  if(state.goAt!==null)state.goAt+=elapsed;if(state.outsideSince!==null)state.outsideSince+=elapsed;
  state.updatedAt+=elapsed;state.incomingUntil+=elapsed;state.shooterUntil+=elapsed;state.pilot.acceptedAt+=elapsed;
  for(const hunter of state.hunters){if(hunter.nextSpawnAt!==null)hunter.nextSpawnAt+=elapsed;hunter.fireAt+=elapsed;}
}
/** Destruction is bound to one assigned generation and cannot settle victory. */
export function defeatSurvivalHunter(state:SurvivalState,id:string,now:number):boolean {
  const hunter=state.hunters.find(h=>h.id===id&&h.health>0&&h.nextSpawnAt===null);
  if(!hunter)return false;hunter.health=0;hunter.nextSpawnAt=now+mission.replacementDelayMs;return true;
}
export function survivalOutcome(state:SurvivalState,deadline:number,now:number,fresh:boolean):'WIN'|'LEFT_COMBAT_AREA'|undefined {
  if(state.pilot.health<=0)return undefined;
  if(state.outsideSince!==null&&now-state.outsideSince>=mission.boundaryGraceMs)return 'LEFT_COMBAT_AREA';
  if(fresh){if(insideSurvivalArea(state.pilot.position))state.outsideSince=null;else state.outsideSince??=now;}
  if(state.outsideSince!==null&&now-state.outsideSince>=mission.boundaryGraceMs)return 'LEFT_COMBAT_AREA';
  if(now>=deadline&&fresh&&state.outsideSince===null&&insideSurvivalArea(state.pilot.position))return 'WIN';
  return undefined;
}
