import { projectileImpactFraction } from '../../../shared/projectile-collision.mjs';
import type { TitanPresentation } from '../../../shared/titan-pose.mjs';
import { titanAnchor, titanTimeline, titanAttackPose, titanAimedJoint } from '../../../shared/titan-pose.mjs';
import { difficulties, type Ability, type Species, type Vec } from './definitions.js';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const move = (a: number, b: number, step: number) => a + clamp(b - a, -step, step);
const unit = (a: Vec, b: Vec): Vec => { const d = distance(a, b); return d < 1e-8 ? { x: 0, y: 0, z: 1 } : { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d }; };
export type Target = {
    id: string;
    encounterId: string;
    authorized: boolean;
    alive: boolean;
    position: Vec;
    velocity: Vec;
    radius: number;
};
export type Threat = {
    id: string;
    encounterId: string;
    position: Vec;
    velocity: Vec;
    radius: number;
};
export type Environment = {
    bounds: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    };
    ground(x: number, z: number): number;
    /** Host uses its local spatial index; false includes buildings, steep terrain and obstacles. */
    traversable(from: Vec, to: Vec, radius: number, height: number): boolean;
    lineOfSight(from: Vec, to: Vec): boolean;
    /** Fraction of an obstructed projectile/beam segment, or null. Never return a client claim. */
    obstruction(from: Vec, to: Vec, radius: number): number | null;
    /** Encounter-owned approved object; host atomically reserves it. */
    takeDebris?(encounterId: string, origin: Vec): {
        id: string;
        position: Vec;
        radius: number;
    } | null;
    reset?(encounterId: string): void;
};
export type Tactic = 'hunt' | 'intercept' | 'control-space' | 'reposition' | 'defend' | 'recover' | 'attack';
export type Event = {
    id: string;
    encounterId: string;
    kind: 'animation' | 'damage' | 'environment';
    type: string;
    position: Vec;
    ability?: string;
    targetId?: string;
    amount?: number;
    stage?: string;
    progress?: number;
    attackId?: string;
};
type Active = {
    definition: Ability;
    start: number;
    serial: number;
    targetId: string;
    aim: Vec;
    direction: Vec;
    released: number;
    hit: Set<string>;
    lastStage: string;
    combo: number;
    previousLimbs: Map<string, Vec>;
    landed: boolean;
};
type Shot = {
    id: string;
    position: Vec;
    velocity: Vec;
    radius: number;
    damage: number;
    life: number;
    ability: string;
    attack: number;
    live: boolean;
};
type Observation = {
    at: number;
    position: Vec;
    velocity: Vec;
    turn: number;
    rear: boolean;
};
export type Snapshot = TitanPresentation & {
    tactic: Tactic;
    events: readonly Event[];
};
/** Positive ballistic root for a fixed-speed, non-homing projectile. */
export function intercept(origin: Vec, target: Vec, velocity: Vec, speed: number, maxTime: number): Vec | null {
    const r = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
    const a = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2 - speed ** 2, b = 2 * (r.x * velocity.x + r.y * velocity.y + r.z * velocity.z), c = r.x ** 2 + r.y ** 2 + r.z ** 2;
    let t: number;
    if (Math.abs(a) < 1e-8)
        t = Math.abs(b) > 1e-8 ? -c / b : NaN;
    else {
        const d = b * b - 4 * a * c;
        if (d < 0)
            return null;
        const roots = [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)].filter(v => v >= 0);
        t = Math.min(...roots);
    }
    if (!Number.isFinite(t) || t < 0 || t > maxTime)
        return null;
    return { x: target.x + velocity.x * t, y: target.y + velocity.y * t, z: target.z + velocity.z * t };
}
/** No live game import: host supplies only validated encounter observations and indexed environment queries. */
export class TitanEncounter {
    readonly species: Readonly<Species>;
    readonly id: string;
    #env: Environment;
    #initial: Vec;
    #position: Vec;
    #velocity: Vec = { x: 0, y: 0, z: 0 };
    #yaw = 0;
    #yawVelocity = 0;
    #speed = 0;
    #time = 0;
    #health: number;
    #gait = 0;
    #headYaw = 0;
    #headPitch = 0;
    #nextDecision = 0;
    #commitUntil = 0;
    #tactic: Tactic = 'hunt';
    #goal: Vec;
    #memory: Observation[] = [];
    #observedId = '';
    #visibleSince = 0;
    #lastSeen = 0;
    #previousTargetVelocity: Vec = { x: 0, y: 0, z: 0 };
    #active: Active | null = null;
    #cooldowns = new Map<string, number>();
    #shots: Shot[] = [];
    #events: Event[] = [];
    #pendingEvents: Event[] = [];
    #stepping = false;
    #serial = 0;
    #eventSerial = 0;
    #damageReceipts = new Map<string, number>();
    #feet: Record<string, Vec> = {};
    #footSwings = new Map<string, {
        from: Vec;
        to: Vec;
    }>();
    #limbs: Record<string, Vec> = {};
    #limbVelocities: Record<string, Vec> = {};
    #blocked = 0;
    #avoidSign = 1;
    #vertical = 0;
    #airborne = false;
    #stagger = 0;
    #jumpVelocity: Vec = { x: 0, y: 0, z: 0 };
    #navYaw = 0;
    #nextNavigation = 0;
    #lateralSpeed = 0;
    #misses = 0;
    #lastAbility = '';
    #comboUntil = 0;
    #comboDepth = 0;
    #disposed = false;
    constructor(id: string, species: Readonly<Species>, position: Vec, environment: Environment) {
        if (!id || !Object.isFrozen(species) || Object.values(position).some(v => !Number.isFinite(v)))
            throw Error('Trusted registered species and valid encounter required');
        if (environment.bounds.maxX - environment.bounds.minX < species.arena.minWidth || environment.bounds.maxZ - environment.bounds.minZ < species.arena.minWidth)
            throw Error('Arena too small');
        this.id = id;
        this.species = species;
        this.#env = environment;
        this.#initial = { ...position };
        this.#position = { ...position };
        this.#goal = { ...position };
        this.#health = species.health;
        if (!this.#valid(position, position))
            throw Error('Unsafe initial pose');
        this.#position.y = environment.ground(position.x, position.z);
        this.#updatePose();
    }
    #emit(kind: Event['kind'], type: string, position: Vec, extra: Partial<Event> = {}) {
        if (this.#events.length + this.#pendingEvents.length >= 128)
            return;
        const queue = this.#stepping ? this.#events : this.#pendingEvents;
        queue.push({ id: `${this.id}:event:${++this.#eventSerial}`, encounterId: this.id, kind, type, position: { ...position }, ...(this.#active ? { attackId: `${this.id}:attack:${this.#active.serial}` } : {}), ...extra });
    }
    #anchor(joint: string) { const local = this.species.joints[joint].position, pivot = this.species.joints.head?.position; return pivot && this.species.movement.independentAim && (joint === 'head' || joint === 'mouth') ? titanAimedJoint(this.#position, this.#yaw, local, pivot, this.#headYaw, this.#headPitch) : titanAnchor(this.#position, this.#yaw, local); }
    #valid(from: Vec, to: Vec) { const b = this.#env.bounds, r = this.species.radius, g = this.#env.ground(to.x, to.z); return Number.isFinite(g) && to.x >= b.minX + r && to.x <= b.maxX - r && to.z >= b.minZ + r && to.z <= b.maxZ - r && Math.abs(g - this.#env.ground(from.x, from.z)) <= this.species.movement.stepHeight + Math.hypot(to.x - from.x, to.z - from.z) * this.species.arena.maxSlope && this.#env.traversable(from, to, r, this.species.height); }
    #target(targets: readonly Target[]): Target | undefined {
        const s = this.species;
        let chosen: Target | undefined, best = Infinity;
        const eye = s.joints.head ? this.#anchor('head') : { ...this.#position, y: this.#position.y + s.height * .8 };
        for (const t of targets.slice(0, 16)) {
            if (!t.authorized || !t.alive || t.encounterId !== this.id || t.radius <= 0 || Object.values(t.position).some(v => !Number.isFinite(v)) || Object.values(t.velocity).some(v => !Number.isFinite(v)))
                continue;
            const d = distance(eye, t.position), angle = Math.abs(wrap(Math.atan2(t.position.x - eye.x, t.position.z - eye.z) - this.#yaw));
            if (d <= s.senses.range && angle <= s.senses.fov / 2 && d < best && this.#env.lineOfSight(eye, t.position)) {
                chosen = t;
                best = d;
            }
        }
        return chosen;
    }
    #withinCone(origin: Vec, target: Vec, cone: number) { const d = unit(origin, target); return d.x * Math.sin(this.#yaw) + d.z * Math.cos(this.#yaw) >= Math.cos(cone); }
    #eligible(a: Ability, t: Target) { const origin = this.#anchor(a.requires[0]), d = distance(origin, t.position), alt = t.position.y - this.#env.ground(t.position.x, t.position.z); return this.#time >= (this.#cooldowns.get(a.id) ?? 0) && d >= a.minRange && d <= a.maxRange && alt <= a.maxAltitude && this.#withinCone(origin, t.position, a.cone) && this.#env.lineOfSight(origin, t.position); }
    #plan(t: Target | undefined, threats: readonly Threat[]) {
        const profile = difficulties[this.species.level];
        this.#nextDecision = this.#time + .2;
        if (!t) {
            this.#tactic = this.#memory.length ? 'hunt' : 'recover';
            this.#goal = { ...(this.#memory.at(-1)?.position ?? this.#position) };
            return;
        }
        if (this.#observedId !== t.id) {
            this.#observedId = t.id;
            this.#visibleSince = this.#time;
            this.#memory = [];
        }
        this.#lastSeen = this.#time;
        const turn = wrap(Math.atan2(t.velocity.x, t.velocity.z) - Math.atan2(this.#previousTargetVelocity.x, this.#previousTargetVelocity.z));
        this.#previousTargetVelocity = { ...t.velocity };
        this.#memory.push({ at: this.#time, position: { ...t.position }, velocity: { ...t.velocity }, turn, rear: (t.position.x - this.#position.x) * Math.sin(this.#yaw) + (t.position.z - this.#position.z) * Math.cos(this.#yaw) < 0 });
        while (this.#memory.length > 90 || this.#memory[0] && this.#time - this.#memory[0].at > profile.memory)
            this.#memory.shift();
        if (this.#time - this.#visibleSince < profile.reaction)
            return;
        const d = distance(this.#position, t.position), speed = Math.hypot(t.velocity.x, t.velocity.z), recent = this.#memory.slice(-15), circling = Math.abs(recent.reduce((n, v) => n + v.turn, 0)) > .8, stationary = speed < 20, high = t.position.y - this.#position.y > this.species.height;
        const rearPressure = d < this.species.height * 3 && recent.filter(v => v.rear).length > recent.length * .6;
        const danger = threats.slice(0, 32).some(p => p.encounterId === this.id && distance(p.position, this.#position) <= this.species.senses.range && this.#env.lineOfSight(this.#anchor('body'), p.position) && projectileImpactFraction(p.position, { x: p.position.x + p.velocity.x * 2, y: p.position.y + p.velocity.y * 2, z: p.position.z + p.velocity.z * 2 }, {x:this.#anchor('body').x+this.#velocity.x*2,y:this.#anchor('body').y+this.#velocity.y*2,z:this.#anchor('body').z+this.#velocity.z*2}, this.#velocity, 2, this.species.radius + p.radius) !== null);
        const available = this.species.abilities.filter(a => this.#eligible(a, t));
        const scores: Record<Tactic, number> = { hunt: .3, intercept: speed > 30 ? .65 : .2, 'control-space': high ? .8 : .2, reposition: circling || rearPressure ? .9 : .3, defend: danger ? 1.2 * profile.awareness : .05, recover: this.#stagger > 0 ? 1.5 : .05, attack: available.length ? 1.05 : .1 };
        if (rearPressure && available.some(a => a.requires.includes('tail')))
            scores.attack += .25;
        if (this.species.personality === 'defensive')
            scores.defend += .15;
        if (this.species.personality === 'aggressive')
            scores.attack += .1;
        if (d > this.species.height * 3)
            scores.intercept += .3;
        if (this.#misses > 1)
            scores.reposition += Math.min(.5, this.#misses * .1);
        const winner = (Object.keys(scores) as Tactic[]).reduce((a, b) => scores[a] >= scores[b] ? a : b);
        const renewIntent = this.#time >= this.#commitUntil || scores[winner] > scores[this.#tactic] + .3;
        const previousGoal = this.#goal;
        if (renewIntent) {
            this.#tactic = winner;
            this.#commitUntil = this.#time + Math.max(.6, profile.reaction * 2);
        }
        const lead = clamp(d / Math.max(100, this.species.movement.run + speed), 0, 3) * profile.prediction;
        this.#goal = { x: t.position.x + t.velocity.x * lead, y: this.#position.y, z: t.position.z + t.velocity.z * lead };
        if (this.#tactic === 'reposition' || this.#tactic === 'defend') {
            const side = this.#avoidSign * this.species.height;
            this.#goal = renewIntent ? { x: this.#position.x + Math.cos(this.#yaw) * side, y: this.#position.y, z: this.#position.z - Math.sin(this.#yaw) * side } : previousGoal;
        }
        if (this.#tactic === 'control-space') {
            this.#goal.x -= t.velocity.x * 2;
            this.#goal.z -= t.velocity.z * 2;
        }
        if (this.#tactic === 'recover')
            this.#goal = { ...this.#position };
        if (!this.#active && available.length && this.#tactic === 'attack') {
            // Rank practical geometry, adaptation and continuity; never force a scripted power rotation.
            const scored = available.map(a => ({ a, score: (a.mechanism === 'projectile' || a.mechanism === 'beam' ? (high ? .8 : .4) : .5) + (stationary && a.mechanism === 'area' ? .5 : 0) + (circling && a.directional ? .3 : 0) - (a.id === this.#lastAbility ? this.#misses * .15 : 0) + (a.moving && this.#speed > 1 ? .15 : 0) })).sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id));
            for (const candidate of scored)
                if (this.#start(candidate.a, t))
                    break;
        }
    }
    #start(a: Ability, t: Target) {
        if (this.#active || !this.#eligible(a, t))
            return false;
        if (a.debris && !this.#env.takeDebris)
            return false;
        if (a.mechanism === 'leap') {
            const flight = 2 * this.species.movement.jumpSpeed / this.species.movement.gravity, dir = unit(this.#position, t.position), travel = Math.min(a.maxRange, this.species.movement.run * flight), end = { x: this.#position.x + dir.x * travel, y: this.#position.y, z: this.#position.z + dir.z * travel };
            if (!this.#valid(this.#position, end) || a.active < flight)
                return false;
        }
        const depth = this.#time <= this.#comboUntil ? this.#comboDepth + 1 : 1;
        if (depth > difficulties[this.species.level].combo)
            return false;
        this.#active = { definition: a, start: this.#time, serial: ++this.#serial, targetId: t.id, aim: { ...t.position }, direction: unit(this.#anchor(a.requires[0]), t.position), released: 0, hit: new Set(), lastStage: 'SELECT', combo: depth, previousLimbs: new Map(), landed: false };
        this.#cooldowns.set(a.id, this.#time + a.warning + a.windup + a.active + a.recovery + a.cooldown);
        this.#emit('animation', a.event, this.#position, { ability: a.id, stage: 'SELECT', progress: 0 });
        this.#lastAbility = a.id;
        return true;
    }
    #move(dt: number) {
        const m = this.species.movement, a = this.#active, stage = a ? titanTimeline(a.definition, this.#time - a.start).stage : '';
        let goal = this.#goal, speed = this.#tactic === 'recover' ? 0 : this.#tactic === 'hunt' ? m.walk : m.run;
        if (a && !a.definition.moving && stage !== 'COOLDOWN')
            speed = 0;
        if (a?.definition.mechanism === 'charge' && stage === 'ACTIVE') {
            speed = m.chargeSpeed;
            goal = { x: this.#position.x + a.direction.x * 1000, y: this.#position.y, z: this.#position.z + a.direction.z * 1000 };
        }
        const sidestep = m.sidestep && this.#tactic === 'defend' && !this.#airborne && stage !== 'ACTIVE';
        const d = distance(this.#position, goal);
        speed = Math.min(speed, Math.sqrt(2 * m.deceleration * Math.max(0, d - this.species.radius)));
        let wantedYaw = this.#navYaw;
        if (this.#time >= this.#nextNavigation) {
            this.#nextNavigation = this.#time + .2;
            wantedYaw = Math.atan2(goal.x - this.#position.x, goal.z - this.#position.z);
            // Bounded local fan: at most eight indexed segment queries, no world search.
            let chosen = false;
            for (const angle of [0, .45 * this.#avoidSign, -.45 * this.#avoidSign, .9 * this.#avoidSign, -.9 * this.#avoidSign, 1.4 * this.#avoidSign, -1.4 * this.#avoidSign, Math.PI * this.#avoidSign]) {
                const yaw = wantedYaw + angle, look = Math.max(this.species.radius * 2, this.#speed ** 2 / (2 * m.deceleration) + this.species.radius), end = { x: this.#position.x + Math.sin(yaw) * look, y: this.#position.y, z: this.#position.z + Math.cos(yaw) * look };
                if (this.#valid(this.#position, end)) {
                    wantedYaw = yaw;
                    chosen = true;
                    break;
                }
            }
            if (!chosen) {
                speed = 0;
                this.#blocked += dt;
                if (this.#blocked > 1) {
                    wantedYaw = this.#yaw + this.#avoidSign * Math.PI / 2;
                    this.#tactic = 'reposition';
                }
            }
            else
                this.#blocked = 0;
            this.#navYaw = wantedYaw;
        }
        if (this.#blocked > 0)
            speed = 0;
        if (sidestep)
            wantedYaw = this.#yaw;
        const error = wrap(wantedYaw - this.#yaw), rate = Math.sign(error) * Math.min(m.turnRate, Math.sqrt(2 * m.turnAcceleration * Math.abs(error)));
        this.#yawVelocity = move(this.#yawVelocity, rate, m.turnAcceleration * dt);
        const step = this.#yawVelocity * dt;
        this.#yaw = wrap(this.#yaw + (Math.sign(step) === Math.sign(error) && Math.abs(step) > Math.abs(error) ? error : step));
        if (sidestep)
            speed = 0;
        this.#lateralSpeed = move(this.#lateralSpeed, sidestep ? m.walk * this.#avoidSign : 0, m.acceleration * dt);
        speed *= Math.max(0, Math.cos(error));
        this.#speed = move(this.#speed, speed, (speed > this.#speed ? m.acceleration : m.deceleration) * dt);
        const before = { ...this.#position }, next = { x: before.x + (this.#airborne ? this.#jumpVelocity.x : Math.sin(this.#yaw) * this.#speed + Math.cos(this.#yaw) * this.#lateralSpeed) * dt, y: before.y, z: before.z + (this.#airborne ? this.#jumpVelocity.z : Math.cos(this.#yaw) * this.#speed - Math.sin(this.#yaw) * this.#lateralSpeed) * dt };
        if (this.#valid(before, next)) {
            this.#position.x = next.x;
            this.#position.z = next.z;
        }
        else {
            this.#speed = move(this.#speed, 0, m.deceleration * dt);
            this.#lateralSpeed = move(this.#lateralSpeed, 0, m.deceleration * dt);
            this.#blocked += dt;
        }
        const ground = this.#env.ground(this.#position.x, this.#position.z);
        if (this.#airborne) {
            this.#vertical -= m.gravity * dt;
            this.#position.y += this.#vertical * dt;
            if (this.#position.y <= ground) {
                this.#position.y = ground;
                this.#vertical = 0;
                this.#airborne = false;
                this.#jumpVelocity = { x: 0, y: 0, z: 0 };
                if (a)
                    a.landed = true;
                this.#emit('environment', 'landing', this.#position);
            }
        }
        else
            this.#position.y = ground;
        this.#velocity = { x: (this.#position.x - before.x) / dt, y: (this.#position.y - before.y) / dt, z: (this.#position.z - before.z) / dt };
        const oldGait = this.#gait;
        this.#gait = (this.#gait + Math.hypot(this.#position.x - before.x, this.#position.z - before.z) / m.stride) % 1;
        if (Math.floor(oldGait * 2) !== Math.floor(this.#gait * 2))
            this.#emit('environment', 'footstep', this.#position);
        this.#stagger = Math.max(0, this.#stagger - dt * 50);
    }
    #updatePose(dt = 0) {
        const s = this.species, a = this.#active, timeline = a ? titanTimeline(a.definition, this.#time - a.start) : null;
        for (const [name, j] of Object.entries(s.joints)) {
            if (j.foot || name.startsWith('foot')) {
                const phase = (this.#gait + (j.gaitPhase ?? (name.endsWith('right') ? .5 : 0))) % 1;
                if (!this.#feet[name] || this.#airborne || Math.hypot(this.#velocity.x, this.#velocity.z) < .1) {
                    this.#feet[name] = this.#anchor(name);
                    this.#footSwings.delete(name);
                }
                else if (phase > .6) {
                    let swing = this.#footSwings.get(name);
                    if (!swing) {
                        const next = this.#anchor(name);
                        next.x += this.#velocity.x / Math.max(.01, Math.hypot(this.#velocity.x, this.#velocity.z)) * s.movement.stride * .4;
                        next.z += this.#velocity.z / Math.max(.01, Math.hypot(this.#velocity.x, this.#velocity.z)) * s.movement.stride * .4;
                        next.y = this.#env.ground(next.x, next.z) + j.position.y;
                        swing = { from: { ...this.#feet[name] }, to: next };
                        this.#footSwings.set(name, swing);
                    }
                    const u = (phase - .6) / .4, w = u * u * (3 - 2 * u);
                    this.#feet[name] = { x: swing.from.x + (swing.to.x - swing.from.x) * w, y: swing.from.y + (swing.to.y - swing.from.y) * w + Math.sin(u * Math.PI) * s.movement.stepHeight, z: swing.from.z + (swing.to.z - swing.from.z) * w };
                }
                else
                    this.#footSwings.delete(name);
            }
            const previous = this.#limbs[name];
            this.#limbs[name] = a && timeline && a.definition.mechanism === 'sweep' && a.definition.requires.includes(name) ? titanAttackPose(this.#position, this.#yaw, j.position, a.definition, timeline.stage, timeline.progress, j.mirror ?? name === 'hand-right') : this.#feet[name] ?? this.#anchor(name);
            this.#limbVelocities[name] = previous && dt > 0 ? { x: (this.#limbs[name].x - previous.x) / dt, y: (this.#limbs[name].y - previous.y) / dt, z: (this.#limbs[name].z - previous.z) / dt } : { x: 0, y: 0, z: 0 };
        }
    }
    #hit(a: Active, t: Target, position: Vec) {
        if (a.hit.has(t.id))
            return;
        a.hit.add(t.id);
        this.#emit('damage', a.definition.mechanism, position, { ability: a.definition.id, targetId: t.id, amount: a.definition.damage });
    }
    #combat(dt: number, targets: readonly Target[], visible: Target | undefined) {
        const a = this.#active;
        if (!a)
            return;
        const def = a.definition, elapsed = this.#time - a.start, t = titanTimeline(def, elapsed);
        if (t.stage !== a.lastStage) {
            a.lastStage = t.stage;
            this.#emit('animation', def.event, this.#position, { ability: def.id, stage: t.stage, progress: t.progress });
        }
        if (t.stage === 'COOLDOWN' || t.stage === 'DONE') {
            this.#comboDepth = a.combo;
            this.#comboUntil = this.#time + .8;
            this.#misses = a.hit.size ? 0 : Math.min(8, this.#misses + 1);
            this.#active = null;
            return;
        }
        if (t.stage !== 'ACTIVE')
            return;
        const origin = this.#anchor(def.requires[0]);
        if (visible?.id === a.targetId && def.mechanism === 'beam' && this.#withinCone(origin, visible.position, def.cone)) {
            const desired = unit(origin, visible.position), rate = (def.tracking ?? 0) * dt;
            // Direction constrained by real angular speed, not component-wise snapping.
            const dot = clamp(a.direction.x * desired.x + a.direction.y * desired.y + a.direction.z * desired.z, -1, 1), angle = Math.acos(dot), blend = angle > 1e-8 ? Math.min(1, rate / angle) : 1;
            a.direction = unit({ x: 0, y: 0, z: 0 }, { x: a.direction.x + (desired.x - a.direction.x) * blend, y: a.direction.y + (desired.y - a.direction.y) * blend, z: a.direction.z + (desired.z - a.direction.z) * blend });
        }
        const validTargets = targets.slice(0, 16).filter(v => v.authorized && v.alive && v.encounterId === this.id);
        if (def.mechanism === 'projectile') {
            const count = def.count ?? 1, due = Math.min(count, 1 + Math.floor(t.progress * count));
            while (a.released < due) {
                const index = a.released++, debris = def.debris ? this.#env.takeDebris?.(this.id, origin) : undefined;
                if (def.debris && !debris)
                    continue;
                if (debris && distance(origin, debris.position) > this.species.radius + def.radius)
                    continue;
                const from = debris?.position ?? origin, speed = def.projectileSpeed!, point = visible?.id === a.targetId ? intercept(from, visible.position, { x: visible.velocity.x * difficulties[this.species.level].prediction, y: visible.velocity.y * difficulties[this.species.level].prediction, z: visible.velocity.z * difficulties[this.species.level].prediction }, speed, def.maxRange / speed) : a.aim;
                if (point && !this.#withinCone(from, point, def.cone))
                    continue;
                if (!point || this.#shots.filter(v => v.live).length >= 32)
                    continue;
                const dir = unit(from, point), angle = (index - (count - 1) / 2) * (def.spread ?? 0), c = Math.cos(angle), s = Math.sin(angle);
                const shot: Shot = { id: `${this.id}:shot:${a.serial}:${index}`, position: { ...from }, velocity: { x: (dir.x * c + dir.z * s) * speed, y: dir.y * speed, z: (dir.z * c - dir.x * s) * speed }, radius: debris?.radius ?? def.radius, damage: def.damage, life: def.maxRange / speed, ability: def.id, attack: a.serial, live: true };
                const slot = this.#shots.findIndex(v => !v.live);
                if (slot < 0)
                    this.#shots.push(shot);
                else
                    this.#shots[slot] = shot;
                this.#emit('animation', 'release', from, { ability: def.id, stage: 'ACTIVE', progress: t.progress });
            }
        }
        else if (def.mechanism === 'leap' && !a.released) {
            a.released++;
            this.#vertical = this.species.movement.jumpSpeed;
            const flight = 2 * this.#vertical / this.species.movement.gravity, travel = Math.min(def.maxRange, distance(this.#position, a.aim), this.species.movement.run * flight), dir = unit(this.#position, a.aim);
            this.#jumpVelocity = { x: dir.x * travel / flight, y: 0, z: dir.z * travel / flight };
            this.#airborne = true;
            this.#emit('animation', 'jump', this.#position, { ability: def.id });
        }
        for (const target of validTargets) {
            if (def.mechanism === 'beam') {
                const end = { x: origin.x + a.direction.x * def.maxRange, y: origin.y + a.direction.y * def.maxRange, z: origin.z + a.direction.z * def.maxRange }, hit = projectileImpactFraction(origin, end, target.position, target.velocity, dt, def.radius + target.radius), block = this.#env.obstruction(origin, end, def.radius);
                if (hit !== null && (block === null || hit < block))
                    this.#hit(a, target, target.position);
            }
            else if (def.mechanism === 'sweep') {
                for (const name of def.requires) {
                    const end = this.#limbs[name], start = a.previousLimbs.get(name) ?? titanAttackPose(this.#position, this.#yaw, this.species.joints[name].position, def, 'ACTIVE', 0, this.species.joints[name].mirror ?? name === 'hand-right');
                    const hit = projectileImpactFraction(start, end, target.position, target.velocity, dt, def.radius + target.radius), block = this.#env.obstruction(start, end, def.radius);
                    if (hit !== null && (block === null || hit < block))
                        this.#hit(a, target, end);
                }
            }
            else if (def.mechanism === 'charge') {
                const start = { x: this.#position.x - this.#velocity.x * dt, y: this.#position.y + this.species.height * .35, z: this.#position.z - this.#velocity.z * dt }, end = { ...this.#position, y: this.#position.y + this.species.height * .35 };
                if (projectileImpactFraction(start, end, target.position, target.velocity, dt, def.radius + target.radius) !== null && this.#env.lineOfSight(end, target.position))
                    this.#hit(a, target, end);
            }
            else if (def.mechanism === 'area' || def.mechanism === 'leap' && a.landed) {
                const from = def.directional ? origin : this.#position, alt = target.position.y - this.#env.ground(target.position.x, target.position.z), angle = Math.abs(wrap(Math.atan2(target.position.x - from.x, target.position.z - from.z) - this.#yaw));
                if (alt <= def.maxAltitude && (!def.directional || angle <= def.cone) && projectileImpactFraction(from, from, target.position, target.velocity, dt, def.radius + target.radius) !== null && this.#env.lineOfSight(from, target.position))
                    this.#hit(a, target, from);
            }
        }
        if ((def.mechanism === 'area' || def.mechanism === 'charge' || def.mechanism === 'leap' && a.landed) && !a.released) {
            a.released++;
            this.#emit('environment', def.event, this.#position, { ability: def.id });
        }
        for (const name of def.requires)
            a.previousLimbs.set(name, { ...this.#limbs[name] });
    }
    #projectiles(dt: number, targets: readonly Target[]) {
        for (const p of this.#shots) {
            if (!p.live)
                continue;
            const end = { x: p.position.x + p.velocity.x * dt, y: p.position.y + p.velocity.y * dt, z: p.position.z + p.velocity.z * dt };
            let first = this.#env.obstruction(p.position, end, p.radius) ?? Infinity, target: Target | undefined;
            for (const t of targets.slice(0, 16)) {
                if (!t.authorized || !t.alive || t.encounterId !== this.id)
                    continue;
                const hit = projectileImpactFraction(p.position, end, t.position, t.velocity, dt, p.radius + t.radius);
                if (hit !== null && hit < first) {
                    first = hit;
                    target = t;
                }
            }
            if (Number.isFinite(first)) {
                p.live = false;
                if (target) {
                    this.#misses = 0;
                    if (this.#active?.serial === p.attack)
                        this.#active.hit.add(target.id);
                    this.#emit('damage', 'projectile', { x: p.position.x + (end.x - p.position.x) * first, y: p.position.y + (end.y - p.position.y) * first, z: p.position.z + (end.z - p.position.z) * first }, { ability: p.ability,attackId:`${this.id}:attack:${p.attack}`, targetId: target.id, amount: p.damage });
                }
                else
                    this.#emit('environment', 'projectile-impact', end, { ability: p.ability });
            }
            p.position = end;
            p.life -= dt;
            if (p.life <= 0)
                p.live = false;
        }
    }
    /** Integrate exactly supplied authoritative time (no hidden wall clock). Oversized steps rejected. */
    step(dt: number, targets: readonly Target[], threats: readonly Threat[] = []): Snapshot {
        if (this.#disposed || !Number.isFinite(dt) || dt <= 0 || dt > .1 || targets.length > 16 || threats.length > 32)
            throw Error('Invalid/oversized encounter step');
        if (targets.some(t => !Number.isFinite(t.radius) || t.radius <= 0 || [...Object.values(t.position), ...Object.values(t.velocity)].some(v => !Number.isFinite(v))))
            throw Error('Invalid authoritative observation');
        this.#events = this.#pendingEvents;
        this.#pendingEvents = [];
        this.#stepping = true;
        if (this.#health <= 0) {
            this.#stepping = false;
            return this.snapshot();
        }
        this.#time += dt;
        const visible = this.#target(targets);
        if (this.#time + 1e-9 >= this.#nextDecision)
            this.#plan(visible, threats);
        if (this.#time - this.#lastSeen > difficulties[this.species.level].memory) {
            this.#memory = [];
            this.#observedId = '';
        }
        if (visible && this.species.movement.independentAim) {
            const head = this.species.joints.head ? this.#anchor('head') : this.#position;
            this.#headYaw = move(this.#headYaw, clamp(wrap(Math.atan2(visible.position.x - head.x, visible.position.z - head.z) - this.#yaw), -.8, .8), dt);
            this.#headPitch = move(this.#headPitch, clamp(Math.atan2(visible.position.y - head.y, Math.hypot(visible.position.x - head.x, visible.position.z - head.z)), -.6, .6), dt);
        }
        // Subdivide continuous movement/limb arcs; bounded 120 Hz prevents long curved sweeps becoming chords.
        const count = Math.ceil(dt / (1 / 120)), delta = dt / count;
        const end = this.#time;
        this.#time -= dt;
        for (let i = 0; i < count; i++) {
            this.#time += delta;
            const remaining = end - this.#time, local = targets.map(t => ({ ...t, position: { x: t.position.x - t.velocity.x * remaining, y: t.position.y - t.velocity.y * remaining, z: t.position.z - t.velocity.z * remaining } }));
            this.#move(delta);
            this.#updatePose(delta);
            this.#combat(delta, local, local.find(t => t.id === visible?.id));
            this.#projectiles(delta, local);
        }
        this.#time = end;
        this.#stepping = false;
        return this.snapshot();
    }
    /** Trusted host supplies ordered, monotonic per-source contact sequences, including misses. */
    damage(input: {
        encounterId: string;
        source: string;
        sequence: number;
        from: Vec;
        to: Vec;
        amount: number;
        radius: number;
        delta: number;
    }): number {
        if (this.#disposed || input.encounterId !== this.id || this.#health <= 0 || (!this.#damageReceipts.has(input.source) && this.#damageReceipts.size >= 16) || !input.source || !Number.isSafeInteger(input.sequence) || input.sequence < 1 || input.sequence <= (this.#damageReceipts.get(input.source) ?? 0) || !Number.isFinite(input.delta) || input.delta < 0 || input.delta > .1 || !Number.isFinite(input.amount) || input.amount <= 0 || !Number.isFinite(input.radius) || input.radius < 0 || [...Object.values(input.from), ...Object.values(input.to)].some(v => !Number.isFinite(v)))
            return 0;
        this.#damageReceipts.set(input.source, input.sequence);
        let selected: Species['regions'][number] | undefined, first = Infinity;
        for (const r of this.species.regions) {
            const anchor = this.#limbs[r.joint] ?? this.#anchor(r.joint), f = projectileImpactFraction(input.from, input.to, anchor, this.#limbVelocities[r.joint] ?? this.#velocity, input.delta, r.radius + input.radius);
            if (f !== null && f < first) {
                first = f;
                selected = r;
            }
        }
        const block = this.#env.obstruction(input.from, input.to, input.radius);
        if (!selected || block !== null && block < first)
            return 0;
        const amount = Math.min(this.#health, input.amount * selected.multiplier);
        this.#health -= amount;
        this.#stagger += amount;
        this.#emit('animation', this.#health <= 0 ? 'defeat' : 'hit', this.#position, { amount });
        if (this.#stagger >= selected.stagger && this.#active?.definition.interruptible) {
            this.#cooldowns.set(this.#active.definition.id, this.#time + this.#active.definition.recovery + this.#active.definition.cooldown);
            this.#active = null;
            this.#tactic = 'recover';
            this.#commitUntil = this.#time + 1;
        }
        if (this.#health <= 0) {
            this.#active = null;
            this.#shots = [];
            this.#speed = 0;
            this.#velocity = { x: 0, y: 0, z: 0 };
        }
        return amount;
    }
    snapshot(): Snapshot {
        const a = this.#active, t = a ? titanTimeline(a.definition, this.#time - a.start) : null;
        return { encounterId: this.id, time: this.#time, health: this.#health, position: { ...this.#position }, velocity: { ...this.#velocity }, yaw: this.#yaw, headYaw: this.#headYaw, headPitch: this.#headPitch, gait: this.#gait, feet: structuredClone(this.#feet), limbs: structuredClone(this.#limbs), tactic: this.#tactic, locomotion: this.#health <= 0 ? 'defeat' : this.#airborne ? 'jump' : a?.definition.mechanism === 'charge' && t?.stage === 'ACTIVE' ? 'charge' : this.#tactic === 'recover' ? 'recover' : Math.abs(this.#lateralSpeed) > 1 ? 'sidestep' : this.#speed > this.species.movement.walk ? 'run' : this.#speed > .1 ? 'walk' : 'idle', ability: a && t ? { id: a.definition.id, eventId: `${this.id}:attack:${a.serial}`, stage: t.stage, progress: t.progress, animation: a.definition.animation, comboDepth: a.combo, origin: this.#anchor(a.definition.requires[0]), direction: { ...a.direction } } : null, projectiles: this.#shots.filter(v => v.live).map(v => ({ id: v.id, position: { ...v.position }, radius: v.radius })), events: [...this.#events, ...this.#pendingEvents].map(e => ({ ...e, position: { ...e.position } })) };
    }
    reset() {
        this.#env.reset?.(this.id);
        this.#position = { ...this.#initial };
        this.#position.y = this.#env.ground(this.#position.x, this.#position.z);
        this.#velocity = { x: 0, y: 0, z: 0 };
        this.#yaw = 0;
        this.#yawVelocity = 0;
        this.#speed = 0;
        this.#health = this.species.health;
        this.#gait = 0;
        this.#headYaw = 0;
        this.#headPitch = 0;
        this.#nextDecision = 0;
        this.#commitUntil = 0;
        this.#tactic = 'hunt';
        this.#goal = { ...this.#position };
        this.#memory = [];
        this.#observedId = '';
        this.#visibleSince = 0;
        this.#lastSeen = 0;
        this.#active = null;
        this.#cooldowns.clear();
        this.#shots = [];
        this.#events = [];
        this.#pendingEvents = [];
        this.#stepping = false;
        this.#feet = {};
        this.#footSwings.clear();
        this.#limbs = {};
        this.#limbVelocities = {};
        this.#blocked = 0;
        this.#avoidSign = 1;
        this.#vertical = 0;
        this.#airborne = false;
        this.#stagger = 0;
        this.#misses = 0;
        this.#lastAbility = '';
        this.#comboDepth = 0;
        this.#comboUntil = 0;
        this.#damageReceipts.clear();
        this.#previousTargetVelocity = { x: 0, y: 0, z: 0 };
        this.#jumpVelocity = { x: 0, y: 0, z: 0 };
        this.#nextNavigation = 0;
        this.#navYaw = 0;
        this.#lateralSpeed = 0;
        this.#updatePose();
    }
    dispose() {
        if (this.#disposed)
            return;
        this.reset();
        this.#disposed = true;
    }
}
