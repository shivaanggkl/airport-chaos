import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PlayerWallet } from './player-wallet.js';
import { airAssaultRules as rules, airAssaultTiers as tiers, airAssaultManifest, airAssaultAirports, airAssaultQueuePosition, airAssaultInside, airAssaultHearts, type AssaultTier, type AssaultVector as V, type AssaultEnemy, type AssaultSnapshot } from '../../shared/air-assault.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
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
  speed: number;
  roll: number;
  trackingAt: number;
  fireAt: number;
  readyAt: number;
  dodgeAt: number;
  dodgeUntil: number;
  waypoint: V;
  previous: V;
  movedAt: number;
  targetSide: number;
  bestRange: number;
  progressAt: number;
  recoveryUntil: number;
};
export type AssaultPilot = {
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
  activate: (enemy: AssaultEnemy) => void;
  move: (enemy: AssaultEnemy) => void;
  remove: (id: string) => void;
  fire: (enemy: AssaultEnemy, spread: number) => boolean;
  bullets: () => Iterable<AssaultBullet>;
  heal: (id: string) => void;
  finish: (result: NonNullable<AssaultSnapshot['result']>, startedAt: number | null, now: number) => {
    reward: number;
    dailyClaimed: boolean;
  };
};
const envelope = aircraftFlightEnvelope.fighter;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const distance = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Closest relative approach against genuine live server projectile trajectories.
export function incomingAssaultThreat(enemy: Pick<AssaultEnemy, 'position' | 'velocity'>, bullets: Iterable<AssaultBullet>): V | undefined {
  let earliest = 1.21, threat: V | undefined;
  for (const bullet of bullets) {
    const r = { x: bullet.position.x - enemy.position.x, y: bullet.position.y - enemy.position.y, z: bullet.position.z - enemy.position.z };
    const v = { x: bullet.direction.x * bullet.speed - enemy.velocity.x, y: bullet.direction.y * bullet.speed - enemy.velocity.y, z: bullet.direction.z * bullet.speed - enemy.velocity.z };
    const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
    if (v2 < 1)
      continue;
    const t = -(r.x * v.x + r.y * v.y + r.z * v.z) / v2;
    if (t < 0 || t > 1.2 || t >= earliest || Math.hypot(r.x + v.x * t, r.y + v.y * t, r.z + v.z * t) > 65)
      continue;
    earliest = t;
    threat = bullet.direction;
  }
  return threat;
}
// Compare bounded bank/climb paths against live bullets before selecting a dodge.
// This predicts steering; actual movement still uses the ordinary rate-limited integrator.
export function chooseAssaultDodge(enemy: AssaultEnemy, speed: number, bullets: readonly AssaultBullet[]): V {
  let bestScore = -Infinity, best = { ...enemy.position };
  for (const turn of [-1, 0, 1]) {
    const point = { ...enemy.position };
    let yaw = enemy.rotation.y, pitch = enemy.rotation.x, score = Infinity;
    for (let step = 1; step <= 12; step++) {
      yaw += turn * envelope.yawRate * .1;
      pitch += clamp(.22 - pitch, -envelope.pitchRate * .1, envelope.pitchRate * .1);
      point.x -= Math.sin(yaw) * Math.cos(pitch) * speed * .1;
      point.y += Math.sin(pitch) * speed * .1;
      point.z -= Math.cos(yaw) * Math.cos(pitch) * speed * .1;
      if (!airAssaultInside(point)) {
        score = -Infinity;
        break;
      }
      for (const bullet of bullets) {
        const t = step * .1;
        score = Math.min(score, Math.hypot(point.x - bullet.position.x - bullet.direction.x * bullet.speed * t, point.y - bullet.position.y - bullet.direction.y * bullet.speed * t, point.z - bullet.position.z - bullet.direction.z * bullet.speed * t));
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x: point.x - Math.sin(yaw) * 150, y: point.y, z: point.z - Math.cos(yaw) * 150 };
    }
  }
  return best;
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
  private shooterLeaseUntil = 0;
  private heartCooldowns = new Map<string, number>();
  private heartPrevious?: V;
  private introReady = false;
  constructor(readonly cityId: string, readonly ownerId: string, private hooks: Hooks, now: number) {
    if (cityId !== rules.cityId)
      throw new Error('Air Assault is not configured for this city');
    this.phaseAt = this.lastTick = now;
    this.enemies = airAssaultManifest().map((row, index) => {
      const airport = airAssaultAirports.find(a => a.id === row.airportId)!;
      const position = airAssaultQueuePosition(row.airportId, row.ordinal, hooks.elevation(airport.x, airport.z));
      return { ...row, id: randomUUID(), phase: 'queued', position, rotation: { x: 0, y: airport.heading, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, health: tiers[row.tier].health, maxHealth: tiers[row.tier].health, speed: 0, roll: 0, trackingAt: 0, fireAt: 0, readyAt: 0, dodgeAt: -Infinity, dodgeUntil: 0, waypoint: { ...position }, previous: { ...position }, movedAt: now, targetSide: index % 2 ? 1 : -1, bestRange: Infinity, progressAt: now, recoveryUntil: 0 };
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
      enemies: this.enemies.filter(e => includeQueue || e.phase === 'takeoff' || e.phase === 'combat').map(({ id, tier, airportId, ordinal, phase, position, rotation, velocity, health, maxHealth }) => ({ id, tier, airportId, ordinal, phase, position: { ...position }, rotation: { ...rotation }, velocity: { ...velocity }, health, maxHealth })),
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
      if (next && !this.active().some(e => e.airportId === next.airportId && e.phase === 'takeoff') &&
        (next.tier !== 'legendary' || !this.active().some(e => e.tier === 'legendary'))) {
        next.phase = 'takeoff';
        next.readyAt = now + tiers[next.tier].reactionMs;
        next.movedAt = now;
        this.hooks.activate(next);
        this.nextLaunchAt = now + 1000;
      }
    }
    const candidates = this.active().filter(e => e.phase === 'combat' && now >= e.readyAt && distance(e.position, pilot.position) < 4500)
      .sort((a, b) => distance(a.position, pilot.position) - distance(b.position, pilot.position)).slice(0, 2);
    if (now >= this.shooterLeaseUntil) {
      this.shooterIds = candidates.map(e => e.id);
      this.shooterLeaseUntil = now + 5000;
    }
    const shooters = this.active().filter(e => this.shooterIds.includes(e.id));
    for (const enemy of this.active()) {
      this.move(enemy, pilot, dt, now);
      if (shooters.includes(enemy) && now >= enemy.fireAt && now % 5000 < 1400) {
        if (this.hooks.fire(enemy, tiers[enemy.tier].dispersion))
          enemy.fireAt = now + tiers[enemy.tier].fireMs;
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
  private move(e: Enemy, p: AssaultPilot, dt: number, now: number): void {
    if (e.phase === 'takeoff') {
      e.speed = Math.min(envelope.groundMaxSpeed, e.speed + envelope.groundAcceleration * dt);
      e.roll += e.speed * dt;
      if (e.speed >= envelope.takeoffSpeed && e.roll >= envelope.minimumTakeoffRoll) {
        e.rotation.x = Math.min(envelope.maxClimbPitch, e.rotation.x + envelope.pitchRate * dt);
      }
      if (e.position.y > this.hooks.elevation(e.position.x, e.position.z) + 80) {
        e.phase = 'combat';
        e.readyAt = now + tiers[e.tier].reactionMs;
        e.waypoint = { x: e.position.x - Math.sin(e.rotation.y) * 1000, y: e.position.y + 100, z: e.position.z - Math.cos(e.rotation.y) * 1000 };
      }
    }
    else {
      if (now >= e.readyAt && now >= e.trackingAt && now >= e.dodgeUntil) {
        const lead = e.tier === 'medium' ? .5 : e.tier === 'hard' ? 1 : 1.4;
        e.waypoint = { x: p.position.x + p.velocity.x * lead, y: p.position.y + p.velocity.y * lead, z: p.position.z + p.velocity.z * lead };
        e.waypoint = this.hooks.safeWaypoint?.(e.position, e.waypoint) ?? e.waypoint;
        e.trackingAt = now + tiers[e.tier].trackingMs;
      }
      if (e.tier === 'legendary' && now >= e.readyAt && now - e.dodgeAt >= 1200) {
        const bullets = [...this.hooks.bullets()];
        if (incomingAssaultThreat(e, bullets)) {
          e.dodgeAt = now;
          e.dodgeUntil = now + 1200;
          e.waypoint = chooseAssaultDodge(e, e.speed, bullets);
          e.waypoint = this.hooks.safeWaypoint?.(e.position, e.waypoint) ?? e.waypoint;
        }
      }
      if (e.tier === 'medium' && now - e.dodgeAt >= 6500 && distance(e.position, p.position) < 1800) {
        e.dodgeAt = now;
        e.waypoint.x += e.targetSide * 140;
        e.targetSide *= -1;
      }
      if (e.tier === 'hard' && now - e.dodgeAt >= 3500 && distance(e.position, p.position) < 1800) {
        e.dodgeAt = now;
        e.dodgeUntil = now + 900;
        e.waypoint.x += e.targetSide * 400;
        e.targetSide *= -1;
      }
      if (distance(e.previous, e.position) > 25) {
        e.previous = { ...e.position };
        e.movedAt = now;
      }
      // Recovery changes a physically reachable steering destination, never pose or health.
      if (now - e.movedAt > 8000 || !airAssaultInside(e.position)) {
        e.waypoint = { ...p.position };
        e.trackingAt = now + 500;
      }
      const range = distance(e.position, p.position);
      if (range < e.bestRange - 100) {
        e.bestRange = range;
        e.progressAt = now;
      }
      if (range < 6000 && now - e.progressAt > 10000) {
        e.recoveryUntil = now + 3000;
        e.progressAt = now;
        e.bestRange = range;
      }
      if (e.recoveryUntil > now)
        e.waypoint = { x: p.position.x + p.velocity.x * .35, y: p.position.y, z: p.position.z + p.velocity.z * .35 };
      e.waypoint.x = clamp(e.waypoint.x, -31400, 4400);
      e.waypoint.z = clamp(e.waypoint.z, -27400, 16400);
      e.waypoint.y = Math.min(8500, e.waypoint.y);
      const dx = e.waypoint.x - e.position.x, dz = e.waypoint.z - e.position.z;
      const yaw = Math.atan2(-dx, -dz), turn = angleDelta(yaw, e.rotation.y);
      const desiredRoll = clamp(-turn, -.85, .85);
      e.rotation.z += clamp(desiredRoll - e.rotation.z, -envelope.rollRate * dt, envelope.rollRate * dt);
      e.rotation.y += clamp(turn, -envelope.yawRate * dt, envelope.yawRate * dt);
      const floor = this.hooks.elevation(e.position.x, e.position.z) + 170;
      const pitch = Math.atan2(Math.max(floor, e.waypoint.y) - e.position.y, Math.max(100, Math.hypot(dx, dz)));
      e.rotation.x += clamp(clamp(pitch, -envelope.maxDivePitch, envelope.maxClimbPitch) - e.rotation.x, -envelope.pitchRate * dt, envelope.pitchRate * dt);
      let targetSpeed = clamp(Math.hypot(p.velocity.x, p.velocity.z) * .9 + 40, 110, envelope.maxSpeed * .72);
      if (e.recoveryUntil > now)
        targetSpeed = Math.min(targetSpeed, Math.max(110, Math.hypot(p.velocity.x, p.velocity.z) * .72));
      e.speed += clamp(targetSpeed - e.speed, -envelope.airbrakeDrag * dt, envelope.acceleration / envelope.inertia * dt);
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
