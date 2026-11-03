import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHunterFlight, hunterBallisticSolution, hunterFlightIntercept } from './hunter-flight.js';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { ballisticShotSpeed } from '../../shared/protocol.mjs';
import { HunterMotionBuffer } from '../../shared/hunter-motion.mjs';

const aircraft = aircraftFlightEnvelope.privateJet;
function pilot() { return { aircraftType: 'privateJet' as const, position: { x: 0, y: 900, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -400 } }; }
function motion() { return { speed: 400, bankControl: 0, combatTurnSign: 1, flightAltitude: 900 }; }
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

test('Hunter keeps momentum, banks into a continuous turn and levels onto its new course', () => {
  const p = pilot(), m = motion(); let peakBank = 0, minSpeed = 1000;
  const target = { x: -20_000, y: 900, z: -20_000 };
  for (let i = 0; i < 400; i++) {
    const previous = { ...p.position }, heading = p.rotation.y, bank = p.rotation.z;
    advanceHunterFlight(p, m, target, 400, .05, () => 600);
    assert.ok(Math.abs(wrap(p.rotation.y - heading)) <= .05 * 1.2);
    assert.ok(Math.abs(p.rotation.z - bank) <= aircraft.rollRate * .05 + 1e-9);
    assert.ok(Math.hypot(p.position.x - previous.x, p.position.z - previous.z) > 15);
    const horizontal = Math.hypot(p.velocity.x, p.velocity.z);
    assert.ok((p.velocity.x * -Math.sin(p.rotation.y) + p.velocity.z * -Math.cos(p.rotation.y)) / horizontal > .9999);
    assert.ok(Math.abs(Math.atan2(p.velocity.y, horizontal) - p.rotation.x) < 1e-6);
    peakBank = Math.max(peakBank, Math.abs(p.rotation.z)); minSpeed = Math.min(minSpeed, horizontal);
  }
  assert.ok(peakBank > .3); assert.ok(minSpeed > 300); assert.ok(Math.abs(p.rotation.z) < .1);
});

test('altitude changes obey pitch and vertical acceleration limits without snapping or oscillating', () => {
  const p = pilot(), m = motion(); let peak = p.position.y;
  for (let i = 0; i < 600; i++) {
    const vy = p.velocity.y, y = p.position.y;
    advanceHunterFlight(p, m, { x: 0, y: i < 300 ? 1250 : 900, z: -100_000 }, 400, .05, () => 600);
    assert.ok(Math.abs(p.velocity.y - vy) <= 18 * .05 + 1e-7);
    assert.ok(Math.abs(p.position.y - y) < 5);
    assert.ok(p.rotation.x <= aircraft.maxClimbPitch + 1e-6 && p.rotation.x >= -aircraft.maxDivePitch - 1e-6);
    peak = Math.max(peak, p.position.y);
  }
  assert.ok(peak > 1200 && peak < 1270); assert.ok(p.position.y >= 890 && p.position.y < 980);
});

test('terrain is anticipated before the crossing instead of teleporting the aircraft upward', () => {
  const p = pilot(), m = motion();
  const floor = (_x: number, z: number) => z < -2000 ? 1400 : 600;
  for (let i = 0; i < 600; i++) {
    const y = p.position.y;
    advanceHunterFlight(p, m, { x: 0, y: 900, z: -50_000 }, 400, .05, floor);
    assert.ok(p.position.y > floor(p.position.x, p.position.z));
    assert.ok(Math.abs(p.position.y - y) < 5);
    assert.ok(Math.hypot(p.velocity.x, p.velocity.z) > 300);
  }
});

test('high-speed flight interception leads the route without increasing aircraft speed', () => {
  const point = hunterFlightIntercept({ x: 0, y: 900, z: 0 }, 400,
    { x: 0, y: 900, z: -10_000 }, { x: 700, y: 0, z: 0 });
  assert.ok(point.x > 700 * 1.75); assert.ok(Number.isFinite(point.z));
});

test('real ballistic shots hit straight moving targets; post-launch evasive turns can defeat the same shots', () => {
  const origin = { x: 0, y: 900, z: 0 }, velocity = { x: 0, y: 0, z: -400 };
  const target = { x: 0, y: 900, z: -1800 }, moving = { x: 500, y: 0, z: -100 };
  const shot = hunterBallisticSolution(origin, velocity, target, moving);
  assert.ok(shot);
  let straightHits = 0, evasiveHits = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const error = Math.sin(attempt * 2.4) * .002;
    const length = Math.hypot(shot.direction.x + error, shot.direction.y, shot.direction.z);
    const d = { x: (shot.direction.x + error) / length, y: 0, z: shot.direction.z / length };
    const speed = ballisticShotSpeed(velocity, d);
    const evasive = { ...target }; let vx = moving.x, vz = moving.z, straight = false, evaded = false;
    for (let time = .005; time < shot.seconds + .4; time += .005) {
      if (time > .2) { const turn = .6 * .005, x = vx * Math.cos(turn) - vz * Math.sin(turn); vz = vx * Math.sin(turn) + vz * Math.cos(turn); vx = x; }
      evasive.x += vx * .005; evasive.z += vz * .005;
      const x = origin.x + d.x * speed * time, z = origin.z + d.z * speed * time;
      if (Math.hypot(x - target.x - moving.x * time, z - target.z - moving.z * time) < 6) straight = true;
      if (Math.hypot(x - evasive.x, z - evasive.z) < 6) evaded = true;
    }
    if (straight) straightHits++; if (evaded) evasiveHits++;
  }
  assert.ok(straightHits >= 15, `straight hits ${straightHits}/20`);
  assert.ok(evasiveHits < straightHits / 2, `evasions ${evasiveHits}/20`);
  assert.equal(hunterBallisticSolution(origin, velocity, { ...target, z: -6000 }, moving), null);
});

