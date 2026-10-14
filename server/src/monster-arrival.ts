import { readFileSync } from 'node:fs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { monsterGeometry } from '../../shared/monster-arrival-geometry.mjs';
import { monsterJumpMotion, monsterJumpLift } from '../../shared/monster-motion.mjs';
import { COMBAT_RANGE } from '../../shared/protocol.mjs';

export type Point3 = { x: number; y: number; z: number };
export type MonsterSphere = { x: number; y: number; z: number; radius: number };
export type MonsterShot = { id: number; position: Point3; direction: Point3; bornAt: number; speed: number; lifeMs: number };
export type MonsterEncounter = {
  attemptId: string; playerId: string; startedAt: number; x: number; z: number; yaw: number;
  nextAttackAt: number; windupUntil: number; attackSequence: number; hitSequence: number;
  yawVelocity: number; aimYaw: number; aimPitch: number; gaitPhase: number;
  travelSinceAttack: number; blockedSeconds: number; roamIndex: number; roamDirection: number; nextJumpAt: number; jumpStartedAt: number; jumpProgress: number | null; jumpHeight: number;
  jumpFrom: Point3; jumpTo: Point3;
  moveSpeed: number; motionCell?: string; motionSource?: readonly Building[]; motionBuildings?: readonly Building[];
  velocity: Point3; attackKind: 'single' | 'fan'; pendingFan: { at: number; spread: number }[];
  lastPlayerHitAt: number; sustainedSince: number; sustainedPosition?: Point3;
  hitPosition?: Point3;
  contactAt: number; shots: MonsterShot[]; lastTickAt: number; lastBroadcastAt: number;
};

export const monsterAttack = Object.freeze({ damage: 25, radius: 22, intervalMs: 8_000, windupMs: 1_500,
  maxLive: 4, turnRate: Math.PI / 12, turnAcceleration: Math.PI / 7, arc: 40 * Math.PI / 180,
  travelSeconds: 2, minSpeed: 150, maxSpeed: 2_800, leadSeconds: 0.3,
  walkSpeed: 42, walkAcceleration: 12, walkStopDistance: 720, pursuitLeash: 3_400,
  jumpDistance: monsterJumpMotion.distance, jumpHeight: monsterJumpMotion.height, jumpDurationMs: monsterJumpMotion.durationMs, jumpIntervalMs: monsterJumpMotion.intervalMs,
  sustainedMs: 8_000, relocation: 120, fanSpacingMs: 280, fanSpread: 4 * Math.PI / 180,
});
export const monsterAttackRange = COMBAT_RANGE + journeyDallas19.monster.height *
  Math.max(...monsterGeometry.spheres.map(s => Math.hypot(s.x-monsterGeometry.mouth.x,
    s.y-monsterGeometry.mouth.y,s.z-monsterGeometry.mouth.z)+s.radius));
// Source-Near building and terrain checks establish this broad west-Trinity
// corridor. Its endpoints allow full turns; there is no city-wide map mutation.
export const monsterRoamRoute = Object.freeze([
  {x:-8400,z:-2400}, {x:-7300,z:-2400}, {x:-6200,z:-2400}, {x:-5500,z:-2400},
]);
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createMonsterEncounter(attemptId: string, playerId: string, startedAt: number): MonsterEncounter {
  return {
    attemptId, playerId, startedAt, x: journeyDallas19.monster.x, z: journeyDallas19.monster.z,
    yaw: Math.atan2(journeyDallas19.monster.x - journeyDallas19.airborneSpawn.x,
      journeyDallas19.monster.z - journeyDallas19.airborneSpawn.z),
    nextAttackAt: startedAt + 5_000, windupUntil: 0, attackSequence: 0,
    travelSinceAttack: 200, blockedSeconds: 0, roamIndex: 2, roamDirection: -1, nextJumpAt: startedAt+12_000, jumpStartedAt: 0, jumpProgress: null, jumpHeight: 0,
    jumpFrom: {x:0,y:0,z:0}, jumpTo: {x:0,y:0,z:0},
    yawVelocity: 0, aimYaw: 0, aimPitch: 0, gaitPhase: 0, velocity: {x:0,y:0,z:0}, moveSpeed: 0,
    attackKind: 'single', pendingFan: [], lastPlayerHitAt: 0, sustainedSince: 0,
    hitSequence: 0, contactAt: 0, shots: [], lastTickAt: startedAt, lastBroadcastAt: 0,
  };
}

