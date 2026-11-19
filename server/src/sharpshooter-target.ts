import type { SharpshooterTarget } from '../../shared/sharpshooter-target.mjs';
import { projectileImpactFraction } from '../../shared/projectile-collision.mjs';
import { sharpshooterPlacements, movingTargetPlacements, doubleTroublePlacements, precisionFirePlacements, targetMasterPlacements, sharpshooterTargetPose } from '../../shared/sharpshooter-target.mjs';
import { journeyDallasSharpshooter01 as mission, journeyDallasSharpshooter02, journeyDallasSharpshooter03, journeyDallasSharpshooter04, journeyDallasSharpshooter05, journeySharpshooterMission } from '../../shared/journey-mission.mjs';

type Point = {x:number;y:number;z:number};
const current:Point={x:0,y:0,z:0},previous:Point={x:0,y:0,z:0},velocity:Point={x:0,y:0,z:0};
/** All arguments originate from the server-accepted pilot transform. */
export function createSharpshooterTarget(stage:number, position:Point, heading:number, elapsedMs:number,
  clearanceAt:(x:number,z:number)=>number, missionId:string=mission.id):SharpshooterTarget {
  const definition=journeySharpshooterMission(missionId);
  if(!definition)throw new Error('Unknown target mission');
  if (![position.x,position.y,position.z,heading,elapsedMs].every(Number.isFinite) || stage<0 || stage>=definition.targetCount || !Number.isInteger(stage))
    throw new Error('Invalid sharpshooter stage');
  const placement=sharpshooterPlacements[stage];
  const fixed=missionId===journeyDallasSharpshooter05.id?targetMasterPlacements[stage]
    :missionId===journeyDallasSharpshooter04.id?precisionFirePlacements[stage]
    :missionId===journeyDallasSharpshooter03.id?doubleTroublePlacements[stage]
    :missionId===journeyDallasSharpshooter02.id?movingTargetPlacements[stage]:undefined;
  if(!fixed&&!placement)throw new Error('Missing target placement');
  const angle=fixed?0:heading+placement!.angleDegrees*Math.PI/180;
  const distance=placement?.distance??0;
  const x=fixed?.x??position.x-Math.sin(angle)*distance,z=fixed?.z??position.z-Math.cos(angle)*distance;
  // Include the complete moving sweep and circular face, not only its center.
  let floor=-Infinity;
  const sweep=fixed?.moving?450+mission.targetRadius:370;
  for(const offset of [-sweep,0,sweep])for(const cross of [-220,0,220])
    floor=Math.max(floor,clearanceAt(x+Math.cos(angle)*offset-Math.sin(angle)*cross,z-Math.sin(angle)*offset-Math.cos(angle)*cross));
  return {stage,x,y:Math.max(missionId===journeyDallasSharpshooter05.id?targetMasterPlacements[stage]!.altitude:missionId===journeyDallasSharpshooter04.id?precisionFirePlacements[stage]!.altitude:fixed?1000:position.y+placement!.altitude,floor+mission.targetRadius+150),z,heading:angle,activatedAt:elapsedMs,...(fixed?{motionAmplitude:fixed.moving?450:0,motionPeriodMs:10000}:{})};
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