test('Hunter snapshot rendering stays continuous at packet joins and across heading wrap', () => {
  const buffer = new HunterMotionBuffer(); let previous = 0;
  for (let frame = 0; frame < 120; frame++) {
    const now = frame * 1000 / 60;
    if (frame % 12 === 0) buffer.push({ x: 0, y: 900, z: -now * .4 },
      { x: 0, y: now < 1000 ? 3.13 : -3.13, z: .3 }, { x: 0, y: 0, z: -400 }, 10000 + now, now);
    const pose = buffer.sample(now)!;
    if (now > 300) assert.ok(Math.abs(pose.position.z - previous) > 5 && Math.abs(pose.position.z - previous) < 8);
    if (frame > 0) assert.ok(Math.abs(wrap(pose.rotation.y - Math.PI)) < .03, 'heading wrap must not spin the model');
    previous = pose.position.z;
  }
});

// Exercise production phase/aim functions without starting a server or bypassing combat state.
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { COMBAT_RANGE } from '../../shared/protocol.mjs';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function production(names: string[], dependencies: Record<string, unknown>) {
  const code = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? '')).map(n => n.getText(tree)).join('\n');
  const context = vm.createContext(dependencies);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

test('production firing solution respects the forward cone and uses intercepts beyond the old 1.75-second cap', () => {
  const ctx = production(['botFireSolution', 'rotateLocalYxz', 'forwardDirection', 'hunterForward'], {
    smoothHunter: () => true, hunterBallisticSolution, aircraftFlightEnvelope,
    muzzleTransform: (p: ReturnType<typeof pilot>) => ({ position: p.position }),
    normalize: (v: {x:number;y:number;z:number}) => { const n = Math.hypot(v.x,v.y,v.z); return {x:v.x/n,y:v.y/n,z:v.z/n}; },
    dot: (a: {x:number;y:number;z:number},b: {x:number;y:number;z:number}) => a.x*b.x+a.y*b.y+a.z*b.z,
    hunterFireRange: COMBAT_RANGE, hunterFireCone: .2, defenderDownwardFireAngle: .3,
  });
  const shooter = pilot(), target = { ...pilot(), position: { x: 0, y: 900, z: -2000 }, velocity: { x: 0, y: 0, z: -100 } };
  assert.ok(hunterBallisticSolution(shooter.position, shooter.velocity, target.position, target.velocity)!.seconds > 1.75);
  assert.equal(ctx.botFireSolution(shooter, target, false).reason, undefined);
  target.position.x = 2000; assert.equal(ctx.botFireSolution(shooter, target, false).reason, 'NO_FORWARD_SOLUTION');
  target.position = { x: 0, y: 900, z: 500 }; assert.equal(ctx.botFireSolution(shooter, target, false).reason, 'NO_FORWARD_SOLUTION');
});

test('production overshoot commits forward, then sets a wide return course instead of chasing behind its tail', () => {
  const p = { ...pilot(), cityId: 'dallas', lifeState: 'alive' }, target = { ...pilot(), position: { x: 0, y: 900, z: 600 } };
  const bot = { ...motion(), personality: 'hunter', phase: 'attackPass', combatTargetId: 'pilot', combatPhaseUntil: 10_000, blindZoneEscapeUntil: 0, combatWaypoint: { x: 0, y: 900, z: -2000 } };
  const ctx = production(['hunterNavigationTarget', 'beginHunterExtend', 'beginHunterReposition', 'botMinimumTurnRadius', 'isHunterCombatPhase'], {
    players: new Map(), smoothHunter: () => true, hunterTarget: () => ['pilot', target], hunterForward: () => ({ x: 0, y: 0, z: -1 }),
    safeBotWaypoint: (_city: unknown, _from: unknown, p: unknown) => p, hunterClearance: () => 600,
    aircraftFlightEnvelope, hunterMinimumHorizontalSeparation: 1100, stabilityDiagnosticsEnabled: false,
  });
  ctx.hunterNavigationTarget('hunter', p, bot, 0);
  assert.equal(bot.phase, 'extend'); assert.ok(bot.combatWaypoint.z <= -1800); assert.equal(bot.combatWaypoint.y, 900);
  const until = bot.combatPhaseUntil;
  ctx.hunterNavigationTarget('hunter', p, bot, until + 1);
  assert.equal(bot.phase, 'reposition'); assert.ok(Math.abs(bot.combatWaypoint.x) >= 1100);
});

test('new Hunter control leaves Sky Duel, Air Assault and scripted escorts on their established controllers', () => {
  const ctx = production(['smoothHunter'], {});
  assert.equal(ctx.smoothHunter({ bot: { personality: 'hunter' } }), true);
  for (const p of [
    { bot: { personality: 'hunter' }, skyDuelPracticeOwnerId: 'owner' },
    { bot: { personality: 'hunter' }, airAssaultId: 'encounter' },
    { bot: { personality: 'hunter', journeyRearGuardEscort: 1 } },
    { bot: { personality: 'casual', journeyLeader: true } },
  ]) assert.equal(ctx.smoothHunter(p), false);
});
