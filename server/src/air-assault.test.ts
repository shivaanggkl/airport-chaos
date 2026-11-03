import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AirAssaultEncounter, AirAssaultRewards, incomingAssaultThreat, assaultShotDirection, assaultApproachSpeed, assaultObservedTurn, type AssaultPilot } from './air-assault.js';
import { ballisticIntercept, ballisticShotSpeed } from '../../shared/protocol.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
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
  assert.deepEqual(Object.values(airAssaultTiers).map(t => [t.health, t.ai.reactionMs, t.ai.trackingMs, t.ai.shotIntervalMs, t.ai.aimError]), [[100, 600, 1050, 650, .009], [150, 400, 750, 450, .006], [200, 180, 400, 220, .0025]]);
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
test('All waves launch from ground, never exceed four active, and count each kill once', () => {
  const { encounter: e, start, tick } = rig();
  start();
  let time = now + 4100, seen = 0;
  for (let i = 0; i < 10000 && e.phase !== 'finished'; i++) {
    time += 50;
    tick(time);
    assert.ok(e.active().length <= 4);
    assert.ok(e.active().filter(n => n.tier === 'legendary').length <= 4);
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
test('Legendary dodge decisions change physical trajectory, respect canonical reaction/cooldown and never teleport', () => {
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
  e.tick(pilot, now + 4350);
  const decision = legend.dodgeAt, origin = { ...legend.position };
  let peakBank = Math.abs(legend.rotation.z);
  assert.equal(decision, now + 4350);
  for (at = now + 4400; at < now + 5500; at += 50) {
    const before = { ...legend.position };
    e.tick(pilot, at);
    peakBank = Math.max(peakBank, Math.abs(legend.rotation.z));
    assert.ok(Math.hypot(legend.position.x - before.x, legend.position.y - before.y, legend.position.z - before.z) < 40);
    assert.equal(legend.dodgeAt, decision);
  }
  assert.ok(Math.abs(legend.position.x - origin.x) > 20, 'dodge physically moves laterally');
  assert.ok(peakBank > .1, 'dodge banks during its turn rather than moving sideways instantly');
  e.tick(pilot, decision + 1300);
  assert.equal(legend.dodgeAt, decision, 'counterattack window does not chain another dodge');
  assert.ok(Math.abs(legend.waypoint.x - (pilot.position.x + pilot.velocity.x * 1.4)) < .01, 'after evasion it intercepts the player rather than orbiting the dodge endpoint');
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

test('Air Assault leads steady crossing shots for their full flight and rejects backward or unreachable shots', () => {
  const origin={x:0,y:600,z:0},velocity={x:0,y:0,z:-200},target={x:0,y:600,z:-2500},crossing={x:100,y:0,z:0},forward={x:0,y:0,z:-1};
  const direction=assaultShotDirection(origin,velocity,target,crossing,forward,.36)!;
  const hit=ballisticIntercept(origin,velocity,target,crossing)!;
  assert.ok(direction);assert.ok(hit.seconds>1.75);
  assert.ok(Math.hypot(direction.x*hit.speed*hit.seconds-(target.x+crossing.x*hit.seconds),direction.z*hit.speed*hit.seconds-target.z)<.01);
  assert.equal(assaultShotDirection(origin,velocity,{...target,z:2500},crossing,forward,.36),null);
  assert.equal(assaultShotDirection(origin,velocity,target,{x:0,y:0,z:-1600},forward,.36),null);
});
test('Distant arrivals use cruise and a physical braking distance instead of the slow player speed',()=>{
  const envelope=aircraftFlightEnvelope.fighter;
  assert.ok(assaultApproachSpeed(170,18000)>800);
  assert.equal(assaultApproachSpeed(170,1000),193);
  const range=7000,speed=assaultApproachSpeed(170,range);
  assert.ok((speed**2-193**2)/(2*envelope.airbrakeDrag)<=range-1800+.001);
  assert.ok(speed<=envelope.maxSpeed*.72);
});
test('An attack pass commits forward and respects the tier turn limit',()=>{
  const r=rig();r.start();r.tick(now+4200);const e=r.encounter.active()[0]!;
  Object.assign(e,{phase:'combat',position:{x:0,y:600,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-200},speed:200,readyAt:now,trackingAt:now,nextPassAt:0});
  r.pilot.position={x:0,y:600,z:-300};r.tick(now+4250);
  assert.ok(e.passUntil>now+4250);assert.ok(e.waypoint.z<-1500);
  assert.ok(Math.abs(e.waypoint.z)>=(200+200)*(8+2),'pass endpoint stays beyond its committed travel');
  const end=e.passUntil;r.pilot.position={x:500,y:600,z:0};r.tick(now+4300);
  assert.equal(e.passUntil,end);assert.ok(Math.abs(e.rotation.y)<=aircraftFlightEnvelope.fighter.yawRate*.5*.05+.001);
  e.speed=400;
  r.pilot.position={x:0,y:600,z:5000};r.tick(now+4350);
  assert.equal(e.passUntil,end,'separation must not cancel the committed pass and start another tail chase');
  assert.deepEqual(e.waypoint,e.passWaypoint);
  assert.ok(e.speed<400,'outbound separation must brake to combat speed rather than trigger approach acceleration');
});
test('In-flight enemy bullets retain a firing slot across leases and attacks are warned',()=>{
  const owners=new Set<string>(),fired:string[]=[],warned:string[]=[];
  const pilot:AssaultPilot={position:{x:0,y:600,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-170},health:100,maxHealth:100,airborne:true,fresh:true};
  const e=new AirAssaultEncounter('dallas','coordination',{elevation:()=>100,activate(){},move(){},remove(){},bullets:()=>[],enemyShotOwners:()=>owners,warn:id=>warned.push(id),fire:n=>{fired.push(n.id);owners.add(n.id);return true},heal(){},finish:()=>({reward:0,dailyClaimed:false})},now);
  e.ready(now);e.skip(now+1000);e.tick(pilot,now+4000);e.takeoff(now+4100,'dfw');
  const enemies=e.enemies.slice(0,4);for(const [i,n] of enemies.entries())Object.assign(n,{phase:'combat',position:{x:i*100,y:600,z:-1000},speed:170,readyAt:now});
  for(let t=now+4150;t<now+16000;t+=50){e.tick(pilot,t);assert.ok(owners.size<=2);}
  assert.ok(fired.length>0);assert.ok(warned.length>0);assert.equal(new Set(fired).size,2);
});
test('All three airports reach a slow airborne Bluejay without spending the battle in transit',()=>{
  const r=rig();r.pilot.velocity={x:0,y:0,z:-180};r.start();const arrivals=new Map<string,number>();
  for(let time=now+4150;time<now+60000;time+=50){r.tick(time);for(const e of r.encounter.active())if(e.phase==='combat'&&Math.hypot(e.position.x-r.pilot.position.x,e.position.z-r.pilot.position.z)<4500&&!arrivals.has(e.airportId))arrivals.set(e.airportId,time-now);}
  assert.equal(arrivals.size,3);assert.ok(Math.max(...arrivals.values())<55000);
});

test('Observed-bank prediction hits a sustained turn with one straight shot, but a changed bank evades it',()=>{
 const origin={x:0,y:600,z:0},velocity={x:0,y:0,z:-200},target={x:0,y:600,z:-1000},v={x:100,y:0,z:-50},forward={x:0,y:0,z:-1},rate=.6;
 const curved=assaultShotDirection(origin,velocity,target,v,forward,.36,rate)!;
 const linear=assaultShotDirection(origin,velocity,target,v,forward,.36)!;
 assert.ok(curved);assert.ok(linear);
 const miss=(direction:typeof curved,bank:number)=>{let best=Infinity;const speed=ballisticShotSpeed(velocity,direction);for(let t=0;t<3;t+=.001){const sine=Math.sin(bank*t),cosine=Math.cos(bank*t),x=target.x+(v.x*sine+v.z*(1-cosine))/bank,z=target.z+(v.z*sine-v.x*(1-cosine))/bank;best=Math.min(best,Math.hypot(direction.x*speed*t-x,direction.z*speed*t-z));}return best;};
 assert.ok(miss(curved,rate)<1,'launch-time forecast intersects the observed turn');
 assert.ok(miss(linear,rate)>20,'constant velocity was inaccurate for this bank');
 assert.ok(miss(curved,-rate)>30,'the bullet does not home when the target reverses its bank');
 assert.equal(assaultObservedTurn({x:0,y:0,z:-100},{x:-100,y:0,z:0},.1,1.5),1.5);
 assert.equal(assaultObservedTurn({x:0,y:0,z:0},v,.1,1.5),0);
});

test('Legendary runway travel overlaps while only one attacks; the fifth arrives before the deadline', () => {
  const r = rig(); r.start();
  r.pilot.position = { x: -15000, y: 650, z: -10500 };
  r.pilot.velocity = { x: 0, y: 0, z: 0 };
  const launches = new Map<string, number>(), arrivals = new Map<string, number>();
  const legendIds = new Set(r.encounter.enemies.filter(e => e.tier === 'legendary').map(e => e.id));
  let firstAttacker: string | undefined, relieved = false;
  for (let elapsed = 50; elapsed <= 320000; elapsed += 50) {
    const time = now + 4100 + elapsed; r.tick(time);
    const active = r.encounter.active();
    assert.ok(active.length <= 4);
    for (const airport of airAssaultAirports)
      assert.ok(active.filter(e => e.airportId === airport.id && e.phase === 'takeoff').length <= 1);
    for (const e of active) {
      if (!launches.has(e.id)) {
        launches.set(e.id, elapsed);
        assert.equal(e.phase, 'takeoff');
        assert.ok(e.position.y < 110, 'all aircraft still depart from their actual runway');
      }
      if (e.phase === 'combat' && Math.hypot(e.position.x-r.pilot.position.x,e.position.y-r.pilot.position.y,e.position.z-r.pilot.position.z)<4500)
        if (!arrivals.has(e.id)) arrivals.set(e.id, elapsed);
      // Controlled damage/outcome fixture; movement and departure clocks remain fully integrated.
      if (e.tier !== 'legendary' && elapsed - (arrivals.get(e.id) ?? Infinity) >= 6000)
        r.encounter.defeated(e.id, time);
    }
    const legendShots = r.shots.filter(shot => legendIds.has(shot.id));
    if (!relieved && elapsed >= 265000) {
      assert.equal(r.encounter.destroyed, 25);
      assert.equal(active.filter(e => e.tier === 'legendary').length, 4, 'free slots prefetch real Legendary departures');
      const shooters = new Set(legendShots.map(shot => shot.id));
      assert.equal(shooters.size, 1, 'holding pilots do not join the attack');
      firstAttacker = [...shooters][0]!;
      r.encounter.defeated(firstAttacker, time); relieved = true;
    }
  }
  assert.equal(launches.size, 30);
  assert.equal(arrivals.size, 30, 'every aircraft physically reaches firing range before eight minutes');
  const fifth = r.encounter.enemies[29]!;
  assert.ok(launches.get(fifth.id)! < 267000, 'fifth departure no longer waits until 7:45');
  assert.ok(arrivals.get(fifth.id)! < 320000);
  const successors = new Set(r.shots.filter(s => s.at > now+4100+265000 && legendIds.has(s.id)).map(s => s.id));
  assert.equal(successors.size, 1); assert.ok(!successors.has(firstAttacker!));
  for (const e of r.encounter.active()) r.encounter.defeated(e.id, now+4100+320001);
  assert.equal(r.encounter.destroyed, 30); assert.equal(r.encounter.result, 'full');
});

test('Holding Legendary aircraft still evade real incoming trajectories without joining the attack', () => {
  const fired: string[] = [];
  const bullets = [{position:{x:2000,y:800,z:900},direction:{x:0,y:0,z:-1},speed:1500}];
  const e = new AirAssaultEncounter('dallas','holding',{elevation:()=>100,activate(){},move(){},remove(){},bullets:()=>bullets,fire:n=>{fired.push(n.id);return true;},heal(){},finish:()=>({reward:0,dailyClaimed:false})},now);
  const pilot: AssaultPilot = {position:{x:0,y:600,z:-2000},velocity:{x:0,y:0,z:-150},rotation:{x:0,y:0,z:0},health:100,maxHealth:100,airborne:true,fresh:true};
  e.ready(now);e.skip(now+1000);e.tick(pilot,now+4000);e.takeoff(now+4100,'dfw');
  for(const n of e.enemies)n.phase='destroyed';
  const [attacker,holding]=e.enemies.filter(n=>n.tier==='legendary');
  for(const [index,n] of [attacker!,holding!].entries())Object.assign(n,{phase:'combat',health:200,position:{x:index*2000,y:index?800:600,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-150},speed:150,readyAt:now,movedAt:now+4100,previous:{x:index*2000,y:index?800:600,z:0}});
  const incoming=bullets.pop()!;
  holding!.passUntil=holding!.trackingAt=now+10000;
  e.tick(pilot,now+4150);
  assert.equal(holding!.passUntil,0,'handoff cancels the old attack pass immediately');
  assert.ok(Math.hypot(holding!.waypoint.x-pilot.position.x,holding!.waypoint.z-pilot.position.z)>2000);
  bullets.push(incoming);
  e.tick(pilot,now+4200);
  e.tick(pilot,now+4400);
  assert.equal(holding!.dodgeAt,now+4400);
  const origin={...holding!.position};
  for(let time=now+4450;time<=now+5250;time+=50)e.tick(pilot,time);
  assert.ok(Math.hypot(holding!.position.x-origin.x,holding!.position.z-origin.z)>20);
  assert.ok(Math.abs(holding!.rotation.z)>.1);
  assert.equal(holding!.health,200);
  assert.deepEqual([...new Set(fired)],[attacker!.id]);
});
