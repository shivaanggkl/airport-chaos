import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {nearestCityAirport} from '../../shared/city-registry.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functionCode=(name:string)=>ts.transpileModule(ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('Free Fly chooses the nearest airport within the current city',()=>{
 for(const city of ['dallas','milwaukee'] as const)for(const airport of cityAirports[city])assert.equal(nearestCityAirport(city,{x:airport.x+100,z:airport.z-100})?.id,airport.id);
 assert.equal(nearestCityAirport('unknown',{x:0,z:0}),undefined);
 assert.equal(nearestCityAirport('dallas',{x:NaN,z:0}),undefined);
});
test('Free Fly restart waits for authoritative recovery and rejects duplicate/in-transit requests',()=>{
 let requests=0;
 const context={portalEligible:true,portalInTransit:false,freeFlyRespawnPending:false,connectionReady:()=>true,clearHeldActions(){},sendRespawn(){requests++;},showProgressMessage(){},resetCrashPresentation(){throw new Error('must not move aircraft before server recovery');}};
 runInNewContext(functionCode('restartGame')+'\nrestartGame();restartGame();',context);
 assert.equal(requests,1);context.freeFlyRespawnPending=false;context.portalInTransit=true;
 runInNewContext('restartGame();',context);assert.equal(requests,1);
 assert.match(source,/resetCrashPresentation\(\);\s*airplane.visible = true;/);
});
test('solo firing reuses muzzle ballistics without sending a network combat packet',()=>{
 let shots=0,sounds=0;
 const context={soloExploreMode:true,localPlayerId:'pilot',localLifeState:'alive',connectionReady:()=>true,transportView:undefined,
  projectileOrigin:new THREE.Vector3(),projectileDirection:new THREE.Vector3(),
  getCurrentMuzzleTransform(origin:THREE.Vector3,direction:THREE.Vector3){origin.set(4,5,6);direction.set(0,0,-1);},
  spawnMuzzleFeedback(origin:THREE.Vector3,direction:THREE.Vector3){assert.deepEqual(origin.toArray(),[4,5,6]);assert.deepEqual(direction.toArray(),[0,0,-1]);shots++;},
  createClientShotId:()=> 'cosmetic',playFireSound(){sounds++;},socket:{send(){throw new Error('solo bullets must not reach combat');}},result:false};
 runInNewContext(functionCode('sendFireIntent')+'\nresult=sendFireIntent();',context);
 assert.equal(context.result,true);assert.equal(shots,1);assert.equal(sounds,1);
});
