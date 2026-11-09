import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { horizontalDistanceSquared, isFiniteGuidancePosition, opponentAltitudeGuidance } from '../../client/src/opponent-altitude-guidance.ts';
import { journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18 } from '../../shared/journey-mission.mjs';

class Element {
 children=[]; className=''; textContent=''; hidden=false;
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 querySelector(selector){return this.children.find(child=>child.className.split(' ').includes(selector.slice(1))) ?? this.children.map(child=>child.querySelector(selector)).find(Boolean);}
}
const transpile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const headerSource=readFileSync(new URL('../../client/src/combat-stats-header.ts',import.meta.url),'utf8');
test('shared header renders both sides, updates health/altitude and preserves identity nodes',()=>{
 const ctx=vm.createContext({document:{createElement:()=>new Element()},createRankHelmet:()=>new Element(),rankHelmetForLevel:level=>level});
 vm.runInContext(transpile(headerSource.replace(/^import .*;\n/gm,'').replace(/export /g,''))+'\nglobalThis.header = new CombatStatsHeader();',ctx);
 const header=ctx.header;header.element.hidden=false;
 header.setIdentity({name:'PILOT',level:3},{name:'BLUEJAY',level:1,helmetVerified:false});
 const local=header.element.querySelector('.sky-duel-hud-local'),enemy=header.element.querySelector('.sky-duel-hud-opponent');
 const helmet=local.querySelector('.sky-duel-hud-helmet').children[0];
 header.setIdentity({name:'PILOT',level:3},{name:'BLUEJAY',level:1,helmetVerified:false});
 assert.equal(local.querySelector('.sky-duel-hud-helmet').children[0],helmet);
 header.updateTelemetry(175,1200,50,2456);
 assert.equal(local.querySelector('.sky-duel-hud-health-value').textContent,'175');
 assert.equal(enemy.querySelector('.sky-duel-hud-health-value').textContent,'50');
 assert.equal(enemy.querySelector('.sky-duel-hud-altitude-value').textContent,'2,456 FT');
 const guidance=enemy.querySelector('.sky-duel-hud-altitude-guidance');
 assert.equal(guidance.hidden,true);
 header.setOpponentGuidance('↑ FLY UP 1,200 FT');
 assert.equal(guidance.hidden,false);
 assert.equal(guidance.textContent,'↑ FLY UP 1,200 FT');
 assert.equal(enemy.querySelector('.sky-duel-hud-altitude-value').textContent,'2,456 FT');
 header.setOpponentGuidance('');
 assert.equal(guidance.hidden,true);
 header.updateTelemetry(175,1200);
 assert.equal(enemy.querySelector('.sky-duel-hud-health-value').textContent,'—');
});
const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const update=main.slice(main.indexOf('function guidanceOpponent('),main.indexOf('let nextSkyDuelHudUpdateAt'));
const missions=[journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18];
function context(mission){
 const values={};const enemy={cityId:'dallas',entityType:'player',timeSinceUpdate:0,targetPosition:{x:4_000,y:5_200,z:0},aircraftType:mission===journeyDallas16?'privateJet':mission.enemyAircraft,playerId:'enemy',displayName:'ENEMY',lifeState:'alive',health:70,altitudeMeters:500};
 const ctx=vm.createContext({missionStartCountdownStartedAt:null,missionStartCountdownPending:false,journeyPaused:false,flightDialogOpen:()=>false,aircraftDefinitions:{trainer:{callsign:'BLUEJAY'},privateJet:{callsign:'NIGHTOWL'},cargo:{callsign:'MAMMOTH'},fighter:{callsign:'FIREHAWK'}},journeyCombatMissions:missions,journeyDallas16,journeyMode:true,journeyAttempt:{missionId:mission.id,status:'RACING',targetId:'enemy',secondaryTargetId:'second',targetHealth:55,enemyHealths:[70,40],deadlineAt:Date.now()+120000},runStarted:true,crashed:false,launchCinematicBlocksInput:()=>false,performance:{now:()=>1000},nextJourneyCombatHudUpdateAt:0,selectedCombatTarget:null,remotePlayers:new Map([['enemy',enemy]]),serverProfile:{pilotName:'PILOT',pilotProgress:{level:3}},health:150,altitudeAboveTerrain:()=>400,METERS_TO_FEET:3.28084,WORLD_METERS_PER_UNIT:1,journeyServerTimeOffset:0,cityId:'dallas',remoteStateStaleSeconds:3,airplane:{position:{x:0,y:4_000,z:0}},horizontalDistanceSquared,isFiniteGuidancePosition,opponentAltitudeGuidance,connectionReady:()=>true,localLifeState:'alive',flightExitPending:false,tutorialMenuOpen:()=>false,aircraftVictory:undefined,groundPlaneY:()=>0,skyDuelUi:{canGuideOpponent:()=>true},flightGameRoot:{classList:{toggle:(_,visible)=>values.visible=visible}},journeyCombatHeader:{element:{hidden:true},clock:{textContent:''},setIdentity:(_,opponent)=>values.opponent=opponent,setOpponentGuidance:text=>values.guidance=text,updateTelemetry:(...args)=>values.telemetry=args}});
 vm.runInContext(transpile(update),ctx);return {ctx,values,enemy};
}
for(const mission of missions)test(`${mission.name}: shared header uses mission health and hides outside active gameplay`,()=>{
 const {ctx,values}=context(mission);vm.runInContext('updateJourneyCombatHeader()',ctx);
 assert.equal(values.visible,true);assert.equal(values.telemetry[2],mission===journeyDallas16?70:55);assert.equal(values.telemetry[3],500*3.28084);
 assert.equal(values.guidance,'↑ FLY UP 3,900 FT');
 ctx.journeyAttempt.status='COMPLETED';vm.runInContext('updateJourneyCombatHeader()',ctx);assert.equal(values.visible,false);assert.equal(values.guidance,'');
 ctx.journeyAttempt.status='RACING';ctx.launchCinematicBlocksInput=()=>true;vm.runInContext('updateJourneyCombatHeader()',ctx);assert.equal(values.visible,false);
});
test('M10 changes to the remaining live opponent and its own health',()=>{
 const {ctx,values,enemy}=context(journeyDallas16);enemy.lifeState='destroyed';
 ctx.remotePlayers.set('second',{...enemy,aircraftType:'trainer',playerId:'second',displayName:'SECOND',lifeState:'alive',health:40,altitudeMeters:600,targetPosition:{x:2000,y:3700,z:0}});
 vm.runInContext('updateJourneyCombatHeader()',ctx);assert.equal(values.opponent.name,'BLUEJAY');assert.equal(values.telemetry[2],40);
});
test('Sky Duel and Journey instantiate the same header without duplicating its markup',()=>{
 const duel=readFileSync(new URL('../../client/src/sky-duel-ui.ts',import.meta.url),'utf8');
 assert.match(duel,/new CombatStatsHeader\(/);assert.match(main,/new CombatStatsHeader\(/);
 assert(!duel.includes("heart.src = '/media/hud/health.png'"));assert(!main.includes("heart.src = '/media/hud/health.png'"));
});

test('mission runway approach shows the header before throttle or takeoff starts the flight',()=>{
 const {ctx,values}=context(journeyDallas14);
 ctx.journeyAttempt.status='APPROACH';ctx.journeyAttempt.deadlineAt=null;ctx.runStarted=false;
 vm.runInContext('updateJourneyCombatHeader()',ctx);
 assert.equal(values.visible,true);assert.equal(ctx.journeyCombatHeader.clock.textContent,'03:00');assert.equal(values.guidance,'');
});

for(const mission of missions)test(`${mission.name}: countdown uses the combat header and the plain aircraft callsign`,()=>{
 const {ctx,values}=context(mission);
 ctx.missionStartCountdownStartedAt=100;ctx.launchCinematicBlocksInput=()=>true;
 ctx.journeyAttempt.status='READY';ctx.journeyAttempt.deadlineAt=null;ctx.runStarted=false;
 vm.runInContext('updateJourneyCombatHeader()',ctx);
 assert.equal(values.visible,true);
 const type=mission===journeyDallas16?'privateJet':mission.enemyAircraft;
 assert.equal(values.opponent.name,ctx.aircraftDefinitions[type].callsign);assert.equal(values.guidance,'');
 ctx.journeyPaused=true;vm.runInContext('updateJourneyCombatHeader()',ctx);assert.equal(values.visible,false);
});


test('guidance uses scaled X/Z and world height, with strict finite range and separation checks', () => {
 const player = {x:0,y:1000,z:0};
 const guide = (x, feet, z = 0) => opponentAltitudeGuidance(player,{x,y:1000+feet,z},2,1);
 assert.equal(guide(2000,1200),'↑ FLY UP 1,200 FT');
 assert.equal(guide(2000,-900),'↓ FLY DOWN 900 FT');
 assert.equal(guide(3500,1200),'');
 assert.equal(guide(3000,300),'');
 assert.equal(guide(3000,301),'↑ FLY UP 300 FT');
 assert.equal(guide(1800,1198,2400),'↑ FLY UP 1,200 FT');
 assert.equal(guide(1801,1198,2400),'');
 assert.equal(guide(Infinity,1200),'');
 assert.equal(guide(2000,NaN),'');
 assert.equal(opponentAltitudeGuidance(player,undefined,1,3.28084),'');
 assert.equal(opponentAltitudeGuidance(player,null,1,3.28084),'');
 assert.equal(opponentAltitudeGuidance(player,{x:1,y:Infinity,z:0},1,3.28084),'');
});

test('M10 uses horizontal proximity until a living assigned target is selected', () => {
 const {ctx,values,enemy}=context(journeyDallas16);
 const second={...enemy,playerId:'second',aircraftType:'trainer',targetPosition:{x:2000,y:1500,z:0}};
 ctx.remotePlayers.set('second',second);
 const tick=()=>vm.runInContext('nextJourneyCombatHudUpdateAt=0; updateJourneyCombatHeader()',ctx);
 tick();
 assert.equal(values.opponent.name,'BLUEJAY');
 assert.equal(values.guidance,'↓ FLY DOWN 8,200 FT');
 ctx.selectedCombatTarget={remote:enemy};
 tick();
 assert.equal(values.opponent.name,'NIGHTOWL');
 assert.equal(values.guidance,'↑ FLY UP 3,900 FT');
 enemy.lifeState='respawning';
 tick();
 assert.equal(values.opponent.name,'BLUEJAY');
 second.timeSinceUpdate=3;
 tick();
 assert.equal(values.guidance,'');
});

test('guidance clears for menus, retry, and out-of-scope Journey missions', () => {
 const {ctx,values}=context(journeyDallas13);
 const tick=()=>vm.runInContext('nextJourneyCombatHudUpdateAt=0; updateJourneyCombatHeader()',ctx);
 tick();
 assert.equal(values.guidance,'↑ FLY UP 3,900 FT');
 ctx.tutorialMenuOpen=()=>true;
 tick();assert.equal(values.guidance,'');
 ctx.tutorialMenuOpen=()=>false;
 ctx.journeyAttempt.status='READY';
 tick();assert.equal(values.guidance,'');
 ctx.journeyAttempt.status='RACING';
 tick();assert.equal(values.guidance,'↑ FLY UP 3,900 FT');
 ctx.journeyAttempt.missionId='outside-sky-hunters';
 tick();assert.equal(values.guidance,'');
});

test('Sky Duel gates both human and AI guidance on live match and current opponent state', () => {
 for (const isBot of [false,true]) {
  const {ctx,enemy}=context(journeyDallas13);
  enemy.isBot=isBot;
  const guidance=()=>vm.runInContext('skyDuelOpponentGuidance(remotePlayers.get("enemy"))',ctx);
  assert.equal(guidance(),'↑ FLY UP 3,900 FT');
  ctx.skyDuelUi.canGuideOpponent=()=>false;
  assert.equal(guidance(),'');
  ctx.skyDuelUi.canGuideOpponent=()=>true;
  enemy.lifeState='destroyed';
  assert.equal(guidance(),'');
  enemy.lifeState='respawning';
  assert.equal(guidance(),'');
  enemy.lifeState='alive';
  enemy.duelSpawnProtectedUntil=2000;
  ctx.groundPlaneY=()=>5197;
  assert.equal(guidance(),'');
  ctx.groundPlaneY=()=>5100;
  assert.equal(guidance(),'↑ FLY UP 3,900 FT');
  ctx.remotePlayers.delete('enemy');
  assert.equal(guidance(),'');
 }
});
