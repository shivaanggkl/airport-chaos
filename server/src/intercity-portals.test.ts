import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { portalForCity, sweptPortalCrossing, portalModeAllowed, portalExit, type PortalPose } from '../../shared/intercity-portals.mjs';
import { PortalTransitionStore } from './portal-transitions.js';
import { PlayerProfileStore } from './player-profiles.js';
const flat = () => 100;
const pose: PortalPose = { position: { x: 10000, y: 315, z: -20001 }, rotation: { x: .1, y: .2, z: .1 }, velocity: { x: -20, y: 3, z: -100 } };
test('swept crossing requires the opening, outward direction, and an actual plane crossing', () => {
    const g = portalForCity('dallas', flat)!;
    const a = { x: g.x, y: g.y, z: g.z + 500 }, b = { ...a, z: g.z - 500 };
    assert.ok(sweptPortalCrossing(g, a, b));
    assert.ok(!sweptPortalCrossing(g, b, a));
    assert.ok(!sweptPortalCrossing(g, { ...a, x: g.x + 190 }, { ...b, x: g.x + 190 }));
    assert.ok(!sweptPortalCrossing(g, a, { ...a, z: g.z + 1 }));
    assert.ok(!sweptPortalCrossing(g, { ...a, y: g.y + 190 }, { ...b, y: g.y + 190 }));
});
test('only unencumbered solo or public free flight is eligible', () => {
    for (const mode of ['missions', 'training', 'sky-duel', 'air-assault', ''])
        assert.equal(portalModeAllowed(mode), false);
    for (const mode of ['free-fly', 'solo-free-fly']) {
        assert.ok(portalModeAllowed(mode));
        assert.ok(!portalModeAllowed(mode, true));
        assert.ok(!portalModeAllowed(mode, false, true));
    }
});
test('exit preserves speed, attitude, heading offset and altitude above terrain', () => {
    const gate = portalForCity('milwaukee', flat)!;
    const exit = portalExit(gate, pose, pose, flat, false, 100);
    assert.ok(Math.abs(Math.hypot(...Object.values(exit.velocity)) - Math.hypot(...Object.values(pose.velocity))) < 1e-8);
    assert.ok(Math.abs(Math.sin(exit.rotation.y - pose.rotation.y)) < 1e-8);
    assert.equal(exit.rotation.x, pose.rotation.x);
    assert.equal(exit.rotation.z, pose.rotation.z);
    assert.equal(exit.position.y - 100, 215);
    assert.equal(exit.position.z, 2750);
    const back = portalExit(portalForCity('dallas', flat)!, pose, pose, flat, true, 100);
    assert.ok(Math.abs(Math.sin(back.rotation.y - pose.rotation.y - Math.PI)) < 1e-8);
});
test('durable session, lifecycle settlement, historical claims and repeat rewards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'portal-unit-')), path = join(dir, 'profiles.sqlite');
    const profiles = new PlayerProfileStore(path), transitions = new PortalTransitionStore(path), db = new DatabaseSync(path);
    try {
        profiles.getOrCreate('pilot', 'Pilot');
        const before = profiles.getOrCreate('pilot', 'Pilot').credits;
        let now = 100000;
        const make = () => transitions.approve('pilot', 'session', 'solo-free-fly', 'dallas', 'milwaukee', 'dallas-milwaukee', pose, 75, now, 100)!;
        let f = make();
        assert.ok(f);
        assert.equal(make(), undefined);
        assert.equal(transitions.get('pilot', 'forged'), undefined);
        assert.equal(profiles.startIntercityRoute('pilot', 'dallas-milwaukee', 'dallas').ok, false);
        assert.equal(profiles.completeIntercityArrival('pilot', 'milwaukee').completed, false);
        assert.throws(() => profiles.commitPortalArrival('pilot', f.routeId, f.id, JSON.stringify({ ...f, phase: 'COMMITTED' }), now));
        f.phase = 'DESTINATION_READY';
        f.ready = true;
        transitions.save(f);
        assert.throws(() => profiles.commitPortalArrival('pilot', f.routeId, f.id, JSON.stringify({ ...f, phase: 'COMMITTED' }), now + 6999));
        const json = JSON.stringify({ ...f, phase: 'COMMITTED' });
        assert.equal(profiles.commitPortalArrival('pilot', f.routeId, f.id, json, now + 7000), 250);
        assert.equal(profiles.commitPortalArrival('pilot', f.routeId, f.id, json, now + 7001), 250);
        assert.equal(profiles.getOrCreate('pilot', 'Pilot').credits, before + 250);
        f = transitions.get('pilot')!;
        f.phase = 'ARRIVED';
        transitions.save(f);
        now += 10000;
        f = make();
        f.phase = 'DESTINATION_READY';
        f.ready = true;
        transitions.save(f);
        assert.equal(profiles.commitPortalArrival('pilot', f.routeId, f.id, JSON.stringify({ ...f, phase: 'COMMITTED' }), now + 7000), 0);
        assert.equal(profiles.getOrCreate('pilot', 'Pilot').credits, before + 250);
        profiles.getOrCreate('historical', 'Pilot');
        db.prepare('INSERT INTO pilot_intercity_completions VALUES(?,?,?,?,?)').run('historical', 'milwaukee-dallas', 1, 2, 250);
        assert.ok(profiles.intercityRewardClaimed('historical', 'milwaukee-dallas'));
        transitions.clear('pilot', 'forged');
        assert.ok(transitions.get('pilot'));
        transitions.clear('pilot', 'session');
        transitions.save(f);
        assert.equal(transitions.get('pilot'), undefined, 'an old connection cannot resurrect an exited flight');
        now += 20000;
        const fresh = make();
        transitions.save(f);
        assert.equal(transitions.get('pilot')!.id, fresh.id, 'an old checkpoint cannot overwrite a new flight');
    }
    finally {
        transitions.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