export function distanceToSegmentSquared(point: Point3, a: Point3, b: Point3): number {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const length = vx * vx + vy * vy + vz * vz;
  const t = length > 0 ? Math.max(0, Math.min(1,
    ((point.x - a.x) * vx + (point.y - a.y) * vy + (point.z - a.z) * vz) / length)) : 0;
  return (a.x + t * vx - point.x) ** 2 + (a.y + t * vy - point.y) ** 2 + (a.z + t * vz - point.z) ** 2;
}

/** Fitted repaired-mesh volumes, uniformly scaled with the configured creature dimensions. */
export function monsterSpheres(encounter: MonsterEncounter, groundY: number): MonsterSphere[] {
  groundY+=encounter.jumpHeight;
  const c = Math.cos(encounter.yaw), s = Math.sin(encounter.yaw), height = journeyDallas19.monster.height;
  return monsterGeometry.spheres.map(volume => {
    const v=monsterAimPoint(encounter,volume,volume.part);
    return {x:encounter.x+height*(c*v.x+s*v.z),y:groundY+height*v.y,
      z:encounter.z+height*(-s*v.x+c*v.z),radius:height*volume.radius};
  });
}

function rotateAimPoint(point:Point3,pivot:Point3,yaw:number,pitch:number,inverse=false):Point3 {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const x=point.x-pivot.x,y=point.y-pivot.y,z=point.z-pivot.z;
  if(inverse){const vy=cp*y+sp*z,vz=-sp*y+cp*z;
    return {x:pivot.x+cy*x-sy*vz,y:pivot.y+vy,z:pivot.z+sy*x+cy*vz};}
  const vz=-sy*x+cy*z;
  return {x:pivot.x+cy*x+sy*z,y:pivot.y+cp*y-sp*vz,z:pivot.z+sp*y+cp*vz};
}

/** Same neck/head chain as the renderer, also inverted for physical hit tests. */
function monsterAimPoint(e:MonsterEncounter,point:Point3,part:string,inverse=false):Point3 {
  if(!part.startsWith('Neck')&&!part.startsWith('Head')&&!part.startsWith('Jaw'))return point;
  const n=monsterGeometry.neckPivot,p=monsterGeometry.headPivot;
  const head=rotateAimPoint(p,n,e.aimYaw*.35,e.aimPitch*.35);
  const headPart=!part.startsWith('Neck');
  if(inverse){const v=headPart?rotateAimPoint(point,head,e.aimYaw*.65,e.aimPitch*.65,true):point;
    return rotateAimPoint(v,n,e.aimYaw*.35,e.aimPitch*.35,true);}
  const v=rotateAimPoint(point,n,e.aimYaw*.35,e.aimPitch*.35);
  return headPart?rotateAimPoint(v,head,e.aimYaw*.65,e.aimPitch*.65):v;
}

export function monsterMouth(encounter:MonsterEncounter,groundY:number):Point3 {
  groundY+=encounter.jumpHeight;
  const h=journeyDallas19.monster.height,v=monsterAimPoint(encounter,monsterGeometry.mouth,'Head');
  return {x:encounter.x+h*(Math.cos(encounter.yaw)*v.x+Math.sin(encounter.yaw)*v.z),
    y:groundY+h*v.y,z:encounter.z+h*(-Math.sin(encounter.yaw)*v.x+Math.cos(encounter.yaw)*v.z)};
}

