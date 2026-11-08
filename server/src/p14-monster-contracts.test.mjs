import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {dallasElevationAt} from './dallas-elevation.js';
const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const fn=name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast);
const begin=server.indexOf('  const spawnAirportId = soloExploreMode'),selection=server.slice(begin,server.indexOf(';',begin)+1);
let takeoff;
function visit(node){if(ts.isIfStatement(node)&&node.getText(ast).startsWith('if (journeyAttemptId && (departure?.id === journeyDallas08.startAirportId'))takeoff=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
export function monsterMissionContracts(mission,reward){
 test(`${mission.name}: Love Field spawn and genuine departure release runway protection`,()=>{
  assert.equal(mission.timeLimitMs,360000);assert.equal(mission.firstClearCredits,reward);
  assert.equal(missionJourneyDetails.find(m=>m.id===mission.id).timeLimit,'6:00');
  assert.equal(missionJourneyDetails.find(m=>m.id===mission.id).description,'DEFEAT THE MONSTER');
  const ctx=vm.createContext({...missions,soloExploreMode:false,journeyAttempt:{missionId:mission.id},cityAirports,
   dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,dallasElevationAt(a.x,a.z)]))});
  vm.runInContext(compile(selection+fn('expectedInitialTransform')+"\nspawn=expectedInitialTransform('dallas',0,{x:0,y:0,z:0},spawnAirportId);airportId=spawnAirportId;"),ctx);
  const love=cityAirports.dallas.find(a=>a.id==='love');assert.equal(ctx.airportId,'love');assert.equal(ctx.spawn.x,love.x);
  assert.equal(ctx.spawn.z,love.z+Math.min(love.runwayLength*.32,love.runwayLength*.5-120));
  const taken=new Set(),prep=new Set(['pilot']);
  vm.runInNewContext(compile(takeoff),{...missions,journeyAttemptId:'attempt',departure:love,playerId:'pilot',player:{pilotId:'profile'},journeyStore:{get:()=>({missionId:mission.id})},playerJourneyLoveTakeoff:taken,playerJourneyRunwayPrep:prep});
  assert(taken.has('pilot'));assert(!prep.has('pilot'));
 });
 test(`${mission.name}: no boss simulation or damage during cinematic, pause or runway preparation`,()=>{
  const attempt={missionId:mission.id,status:'APPROACH',deadlineAt:null},prep=new Set(['pilot']),paused=new Set();let steps=0;
  const encounter={playerId:'pilot',attemptId:'attempt',projectileIds:[],events:[],lastBroadcastAt:1000,frame:{position:{x:0,y:0,z:0}}};
  const ctx=vm.createContext({...missions,pausedJourneyAttempts:paused,playerJourneyRunwayPrep:prep,
   monsterEncounters:new Map([['attempt',encounter]]),players:new Map([['pilot',{pilotId:'profile',aircraftType:'trainer',lifeState:'alive'}]]),
   journeyStore:{get:()=>attempt},aircraftHitRadii:{trainer:18},stepM19:()=>steps++,projectiles:new Map(),sendToPlayer(){}});
  vm.runInContext(compile(fn('updateMonsterEncounters')),ctx);
  ctx.updateMonsterEncounters(1000);assert.equal(steps,0);
  attempt.status='RACING';attempt.deadlineAt=361000;
  ctx.updateMonsterEncounters(1000);assert.equal(steps,0,'GO must not remove runway preparation protection');
  prep.clear();ctx.updateMonsterEncounters(1000);assert.equal(steps,1);
  paused.add('attempt');ctx.updateMonsterEncounters(1050);assert.equal(steps,1);
 });
 test(`${mission.name}: GO deadline, pause/reconnect, retired objectives, timeout, retry and one-time rewards`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'p14-contract-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
  try{
   const store=new JourneyAttemptStore(path,true);
   const next=missions.journeyMissionOrder[missions.journeyMissionSlot(mission.id)];
   if(next)assert.equal(new JourneyAttemptStore(path,false).canAccessMission('pilot',next),false);
   for(const [index,epoch] of [1000,1000000].entries()){
    const launch=store.launch('pilot','trainer',epoch,mission.id);store.approach('pilot',launch.attemptId,epoch+1);
    assert.equal(store.get('pilot',launch.attemptId).deadlineAt,null);
    assert.equal(store.hitMonster('pilot',launch.attemptId,epoch+10000,25),undefined);
    const active=store.startMonsterArrival('pilot',launch.attemptId,epoch+31000);
    assert.equal(active.deadlineAt,epoch+31000+360000);
    assert.equal(store.acceptGate('pilot',launch.attemptId,0,epoch+31001),undefined);
    store.pause('pilot',launch.attemptId,epoch+32000);
    const restored=new JourneyAttemptStore(path,true),resumed=restored.resume('pilot',launch.attemptId,epoch+33000);
    assert.equal(resumed.attempt.deadlineAt,active.deadlineAt+1000);
    assert.equal(restored.hitMonster('other',launch.attemptId,epoch+34000,25),undefined);
    const result=restored.hitMonster('pilot',launch.attemptId,epoch+34000,mission.bossHealth);
    assert.equal(result.status,'COMPLETED');assert.equal(result.firstClearCredits,index===0?reward:0);
    if(next)assert.equal(new JourneyAttemptStore(path,false).canAccessMission('pilot',next),true);
    assert.equal(restored.hitMonster('pilot',launch.attemptId,epoch+34001,25),undefined);
   }
   assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,reward);
   const launch=store.launch('pilot','trainer',2000000,mission.id);store.approach('pilot',launch.attemptId,2000001);
   const active=store.startMonsterArrival('pilot',launch.attemptId,2000002);
   assert.equal(store.hitMonster('pilot',launch.attemptId,active.deadlineAt,mission.bossHealth),undefined);
   assert.equal(store.fail('pilot',launch.attemptId,'TIME_UP',active.deadlineAt).status,'FAILED');
   assert(store.progress('pilot',mission.id).completed,'timeout cannot erase historical clears');
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
 });
}

for(const [mission,reward] of [[missions.journeyDallas21,2850],[missions.journeyDallas22,3000]])monsterMissionContracts(mission,reward);
