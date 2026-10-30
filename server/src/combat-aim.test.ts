import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { selectCombatTarget, rebaseCombatAim, combatLockReady, combatIntercept, assistedInterceptAim, combatAimProjection, combatShotAimSample, combatAimBlend, TARGET_SWITCH_DWELL_MS, TARGET_TURN_GRACE_MS, SMART_ASSIST_CONE, type CombatSelection } from '../../shared/combat-aim.mjs';
import { projectileImpactFraction } from '../../shared/projectile-collision.mjs';
import { ballisticShotSpeed, COMBAT_RANGE, stepAim, AIM_ENVELOPE, interpolateAim } from '../../shared/protocol.mjs';
const zero = { x: 0, y: 0, z: 0 };
test('delayed aim updates cannot restart interpolation through an expired previous sample', () => {
    assert.equal(combatAimBlend(0, 1146, 1195), 1);
    assert.deepEqual(combatShotAimSample(128, 129, combatAimBlend(0, 1146, 1195)), { from: 129, to: 129, blend: 1 });
    assert.equal(combatAimBlend(0, 475, 499), .24);
    assert.equal(combatAimBlend(0, 475, 500), 1);
    assert.equal(combatAimBlend(100, 200, 225), .25);
    assert.equal(combatAimBlend(100, 200, 300), 1);
    assert.equal(combatAimBlend(-Infinity, 200, 225), 1);
});
test('fully blended shots reference only the contributing aim sample; partial blends retain both references', () => {
    assert.deepEqual(combatShotAimSample(72, 73, 1), { from: 73, to: 73, blend: 1 });
    for (const blend of [0, .25, .999])
        assert.deepEqual(combatShotAimSample(72, 73, blend), { from: 72, to: 73, blend });
    const samples = new Map([[72, { x: .02, y: -.03 }], [73, { x: -.04, y: .01 }]]);
    for (const blend of [0, .25, .999, 1]) {
        const reference = combatShotAimSample(72, 73, blend);
        const expected = interpolateAim(samples.get(72)!, samples.get(73)!, blend, { x: 0, y: 0 });
        const actual = interpolateAim(samples.get(reference.from)!, samples.get(reference.to)!, reference.blend, { x: 0, y: 0 });
        assert.ok(Math.abs(actual.x - expected.x) < 1e-12 && Math.abs(actual.y - expected.y) < 1e-12,
            'reference canonicalization preserves the displayed firing vector');
    }
});
test('one primary target stays stable with 2, 3, 5 and 12 fluctuating enemies; clear steering switches after dwell', () => {
    for (const count of [2, 3, 5, 12]) {
        const state: CombatSelection = { challengerSince: 0, lastAlignedAt: 0 };
        const enemies = Array.from({ length: count }, (_, i) => ({ id: `${i}`, angle: .04 + i * .001, distance: 700, aligned: true }));
        assert.equal(selectCombatTarget(state, enemies, 0)?.id, '0');
        for (let t = 16; t < 1200; t += 16) {
            for (const [i, enemy] of enemies.entries())
                enemy.distance = 700 + Math.sin(t + i) * 70;
            assert.equal(selectCombatTarget(state, enemies, t)?.id, '0');
        }
        enemies[1]!.angle = 0;
        enemies[0]!.angle = .08;
        assert.equal(selectCombatTarget(state, enemies, 1300)?.id, '0');
        assert.equal(selectCombatTarget(state, enemies, 1300 + TARGET_SWITCH_DWELL_MS)?.id, '1');
        enemies[1]!.aligned = false;
        assert.notEqual(selectCombatTarget(state, enemies, 1550)?.id, '1', 'an aligned alternative replaces a target left behind during a turn');
        assert.notEqual(selectCombatTarget(state, enemies, 1550 + TARGET_TURN_GRACE_MS + 1)?.id, '1');
        assert.notEqual(selectCombatTarget(state, enemies.filter(e => e.id !== state.targetId), 3000)?.id, '1');
    }
});
test('pointing outranks target distance and mission objective identity; invalid targets release immediately', () => {
    const state: CombatSelection = { challengerSince: 0, lastAlignedAt: 0 };
    const transport = { id: 'transport', angle: .07, distance: 200, aligned: true };
    const escort = { id: 'escort', angle: .04, distance: 4000, aligned: true };
    assert.equal(selectCombatTarget(state, [escort, transport], 0)?.id, 'escort');
    transport.angle = 0;
    assert.equal(selectCombatTarget(state, [escort, transport], 10)?.id, 'escort');
    assert.equal(selectCombatTarget(state, [escort, transport], 10 + TARGET_SWITCH_DWELL_MS)?.id, 'transport');
    assert.equal(selectCombatTarget(state, [escort], 310)?.id, 'escort');
    assert.equal(selectCombatTarget(state, [], 320), undefined);
    assert.equal(state.targetId, undefined);
});
test('brief turns retain selection only while no aligned replacement exists', () => {
    const state: CombatSelection = { challengerSince: 0, lastAlignedAt: 0 };
    const first = { id: 'first', angle: .05, distance: 600, aligned: true };
    const second = { id: 'second', angle: .01, distance: 1000, aligned: true };
    selectCombatTarget(state, [first], 0);
    first.aligned = false;
    assert.equal(selectCombatTarget(state, [first], 50)?.id, 'first');
    assert.equal(selectCombatTarget(state, [first, second], 60)?.id, 'second');
    second.aligned = false;
    assert.equal(selectCombatTarget(state, [second], 60 + TARGET_TURN_GRACE_MS + 1), undefined);
});
test('interception preserves inherited speed for stationary, approaching, retreating, crossing and fast targets', () => {
    for (const targetVelocity of [zero, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -200 }, { x: 300, y: 35, z: 0 }, { x: -600, y: -40, z: 50 }]) {
        for (const launchVelocity of [zero, { x: 10, y: 30, z: -600 }]) {
            const position = { x: 0, y: 0, z: -1200 };
            const hit = combatIntercept(zero, launchVelocity, position, targetVelocity);
            if (targetVelocity.x === -600 && launchVelocity.z === 0) {
                assert.equal(hit, null);
                continue;
            }
            assert.ok(hit);
            const traveled = new THREE.Vector3().copy(hit.direction).multiplyScalar(hit.speed * hit.seconds);
            const target = new THREE.Vector3().copy(position).addScaledVector(new THREE.Vector3().copy(targetVelocity), hit.seconds);
            assert.ok(traveled.distanceTo(target) < .01);
            assert.equal(hit.speed, ballisticShotSpeed(launchVelocity, hit.direction));
            assert.ok(hit.speed * hit.seconds <= COMBAT_RANGE);
        }
    }
    assert.equal(combatIntercept(zero, zero, { x: 0, y: 0, z: -1000 }, { x: 0, y: 0, z: -1000 }), null);
    assert.equal(combatIntercept(zero, zero, zero, zero), null);
    assert.equal(combatIntercept(zero, zero, { x: NaN, y: 0, z: 0 }, zero), null);
    assert.equal(combatIntercept(zero, zero, { x: 0, y: 0, z: -5000 }, zero), null);
});
test('assistance covers the acquisition area, stays forward-only and bounded, and has no in-flight target dependency', () => {
    const out = { x: 0, y: 0 };
    assert.equal(assistedInterceptAim({ x: .04, y: .02, z: -1 }, out), true);
    assert.ok(Math.hypot(out.x, out.y) < .10);
    assert.equal(assistedInterceptAim({ x: .30, y: 0, z: -1 }, out), true, 'nearby targets inside the acquisition area receive assistance in every mode');
    assert.equal(assistedInterceptAim({ x: .4, y: 0, z: -1 }, out), true);
    assert.ok(Math.abs(out.x-Math.tan(AIM_ENVELOPE))<1e-12,'lead at the travel edge stays bounded instead of returning to centre');
    assert.equal(assistedInterceptAim({ x: 0, y: 0, z: 1 }, out), false);
});
test('actual muzzle ray projects consistently through bank, climb, dive, turn, zoom and camera orbit', () => {
    for (const [width, height] of [[1536, 707], [960, 540], [390, 844], [844, 390]]) {
        const camera = new THREE.PerspectiveCamera(58, width / height, .1, 30000);
        camera.position.set(0, 5, 15);
        camera.lookAt(0, 0, -100);
        camera.updateMatrixWorld(true);
        for (const pitch of [-.8, 0, .8])
            for (const yaw of [-1, 0, 1, Math.PI])
                for (const roll of [-1.2, 0, 1.2]) {
                    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
                    const origin = new THREE.Vector3(1, -.3, -4).applyQuaternion(q);
                    const direction = new THREE.Vector3(.03, .01, -1).normalize().applyQuaternion(q);
                    const point = origin.clone().addScaledVector(direction, 1200);
                    const clip = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
                    const projected = combatAimProjection(clip.x, clip.y, clip.w, width, height, { x: 0, y: 0, edge: false, angle: 0 });
                    assert.ok([projected.x, projected.y, projected.angle].every(Number.isFinite));
                    assert.ok(projected.x >= 0 && projected.x <= width && projected.y >= 0 && projected.y <= height);
                    if (!projected.edge) {
                        const ray = new THREE.Vector3(projected.x / width * 2 - 1, 1 - projected.y / height * 2, .5).unproject(camera).sub(camera.position).normalize();
                        assert.ok(ray.angleTo(point.clone().sub(camera.position)) < 1e-6);
                    }
                    const emitted = direction.clone();
                    q.setFromEuler(new THREE.Euler(.6, -1, .9, 'YXZ'));
                    assert.deepEqual(direction, emitted, 'later orientation cannot alter an emitted direction');
                }
        for (const invalid of [[NaN, Infinity, 0], [0, 0, -1], [1, 1, .0000001]]) {
            const p = combatAimProjection(invalid[0]!, invalid[1]!, invalid[2]!, width, height, { x: 0, y: 0, edge: false, angle: 0 });
            assert.equal(p.edge, true);
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        }
    }
});
test('continuous collision returns earliest physical impact and detects fast crossing targets', () => {
    const start = { x: 0, y: 0, z: 0 }, end = { x: 100, y: 0, z: 0 };
    assert.equal(projectileImpactFraction(start, end, { x: 60, y: 0, z: 0 }, zero, .05, 10), .5);
    const moving = projectileImpactFraction(start, end, { x: 50, y: 50, z: 0 }, { x: 0, y: 2000, z: 0 }, .05, 2);
    assert.ok(moving !== null && moving < .5);
    assert.equal(projectileImpactFraction(start, end, { x: 50, y: 10, z: 0 }, zero, .05, 2), null);
    assert.equal(projectileImpactFraction(start, end, start, zero, .05, 2), 0);
});
test('bounded dense targeting/interception workload records timing without a hardware-dependent pass threshold', t => {
    const state: CombatSelection = { challengerSince: 0, lastAlignedAt: 0 };
    const candidates = Array.from({ length: 20 }, (_, i) => ({ id: String(i), angle: .02 + i * .01, distance: 800, aligned: true }));
    const start = performance.now();
    for (let n = 0; n < 10000; n++) {
        selectCombatTarget(state, candidates, n * 100);
        combatIntercept(zero, zero, { x: 30, y: 2, z: -800 }, { x: 100, y: 0, z: 0 });
    }
    t.diagnostic(`20 candidates + intercept: ${((performance.now() - start) / 10000).toFixed(4)} ms/update`);
});