/** Accelerate and brake the authoritative body; presentation never chooses yaw. */
export function turnMonster(encounter: MonsterEncounter, target: Point3, delta: number): void {
  const targetYaw = Math.atan2(encounter.x-target.x, encounter.z-target.z);
  const error = wrap(targetYaw-encounter.yaw);
  const limit = Math.min(monsterAttack.turnRate, Math.sqrt(2*monsterAttack.turnAcceleration*Math.abs(error)));
  const wanted = Math.sign(error)*limit;
  encounter.yawVelocity += Math.max(-monsterAttack.turnAcceleration*delta,
    Math.min(monsterAttack.turnAcceleration*delta,wanted-encounter.yawVelocity));
  const step = encounter.yawVelocity*delta;
  encounter.yaw = wrap(encounter.yaw + (Math.sign(step) === Math.sign(error) && Math.abs(step)>Math.abs(error) ? error : step));
  const aim=Math.max(-Math.PI/10,Math.min(Math.PI/10,wrap(targetYaw-encounter.yaw)));
  encounter.aimYaw+=Math.max(-Math.PI/4*delta,Math.min(Math.PI/4*delta,aim-encounter.aimYaw));
}

export function monsterAttackEligible(encounter: MonsterEncounter, target: Point3, groundY: number): boolean {
  const mouth=monsterMouth(encounter,groundY);
  return Math.hypot(target.x-mouth.x,target.y-mouth.y,target.z-mouth.z) <= monsterAttackRange &&
    Math.abs(wrap(Math.atan2(encounter.x-target.x,encounter.z-target.z)-encounter.yaw)) <= monsterAttack.arc;
}

export function recordMonsterFiringPosition(encounter: MonsterEncounter, position: Point3, now: number): void {
  if (!encounter.sustainedPosition || now-encounter.lastPlayerHitAt>2_000 ||
    Math.hypot(position.x-encounter.sustainedPosition.x,position.y-encounter.sustainedPosition.y,
      position.z-encounter.sustainedPosition.z)>monsterAttack.relocation) {
    encounter.sustainedPosition={...position};encounter.sustainedSince=now;
  }
  encounter.lastPlayerHitAt=now;
}

export function monsterShotSolution(encounter: MonsterEncounter, groundY: number, target: Point3,
  velocity: Point3): Omit<MonsterShot,'id'|'bornAt'> {
  const position=monsterMouth(encounter,groundY);
  const distance=Math.hypot(target.x-position.x,target.y-position.y,target.z-position.z);
  const speed=Math.max(monsterAttack.minSpeed,Math.min(monsterAttack.maxSpeed,distance/monsterAttack.travelSeconds));
  const lead=Math.min(monsterAttack.leadSeconds,distance/speed*.15);
  const predicted={x:target.x+velocity.x*lead,y:target.y+velocity.y*lead,z:target.z+velocity.z*lead};
  const direction=normalizeDirection(position,predicted);
  // Per-shot lifetime covers the allowed damage envelope plus a bounded miss
  // margin. Direction is immutable after release: these are never homing shots.
  return {position,direction,speed,lifeMs:Math.ceil((distance/speed+.65)*1000)};
}

