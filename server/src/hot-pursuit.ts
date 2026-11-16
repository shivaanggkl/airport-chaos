import { journeyDallas15 as mission } from '../../shared/journey-mission.mjs';
type Point={x:number;y:number;z:number};
export type PursuitProgress={lastSentAt?:number;index:number;previous:Point;remaining:number;escaped:boolean};
/** Actual swept runway-space movement, never a timer or client completion claim. */
export function pursuitProgress(position:Point,state:PursuitProgress,route:Readonly<{escapeRoute:readonly {x:number;z:number}[];arrivalRadius:number}>=mission):void {
 const destination=route.escapeRoute[state.index];
 if(!destination||state.escaped)return;
 const a=state.previous,dx=position.x-a.x,dz=position.z-a.z,length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((destination.x-a.x)*dx+(destination.z-a.z)*dz)/length)):0;
 const near=Math.hypot(a.x+dx*t-destination.x,a.z+dz*t-destination.z)<route.arrivalRadius;
 if(near){if(state.index===route.escapeRoute.length-1)state.escaped=true;else state.index++;}
 state.previous={...position};
 const next=route.escapeRoute[state.index]!;
 state.remaining=Math.hypot(position.x-next.x,position.z-next.z);
 for(let i=state.index+1;i<route.escapeRoute.length;i++)state.remaining+=Math.hypot(route.escapeRoute[i]!.x-route.escapeRoute[i-1]!.x,route.escapeRoute[i]!.z-route.escapeRoute[i-1]!.z);
}
