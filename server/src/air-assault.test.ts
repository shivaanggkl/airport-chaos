import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AirAssaultEncounter, AirAssaultRewards, incomingAssaultThreat, type AssaultPilot } from './air-assault.js';
import { PlayerProfileStore } from './player-profiles.js';
import { airAssaultManifest, airAssaultTiers, airAssaultRules, airAssaultAirports, airAssaultQueuePosition, airAssaultHearts } from '../../shared/air-assault.mjs';
const now = Date.UTC(2026, 10, 1, 12);
function rig() {
  const pilot: AssaultPilot = { position: { x: -22800, y: 600, z: -13600 }, velocity: { x: 0, y: 0, z: -200 }, rotation: { x: 0, y: 0, z: 0 }, health: 200, maxHealth: 200, airborne: true, fresh: true };
  const shots: Array<{
    id: string;
    at: number;
  }> = [];
  let at = now, heals = 0;
  const encounter = new AirAssaultEncounter('dallas', 'pilot', { elevation: () => 100, activate() { }, move() { }, remove() { }, bullets: () => [], fire: e => { shots.push({ id: e.id, at }); return true; }, heal() { heals++; pilot.health = 200; }, finish: () => ({ reward: 0, dailyClaimed: false }) }, now);
  const tick = (t: number) => { at = t; encounter.tick(pilot, t); };
  const start = () => { encounter.ready(now); encounter.skip(now + 1000); tick(now + 4000); encounter.takeoff(now + 4100, 'dfw'); };
  return { encounter, pilot, tick, start, shots, heals: () => heals };
}
test('30-enemy manifest has exact tiers, airport quotas, sequence and nonoverlapping runway queues', () => {
  const rows = airAssaultManifest();
  assert.equal(rows.length, 30);
  assert.deepEqual(rows.map(e => e.tier), [...Array(15).fill('medium'), ...Array(10).fill('hard'), ...Array(5).fill('legendary')]);
  for (const [id, quota] of [['love', [5, 3, 2]], ['addison', [5, 4, 1]], ['executive', [5, 3, 2]]] as const) {
    assert.deepEqual(['medium', 'hard', 'legendary'].map(t => rows.filter(e => e.airportId === id && e.tier === t).length), quota);
    const airport = airAssaultAirports.find(a => a.id === id)!;
    const queue = rows.filter(e => e.airportId === id).map(e => airAssaultQueuePosition(id, e.ordinal, 100));
    for (let i = 0; i < queue.length; i++) {
      assert.ok(Math.abs(queue[i]!.z - airport.z) < airport.runwayLength / 2);
      for (let j = i + 1; j < queue.length; j++)
        assert.ok(Math.hypot(queue[i]!.x - queue[j]!.x, queue[i]!.z - queue[j]!.z) >= 65);
    }
  }
  assert.deepEqual(Object.values(airAssaultTiers).map(t => [t.health, t.reactionMs, t.trackingMs, t.fireMs, t.dispersion]), [[100, 600, 1200, 600, .030], [150, 400, 800, 400, .016], [200, 200, 400, 200, .008]]);
});
test('Intro/countdown freeze combat and timer; skip has one-second gate; only DFW takeoff starts eight minutes', () => {
  const { encounter: e, pilot, tick } = rig();
  e.ready(now);
  e.skip(now + 999);
  assert.equal(e.phase, 'intro');
  pilot.fresh = false;
  e.skip(now + 1000);
  tick(now + 4000);
  assert.equal(e.phase, 'takeoff');
  assert.equal(e.startedAt, null);
  assert.equal(e.active().length, 0);
  e.takeoff(now + 4100, 'love');
  assert.equal(e.startedAt, null);
  e.takeoff(now + 4200, 'dfw');
  assert.equal(e.deadlineAt, now + 4200 + 480000);
  e.ready(now + 6000);
  e.skip(now + 6000);
  assert.equal(e.phase, 'active');
});
test('All waves launch from ground, never exceed four active or one Legendary, and count each kill once', () => {
  const { encounter: e, start, tick } = rig();
  start();
  let time = now + 4100, seen = 0;
  for (let i = 0; i < 10000 && e.phase !== 'finished'; i++) {
    time += 50;
    tick(time);
    assert.ok(e.active().length <= 4);
    assert.ok(e.active().filter(n => n.tier === 'legendary').length <= 1);
    for (const enemy of e.active())
      if (enemy.phase === 'combat') {
        const prior = e.destroyed;
        e.defeated(enemy.id, time);
        e.defeated(enemy.id, time);
        assert.equal(e.destroyed, prior + 1);
        seen++;
      }
  }
  assert.equal(seen, 30);
  assert.equal(e.result, 'full');
});
test('Enemies accelerate continuously from runway and respect ground/aircraft movement limits', () => {
  const { encounter: e, start, tick } = rig();
  start();
  tick(now + 4150);
  const first = e.active()[0]!;
  const ground = airAssaultQueuePosition(first.airportId, first.ordinal, 100);
  assert.ok(Math.abs(first.position.y - ground.y) < .001);
  let previous = { ...first.position };
  for (let t = now + 4200; t < now + 20000; t += 50) {
    tick(t);
    assert.ok(Math.hypot(first.position.x - previous.x, first.position.y - previous.y, first.position.z - previous.z) < 55);
    previous = { ...first.position };
  }
  assert.equal(first.phase, 'combat');
  assert.ok(first.position.y > 180);
});
test('Legendary incoming awareness uses closest relative bullet approach and excludes missed/receding shots', () => {
  const enemy = { position: { x: 0, y: 300, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  assert.ok(incomingAssaultThreat(enemy, [{ position: { x: 0, y: 300, z: 1000 }, direction: { x: 0, y: 0, z: -1 }, speed: 1500 }]));
  assert.equal(incomingAssaultThreat(enemy, [{ position: { x: 500, y: 300, z: 1000 }, direction: { x: 0, y: 0, z: -1 }, speed: 1500 }]), undefined);
  assert.equal(incomingAssaultThreat(enemy, [{ position: { x: 0, y: 300, z: 1000 }, direction: { x: 0, y: 0, z: 1 }, speed: 1500 }]), undefined);
});
test('Hearts require airborne physical travel, fully heal and retain per-heart cooldown', () => {
  const r = rig();
  r.start();
  r.pilot.health = 20;
  const h = airAssaultHearts[0]!;
  r.pilot.position = { x: h.x - 200, y: h.y, z: h.z };
  r.tick(now + 4200);
  r.pilot.airborne = false;
  r.pilot.position.x = h.x;
  r.tick(now + 4300);
  assert.equal(r.heals(), 0);
  r.pilot.airborne = true;
  r.tick(now + 4400);
  assert.equal(r.heals(), 0, 'standing still cannot collect');
  r.pilot.position.x = h.x + 10;
  r.tick(now + 4500);
  assert.equal(r.heals(), 1);
  assert.equal(r.pilot.health, 200);
  r.pilot.health = 10;
  r.pilot.position.x = h.x + 20;
  r.tick(now + 4600);
  assert.equal(r.heals(), 1);
  assert.equal(r.pilot.health, 10);
  r.pilot.position.x = h.x + 30;
  r.tick(now + 65000);
  assert.equal(r.heals(), 2);
});
test('Survival requires airborne/fresh pilot; boundary has exactly ten seconds; destroyed/disconnect never reward', () => {
  for (const airborne of [true, false]) {
    const r = rig();
    r.start();
    r.pilot.airborne = airborne;
    r.tick(r.encounter.deadlineAt!);
    assert.equal(r.encounter.result, airborne ? 'survival' : 'grounded');
  }
  const boundary = rig();
  boundary.start();
  boundary.pilot.position.x = 50001;
  boundary.tick(now + 5000);
  assert.equal(boundary.encounter.phase, 'active');
  boundary.tick(now + 14999);
  assert.equal(boundary.encounter.phase, 'active');
  boundary.tick(now + 15000);
  assert.equal(boundary.encounter.result, 'boundary');
  const dead = rig();
  dead.start();
  dead.pilot.health = 0;
  dead.tick(now + 5000);
  assert.equal(dead.encounter.result, 'destroyed');
  const stale = rig();
  stale.start();
  stale.pilot.fresh = false;
  stale.tick(stale.encounter.deadlineAt!);
  assert.equal(stale.encounter.result, 'disconnected');
  const disconnect = rig();
  disconnect.start();
  disconnect.encounter.disconnectedAt = now + 5000;
  disconnect.tick(now + 34999);
  assert.equal(disconnect.encounter.phase, 'active');
  disconnect.tick(now + 35000);
  assert.equal(disconnect.encounter.result, 'disconnected');
});
test('Kills at/after deadline cannot overtake survival; final valid kill before deadline wins', () => {
  const r = rig();
  r.start();
  r.tick(now + 4200);
  const id = r.encounter.active()[0]!.id;
  r.encounter.defeated(id, r.encounter.deadlineAt!);
  assert.equal(r.encounter.destroyed, 0);
  r.tick(r.encounter.deadlineAt!);
  assert.equal(r.encounter.result, 'survival');
});
test('Daily victory ledger is durable, atomic, cross-result idempotent and UTC-day scoped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'assault-rewards-')), path = join(dir, 'profiles.sqlite');
  try {
    const profiles = new PlayerProfileStore(path);
    profiles.getOrCreate('pilot', 'Pilot');
    let rewards = new AirAssaultRewards(path);
    const before = profiles.getOrCreate('pilot', 'Pilot').credits;
    assert.equal(rewards.settle('pilot', 'unstarted', null, 'full', now).reward, 0);
    assert.equal(rewards.settle('pilot', 'lost', now - 1000, 'destroyed', now).reward, 0);
    assert.equal(rewards.settle('pilot', 'first', now - 1000, 'survival', now).reward, 250);
    assert.deepEqual(rewards.settle('pilot', 'second', now - 1000, 'full', now), { reward: 0, dailyClaimed: true });
    rewards.close();
    rewards = new AirAssaultRewards(path);
    assert.equal(rewards.settle('pilot', 'restart', now - 1000, 'full', now).reward, 0);
    assert.equal(rewards.settle('pilot', 'tomorrow', now, 'full', now + 86400000).reward, 600);
    rewards.close();
    assert.equal(profiles.getOrCreate('pilot', 'Pilot').credits, before + 850);
  }
  finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('Legendary dodge decisions change physical trajectory, respect 1.2-second cooldown and never teleport', () => {
  let at = now;
  let bullets: Array<{
    position: {
      x: number;
      y: number;
      z: number;
    };
    direction: {
      x: number;
      y: number;
      z: number;
    };
    speed: number;
  }> = [];
  const e = new AirAssaultEncounter('dallas', 'pilot', { elevation: () => 100, activate() { }, move() { }, remove() { }, bullets: () => bullets, fire: () => false, heal() { }, finish: () => ({ reward: 0, dailyClaimed: false }) }, now);
  const pilot: AssaultPilot = { position: { x: 0, y: 600, z: -2000 }, velocity: { x: 0, y: 0, z: -150 }, rotation: { x: 0, y: 0, z: 0 }, health: 200, maxHealth: 200, airborne: true, fresh: true };
  e.ready(now);
  e.skip(now + 1000);
  e.tick(pilot, now + 4000);
  e.takeoff(now + 4100, 'dfw');
  // Controlled late-wave state exercises the actual movement method, not a fake hit callback.
  const legend = e.enemies.find(n => n.tier === 'legendary')!;
  for (const enemy of e.enemies)
    enemy.phase = 'destroyed';
  legend.phase = 'combat';
  legend.health = 200;
  legend.position = { x: 0, y: 600, z: 0 };
  legend.velocity = { x: 0, y: 0, z: -150 };
  legend.speed = 150;
  legend.readyAt = now;
  legend.rotation = { x: 0, y: 0, z: 0 };
  legend.previous = { ...legend.position };
  legend.movedAt = now + 4100;
  bullets = [{ position: { x: 0, y: 600, z: 900 }, direction: { x: 0, y: 0, z: -1 }, speed: 1500 }];
  e.tick(pilot, now + 4150);
  const decision = legend.dodgeAt, origin = { ...legend.position };
  let peakBank = Math.abs(legend.rotation.z);
  assert.equal(decision, now + 4150);
  for (at = now + 4200; at < now + 5300; at += 50) {
    const before = { ...legend.position };
    e.tick(pilot, at);
    peakBank = Math.max(peakBank, Math.abs(legend.rotation.z));
    assert.ok(Math.hypot(legend.position.x - before.x, legend.position.y - before.y, legend.position.z - before.z) < 40);
    assert.equal(legend.dodgeAt, decision);
  }
  assert.ok(Math.abs(legend.position.x - origin.x) > 20, 'dodge physically moves laterally');
  assert.ok(peakBank > .1, 'dodge banks during its turn rather than moving sideways instantly');
});
test('Encounter termination removes every active actor and leaves no active wave',()=>{
  const removed:string[]=[];
  const r=rig();r.start();r.tick(now+4200);r.tick(now+5250);
  const ids=r.encounter.active().map(e=>e.id);assert.ok(ids.length>0);
  const e=new AirAssaultEncounter('dallas','cleanup',{elevation:()=>100,activate(){},move(){},remove:id=>removed.push(id),bullets:()=>[],fire:()=>false,heal(){},finish:()=>({reward:0,dailyClaimed:false})},now);
  e.ready(now);e.skip(now+1000);e.tick(r.pilot,now+4000);e.takeoff(now+4100,'dfw');e.tick(r.pilot,now+4200);
  const active=e.active().map(n=>n.id);e.end('exit',now+4300);assert.deepEqual(removed,active);assert.equal(e.active().length,0);
  e.tick(r.pilot,now+5000);assert.equal(e.active().length,0);
});