test('red lock requires angular acquisition, feasible travel range and forward acquisition', () => {
    assert.equal(combatLockReady({x:0,y:0,z:-4499}, {x:0,y:0}), true);
    assert.equal(combatLockReady({x:0,y:0,z:-4501}, {x:0,y:0}), false);
    assert.equal(combatLockReady({x:400,y:0,z:-4400}, {x:0,y:0}), false, 'targets outside the lock cone cannot turn red');
    assert.equal(combatLockReady({x:100,y:0,z:-4400}, {x:100/4400,y:0}), true);
    assert.equal(combatLockReady({x:200,y:0,z:-730}, {x:200/730,y:0}), true);
    assert.equal(combatLockReady({x:0,y:0,z:730}, {x:0,y:0}), false);
    assert.equal(combatLockReady({x:0,y:0,z:-730}, {x:NaN,y:0}), false);
    assert.equal(combatIntercept(zero,zero,{x:0,y:0,z:-4400},{x:0,y:0,z:-100}), null, 'inside current distance does not guarantee an intercept inside bullet travel');
});

test('automatic acquisition converges on the nearby off-centre target without a second manual aiming action', () => {
    const point = {x:55,y:8,z:-730};
    const goal = {x:0,y:0}, aim = {x:0,y:0};
    assert.equal(assistedInterceptAim(point,goal),true);
    assert.equal(combatLockReady(point,aim),false);
    for(let frame=0;frame<180;frame++) stepAim(aim,goal,1/60,AIM_ENVELOPE);
    assert.equal(combatLockReady(point,aim),true);
});

