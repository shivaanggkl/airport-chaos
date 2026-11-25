import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {territoriesForCity,territoryContains,territoryCaptureFlightEligible} from '../../shared/city-territories.mjs';
import {dallasElevationAt} from './dallas-elevation.js';
import {newCaptureCompetition,advanceCaptureCompetition} from './capture-competition.js';

function fixture(){
 const mission=missions.journeyDallasTerritoryDomination01,state=newCaptureCompetition([],1000,mission.territoryIds);
 const player={cityId:'dallas',pilotId:'pilot',lifeState:'alive',health:100,hasRespawnTransform:true,portalTransit:false,lastStateAt:1000,lastAcceptedTransformAt:1000,lastAcceptedPosition:{x:0,y:1000,z:0},velocity:{x:100,y:0,z:0}};
 const flight={airborne:true},attempt={missionId:mission.id,attemptId:'entry',status:'RACING',pausedAt:null,deadlineAt:1e9,captureFlight:undefined};
 const context=vm.createContext({...missions,territoriesForCity,territoryContains,territoryCaptureFlightEligible,pausedJourneyAttempts:new Set(),hasOpenPlayerSocket:()=>true,
  botTerrainHeight:(_city:string,x:number,z:number)=>dallasElevationAt(x,z),landingFlightState:new Map([['pilot',flight]]),players:new Map(),ensureCaptureCompetition:()=>state,advanceCaptureCompetition,checkpointJourneyCapture(){},journeyStore:{advanceTerritoryCapture(){return undefined;}}});
 const source=readFileSync('server/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='updateCompetitiveCapture')!;
 vm.runInContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {state,player,flight,attempt,context};
}

test('all six M5 rectangles start capture on the first fresh tick, including every edge, corner and interior grid point',()=>{
 const {state,player,attempt,context}=fixture();let now=1100;
 for(const territory of territoriesForCity('dallas').filter(item=>missions.journeyDallasTerritoryDomination01.territoryIds.some(id=>id===item.id))){
  for(let column=0;column<=10;column++)for(let row=0;row<=10;row++)for(const agl of [10,1000,10000]){
   const x=territory.bounds.minX+(territory.bounds.maxX-territory.bounds.minX)*column/10,z=territory.bounds.minZ+(territory.bounds.maxZ-territory.bounds.minZ)*row/10;
   state.territories.forEach(item=>{item.ownerId=undefined;item.capturingId=undefined;item.captureMs=0;item.contested=false;});state.updatedAt=now-100;
   player.lastStateAt=player.lastAcceptedTransformAt=now;player.lastAcceptedPosition={x,y:dallasElevationAt(x,z)+agl,z};
   context.updateCompetitiveCapture('pilot',player,attempt,now);
   const active=state.territories.filter(item=>item.captureMs>0);
   assert.equal(active.length,1,`${territory.id} (${column},${row}) AGL ${agl}`);assert.equal(active[0]!.id,territory.id);assert.equal(active[0]!.captureMs,100);now+=100;
  }
 }
});

test('M5 capture resumes with the next accepted position after a stale update and keeps outside/grounded flight ineligible',()=>{
 const {state,player,flight,attempt,context}=fixture(),territory=territoriesForCity('dallas').find(item=>item.id==='white-rock')!;
 player.lastAcceptedPosition={...territory.center,y:dallasElevationAt(territory.center.x,territory.center.z)+1000};
 let now=1100;player.lastAcceptedTransformAt=player.lastStateAt=now;context.updateCompetitiveCapture('pilot',player,attempt,now);
 const capture=state.territories.find(item=>item.id===territory.id)!;assert.equal(capture.captureMs,100);
 context.updateCompetitiveCapture('pilot',player,attempt,now+900);assert.equal(capture.captureMs,100,'stale time is not credited');
 now+=1000;player.lastAcceptedTransformAt=player.lastStateAt=now;context.updateCompetitiveCapture('pilot',player,attempt,now);assert.equal(capture.captureMs,200,'a new accepted position resumes immediately');
 player.lastAcceptedPosition.x=territory.bounds.minX-1;now+=100;player.lastAcceptedTransformAt=player.lastStateAt=now;context.updateCompetitiveCapture('pilot',player,attempt,now);assert.equal(capture.captureMs,0);
 player.lastAcceptedPosition.x=territory.center.x;flight.airborne=false;now+=100;player.lastAcceptedTransformAt=player.lastStateAt=now;context.updateCompetitiveCapture('pilot',player,attempt,now);assert.equal(capture.captureMs,0);
});


test('M5 keeps progress through low-speed samples inside every territory and resets only on an actual exit',()=>{
 for(const id of missions.journeyDallasTerritoryDomination01.territoryIds){
  const {state,player,flight,attempt,context}=fixture(),definition=territoriesForCity('dallas').find(t=>t.id===id)!;
  const capture=state.territories.find(t=>t.id===id)!;
  let now=1000;
  const step=()=>{now+=100;player.lastAcceptedTransformAt=player.lastStateAt=now;context.updateCompetitiveCapture('pilot',player,attempt,now);};
  player.lastAcceptedPosition={...definition.center,y:dallasElevationAt(definition.center.x,definition.center.z)+1000};
  for(let i=0;i<30;i++)step();
  assert.equal(capture.captureMs,3000);
  player.velocity.x=0;step();assert.equal(capture.captureMs,3000,`${id}: paused rather than reset`);
  player.velocity.x=100;step();assert.equal(capture.captureMs,3100);
  player.lastAcceptedPosition.x=definition.bounds.maxX;step();assert.equal(capture.captureMs,3200,`${id}: boundary remains inside`);
  player.lastAcceptedPosition.x+=1;step();assert.equal(capture.captureMs,0,`${id}: confirmed exit resets`);
  player.lastAcceptedPosition.x=definition.center.x;step();assert.equal(capture.captureMs,100);
  flight.airborne=false;step();assert.equal(capture.captureMs,0,'landing still ends an unfinished capture');
 }
});