export function stepMonsterEncounter(encounter: MonsterEncounter, target: Point3, velocity: Point3,
  groundAt: (x:number,z:number)=>number, buildings: readonly Building[], now: number): void {
  const delta=Math.max(0,Math.min(.1,(now-encounter.lastTickAt)/1000));encounter.lastTickAt=now;
  const before={x:encounter.x,z:encounter.z};
  const targetYaw=Math.atan2(encounter.x-target.x,encounter.z-target.z);
  const candidates=nearbyMotionBuildings(encounter,buildings);
  let goal=monsterRoamRoute[encounter.roamIndex]!;
  if(Math.hypot(encounter.x-goal.x,encounter.z-goal.z)<100){
    if(encounter.roamIndex===0)encounter.roamDirection=1;
    if(encounter.roamIndex===monsterRoamRoute.length-1)encounter.roamDirection=-1;
    encounter.roamIndex+=encounter.roamDirection;goal=monsterRoamRoute[encounter.roamIndex]!;
  }
  // Follow the pilot along the corridor when they relocate; reaching their
  // nearest point does not make the creature a stationary statue.
  if(target.x>monsterRoamRoute[0]!.x+200 && target.x<monsterRoamRoute[monsterRoamRoute.length-1]!.x-200 && Math.abs(target.x-encounter.x)>1_400){
    const direction=target.x<encounter.x?-1:1;
    if(direction!==encounter.roamDirection && encounter.roamIndex>0 && encounter.roamIndex<monsterRoamRoute.length-1){
      encounter.roamDirection=direction;encounter.roamIndex+=direction;goal=monsterRoamRoute[encounter.roamIndex]!;
    }
  }
  const readyToAttack=encounter.travelSinceAttack>=200 || encounter.blockedSeconds>=4;
  const attackMouth=monsterMouth(encounter,groundAt(encounter.x,encounter.z));
  const preparingAttack=readyToAttack && now>=encounter.nextAttackAt-2_000 &&
    Math.hypot(target.x-attackMouth.x,target.y-attackMouth.y,target.z-attackMouth.z)<=monsterAttackRange &&
    !segmentBlockedByBuildings(attackMouth,target,buildings);
  const steering:Point3=preparingAttack||encounter.windupUntil||encounter.pendingFan.length?target:{...goal,y:target.y};
  const previousAim=encounter.aimYaw;
  if(encounter.jumpProgress===null && (!preparingAttack || encounter.moveSpeed<.1))turnMonster(encounter,steering,delta);
  else encounter.yawVelocity=0;
  encounter.aimYaw=previousAim;
  // Head keeps following the pilot while the body takes a safe turning step.
  const aim=Math.max(-Math.PI/10,Math.min(Math.PI/10,wrap(targetYaw-encounter.yaw)));
  encounter.aimYaw+=Math.max(-Math.PI/4*delta,Math.min(Math.PI/4*delta,aim-encounter.aimYaw));
  const alignment=Math.max(0,Math.cos(wrap(Math.atan2(encounter.x-steering.x,encounter.z-steering.z)-encounter.yaw)));
  const dx=-Math.sin(encounter.yaw),dz=-Math.cos(encounter.yaw);
  const paused=preparingAttack||encounter.windupUntil||encounter.pendingFan.length;
  if(encounter.jumpProgress===null && !paused && alignment>.995 && now>=encounter.nextJumpAt){
    encounter.nextJumpAt=now+1_000; // Bounded terrain checks, never per render tick.
    const end={x:encounter.x+dx*monsterAttack.jumpDistance,y:0,z:encounter.z+dz*monsterAttack.jumpDistance};
    if(Math.hypot(end.x-goal.x,end.z-goal.z)<Math.hypot(encounter.x-goal.x,encounter.z-goal.z) &&
       Math.hypot(end.x-journeyDallas19.monster.x,end.z-journeyDallas19.monster.z)<monsterAttack.pursuitLeash &&
       monsterJumpClear(encounter,end,groundAt,candidates)){
      encounter.jumpFrom={x:encounter.x,y:0,z:encounter.z};encounter.jumpTo=end;
      encounter.jumpStartedAt=now;encounter.jumpProgress=0;encounter.moveSpeed=0;
      encounter.nextJumpAt=now+monsterAttack.jumpIntervalMs;
    }
  }
  if(encounter.jumpProgress!==null){
    const phase=Math.min(1,(now-encounter.jumpStartedAt)/monsterAttack.jumpDurationMs);
    const flight=Math.max(0,Math.min(1,(phase-monsterJumpMotion.anticipationEnd)/(monsterJumpMotion.landingStart-monsterJumpMotion.anticipationEnd)));
    encounter.jumpProgress=phase;
    encounter.jumpHeight=monsterJumpLift(phase);
    encounter.x=encounter.jumpFrom.x+(encounter.jumpTo.x-encounter.jumpFrom.x)*flight;
    encounter.z=encounter.jumpFrom.z+(encounter.jumpTo.z-encounter.jumpFrom.z)*flight;
    if(phase>=1){encounter.jumpProgress=null;encounter.jumpHeight=0;}
  }else{
    const wanted=paused||alignment<.995?0:monsterAttack.walkSpeed;
    encounter.moveSpeed+=Math.max(-monsterAttack.walkAcceleration*delta,Math.min(monsterAttack.walkAcceleration*delta,wanted-encounter.moveSpeed));
    const step=encounter.moveSpeed*delta,x=encounter.x+dx*step,z=encounter.z+dz*step;
    if(Math.hypot(x-journeyDallas19.monster.x,z-journeyDallas19.monster.z)<=monsterAttack.pursuitLeash &&
      monsterMotionClear(x,z,encounter.yaw,groundAt,candidates)){encounter.x=x;encounter.z=z;}
    else {encounter.moveSpeed=Math.max(0,encounter.moveSpeed-monsterAttack.walkAcceleration*delta*2);encounter.blockedSeconds+=delta;}
  }
  const traveled=Math.hypot(encounter.x-before.x,encounter.z-before.z);
  encounter.travelSinceAttack+=traveled;
  if(traveled>.001)encounter.blockedSeconds=0;
  encounter.velocity={x:delta?(encounter.x-before.x)/delta:0,y:0,z:delta?(encounter.z-before.z)/delta:0};
  if(encounter.jumpProgress===null)encounter.gaitPhase+=delta*Math.max(Math.hypot(encounter.velocity.x,encounter.velocity.z)/14/(journeyDallas19.monster.height/480),
    Math.abs(encounter.yawVelocity)/monsterAttack.turnRate*1.6)/4.8;
  const groundY=groundAt(encounter.x,encounter.z),mouth=monsterMouth(encounter,groundY);
  const pitch=Math.max(-.42,Math.min(.42,Math.atan2(target.y-mouth.y,Math.hypot(target.x-mouth.x,target.z-mouth.z))));
  encounter.aimPitch+=Math.max(-.7*delta,Math.min(.7*delta,pitch-encounter.aimPitch));
  const line=!segmentBlockedByBuildings(mouth,target,buildings);
  if (encounter.sustainedPosition && (!line || now-encounter.lastPlayerHitAt>2_000 ||
    Math.hypot(target.x-encounter.sustainedPosition.x,target.y-encounter.sustainedPosition.y,target.z-encounter.sustainedPosition.z)>monsterAttack.relocation)) {
    encounter.sustainedPosition=undefined;encounter.sustainedSince=0;
  }
  const eligible=encounter.jumpProgress===null && line && monsterAttackEligible(encounter,target,groundY);
  if (!encounter.windupUntil && readyToAttack && now>=encounter.nextAttackAt && eligible && encounter.shots.length<monsterAttack.maxLive && !encounter.pendingFan.length) {
    encounter.attackKind=encounter.sustainedSince && now-encounter.sustainedSince>=monsterAttack.sustainedMs ? 'fan':'single';
    encounter.windupUntil=now+monsterAttack.windupMs;
  }
  if (encounter.windupUntil && now>=encounter.windupUntil) {
    encounter.windupUntil=0;encounter.nextAttackAt=now+monsterAttack.intervalMs;encounter.travelSinceAttack=0;
    if (eligible) {
      const count=Math.min(encounter.attackKind==='fan'?3:1,monsterAttack.maxLive-encounter.shots.length);
      for(let i=0;i<count;i++) encounter.pendingFan.push({at:now+i*monsterAttack.fanSpacingMs,
        spread:count===3?(i-1)*monsterAttack.fanSpread:0});
    }
  }
  // A player flying behind the body cancels remaining fan releases as well.
  if (!eligible) encounter.pendingFan.length=0;
  while (encounter.pendingFan[0] && encounter.pendingFan[0].at<=now && encounter.shots.length<monsterAttack.maxLive) {
    const pending=encounter.pendingFan.shift()!;
    const solution=monsterShotSolution(encounter,groundY,target,velocity);
    const c=Math.cos(pending.spread),s=Math.sin(pending.spread),d=solution.direction;
    encounter.shots.push({...solution,direction:{x:c*d.x+s*d.z,y:d.y,z:-s*d.x+c*d.z},
      id:++encounter.attackSequence,bornAt:now});
  }
}

