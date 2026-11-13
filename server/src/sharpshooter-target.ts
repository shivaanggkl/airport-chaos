import type { SharpshooterTarget } from '../../shared/sharpshooter-target.mjs';
import { projectileImpactFraction } from '../../shared/projectile-collision.mjs';
import { sharpshooterTargetPose } from '../../shared/sharpshooter-target.mjs';
import { journeyDallasSharpshooter01 as mission } from '../../shared/journey-mission.mjs';

type Point = {x:number;y:number;z:number};
const current:Point={x:0,y:0,z:0},previous:Point={x:0,y:0,z:0},velocity:Point={x:0,y:0,z:0};
/** All arguments originate from the server-accepted pilot transform. */
export function createSharpshooterTarget(stage:number, position:Point, heading:number, elapsedMs:number,
  clearanceAt:(x:number,z:number)=>number):SharpshooterTarget {
  if (![position.x,position.y,position.z,heading,elapsedMs].every(Number.isFinite) || stage<0 || stage>2 || !Number.isInteger(stage))
    throw new Error('Invalid sharpshooter stage');
  // Separate locations and heights form a broad triangle rather than a row.
  const angle=heading+(stage===1?Math.PI*35/180:stage===2?-Math.PI*40/180:0);
  const distance=stage===0?2200:stage===1?3900:5000;
  const x=position.x-Math.sin(angle)*distance,z=position.z-Math.cos(angle)*distance;
  // Include the complete moving sweep and circular face, not only its center.
  let floor=-Infinity;
  for(const offset of [-370,0,370])for(const cross of [-220,0,220])
    floor=Math.max(floor,clearanceAt(x+Math.cos(angle)*offset-Math.sin(angle)*cross,z-Math.sin(angle)*offset-Math.cos(angle)*cross));
  return {stage,x,y:Math.max(position.y+stage*500,floor+mission.targetRadius+150),z,heading:angle,activatedAt:elapsedMs};
}

/** Existing swept solver rejects misses; the face-plane contact then matches
 * the circular target rather than accepting hits in an invisible sphere. */
export function sharpshooterHitFraction(target:SharpshooterTarget, stage:number|undefined, start:Point,end:Point,
 elapsedMs:number,deltaSeconds:number,pilot:Point):number|null {
  if(stage!==target.stage || deltaSeconds<=0)return null;
  sharpshooterTargetPose(target,elapsedMs,current);
  sharpshooterTargetPose(target,elapsedMs-deltaSeconds*1000,previous);
  velocity.x=(current.x-previous.x)/deltaSeconds;velocity.y=0;velocity.z=(current.z-previous.z)/deltaSeconds;
  if(projectileImpactFraction(start,end,current,velocity,deltaSeconds,mission.targetRadius)===null)return null;
  const nx=pilot.x-current.x,ny=pilot.y-current.y,nz=pilot.z-current.z;
  const length=Math.hypot(nx,ny,nz);
  if(length<1e-6)return null;
  const sx=start.x-previous.x,sy=start.y-previous.y,sz=start.z-previous.z;
  const dx=end.x-current.x-sx,dy=end.y-current.y-sy,dz=end.z-current.z-sz;
  const distance=(sx*nx+sy*ny+sz*nz)/length;
  const direction=(dx*nx+dy*ny+dz*nz)/length;
  if(Math.abs(direction)<1e-9)return null;
  const t=-distance/direction;
  if(t<0||t>1)return null;
  const x=sx+dx*t,y=sy+dy*t,z=sz+dz*t;
  return x*x+y*y+z*z<=mission.targetRadius**2?t:null;
}