test('approaching targets keep the same angular lock rule through close range', () => {
    for (const distance of [4400,2300,900,300,100,25]) {
        const angle=.04, point={x:Math.sin(angle)*distance,y:0,z:-Math.cos(angle)*distance};
        assert.equal(combatLockReady(point,{x:0,y:0}),true,`in-cone target at ${distance}`);
        assert.equal(combatLockReady({x:Math.sin(.08)*distance,y:0,z:-Math.cos(.08)*distance},{x:0,y:0}),false);
    }
    assert.equal(combatLockReady({x:0,y:0,z:25},{x:0,y:0}),false,'passing behind clears a real lost lock');
    assert.equal(combatLockReady({x:0,y:0,z:-4501},{x:0,y:0}),false,'range remains enforced');
});

test('lead crossing the travel boundary cannot reverse the aim toward centre', () => {
    const inside={x:0,y:0},outside={x:0,y:0};
    assistedInterceptAim({x:Math.tan(AIM_ENVELOPE-.001),y:0,z:-1},inside);
    assistedInterceptAim({x:Math.tan(AIM_ENVELOPE+.001),y:0,z:-1},outside);
    assert.ok(outside.x>=inside.x && outside.x-inside.x<.003);
    assert.equal(outside.y,0);
});

test('automatic aim keeps its world direction through player bank, pitch and turn', () => {
    for (const from of [{x:0,y:0,z:0},{x:.1,y:.2,z:.6},{x:-.1,y:-.2,z:-.6}]) {
        const aim={x:.06,y:.03};
        const world=new THREE.Vector3(aim.x,aim.y,-1).normalize().applyEuler(new THREE.Euler(from.x,from.y,from.z,'YXZ'));
        for (const to of [{x:from.x+.06,y:from.y+.1,z:from.z+.5},{x:from.x-.06,y:from.y-.1,z:from.z-.5}]) {
            const corrected=rebaseCombatAim(aim,from,to,{x:0,y:0});
            const actual=new THREE.Vector3(corrected.x,corrected.y,-1).normalize().applyEuler(new THREE.Euler(to.x,to.y,to.z,'YXZ'));
            assert.ok(actual.angleTo(world)<1e-6,'bank/turn cannot drag a saved automatic firing vector');
            const old=new THREE.Vector3(aim.x,aim.y,-1).normalize().applyEuler(new THREE.Euler(to.x,to.y,to.z,'YXZ'));
            assert.ok(old.angleTo(world)>.06,'old aircraft-local reuse reproduces loss of lock');
        }
    }
    const manual={x:.1,y:.02};
    assert.deepEqual(rebaseCombatAim(manual,undefined,{x:1,y:1,z:1},{x:0,y:0}),manual,'manual/no-target samples remain aircraft-relative');
    const clamped=rebaseCombatAim({x:0,y:0},{x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0});
    assert.ok(Math.atan(Math.hypot(clamped.x,clamped.y))<=AIM_ENVELOPE+1e-12);
});

 test('automatic selection cannot acquire or retain targets outside the small forward area', () => {
    const state: CombatSelection = {challengerSince:0,lastAlignedAt:0};
    const target = {id:'enemy',angle:SMART_ASSIST_CONE-.0001,distance:800,aligned:true};
    assert.equal(selectCombatTarget(state,[target],0)?.id,'enemy');
    target.angle=SMART_ASSIST_CONE+.0001;
    assert.equal(selectCombatTarget(state,[target],10),undefined,'leaving the area releases immediately, even during turn grace');
    assert.equal(state.targetId,undefined);
    assert.equal(selectCombatTarget(state,[target],20),undefined,'being in range cannot acquire a wide target');
    target.angle=SMART_ASSIST_CONE;
    assert.equal(selectCombatTarget(state,[target],30)?.id,'enemy','steering back into the boundary reacquires');
    target.angle=Number.NaN;
    assert.equal(selectCombatTarget(state,[target],40),undefined);
});
