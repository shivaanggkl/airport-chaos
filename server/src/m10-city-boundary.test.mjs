import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { cityRegistry } from '../../shared/city-registry.mjs';
import { journeyCatalog, journeyDallas09, journeyDallas10, journeyDallas12, journeyDallas16 } from '../../shared/journey-mission.mjs';
import * as missions from '../../shared/journey-mission.mjs';
import { advanceHunterFlight } from './hunter-flight.ts';
import { dallasEscortSteeringTarget, insideJourneyHunterArena, keepDallasEscortInside } from './journey-hunter-airspace.ts';
import { insideAceInterceptAirspace } from './ace-intercept.ts';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const flight = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'advanceBotFlight').getText(ast);
const code = ts.transpileModule(flight, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const half = cityRegistry.dallas.worldSize / 2;
function fixture(aircraftType, x, z, heading) {
  const player = { cityId: 'dallas', aircraftType, position: { x, y: 2000, z }, rotation: { x: 0, y: heading, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const bot = { journeyAttemptId:'attempt',journeyDallasEntered:true,journeyCrossfire: true, phase: 'cruise', speed: aircraftFlightEnvelope[aircraftType].maxSpeed, bankControl: 0, combatTurnSign: 1 };
  const ctx = vm.createContext({ ...missions, aircraftFlightEnvelope, advanceHunterFlight, dallasEscortSteeringTarget, keepDallasEscortInside,
    wrapAngle: value => Math.atan2(Math.sin(value), Math.cos(value)), botRunwayHeight: () => 0, smoothHunter: () => true,
    hunterForward: p => ({ x: -Math.sin(p.rotation.y), y: 0, z: -Math.cos(p.rotation.y) }), botCruiseFactor: () => .78,
    hunterClearance: () => 100, botSafeFloor: () => 0, player, bot });
  vm.runInContext(code, ctx);
  return { player, bot, tick(target) { ctx.target = target; vm.runInContext('advanceBotFlight(player, bot, target, .2)', ctx); } };
}

const fighterMissions = [
  [21,missions.journeyDallasCaptureThree01,{journeyCaptureSlot:0},['trainer','fighter','privateJet','cargo']],
  [3,missions.journeyDallas13,{journeyFirstContact:true},[missions.journeyDallas13.enemyAircraft]],
  [6,missions.journeyDallas14,{journeyFirstContact:true,journeySurpriseAttack:true},[missions.journeyDallas14.enemyAircraft]],
  [11,missions.journeyDallas15,{journeyAce:true,journeyPursuit:{}},[missions.journeyDallas15.enemyAircraft]],
  [15,missions.journeyDallasTwinHunters01,{journeyCrossfire:true},missions.journeyDallasTwinHunters01.enemies.map(e=>e.aircraft)],
  [17,missions.journeyDallas16,{journeyCrossfire:true},missions.journeyDallas16.enemies.map(e=>e.aircraft)],
  [20,missions.journeyDallasAceIntercept01,{journeyFirstContact:true,journeyAceIntercept:{phase:'DOGFIGHT'}},['fighter']],
  [23,missions.journeyDallas17,{journeyFirstContact:true,journeyIronHunter:true},missions.journeyDallas17.enemies.map(e=>e.aircraft)],
  [25,missions.journeyDallas18,{journeyFirstContact:true,journeyFinalShowdown:true},missions.journeyDallas18.enemies.map(e=>e.aircraft)],
  ...[13,18,22,28].map(number=>{
    const mission=missions.journeyCatalog.find(m=>m.number===number);
    const definition=Object.values(missions).find(m=>m?.id===mission.id&&m.escortAircraft);
    return [number,definition,{journeyRearGuardEscort:1,journeyEscortMissionId:mission.id},definition.escortAircraft];
  }),
];
for(const [number,mission,flags,aircraft] of fighterMissions)for(const [slot,type] of aircraft.entries()) {
  test(`M${number} opponent ${slot+1} (${type}) stays inside every Dallas edge and corner`,()=>{
    assert.equal(journeyCatalog.find(m=>m.id===mission.id).number,number);
    for(const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const f=fixture(type,sx*(half-21),sz*(half-21),Math.atan2(-sx,-sz));
      Object.assign(f.bot,{journeyCrossfire:false},flags);
      for(let tick=0;tick<400;tick++) {
        const before={...f.player.position},speed=f.bot.speed;
        f.tick({x:sx*(half+60000),y:2000,z:sz*(half+60000)});
        assert.ok(Math.abs(f.player.position.x)<=half-20&&Math.abs(f.player.position.z)<=half-20);
        assert.ok(Math.hypot(f.player.position.x-before.x,f.player.position.z-before.z)<=Math.max(speed,f.bot.speed)*.2+1e-6,'no boundary teleport');
      }
      assert.ok(Math.hypot(f.player.position.x,f.player.position.z)<Math.hypot(sx*(half-21),sz*(half-21)),'opponent returns toward the city');
    }
  });
}

test('initial outside arrival stays unchanged until entry, then confinement survives a restored bot',()=>{
  const f=fixture('trainer',-half-2000,0,-Math.PI/2);
  f.bot.journeyCrossfire=false;f.bot.journeyFirstContact=true;delete f.bot.journeyDallasEntered;
  const expectedPlayer=structuredClone(f.player),expectedBot=structuredClone(f.bot),target={x:0,y:2000,z:0};
  advanceHunterFlight(expectedPlayer,expectedBot,target,missions.journeyDallas13.cruiseSpeed,.2,()=>0);
  f.tick(target);assert.deepEqual(f.player,expectedPlayer,'arrival is neither redirected nor teleported');
  assert.equal(f.bot.journeyDallasEntered,undefined);
  for(let tick=0;tick<200&&!f.bot.journeyDallasEntered;tick++)f.tick(target);
  assert.equal(f.bot.journeyDallasEntered,true);
  Object.assign(f.bot,structuredClone(f.bot));
  for(let tick=0;tick<400;tick++){
    f.tick({x:-half-60000,y:2000,z:0});
    assert.ok(Math.abs(f.player.position.x)<=half-20&&Math.abs(f.player.position.z)<=half-20);
  }
});

test('city-edge combat stays legal inside Dallas and rejects an assigned pilot outside the city',()=>{
  const start=source.indexOf('  if ((owner.bot?.journeyTargetPlayerId');
  const end=source.indexOf('\n  if (victim.bot?.journeyFirstContact',start);
  assert.ok(start>=0&&end>start);
  const allows=new Function('owner','victim','ownerId','victimId','insideAceInterceptAirspace','insideJourneyHunterArena',source.slice(start,end)+'\nreturn true;');
  const pilot={position:{x:half-2000,z:half-2000}};
  const enemy={position:{x:half-4000,z:half-4000},bot:{journeyTargetPlayerId:'pilot',journeyDallasEntered:true}};
  assert.equal(insideJourneyHunterArena(pilot.position),false,'use a city corner beyond the historical combat region');
  assert.equal(allows(pilot,enemy,'pilot','enemy',insideAceInterceptAirspace,insideJourneyHunterArena),true);
  assert.equal(allows(enemy,pilot,'enemy','pilot',insideAceInterceptAirspace,insideJourneyHunterArena),true);
  pilot.position.x=half+100;
  assert.equal(allows(pilot,enemy,'pilot','enemy',insideAceInterceptAirspace,insideJourneyHunterArena),false);
});

test('ambient aircraft retain their existing movement without mission confinement',()=>{
  const f=fixture('cargo',half-500,0,-Math.PI/2),target={x:half+30000,y:2000,z:0};
  f.bot.journeyCrossfire=false;delete f.bot.journeyAttemptId;delete f.bot.journeyDallasEntered;
  const expectedPlayer=structuredClone(f.player),expectedBot=structuredClone(f.bot);
  advanceHunterFlight(expectedPlayer,expectedBot,target,aircraftFlightEnvelope.cargo.maxSpeed*.78,.2,()=>0);
  f.tick(target);assert.deepEqual(f.player,expectedPlayer);
  assert.equal(f.bot.journeyDallasEntered,undefined);
});

for (const [ordinal, aircraft] of journeyDallas09.escortAircraft.entries()) {
  test(`displayed M18 ${aircraft}: all three escorts stay inside Dallas during pursuit and after the giant is destroyed`, () => {
    assert.equal(journeyCatalog.find(mission => mission.id === journeyDallas09.id).number, 18);
    for (const [sx, sz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const f = fixture(aircraft, sx * (half - 21), sz * (half - 21), Math.atan2(-sx, -sz));
      f.bot.journeyCrossfire = false;
      f.bot.journeyRearGuardEscort = ordinal + 1;
      f.bot.journeyEscortMissionId = journeyDallas09.id;
      f.bot.journeyAttemptId = 'm18-transport';
      for (let tick = 0; tick < 600; tick++) {
        // Both an out-of-city formation waypoint and an escaping pilot must
        // yield to the same boundary before the smooth flight integrator.
        f.bot.phase = tick < 300 ? 'cruise' : 'attackPass';
        const before = { ...f.player.position }, speed = f.bot.speed;
        f.tick({ x: sx * (half + 60000), y: 2000, z: sz * (half + 60000) });
        assert.ok(Math.abs(f.player.position.x) <= half - 20 && Math.abs(f.player.position.z) <= half - 20);
        assert.ok(Math.hypot(f.player.position.x - before.x, f.player.position.z - before.z) <= Math.max(speed, f.bot.speed) * .2 + 1e-6, 'no boundary teleport');
        assert.ok(Number.isFinite(f.player.velocity.x) && Number.isFinite(f.player.velocity.z));
      }
      assert.ok(Math.hypot(f.player.position.x, f.player.position.z) < Math.hypot(sx * (half - 21), sz * (half - 21)), 'escort turns back into Dallas');
    }
  });
}
for (const { aircraft } of journeyDallas16.enemies) {
  test(`M17 ${aircraft}: smooth flight stays inside all Dallas edges and corners while chasing outside`, () => {
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
  test(`M17 ${aircraft}: ordinary flight inside Dallas retains existing smooth motion`, () => {
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


for (const aircraft of journeyDallas12.escortAircraft) test(`M28 ${aircraft}: both surviving escorts stay in Dallas after the giant is destroyed`, () => {
  for (const [sx,sz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const f=fixture(aircraft,sx*(half-21),sz*(half-21),Math.atan2(-sx,-sz));
    f.bot.journeyCrossfire=false;
    f.bot.journeyRearGuardEscort=aircraft==='privateJet'?1:2;
    f.bot.journeyEscortMissionId=journeyDallas12.id;
    f.bot.journeyAttemptId='destroyed-transport';
    const target={x:sx*(half+60000),y:2000,z:sz*(half+60000)};
    for(let tick=0;tick<600;tick++) {
      const before={...f.player.position},speed=f.bot.speed;
      f.tick(target);
      assert(Math.abs(f.player.position.x)<=half-20 && Math.abs(f.player.position.z)<=half-20);
      assert(Math.hypot(f.player.position.x-before.x,f.player.position.z-before.z)<=Math.max(speed,f.bot.speed)*.2+1e-6,'no boundary teleport');
      assert(Number.isFinite(f.player.velocity.x)&&Number.isFinite(f.player.velocity.z));
    }
    assert(Math.hypot(f.player.position.x,f.player.position.z)<Math.hypot(sx*(half-21),sz*(half-21)),'escort turns back into the city');
  }
});