/** Relative swept motion detects both stationary pilots and fast crossing dodges. */
export function monsterProjectileHits(shot: MonsterShot, before: Point3, pilot: Point3, pilotVelocity: Point3,
  pilotRadius: number, delta: number): boolean {
  const relativeEnd={x:shot.position.x-pilot.x,y:shot.position.y-pilot.y,z:shot.position.z-pilot.z};
  const relativeStart={x:before.x-pilot.x+pilotVelocity.x*delta,
    y:before.y-pilot.y+pilotVelocity.y*delta,z:before.z-pilot.z+pilotVelocity.z*delta};
  return distanceToSegmentSquared({x:0,y:0,z:0},relativeStart,relativeEnd)<=(monsterAttack.radius+pilotRadius)**2;
}

/** First physical impact along the swept projectile path, including limb/tail hits. */
export function monsterImpact(encounter: MonsterEncounter, groundY: number, a: Point3, b: Point3, projectileRadius = 1): Point3 | undefined {
  groundY+=encounter.jumpHeight;
  const c=Math.cos(encounter.yaw),s=Math.sin(encounter.yaw),h=journeyDallas19.monster.height;
  const ax=(c*(a.x-encounter.x)-s*(a.z-encounter.z))/h,ay=(a.y-groundY)/h,
    az=(s*(a.x-encounter.x)+c*(a.z-encounter.z))/h;
  const dx=(c*(b.x-a.x)-s*(b.z-a.z))/h,dy=(b.y-a.y)/h,dz=(s*(b.x-a.x)+c*(b.z-a.z))/h;
  let first=Infinity;
  for(const volume of monsterGeometry.spheres) {
    // Anatomical ellipsoids use the actual per-axis surface bounds. A broad
    // head/shoulder must not produce a spherical hit region above the creature.
    const rx=volume.radii.x+projectileRadius/h,ry=volume.radii.y+projectileRadius/h,rz=volume.radii.z+projectileRadius/h;
    const start=monsterAimPoint(encounter,{x:ax,y:ay,z:az},volume.part,true);
    const end=monsterAimPoint(encounter,{x:ax+dx,y:ay+dy,z:az+dz},volume.part,true);
    const x=(start.x-volume.x)/rx,y=(start.y-volume.y)/ry,z=(start.z-volume.z)/rz;
    const vx=(end.x-start.x)/rx,vy=(end.y-start.y)/ry,vz=(end.z-start.z)/rz,length=vx*vx+vy*vy+vz*vz;
    if(length<=0)continue;
    const projection=x*vx+y*vy+z*vz,discriminant=projection*projection-length*(x*x+y*y+z*z-1);
    if(discriminant<0)continue;
    const enter=(-projection-Math.sqrt(discriminant))/length,exit=(-projection+Math.sqrt(discriminant))/length;
    if(exit>=0 && enter<=1)first=Math.min(first,Math.max(0,enter));
  }
  return Number.isFinite(first)?{x:a.x+(b.x-a.x)*first,y:a.y+(b.y-a.y)*first,z:a.z+(b.z-a.z)*first}:undefined;
}

