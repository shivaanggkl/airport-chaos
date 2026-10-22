import { readFileSync, readdirSync } from 'node:fs';
import { transportPose, transportTuning, transportFootprintRadius, type TransportPoint as Point, type TransportPose } from '../../shared/giant-incoming.mjs';
import { COMBAT_RANGE, ballisticShotSpeed } from '../../shared/protocol.mjs';
import { journeyDallas08 } from '../../shared/journey-mission.mjs';
import { segmentBlockedByBuildings, indexBuildingsForOcclusion } from './monster-arrival.js';
type Building = {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    top: number;
};
export function loadTransportBuildings(): Building[] {
    const dir = new URL('../../client/public/data/dallas/near/', import.meta.url), result: Building[] = [];
    const first = transportPose(0), last = transportPose(transportTuning.durationMs), reach = COMBAT_RANGE + transportFootprintRadius, minX = first.x - reach, maxX = last.x + reach, minZ = Math.min(first.z,last.z) - reach, maxZ = Math.max(first.z,last.z) + reach;
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json'))
            continue;
        const [cellX, cellZ] = name.replace('.json', '').split('_').map(Number);
        if ((cellX! + 1) * 2000 < minX || cellX! * 2000 > maxX || (cellZ! + 1) * 2000 < minZ || cellZ! * 2000 > maxZ)
            continue;
        const chunk = JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as {
            b: number[][];
        };
        for (const b of chunk.b) {
            const xs = [], zs = [];
            for (let i = 4; i + 1 < b.length; i += 2) {
                xs.push(b[i]!);
                zs.push(b[i + 1]!);
            }
            if (xs.length >= 3) {
                const item = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top: b[0]! + b[3]! };
                if (item.maxX >= minX && item.minX <= maxX && item.maxZ >= minZ && item.minZ <= maxZ)
                    result.push(item);
            }
        }
    }
    indexBuildingsForOcclusion(result);
    return result;
}
export function transportAltitude(buildings: readonly Building[], terrain: (x: number, z: number) => number): number {
    let ceiling = 0;
    const first = transportPose(0), last = transportPose(transportTuning.durationMs);
    const dx = last.x-first.x, dz = last.z-first.z, lengthSquared = dx*dx+dz*dz;
    // One conservative footprint/route check per mapped building, not a full
    // building scan for every route sample.
    for (const building of buildings) {
        const x=(building.minX+building.maxX)/2, z=(building.minZ+building.maxZ)/2;
        const t=Math.max(0,Math.min(1,((x-first.x)*dx+(z-first.z)*dz)/lengthSquared));
        const radius=Math.hypot(building.maxX-building.minX,building.maxZ-building.minZ)/2;
        if(Math.hypot(x-first.x-t*dx,z-first.z-t*dz)<=transportFootprintRadius+radius)
            ceiling=Math.max(ceiling,building.top);
    }
    for(let ms=0;ms<=transportTuning.durationMs;ms+=100){
        const p=transportPose(ms);
        for(const x of [-transportFootprintRadius,0,transportFootprintRadius])
            for(const z of [-transportFootprintRadius,0,transportFootprintRadius])
                ceiling=Math.max(ceiling,terrain(p.x+x,p.z+z));
    }
    return Math.max(900,ceiling+250+4.41283*transportTuning.scale);

}
const collisionData = (JSON.parse(readFileSync(new URL('../../shared/giant-transport-collision.json', import.meta.url), 'utf8')) as {
    triangles: number[][]; gunTriangles: number[];
});
const triangles = collisionData.triangles;
type Box = {
    min: number[];
    max: number[];
    left?: Box;
    right?: Box;
    ids?: number[];
};
const bounds = triangles.map(t => ({ min: [0, 1, 2].map(a => Math.min(t[a]!, t[a + 3]!, t[a + 6]!)), max: [0, 1, 2].map(a => Math.max(t[a]!, t[a + 3]!, t[a + 6]!)) }));
function tree(ids: number[], shapeBounds = bounds): Box {
    const min = [0, 1, 2].map(a => Math.min(...ids.map(i => shapeBounds[i]!.min[a]!))), max = [0, 1, 2].map(a => Math.max(...ids.map(i => shapeBounds[i]!.max[a]!)));
    if (ids.length <= 16)
        return { min, max, ids };
    const axis = [0, 1, 2].sort((a, b) => (max[b]! - min[b]!) - (max[a]! - min[a]!))[0]!;
    ids.sort((a, b) => (shapeBounds[a]!.min[axis]! + shapeBounds[a]!.max[axis]!) - (shapeBounds[b]!.min[axis]! + shapeBounds[b]!.max[axis]!));
    const mid = ids.length >> 1;
    return { min, max, left: tree(ids.slice(0, mid),shapeBounds), right: tree(ids.slice(mid),shapeBounds) };
}
const gunIds=new Set(collisionData.gunTriangles);
const bodyTree=tree(triangles.flatMap((_,i)=>gunIds.has(i)?[]:[i]));
const gunSurface=collisionData.gunTriangles.map(i=>triangles[i]!.map((v,axis)=>v-(axis%3===1?4.699999809265137:axis%3===2?18.600000381469727:0)));
const gunBounds=gunSurface.map(t=>({min:[0,1,2].map(a=>Math.min(t[a]!,t[a+3]!,t[a+6]!)),max:[0,1,2].map(a=>Math.max(t[a]!,t[a+3]!,t[a+6]!))}));
const gunTree=tree(gunSurface.map((_,i)=>i),gunBounds);
function gunLocal(p:Point,pose:TransportPose):number[]{const q=local(p,pose),x=q[0]!,y=q[1]!-4.699999809265137,z=q[2]!-18.600000381469727,c=Math.cos(pose.gunYaw??0),s=Math.sin(pose.gunYaw??0),gx=c*x-s*z,gz=s*x+c*z,cp=Math.cos(pose.gunPitch??0),sp=Math.sin(pose.gunPitch??0);return[gx,cp*y-sp*gz,sp*y+cp*gz];}
function local(p: Point, pose: TransportPose): number[] { const x = p.x - pose.x, z = p.z - pose.z, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw); const lx = c * x - s * z, ly = p.y - pose.y, r = pose.roll ?? 0, cr = Math.cos(r), sr = Math.sin(r); return [(cr * lx + sr * ly) / transportTuning.scale, (-sr * lx + cr * ly) / transportTuning.scale, (s * x + c * z) / transportTuning.scale]; }
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
/** First triangle impact in relative motion. Both target poses are authoritative. */
function impactFraction(start:number[],end:number[],meshTree:Box,surface=triangles):number {
    const d = sub(end, start);
    let first = Infinity;
    function visit(box: Box) {
        let enter = 0, exit = Math.min(1, first);
        for (let i = 0; i < 3; i++) {
            if (Math.abs(d[i]!) < 1e-9) {
                if (start[i]! < box.min[i]! || start[i]! > box.max[i]!)
                    return;
            }
            else {
                let lo = (box.min[i]! - start[i]!) / d[i]!, hi = (box.max[i]! - start[i]!) / d[i]!;
                if (lo > hi)
                    [lo, hi] = [hi, lo];
                enter = Math.max(enter, lo);
                exit = Math.min(exit, hi);
                if (enter > exit)
                    return;
            }
        }
        if (box.ids)
            for (const id of box.ids) {
                const t = surface[id]!, v = t.slice(0, 3), e1 = sub(t.slice(3, 6), v), e2 = sub(t.slice(6, 9), v), h = cross(d, e2), det = dot(e1, h);
                if (Math.abs(det) < 1e-9)
                    continue;
                const s = sub(start, v), u = dot(s, h) / det;
                if (u < 0 || u > 1)
                    continue;
                const q = cross(s, e1), w = dot(d, q) / det;
                if (w < 0 || u + w > 1)
                    continue;
                const hit = dot(e2, q) / det;
                if (hit >= 0 && hit <= 1)
                    first = Math.min(first, hit);
            }
        else {
            visit(box.left!);
            visit(box.right!);
        }
    }
    visit(meshTree);
    return first;
}
export function transportImpact(a:Point,b:Point,before:TransportPose,after:TransportPose):Point|undefined {
 const first=Math.min(impactFraction(local(a,before),local(b,after),bodyTree),impactFraction(gunLocal(a,before),gunLocal(b,after),gunTree,gunSurface));
 return Number.isFinite(first)?{x:a.x+(b.x-a.x)*first,y:a.y+(b.y-a.y)*first,z:a.z+(b.z-a.z)*first}:undefined;
}
/** A bullet may leave its own barrel, but never traverse the aircraft hull. */
export function transportHullImpact(a:Point,b:Point,pose:TransportPose):boolean {return Number.isFinite(impactFraction(local(a,pose),local(b,pose),bodyTree));}

