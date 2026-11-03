import { enemyAiProfile, type EnemyAiLevel, type EnemyAiProfile } from '../../shared/enemy-ai.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { cityRegistry } from '../../shared/city-registry.mjs';
import { advanceHunterFlight, hunterFlightIntercept } from './hunter-flight.js';

type V = { x: number; y: number; z: number };
export type OpponentAircraft = keyof typeof aircraftFlightEnvelope;
export type OpponentDefinition = Readonly<{
  aircraft: OpponentAircraft; livery?: string; level: EnemyAiLevel; cityId: keyof typeof cityAirports;
  position: V; rotation: V; speed: number; health: number;
  airportId?: string; encounterId?: string; ownerId?: string;
  behavior: 'patrol'|'pursuit'|'ambush'|'escort'|'defend'|'attack'|'objective';
}>;
export type OpponentRuntime = {
  readonly definition: OpponentDefinition; readonly profile: EnemyAiProfile;
  readonly cosmetics: Readonly<Record<string, string>>;
  detectedTarget?: string; detectedAt: number; dodgeAt: number; dodgeUntil: number;
  threatAt?: number; threatOwner?: string;
};
const liveries = new Map(cosmeticCatalog.map(item => [item.id, item]));
const finiteVector = (p: V) => p && [p.x,p.y,p.z].every(Number.isFinite);

/** Server-authored only: no player entitlement or wallet operation occurs here. */
export function createOpponent(definition: OpponentDefinition): OpponentRuntime {
  if (!Object.hasOwn(aircraftFlightEnvelope, definition.aircraft)) throw new Error('Invalid opponent aircraft');
  const profile = enemyAiProfile(definition.level);
  if (!Object.hasOwn(cityRegistry, definition.cityId)) throw new Error('Invalid opponent city');
  const city=cityRegistry[definition.cityId] as {worldSize:number};
  if (finiteVector(definition.position) && Math.max(Math.abs(definition.position.x),Math.abs(definition.position.z))>city.worldSize) throw new Error('Opponent spawn is outside its city');
  if (!['patrol','pursuit','ambush','escort','defend','attack','objective'].includes(definition.behavior)) throw new Error('Invalid opponent behavior');
  if (!finiteVector(definition.position) || !finiteVector(definition.rotation) || !Number.isFinite(definition.speed) ||
    definition.speed < 0 || definition.speed > aircraftFlightEnvelope[definition.aircraft].maxSpeed ||
    !Number.isFinite(definition.health) || definition.health <= 0) throw new Error('Invalid opponent flight or hull');
  if (definition.airportId && !cityAirports[definition.cityId].some(a => a.id === definition.airportId)) throw new Error('Invalid opponent runway');
  if (definition.encounterId !== undefined && (!definition.encounterId || !definition.ownerId)) throw new Error('Invalid opponent encounter ownership');
  const cosmetic = definition.livery === undefined ? undefined : liveries.get(definition.livery);
  if (definition.livery !== undefined && (!cosmetic || cosmetic.category !== 'livery' || cosmetic.aircraftRestriction !== definition.aircraft)) throw new Error('Opponent livery does not belong to aircraft');
  return { definition: Object.freeze({ ...definition, position: Object.freeze({...definition.position}), rotation: Object.freeze({...definition.rotation}) }),
    profile, cosmetics: Object.freeze(cosmetic ? { [`livery:${definition.aircraft}`]: cosmetic.id } : {}), detectedAt: 0,
    dodgeAt: -Infinity, dodgeUntil: 0 };
}

export function opponentReactionReady(runtime: OpponentRuntime, targetId: string, now: number): boolean {
  if (runtime.detectedTarget !== targetId) { runtime.detectedTarget = targetId; runtime.detectedAt = now; }
  return now >= runtime.detectedAt + runtime.profile.reactionMs;
}

/** Slopes become angles before dispersion: each independent axis is truly bounded in radians. */
export function opponentAim(profile: EnemyAiProfile, x: number, y: number, random: () => number = Math.random): { x: number; y: number } {
  const error = () => (Math.max(0, Math.min(1, random())) * 2 - 1) * profile.aimError;
  return { x: Math.tan(Math.atan(x) + error()), y: Math.tan(Math.atan(y) + error()) };
}