export function monsterBodyContact(encounter: MonsterEncounter, groundY: number, point: Point3, radius: number): boolean {
  groundY+=encounter.jumpHeight;
  const c=Math.cos(encounter.yaw),s=Math.sin(encounter.yaw),h=journeyDallas19.monster.height;
  const x=(c*(point.x-encounter.x)-s*(point.z-encounter.z))/h,y=(point.y-groundY)/h,
    z=(s*(point.x-encounter.x)+c*(point.z-encounter.z))/h;
  return monsterGeometry.spheres.some(v=>{
    const p=monsterAimPoint(encounter,{x,y,z},v.part,true);
    return ((p.x-v.x)/(v.radii.x+radius/h))**2+((p.y-v.y)/(v.radii.y+radius/h))**2+((p.z-v.z)/(v.radii.z+radius/h))**2<=1;
  });
}

export function sweptMonsterHit(encounter: MonsterEncounter, groundY: number, a: Point3, b: Point3, projectileRadius = 1): boolean {
  return monsterImpact(encounter, groundY, a, b, projectileRadius) !== undefined;
}

type Building = { minX: number; maxX: number; minZ: number; maxZ: number; top: number };
const buildingIndexes = new WeakMap<readonly Building[], {cells:Map<string,number[]>;marks:Uint32Array;stamp:number}>();
const occlusionCellSize=256;

