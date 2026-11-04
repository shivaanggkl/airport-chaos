import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeciesRegistry, standardAbilities, difficulties, type Species, type Ability, type Vec } from './definitions.js';
import { TitanEncounter, intercept, type Target, type Environment, type Snapshot } from './engine.js';
import { titanLimbPose, titanTimeline } from '../../../shared/titan-pose.mjs';
function definition(tail = true): Species {
    return {
        id: tail ? 'tailed' : 'humanoid', model: 'test-only', lods: ['test-low'], scale: 1, height: 100, radius: 15, health: 1000,
        joints: Object.fromEntries(Object.entries({ body: { x: 0, y: 40, z: 0 }, head: { x: 0, y: 85, z: 0 }, mouth: { x: 0, y: 80, z: 15 }, 'hand-left': { x: -25, y: 40, z: 5 }, 'hand-right': { x: 25, y: 40, z: 5 }, 'foot-left': { x: -10, y: 0, z: 0 }, 'foot-right': { x: 10, y: 0, z: 0 }, ...(tail ? { tail: { x: 0, y: 30, z: -30 } } : {}) }).map(([key, position]) => [key, { bone: key, position, reach: 600, angularSpeed: 8 }])),
        animations: ['beam', 'ranged', 'strike', 'tail', 'smash', 'jump', 'charge', 'throw', 'clap', 'roar'],
        movement: { walk: 20, run: 50, acceleration: 10, deceleration: 20, turnRate: .5, turnAcceleration: .6, stepHeight: 5, stride: 40, jumpSpeed: 60, gravity: 60, chargeSpeed: 80, sidestep: true, independentAim: true },
        senses: { range: 5000, fov: Math.PI * 2 }, personality: 'balanced', level: 'LEGENDARY', abilities: standardAbilities.filter(a => tail || a.id !== 'tail-whip').map(a => ({ ...a })), regions: [{ id: 'body', joint: 'body', radius: 40, multiplier: 1, stagger: 100 }, { id: 'head', joint: 'head', radius: 15, multiplier: 2, stagger: 50 }], arena: { minWidth: 1000, maxSlope: .5 }
    };
}
function world(): Environment { return { bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 }, ground: () => 0, traversable: () => true, lineOfSight: () => true, obstruction: () => null, takeDebris: (_id, p) => ({ id: 'rock', position: { ...p }, radius: 10 }) }; }
function target(id = 'e', position: Vec = { x: 0, y: 80, z: 500 }): Target { return { id: 'pilot', encounterId: id, authorized: true, alive: true, position, velocity: { x: 0, y: 0, z: 0 }, radius: 10 }; }
function engine(s = definition(), env = world(), id = 'e') { return new TitanEncounter(id, new SpeciesRegistry().register(s), { x: 0, y: 0, z: 0 }, env); }
function run(e: TitanEncounter, t: Target, seconds: number) {
    const samples: Snapshot[] = [];
    for (let i = 0; i < seconds * 20; i++)
        samples.push(e.step(.05, [t]));
    return samples;
}
test('registry owns immutable copies, optional anatomy, rejects missing capabilities and invalid geometry', () => {
    const s = definition(), r = new SpeciesRegistry(), a = r.register(s);
    s.joints.body.position.x = 999;
    assert.equal(a.joints.body.position.x, 0);
    assert(Object.isFrozen(a.joints.body.position));
    assert.throws(() => r.register(s));
    assert.equal(new SpeciesRegistry().register(definition(false)).abilities.length, 9);
    const missing = definition(false);
    missing.abilities = standardAbilities;
    assert.throws(() => new SpeciesRegistry().register(missing));
    for (const bad of [NaN, -1]) {
        const d = definition();
        d.abilities = [{ ...standardAbilities[0], active: bad }];
        assert.throws(() => new SpeciesRegistry().register(d));
    }
});
test('five monster difficulty profiles retain independent physical envelopes and reaction times', () => {
    const expected = [[900, 3, 1], [600, 6, 2], [350, 10, 3], [200, 14, 3], [120, 18, 4]];
    Object.entries(difficulties).forEach(([level, p], i) => { assert.deepEqual([p.reaction * 1000, p.memory, p.combo], expected[i]); const s = definition(); s.level = level as Species['level']; const e = engine(s), samples = run(e, target(), 1.5); const start = samples.find(v => v.ability); assert(start); assert(start.time >= p.reaction); assert(samples.every(v => Math.hypot(v.velocity.x, v.velocity.z) <= s.movement.run + 1e-6)); });
});
test('ballistic interception leads moving targets and rejects unreachable solutions', () => { const p = intercept({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 500 }, { x: 100, y: 0, z: 0 }, 500, 4)!; assert(p.x > 100); assert.equal(intercept({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 900 }, 500, 4), null); });
test('all ten mechanisms execute real stages and physical damage', () => {
    for (const original of standardAbilities) {
        const s = definition();
        s.movement.run = .01;
        s.movement.walk = .01;
        s.movement.turnRate = .00001;
        s.abilities = [{ ...original, cooldown: 1 }];
        let position: Vec = { x: 0, y: 80, z: 300 };
        if (original.mechanism === 'sweep')
            position = titanLimbPose({ x: 0, y: 0, z: 0 }, 0, s.joints[original.requires[0]].position, original, .5);
        if (original.mechanism === 'area' || original.mechanism === 'leap')
            position = { x: 0, y: 30, z: 100 };
        if (original.mechanism === 'charge')
            position = { x: 0, y: 35, z: 70 };
        const e = engine(s), samples = run(e, target('e', position), 9), events = samples.flatMap(v => v.events), stages = new Set(events.filter(v => v.kind === 'animation').map(v => v.stage));
        for (const stage of ['SELECT', 'WARNING', 'WINDUP', 'ACTIVE', 'RECOVERY', 'COOLDOWN'])
            assert(stages.has(stage), `${original.id}: ${stage}`);
        assert(events.some(v => v.kind === 'damage' && v.amount === 25), `${original.id} causes physical damage`);
    }
});
test('moving target evades a warned non-homing shot and projectiles respect occlusion', () => {
    const s = definition();
    s.abilities = [{ ...standardAbilities[1], count: 1 }];
    const e = engine(s), t = target();
    let hit = false;
    let released = false;
    for (let i = 0; i < 70; i++) {
        if (released) {
            t.position.x += 40;
            t.velocity.x = 800;
        }
        const state = e.step(.05, [t]);
        released ||= state.projectiles.length > 0;
        hit ||= state.events.some(v => v.kind === 'damage');
    }
    assert.equal(hit, false);
    const env = world();
    env.obstruction = () => 0;
    const blocked = engine(s, env);
    assert(!run(blocked, target(), 6).some(v => v.events.some(e => e.kind === 'damage')));
});
test('stable movement obeys acceleration, turn rate, terrain and boundaries', () => {
    const s = definition();
    s.abilities = [];
    const e = engine(s), t = target('e', { x: 1500, y: 80, z: 1500 }), samples = run(e, t, 20);
    let previous = samples[0];
    for (const v of samples.slice(1)) {
        assert(Math.abs(Math.atan2(Math.sin(v.yaw - previous.yaw), Math.cos(v.yaw - previous.yaw))) <= s.movement.turnRate * .05 + 1e-6);
        assert(Math.hypot(v.velocity.x, v.velocity.z) <= s.movement.run + 1e-6);
        assert.equal(v.position.y, 0);
        assert(Math.hypot(v.position.x - previous.position.x, v.position.z - previous.position.z) <= s.movement.run * .05 + 1e-6);
        previous = v;
    }
    assert(distance(samples[0].position, samples.at(-1)!.position) > 100);
});
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
test('one activation cannot duplicate beam, sweep or area damage', () => {
    for (const id of ['energy-beam', 'hand-strike', 'ground-smash']) {
        const s = definition();
        const a = standardAbilities.find(a => a.id === id)!;
        s.abilities = [{ ...a, cooldown: 60 }];
        const pos = id === 'hand-strike' ? titanLimbPose({ x: 0, y: 0, z: 0 }, 0, s.joints['hand-left'].position, a, .5) : { x: 0, y: 40, z: 100 };
        const damage = run(engine(s), target('e', pos), 7).flatMap(v => v.events).filter(v => v.kind === 'damage');
        assert.equal(damage.length, 1, id);
    }
});
test('server region damage, interruption and receipts are idempotent and encounter-bound', () => { const e = engine(); const hit = { encounterId: 'e', source: 'pilot', sequence: 1, delta: 0, from: { x: 0, y: 85, z: 100 }, to: { x: 0, y: 85, z: -100 }, amount: 25, radius: 1 }; assert.equal(e.damage(hit), 50); assert.equal(e.damage(hit), 0); assert.equal(e.damage({ ...hit, sequence: 2, encounterId: 'other' }), 0); assert.equal(e.snapshot().health, 950); });
test('encounters are deterministic, isolated and cleanly reset/dispose', () => {
    const a = engine(), b = engine();
    assert.deepEqual(run(a, target(), 10), run(b, target(), 10));
    const c = engine(definition(), world(), 'other');
    assert(run(c, target(), 3).every(v => !v.events.some(e => e.kind === 'damage')));
    a.reset();
    assert.equal(a.snapshot().health, 1000);
    assert.equal(a.snapshot().ability, null);
    assert.equal(a.snapshot().projectiles.length, 0);
    assert.equal(a.snapshot().position.x, 0);
    a.dispose();
    assert.throws(() => a.step(.05, [target()]));
    assert.throws(() => b.step(1, [target()]));
});
test('shared timelines are normalized and limb pose matches authoritative collision anchors', () => {
    assert.deepEqual(titanTimeline(standardAbilities[0], .35), { stage: 'WARNING', progress: .5 });
    const s = definition();
    s.abilities = [standardAbilities[2]];
    const samples = run(engine(s), target('e', { x: 0, y: 40, z: 350 }), 3);
    for (const v of samples) {
        if (v.ability?.stage === 'ACTIVE') {
            const p = titanLimbPose(v.position, v.yaw, s.joints['hand-left'].position, standardAbilities[2], v.ability.progress);
            assert(distance(p, v.limbs['hand-left']) < 1e-5);
        }
    }
});
test('distance, altitude, velocity and real projectile threats change tactical utility', () => {
    const decide = (position: Vec, velocity: Vec = { x: 0, y: 0, z: 0 }, threat = false) => {
        const s = definition();
        s.abilities = [];
        const e = engine(s), t = target('e', position);
        t.velocity = velocity;
        let last = e.snapshot();
        for (let i = 0; i < 30; i++)
            last = e.step(.05, [t], threat ? [{ id: 'incoming', encounterId: 'e', position: { x: 0, y: 40, z: 1000 }, velocity: { x: 0, y: 0, z: -500 }, radius: 20 }] : []);
        return last.tactic;
    };
    assert.equal(decide({ x: 0, y: 80, z: 2000 }, { x: 100, y: 0, z: 0 }), 'intercept');
    assert.equal(decide({ x: 0, y: 500, z: 300 }), 'control-space');
    assert.equal(decide({ x: 0, y: 40, z: 300 }, { x: 0, y: 0, z: 0 }, true), 'defend');
});
test('repeated observed circling adapts bounded tactical memory, reset forgets behavior', () => {
    const s = definition();
    s.abilities = [];
    const e = engine(s), t = target('e', { x: 0, y: 40, z: 200 });
    const tactics = new Set<string>();
    for (let i = 0; i < 240; i++) {
        const a = i * .05;
        t.position = { x: Math.sin(a) * 200, y: 40, z: Math.cos(a) * 200 };
        t.velocity = { x: Math.cos(a) * 200, y: 0, z: -Math.sin(a) * 200 };
        tactics.add(e.step(.05, [t]).tactic);
    }
    assert(tactics.has('reposition'));
    e.reset();
    assert.equal(e.snapshot().tactic, 'hunt');
});
test('blocked path replans locally around a finite obstacle rather than remaining stuck', () => {
    const env = world();
    env.traversable = (from, to, r) => {
        const minX = -60 - r, maxX = 60 + r, minZ = 150 - r, maxZ = 300 + r;
        let lo = 0, hi = 1;
        for (const [v, d, min, max] of [[from.x, to.x - from.x, minX, maxX], [from.z, to.z - from.z, minZ, maxZ]]) {
            if (Math.abs(d) < 1e-8) {
                if (v < min || v > max)
                    return true;
            }
            else {
                let a = (min - v) / d, b = (max - v) / d;
                if (a > b)
                    [a, b] = [b, a];
                lo = Math.max(lo, a);
                hi = Math.min(hi, b);
                if (lo > hi)
                    return true;
            }
        }
        return false;
    };
    const s = definition();
    s.abilities = [];
    const samples = run(engine(s, env), target('e', { x: 0, y: 80, z: 1400 }), 50);
    assert(samples.at(-1)!.position.z > 400, JSON.stringify(samples.at(-1)!.position));
    assert(samples.every(v => !(Math.abs(v.position.x) < 75 && v.position.z > 135 && v.position.z < 315)));
});
test('leap moves physically through the air and lands before impact; charge respects obstacles', () => {
    const s = definition();
    s.abilities = [{ ...standardAbilities[5], cooldown: 60 }];
    const samples = run(engine(s), target('e', { x: 0, y: 30, z: 100 }), 6);
    assert(samples.some(v => v.position.y > 20));
    assert(samples.some(v => v.position.z > 40));
    const impact = samples.find(v => v.events.some(e => e.kind === 'damage'));
    assert(impact);
    assert.equal(impact.position.y, 0);
    const env = world();
    env.traversable = (_a, b) => b.z < 60;
    s.abilities = [{ ...standardAbilities[6], cooldown: 60 }];
    const charge = run(engine(s, env), target('e', { x: 0, y: 35, z: 500 }), 8);
    assert(charge.every(v => v.position.z < 60));
});
test('combo planner respects difficulty depth, geometry, incompatible stages and recovery', () => {
    const s = definition();
    s.level = 'MEDIUM';
    s.abilities = standardAbilities.filter(a => ['energy-beam', 'fireball-barrage', 'roaring-shockwave'].includes(a.id)).map(a => ({ ...a, cooldown: 8 }));
    const samples = run(engine(s), target('e', { x: 0, y: 40, z: 300 }), 20);
    assert(new Set(samples.flatMap(v => v.ability ? [v.ability.id] : [])).size >= 2);
    assert(samples.every(v => !v.ability || v.ability.comboDepth <= 2));
    const events = samples.flatMap(v => v.events).filter(v => v.kind === 'animation' && v.stage);
    let previous: string | undefined;
    let recovered = true;
    for (const event of events) {
        if (event.stage === 'SELECT') {
            assert(recovered);
            previous = event.attackId;
            recovered = false;
        }
        if (event.stage === 'COOLDOWN') {
            assert.equal(event.attackId, previous);
            recovered = true;
        }
    }
});
test('unauthorized, occluded and cross-encounter observations never start attacks', () => {
    for (const mode of ['unauthorized', 'occluded', 'other']) {
        const env = world();
        if (mode === 'occluded')
            env.lineOfSight = () => false;
        const e = engine(definition(), env), t = target(mode === 'other' ? 'foreign' : 'e');
        if (mode === 'unauthorized')
            t.authorized = false;
        assert(run(e, t, 4).every(v => v.ability === null && v.events.every(e => e.kind !== 'damage')));
    }
});
test('reversible environment lifecycle and sequence receipts remain bounded without replaying misses', () => {
    let resets = 0;
    const env = world();
    env.reset = () => resets++;
    const e = engine(definition(), env);
    const miss = { encounterId: 'e', source: 'pilot', sequence: 1, delta: .05, from: { x: 500, y: 40, z: 0 }, to: { x: 500, y: 40, z: 100 }, amount: 25, radius: 1 };
    assert.equal(e.damage(miss), 0);
    assert.equal(e.damage({ ...miss, from: { x: 0, y: 40, z: 100 }, to: { x: 0, y: 40, z: -100 } }), 0);
    e.reset();
    e.dispose();
    assert.equal(resets, 2);
});
test('bounded runtime cost and detached snapshots under sustained headless simulation', t => {
    const env = world();
    let queries = 0;
    env.traversable = () => { queries++; return true; };
    const e = engine(definition(), env), pilot = target();
    const started = performance.now();
    let maxShots = 0, maxEvents = 0;
    for (let i = 0; i < 1000; i++) {
        const s = e.step(.05, [pilot]);
        maxShots = Math.max(maxShots, s.projectiles.length);
        maxEvents = Math.max(maxEvents, s.events.length);
        s.position.x = 1e9;
        assert.notEqual(e.snapshot().position.x, 1e9);
    }
    const elapsed = performance.now() - started;
    assert(maxShots <= 32);
    assert(maxEvents <= 128);
    assert(queries < 1000 * 12);
    t.diagnostic(`1000 steps / 50 simulated seconds: ${elapsed.toFixed(1)} ms CPU wall time, ${queries} indexed movement queries, ${maxShots} peak shots`);
});
test('limb limits and required root capabilities are enforced at registration', () => {
    const noBody = definition();
    delete (noBody.joints as Record<string, unknown>).body;
    assert.throws(() => new SpeciesRegistry().register(noBody));
    const tooFast = definition();
    tooFast.abilities = [{ ...standardAbilities[2], active: .001 }];
    assert.throws(() => new SpeciesRegistry().register(tooFast));
    const s = definition();
    s.abilities = [];
    const e = engine(s), t = target();
    t.position.x = NaN;
    assert.throws(() => e.step(.05, [t]));
});
test('damage reactions survive the host interval until the next simulation snapshot', () => {
    const e = engine(), hit = { encounterId: 'e', source: 'pilot', sequence: 1, delta: 0, from: { x: 0, y: 40, z: 100 }, to: { x: 0, y: 40, z: -100 }, amount: 25, radius: 1 };
    assert.equal(e.damage(hit), 25);
    assert(e.step(.05, []).events.some(v => v.type === 'hit'));
    assert(!e.step(.05, []).events.some(v => v.type === 'hit'));
    assert.equal(e.damage({ ...hit, sequence: 2, amount: 5000 }), 975);
    const end = e.step(.05, []);
    assert.equal(end.locomotion, 'defeat');
    assert(end.events.some(v => v.type === 'defeat'));
});
test('ballistic barrage produces real continuous hits on a straight moving player', () => {
    const s = definition();
    s.abilities = [{ ...standardAbilities[1], count: 1, cooldown: 60 }];
    s.personality = 'aggressive';
    const e = engine(s), t = target();
    t.velocity = { x: 70, y: 0, z: 0 };
    let damage = 0;
    for (let i = 0; i < 100; i++) {
        t.position.x += t.velocity.x * .05;
        damage += e.step(.05, [t]).events.filter(v => v.kind === 'damage').reduce((n, v) => n + (v.amount ?? 0), 0);
    }
    assert.equal(damage, 25);
});
