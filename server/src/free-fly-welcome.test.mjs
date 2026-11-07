import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const restart=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='restartGame');
let welcomeReset;
function visit(n){
 if(ts.isIfStatement(n)&&n.expression.getText(ast)==='(airAssaultMode || portalEligible) && !message.resumeFlight')welcomeReset=n;
 ts.forEachChild(n,visit);
}
visit(ast);assert(restart&&welcomeReset);
// Execute the real reset's physical-state section; its remaining statements
// update UI, effects and scoring and do not determine airborne/ground contact.
const stop=restart.body.statements.findIndex(n=>n.getText(ast)==="setFlightState('TAXI');");assert(stop>=0);
const resetBody=restart.body.statements.slice(0,stop+1).map(n=>n.getText(ast)).join('\n');
const code=ts.transpileModule(`function restartGame(notifyServer=true){${resetBody}}\nfunction acceptWelcome(){${welcomeReset.getText(ast)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function context(resumeFlight,portalEligible=true,airAssaultMode=false){
 const airplane=new THREE.Group(),spawnPosition=new THREE.Vector3(-68400,527,-36900),velocity=new THREE.Vector3(0,-2,-800),heldActions=new Set(['throttleUp']);
 airplane.position.copy(spawnPosition);
 const state={THREE,message:{resumeFlight,lifeState:'respawning',health:100,maxHealth:100,activeAircraftType:'trainer'},portalEligible,airAssaultMode,portalTransition:undefined,portalInTransit:false,freeFlyRespawnPending:false,airplane,spawnPosition,spawnHeading:0,velocity,heldActions,cinematicDirector:{resetFlight(){}},mobileInput:{setThrottleState(){}},skyChallenges:{cancel(){}},stuntCombo:{reset(){}},maxHealth:100,currentSpeed:800,verticalSpeed:-2,onGround:false,pitch:.1,roll:.2,runStarted:true,crashed:false,clearHeldActions(){heldActions.clear();},resetCrashPresentation(){},setFlightState(value){state.flightState=value;},networkLifeState:x=>x,applyLocalHull(){},showProgressMessage(){},sendRespawn(){assert.fail('a welcome must not request another respawn');},connectionReady:()=>true};
 const ctx=vm.createContext(state);vm.runInContext(code,ctx);return ctx;
}

test('fresh Free Fly welcomes reset airborne speed, attitude and input before starting at a runway',()=>{
 const c=context(undefined);c.acceptWelcome();
 assert.equal(c.onGround,true);assert.equal(c.currentSpeed,0);assert.equal(c.verticalSpeed,0);assert.equal(c.velocity.length(),0);
 assert.equal(c.pitch,0);assert.equal(c.roll,0);assert.equal(c.throttle,0);assert.equal(c.flightState,'TAXI');assert.equal(c.crashed,false);assert.equal(c.heldActions.size,0);
 assert(c.airplane.position.equals(c.spawnPosition));
});

test('recovered Free Fly and Journey airborne spawns bypass the fresh-runway reset',()=>{
 for(const c of [context({position:{x:0,y:2000,z:0}}),context(undefined,false)]){
  c.acceptWelcome();assert.equal(c.onGround,false);assert.equal(c.currentSpeed,800);assert.equal(c.heldActions.size,1);
 }
 const assault=context(undefined,false,true);assault.acceptWelcome();assert.equal(assault.onGround,true);assert.equal(assault.currentSpeed,0);
});
