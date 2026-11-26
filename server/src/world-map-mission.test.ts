import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {worldMapMissionContext} from '../../client/src/world-map-mission.js';
import {journeyCategorySlots,journeyPursuitSlots} from '../../shared/journey-categories.mjs';
import {journeyCompetitiveCaptureMission,journeyDallasCapture01,journeyDallasTerritoryDefense01,journeyDallasCoinHunt01,journeyDallas01} from '../../shared/journey-mission.mjs';

const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='updateWorldMap')!;
function fixture(overrides:Record<string,unknown>={}) {
  let state:any;
  const context=vm.createContext({worldMapMissionContext,journeyDallasCapture01,journeyDallasTerritoryDefense01,journeyDallasCoinHunt01,journeyDallas01,
    journeyMode:true,journeyAttempt:{missionId:'journey-dallas-14',attemptId:'attempt',status:'RACING',targetId:'assigned'},
    skyDuelMode:false,airAssaultMode:false,trainingRequested:false,soloExploreMode:false,
    cityId:'dallas',localPlayerId:'local',kingPlayerId:null,cityEvent:null,serverProfile:{missions:{}},cityRules:{territoriesEnabled:true},
    cityHumanRoster:new Map(),humanRadarTracks:new Map(),remotePlayers:new Map(),remoteStateStaleSeconds:10,
    transportEscortInactive:(remote:any)=>Boolean(remote.inactive),primaryTerritoryColorForPlayer:()=>undefined,
    sharpshooterViews:new Map(),journeySharpshooterMission:(id:string)=>id.includes('sharpshooter'),journeyGates:null,
    airportHopDestination:()=>null,transportView:null,transportViewAttemptId:null,transportMissionHasLiveTarget:()=>true,
    journeyTransportLabel:()=> 'GIANT',monsterView:null,missionObjective:null,airplane:{position:{x:1,z:2}},
    waypoint:null,contractMapTarget:()=>null,skyChallenges:null,discoverySystem:null,territoryDefinitions:[],repairMapMarkers:[],
    worldMap:{update:(next:any)=>{state=next;}},humanHasActiveAircraft:()=>true,
    neutralTerritoryColor:'#fff',displayedTerritoryState:()=>null,territoryDisplayName:(t:any)=>t.id,
    ...overrides});
  vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nupdateWorldMap({x:0,z:-1});',context);
  return state;
}
const remote=(extra={})=>({isBot:true,cityId:'dallas',entityType:'player',lifeState:'alive',health:100,timeSinceUpdate:0,displayName:'Patty',heatLevel:0,
  plane:{visible:false,position:{x:20,z:30},rotation:{y:1},userData:{}},...extra});

