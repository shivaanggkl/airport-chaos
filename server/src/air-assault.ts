import { planOpponentTactics, recordOpponentShot } from './opponent-tactics.js';
import { createOpponent, opponentIntercept, incomingOpponentThreat, opponentDodge, chooseOpponentEvasion, type OpponentRuntime, type OpponentDefinition } from './opponent.js';
import { advanceHunterFlight, hunterBallisticSolution } from './hunter-flight.js';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PlayerWallet } from './player-wallet.js';
import { airAssaultRules as rules, airAssaultTiers as tiers, airAssaultManifest, airAssaultAirports, airAssaultQueuePosition, airAssaultInside, airAssaultHearts, type AssaultTier, type AssaultVector as V, type AssaultEnemy, type AssaultSnapshot } from '../../shared/air-assault.mjs';
import { ballisticIntercept, ballisticShotSpeed, COMBAT_RANGE, BASE_PROJECTILE_SPEED } from '../../shared/protocol.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { DALLAS_WORLD_SCALE } from '../../shared/dallas-world-scale.mjs';
export class AirAssaultRewards {
  private db: DatabaseSync;
  private wallet: PlayerWallet;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    this.wallet = new PlayerWallet(this.db);
    this.db.exec('CREATE TABLE IF NOT EXISTS air_assault_daily (pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id), day TEXT NOT NULL, match_id TEXT NOT NULL, reward INTEGER NOT NULL, PRIMARY KEY(pilot_id,day))');
  }
  settle(pilotId: string, matchId: string, startedAt: number | null, result: AssaultSnapshot['result'], now: number): {
    reward: number;
    dailyClaimed: boolean;
  } {
    if (startedAt === null || now < startedAt || result !== 'full' && result !== 'survival')
      return { reward: 0, dailyClaimed: false };
    const amount = result === 'full' ? rules.fullCredits : rules.survivalCredits;
    const day = new Date(now).toISOString().slice(0, 10);
    const pilotKey = createHash('sha256').update(pilotId).digest('hex').slice(0, 32);
    return this.wallet.transaction(wallet => {
      if (this.db.prepare('SELECT 1 FROM air_assault_daily WHERE pilot_id=? AND day=?').get(pilotId, day))
        return { reward: 0, dailyClaimed: true };
      const before = wallet.balances(pilotId)?.credits;
      const paid = wallet.credit({ pilotId, currency: 'CREDITS', amount, reason: 'EVENT_REWARD', idempotencyKey: `air-assault:${pilotKey}:${day}`, referenceId: matchId, context: { mode: 'air-assault', result }, createdAt: now });
      if (!paid.ok || before === undefined)
        throw new Error('Air Assault reward could not be settled');
      const reward = Math.max(0, (paid.balance ?? before) - before);
      this.db.prepare('INSERT INTO air_assault_daily(pilot_id,day,match_id,reward) VALUES (?,?,?,?)').run(pilotId, day, matchId, reward);
      return { reward, dailyClaimed: false };
    });
  }
  close(): void { this.db.close(); }
}
type Enemy = AssaultEnemy & {
  opponent: OpponentRuntime; expertControl?: boolean; bankControl: number; combatTurnSign: number; flightAltitude?: number; terrainAltitude?: number;
  speed: number;
  roll: number;
  trackingAt: number;
  fireAt: number;
  readyAt: number;
  dodgeAt: number;
  dodgeUntil: number;
  waypoint: V;
  burstShots: number;
};
export type AssaultPilot = {
  lastStateAt?: number;
  aircraftType?: OpponentDefinition['aircraft']; lockedTargetId?: string;
  position: V;
  velocity: V;
  rotation: V;
  health: number;
  maxHealth: number;
  airborne: boolean;
  fresh: boolean;
};
export type AssaultBullet = {
  position: V;
  direction: V;
  speed: number;
};
type Hooks = {
  elevation: (x: number, z: number) => number;
  safeWaypoint?: (from: V, to: V) => V;
  activate: (enemy: Enemy) => void;
  move: (enemy: AssaultEnemy) => void;
  remove: (id: string) => void;
  fire: (enemy: Enemy, spread: number) => boolean;
  bullets: () => Iterable<AssaultBullet>;
  enemyShotOwners?: () => ReadonlySet<string>;
  warn?: (id: string) => void;
  heal: (id: string) => void;
  finish: (result: NonNullable<AssaultSnapshot['result']>, startedAt: number | null, now: number) => {
    reward: number;
    dailyClaimed: boolean;
  };
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const distance = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Compatibility exports use the common projectile-awareness and physical dodge engine.
export function incomingAssaultThreat(enemy: Pick<AssaultEnemy, 'position'|'velocity'>, bullets: Iterable<AssaultBullet>): V | undefined {
  return incomingOpponentThreat(enemy, bullets)?.direction;
}
export function chooseAssaultDodge(enemy: AssaultEnemy, speed: number, bullets: readonly AssaultBullet[]): V {
  return opponentDodge(enemy.aircraftType ?? 'fighter',enemy,speed,bullets,()=>0,airAssaultInside) ?? {...enemy.position};
}
// Use the existing exact ballistic solver; a capped lead can miss a steady crossing target.
export function assaultObservedTurn(previous: V, current: V, seconds: number, limit: number): number {
  if (seconds <= 0 || Math.hypot(previous.x, previous.z) < 10 || Math.hypot(current.x, current.z) < 10) return 0;
  return clamp(angleDelta(Math.atan2(-current.x, -current.z), Math.atan2(-previous.x, -previous.z)) / seconds, -limit, limit);
}

export function assaultShotDirection(origin: V, velocity: V, target: V, targetVelocity: V, forward: V, maxAngle: number, turnRate = 0): V | null {
  const solution=hunterBallisticSolution(origin,velocity,target,targetVelocity,turnRate);
  if(!solution)return null;
  const direction=solution.direction;
  const cosine = direction.x * forward.x + direction.y * forward.y + direction.z * forward.z;
  return cosine >= Math.cos(maxAngle) ? direction : null;
}

// Cruise independently of a slow player's throttle, then brake within actual aircraft limits.
export function assaultApproachSpeed(playerSpeed: number, range: number, envelope = aircraftFlightEnvelope.fighter): number {
  const combatSpeed = clamp(playerSpeed * .9 + 40, 110, envelope.maxSpeed * .72);
  return Math.min(envelope.maxSpeed * .72, Math.sqrt(combatSpeed ** 2 + 2 * envelope.airbrakeDrag * Math.max(0, range - 1800)));
}

export class AirAssaultEncounter {
  readonly id = randomUUID();
  readonly enemies: Enemy[];
  phase: AssaultSnapshot['phase'] = 'intro';
  phaseAt: number;
  startedAt: number | null = null;
  deadlineAt: number | null = null;
  outsideAt: number | null = null;
  disconnectedAt: number | null = null;
  result?: AssaultSnapshot['result'];
  reward = 0;
  dailyClaimed = false;
  private lastTick: number;
  private nextLaunchAt = 0;
  private shooterIds: string[] = [];
  private legendaryAttackerId?: string;
  private shooterLeaseUntil = 0;
  private burstStartedAt = 0;
  private heartCooldowns = new Map<string, number>();
  private heartPrevious?: V;
  private introReady = false;
  constructor(readonly cityId: string, readonly ownerId: string, private hooks: Hooks, now: number, roster: readonly (ReturnType<typeof airAssaultManifest>[number] & { aircraft?: OpponentDefinition['aircraft']; livery?: string })[] = airAssaultManifest()) {
    if (cityId !== rules.cityId)
      throw new Error('Air Assault is not configured for this city');
    this.phaseAt = this.lastTick = now;
    if(roster.length!==30) throw new Error('Air Assault requires 30 authored opponents');
    this.enemies = roster.map((row, index) => {
      const airport = airAssaultAirports.find(a => a.id === row.airportId);
      if(!airport || !Object.hasOwn(tiers,row.tier)) throw new Error('Invalid Air Assault opponent airport or tier');
      const position = airAssaultQueuePosition(row.airportId, row.ordinal, hooks.elevation(airport.x, airport.z));
      const opponent = createOpponent({ aircraft:row.aircraft ?? 'fighter',livery:row.livery ?? (row.aircraft && row.aircraft!=='fighter' ? undefined : 'firehawk-inferno'),level:tiers[row.tier].level,cityId:'dallas',position,rotation:{x:0,y:airport.heading,z:0},speed:0,health:tiers[row.tier].health,airportId:row.airportId,encounterId:this.id,ownerId,behavior:'attack' });
      return { ...row, opponent, aircraftType:opponent.definition.aircraft, equippedCosmetics:{...opponent.cosmetics},bankControl:0,combatTurnSign:index%2?1:-1,id: randomUUID(), phase: 'queued', position, rotation: { x: 0, y: airport.heading, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, health: tiers[row.tier].health, maxHealth: tiers[row.tier].health, speed: 0, roll: 0, trackingAt: 0, fireAt: 0, readyAt: 0, dodgeAt: -Infinity, dodgeUntil: 0, waypoint: { ...position }, burstShots: 0 };
    });
  }
  ready(now: number): void { if (this.phase === 'intro' && !this.introReady) {
    this.introReady = true;
    this.phaseAt = now;
  } }
  skip(now: number): void { if (this.phase === 'intro' && this.introReady && now - this.phaseAt >= 1000) {
    this.phase = 'countdown';
    this.phaseAt = now;
  } }
  takeoff(now: number, airportId: string | undefined): void { if (this.phase === 'takeoff' && airportId === 'dfw') {
    this.phase = 'active';
    this.startedAt = now;
    this.deadlineAt = now + rules.durationMs;
    this.phaseAt = now;
  } }
  get destroyed(): number { return this.enemies.filter(e => e.phase === 'destroyed').length; }
  canFight(): boolean { return this.phase === 'active' && this.disconnectedAt === null; }
  active(): Enemy[] { return this.enemies.filter(e => e.phase === 'takeoff' || e.phase === 'combat'); }
  defeated(id: string, now: number): void {
    if (!this.canFight() || this.deadlineAt === null || now >= this.deadlineAt)
      return;
    const enemy = this.enemies.find(e => e.id === id);
    if (!enemy || enemy.phase !== 'combat' && enemy.phase !== 'takeoff')
      return;
    enemy.phase = 'destroyed';
    enemy.health = 0;
    this.hooks.remove(id);
    if (this.destroyed === 30)
      this.end('full', now);
  }
  end(result: NonNullable<AssaultSnapshot['result']>, now: number): void {
    if (this.phase === 'finished')
      return;
    const settled = this.hooks.finish(result, this.startedAt, now);
    this.result = result;
    this.reward = settled.reward;
    this.dailyClaimed = settled.dailyClaimed;
    this.phase = 'finished';
    this.phaseAt = now;
    for (const enemy of this.enemies) {
      if(enemy.phase==='takeoff'||enemy.phase==='combat')this.hooks.remove(enemy.id);
      if(enemy.phase!=='destroyed')enemy.phase='retired';
    }
    this.heartPrevious = undefined;
  }
  snapshot(pilot: AssaultPilot, now: number, includeQueue = true): AssaultSnapshot {
    return { type: 'airAssault', id: this.id, phase: this.phase, phaseAt: this.phaseAt, serverNow: now, startedAt: this.startedAt, deadlineAt: this.deadlineAt, destroyed: this.destroyed, destroyedIds: this.enemies.filter(e => e.phase === 'destroyed').map(e => e.id), health: pilot.health, maxHealth: pilot.maxHealth, outsideAt: this.outsideAt, result: this.result, reward: this.reward, dailyClaimed: this.dailyClaimed,
      enemies: this.enemies.filter(e => includeQueue || e.phase === 'takeoff' || e.phase === 'combat').map(({ id, tier, airportId, ordinal, phase, position, rotation, velocity, health, maxHealth, aircraftType, equippedCosmetics }) => ({ id, tier, airportId, ordinal, phase, aircraftType, equippedCosmetics, position: { ...position }, rotation: { ...rotation }, velocity: { ...velocity }, health, maxHealth })),
      hearts: airAssaultHearts.map(h => ({ id: h.id, cooldownUntil: this.heartCooldowns.get(h.id) ?? 0 })) };
  }
  tick(pilot: AssaultPilot, now: number): void {
    const dt = clamp((now - this.lastTick) / 1000, 0, .1);
    this.lastTick = now;
    if (this.phase === 'finished')
      return;
    if (this.disconnectedAt !== null) {
      if (now - this.disconnectedAt >= rules.reconnectMs)
        this.end('disconnected', now);
      return;
    }
    if (this.phase === 'intro') {
      if (this.introReady && now - this.phaseAt >= rules.introMs) {
        this.phase = 'countdown';
        this.phaseAt = now;
      }
      return;
    }
    if (this.phase === 'countdown') {
      if (now - this.phaseAt >= rules.countdownMs) {
        this.phase = 'takeoff';
        this.phaseAt = now;
      }
      return;
    }
    if (this.phase !== 'active')
      return;
    if (!pilot.fresh) {
      if (now >= this.deadlineAt!)
        this.end('disconnected', now);
      return;
    }
    if (pilot.health <= 0) {
      this.end('destroyed', now);
      return;
    }
    if (!airAssaultInside(pilot.position)) {
      this.outsideAt ??= now;
      if (now - this.outsideAt >= rules.returnMs) {
        this.end('boundary', now);
        return;
      }
    }
    else
      this.outsideAt = null;
    if (now >= this.deadlineAt!) {
      this.end(pilot.airborne ? 'survival' : 'grounded', now);
      return;
    }
    this.collectHearts(pilot, now);
    if (now >= this.nextLaunchAt && this.active().length < rules.maxActive) {
      const next = this.enemies.find(e => e.phase === 'queued');
      if (next && !this.active().some(e => e.airportId === next.airportId && e.phase === 'takeoff')) {
        next.phase = 'takeoff';
        next.readyAt = now + tiers[next.tier].ai.reactionMs;
        this.hooks.activate(next);
        this.nextLaunchAt = now + 1000;
      }
    }
    // Prefetch departures, not attacks: one Legendary pursues/fires while the others hold nearby.
    const legends = this.active().filter(e => e.tier === 'legendary' && e.phase === 'combat');
    const attacker = legends.find(e => e.id === this.legendaryAttackerId);
    if (!attacker || distance(attacker.position, pilot.position) > 6000 && !this.hooks.enemyShotOwners?.().has(attacker.id)) {
      this.legendaryAttackerId = legends.sort((a, b) => distance(a.position, pilot.position) - distance(b.position, pilot.position))[0]?.id;
    }
    const mayAttack = (e: Enemy) => e.tier !== 'legendary' || e.id === this.legendaryAttackerId;
    const candidates = this.active().filter(e => mayAttack(e) && e.phase === 'combat' && now >= e.readyAt && distance(e.position, pilot.position) < 4500)
      .sort((a, b) => distance(a.position, pilot.position) - distance(b.position, pilot.position)).slice(0, 2);
    if (now >= this.shooterLeaseUntil) {
      // A previous attacker's airborne rounds still occupy its firing slot.
      const airborneOwners = [...(this.hooks.enemyShotOwners?.() ?? [])];
      this.shooterIds = [...airborneOwners, ...candidates.map(e => e.id).filter(id => !airborneOwners.includes(id))].slice(0, 2);
      this.shooterLeaseUntil = now + 5000;
      this.burstStartedAt = now;
      for (const [slot, id] of this.shooterIds.entries()) {
        const enemy = this.enemies.find(e => e.id === id);
        if (!enemy) continue;
        enemy.burstShots = 0;
        enemy.fireAt = Math.max(enemy.fireAt, now + tiers[enemy.tier].ai.reactionMs + slot * 700);
        this.hooks.warn?.(id);
      }
    }
    const shooters = this.active().filter(e => this.shooterIds.includes(e.id));
    for (const enemy of this.active()) {
      this.move(enemy, pilot, dt, now, !mayAttack(enemy));
      const burstLimit = enemy.tier === 'medium' ? 1 : enemy.tier === 'hard' ? 2 : 3;
      if (mayAttack(enemy) && shooters.includes(enemy) && now >= enemy.fireAt && now - this.burstStartedAt < 1800 && enemy.burstShots < burstLimit) {
        if (this.hooks.fire(enemy, tiers[enemy.tier].ai.aimError)) {
          recordOpponentShot(enemy.opponent);
          enemy.burstShots++;
          enemy.fireAt = now + tiers[enemy.tier].ai.shotIntervalMs;
        }
      }
      this.hooks.move(enemy);
    }
  }
  private collectHearts(pilot: AssaultPilot, now: number): void {
    const from = this.heartPrevious;
    this.heartPrevious = { ...pilot.position };
    if (!from || !pilot.airborne || distance(from, pilot.position) < 1)
      return;
    for (const heart of airAssaultHearts) {
      if ((this.heartCooldowns.get(heart.id) ?? 0) > now)
        continue;
      const v = { x: pilot.position.x - from.x, y: pilot.position.y - from.y, z: pilot.position.z - from.z };
      const length = v.x * v.x + v.y * v.y + v.z * v.z;
      const t = clamp(((heart.x - from.x) * v.x + (heart.y - from.y) * v.y + (heart.z - from.z) * v.z) / length, 0, 1);
      if (distance(heart, { x: from.x + v.x * t, y: from.y + v.y * t, z: from.z + v.z * t }) <= heart.radius) {
        this.heartCooldowns.set(heart.id, now + rules.heartCooldownMs);
        this.hooks.heal(heart.id);
      }
    }
  }
  private move(e: Enemy, p: AssaultPilot, dt: number, now: number, holding = false): void {
    const envelope = aircraftFlightEnvelope[e.opponent.definition.aircraft];
    if (e.phase === 'takeoff') {
      e.speed = Math.min(envelope.groundMaxSpeed, e.speed + envelope.groundAcceleration * dt);
      e.roll += e.speed * dt;
      if (e.speed >= envelope.takeoffSpeed && e.roll >= envelope.minimumTakeoffRoll) {
        e.rotation.x = Math.min(envelope.maxClimbPitch, e.rotation.x + envelope.pitchRate * dt);
      }
      if (e.position.y > this.hooks.elevation(e.position.x, e.position.z) + 80) {
        e.phase = 'combat';
        e.readyAt = now + tiers[e.tier].ai.reactionMs;
        e.waypoint = { x: e.position.x - Math.sin(e.rotation.y) * 1000, y: e.position.y + 100, z: e.position.z - Math.cos(e.rotation.y) * 1000 };
      }
    }
    else {
      const range = distance(e.position, p.position);
      let targetSpeed = assaultApproachSpeed(Math.hypot(p.velocity.x,p.velocity.z),range,envelope);
      if (holding) {
        if (e.opponent.tactics) e.trackingAt = now;
        if (now >= e.trackingAt) {
          const lane = this.enemies.indexOf(e)-25;
          const angle = (now-this.startedAt!)*.00006+lane*2.4;
          const radius = 2200+lane*200;
          e.waypoint = {x:p.position.x+Math.cos(angle)*radius,y:p.position.y+200+lane*100,z:p.position.z+Math.sin(angle)*radius};
          e.trackingAt=now+e.opponent.profile.trackingMs;
        }
        targetSpeed=Math.max(230,targetSpeed);
        e.opponent.tactics=undefined;
        if (now >= e.readyAt && now >= e.dodgeUntil) {
          const dodge=chooseOpponentEvasion(e.opponent,e,e.speed,[...this.hooks.bullets()],now,
            (x,z)=>this.hooks.elevation(x,z)+170,airAssaultInside,e.opponent.profile.tactics.expert?p:undefined);
          if(dodge) {e.waypoint=this.hooks.safeWaypoint?.(e.position,dodge)??dodge;e.dodgeAt=e.opponent.dodgeAt;e.dodgeUntil=e.opponent.dodgeUntil;e.trackingAt=e.dodgeUntil;}
        }
      } else if (now >= e.readyAt) {
        const solution=ballisticIntercept(e.position,e.velocity,p.position,p.velocity);
        const dx=p.position.x-e.position.x,dz=p.position.z-e.position.z;
        const heading=Math.atan2(-dx,-dz)-e.rotation.y;
        const plan=planOpponentTactics(e.opponent,{
          enemy:{...e,aircraftType:e.opponent.definition.aircraft},target:{...p,aircraftType:p.aircraftType??'trainer'},
          targetId:this.ownerId,speed:e.speed,now,cruise:targetSpeed,
          firingSolution:Boolean(solution)&&range<COMBAT_RANGE&&Math.abs(Math.atan2(Math.sin(heading),Math.cos(heading)))<.2,
          lockedByTarget:p.lockedTargetId===e.id,bullets:now >= (e.opponent.tactics?.nextDecision??0) ? [...this.hooks.bullets()] : [],
          floorAt:(x,z)=>this.hooks.elevation(x,z)+170,inside:airAssaultInside,
          safeWaypoint:this.hooks.safeWaypoint,
        });
        e.waypoint=plan.waypoint;e.combatTurnSign=plan.turnSign;targetSpeed=plan.cruise;
        e.dodgeAt=e.opponent.dodgeAt;e.dodgeUntil=e.opponent.dodgeUntil;
      }
      e.waypoint.x=clamp(e.waypoint.x,-31400 * DALLAS_WORLD_SCALE,4400 * DALLAS_WORLD_SCALE);
      e.waypoint.z=clamp(e.waypoint.z,-27400 * DALLAS_WORLD_SCALE,16400 * DALLAS_WORLD_SCALE);
      e.waypoint.y=Math.min(8500 * DALLAS_WORLD_SCALE,e.waypoint.y);
      e.expertControl=e.opponent.profile.tactics.expert;
      advanceHunterFlight({aircraftType:e.opponent.definition.aircraft,position:e.position,rotation:e.rotation,velocity:e.velocity},
        e,e.waypoint,targetSpeed,dt,(x,z)=>this.hooks.elevation(x,z)+170);
      return;
    }
    const cp = Math.cos(e.rotation.x);
    e.velocity = { x: -Math.sin(e.rotation.y) * cp * e.speed, y: Math.sin(e.rotation.x) * e.speed, z: -Math.cos(e.rotation.y) * cp * e.speed };
    e.position.x += e.velocity.x * dt;
    e.position.y += e.velocity.y * dt;
    e.position.z += e.velocity.z * dt;
    const ground = this.hooks.elevation(e.position.x, e.position.z) + 1.2;
    if (e.position.y < ground) {
      e.position.y = ground;
      e.velocity.y = 0;
    }
  }
}
