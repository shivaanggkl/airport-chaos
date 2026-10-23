import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transportPose, transportSpawn, transportTuning, transportRouteLength, transportCourse, transportFootprintRadius } from '../../shared/giant-incoming.mjs';
import { createTransportEncounter, transportAim, transportMuzzle, stepTransportEncounter, transportImpact, transportAircraftImpact, transportBodySweep, transportFortressImpact, stepCrossfireGunCycle, transportProjectileDisposition, loadTransportBuildings, transportAltitude, transportInterceptTime, transportHullImpact } from './giant-incoming.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12 } from '../../shared/journey-mission.mjs';
import { indexBuildingsForOcclusion, segmentBlockedByBuildings } from './monster-arrival.js';
import { COMBAT_RANGE, ballisticShotSpeed } from '../../shared/protocol.mjs';
test('larger, slower transport crosses White Rock and fails only after its full city exit', () => {
    assert.equal(transportTuning.scale, 16);
    assert.ok(transportTuning.speed > 0);
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
    const fortressBefore=transportPose(journeyDallas11.timeLimitMs-1000,900,journeyDallas11.timeLimitMs);
    const fortressExit=transportPose(journeyDallas11.timeLimitMs,900,journeyDallas11.timeLimitMs);
    assert.ok(fortressBefore.x-transportFootprintRadius<transportCourse.exitX);
    assert.ok(fortressExit.x-transportFootprintRadius>=transportCourse.exitX-1e-6);
    assert.ok(Math.abs(Math.hypot(fortressExit.velocity.x,fortressExit.velocity.z)-transportRouteLength/330)<1e-9);
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
test('Mission 7–10 player bullets keep traveling until they hit the moving transport', () => {
    for (const mission of [journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10]) {
        let elapsed = mission.timeLimitMs * .4;
        const pose = transportPose(elapsed, 900, mission.timeLimitMs);
        const rear = { x: Math.sin(pose.yaw), z: Math.cos(pose.yaw) };
        const direction = { x: -rear.x, y: 0, z: -rear.z };
        const speed = ballisticShotSpeed({ x: direction.x * 300, y: 0, z: direction.z * 300 }, direction);
        let position = { x: pose.x + rear.x * 1200, y: pose.y + 40, z: pose.z + rear.z * 1200 };
        let traveled = 0;
        let hit = false;
        for (let step = 0; step < 100; step += 1) {
            const next = { x: position.x + direction.x * speed * .05, y: position.y, z: position.z + direction.z * speed * .05 };
            const before = transportPose(elapsed, 900, mission.timeLimitMs);
            elapsed += 50;
            const after = transportPose(elapsed, 900, mission.timeLimitMs);
            traveled += speed * .05;
            if (transportImpact(position, next, before, after)) { hit = true; break; }
            assert.notEqual(transportProjectileDisposition(mission.id, traveled, false), 'remove');
            position = next;
        }
        assert.equal(hit, true, `${mission.name} shot must reach the transport`);
        assert.equal(transportProjectileDisposition(mission.id, 10, true), 'remove');
        assert.equal(transportProjectileDisposition(mission.id, COMBAT_RANGE, false), 'remove');
        assert.equal(transportProjectileDisposition(mission.id, 10, false), mission === journeyDallas07 ? 'continue' : 'escort');
    }
});
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
test('Fortress crash sweep follows the moving hull without using gun collision',()=>{
  const p={...transportPose(0),x:0,y:0,z:0,yaw:0,roll:0};
  assert.equal(transportBodySweep({x:0,y:40,z:480},{x:0,y:40,z:-480},p,p),true);
  assert.equal(transportBodySweep({x:500,y:50,z:480},{x:500,y:50,z:-480},p,p),false);
  assert.equal(transportBodySweep({x:0,y:40,z:480},{x:50,y:40,z:-480},p,{...p,x:50}),true);
});
test('player airframe sweep catches nose, wing, and underside before the center crosses the transport',()=>{
  const p={...transportPose(0),x:0,y:0,z:0,yaw:0,roll:0};
  const rotation={x:0,y:0,z:0};
  const crash=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>
    transportAircraftImpact(a,b,rotation,rotation,'trainer',p,p,true);
  const noseA={x:0,y:40,z:380},noseB={x:0,y:40,z:355};
  assert.equal(transportImpact(noseA,noseB,p,p,false),undefined);
  assert.ok(crash(noseA,noseB));
  const wingA={x:310,y:40,z:0},wingB={x:276,y:40,z:0};
  assert.equal(transportImpact(wingA,wingB,p,p,false),undefined);
  assert.ok(crash(wingA,wingB));
  const belowA={x:0,y:-90,z:0},belowB={x:0,y:-71.2,z:0};
  assert.equal(transportImpact(belowA,belowB,p,p,false),undefined);
  assert.ok(crash(belowA,belowB));
  assert.equal(crash({x:400,y:180,z:480},{x:400,y:180,z:-480}),undefined);
  assert.ok(transportAircraftImpact({x:0,y:40,z:480},{x:50,y:40,z:-480},rotation,rotation,'trainer',p,{...p,x:50},true));
});

test('Fortress projectile sweep separates wing turrets, armor, and exposed rear core',()=>{
  const pose={...transportPose(0),x:0,y:0,z:0,yaw:0,roll:0,sideGuns:[{yaw:0,pitch:0},{yaw:0,pitch:0}]};
  const shot=(x:number,y:number)=>[{x:x*16,y:y*16,z:480},{x:x*16,y:y*16,z:-128}] as const;
  for(const [x,side] of [[-11,'left'],[11,'right']] as const){const [a,b]=shot(x,4.7);assert.equal(transportFortressImpact(a,b,pose,pose,false)?.component,side);}
  const [a,b]=shot(0,journeyDallas11.coreLocal.y);
  assert.equal(transportFortressImpact(a,b,pose,pose,false)?.component,'armor');
  assert.equal(transportFortressImpact(a,b,pose,pose,true)?.component,'core');
  let segmentedHit:'left'|'right'|'core'|'armor'|undefined;
  for(let z=30;z>16 && !segmentedHit;z-=1.625){
    segmentedHit=transportFortressImpact({x:0,y:journeyDallas11.coreLocal.y*16,z:z*16},
      {x:0,y:journeyDallas11.coreLocal.y*16,z:(z-1.625)*16},pose,pose,true)?.component;
  }
  assert.equal(segmentedHit,'core');
  assert.equal(transportFortressImpact({x:500,y:50,z:480},{x:500,y:50,z:-128},pose,pose,true),undefined);
  assert.equal(journeyDallas11.timeLimitMs,330_000);
});

test('Fortress side guns alternate two-shot turns, warn first, and skip a dead gun',()=>{
  const cycle=createTransportEncounter('a','p',0,900,journeyDallas11.timeLimitMs,false,true).crossfire!;
  const alive=[true,true],shots:{gun:number;at:number}[]=[];
  for(let ms=0;ms<=11_300;ms+=50){
    if(ms===7_500)alive[0]=false;
    const gun=stepCrossfireGunCycle(cycle,ms,index=>index!==0 && alive[index-1]!,true);
    if(gun!==null)shots.push({gun,at:ms});
    if(ms<3_000)assert.equal(shots.length,0);
  }
  assert.deepEqual(shots,[{gun:1,at:3_000},{gun:1,at:3_250},{gun:2,at:6_000},{gun:2,at:6_250},{gun:2,at:12_000}].filter(s=>s.at<=11_300));
  assert.equal(cycle.guns[0]!.warningUntil,0);
});

test('Fortress encounter emits two traveling side-gun shots and no hidden rear-gun shots',()=>{
  const encounter=createTransportEncounter('fortress','pilot',0,900,journeyDallas11.timeLimitMs,false,true);
  for(let ms=0;ms<=4_000;ms+=50){
    const pose=transportPose(ms,900,journeyDallas11.timeLimitMs),c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
    const target={x:pose.x+c*-1100+s*350,y:pose.y+65,z:pose.z-s*-1100+c*350};
    stepTransportEncounter(encounter,target,{x:0,y:0,z:0},[],ms);
    if(ms<3_000)assert.equal(encounter.shots.length,0);
  }
  assert.equal(encounter.shots.length,2);
  assert.equal(encounter.crossfire?.guns[0].warningUntil,0);
  encounter.fortressTurrets![0]=0;
  const previous=encounter.shots.length;
  for(let ms=4_050;ms<=6_000;ms+=50){
    const pose=transportPose(ms,900,journeyDallas11.timeLimitMs),c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
    const target={x:pose.x+c*-1100+s*350,y:pose.y+65,z:pose.z-s*-1100+c*350};
    stepTransportEncounter(encounter,target,{x:0,y:0,z:0},[],ms);
  }
  assert.equal(encounter.shots.length,previous);
});

test('Final Intercept transport stays silent for escorts, then shares the fortress gun schedule', () => {
  const encounter = createTransportEncounter('final', 'pilot', 0, 900, journeyDallas12.timeLimitMs, false, true);
  encounter.fortressGunsEnabled = false;
  for (let ms = 0; ms <= 10_000; ms += 50) {
    const pose = transportPose(ms, 900, journeyDallas12.timeLimitMs);
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    stepTransportEncounter(encounter, { x: pose.x - c * 1100 + s * 350, y: pose.y + 65,
      z: pose.z + s * 1100 + c * 350 }, { x: 0, y: 0, z: 0 }, [], ms);
  }
  assert.equal(encounter.shots.length, 0);
  assert.equal(encounter.crossfire?.activeGun, null);
  encounter.fortressGunsEnabled = true;
  encounter.crossfire!.nextBurstAt = 12_000;
  for (let ms = 10_050; ms <= 13_500; ms += 50) {
    const pose = transportPose(ms, 900, journeyDallas12.timeLimitMs);
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    stepTransportEncounter(encounter, { x: pose.x - c * 1100 + s * 350, y: pose.y + 65,
      z: pose.z + s * 1100 + c * 350 }, { x: 0, y: 0, z: 0 }, [], ms);
  }
  assert.equal(encounter.shots.length, 2);
  assert.equal(encounter.crossfire?.guns[0].warningUntil, 0);
  assert.equal(transportProjectileDisposition(journeyDallas12.id, 100, false), 'escort');
  const before = transportPose(journeyDallas12.timeLimitMs - 1_000, 900, journeyDallas12.timeLimitMs);
  const exit = transportPose(journeyDallas12.timeLimitMs, 900, journeyDallas12.timeLimitMs);
  assert.ok(before.x - transportFootprintRadius < transportCourse.exitX);
  assert.ok(exit.x - transportFootprintRadius >= transportCourse.exitX - 1e-6);
});
