import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {cityAirports} from '../../shared/city-airports.mjs';
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

test('only visible M24 gets reversed initial state and the authoritative welcome pose',()=>{
 const start=source.indexOf('  const reverseRunway = journeyAttempt?.missionId === journeyDallas19.id;');
 const end=source.indexOf('\n\n',start);
 const ctx=vm.createContext({...missions,cityAirports,dallasAirportElevations:elevations,cityId:'dallas',spawnSlot:0,spawnPosition:{x:0,y:0,z:45},spawnAirportId:'love',airborneSpawn:undefined});
 vm.runInContext(compile(fn('expectedInitialTransform')),ctx);
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
 const ctx=vm.createContext({...missions,cityAirports,dallasAirportElevations:elevations,
  playerJourneyAttempts:new Map([['pilot','attempt']]),journeyStore:{activeSnapshot:()=>attempt},players:new Map(),
  nearestCityAirport:()=>undefined,respawnClearance:60,combatTransformFreshMs:5000});
 vm.runInContext(compile(fn('safeRespawnTransform')),ctx);
 const player={pilotId:'pilot',cityId:'dallas',position:{x:0,y:135,z:0},rotation:{y:0},spawnSlot:0};
 const reversed=ctx.safeRespawnTransform('pilot',player,10000);
 assert.equal(reversed.heading,Math.PI);assert(reversed.position.z<love.z);assert.equal(reversed.position.y,135);
 ctx.players.set('other',{...player,entityType:'player',lifeState:'alive',hasRespawnTransform:true,lastStateAt:10000,position:reversed.position});
 const alternate=ctx.safeRespawnTransform('pilot',player,10000);
 assert.equal(alternate.heading,Math.PI);assert(Math.abs(alternate.position.z-reversed.position.z)>=60);
 attempt.missionId=missions.journeyDallas22.id;
 assert.equal(ctx.safeRespawnTransform('pilot',player,10000).heading,0);
});
