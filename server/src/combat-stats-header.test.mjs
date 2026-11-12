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
 const ctx=vm.createContext({missionStartCountdownStartedAt:null,missionStartCountdownPending:false,journeyPaused:false,flightDialogOpen:()=>false,aircraftDefinitions:{trainer:{callsign:'BLUEJAY'},privateJet:{callsign:'NIGHTOWL'},cargo:{callsign:'MAMMOTH'},fighter:{callsign:'FIREHAWK'}},journeyCombatMissions:missions,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,journeyMode:true,journeyAttempt:{missionId:mission.id,status:'RACING',targetId:'enemy',secondaryTargetId:'second',targetHealth:55,enemyHealths:[70,40],deadlineAt:Date.now()+120000},runStarted:true,crashed:false,launchCinematicBlocksInput:()=>false,performance:{now:()=>1000},nextJourneyCombatHudUpdateAt:0,selectedCombatTarget:null,remotePlayers:new Map([['enemy',enemy]]),serverProfile:{pilotName:'PILOT',pilotProgress:{level:3}},health:150,altitudeAboveTerrain:()=>400,METERS_TO_FEET:3.28084,WORLD_METERS_PER_UNIT:1,journeyServerTimeOffset:0,cityId:'dallas',remoteStateStaleSeconds:3,airplane:{position:{x:0,y:4_000,z:0}},horizontalDistanceSquared,isFiniteGuidancePosition,opponentAltitudeGuidance,connectionReady:()=>true,localLifeState:'alive',flightExitPending:false,tutorialMenuOpen:()=>false,aircraftVictory:undefined,groundPlaneY:()=>0,skyDuelUi:{canGuideOpponent:()=>true},flightGameRoot:{classList:{toggle:(_,visible)=>values.visible=visible}},journeyCombatHeader:{element:{hidden:true},clock:{textContent:''},setIdentity:(_,opponent)=>values.opponent=opponent,setOpponentGuidance:text=>values.guidance=text,updateTelemetry:(...args)=>values.telemetry=args}});
 vm.runInContext(transpile(update),ctx);return {ctx,values,enemy};
}
for(const mission of missions)test(`${mission.name}: keeps the normal header during countdown, approach and combat`,()=>{
 const {ctx,values}=context(mission);
 for(const status of ['READY','APPROACH','RACING']){
  ctx.journeyAttempt.status=status;ctx.missionStartCountdownStartedAt=status==='READY'?100:null;
  vm.runInContext('updateJourneyCombatHeader()',ctx);
  assert.equal(values.visible,false);assert.equal(ctx.journeyCombatHeader.element.hidden,true);
  assert.equal(values.guidance,'');assert.equal(values.telemetry,undefined);
 }
});
test('Sky Duel and Journey instantiate the same header without duplicating its markup',()=>{
 const duel=readFileSync(new URL('../../client/src/sky-duel-ui.ts',import.meta.url),'utf8');
 assert.match(duel,/new CombatStatsHeader\(/);assert.match(main,/new CombatStatsHeader\(/);
 assert(!duel.includes("heart.src = '/media/hud/health.png'"));assert(!main.includes("heart.src = '/media/hud/health.png'"));
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

const healthRowsSource=main.slice(main.indexOf('  const activeMissionId = journeyAttempt.missionId;',main.indexOf('const crossfireMission =')),main.indexOf('  if (legendaryMission) {',main.indexOf('  const activeMissionId = journeyAttempt.missionId;',main.indexOf('const crossfireMission ='))));
test('M10 reuses health rows for both opponents, independent damage, kills and retry',()=>{
 const rows=Array.from({length:3},()=>({row:{hidden:false,style:{setProperty(_key,value){this.percent=value;}}},name:{textContent:''},value:{textContent:''}}));
 const ctx=vm.createContext({journeyAttempt:{missionId:journeyDallas16.id,status:'RACING',enemyHealths:[225,100],crossfireKills:0},surpriseMission:false,firstContactMission:false,showdownMission:false,ironMission:false,aceMission:false,crossfireMission:true,breakoutMission:false,elevatorMission:false,escortHudMissions:[],journeyDallas16,remotePlayers:new Map(),recordEscortHudHealth:()=>{},escortHealthRows:rows,escortHudAircraft:[],escortHudHealth:[],aircraftDefinitions:{privateJet:{callsign:'NIGHTOWL'},trainer:{callsign:'BLUEJAY'}},monsterBossHud:{classList:{toggle(){}}},escortHealthHud:{classList:{toggle(){}}}});
 const render=()=>vm.runInContext(transpile('{'+healthRowsSource+'}'),ctx);
 render();
 assert.equal(rows[0].name.textContent,'NIGHTOWL');assert.equal(rows[1].name.textContent,'BLUEJAY');
 assert.equal(rows[0].value.textContent,'225 / 300 HP');assert.equal(rows[0].row.style.percent,'75%');
 assert.equal(rows[1].value.textContent,'100 / 300 HP');assert.equal(rows[2].row.hidden,true);
 ctx.journeyAttempt.crossfireKills=1;render();
 assert.equal(rows[0].value.textContent,'0 / 300 HP');assert.equal(rows[0].row.style.percent,'0%');
 assert.equal(rows[1].value.textContent,'100 / 300 HP');
 ctx.journeyAttempt.crossfireKills=0;ctx.journeyAttempt.enemyHealths=[300,300];render();
 assert.equal(rows[0].value.textContent,'300 / 300 HP');assert.equal(rows[1].value.textContent,'300 / 300 HP');
});

test('M9 shows one Mammoth HP row with authoritative damage and retry health',()=>{
 const rows=Array.from({length:3},()=>({row:{hidden:false,style:{setProperty(_key,value){this.percent=value;}}},name:{textContent:''},value:{textContent:''}}));
 const ctx=vm.createContext({journeyAttempt:{missionId:journeyDallas15.id,status:'RACING',targetHealth:225},surpriseMission:false,firstContactMission:false,showdownMission:false,ironMission:false,aceMission:true,crossfireMission:false,breakoutMission:false,elevatorMission:false,escortHudMissions:[],journeyDallas15,remotePlayers:new Map(),recordEscortHudHealth:()=>{},escortHealthRows:rows,escortHudAircraft:[],escortHudHealth:[],aircraftDefinitions:{cargo:{callsign:'MAMMOTH'}},monsterBossHud:{classList:{toggle(){}}},escortHealthHud:{classList:{toggle(){}}}});
 const render=()=>vm.runInContext(transpile('{'+healthRowsSource+'}'),ctx);
 render();assert.equal(rows[0].name.textContent,'MAMMOTH');assert.equal(rows[0].value.textContent,'225 / 300 HP');assert.equal(rows[0].row.style.percent,'75%');
 assert.equal(rows[1].row.hidden,true);assert.equal(rows[2].row.hidden,true);
 ctx.journeyAttempt.targetHealth=0;render();assert.equal(rows[0].value.textContent,'0 / 300 HP');
 ctx.journeyAttempt.targetHealth=300;render();assert.equal(rows[0].value.textContent,'300 / 300 HP');
});

test('M11 shares the opponent rows with independent Mammoth, Nightowl and Bluejay HP',()=>{
 const rows=Array.from({length:3},()=>({row:{hidden:false,style:{setProperty(_key,value){this.percent=value;}}},name:{textContent:''},value:{textContent:''}}));
 const ctx=vm.createContext({journeyAttempt:{missionId:journeyDallas17.id,status:'RACING',enemyHealths:[225,150,100],crossfireKills:0},surpriseMission:false,firstContactMission:false,showdownMission:false,ironMission:true,aceMission:false,crossfireMission:false,breakoutMission:false,elevatorMission:false,escortHudMissions:[],journeyDallas17,remotePlayers:new Map(),recordEscortHudHealth:()=>{},escortHealthRows:rows,escortHudAircraft:[],escortHudHealth:[],aircraftDefinitions:{cargo:{callsign:'MAMMOTH'},privateJet:{callsign:'NIGHTOWL'},trainer:{callsign:'BLUEJAY'}},monsterBossHud:{classList:{toggle(){}}},escortHealthHud:{classList:{toggle(){}}}});
 const render=()=>vm.runInContext(transpile('{'+healthRowsSource+'}'),ctx);
 render();
 assert.deepEqual(rows.map(r=>r.name.textContent),['MAMMOTH','NIGHTOWL','BLUEJAY']);
 assert.deepEqual(rows.map(r=>r.value.textContent),['225 / 300 HP','150 / 300 HP','100 / 200 HP']);
 assert.deepEqual(rows.map(r=>r.row.style.percent),['75%','50%','50%']);
 assert(rows.every(r=>!r.row.hidden));
 ctx.journeyAttempt.crossfireKills=5;render();
 assert.deepEqual(rows.map(r=>r.value.textContent),['0 / 300 HP','150 / 300 HP','0 / 200 HP']);
 ctx.journeyAttempt.crossfireKills=0;ctx.journeyAttempt.enemyHealths=[300,300,200];render();
 assert.deepEqual(rows.map(r=>r.value.textContent),['300 / 300 HP','300 / 300 HP','200 / 200 HP']);
});

test('M12 shares four health rows and distinguishes both Firehawks through kills and retry',()=>{
 const rows=Array.from({length:4},()=>({row:{hidden:false,style:{setProperty(_key,value){this.percent=value;}}},name:{textContent:''},value:{textContent:''}}));
 assert.match(main,/length: escortHealthRowCount/);
 assert.match(main,/Math.max\(journeyDallas18.enemies.length, \.\.\.escortHudMissions.map\(mission => mission.escortCount\)\)/);
 const ctx=vm.createContext({journeyAttempt:{missionId:journeyDallas18.id,status:'RACING',enemyHealths:[250,125,150,100],crossfireKills:0},surpriseMission:false,firstContactMission:false,showdownMission:true,ironMission:false,aceMission:false,crossfireMission:false,breakoutMission:false,elevatorMission:false,escortHudMissions:[],journeyDallas18,remotePlayers:new Map(),recordEscortHudHealth:()=>{},escortHealthRows:rows,escortHudAircraft:[],escortHudHealth:[],aircraftDefinitions:{fighter:{callsign:'FIREHAWK'},privateJet:{callsign:'NIGHTOWL'},trainer:{callsign:'BLUEJAY'}},monsterBossHud:{classList:{toggle(){}}},escortHealthHud:{classList:{toggle(){}}}});
 const render=()=>vm.runInContext(transpile('{'+healthRowsSource+'}'),ctx);
 render();
 assert.deepEqual(rows.map(r=>r.name.textContent),['FIREHAWK 1','FIREHAWK 2','NIGHTOWL','BLUEJAY']);
 assert.deepEqual(rows.map(r=>r.value.textContent),['250 / 300 HP','125 / 300 HP','150 / 200 HP','100 / 200 HP']);
 assert(rows.every(r=>!r.row.hidden));
 ctx.journeyAttempt.crossfireKills=10;render();
 assert.deepEqual(rows.map(r=>r.value.textContent),['250 / 300 HP','0 / 300 HP','150 / 200 HP','0 / 200 HP']);
 ctx.journeyAttempt.crossfireKills=0;ctx.journeyAttempt.enemyHealths=[300,300,200,200];render();
 assert.deepEqual(rows.map(r=>r.value.textContent),['300 / 300 HP','300 / 300 HP','200 / 200 HP','200 / 200 HP']);
});

for(const mission of [journeyDallas13,journeyDallas14])test(`${mission.name}: shares one HP row with authoritative damage and retry health`,()=>{
 const rows=Array.from({length:4},()=>({row:{hidden:false,style:{setProperty(_key,value){this.percent=value;}}},name:{textContent:''},value:{textContent:''}}));
 const ctx=vm.createContext({journeyAttempt:{missionId:mission.id,status:'RACING',targetHealth:mission.enemyHealth/2},surpriseMission:mission===journeyDallas14,firstContactMission:mission===journeyDallas13,showdownMission:false,ironMission:false,aceMission:false,crossfireMission:false,breakoutMission:false,elevatorMission:false,escortHudMissions:[],journeyDallas13,journeyDallas14,remotePlayers:new Map(),recordEscortHudHealth:()=>{},escortHealthRows:rows,escortHudAircraft:[],escortHudHealth:[],aircraftDefinitions:{privateJet:{callsign:'NIGHTOWL'},trainer:{callsign:'BLUEJAY'}},monsterBossHud:{classList:{toggle(){}}},escortHealthHud:{classList:{toggle(){}}}});
 const render=()=>vm.runInContext(transpile('{'+healthRowsSource+'}'),ctx);
 render();assert.equal(rows[0].name.textContent,mission===journeyDallas13?'NIGHTOWL':'BLUEJAY');assert.equal(rows[0].value.textContent,`${mission.enemyHealth/2} / ${mission.enemyHealth} HP`);assert.equal(rows[0].row.style.percent,'50%');
 assert(rows.slice(1).every(r=>r.row.hidden));
 ctx.journeyAttempt.targetHealth=0;render();assert.equal(rows[0].value.textContent,`0 / ${mission.enemyHealth} HP`);
 ctx.journeyAttempt.targetHealth=mission.enemyHealth;render();assert.equal(rows[0].value.textContent,`${mission.enemyHealth} / ${mission.enemyHealth} HP`);
});
