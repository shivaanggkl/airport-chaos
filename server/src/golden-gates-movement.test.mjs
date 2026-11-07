import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as missions from '../../shared/journey-mission.mjs';
import {cityRegistry} from '../../shared/city-registry.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {validateClientTransform} from './transform-validation.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyGateSystem} from '../../client/src/journey-gates.js';
import {getTerrainHeight} from '../../client/src/dallas-world.js';

const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const boundsFunction=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='buildTransformWorldBounds');
const boundsContext=vm.createContext({cityRegistry,cityAirports,territoriesForCity});
vm.runInContext(ts.transpileModule(boundsFunction.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,boundsContext);
const bounds=boundsContext.buildTransformWorldBounds('dallas');
const envelope=aircraftFlightEnvelope.trainer;
let crossingBranch;
function visit(node){
 if(ts.isIfStatement(node)&&node.expression.getText(ast).startsWith('active && journeyCountdownComplete.has')&&node.thenStatement.getText(ast).includes('journeyGateCrossing'))crossingBranch=node;
 ts.forEachChild(node,visit);
}
visit(ast);assert(crossingBranch);
const crossingCode=ts.transpileModule(crossingBranch.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const worldHeight=(x,z)=>getTerrainHeight(x/3,z/3)*3;

for(const mission of [missions.journeyDallas04,missions.journeyDallas05,missions.journeyDallas06]) {
 test(`${mission.name}: authorized spawn and all 10 rendered gate crossings survive server movement validation`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'golden-movement-')),path=join(dir,'profiles.sqlite');
  const db=new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
  const store=new JourneyAttemptStore(path,true),scene=new THREE.Scene(),view=new JourneyGateSystem(scene,worldHeight,mission);
  try {
   const launched=store.launch('pilot','trainer',1000,mission.id);
   store.approach('pilot',launched.attemptId,1100);
   let now=2000,active=store.startRookieRush('pilot',launched.attemptId,now);
   const spawn=mission.airborneSpawn;
   let position={x:spawn.x,y:dallasElevationAt(spawn.x,spawn.z)+spawn.altitude,z:spawn.z};
   assert.equal(validateClientTransform(position,position,100,envelope,0,bounds).accepted,true,'server must accept its own airborne launch');
   const updates=[];
   const ctx=vm.createContext({...missions,journeyStore:store,journeyAttemptId:active.attemptId,journeyCountdownComplete:new Set([active.attemptId]),
    player:{pilotId:'pilot'},playerId:'owner',dallasTerrain:{elevationAt:dallasElevationAt},
    sendJourneyState:(_id,a)=>{updates.push(a.gateIndex);view.setProgress(a.gateIndex,a.status==='RACING');},
    sendToPlayer:()=>assert.fail('unexpected gate altitude warning'),sendProfile:()=>{},profileStore:{getOrCreate:()=>({})}});
   for(const [index,gate] of mission.gates.entries()) {
    const rendered=scene.children[index],normal=new THREE.Vector3(0,0,1).applyQuaternion(rendered.quaternion);
    // Fly through the real rendered center and continue 150 m beyond its plane.
    const goal={x:gate.x+normal.x*150,y:rendered.position.y,z:gate.z+normal.z*150};
    const start={...position},length=Math.hypot(goal.x-start.x,goal.y-start.y,goal.z-start.z),steps=Math.ceil(length/130);
    for(let step=1;step<=steps;step++){
     const next={x:start.x+(goal.x-start.x)*step/steps,y:start.y+(goal.y-start.y)*step/steps,z:start.z+(goal.z-start.z)*step/steps};
     const validation=validateClientTransform(position,next,100,envelope,0,bounds);
     assert.equal(validation.accepted,true,`gate ${index+1}: accepted continuous flight`);
     now+=100;active=store.get('pilot',launched.attemptId);
     Object.assign(ctx,{active,previousAcceptedPosition:position,message:{position:next},stateNow:now});
     vm.runInContext(crossingCode,ctx);position=next;
    }
    assert.equal(store.get('pilot',launched.attemptId).gateIndex,index+1,`rendered gate ${index+1} advances once`);
   }
   assert.deepEqual(updates,[1,2,3,4,5,6,7,8,9,10]);
   assert.equal(store.get('pilot',launched.attemptId).status,'COMPLETED');
   assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,mission.firstClearCredits);
  }finally{view.dispose();db.close();rmSync(dir,{recursive:true,force:true});}
 });
}

test('world correction retains out-of-bounds and teleport protection',()=>{
 const p={x:0,y:3000,z:0};
 assert.equal(validateClientTransform(p,{...p,x:bounds.maxX+1},100,envelope,0,bounds).reason,'WORLD_BOUNDS');
 assert.equal(validateClientTransform(p,{...p,x:10000},100,envelope,0,bounds).reason,'DISPLACEMENT');
 const milwaukee=boundsContext.buildTransformWorldBounds('milwaukee'),airports=cityAirports.milwaukee,territories=territoriesForCity('milwaukee');
 assert.equal(milwaukee.maxX,Math.max(...airports.map(a=>a.x+a.runwayLength),...territories.map(t=>t.bounds.maxX))+30000);
 assert.equal(milwaukee.minX,Math.min(...airports.map(a=>a.x-a.runwayLength),...territories.map(t=>t.bounds.minX))-30000);
});


test('M1-M6 each display 3:00 and start an exact three-minute authoritative deadline',()=>{
 const dir=mkdtempSync(join(tmpdir(),'golden-timers-')),path=join(dir,'profiles.sqlite');
 const db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 try {
  const store=new JourneyAttemptStore(path,true);
  for(let slot=1;slot<=6;slot++){
   const mission=missions[`journeyDallas0${slot}`];
   assert.equal(mission.timeLimitMs,180000);
   assert.equal(missionJourneyDetails.find(detail=>detail.id===mission.id).timeLimit,'3:00');
   const launched=store.launch('pilot','trainer',1000,mission.id);
   store.approach('pilot',launched.attemptId,1100);
   assert.equal(store.get('pilot',launched.attemptId).deadlineAt,null);
   const started=store.startRookieRush('pilot',launched.attemptId,2000);
   assert.equal(started.deadlineAt-started.startedAt,180000);
   assert.equal(store.acceptGate('pilot',launched.attemptId,0,started.deadlineAt),undefined,'no gate credit at or after timeout');
  }
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
