import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { FIRE_RATE_PER_SECOND, ORDINARY_PROJECTILE_DAMAGE, fireIntervalMs, projectileDamageForAircraft } from '../../shared/protocol.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');

test('aircraft fire rates use the same cadence on client and server', () => {
  for (const [aircraftType, shotsPerSecond] of [
    ['trainer', 3.0],
    ['cargo', 4.2],
    ['privateJet', 4.8],
    ['fighter', 6.6],
  ] as const) {
    assert.equal(FIRE_RATE_PER_SECOND[aircraftType], shotsPerSecond);
    assert.equal(fireIntervalMs(aircraftType), 1_000 / shotsPerSecond);
  }
  assert.match(client, /fireCooldown = fireIntervalMs\(aircraftType\) \/ 1_000/);
});

test('Sky Duel uses the equipped aircraft flight envelope and resets controls at spawn', () => {
  assert.match(client, /currentAircraft = aircraftDefinitions\[aircraftType\]/);
  assert.match(server, /const envelope = aircraftFlightEnvelope\[player\.aircraftType\]/);
  assert.match(client, /skyDuelUi\?\.handle\(message\);\s*resetCrashPresentation\(\);\s*resetFlightLaunchInput\(\);\s*pitchControlStrength = 0;\s*yawControlStrength = 0;/);
  assert.match(server, /const skyDuelHealth = 100;/);
});

test('aircraft damage produces the approved regular-combat hit counts', () => {
  const lightHealth = maxHealthForAircraft('trainer');
  const heavyHealth = maxHealthForAircraft('fighter');
  for (const [aircraftType, damage, lightHits, heavyHits] of [
    ['trainer', 25, 4, 8],
    ['cargo', 25, 4, 8],
    ['privateJet', 25, 4, 8],
    ['fighter', 25, 4, 8],
  ] as const) {
    assert.equal(ORDINARY_PROJECTILE_DAMAGE, damage);
    assert.equal(projectileDamageForAircraft(aircraftType), damage);
    assert.equal(Math.ceil(lightHealth / damage), lightHits);
    assert.equal(Math.ceil(heavyHealth / damage), heavyHits);
  }
  assert.match(server, /damage: ORDINARY_PROJECTILE_DAMAGE/);
  assert.match(server, /if \(owner\.skyDuelMatchId\)[\s\S]*const dealt = Math\.min\(victim\.health, damage\)/);
  assert.match(server, /applyCombatHit\(projectile\.ownerId, hitPlayerId, projectile\.cityId, now, projectile\.damage/);
});

test('runway protection is checked for locks, projectile collision and the authoritative damage boundary', () => {
  for(const pattern of [/runwayCombatProtected\(targetId, target\)/,/runwayCombatProtected\(victimId, victim\)/,/runwayCombatProtected\(ownerId, owner\)/,/runwayCombatProtected\(playerId, player\)/])assert.match(server,pattern);
});

test('temporary spawn protection remains independent of runway state', () => {
  assert.match(server, /now < target\.spawnProtectedUntil/);
  assert.match(server, /now < victim\.spawnProtectedUntil/);
  assert.match(server, /now < player\.spawnProtectedUntil/);
  assert.match(server, /player\.spawnProtectedUntil = now \+ spawnProtectionMs/);
});

import vm from 'node:vm';
import ts from 'typescript';
import {competitiveModes} from '../../shared/competitive-modes.mjs';
import {duelScoreWinner} from './sky-duel-rules.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { journeyDallas08, journeyDallas09, journeyDallas10 } from '../../shared/journey-mission.mjs';
const tree=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
function runtime() {
 const names=['runwayCombatProtected','runwayOrTaxiSpawnArea','applyCombatHit','fireBlockReason','canFire'];
 const code=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text??'')).map(n=>n.getText(tree)).join('\n');
 const packets:unknown[]=[];let scores=0;
 const ctx=vm.createContext({competitiveModes,duelScoreWinner,Date:{now:()=>10000},cityAirports,journeyDallas08,journeyDallas09,journeyDallas10,dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,100])),
  landingFlightState:new Map(),players:new Map(),playerJourneyRunwayPrep:new Set(),
  focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,
  skyDuelSessions:new Map([['match',{id:'match',phase:'active',startedAt:0,scoreA:0,scoreB:0}]]),skyDuelHealth:100,sendSkyDuel:(_s:unknown,p:unknown)=>packets.push(p),
  markPlayerDestroyed:()=>{},skyDuelScoreDestruction:()=>scores++,sendSkyDuelScore:()=>{},fireIntervalMs,
 });
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return {ctx,packets,scores:()=>scores};
}
function plane(isBot=false) {
 const a=cityAirports.dallas.find(a=>a.id==='dfw')!;
 return {entityType:'player',cityId:'dallas',aircraftType:'trainer',isBot,lifeState:'alive',health:100,
  spawnProtectedUntil:0,lastFireAt:0,skyDuelMode:true,skyDuelMatchId:'match',position:{x:a.x,y:101.2,z:a.z},velocity:{x:0,y:0,z:-100}};
}
test('ordinary human and AI runway protection remains intact outside active Sky Duel',()=>{
 const {ctx,packets,scores}=runtime(),human=plane(),enemy=plane(true);
 human.skyDuelMode=false;enemy.skyDuelMode=false;human.skyDuelMatchId='';enemy.skyDuelMatchId='';
 ctx.players.set('human',human);ctx.players.set('enemy',enemy);
 ctx.landingFlightState.set('human',{baselineY:101.2,airborne:false});
 assert.equal(ctx.runwayCombatProtected('enemy',enemy),true);
 assert.equal(ctx.canFire(human,10000,'human'),false);
 enemy.position.y=800;
 assert.equal(ctx.applyCombatHit('enemy','human','dallas',10000,100),false);
 assert.equal(human.health,100);assert.equal(scores(),0);assert.equal(packets.length,0);
 assert.equal(ctx.applyCombatHit('human','enemy','dallas',10000,100),false,'ground protection cannot become an invulnerable firing position');
 human.position.y=121.2;
 assert.equal(ctx.runwayCombatProtected('human',human),true,'client altitude alone does not bypass the accepted takeoff state');
 ctx.landingFlightState.get('human').airborne=true;
 human.skyDuelMode=true;enemy.skyDuelMode=true;human.skyDuelMatchId='match';enemy.skyDuelMatchId='match';
 assert.equal(ctx.canFire(human,10000,'human'),true);
 assert.equal(ctx.applyCombatHit('enemy','human','dallas',10000,40),true);assert.equal(human.health,60);
 assert.equal(ctx.applyCombatHit('human','enemy','dallas',10000,25),true);assert.equal(enemy.health,75);
 human.skyDuelMode=false;enemy.skyDuelMode=false;human.skyDuelMatchId='';enemy.skyDuelMatchId='';
 enemy.position.y=101.2;
 assert.equal(ctx.applyCombatHit('human','enemy','dallas',10000,100),false);assert.equal(enemy.health,75);assert.equal(scores(),0);
 human.position.y=101.2;
 assert.equal(ctx.runwayCombatProtected('human',human),true,'landing or respawning on the runway restores geometry protection even if takeoff was previously recorded');
});
