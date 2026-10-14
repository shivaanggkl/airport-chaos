import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transportPose, transportSpawn, transportTuning, transportRouteLength, transportCourse, transportFootprintRadius } from '../../shared/giant-incoming.mjs';
import { createTransportEncounter, transportAim, transportMuzzle, stepTransportEncounter, transportImpact, loadTransportBuildings, transportAltitude, transportInterceptTime, transportHullImpact } from './giant-incoming.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { indexBuildingsForOcclusion, segmentBlockedByBuildings } from './monster-arrival.js';
import { COMBAT_RANGE } from '../../shared/protocol.mjs';
test('larger, slower transport crosses White Rock and fails only after its full city exit', () => {
    assert.equal(transportTuning.scale, 16);
    assert.ok(Math.abs(transportTuning.speed - 263.25) < 1e-9);
    const start=transportPose(0), end=transportPose(transportTuning.durationMs);
    assert.equal(start.x,-27850); assert.equal(start.z,-13600);
    const whiteRockDistance=Math.hypot(5200-start.x,-8500-start.z);
    const passing=transportPose(whiteRockDistance/transportTuning.speed*1000);
    assert.ok(Math.hypot(passing.x-5200,passing.z+8500)<1e-6);
    assert.ok(end.x-transportFootprintRadius >= transportCourse.exitX-1e-6);
    const before=transportPose(transportTuning.durationMs-1000);
    assert.ok(before.x-transportFootprintRadius < transportCourse.exitX);
    assert.deepEqual(transportPose(transportTuning.durationMs+1000),end);
    let distance=0;
    for(let ms=0;ms<transportTuning.durationMs;ms+=100){
      const next=Math.min(ms+100,transportTuning.durationMs),a=transportPose(ms),b=transportPose(next);
      const step=Math.hypot(b.x-a.x,b.z-a.z);
      assert.ok(Math.abs(step-Math.min(transportTuning.speed*(next-ms)/1000,transportRouteLength-ms*transportTuning.speed/1000))<1e-6); distance+=step;
    }
    assert.ok(Math.abs(distance-transportRouteLength)<1e-6);
    const spawn=transportSpawn(100),dfw=cityAirports.dallas.find(a=>a.id==='dfw')!;
    assert.equal(spawn.position.x,dfw.x);assert.equal(spawn.position.z,dfw.z);assert.equal(spawn.position.y,101.2);assert.equal(spawn.speed,0);
});
test('rear arc rejects front, beyond range and steep vertical aiming', () => { const p = transportPose(0), m = transportMuzzle(p), rear = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }; const target = { x: m.x + rear.x * 1200, y: m.y, z: m.z + rear.z * 1200 }; assert.equal(transportAim(p, target).eligible, true); assert.equal(transportAim(p, { x: m.x - rear.x * 1000, y: m.y, z: m.z - rear.z * 1000 }).eligible, false); assert.equal(transportAim(p, { ...target, y: m.y + 2000 }).eligible, false); assert.equal(transportAim(p, { x: m.x + rear.x * (COMBAT_RANGE + 1), y: m.y, z: m.z + rear.z * (COMBAT_RANGE + 1) }).eligible, false); });
test('warning precedes three ballistic releases and articulation stays bounded', () => { const e = createTransportEncounter('owned', 'pilot', 0, 900); let firstWarning = 0; for (let ms = 0; ms < 5000; ms += 50) {
    const p = transportPose(ms), m = transportMuzzle(p), target = { x: m.x + Math.sin(p.yaw) * 1200, y: m.y, z: m.z + Math.cos(p.yaw) * 1200 };
    stepTransportEncounter(e, target, { x: 0, y: 0, z: 0 }, [], ms);
    if (e.warningUntil && !firstWarning)
        firstWarning = ms;
    if (ms < 3000)
        assert.equal(e.shots.length, 0);
    assert.ok(Math.abs(e.gunYaw) <= transportTuning.yawArc);
    assert.ok(Math.abs(e.gunPitch) <= transportTuning.pitchArc);
} assert.equal(firstWarning, 2000); assert.equal(e.shots.length, 3); assert.ok(e.shots.every(s => s.speed === 520)); });
test('exported triangle collision excludes empty bounding-box space and detects swept fuselage', () => { const p = { ...transportPose(0), x: 0, y: 0, z: 0, yaw: 0 }; assert.ok(transportImpact({ x: 0, y: 40, z: 480 }, { x: 0, y: 40, z: -480 }, p, p)); assert.equal(transportImpact({ x: 376, y: 180, z: 480 }, { x: 376, y: 180, z: -480 }, p, p), undefined); const after = { ...p, x: 50 }; assert.ok(transportImpact({ x: 0, y: 40, z: 480 }, { x: 50, y: 40, z: -480 }, p, after)); });
test('authoritative mapped building envelope sets cruise clearance', () => { assert.equal(transportAltitude([{ minX: 5100, maxX: 5300, minZ: -8600, maxZ: -8400, top: 1100 }], () => 100), 1100 + 250 + 4.41283 * transportTuning.scale); const mapped = loadTransportBuildings(); assert.ok(mapped.length > 10000); assert.ok(transportAltitude(mapped, () => 0) >= 900); });
test('indexed occlusion matches the existing unindexed mapped-building rules', () => {
    const source = [{ minX: -20, maxX: 20, minZ: -20, maxZ: 20, top: 180 }, { minX: 100, maxX: 140, minZ: 50, maxZ: 90, top: 350 }];
    const indexed = source.map(b => ({ ...b }));
    indexBuildingsForOcclusion(indexed);
    for (let i = 0; i < 100; i++) {
        const a = { x: -200 + i * 3, y: 100 + i * 4, z: -120 }, b = { x: 180, y: 140 + i, z: 120 };
        assert.equal(segmentBlockedByBuildings(a, b, indexed), segmentBlockedByBuildings(a, b, source));
    }
});

test('rear gun interception covers stationary and faster approaching aircraft without homing',()=>{assert.equal(transportInterceptTime({x:0,y:0,z:520},{x:0,y:0,z:0},520),1);assert.ok(Math.abs(transportInterceptTime({x:0,y:0,z:1000},{x:0,y:0,z:-1000},520)-1000/1520)<1e-9);assert.equal(transportInterceptTime({x:0,y:0,z:1000},{x:0,y:0,z:1000},520),0);});

test('rear bullets ignore their own barrel but are blocked by the actual airframe hull',()=>{const p={...transportPose(0),x:0,y:0,z:0,yaw:0,roll:0};const m=transportMuzzle(p);assert.equal(transportHullImpact(m,{x:m.x,y:m.y,z:m.z+1000},p),false);assert.equal(transportHullImpact({x:0,y:40,z:480},{x:0,y:40,z:-480},p),true);});
