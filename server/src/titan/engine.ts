import type {AuthoredAnimation} from '../../../shared/titan-animation.mjs';
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
export type AuthoredPoseContext={time:number;health:number;gait:number;velocity:Vec;yawVelocity:number;airborne:boolean;ability:null|{id:string;stage:string;progress:number;elapsed:number;active:number;warning:number;windup:number;recovery:number}};
export type Environment = {
    authoredPose?:boolean;
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
    articulate?(limbs: Record<string, Vec>, feet: Record<string, Vec>, root: Vec, yaw: number, axes: Record<string, {
        x: Vec;
        y: Vec;
        z: Vec;
    }>,context:AuthoredPoseContext): AuthoredAnimation|void;
    navigationProbe?: number;
    poseClear?(from: Vec, to: Vec, yaw: number, lift: number): boolean;
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
    debris?: {
        id: string;
        position: Vec;
        radius: number;
    };
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
    #gaitRate = 0;
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
    #authoredAnimation?:AuthoredAnimation;
    #updatingPose=false;
    #volumeAxes: Record<string, {
        x: Vec;
        y: Vec;
        z: Vec;
    }> = {};
    #previousPose: Record<string, Vec> = {};
    #lastContacts = new Map<string, number>();
    #limbVelocities: Record<string, Vec> = {};
    #blocked = 0;
    #stalled = 0;
    #escapeUntil = 0;
    #escapeDirection: Vec = { x: 0, y: 0, z: 0 };
    #avoidSign = 1;
    #vertical = 0;
    #airborne = false;
    #stagger = 0;
    #recoverUntil = 0;
    #jumpVelocity: Vec = { x: 0, y: 0, z: 0 };
    #navYaw = 0;
    #nextNavigation = 0;
    #lateralSpeed = 0;
    #misses = 0;
    #lastAbility = '';
    #nextTraversal = 0;
    #leapGoal: Vec | null = null;
    #leapPrepareUntil = 0;
    #comboUntil = 0;
    #comboDepth = 0;
    #disposed = false;
    constructor(id: string, species: Readonly<Species>, position: Vec, environment: Environment, initial: {
        health?: number;
        yaw?: number;
    } = {}) {
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
        this.#health = initial.health ?? species.health;
        this.#yaw = initial.yaw ?? 0;
        if (!Number.isFinite(this.#health) || this.#health <= 0 || this.#health > species.health || !Number.isFinite(this.#yaw))
            throw Error("Invalid initial state");
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
    #crouch() {
        const a = this.#active;
        if (!a)
            return 0;
        const t = titanTimeline(a.definition, this.#time - a.start), p = t.progress;
        const eased = p * p * (3 - 2 * p);
        return (a.definition.crouch ?? 0) * (t.stage === 'WARNING' ? eased : t.stage === 'RECOVERY' ? 1 - eased : t.stage === 'COOLDOWN' ? 0 : 1);
    }
    #anchor(joint: string) {
        if(this.#env.authoredPose&&!this.#updatingPose&&this.#limbs[joint])return this.#limbs[joint];
        const j = this.species.joints[joint], local = j.position, root = { ...this.#position, y: this.#position.y - (j.foot ? 0 : this.#crouch()) }, head = this.species.joints.head?.position, neck = this.species.joints.neck;
        if (!head || !this.species.movement.independentAim)
            return titanAnchor(root, this.#yaw, local);
        const weight = neck?.aimWeight ?? 0;
        if (j.bone === 'Neck')
            return titanAimedJoint(root, this.#yaw, local, neck?.position ?? head, this.#headYaw * weight, this.#headPitch * weight);
        if (joint === 'head' || joint === 'mouth' || ['Head', 'Jaw'].includes(j.bone)) {
            const moved = neck ? titanAimedJoint({ x: 0, y: 0, z: 0 }, 0, head, neck.position, this.#headYaw * weight, this.#headPitch * weight) : head;
            const aimed = titanAimedJoint({ x: 0, y: 0, z: 0 }, 0, local, head, this.#headYaw, this.#headPitch);
            return titanAnchor(root, this.#yaw, { x: aimed.x + moved.x - head.x, y: aimed.y + moved.y - head.y, z: aimed.z + moved.z - head.z });
        }
        return titanAnchor(root, this.#yaw, local);
    }
    #valid(from: Vec, to: Vec, flightLift?: number) { const b = this.#env.bounds, r = this.species.radius, g = this.#env.ground(to.x, to.z); return Number.isFinite(g) && to.x >= b.minX + r && to.x <= b.maxX - r && to.z >= b.minZ + r && to.z <= b.maxZ - r && (flightLift !== undefined || Math.abs(g - this.#env.ground(from.x, from.z)) <= this.species.movement.stepHeight + Math.hypot(to.x - from.x, to.z - from.z) * this.species.arena.maxSlope) && this.#env.traversable(from, to, r, this.species.height) && (this.#env.poseClear?.(from, to, this.#yaw, flightLift ?? Math.max(0, this.#position.y - this.#env.ground(from.x, from.z))) ?? true); }
    #target(targets: readonly Target[]): Target | undefined {
        const s = this.species;
        let chosen: Target | undefined, best = Infinity;
        const eye = s.joints.head ? this.#anchor('head') : { ...this.#position, y: this.#position.y + s.height * .8 };
        for (const t of targets.slice(0, 16)) {
            if (!t.authorized || !t.alive || t.encounterId !== this.id || t.radius <= 0 || Object.values(t.position).some(v => !Number.isFinite(v)) || Object.values(t.velocity).some(v => !Number.isFinite(v)))
                continue;
            const d = distance(eye, t.position), angle = Math.abs(wrap(Math.atan2(t.position.x - eye.x, t.position.z - eye.z) - this.#yaw));
            if (d <= s.senses.range && angle <= s.senses.fov / 2 && d < best && (s.senses.pursueOccluded || this.#env.lineOfSight(eye, t.position))) {
                chosen = t;
                best = d;
            }
        }
        return chosen;
    }
    #withinCone(origin: Vec, target: Vec, cone: number) { const d = unit(origin, target); return d.x * Math.sin(this.#yaw) + d.z * Math.cos(this.#yaw) >= Math.cos(cone); }
    #eligible(a: Ability, t: Target) {
        const origin = this.#anchor(a.requires[0]), d = distance(origin, t.position), alt = t.position.y - this.#env.ground(t.position.x, t.position.z);
        if(a.mechanism==='sweep'&&a.contactBounds){const dx=t.position.x-this.#position.x,dz=t.position.z-this.#position.z,c=Math.cos(this.#yaw),s=Math.sin(this.#yaw),p={x:c*dx-s*dz,y:t.position.y-this.#position.y,z:s*dx+c*dz},bounds=a.contactBounds;if((['x','y','z']as const).some(k=>p[k]<bounds.min[k]-t.radius||p[k]>bounds.max[k]+t.radius))return false;}
        if (a.mechanism === 'sweep' && !a.contactBounds && !a.requires.some(name => {
            const j = this.species.joints[name], pivot = a.pivot ? { ...a.pivot, x: name === 'hand-right' ? -a.pivot.x : a.pivot.x } : j.position, p = titanAnchor(this.#position, this.#yaw, pivot), radius = a.radius + t.radius;
            return distance(p, t.position) <= Math.min(j.reach ?? Infinity, Math.hypot(a.reach ?? 0, a.lift ?? 0)) + radius && t.position.y >= p.y - radius && t.position.y <= p.y + (a.lift ?? 0) + radius;
        }))
            return false;
        return (a.unlockBelow === undefined || this.#health / this.species.health <= a.unlockBelow) && this.#time >= (this.#cooldowns.get(a.id) ?? 0) && d >= a.minRange && d <= a.maxRange && alt <= a.maxAltitude && this.#withinCone(origin, t.position, a.cone) && this.#env.lineOfSight(origin, t.position);
    }
    #leapDestination(goal: Vec, a: Ability): Vec | null {
        const m = this.species.movement, nominalFlight = 2 * m.jumpSpeed / m.gravity, d = Math.hypot(goal.x - this.#position.x, goal.z - this.#position.z), travel = Math.min(a.maxRange, m.run * nominalFlight, d);
        if (travel < Math.max(.001, a.minRange))
            return null;
        const end = { x: this.#position.x + (goal.x - this.#position.x) / d * travel, y: this.#position.y, z: this.#position.z + (goal.z - this.#position.z) / d * travel }, b = this.#env.bounds, r = this.species.radius, landing = this.#env.ground(end.x, end.z);
        if (end.x < b.minX + r || end.x > b.maxX - r || end.z < b.minZ + r || end.z > b.maxZ - r || m.jumpSpeed ** 2 - 2 * m.gravity * (landing - this.#position.y) < 0)
            return null;
        const flight = (m.jumpSpeed + Math.sqrt(m.jumpSpeed ** 2 - 2 * m.gravity * (landing - this.#position.y))) / m.gravity;
        if (flight > a.active || travel > m.run * flight) return null;
        for (const [dx, dz] of [[0, 0], [18, 0], [-18, 0], [0, 18], [0, -18]]) {
            const p = { ...end, x: end.x + dx, z: end.z + dz };
            if (!(this.#env.poseClear?.(p, p, this.#yaw, 0) ?? this.#env.traversable(p, p, r, this.species.height)))
                return null;
        }
        for (let i = 0; i <= 24; i++) {
            const t = i / 24, p = { x: this.#position.x + (end.x - this.#position.x) * t, y: this.#position.y, z: this.#position.z + (end.z - this.#position.z) * t }, lift = Math.max(0, this.#position.y + m.jumpSpeed * (t * flight) - m.gravity * (t * flight) ** 2 / 2 - this.#env.ground(p.x, p.z));
            if (!(this.#env.poseClear?.(p, p, this.#yaw, lift) ?? this.#env.traversable(p, p, r, this.species.height)))
                return null;
        }
        return end;
    }
    #traversalDestination(goal: Vec, a: Ability): Vec | null {
        const direct = this.#leapDestination(goal, a);
        if (direct)
            return direct;
        const heading = Math.atan2(goal.x - this.#position.x, goal.z - this.#position.z);
        for (const offset of [.6, -.6, 1.1, -1.1])
            for (const span of [a.maxRange, a.maxRange * .65]) {
                const angle = heading + offset;
                if (Math.abs(wrap(angle - this.#yaw)) > Math.PI / 2)
                    continue;
                const point = { x: this.#position.x + Math.sin(angle) * span, y: this.#position.y, z: this.#position.z + Math.cos(angle) * span }, landing = this.#leapDestination(point, a);
                if (landing && Math.hypot(goal.x - landing.x, goal.z - landing.z) < Math.hypot(goal.x - this.#position.x, goal.z - this.#position.z))
                    return landing;
            }
        return null;
    }
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
        const danger = threats.slice(0, 32).some(p => p.encounterId === this.id && distance(p.position, this.#position) <= this.species.senses.range && this.#env.lineOfSight(this.#anchor('body'), p.position) && projectileImpactFraction(p.position, { x: p.position.x + p.velocity.x * 2, y: p.position.y + p.velocity.y * 2, z: p.position.z + p.velocity.z * 2 }, { x: this.#anchor('body').x + this.#velocity.x * 2, y: this.#anchor('body').y + this.#velocity.y * 2, z: this.#anchor('body').z + this.#velocity.z * 2 }, this.#velocity, 2, this.species.radius + p.radius) !== null);
        const available = this.species.abilities.filter(a => this.#eligible(a, t));
        const scores: Record<Tactic, number> = { hunt: .3, intercept: speed > 30 ? .65 : .2, 'control-space': high ? .8 : .2, reposition: circling || rearPressure ? .9 : .3, defend: danger ? .8 + .8 * profile.awareness : .05, recover: this.#time < this.#recoverUntil ? 1.5 : .05, attack: available.length ? 1.05 : .1 };
        if (rearPressure && available.some(a => a.requires.includes('tail')))
            scores.attack += .25;
        if (this.species.personality === 'defensive')
            scores.defend += .15;
        if (this.species.personality === 'aggressive')
            scores.attack += .1 + (1 - this.#health / this.species.health) * .2;
        if (d > this.species.height * 3)
            scores.intercept += .3;
        if (this.#misses > 1)
            scores.reposition += Math.min(.5, this.#misses * .1);
        const winner = (Object.keys(scores) as Tactic[]).reduce((a, b) => scores[a] >= scores[b] ? a : b);
        const renewIntent = this.#time >= this.#commitUntil || scores[winner] > scores[this.#tactic] + .3;
        const previousGoal = this.#goal;
        if (renewIntent) {
            this.#tactic = winner;
            this.#commitUntil = this.#time + Math.max(this.species.movement.intentDuration ?? .6, profile.reaction * 2);
        }
        const lead = clamp(d / Math.max(100, this.species.movement.run + speed), 0, 3) * profile.prediction;
        this.#goal = { x: t.position.x + t.velocity.x * lead, y: this.#position.y, z: t.position.z + t.velocity.z * lead };
        if (this.#tactic === 'reposition' || this.#tactic === 'defend') {
            const span = this.species.movement.repositionDistance ?? this.species.height;
            const side = this.#avoidSign * span;
            // A travel-capable species commits to a forward flanking leg instead of
            // repeatedly selecting a point directly beside its changing heading.
            const forward = this.species.movement.repositionDistance ? span * .75 : 0;
            this.#goal = renewIntent ? { x: this.#position.x + Math.cos(this.#yaw) * side + Math.sin(this.#yaw) * forward, y: this.#position.y, z: this.#position.z - Math.sin(this.#yaw) * side + Math.cos(this.#yaw) * forward } : previousGoal;
        }
        if (this.#tactic === 'control-space') {
            this.#goal.x -= t.velocity.x * 2;
            this.#goal.z -= t.velocity.z * 2;
        }
        const travelSpan = this.species.movement.repositionDistance;
        if (travelSpan && ['attack', 'intercept', 'control-space'].includes(this.#tactic) &&
            Math.hypot(t.position.x - this.#position.x, t.position.z - this.#position.z) < travelSpan * .8 &&
            !available.some(a => a.mechanism === 'sweep' || a.mechanism === 'charge')) {
            // Do not park underneath an airborne target: advance to another usable
            // firing angle, retaining the leg while the aircraft moves overhead.
            const reached = Math.hypot(previousGoal.x - this.#position.x, previousGoal.z - this.#position.z) < this.species.radius * 2;
            this.#goal = renewIntent || reached ? {
                x: this.#position.x + Math.sin(this.#yaw) * travelSpan + Math.cos(this.#yaw) * travelSpan * .6 * this.#avoidSign,
                y: this.#position.y,
                z: this.#position.z + Math.cos(this.#yaw) * travelSpan - Math.sin(this.#yaw) * travelSpan * .6 * this.#avoidSign
            } : previousGoal;
        }
        if (this.#tactic === 'recover')
            this.#goal = { ...this.#position };
        const bounds = this.#env.bounds, margin = this.species.radius + 100;
        this.#goal.x = clamp(this.#goal.x, bounds.minX + margin, bounds.maxX - margin);
        this.#goal.z = clamp(this.#goal.z, bounds.minZ + margin, bounds.maxZ - margin);
        if (this.#leapGoal && !this.#active) {
            if (danger || this.#time > this.#leapPrepareUntil)
                this.#leapGoal = null;
            else if (Math.hypot(this.#velocity.x, this.#velocity.z) > 1)
                return;
            else {
                const leap = this.species.abilities.find(a => a.mechanism === 'leap'), landing = leap && this.#leapDestination(this.#leapGoal, leap);
                this.#leapGoal = null;
                if (leap && landing && this.#start(leap, t, landing))
                    return;
            }
        }
        if (this.species.movement.traversalLeap && !this.#active && this.#time >= this.#nextTraversal && this.#tactic !== 'recover' && !danger && Math.hypot(this.#goal.x - this.#position.x, this.#goal.z - this.#position.z) > this.species.height) {
            this.#nextTraversal = this.#time + 5;
            const leap = this.species.abilities.find(a => a.mechanism === 'leap' && this.#time >= (this.#cooldowns.get(a.id) ?? 0));
            const landing = leap && this.#traversalDestination(this.#goal, leap);
            if (landing && (!this.species.movement.traversalOnlyWhenBlocked || !this.#valid(this.#position, landing))) {
                this.#leapGoal = landing;
                this.#leapPrepareUntil = this.#time + this.species.movement.run / this.species.movement.deceleration + 2;
                return;
            }
        }
        if (!this.#active && available.length && (this.#tactic === 'attack' || this.#tactic === 'defend')) {
            // Rank practical geometry, adaptation and continuity; never force a scripted power rotation.
            const scored = available.filter(a => this.#tactic !== 'defend' || a.moving && ['projectile', 'beam'].includes(a.mechanism)).map(a => ({ a, score: (a.mechanism === 'projectile' || a.mechanism === 'beam' ? (high ? .8 : .4) : .5) + (stationary && a.mechanism === 'area' ? .5 : 0) + (circling && a.directional ? .3 : 0) - (a.id === this.#lastAbility ? this.#misses * .15 : 0) + (a.moving && this.#speed > 1 ? .15 : 0) })).sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id));
            for (const candidate of scored)
                if (this.#start(candidate.a, t))
                    break;
        }
    }
    #start(a: Ability, t: Target, landing?: Vec) {
        if (this.#active || (!landing && !this.#eligible(a, t)))
            return false;
        const debris = a.debris ? this.#env.takeDebris?.(this.id, this.#anchor(a.requires[0])) : undefined;
        if (a.debris && (!debris || distance(debris.position, this.#anchor(a.requires[0])) > this.species.radius + a.radius))
            return false;
        if (a.mechanism === 'leap') {
            landing ??= this.#leapDestination(t.position, a) ?? undefined;
            if (!landing)
                return false;
        }
        const depth = this.#time <= this.#comboUntil ? this.#comboDepth + 1 : 1;
        if (depth > difficulties[this.species.level].combo)
            return false;
        this.#active = { definition: a, start: this.#time, serial: ++this.#serial, targetId: t.id, aim: { ...(landing ?? t.position) }, direction: unit(this.#anchor(a.requires[0]), t.position), released: 0, hit: new Set(), lastStage: 'SELECT', combo: depth, previousLimbs: new Map(), landed: false, debris: debris ?? undefined };
        this.#cooldowns.set(a.id, this.#time + a.warning + a.windup + a.active + a.recovery + a.cooldown);
        this.#emit('animation', a.event, this.#position, { ability: a.id, stage: 'SELECT', progress: 0 });
        this.#lastAbility = a.id;
        return true;
    }
    #move(dt: number) {
        const m = this.species.movement, a = this.#active, stage = a ? titanTimeline(a.definition, this.#time - a.start).stage : '';
        let goal = this.#goal, speed = this.#leapGoal || this.#tactic === 'recover' ? 0 : this.#tactic === 'hunt' ? m.walk : m.run;
        if (a && !a.definition.moving && stage !== 'COOLDOWN')
            speed = 0;
        if (a?.definition.mechanism === 'charge' && stage === 'ACTIVE') {
            speed = m.chargeSpeed;
            goal = { x: this.#position.x + a.direction.x * 1000, y: this.#position.y, z: this.#position.z + a.direction.z * 1000 };
        }
        const escaping = this.#time < this.#escapeUntil;
        let reverse = false;
        let sidestep = !this.#leapGoal && m.sidestep && this.#tactic === 'defend' && !this.#airborne && (!a || a.definition.moving) && stage !== 'ACTIVE';
        const d = distance(this.#position, goal);
        speed = Math.min(speed, Math.sqrt(2 * m.deceleration * Math.max(0, d - this.species.radius)));
        let wantedYaw = this.#navYaw;
        if (this.#time >= this.#nextNavigation) {
            this.#nextNavigation = this.#time + .2;
            wantedYaw = Math.atan2(goal.x - this.#position.x, goal.z - this.#position.z);
            // Bounded local fan: at most eight indexed segment queries, no world search.
            let chosen = false;
            for (const angle of [0, .45 * this.#avoidSign, -.45 * this.#avoidSign, .9 * this.#avoidSign, -.9 * this.#avoidSign, 1.4 * this.#avoidSign, -1.4 * this.#avoidSign, Math.PI * this.#avoidSign]) {
                const yaw = wantedYaw + angle, look = Math.max(this.#env.navigationProbe ?? this.species.radius * 2, this.#speed ** 2 / (2 * m.deceleration) + (this.#env.navigationProbe ?? this.species.radius) / 2), end = { x: this.#position.x + Math.sin(yaw) * look, y: this.#position.y, z: this.#position.z + Math.cos(yaw) * look };
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
        const error = wrap(wantedYaw - this.#yaw), rate = (this.#leapGoal || a?.definition.mechanism === 'leap' && (stage === 'WARNING' || stage === 'WINDUP')) ? 0 : Math.sign(error) * Math.min(m.turnRate, Math.sqrt(2 * m.turnAcceleration * Math.abs(error)));
        this.#yawVelocity = move(this.#yawVelocity, rate, m.turnAcceleration * dt);
        const step = this.#yawVelocity * dt, previousYaw = this.#yaw;
        this.#yaw = wrap(this.#yaw + (Math.sign(step) === Math.sign(error) && Math.abs(step) > Math.abs(error) ? error : step));
        if (this.#airborne) {
            this.#yaw = previousYaw;
            this.#yawVelocity = 0;
        }
        if (this.#env.poseClear && !this.#env.poseClear(this.#position, this.#position, this.#yaw, Math.max(0, this.#position.y - this.#env.ground(this.#position.x, this.#position.z)))) {
            this.#yaw = previousYaw;
            this.#yawVelocity = move(this.#yawVelocity, 0, m.turnAcceleration * dt);
            if (m.sidestep) {
                let escaped = false;
                for (const sign of [this.#avoidSign, -this.#avoidSign]) {
                    const to = { x: this.#position.x + Math.cos(this.#yaw) * sign * 80, y: this.#position.y, z: this.#position.z - Math.sin(this.#yaw) * sign * 80 };
                    if (this.#valid(this.#position, to)) {
                        sidestep = true;
                        escaped = true;
                        this.#avoidSign = sign;
                        break;
                    }
                }
                if (!escaped) {
                    const back = { x: this.#position.x - Math.sin(this.#yaw) * 100, y: this.#position.y, z: this.#position.z - Math.cos(this.#yaw) * 100 };
                    if (this.#valid(this.#position, back)) {
                        reverse = true;
                        sidestep = false;
                    }
                }
            }
        }
        if (escaping) {
            this.#yaw = previousYaw;
            this.#yawVelocity = move(this.#yawVelocity, 0, m.turnAcceleration * dt);
            sidestep = false;
            reverse = false;
        }
        if (sidestep)
            speed = 0;
        this.#lateralSpeed = move(this.#lateralSpeed, this.#leapGoal ? 0 : escaping ? (this.#escapeDirection.x * Math.cos(this.#yaw) - this.#escapeDirection.z * Math.sin(this.#yaw)) * m.walk * .6 : sidestep ? m.walk * this.#avoidSign : 0, m.acceleration * dt);
        speed *= Math.max(0, Math.cos(error));
        if (reverse)
            speed = -m.walk * .5;
        if (escaping)
            speed = (this.#escapeDirection.x * Math.sin(this.#yaw) + this.#escapeDirection.z * Math.cos(this.#yaw)) * m.walk * .6;
        if (this.#leapGoal)
            speed = 0;
        this.#speed = move(this.#speed, speed, (speed > this.#speed ? m.acceleration : m.deceleration) * dt);
        const before = { ...this.#position }, next = { x: before.x + (this.#airborne ? this.#jumpVelocity.x : Math.sin(this.#yaw) * this.#speed + Math.cos(this.#yaw) * this.#lateralSpeed) * dt, y: before.y, z: before.z + (this.#airborne ? this.#jumpVelocity.z : Math.cos(this.#yaw) * this.#speed - Math.sin(this.#yaw) * this.#lateralSpeed) * dt };
        if (this.#valid(before, next, this.#airborne ? Math.max(0, before.y + (this.#vertical - m.gravity * dt) * dt - this.#env.ground(next.x, next.z)) : undefined)) {
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
            this.#position.y += this.#vertical * dt - .5 * m.gravity * dt * dt;
            this.#vertical -= m.gravity * dt;
            if (this.#position.y <= ground) {
                this.#position.y = ground;
                this.#vertical = 0;
                this.#airborne = false;
                this.#feet = {};
                this.#footSwings.clear();
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
        const forward = this.#velocity.x * Math.sin(this.#yaw) + this.#velocity.z * Math.cos(this.#yaw), lateral = this.#velocity.x * Math.cos(this.#yaw) - this.#velocity.z * Math.sin(this.#yaw);
        this.#gaitRate = this.#airborne ? 0 : Math.max(Math.abs(forward) / (forward < 0 ? m.reverseStride ?? m.stride : m.stride) + Math.abs(lateral) / (m.lateralStride ?? m.stride), Math.abs(wrap(this.#yaw - previousYaw)) / dt * (m.turnStrideRadius ?? this.species.radius) / m.stride);
        this.#gait = (this.#gait + this.#gaitRate * dt) % 1;
        if (!this.#airborne && Math.floor(oldGait * 2) !== Math.floor(this.#gait * 2))
            this.#emit('environment', 'footstep', this.#position);
        this.#stagger = Math.max(0, this.#stagger - dt * 50);
        if (!escaping && !this.#airborne && (!a || a.definition.moving) && d > this.species.radius && Math.hypot(this.#velocity.x, this.#velocity.z) < 1)
            this.#stalled += dt;
        else
            this.#stalled = 0;
        if (this.#stalled > 2 && m.sidestep) {
            this.#stalled = 0;
            for (const offset of [Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI * .75, -Math.PI * .75]) {
                const angle = this.#yaw + offset, to = { x: this.#position.x + Math.sin(angle) * 120, y: this.#position.y, z: this.#position.z + Math.cos(angle) * 120 };
                if (this.#valid(this.#position, to)) {
                    this.#escapeDirection = { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
                    this.#escapeUntil = this.#time + 4;
                    break;
                }
            }
        }
    }
    #updatePose(dt = 0) {
        this.#updatingPose=true;
        const s = this.species, a = this.#active, timeline = a ? titanTimeline(a.definition, this.#time - a.start) : null;
        for (const [name, j] of Object.entries(s.joints)) {
            if (j.foot || name.startsWith('foot')) {
                const phase = (this.#gait + (j.gaitPhase ?? (name.endsWith('right') ? .5 : 0))) % 1;
                if (!this.#feet[name] || this.#airborne || Math.hypot(this.#velocity.x, this.#velocity.z) < .1 && Math.abs(this.#yawVelocity) < .015) {
                    this.#feet[name] = this.#anchor(name);
                    if (this.#airborne && a) {
                        const p = titanTimeline(a.definition, this.#time - a.start).progress;
                        this.#feet[name].y += Math.sin(p * Math.PI) * this.species.height * .1;
                    }
                    this.#footSwings.delete(name);
                }
                else if (phase > .6) {
                    let swing = this.#footSwings.get(name);
                    if (!swing) {
                        const lead = Math.min(1.5, .4 / Math.max(.01, this.#gaitRate));
                        const next = titanAnchor({ x: this.#position.x + this.#velocity.x * lead, y: this.#position.y, z: this.#position.z + this.#velocity.z * lead }, this.#yaw + this.#yawVelocity * lead, j.position);
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
            this.#previousPose[name] = previous;
            this.#limbs[name] = a && timeline && a.definition.mechanism === 'sweep' && a.definition.requires.includes(name) ? titanAttackPose({ ...this.#position, y: this.#position.y - this.#crouch() }, this.#yaw, j.position, a.definition, timeline.stage, timeline.progress, j.mirror ?? name === 'hand-right') : this.#feet[name] ?? this.#anchor(name);
        }
        if (a && timeline && a.definition.limbTargets) {
            const stage = timeline.stage, progress = timeline.progress, w = progress * progress * (3 - 2 * progress);
            for (const [name, targets] of Object.entries(a.definition.limbTargets)) {
                const rest = this.species.joints[name].position;
                const from = stage === 'WARNING' ? rest : stage === 'WINDUP' ? targets.warning : stage === 'ACTIVE' ? targets.windup : targets.active;
                const to = stage === 'WARNING' ? targets.warning : stage === 'WINDUP' ? targets.windup : stage === 'ACTIVE' ? targets.active : rest;
                const local = { x: from.x + (to.x - from.x) * w, y: from.y + (to.y - from.y) * w, z: from.z + (to.z - from.z) * w };
                this.#limbs[name] = titanAnchor({ ...this.#position, y: this.#position.y - this.#crouch() }, this.#yaw, local);
                if (this.species.joints[name].foot)
                    this.#feet[name] = this.#limbs[name];
            }
        }
        // One authoritative arm pose: counter-swing follows actual gait, not a
        // second client animation layered over the collision skeleton.
        if (!a && s.movement.independentAim) {
            const weight = Math.min(1, Math.hypot(this.#velocity.x, this.#velocity.z) / s.movement.walk), swing = Math.sin(this.#gait * Math.PI * 2) * s.height * .035 * weight;
            for (const side of ['left', 'right']) {
                const name = `hand-${side}`, rest = s.joints[name];
                if (rest)
                    this.#limbs[name] = titanAnchor(this.#position, this.#yaw, { ...rest.position, z: rest.position.z + (side === 'left' ? swing : -swing) });
            }
        }
        this.#authoredAnimation=this.#env.articulate?.(this.#limbs,this.#feet,{...this.#position,y:this.#position.y-this.#crouch()},this.#yaw,this.#volumeAxes,{time:this.#time,health:this.#health,gait:this.#gait,velocity:this.#velocity,yawVelocity:this.#yawVelocity,airborne:this.#airborne,ability:a&&timeline?{id:a.definition.id,stage:timeline.stage,progress:timeline.progress,elapsed:this.#time-a.start,active:a.definition.active,warning:a.definition.warning,windup:a.definition.windup,recovery:a.definition.recovery}:null})??undefined;
        this.#updatingPose=false;
        if (dt > 0)
            for (const [name, p] of Object.entries(this.#limbs)) {
                const before = this.#previousPose[name];
                this.#limbVelocities[name] = before ? { x: (p.x - before.x) / dt, y: (p.y - before.y) / dt, z: (p.z - before.z) / dt } : { x: 0, y: 0, z: 0 };
            }
    }
    #hit(a: Active, t: Target, position: Vec) {
        if (a.hit.has(t.id))
            return;
        a.hit.add(t.id);
        this.#emit('damage', a.definition.mechanism, position, { ability: a.definition.id, targetId: t.id, amount: a.definition.damage });
    }
    #shotVelocity(t: Target): Vec {
        const recent = this.#memory.slice(-5), q = difficulties[this.species.level].prediction;
        if (!recent.length)
            return { ...t.velocity };
        const average = recent.reduce((v, s) => ({ x: v.x + s.velocity.x / recent.length, y: v.y + s.velocity.y / recent.length, z: v.z + s.velocity.z / recent.length }), { x: 0, y: 0, z: 0 });
        return { x: t.velocity.x * q + average.x * (1 - q), y: t.velocity.y * q + average.y * (1 - q), z: t.velocity.z * q + average.z * (1 - q) };
    }
    #combat(dt: number, targets: readonly Target[], visible: Target | undefined) {
        const a = this.#active;
        if (!a)
            return;
        const def = a.definition, elapsed = this.#time - a.start, t = titanTimeline(def, elapsed);
        if (t.stage !== a.lastStage) {
            a.lastStage = t.stage;
            if (def.mechanism === 'beam' && t.stage === 'WINDUP')
                a.direction = { x: Math.sin(this.#yaw + this.#headYaw) * Math.cos(this.#headPitch), y: Math.sin(this.#headPitch), z: Math.cos(this.#yaw + this.#headYaw) * Math.cos(this.#headPitch) };
            this.#emit('animation', def.event, this.#position, { ability: def.id, stage: t.stage, progress: t.progress });
        }
        if (t.stage === 'COOLDOWN' || t.stage === 'DONE') {
            this.#comboDepth = a.combo;
            this.#comboUntil = this.#time + .8;
            this.#misses = a.hit.size ? 0 : Math.min(8, this.#misses + 1);
            this.#active = null;
            return;
        }
        if (t.stage === 'WINDUP' && def.mechanism === 'beam') {
            this.#headYaw = clamp(wrap(Math.atan2(a.direction.x, a.direction.z) - this.#yaw), -.8, .8);
            this.#headPitch = clamp(Math.atan2(a.direction.y, Math.hypot(a.direction.x, a.direction.z)), -.6, .6);
            this.#updatePose(0);
        }
        if (t.stage !== 'ACTIVE')
            return;
        let origin = this.#anchor(def.requires[0]);
        if (def.mechanism === 'beam' && !a.released) {
            a.released = 1;
        }
        if (visible?.id === a.targetId && def.mechanism === 'beam' && this.#withinCone(origin, visible.position, def.cone)) {
            const desired = unit(origin, visible.position), rate = (def.tracking ?? 0) * dt;
            // Direction constrained by real angular speed, not component-wise snapping.
            const dot = clamp(a.direction.x * desired.x + a.direction.y * desired.y + a.direction.z * desired.z, -1, 1), angle = Math.acos(dot), blend = angle > 1e-8 ? Math.min(1, rate / angle) : 1;
            a.direction = unit({ x: 0, y: 0, z: 0 }, { x: a.direction.x + (desired.x - a.direction.x) * blend, y: a.direction.y + (desired.y - a.direction.y) * blend, z: a.direction.z + (desired.z - a.direction.z) * blend });
        }
        if (def.mechanism === 'beam') {
            this.#headYaw = clamp(wrap(Math.atan2(a.direction.x, a.direction.z) - this.#yaw), -.8, .8);
            this.#headPitch = clamp(Math.atan2(a.direction.y, Math.hypot(a.direction.x, a.direction.z)), -.6, .6);
            a.direction = { x: Math.sin(this.#yaw + this.#headYaw) * Math.cos(this.#headPitch), y: Math.sin(this.#headPitch), z: Math.cos(this.#yaw + this.#headYaw) * Math.cos(this.#headPitch) };
            this.#updatePose(0);
            origin = this.#anchor(def.requires[0]);
        }
        const validTargets = targets.slice(0, 16).filter(v => v.authorized && v.alive && v.encounterId === this.id);
        if (def.mechanism === 'projectile') {
            const count = def.count ?? 1, due = Math.min(count, 1 + Math.floor(t.progress * count));
            while (a.released < due) {
                const index = a.released++, debris = a.debris;
                if (def.debris && !debris)
                    continue;
                const from = origin, speed = def.projectileSpeed!, point = visible?.id === a.targetId ? intercept(from, visible.position, this.#shotVelocity(visible), speed, def.maxRange / speed) : a.aim;
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
            // Windup deceleration may have moved the body. Validate the actual
            // launch pose again instead of jumping along a stale safe corridor.
            const landing = this.#leapDestination(a.aim, def);
            if (!landing) {
                this.#active = null;
                return;
            }
            a.aim = landing;
            a.released++;
            this.#vertical = this.species.movement.jumpSpeed;
            const flight = (this.#vertical + Math.sqrt(this.#vertical ** 2 - 2 * this.species.movement.gravity * (this.#env.ground(a.aim.x,a.aim.z) - this.#position.y))) / this.species.movement.gravity, travel = Math.min(def.maxRange, Math.hypot(a.aim.x - this.#position.x, a.aim.z - this.#position.z), this.species.movement.run * flight), dir = unit(this.#position, { ...a.aim, y: this.#position.y });
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
                const end=def.impactJoint?this.#limbs[def.impactJoint]:{...this.#position,y:this.#position.y+this.species.height*.35};
                const start={x:end.x-this.#velocity.x*dt,y:end.y,z:end.z-this.#velocity.z*dt};
                if (projectileImpactFraction(start, end, target.position, target.velocity, dt, def.radius + target.radius) !== null && this.#env.lineOfSight(end, target.position))
                    this.#hit(a, target, end);
            }
            else if (def.mechanism === 'area' || def.mechanism === 'leap' && a.landed) {
                const impact = def.impactJoint ? this.#limbs[def.impactJoint] : this.#position;
                const from = def.directional ? origin : { ...impact, y: this.#env.ground(impact.x, impact.z) }, alt = target.position.y - this.#env.ground(target.position.x, target.position.z), angle = Math.abs(wrap(Math.atan2(target.position.x - from.x, target.position.z - from.z) - this.#yaw));
                if (alt <= def.maxAltitude && (!def.directional || this.#withinCone(from, target.position, def.cone)) && projectileImpactFraction(from, from, target.position, target.velocity, dt, def.radius + target.radius) !== null && this.#env.lineOfSight(from, target.position))
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
            const step = Math.min(dt, p.life);
            const end = { x: p.position.x + p.velocity.x * step, y: p.position.y + p.velocity.y * step, z: p.position.z + p.velocity.z * step };
            let first = this.#env.obstruction(p.position, end, p.radius) ?? Infinity, target: Target | undefined;
            for (const t of targets.slice(0, 16)) {
                if (!t.authorized || !t.alive || t.encounterId !== this.id)
                    continue;
                const hit = projectileImpactFraction(p.position, end, { x: t.position.x - t.velocity.x * (dt - step), y: t.position.y - t.velocity.y * (dt - step), z: t.position.z - t.velocity.z * (dt - step) }, t.velocity, step, p.radius + t.radius);
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
                    this.#emit('damage', 'projectile', { x: p.position.x + (end.x - p.position.x) * first, y: p.position.y + (end.y - p.position.y) * first, z: p.position.z + (end.z - p.position.z) * first }, { ability: p.ability, attackId: `${this.id}:attack:${p.attack}`, targetId: target.id, amount: p.damage });
                }
                else
                    this.#emit('environment', 'projectile-impact', end, { ability: p.ability });
            }
            p.position = end;
            p.life -= step;
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
        // Continuous projectile/body sweeps need no redundant skeletal integrations.
        // Refine only curved limbs or beams when their angular travel exceeds the hit-volume tolerance.
        const ability = this.#active?.definition;
        const sweepSteps = ability?.mechanism === 'sweep' ? Math.ceil(Math.abs((ability.arcEnd ?? .8) - (ability.arcStart ?? -.8)) * dt / ability.active / Math.max(.005, Math.sqrt(.8 * ability.radius / Math.max(1, ability.reach ?? 1)))) : 1;
        const beamSteps = ability?.mechanism === 'beam' ? Math.ceil(((ability.tracking ?? 0) + this.species.movement.turnRate) * dt * ability.maxRange / Math.max(1, 2 * ability.radius)) : 1;
        const count = Math.min(12, Math.max(1, Math.ceil(dt / .05), sweepSteps, beamSteps)), delta = dt / count;
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
        for (const id of this.#lastContacts.keys())
            if (!targets.some(t => t.id === id && t.authorized && t.encounterId === this.id))
                this.#lastContacts.delete(id);
        if (this.species.contactDamage)
            for (const target of targets) {
                if (!target.authorized || !target.alive || target.encounterId !== this.id || this.#time - (this.#lastContacts.get(target.id) ?? -Infinity) < 1)
                    continue;
                const from = { x: target.position.x - target.velocity.x * dt, y: target.position.y - target.velocity.y * dt, z: target.position.z - target.velocity.z * dt };
                if (this.species.regions.some(r => !r.weakDuring && this.#regionFraction(r, from, target.position, target.radius, dt) !== null)) {
                    this.#lastContacts.set(target.id, this.#time);
                    this.#emit('damage', 'contact', target.position, { targetId: target.id, amount: this.species.contactDamage });
                }
            }
        this.#time = end;
        this.#stepping = false;
        return this.snapshot();
    }
    #regionFraction(r: Species['regions'][number], from: Vec, to: Vec, radius: number, delta: number): number | null {
        const anchor = this.#limbs[r.joint] ?? this.#anchor(r.joint), velocity = this.#limbVelocities[r.joint] ?? this.#velocity;
        if (!r.radii)
            return projectileImpactFraction(from, to, anchor, velocity, delta, r.radius + radius);
        const bone = this.species.joints[r.joint].bone, weight = bone === 'Neck' ? (this.species.joints.neck?.aimWeight ?? 0) : ['Head', 'Jaw'].includes(bone) ? 1 : 0;
        const axes = this.#volumeAxes[r.joint], angle = this.#yaw + this.#headYaw * weight, c = Math.cos(angle), sn = Math.sin(angle), pitch = this.#headPitch * weight;
        const local = (p: Vec) => {
            const d = { x: p.x - anchor.x, y: p.y - anchor.y, z: p.z - anchor.z };
            let x: number, y: number, z: number;
            if (axes) {
                const dot = (v: Vec) => d.x * v.x + d.y * v.y + d.z * v.z;
                x = dot(axes.x);
                y = dot(axes.y);
                z = dot(axes.z);
            }
            else {
                x = c * d.x - sn * d.z;
                const depth = sn * d.x + c * d.z;
                y = Math.cos(pitch) * d.y - Math.sin(pitch) * depth;
                z = Math.sin(pitch) * d.y + Math.cos(pitch) * depth;
            }
            return { x: x / (r.radii!.x + radius), y: y / (r.radii!.y + radius), z: z / (r.radii!.z + radius) };
        };
        return projectileImpactFraction(local(from), local(to), { x: 0, y: 0, z: 0 }, local({ x: anchor.x + velocity.x, y: anchor.y + velocity.y, z: anchor.z + velocity.z }), delta, 1);
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
            if (r.weakDuring && !(this.#active?.definition.id === r.weakDuring && ['WARNING', 'WINDUP'].includes(titanTimeline(this.#active.definition, this.#time - this.#active.start).stage)))
                continue;
            const f = this.#regionFraction(r, input.from, input.to, input.radius, input.delta);
            if (f !== null && f < first) {
                first = f;
                selected = r;
            }
        }
        const block = this.#env.obstruction(input.from, input.to, input.radius);
        if (!selected || block !== null && block < first)
            return 0;
        const exposed = !selected.weakDuring || this.#active?.definition.id === selected.weakDuring && ['WARNING', 'WINDUP'].includes(titanTimeline(this.#active.definition, this.#time - this.#active.start).stage);
        const amount = Math.min(this.#health, input.amount * (exposed ? selected.multiplier : 1));
        this.#health -= amount;
        this.#stagger += amount;
        this.#emit('animation', this.#health <= 0 ? 'defeat' : 'hit', this.#position, { amount });
        if (this.#stagger >= selected.stagger && this.#active?.definition.interruptible) {
            this.#cooldowns.set(this.#active.definition.id, this.#time + this.#active.definition.recovery + this.#active.definition.cooldown);
            this.#active = null;
            this.#tactic = 'recover';
            this.#recoverUntil = this.#time + .65;
            this.#stagger = 0;
            this.#commitUntil = this.#time + .65;
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
        return { animation:this.#authoredAnimation, encounterId: this.id, time: this.#time, health: this.#health, poseOffsetY: -this.#crouch(), position: { ...this.#position }, velocity: { ...this.#velocity }, yaw: this.#yaw, yawVelocity: this.#yawVelocity, headYaw: this.#headYaw, headPitch: this.#headPitch, gait: this.#gait, gaitRate: this.#gaitRate, feet: structuredClone(this.#feet), limbs: structuredClone(this.#limbs), tactic: this.#tactic, locomotion: this.#health <= 0 ? 'defeat' : this.#airborne ? 'jump' : a?.definition.mechanism === 'charge' && t?.stage === 'ACTIVE' ? 'charge' : this.#tactic === 'recover' ? 'recover' : Math.abs(this.#lateralSpeed) > 1 ? 'sidestep' : Math.abs(this.#speed) > this.species.movement.walk ? 'run' : Math.abs(this.#speed) > .1 ? 'walk' : 'idle', ability: a && t ? { id: a.definition.id, landing:a.definition.mechanism==='leap'?{...a.aim}:undefined,landed:a.landed,radius:a.definition.radius, eventId: `${this.id}:attack:${a.serial}`, stage: t.stage, progress: t.progress, animation: a.definition.animation, heldObject: a.debris && t && ['WARNING', 'WINDUP'].includes(t.stage) ? { id: a.debris.id, radius: a.debris.radius, position: { x: a.debris.position.x + (this.#anchor(a.definition.requires[0]).x - a.debris.position.x) * Math.min(1, (this.#time - a.start) / a.definition.warning), y: a.debris.position.y + (this.#anchor(a.definition.requires[0]).y - a.debris.position.y) * Math.min(1, (this.#time - a.start) / a.definition.warning), z: a.debris.position.z + (this.#anchor(a.definition.requires[0]).z - a.debris.position.z) * Math.min(1, (this.#time - a.start) / a.definition.warning) } } : undefined, comboDepth: a.combo, origin: this.#anchor(a.definition.requires[0]), direction: { ...a.direction }, beamLength: a.definition.mechanism === 'beam' ? a.definition.maxRange * (this.#env.obstruction(this.#anchor(a.definition.requires[0]), { x: this.#anchor(a.definition.requires[0]).x + a.direction.x * a.definition.maxRange, y: this.#anchor(a.definition.requires[0]).y + a.direction.y * a.definition.maxRange, z: this.#anchor(a.definition.requires[0]).z + a.direction.z * a.definition.maxRange }, a.definition.radius) ?? 1) : undefined } : null, projectiles: this.#shots.filter(v => v.live).map(v => ({ id: v.id, position: { ...v.position }, radius: v.radius, velocity: { ...v.velocity }, ability: v.ability })), events: [...this.#events, ...this.#pendingEvents].map(e => ({ ...e, position: { ...e.position } })) };
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
        this.#previousPose = {};
        this.#volumeAxes = {};
        this.#lastContacts.clear();
        this.#blocked = 0;
        this.#stalled = 0;
        this.#escapeUntil = 0;
        this.#escapeDirection = { x: 0, y: 0, z: 0 };
        this.#avoidSign = 1;
        this.#vertical = 0;
        this.#airborne = false;
        this.#stagger = 0;
        this.#recoverUntil = 0;
        this.#misses = 0;
        this.#lastAbility = '';
        this.#nextTraversal = 0;
        this.#leapGoal = null;
        this.#leapPrepareUntil = 0;
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
