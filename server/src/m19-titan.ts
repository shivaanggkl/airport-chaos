import { monsterDamageSites, monsterDebrisOffsets, monsterArena } from '../../shared/m19-environment.mjs';
import { titanAnchor, titanChain, titanRotateOffset } from '../../shared/titan-pose.mjs';
import { SpeciesRegistry, standardAbilities, type Species, type Vec } from './titan/definitions.js';
import { TitanEncounter, type Snapshot, type Environment, type Threat } from './titan/engine.js';
import { m19Model, m19ModelPoint, m19LegacyYaw } from '../../shared/m19-titan-model.mjs';
import { monsterGeometry } from '../../shared/monster-arrival-geometry.mjs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { nearbyMotionBuildings, monsterMotionClear, segmentBlockedByBuildings, type MonsterEncounter as Legacy } from './monster-arrival.js';
const h = journeyDallas19.monster.height;
const joints: Species['joints'] = Object.fromEntries(Object.entries(m19Model.anchors).map(([key, p]) => [key, { bone: m19Model.bones[key], aimWeight: key === 'neck' ? m19Model.neckAimWeight : undefined, position: { x: p[0] * h, y: p[1] * h, z: p[2] * h }, reach: 440, angularSpeed: 5, foot: key.startsWith('foot'), gaitPhase: key.endsWith('right') ? .5 : 0 }]));
const volumes = monsterGeometry.spheres.map((v, i) => { const key = `volume-${i}`; (joints as Record<string, Species['joints'][string]>)[key] = { bone: v.part.replace(/[0-9]+$/, ''), position: m19ModelPoint(v, h) }; return { id: key, joint: key, radius: v.radius * h, radii: { x: v.radii.x * h, y: v.radii.y * h, z: v.radii.z * h }, multiplier: v.part.startsWith('Head') || v.part.startsWith('Jaw') ? 1.5 : 1, stagger: 75 }; });
const balance: Record<string, [
    number,
    number,
    number
]> = { 'fireball-barrage': [20, .9, 4.5], 'energy-beam': [30, 1.5, 15], 'hand-strike': [25, .65, 3.5], 'tail-whip': [25, .85, 5], 'ground-smash': [20, 1.1, 9], 'giant-leap': [25, 1.1, 15], 'charging-rampage': [20, .9, 10], 'debris-throw': [20, 1, 7], 'two-hand-clap': [30, .9, 7], 'roaring-shockwave': [15, 1.2, 11] };
const phase2 = new Set(['energy-beam', 'ground-smash', 'giant-leap', 'two-hand-clap', 'roaring-shockwave']);
export const m19Species = new SpeciesRegistry().register({ id: 'dallas-original-titan', model: m19Model.url, lods: m19Model.lods, scale: h, height: h, radius: 330, health: 2500, contactDamage: 25, joints,
    animations: standardAbilities.map(a => a.animation), movement: { walk: 65, run: 110, chargeSpeed: 140, acceleration: 22, deceleration: 32, turnRate: 25 * Math.PI / 180, turnAcceleration: .32, stepHeight: 24, stride: 260, reverseStride: 45, lateralStride: 50, turnStrideRadius: 900, jumpSpeed: 120, gravity: 40, sidestep: true, independentAim: true, traversalLeap: true },
    senses: { range: 9000, fov: Math.PI * 2 }, personality: 'aggressive', level: 'HARD', arena: { minWidth: 2500, maxSlope: .15 },
    regions: [...volumes, { id: 'mouth', joint: 'mouth', radius: 45, radii: { x: 45, y: 24, z: 48 }, multiplier: 2, stagger: 60, weakDuring: 'energy-beam' }],
    abilities: standardAbilities.map(a => {
        const [damage, warning, cooldown] = balance[a.id];
        const b = { ...a, damage, warning, cooldown, interruptible: a.id === 'energy-beam', maxRange: 6000, maxAltitude: 5000, unlockBelow: phase2.has(a.id) ? .65 : 1 };
        if (['sweep', 'area', 'leap'].includes(a.mechanism) && !a.directional)
            b.cone = Math.PI;
        if (a.id === 'two-hand-clap') {
            b.arcStart = -.2;
            b.arcEnd = 1.05;
        }
        if (a.mechanism === 'sweep') {
            b.maxRange = 850;
            b.radius = 65;
            b.reach = a.id === 'tail-whip' ? 280 : 340;
            b.active = a.id === 'tail-whip' ? 1.5 : 1;
            b.pivot = joints[a.id === 'tail-whip' ? 'tail-base' : 'shoulder-left'].position;
            b.lift = a.id === 'tail-whip' ? 0 : 120;
        }
        if (a.id === 'giant-leap') {
            b.active = 6.2;
            b.maxRange = 400;
            b.radius = 300;
            b.maxAltitude = 180;
        }
        if (a.id === 'ground-smash') {
            b.requires = ['foot-left'];
            b.impactJoint = 'foot-left';
            b.crouch = 30;
            const foot = joints['foot-left'].position;
            b.limbTargets = { 'foot-left': { warning: { ...foot, y: foot.y + 150 }, windup: { ...foot, y: foot.y + 30 }, active: { ...foot, y: foot.y + 30 } }, 'hand-left': { warning: { x: -330, y: 480, z: 160 }, windup: joints['hand-left'].position, active: joints['hand-left'].position }, 'hand-right': { warning: { x: 330, y: 480, z: 160 }, windup: joints['hand-right'].position, active: joints['hand-right'].position } };
            b.radius = 450;
            b.maxRange = 700;
            b.maxAltitude = 180;
        }
        if (a.id === 'charging-rampage') {
            b.radius = 200;
            b.maxRange = 1200;
            b.maxAltitude = 450;
            b.active = 2.5;
        }
        if (a.id === 'roaring-shockwave') {
            b.radius = 1000;
            b.maxRange = 1000;
            b.cone = .9;
        }
        if (a.id === 'energy-beam') {
            b.radius = 24;
            b.tracking = .22;
            b.active = 1.5;
        }
        if (a.id === 'debris-throw') {
            b.limbTargets = { 'hand-left': { warning: { x: -320, y: 500, z: 110 }, windup: { x: -220, y: 650, z: 200 }, active: { x: -100, y: 600, z: 350 } } };
        }
        if (a.mechanism === 'projectile') {
            b.radius = 22;
            b.projectileSpeed = a.debris ? 1100 : 1600;
        }
        return b;
    }) });
