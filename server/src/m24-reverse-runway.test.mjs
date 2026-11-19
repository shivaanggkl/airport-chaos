import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {cityAirports} from '../../shared/city-airports.mjs';
import {journeyCategorySlot,journeyCategorySlots} from '../../shared/journey-categories.mjs';
import * as missions from '../../shared/journey-mission.mjs';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const fn=name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const love=cityAirports.dallas.find(a=>a.id==='love');
const elevations=new Map([['love',135]]);

test('M24 mirrors the runway start without changing runway dimensions or other spawn defaults',()=>{
 const ctx=vm.createContext({cityAirports,dallasAirportElevations:elevations});
 vm.runInContext(compile(fn('expectedInitialTransform')),ctx);
 for(let slot=0;slot<12;slot++){
  const normal=ctx.expectedInitialTransform('dallas',slot,{x:0,y:0,z:0},'love');
  const reverse=ctx.expectedInitialTransform('dallas',slot,{x:0,y:0,z:0},'love',true);
  assert.equal(normal.x+reverse.x,2*love.x);assert.equal(normal.z+reverse.z,2*love.z);
  assert.equal(reverse.y,135);assert(Math.abs(reverse.z-love.z)<love.runwayLength/2-120);
  assert(reverse.z<love.z);assert(normal.z>love.z);
 }
 assert.deepEqual({...ctx.expectedInitialTransform('milwaukee',0,{x:1,y:2,z:3},'central',true)},{x:1,y:2,z:3});
});

test('M24 and Chapter 3 battles get the authoritative reversed runway welcome pose',()=>{
 const start=source.indexOf('  const reverseRunway = journeyUsesReverseRunway(journeyAttempt?.missionId);');
 const end=source.indexOf('\n\n',start);
 const ctx=vm.createContext({...missions,journeyCategorySlot,cityAirports,dallasAirportElevations:elevations,cityId:'dallas',spawnSlot:0,spawnPosition:{x:0,y:0,z:45},spawnAirportId:'love',airborneSpawn:undefined});
 vm.runInContext(compile(fn('expectedInitialTransform')+fn('journeyUsesReverseRunway')),ctx);
 for(const mission of [missions.journeyDallas25,missions.journeyDallas20,missions.journeyDallas21,missions.journeyDallas22,missions.journeyDallas23,missions.journeyDallas19]){
  const local={...ctx,expectedInitialTransform:ctx.expectedInitialTransform,journeyAttempt:{missionId:mission.id}};
  vm.runInNewContext(compile(source.slice(start,end)+'\nresult={reverseRunway,initialAcceptedPosition,initialHeading};'),local);
  assert.equal(local.result.reverseRunway,mission.id===missions.journeyDallas19.id);
  assert.equal(local.result.initialHeading,mission.id===missions.journeyDallas19.id?Math.PI:0);
 }
 assert.match(source,/runwaySpawn: \{ position: initialAcceptedPosition, heading: initialHeading \}/);
 const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 assert.match(client,/journeyMode && message.runwaySpawn/);
 assert.match(client,/spawnHeading = message.runwaySpawn.heading/);
 const branch=client.slice(client.indexOf('    } else if (journeyMode && message.runwaySpawn) {')+'    } else if (journeyMode && message.runwaySpawn) {'.length,client.indexOf("    } else if (cityId === 'milwaukee') {",client.indexOf('    } else if (journeyMode && message.runwaySpawn) {')));
 const pose={message:{runwaySpawn:{position:{x:love.x,y:135,z:love.z-2592},heading:Math.PI}},spawnPosition:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},airplane:{rotation:{set(x,y,z){this.x=x;this.y=y;this.z=z;}}}};
 vm.runInNewContext(branch,pose);assert.equal(pose.heading,Math.PI);assert.equal(pose.airplane.rotation.y,Math.PI);assert.equal(pose.spawnPosition.z,love.z-2592);
});

test('M24 retry/equip recovery uses the same reversed runway direction and keeps occupied-slot checks',()=>{
 const attempt={missionId:missions.journeyDallas19.id,status:'APPROACH'};
 const ctx=vm.createContext({...missions,journeyCategorySlot,cityAirports,dallasAirportElevations:elevations,
  playerJourneyAttempts:new Map([['pilot','attempt']]),journeyStore:{activeSnapshot:()=>attempt},players:new Map(),
  nearestCityAirport:()=>undefined,respawnClearance:60,combatTransformFreshMs:5000});
 vm.runInContext(compile(fn('journeyUsesReverseRunway')+fn('safeRespawnTransform')),ctx);
 const player={pilotId:'pilot',cityId:'dallas',position:{x:0,y:135,z:0},rotation:{y:0},spawnSlot:0};
 const reversed=ctx.safeRespawnTransform('pilot',player,10000);
 assert.equal(reversed.heading,Math.PI);assert(reversed.position.z<love.z);assert.equal(reversed.position.y,135);
 ctx.players.set('other',{...player,entityType:'player',lifeState:'alive',hasRespawnTransform:true,lastStateAt:10000,position:reversed.position});
 const alternate=ctx.safeRespawnTransform('pilot',player,10000);
 assert.equal(alternate.heading,Math.PI);assert(Math.abs(alternate.position.z-reversed.position.z)>=60);
 attempt.missionId=missions.journeyDallas22.id;
 assert.equal(ctx.safeRespawnTransform('pilot',player,10000).heading,0);
});


