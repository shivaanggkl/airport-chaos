import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {dallasElevationAt} from './dallas-elevation.js';
import {getTerrainHeight} from '../../client/src/dallas-world.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyAttemptStore} from './journey-attempts.js';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const start=source.indexOf('  const spawnAirportId = soloExploreMode'),selection=source.slice(start,source.indexOf(';',start)+1);
let takeoff;
function visit(node){if(ts.isIfStatement(node)&&node.getText(ast).startsWith('if (journeyAttemptId && (departure?.id === journeyDallas08.startAirportId'))takeoff=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert(takeoff);
const transform=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='expectedInitialTransform').getText(ast);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const [mission,duration,reward] of [[missions.journeyDallas25,300000,2550],[missions.journeyDallas20,330000,2700]]){
 test(`${mission.name}: actual server spawn and takeoff handoff use Love Field`,()=>{
  assert.equal(missionJourneyDetails.find(m=>m.id===mission.id).timeLimit,mission===missions.journeyDallas25?'5:00':'5:30');
  const ctx=vm.createContext({...missions,soloExploreMode:false,journeyAttempt:{missionId:mission.id},cityAirports,
   dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,dallasElevationAt(a.x,a.z)]))});
  vm.runInContext(compile(selection+transform+"\nspawn=expectedInitialTransform('dallas',0,{x:0,y:0,z:0},spawnAirportId);airportId=spawnAirportId;"),ctx);
  const love=cityAirports.dallas.find(a=>a.id==='love');assert.equal(ctx.airportId,'love');assert.equal(ctx.spawn.x,love.x);
  assert.equal(ctx.spawn.z,love.z+Math.min(love.runwayLength*.32,love.runwayLength*.5-120));
  assert(Math.abs(ctx.spawn.y-getTerrainHeight(ctx.spawn.x/3,ctx.spawn.z/3)*3)<.01,'rendered runway and authoritative elevation agree');
  const taken=new Set(),prep=new Set(['pilot']);
  vm.runInNewContext(compile(takeoff),{...missions,journeyAttemptId:'attempt',departure:love,playerId:'pilot',player:{pilotId:'pilot'},journeyStore:{get:()=>({missionId:mission.id})},playerJourneyLoveTakeoff:taken,playerJourneyRunwayPrep:prep});
  assert(taken.has('pilot'));assert(!prep.has('pilot'));
 });
 test(`${mission.name}: deadline starts at GO, reward is one-time and timeout cannot complete`,()=>{
  const directory=mkdtempSync(join(tmpdir(),'p13-contract-')),path=join(directory,'profiles.sqlite'),db=new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
  try{
   const store=new JourneyAttemptStore(path,true);
   for(const epoch of [1000,1000000]){
    let a=store.launch('pilot','trainer',epoch,mission.id);store.approach('pilot',a.attemptId,epoch+1);
    assert.equal(store.get('pilot',a.attemptId).deadlineAt,null);
    assert.equal(store.hitMonster('pilot',a.attemptId,epoch+2,25),undefined);
    a=store.startMonsterArrival('pilot',a.attemptId,epoch+30000);assert.equal(a.deadlineAt,epoch+30000+duration);
    assert.equal(store.hitMonster('other',a.attemptId,epoch+30001,25),undefined);
    assert.equal(store.acceptGate('pilot',a.attemptId,0,epoch+30001),undefined);
    for(let n=0;n<mission.bossHealth/25;n++)a=store.hitMonster('pilot',a.attemptId,epoch+31000+n*300,25);
    assert.equal(a.status,'COMPLETED');assert.equal(a.firstClearCredits,epoch===1000?reward:0);
    assert.equal(store.hitMonster('pilot',a.attemptId,epoch+80000,25),undefined);
   }
   assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,reward);
   const a=store.launch('pilot','trainer',2000000,mission.id);store.approach('pilot',a.attemptId,2000001);
   const active=store.startMonsterArrival('pilot',a.attemptId,2000002);
   assert.equal(store.hitMonster('pilot',a.attemptId,active.deadlineAt,mission.bossHealth),undefined);
   assert.equal(store.fail('pilot',a.attemptId,'TIME_UP',active.deadlineAt).status,'FAILED');
   assert.equal(store.hitMonster('pilot',a.attemptId,active.deadlineAt+1,25),undefined);
  }finally{db.close();rmSync(directory,{recursive:true,force:true});}
 });
}