/** Keep player shots in flight until impact, obstruction, or the shared range limit. */
export function transportProjectileDisposition(missionId: string, traveled: number, blocked: boolean): 'remove' | 'continue' | 'escort' {
    if (traveled >= COMBAT_RANGE || blocked) return 'remove';
    return missionId === journeyDallas08.id ? 'escort' : 'continue';
}

export type TransportShot = {
    id: string;
    position: Point;
    direction: Point;
    speed: number;
    traveled: number;
};
export type TransportEncounter = {
    attemptId: string;
    playerId: string;
    startedAt: number;
    altitude: number;
    durationMs: number;
    lastTickAt: number;
    lastBroadcastAt: number;
    nextBurstAt: number;
    warningUntil: number;
    shotsRemaining: number;
    nextShotAt: number;
    sequence: number;
    hitSequence: number;
    hitPosition?: Point;
    gunYaw: number;
    gunPitch: number;
    shots: TransportShot[];
};
export function createTransportEncounter(attemptId: string, playerId: string, startedAt: number, altitude: number, durationMs = transportTuning.durationMs): TransportEncounter { return { attemptId, playerId, startedAt, altitude, durationMs, lastTickAt: startedAt, lastBroadcastAt: 0, nextBurstAt: startedAt + 2000, warningUntil: 0, shotsRemaining: 0, nextShotAt: 0, sequence: 0, hitSequence: 0, gunYaw: 0, gunPitch: 0, shots: [] }; }
export function transportMuzzle(p: TransportPose, yaw = 0, pitch = 0): Point {
    const distance = 2.1299991607666016 * transportTuning.scale, x = Math.sin(yaw) * Math.cos(pitch) * distance, y = 4.699999809265137 * transportTuning.scale + Math.sin(pitch) * distance, z = 18.600000381469727 * transportTuning.scale + Math.cos(yaw) * Math.cos(pitch) * distance;
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll), lx = cr * x - sr * y, ly = sr * x + cr * y, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return { x: p.x + c * lx + s * z, y: p.y + ly, z: p.z - s * lx + c * z };
}
export function transportAim(p: TransportPose, target: Point): {
    yaw: number;
    pitch: number;
    eligible: boolean;
} { const m = transportMuzzle(p), x = target.x - m.x, z = target.z - m.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), rawX = c * x - s * z, rawY = target.y - m.y, cr = Math.cos(p.roll), sr = Math.sin(p.roll), lx = cr * rawX + sr * rawY, lz = s * x + c * z, y = -sr * rawX + cr * rawY, yaw = Math.atan2(lx, lz), pitch = Math.atan2(y, Math.hypot(lx, lz)); return { yaw, pitch, eligible: Math.hypot(x, y, z) <= COMBAT_RANGE && Math.abs(yaw) <= transportTuning.yawArc && Math.abs(pitch) <= transportTuning.pitchArc }; }
/** Earliest positive intercept, including faster aircraft flying toward the gun. */
export function transportInterceptTime(offset: Point, velocity: Point, speed: number): number {
    const a = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2 - speed ** 2, b = 2 * (offset.x * velocity.x + offset.y * velocity.y + offset.z * velocity.z), c = offset.x ** 2 + offset.y ** 2 + offset.z ** 2;
    if (Math.abs(a) < 1e-8)
        return b < 0 ? Math.min(2.5, -c / b) : 0;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return 0;
    const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(t => t > 0);
    return roots.length ? Math.min(2.5, ...roots) : 0;
}
export function stepTransportEncounter(e: TransportEncounter, target: Point, velocity: Point, buildings: readonly Building[], now: number) {
    const dt = Math.max(0, Math.min(.1, (now - e.lastTickAt) / 1000));
    e.lastTickAt = now;
    const p = transportPose(now - e.startedAt, e.altitude, e.durationMs), m = transportMuzzle(p, e.gunYaw, e.gunPitch), aim = transportAim(p, target);
    const move = (current: number, goal: number) => current + Math.max(-dt * .8, Math.min(dt * .8, goal - current));
    e.gunYaw = move(e.gunYaw, Math.max(-transportTuning.yawArc, Math.min(transportTuning.yawArc, aim.yaw)));
    e.gunPitch = move(e.gunPitch, Math.max(-transportTuning.pitchArc, Math.min(transportTuning.pitchArc, aim.pitch)));
    const clear = aim.eligible && !transportHullImpact(m,target,p) && !segmentBlockedByBuildings(m, target, buildings);
    if (now >= e.nextBurstAt && !e.warningUntil && !e.shotsRemaining && clear) {
        e.warningUntil = now + transportTuning.warningMs;
        e.nextBurstAt = now + transportTuning.burstIntervalMs;
    }
    if (e.warningUntil && now >= e.warningUntil) {
        e.warningUntil = 0;
        e.shotsRemaining = clear ? 3 : 0;
        e.nextShotAt = now;
    }
    if (e.shotsRemaining && now >= e.nextShotAt) {
        e.shotsRemaining--;
        e.nextShotAt = now + transportTuning.shotSpacingMs;
        if (clear && Math.abs(e.gunYaw - aim.yaw) < .06 && Math.abs(e.gunPitch - aim.pitch) < .06 && e.shots.length < 9) {
            const distance = Math.hypot(target.x - m.x, target.y - m.y, target.z - m.z), initial = { x: (target.x - m.x) / distance, y: (target.y - m.y) / distance, z: (target.z - m.z) / distance }, speed = ballisticShotSpeed(p.velocity, initial), offset = { x: target.x - m.x, y: target.y - m.y, z: target.z - m.z }, lead = transportInterceptTime(offset, velocity, speed), dx = target.x + velocity.x * lead - m.x, dy = target.y + velocity.y * lead - m.y, dz = target.z + velocity.z * lead - m.z, norm = Math.hypot(dx, dy, dz), direction = { x: dx / norm, y: dy / norm, z: dz / norm };
            const predicted = { x: m.x + dx, y: m.y + dy, z: m.z + dz }, outsideMuzzle = { x: m.x + direction.x * 4, y: m.y + direction.y * 4, z: m.z + direction.z * 4 };
            if (transportAim(p, predicted).eligible && !transportHullImpact(m,predicted,p) && !segmentBlockedByBuildings(m, predicted, buildings))
                e.shots.push({ id: `${e.attemptId}:${++e.sequence}`, position: { ...m }, direction, speed: ballisticShotSpeed(p.velocity, direction), traveled: 0 });
        }
    }
    return p;
}
