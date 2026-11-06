import type { TitanVector as Vec, TitanTiming } from '../../../shared/titan-pose.mjs';
export type { Vec };
export type Level = 'EASY' | 'MEDIUM' | 'HARD' | 'VERY HARD' | 'LEGENDARY';
export const difficulties = Object.freeze({
    EASY: Object.freeze({ reaction: .9, memory: 3, combo: 1, prediction: .25, awareness: .4 }),
    MEDIUM: Object.freeze({ reaction: .6, memory: 6, combo: 2, prediction: .5, awareness: .55 }),
    HARD: Object.freeze({ reaction: .35, memory: 10, combo: 3, prediction: .7, awareness: .7 }),
    'VERY HARD': Object.freeze({ reaction: .2, memory: 14, combo: 3, prediction: .85, awareness: .85 }),
    LEGENDARY: Object.freeze({ reaction: .12, memory: 18, combo: 4, prediction: 1, awareness: 1 }),
});
export type Mechanism = 'projectile' | 'beam' | 'sweep' | 'area' | 'leap' | 'charge';
export type Ability = TitanTiming & {
    id: string;
    mechanism: Mechanism;
    requires: readonly string[];
    animation: string;
    minRange: number;
    maxRange: number;
    maxAltitude: number;
    cone: number;
    damage: number;
    radius: number;
    moving: boolean;
    interruptible: boolean;
    event: string;
    contactBounds?:{min:Vec;max:Vec};
    reach?: number;
    arcStart?: number;
    arcEnd?: number;
    projectileSpeed?: number;
    count?: number;
    spread?: number;
    tracking?: number;
    directional?: boolean;
    horizontalCone?: boolean;
    debris?: boolean;
    unlockBelow?: number;
    pivot?: Vec;
    lift?: number;
    crouch?: number;
    impactJoint?: string;
    limbTargets?: Readonly<Record<string, {
        warning: Vec;
        windup: Vec;
        active: Vec;
    }>>;
};
export type Species = {
    id: string;
    model: string;
    lods: readonly string[];
    scale: number;
    height: number;
    radius: number;
    health: number;
    contactDamage?: number;
    joints: Readonly<Record<string, {
        bone: string;
        position: Vec;
        reach?: number;
        angularSpeed?: number;
        aimWeight?: number;
        gaitPhase?: number;
        foot?: boolean;
        mirror?: boolean;
    }>>;
    stationary?: {roarDuration:number;roarInterval:number};
    director?: { combatDistance?: number; commitment: number; retreatMin: number; retreatMax: number; retreatDuration: number; reengageDuration: number; attackSpacing: number; pressureThreshold: number; facing: number };
    animations: readonly string[];
    movement: {
        walk: number;
        run: number;
        acceleration: number;
        deceleration: number;
        turnRate: number;
        turnAcceleration: number;
        stepHeight: number;
        stride: number;
        runStride?:number;
        runOnly?:boolean;
        reverseStride?: number;
        lateralStride?: number;
        turnStrideRadius?: number;
        jumpSpeed: number;
        gravity: number;
        chargeSpeed: number;
        sidestep: boolean;
        independentAim: boolean;
        traversalLeap?: boolean;
        /** Species-scaled travel intentions; omitted profiles retain existing behavior. */
        repositionDistance?: number;
        intentDuration?: number;
        idleBetweenActions?: number;
        traversalOnlyWhenBlocked?: boolean;
    };
    senses: {
        range: number;
        fov: number;
        /** Server-authorized encounter opponent remains pursued behind scenery. Shots still require line of sight. */
        pursueOccluded?: boolean;
    };
    personality: 'aggressive' | 'defensive' | 'balanced';
    level: Level;
    abilities: readonly Ability[];
    regions: readonly {
        id: string;
        joint: string;
        radius: number;
        radii?: Vec;
        weakDuring?: string;
        multiplier: number;
        stagger: number;
    }[];
    arena: {
        minWidth: number;
        maxSlope: number;
    };
};
function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const v of Object.values(value))
            freeze(v);
    }
    return value;
}
const finite = (n: number) => Number.isFinite(n);
export class SpeciesRegistry {
    #entries = new Map<string, Readonly<Species>>();
    register(input: Species): Readonly<Species> {
        const s = structuredClone(input), positive = [s.scale, s.height, s.radius, s.health, ...(s.stationary?[]:[s.movement.walk,s.movement.run,s.movement.turnRate,s.movement.turnAcceleration]), s.movement.acceleration, s.movement.deceleration, s.movement.stride, s.movement.gravity, s.senses.range, s.arena.minWidth];
        if (s.lods.some(l => !l) || !s.animations.every(a => typeof a === 'string' && a.length > 0))
            throw Error('Invalid presentation references');
        if (!s.id || this.#entries.has(s.id) || !s.model || !difficulties[s.level] || positive.some(n => !finite(n) || n <= 0) || s.movement.run < s.movement.walk || !finite(s.senses.fov) || s.senses.fov <= 0 || s.senses.fov > Math.PI * 2 || s.regions.length === 0 || s.abilities.length > 32)
            throw Error('Invalid species');
        if(s.stationary&&(!Number.isFinite(s.stationary.roarDuration)||s.stationary.roarDuration<=0||!Number.isFinite(s.stationary.roarInterval)||s.stationary.roarInterval<s.stationary.roarDuration||[s.movement.walk,s.movement.run,s.movement.turnRate,s.movement.turnAcceleration].some(n=>n!==0)))throw Error('Invalid stationary profile');
        if(s.movement.runOnly!==undefined&&typeof s.movement.runOnly!=='boolean')throw Error('Invalid run-only locomotion');
        if ([s.movement.runStride, s.movement.reverseStride, s.movement.lateralStride, s.movement.turnStrideRadius, s.movement.repositionDistance, s.movement.intentDuration, s.movement.idleBetweenActions].some(n => n !== undefined && (!finite(n) || n <= 0)))
            throw Error('Invalid gait limits');
        if(s.director&&(!Object.values(s.director).every(n=>finite(n)&&n>0)||s.director.retreatMax<s.director.retreatMin||s.director.facing>Math.PI))throw Error('Invalid combat director');
        if (!s.joints.body)
            throw Error('Missing root body joint');
        if (!['aggressive', 'defensive', 'balanced'].includes(s.personality) || [s.movement.jumpSpeed, s.movement.chargeSpeed, s.movement.stepHeight, s.arena.maxSlope].some(n => !finite(n) || n < 0))
            throw Error('Invalid capability');
        for (const j of Object.values(s.joints))
            if (!j.bone || Object.values(j.position).some(n => !finite(n)) || (j.gaitPhase !== undefined && (!finite(j.gaitPhase) || j.gaitPhase < 0 || j.gaitPhase >= 1)))
                throw Error('Invalid joint');
        if (s.contactDamage !== undefined && (!finite(s.contactDamage) || s.contactDamage <= 0))
            throw Error('Invalid contact damage');
        for (const joint of Object.values(s.joints))
            if (joint.aimWeight !== undefined && (!finite(joint.aimWeight) || joint.aimWeight < 0 || joint.aimWeight > 1))
                throw Error('Invalid aiming articulation');
        const ids = new Set<string>();
        for (const a of s.abilities) {
            if (!a.id || ids.has(a.id) || !['projectile', 'beam', 'sweep', 'area', 'leap', 'charge'].includes(a.mechanism) || a.requires.length === 0 || a.requires.some(j => !s.joints[j]) || !s.animations.includes(a.animation) || !a.event)
                throw Error('Unsupported ability anatomy/animation');
            ids.add(a.id);
            if (a.unlockBelow !== undefined && (!finite(a.unlockBelow) || a.unlockBelow <= 0 || a.unlockBelow > 1))
                throw Error('Invalid health gate');
            if ([a.warning, a.windup, a.recovery, a.cooldown, a.minRange, a.damage, a.radius].some(n => !finite(n) || n < 0) || !finite(a.active) || a.active <= 0 || a.warning <= 0 || !finite(a.maxRange) || a.maxRange < a.minRange || !finite(a.maxAltitude) || a.maxAltitude < 0 || !finite(a.cone) || a.cone <= 0 || a.cone > Math.PI || a.radius <= 0)
                throw Error('Invalid ability geometry/timing');
            if (['projectile'].includes(a.mechanism) && (!a.projectileSpeed || a.projectileSpeed <= 0 || !finite(a.projectileSpeed) || (a.count ?? 1) > 8 || (a.count ?? 1) < 1 || !Number.isInteger(a.count ?? 1)))
                throw Error('Invalid projectile');
            if(a.contactBounds&&(['x','y','z']as const).some(k=>!finite(a.contactBounds!.min[k])||!finite(a.contactBounds!.max[k])||a.contactBounds!.min[k]>a.contactBounds!.max[k]))throw Error('Invalid authored contact bounds');
            if (a.mechanism === 'sweep' && (!(a.reach! > 0) || !finite(a.reach!) || !finite(a.arcStart ?? 0) || !finite(a.arcEnd ?? 0) || Math.abs((a.arcEnd ?? 0) - (a.arcStart ?? 0)) > Math.PI * 2))
                throw Error('Invalid sweep');
            if (a.mechanism === 'sweep' && a.requires.some(name => {
                const joint = s.joints[name];
                return !joint.reach || !joint.angularSpeed || !finite(joint.reach) || !finite(joint.angularSpeed) || joint.angularSpeed <= 0 || a.reach! > joint.reach || (!a.contactBounds && Math.abs((a.arcEnd ?? 0) - (a.arcStart ?? 0)) / a.active > joint.angularSpeed);
            }))
                throw Error('Sweep exceeds registered limb capabilities');
            if (a.mechanism === 'leap' && s.movement.jumpSpeed <= 0 || a.mechanism === 'charge' && s.movement.chargeSpeed <= 0)
                throw Error('Unsupported locomotion');
            if ([a.spread ?? 0, a.tracking ?? 0].some(n => !finite(n) || n < 0))
                throw Error('Invalid optional ability value');
            if (a.mechanism === 'beam' && (!finite(a.tracking ?? 0) || (a.tracking ?? 0) < 0))
                throw Error('Invalid tracking');
        }
        const regions = new Set<string>();
        for (const r of s.regions) {
            if (regions.has(r.id) || !s.joints[r.joint] || ![r.radius, r.multiplier, r.stagger].every(n => finite(n) && n > 0))
                throw Error('Invalid damage region');
            if (r.radii && Object.values(r.radii).some(n => !finite(n) || n <= 0))
                throw Error('Invalid region radii');
            regions.add(r.id);
        }
        const result = freeze(s);
        this.#entries.set(s.id, result);
        return result;
    }
    get(id: string): Readonly<Species> {
        const s = this.#entries.get(id);
        if (!s)
            throw Error('Unknown species');
        return s;
    }
}
// Trusted templates; anatomy names are semantic keys mapped by each species.
const base = { warning: .7, windup: .4, active: .5, recovery: .8, cooldown: 3, minRange: 0, maxRange: 1500, maxAltitude: 1500, cone: Math.PI / 3, damage: 25, radius: 35, moving: true, interruptible: true, event: 'titan.attack' };
export const standardAbilities: readonly Ability[] = freeze([
    { ...base, id: 'energy-beam', mechanism: 'beam', requires: ['mouth'], animation: 'beam', active: 1.2, tracking: .35 },
    { ...base, id: 'fireball-barrage', mechanism: 'projectile', requires: ['mouth'], animation: 'ranged', projectileSpeed: 900, count: 3, spread: .03 },
    { ...base, id: 'hand-strike', mechanism: 'sweep', requires: ['hand-left'], animation: 'strike', maxRange: 500, reach: 350, arcStart: -1, arcEnd: 1 },
    { ...base, id: 'tail-whip', mechanism: 'sweep', requires: ['tail'], animation: 'tail', maxRange: 650, cone: Math.PI, reach: 500, arcStart: 1, arcEnd: 4 },
    { ...base, id: 'ground-smash', mechanism: 'area', requires: ['hand-left'], animation: 'smash', maxRange: 500, maxAltitude: 100, radius: 450, moving: false },
    { ...base, id: 'giant-leap', mechanism: 'leap', requires: ['foot-left', 'foot-right'], animation: 'jump', active: 3, maxRange: 650, maxAltitude: 100, radius: 350, moving: false },
    { ...base, id: 'charging-rampage', mechanism: 'charge', requires: ['body'], animation: 'charge', active: 2, maxRange: 900, maxAltitude: 400, radius: 200 },
    { ...base, id: 'debris-throw', mechanism: 'projectile', requires: ['hand-left'], animation: 'throw', projectileSpeed: 600, debris: true },
    { ...base, id: 'two-hand-clap', mechanism: 'sweep', requires: ['hand-left', 'hand-right'], animation: 'clap', maxRange: 500, reach: 350, arcStart: -1, arcEnd: 0, moving: false },
    { ...base, id: 'roaring-shockwave', mechanism: 'area', requires: ['mouth'], animation: 'roar', radius: 850, maxRange: 850, directional: true },
]);