test('all five Chapter 3 battles reverse at launch and recovery while bonus and other chapters stay unchanged',()=>{
 const ctx=vm.createContext({...missions,journeyCategorySlot,cityAirports,dallasAirportElevations:elevations,
  cityId:'dallas',spawnSlot:0,spawnPosition:{x:0,y:0,z:45},airborneSpawn:undefined,
  playerJourneyAttempts:new Map([['pilot','attempt']]),players:new Map(),nearestCityAirport:()=>undefined,
  respawnClearance:60,combatTransformFreshMs:5000});
 let attempt;
 ctx.journeyStore={activeSnapshot:()=>attempt};
 vm.runInContext(compile(fn('journeyUsesReverseRunway')+fn('expectedInitialTransform')+fn('safeRespawnTransform')),ctx);
 const battles=journeyCategorySlots.filter(slot=>slot.categoryId==='plane-battles'&&slot.kind==='main');
 assert.equal(battles.length,5);
 const start=source.indexOf('  const reverseRunway = journeyUsesReverseRunway(journeyAttempt?.missionId);');
 const end=source.indexOf('\n\n',start);
 for(const slot of battles){
  const mission=Object.values(missions).find(value=>value?.id===slot.missionId&&value.startAirportId);
  assert.equal(mission.startAirportId,'love',slot.id);
  const airport=cityAirports.dallas.find(airport=>airport.id===mission.startAirportId);
  assert.ok(ctx.journeyUsesReverseRunway(slot.missionId));
  const local={...ctx,journeyAttempt:{missionId:slot.missionId},spawnAirportId:airport.id};
  vm.runInNewContext(compile(source.slice(start,end)+'\nresult={reverseRunway,initialAcceptedPosition,initialHeading};'),local);
  assert.equal(local.result.initialHeading,airport.heading+Math.PI);
  const normal=ctx.expectedInitialTransform('dallas',0,{x:0,y:0,z:45},airport.id);
  assert.ok(Math.abs(local.result.initialAcceptedPosition.x+normal.x-2*airport.x)<1e-7);
  assert.ok(Math.abs(local.result.initialAcceptedPosition.z+normal.z-2*airport.z)<1e-7);
  for(const status of ['APPROACH','RACING']){
   attempt={missionId:slot.missionId,status};
   const recovered=ctx.safeRespawnTransform('pilot',{pilotId:'pilot',cityId:'dallas',position:normal,spawnSlot:0},10000);
   assert.equal(recovered.heading,airport.heading+Math.PI);
  }
 }
 for(const slot of journeyCategorySlots.filter(slot=>slot.kind==='bonus'||!['plane-battles','dr-boss'].includes(slot.categoryId)))
  assert.equal(ctx.journeyUsesReverseRunway(slot.missionId),false,slot.id);
 assert.equal(ctx.journeyUsesReverseRunway(),false);
});


test('Chapter 3 hostility requires Love Field departure proof, not the previous airports',()=>{
 const ctx=vm.createContext({...missions,cityAirports,playerJourneyDfwTakeoff:new Set(['pilot']),playerJourneyLoveTakeoff:new Set(),
  playerJourneyExecutiveTakeoff:new Set(['pilot']),playerJourneyAddisonTakeoff:new Set(),playerJourneyRunwayPrep:new Set(),botTerrainHeight:()=>0});
 vm.runInContext(compile(fn('skyHunterDepartureReady')),ctx);
 const pilot={position:{x:love.x+2000,y:500,z:love.z}};
 for(const mission of [missions.journeyDallas14,missions.journeyDallas16,missions.journeyDallas17,missions.journeyDallas18]){
  assert.equal(ctx.skyHunterDepartureReady('pilot',pilot,mission.id),false);
  ctx.playerJourneyLoveTakeoff.add('pilot');
  assert.equal(ctx.skyHunterDepartureReady('pilot',pilot,mission.id),true);
  ctx.playerJourneyLoveTakeoff.clear();
 }
 assert.match(source,/active.missionId === journeyDallas16.id && !playerJourneyLoveTakeoff.has\(ownerId\)/);
 assert.match(source,/attempt.missionId===journeyDallas16.id&&\(!playerJourneyLoveTakeoff.has\(pilotId\)/);
});