/** Existing spatial index also bounds pursuit queries; no full district scan per tick. */
function nearbyMotionBuildings(e:MonsterEncounter,buildings:readonly Building[]):readonly Building[] {
  const cell=`${Math.floor(e.x/128)},${Math.floor(e.z/128)}`;
  if(e.motionCell===cell && e.motionSource===buildings)return e.motionBuildings!;
  const index=buildingIndexes.get(buildings),near:Building[]=[];
  if(index){
    index.stamp=(index.stamp+1)>>>0;if(!index.stamp){index.marks.fill(0);index.stamp=1;}
    for(let x=Math.floor((e.x-900)/occlusionCellSize);x<=Math.floor((e.x+900)/occlusionCellSize);x++)
      for(let z=Math.floor((e.z-900)/occlusionCellSize);z<=Math.floor((e.z+900)/occlusionCellSize);z++)
        for(const id of index.cells.get(`${x},${z}`)??[]){if(index.marks[id]===index.stamp)continue;index.marks[id]=index.stamp;near.push(buildings[id]!);}
  }else for(const b of buildings)if(b.maxX>=e.x-900 && b.minX<=e.x+900 && b.maxZ>=e.z-900 && b.minZ<=e.z+900)near.push(b);
  e.motionCell=cell;e.motionSource=buildings;e.motionBuildings=near;return near;
}

/** Keep low anatomy and planted feet clear of the real mapped building tops. */
export function monsterMotionClear(x:number,z:number,yaw:number,groundAt:(x:number,z:number)=>number,buildings:readonly Building[],lift=0):boolean {
  const ground=groundAt(x,z),h=journeyDallas19.monster.height,c=Math.cos(yaw),s=Math.sin(yaw);
  for(const side of [-1,1]){
    const fx=x+h*(c*monsterGeometry.footX*side+s*monsterGeometry.footZ);
    const fz=z+h*(-s*monsterGeometry.footX*side+c*monsterGeometry.footZ);
    if(lift<=0 && Math.abs(groundAt(fx,fz)-ground)>24)return false;
  }
  for(const v of monsterGeometry.spheres){
    const cy=ground+lift+h*v.y,ry=h*v.radii.y,cx=x+h*(c*v.x+s*v.z),cz=z+h*(-s*v.x+c*v.z);
    for(const b of buildings){
      if(b.top<cy-ry)continue;
      const slice=Math.sqrt(Math.max(0,1-(Math.max(0,cy-b.top)/ry)**2));
      const rx=h*v.radii.x*slice+24,rz=h*v.radii.z*slice+24;
      const bx=(b.minX+b.maxX)/2,bz=(b.minZ+b.maxZ)/2,bw=(b.maxX-b.minX)/2,bd=(b.maxZ-b.minZ)/2;
      const dx=bx-cx,dz=bz-cz,ac=Math.abs(c),as=Math.abs(s);
      // Conservative oriented surface bounds: the old largest-radius circle
      // rejected clear paths beside long, narrow feet and the tail.
      if(Math.abs(dx)>bw+ac*rx+as*rz || Math.abs(dz)>bd+as*rx+ac*rz ||
        Math.abs(c*dx-s*dz)>rx+ac*bw+as*bd || Math.abs(s*dx+c*dz)>rz+as*bw+ac*bd)continue;
      return false;
    }
  }
  return true;
}

/** Validate the entire ballistic footprint and both grounded endpoints. */
export function monsterJumpClear(e:MonsterEncounter,end:Point3,groundAt:(x:number,z:number)=>number,buildings:readonly Building[]):boolean {
  if(Math.abs(groundAt(end.x,end.z)-groundAt(e.x,e.z))>24)return false;
  for(let i=0;i<=16;i++){
    const t=i/16,x=e.x+(end.x-e.x)*t,z=e.z+(end.z-e.z)*t;
    if(!monsterMotionClear(x,z,e.yaw,groundAt,buildings,monsterAttack.jumpHeight*4*t*(1-t)))return false;
  }
  return true;
}