export type DistrictBuilding = {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
};
export type M19Encounter = {
    attemptId: string;
    playerId: string;
    pilotId: string;
    startedAt: number;
    lastTickAt: number;
    lastBroadcastAt: number;
    contactAt: number;
    lastDamageAt: number;
    hitSequence: number;
    hitPosition?: Vec;
    engine: TitanEncounter;
    frame: Snapshot;
    x: number;
    z: number;
    damageSequence: number;
    damageEventSequence: number;
    events: Snapshot['events'];
    disposed: boolean;
    environmentDamage:boolean;
    debris: Set<string>;
    projectileIds: Set<string>;
    destroyedSites: Set<number>;
};
export function createM19Encounter(attemptId: string, playerId: string, startedAt: number, ground: (x: number, z: number) => number, buildings: readonly DistrictBuilding[], health = 2500, species = m19Species,binding?:{geometry:Pick<typeof monsterGeometry,'footX'|'footZ'|'spheres'>;spawn:{x:number;z:number};environmentDamage:boolean;articulate?:Environment['articulate'];bounds?:Environment['bounds'];navigation?:Environment['navigation']}): M19Encounter {
    const geometry=binding?.geometry??monsterGeometry,joints=species.joints,spawn=binding?.spawn??journeyDallas19.monster;
    const probe: Pick<Legacy, 'x' | 'z' | 'motionCell' | 'motionSource' | 'motionBuildings'> = { x: spawn.x, z: spawn.z }, debris = new Set<string>(), poseCache = new Map<string, boolean>();
    const env: Environment = { authoredPose:!!binding?.articulate,navigation:binding?.navigation,navigationProbe: 80, bounds: binding?.bounds??monsterArena, ground,
        traversable: () => true,
        articulate: (limbs, feet, root, yaw, axes,context) => {
            if(binding?.articulate)return binding.articulate(limbs,feet,root,yaw,axes,context);
            const subtract = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), zero = { x: 0, y: 0, z: 0 };
            const basis = { x: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }, y: { x: 0, y: 1, z: 0 }, z: { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) } };
            const solve = (startName: string, midName: string, endName: string, pole: Vec, prefix: string, upperPart: string, lowerParts: string[]) => {
                const start = titanAnchor(root, yaw, joints[startName].position), mid = titanAnchor(root, yaw, joints[midName].position), end = titanAnchor(root, yaw, joints[endName].position), target = feet[endName] ?? limbs[endName], pose = titanChain(start, mid, end, target, pole);
                limbs[startName] = start;
                limbs[midName] = pose.joint;
                limbs[endName] = pose.end;
                if (feet[endName])
                    feet[endName] = pose.end;
                const upperFrom = subtract(mid, start), upperTo = subtract(pose.joint, start), lowerFrom = subtract(end, mid), lowerIntermediate = titanRotateOffset(lowerFrom, zero, upperFrom, upperTo), lowerTo = subtract(pose.end, pose.joint);
                const upperRotate = (p: Vec) => titanRotateOffset(p, zero, upperFrom, upperTo), lowerRotate = (p: Vec) => titanRotateOffset(upperRotate(p), zero, lowerIntermediate, lowerTo);
                for (let i = 0; i < geometry.spheres.length; i++) {
                    const v = geometry.spheres[i];
                    if (!v.part.startsWith(prefix))
                        continue;
                    const key = `volume-${i}`, point = titanAnchor(root, yaw, joints[key].position), upper = v.part.includes(upperPart), lower = lowerParts.some(p => v.part.includes(p));
                    if (upper) {
                        const offset = upperRotate(subtract(point, start));
                        limbs[key] = { x: start.x + offset.x, y: start.y + offset.y, z: start.z + offset.z };
                        axes[key] = { x: upperRotate(basis.x), y: upperRotate(basis.y), z: upperRotate(basis.z) };
                    }
                    if (lower) {
                        const offset = lowerRotate(subtract(point, mid));
                        limbs[key] = { x: pose.joint.x + offset.x, y: pose.joint.y + offset.y, z: pose.joint.z + offset.z };
                        axes[key] = { x: lowerRotate(basis.x), y: lowerRotate(basis.y), z: lowerRotate(basis.z) };
                    }
                    if (v.part.includes('Foot')) {
                        const rest = titanAnchor(root, yaw, joints[endName].position), p = pose.end;
                        limbs[key] = { x: point.x + p.x - rest.x, y: point.y + p.y - rest.y, z: point.z + p.z - rest.z };
                    }
                }
            };
            for (const side of ['left', 'right']) {
                const sign = side === 'left' ? 1 : -1, prefix = side === 'left' ? 'Left' : 'Right';
                solve(`shoulder-${side}`, `elbow-${side}`, `hand-${side}`, { x: Math.cos(yaw) * sign - Math.sin(yaw) * .2, y: .2, z: -Math.sin(yaw) * sign - Math.cos(yaw) * .2 }, prefix, 'UpperArm', ['Forearm', 'Hand']);
                solve(`hip-${side}`, `knee-${side}`, `foot-${side}`, { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }, prefix, 'Thigh', ['Shin']);
            }
            if(joints.tail)solve('tail-base', 'tail-mid', 'tail', { x: Math.cos(yaw), y: .15, z: -Math.sin(yaw) }, 'Tail', 'Base', ['Mid', 'Tip']);
        },
        poseClear: (from, to, yaw, lift) => {
            if(binding?.navigation==='city-bounds')return true;
            probe.x = to.x;
            probe.z = to.z;
            for (let i = 0; i <= 2; i++) {
                const t = i / 2, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t, key = `${Math.floor(x / 4)},${Math.floor(z / 4)},${Math.floor(yaw / .01)},${Math.floor(lift / 4)}`;
                probe.x=x;probe.z=z;
                const near=species.director?buildings:nearbyMotionBuildings(probe,buildings,900*species.height/journeyDallas19.monster.height);
                // Existing 24 m conservative surface margin exceeds cell/yaw/lift quantization error.
                let clear = poseCache.get(key);
                if (clear === undefined) {
                    clear = monsterMotionClear(x, z, m19LegacyYaw(yaw), ground, near, lift,24,geometry,species.height);
                    if (clear) {
                        poseCache.set(key, true);
                        if (poseCache.size > 512)
                            poseCache.delete(poseCache.keys().next().value!);
                    }
                    else
                        clear = monsterMotionClear(x, z, m19LegacyYaw(yaw), ground, near, lift, 0,geometry,species.height);
                }
                if (!clear)
                    return false;
            }
            return true;
        },
        lineOfSight: (a, b) => !segmentBlockedByBuildings(a, b, buildings),
        obstruction: (a, b, radius) => {
            if (segmentBlockedByBuildings(a, b, buildings, radius)) {
                let lo = 0, hi = 1;
                for (let i = 0; i < 10; i++) {
                    const t = (lo + hi) / 2, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
                    if (segmentBlockedByBuildings(a, p, buildings, radius))
                        hi = t;
                    else
                        lo = t;
                }
                return hi;
            }
            if (b.y - radius <= ground(b.x, b.z))
                return 1;
            return null;
        },
        takeDebris: (id, p) => {
            for (let i = 0; i < 6; i++) {
                const key = `${id}:debris:${i}`, x = spawn.x + monsterDebrisOffsets[i].x, z = spawn.z + monsterDebrisOffsets[i].z, position = { x, y: ground(x, z) + 22, z };
                if (!debris.has(key) && Math.hypot(p.x - x, p.y - position.y, p.z - z) < 350) {
                    debris.add(key);
                    return { id: key, position, radius: 22 };
                }
            }
            return null;
        }, reset: () => { debris.clear(); poseCache.clear(); } };
    const pos = { x: probe.x, y: ground(probe.x, probe.z), z: probe.z };
    const yaw = Math.atan2(journeyDallas19.airborneSpawn.x - pos.x, journeyDallas19.airborneSpawn.z - pos.z);
    const engine = new TitanEncounter(attemptId, species, pos, env, { health, yaw });
    return { attemptId, playerId, pilotId: playerId, startedAt, lastTickAt: startedAt, lastBroadcastAt: 0, contactAt: 0, lastDamageAt: 0, hitSequence: 0, engine, frame: engine.snapshot(), x: pos.x, z: pos.z, damageSequence: 0, damageEventSequence: 0, events: [], disposed: false, environmentDamage:binding?.environmentDamage??true, debris, projectileIds: new Set(), destroyedSites: new Set() };
}
export function stepM19(e: M19Encounter, position: Vec, velocity: Vec, radius: number, now: number, threats: readonly Threat[] = []) {
    const dt = Math.min(.1, Math.max(0, (now - e.lastTickAt) / 1000));
    e.lastTickAt = now;
    if (!dt || e.disposed)
        return;
    e.frame = e.engine.step(dt, [{ id: e.pilotId, encounterId: e.attemptId, authorized: true, alive: true, position, velocity, radius }], threats.slice(0, 32));
    const events = [...e.frame.events];
    for (const event of e.frame.events)
        if (e.environmentDamage&&event.kind === 'environment' && ['projectile-impact', 'landing'].includes(event.type))
            for (let i = 0; i < monsterDamageSites.length; i++) {
                const site = monsterDamageSites[i];
                if (!e.destroyedSites.has(i) && Math.abs(event.position.x - site.x) <= site.width / 2 + 40 && Math.abs(event.position.z - site.z) <= site.depth / 2 + 40) {
                    e.destroyedSites.add(i);
                    events.push({ ...event, id: `${e.attemptId}:destruction:${i}`, type: 'destroy-approved-block', position: { x: site.x, y: site.y, z: site.z } });
                }
            }
    e.events = events;
    e.frame = { ...e.frame, events };
    e.x = e.frame.position.x;
    e.z = e.frame.position.z;
}
export function disposeM19(e: M19Encounter) {
    if (e.disposed)
        return;
    e.engine.dispose();
    e.projectileIds.clear();
    e.destroyedSites.clear();
    e.disposed = true;
}
export function permittedM19Damage(e: M19Encounter, event: Snapshot['events'][number], now: number): number {
    if(e.engine.species.anchored&&!(event.type==='projectile'&&event.ability==='fireball-barrage'&&event.amount===10||event.type==='sweep'&&event.ability==='hand-strike'&&event.amount===15&&now-e.contactAt>=4000))return 0;
    if(e.engine.species.stationary&&(event.type!=='sweep'||event.ability!=='hand-strike'||event.amount!==15||now-e.contactAt<4000))return 0;
    if (e.disposed || event.encounterId !== e.attemptId || event.kind !== 'damage' || event.targetId !== e.pilotId || !event.id.startsWith(`${e.attemptId}:event:`))
        return 0;
    const sequence = Number(event.id.split(':').at(-1));
    if (!Number.isSafeInteger(sequence) || sequence <= e.damageEventSequence)
        return 0;
    e.damageEventSequence = sequence;
    if (now - e.lastDamageAt < 100)
        return 0;
    const contact = !['projectile', 'beam'].includes(event.type);
    if (contact && now - e.contactAt < 1000)
        return 0;
    if (contact)
        e.contactAt = now;
    e.lastDamageAt = now;
    return event.amount ?? 0;
}
