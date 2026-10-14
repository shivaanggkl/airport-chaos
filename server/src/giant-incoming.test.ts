import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transportPose, transportSpawn, transportTuning, transportRouteLength } from '../../shared/giant-incoming.mjs';
import { createTransportEncounter, transportAim, transportMuzzle, stepTransportEncounter, transportImpact, loadTransportBuildings, transportAltitude, transportInterceptTime, transportHullImpact } from './giant-incoming.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { indexBuildingsForOcclusion, segmentBlockedByBuildings } from './monster-arrival.js';
import { COMBAT_RANGE } from '../../shared/protocol.mjs';
test('route has constant measured speed, safe airport separation and exact deadline endpoint', () => { assert.equal(transportTuning.speed, 292.5); assert.equal(transportRouteLength, 43875); let distance = 0; for (let ms = 0; ms < 150000; ms += 100) {
    const a = transportPose(ms), b = transportPose(ms + 100);
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(Math.abs(step - 29.25) < .002);
    distance += step;
    for (const airport of cityAirports.dallas)
        assert.ok(Math.hypot(a.x - airport.x, a.z - airport.z) > 2000, airport.id);
} assert.ok(Math.abs(distance - 43875) < .1); assert.deepEqual(transportPose(151000), transportPose(150000)); const spawn = transportSpawn(), p = transportPose(0); assert.ok(Math.abs(Math.hypot(spawn.position.x - p.x, spawn.position.z - p.z) - 1200) < 1e-6); });
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
test('exported triangle collision excludes empty bounding-box space and detects swept fuselage', () => { const p = { ...transportPose(0), x: 0, y: 0, z: 0, yaw: 0 }; assert.ok(transportImpact({ x: 0, y: 10, z: 120 }, { x: 0, y: 10, z: -120 }, p, p)); assert.equal(transportImpact({ x: 94, y: 45, z: 120 }, { x: 94, y: 45, z: -120 }, p, p), undefined); const after = { ...p, x: 25 }; assert.ok(transportImpact({ x: 0, y: 10, z: 120 }, { x: 25, y: 10, z: -120 }, p, after)); });
test('authoritative mapped building envelope sets cruise clearance', () => { assert.equal(transportAltitude([{ minX: -100, maxX: 100, minZ: -2100, maxZ: -1900, top: 1100 }], () => 100), 1420); const mapped = loadTransportBuildings(); assert.ok(mapped.length > 10000); assert.ok(transportAltitude(mapped, () => 0) >= 900); });
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

test('rear bullets ignore their own barrel but are blocked by the actual airframe hull',()=>{const p={...transportPose(0),x:0,y:0,z:0,yaw:0,roll:0};const m=transportMuzzle(p);assert.equal(transportHullImpact(m,{x:m.x,y:m.y,z:m.z+1000},p),false);assert.equal(transportHullImpact({x:0,y:10,z:120},{x:0,y:10,z:-120},p),true);});