test('every Journey slot keeps only its territory objectives, including results and bonus slots',()=>{
  for(const slot of [...journeyCategorySlots,...journeyPursuitSlots]) {
    const expected=journeyCompetitiveCaptureMission(slot.missionId)?.territoryIds??
      (slot.missionId===journeyDallasCapture01.id?[journeyDallasCapture01.territoryId]:slot.missionId===journeyDallasTerritoryDefense01.id?[journeyDallasTerritoryDefense01.territoryId]:[]);
    for(const status of ['READY','APPROACH','RACING','COMPLETED','FAILED']) {
      const context=worldMapMissionContext({missionId:slot.missionId,status,targetId:'enemy'},true);
      assert.deepEqual(context.territoryIds,expected,`${slot.id}: ${status}`);
      assert.equal(context.opponentIds.length,['APPROACH','RACING'].includes(status)?1:0);
    }
  }
  assert.equal(worldMapMissionContext(null,false).territoryIds,undefined);
});
test('battle map uses assigned live opponents, independent of 3D culling, and excludes unrelated/dead actors',()=>{
  const state=fixture({remotePlayers:new Map([['assigned',remote()],['ambient',remote()],['dead',remote({health:0})]]),
    cityHumanRoster:new Map([['human',{playerId:'human',displayName:'Other player'}]])});
  assert.equal(state.players.length,1);assert.equal(state.players[0].id,'assigned');
  assert.equal(state.players[0].label,'Patty');assert.equal(state.players[0].heading,1);
  assert.equal(state.territories.length,0);assert.equal(state.events.length,0);
});
test('all surviving shooting targets use current moving poses, with destroyed and old attempt targets excluded',()=>{
  const view=(x:number,extra={})=>({root:{position:{x,z:8},userData:{attemptId:'attempt',...extra}}});
  const state=fixture({journeyAttempt:{missionId:'journey-dallas-sharpshooter-05',attemptId:'attempt',status:'RACING',sharpshooter:{targets:[{stage:0},{stage:1},{stage:2}]}},
    sharpshooterViews:new Map([[0,view(40)],[1,view(60)],[2,view(80,{pendingHit:true})],[3,view(100)]])});
  assert.deepEqual(Array.from(state.objectives,(o:any)=>[o.label,o.x]),[['TARGET 1',40],['TARGET 2',60]]);
});
test('giant map includes live giant and escorts only in their active phase',()=>{
  const shared={journeyAttempt:{missionId:'journey-dallas-08',attemptId:'attempt',status:'RACING'},
    transportView:{hasState:true,position:{x:90,z:60},root:{rotation:{y:2}}},transportViewAttemptId:'attempt',
    remotePlayers:new Map([['escort',remote({plane:{position:{x:20,z:30},rotation:{y:1},userData:{rearGuardEscort:true}}})]])};
  const state=fixture(shared);assert.equal(state.objectives[0].kind,'giant');assert.equal(state.objectives[0].x,90);assert.equal(state.objectives[0].heading,2);assert.equal(state.players.length,1);
  const ended=fixture({...shared,journeyAttempt:{...shared.journeyAttempt,finalPhase:'TRANSPORT'},transportMissionHasLiveTarget:()=>false});
  assert.equal(ended.players.length,0);assert.equal(ended.objectives.length,0);
});
test('monster marker follows the actual creature and bonus round shows its own coin objective',()=>{
  const state=fixture({journeyAttempt:{missionId:'journey-dallas-19',attemptId:'attempt',status:'RACING',monsterHealth:100},
    monsterView:{combatTargetPosition:{x:321,z:654}},missionObjective:{id:'attempt:monster',position:{x:0,z:0}}});
  assert.equal(state.objectives[0].kind,'monster');assert.equal(state.objectives[0].x,321);
  const bonus=fixture({journeyAttempt:{missionId:journeyDallasCoinHunt01.id,attemptId:'attempt',status:'RACING',coinHunt:{collected:0}},missionObjective:{position:{x:10,z:20}}});
  assert.equal(bonus.objectives[0].kind,'coins');assert.equal(bonus.territories.length,0);assert.equal(bonus.players.length,0);
});
test('capture map shows exactly the configured zones and assigned opponents with live ownership',()=>{
  const missionId='journey-dallas-territory-domination-01',ids=journeyCompetitiveCaptureMission(missionId)!.territoryIds;
  const state=fixture({journeyAttempt:{missionId,attemptId:'attempt',status:'RACING',captureOpponentIds:['assigned','dead']},
    territoryDefinitions:[...ids,'unrelated'].map(id=>({id,bounds:{minX:0,maxX:10,minZ:0,maxZ:10}})),
    displayedTerritoryState:()=>({controllerId:'local',controllerName:'You',ownerColor:'#00ff00',captureProgress:1}),
    remotePlayers:new Map([['assigned',remote()],['dead',remote({lifeState:'dead'})],['ambient',remote()]])});
  assert.equal(state.territories.length,6);assert.equal(state.players.length,1);assert.equal(state.territories[0].color,'#00ff00');
});
test('free flight keeps shared city actors and territories while duel and assault use only their opponents',()=>{
  const common={journeyMode:false,remotePlayers:new Map([['bot',remote()]]),territoryDefinitions:[{id:'city',bounds:{}}]};
  assert.equal(fixture(common).players.length,1);assert.equal(fixture(common).territories.length,1);
  const duel=fixture({...common,skyDuelMode:true,skyDuelUi:{opponentEntityId:()=> 'opponent'},
    cityHumanRoster:new Map([['a',{playerId:'opponent',displayName:'Nose'}],['b',{playerId:'other'}]]),humanRadarTracks:new Map([['opponent',{x:8,z:9}]])});
  assert.equal(duel.players.length,1);assert.equal(duel.players[0].id,'opponent');assert.equal(duel.territories.length,0);
  const assault=fixture({...common,airAssaultMode:true,airAssaultUi:{activeEnemies:()=>[{id:'assault',position:{x:5,z:6},rotation:{y:1}}]},airAssaultRepairBeacons:[]});
  assert.equal(assault.players[0].id,'assault');assert.equal(assault.territories.length,0);
});