export function opponentIntercept(position: V, speed: number, target: V, velocity: V): V {
  return hunterFlightIntercept(position, speed, target, velocity);
}
export type OpponentBullet = { position: V; direction: V; speed: number; ownerId?: string };
export function incomingOpponentThreat(enemy: { position: V; velocity: V }, bullets: Iterable<OpponentBullet>): OpponentBullet | undefined {
  let earliest = 1.21, threat: OpponentBullet | undefined;
  for (const bullet of bullets) {
    const rx = bullet.position.x - enemy.position.x, ry = bullet.position.y - enemy.position.y, rz = bullet.position.z - enemy.position.z;
    const vx = bullet.direction.x * bullet.speed - enemy.velocity.x, vy = bullet.direction.y * bullet.speed - enemy.velocity.y, vz = bullet.direction.z * bullet.speed - enemy.velocity.z;
    const v2 = vx*vx+vy*vy+vz*vz;
    if (v2 < 1) continue;
    const t = -(rx*vx+ry*vy+rz*vz)/v2;
    if (t >= 0 && t < earliest && Math.hypot(rx+vx*t,ry+vy*t,rz+vz*t) < 65) { earliest=t; threat=bullet; }
  }
  return threat;
}

/** Predict candidates with the same bank/acceleration integrator used for real flight. */
export function opponentDodge(aircraftType: OpponentAircraft, enemy: {position: V; rotation: V; velocity: V}, speed: number,
  bullets: readonly OpponentBullet[], floorAt: (x:number,z:number)=>number, inside: (p:V)=>boolean = ()=>true): V | undefined {
  let bestScore=-Infinity, best: V | undefined;
  for (const side of [-1,1]) {
    const p={ aircraftType, position:{...enemy.position}, rotation:{...enemy.rotation}, velocity:{...enemy.velocity} };
    const motion={ speed, bankControl:0, combatTurnSign:side };
    const f={x:-Math.sin(p.rotation.y),z:-Math.cos(p.rotation.y)};
    const target={x:p.position.x+f.x*2000+f.z*side*1400,y:p.position.y+100,z:p.position.z+f.z*2000-f.x*side*1400};
    let score=Infinity;
    for(let step=1;step<=12;step++) {
      advanceHunterFlight(p,motion,target,speed,.1,floorAt);
      if(!inside(p.position)||p.position.y<=floorAt(p.position.x,p.position.z)) {score=-Infinity;break;}
      for(const b of bullets) {const t=step*.1;score=Math.min(score,Math.hypot(p.position.x-b.position.x-b.direction.x*b.speed*t,p.position.y-b.position.y-b.direction.y*b.speed*t,p.position.z-b.position.z-b.direction.z*b.speed*t));}
    }
    if(score>bestScore) {bestScore=score;best=target;}
  }
  return best;
}

/** Threat detection/reaction and maneuver cooldown are independent of flight rate. */
export function chooseOpponentEvasion(runtime: OpponentRuntime, enemy: { position:V;rotation:V;velocity:V }, speed:number,
  bullets:readonly OpponentBullet[], now:number, floorAt:(x:number,z:number)=>number, inside?:(p:V)=>boolean): V | undefined {
  if (now-runtime.dodgeAt < runtime.profile.dodgeCooldownMs) return undefined;
  const threat=incomingOpponentThreat(enemy,bullets);
  if (!threat) {runtime.threatAt=undefined;runtime.threatOwner=undefined;return undefined;}
  if(runtime.threatAt===undefined || runtime.threatOwner!==threat.ownerId) {runtime.threatAt=now;runtime.threatOwner=threat.ownerId;}
  if(now-runtime.threatAt<runtime.profile.reactionMs) return undefined;
  const waypoint=opponentDodge(runtime.definition.aircraft,enemy,speed,bullets,floorAt,inside);
  if(waypoint) {runtime.dodgeAt=now;runtime.dodgeUntil=now+1200;runtime.threatAt=undefined;}
  return waypoint;
}

export function hasClientOpponentOverride(message: unknown): boolean {
  return Boolean(message && typeof message==='object' && ['opponent','opponentConfig','enemyConfig','aiLevel','enemyAircraft','enemyHealth','enemyLivery','difficulty'].some(key=>Object.hasOwn(message,key)));
}
