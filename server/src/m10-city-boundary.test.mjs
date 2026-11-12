import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cityRegistry } from '../../shared/city-registry.mjs';
import { journeyDallas10, journeyDallas16 } from '../../shared/journey-mission.mjs';
import { advanceHunterFlight } from './hunter-flight.ts';
import { dallasEscortSteeringTarget, keepDallasEscortInside } from './journey-hunter-airspace.ts';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const flight = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'advanceBotFlight').getText(ast);
const code = ts.transpileModule(flight, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const half = cityRegistry.dallas.worldSize / 2;
function fixture(aircraftType, x, z, heading) {
  const player = { cityId: 'dallas', aircraftType, position: { x, y: 2000, z }, rotation: { x: 0, y: heading, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const bot = { journeyCrossfire: true, phase: 'cruise', speed: aircraftFlightEnvelope[aircraftType].maxSpeed, bankControl: 0, combatTurnSign: 1 };
  const ctx = vm.createContext({ aircraftFlightEnvelope, journeyDallas10, advanceHunterFlight, dallasEscortSteeringTarget, keepDallasEscortInside,
    wrapAngle: value => Math.atan2(Math.sin(value), Math.cos(value)), botRunwayHeight: () => 0, smoothHunter: () => true,
    hunterForward: p => ({ x: -Math.sin(p.rotation.y), y: 0, z: -Math.cos(p.rotation.y) }), botCruiseFactor: () => .78,
    hunterClearance: () => 100, botSafeFloor: () => 0, player, bot });
  vm.runInContext(code, ctx);
  return { player, bot, tick(target) { ctx.target = target; vm.runInContext('advanceBotFlight(player, bot, target, .2)', ctx); } };
}
for (const { aircraft } of journeyDallas16.enemies) {
  test(`M10 ${aircraft}: smooth flight stays inside all Dallas edges and corners while chasing outside`, () => {
    for (const [sx, sz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const f = fixture(aircraft, sx * (half - 21), sz * (half - 21), Math.atan2(-sx, -sz));
      const target = { x: sx * (half + 60000), y: 2000, z: sz * (half + 60000) };
      for (let tick = 0; tick < 600; tick++) {
        const previous = { ...f.player.position };
        const previousSpeed = f.bot.speed;
        f.tick(target);
        assert(Math.abs(f.player.position.x) <= half - 20);
        assert(Math.abs(f.player.position.z) <= half - 20);
        assert(Number.isFinite(f.player.velocity.x) && Number.isFinite(f.player.velocity.z));
        assert(Math.hypot(f.player.position.x - previous.x, f.player.position.z - previous.z) <= Math.max(previousSpeed, f.bot.speed) * .2 + 1e-6);
      }
      assert(Math.hypot(f.player.position.x, f.player.position.z) < Math.hypot(sx * (half - 21), sz * (half - 21)), 'opponent turns back into Dallas');
    }
  });
  test(`M10 ${aircraft}: ordinary flight inside Dallas retains existing smooth motion`, () => {
    const f = fixture(aircraft, 0, 0, 0);
    const expectedPlayer = structuredClone(f.player), expectedBot = structuredClone(f.bot);
    const target = { x: 0, y: 2000, z: -10000 };
    expectedBot.expertControl = undefined;
    advanceHunterFlight(expectedPlayer, expectedBot, target, aircraftFlightEnvelope[aircraft].maxSpeed * .78, .2, () => 0);
    f.tick(target);
    assert.deepEqual(f.player, expectedPlayer);
    assert.deepEqual(f.bot, expectedBot);
  });
}
