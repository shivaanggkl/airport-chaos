import { journeyDallas15 as mission } from '../../shared/journey-mission.mjs';
type Point={x:number;y:number;z:number};
export type PursuitProgress={lastSentAt?:number;index:number;previous:Point;remaining:number;escaped:boolean};
/** Actual swept runway-space movement, never a timer or client completion claim. */
export function pursuitProgress(position:Point,state:PursuitProgress):void {
 const destination=mission.escapeRoute[state.index];
 if(!destination||state.escaped)return;
 const a=state.previous,dx=position.x-a.x,dz=position.z-a.z,length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((destination.x-a.x)*dx+(destination.z-a.z)*dz)/length)):0;
 const near=Math.hypot(a.x+dx*t-destination.x,a.z+dz*t-destination.z)<mission.arrivalRadius;
 if(near){if(state.index===mission.escapeRoute.length-1)state.escaped=true;else state.index++;}
 state.previous={...position};
 const next=mission.escapeRoute[state.index]!;
 state.remaining=Math.hypot(position.x-next.x,position.z-next.z);
 for(let i=state.index+1;i<mission.escapeRoute.length;i++)state.remaining+=Math.hypot(mission.escapeRoute[i]!.x-mission.escapeRoute[i-1]!.x,mission.escapeRoute[i]!.z-mission.escapeRoute[i-1]!.z);
}