/** Uses the version-3 Near source: coarse LODs must never define combat occlusion. */
export function loadMonsterDistrictBuildings(): Building[] {
  const result: Building[] = [];
  // Cover every permitted firing origin, including long-range western and
  // northern approaches; the old 16-cell cache stopped short of that envelope.
  const reach=monsterAttackRange+journeyDallas19.monster.height*Math.hypot(monsterGeometry.mouth.x,monsterGeometry.mouth.z)+300;
  const coverageMinX=Math.min(...monsterRoamRoute.map(p=>p.x))-reach,coverageMaxX=Math.max(...monsterRoamRoute.map(p=>p.x))+reach;
  const coverageMinZ=Math.min(...monsterRoamRoute.map(p=>p.z))-reach,coverageMaxZ=Math.max(...monsterRoamRoute.map(p=>p.z))+reach;
  const minCellX=Math.floor(coverageMinX/2000),maxCellX=Math.floor(coverageMaxX/2000);
  const minCellZ=Math.floor(coverageMinZ/2000),maxCellZ=Math.floor(coverageMaxZ/2000);
  for (let x = minCellX; x <= maxCellX; x++) for (let z = minCellZ; z <= maxCellZ; z++) {
    const chunk = JSON.parse(readFileSync(new URL(`../../client/public/data/dallas/near/${x}_${z}.json`, import.meta.url), 'utf8')) as { b: number[][] };
    for (const building of chunk.b) {
      const xs: number[] = [], zs: number[] = [];
      for (let i = 4; i + 1 < building.length; i += 2) { xs.push(building[i]!); zs.push(building[i + 1]!); }
      if (xs.length < 3) continue;
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      if (maxX < coverageMinX || minX > coverageMaxX || maxZ < coverageMinZ || minZ > coverageMaxZ) continue;
      result.push({ minX, maxX, minZ, maxZ, top: building[3]! + building[0]! });
    }
  }
  indexBuildingsForOcclusion(result);
  return result;
}

/** Reuse the existing bounded cell queries for another mission-owned building set. */
export function indexBuildingsForOcclusion(buildings:readonly Building[]):void {
  const index={cells:new Map<string,number[]>(),marks:new Uint32Array(buildings.length),stamp:0};
  for(let id=0;id<buildings.length;id++) {
    const b=buildings[id]!;
    for(let x=Math.floor(b.minX/occlusionCellSize);x<=Math.floor(b.maxX/occlusionCellSize);x++)
      for(let z=Math.floor(b.minZ/occlusionCellSize);z<=Math.floor(b.maxZ/occlusionCellSize);z++) {
        const key=`${x},${z}`,cell=index.cells.get(key);
        if(cell)cell.push(id);else index.cells.set(key,[id]);
      }
  }
  buildingIndexes.set(buildings,index);
}

export function segmentBlockedByBuildings(a: Point3, b: Point3, buildings: readonly Building[]): boolean {
  const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z),minY=Math.min(a.y,b.y);
  const intersects=(building:Building):boolean => {
    if(building.maxX<minX || building.minX>maxX || building.maxZ<minZ || building.minZ>maxZ || minY>building.top+1)return false;
    let enter=0,leave=1;const dx=b.x-a.x,dz=b.z-a.z;
    for(const [p,q] of [[-dx,a.x-building.minX],[dx,building.maxX-a.x],[-dz,a.z-building.minZ],[dz,building.maxZ-a.z]]) {
      if(p===0){if(q<0)return false;continue;}
      const t=q/p;if(p<0)enter=Math.max(enter,t);else leave=Math.min(leave,t);
    }
    if(enter>leave)return false;
    return Math.min(a.y+(b.y-a.y)*enter,a.y+(b.y-a.y)*leave)<=building.top+1;
  };
  const index=buildingIndexes.get(buildings);
  if(!index)return buildings.some(intersects);
  index.stamp=(index.stamp+1)>>>0;
  if(!index.stamp){index.marks.fill(0);index.stamp=1;}
  for(let x=Math.floor(minX/occlusionCellSize);x<=Math.floor(maxX/occlusionCellSize);x++)
    for(let z=Math.floor(minZ/occlusionCellSize);z<=Math.floor(maxZ/occlusionCellSize);z++) {
      const cell=index.cells.get(`${x},${z}`);if(!cell)continue;
      for(const id of cell) {
        if(index.marks[id]===index.stamp)continue;index.marks[id]=index.stamp;
        if(intersects(buildings[id]!))return true;
      }
    }
  return false;
}

export function normalizeDirection(a: Point3, b: Point3): Point3 {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
}
