import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {journeyDallas08,journeyDallas10,journeyDallas12} from '../../shared/journey-mission.mjs';
import {aircraftDisplayName} from '../../client/src/aircraft.ts';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const fn=name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const start=source.indexOf('            const escortTypes = arrivalEscortMission?.escortAircraft');
const end=source.indexOf('            const arrival=view.beginArrival',start);
for(const mission of [journeyDallas08,journeyDallas10,journeyDallas12])test(`${mission.name} labels every preview escort and removes stickers at handoff`,()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(58,812/375,1,10000);
 camera.position.set(0,1400,2200);camera.lookAt(0,1300,0);camera.updateMatrixWorld();
 const escorts=mission.escortAircraft.map((_,i)=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(120,60,200)));root.position.set((i%2===0?-1:1)*(1400+Math.floor(i/2)*220),1300,0);scene.add(root);return root;});
 const painted=[];let disposed=0;
 const ctx=vm.createContext({THREE,scene,camera,aircraftDisplayName,journeyDallas08,
  message:{attempt:{missionId:mission.id}},arrivalEscortMission:mission===journeyDallas08?null:mission,arrivalEscorts:escorts,
  missionCombatIntroIdentityTags:[],remotePlayers:new Map(),missionCombatIntroLabelPosition:new THREE.Vector3(),
  createPlayerIdentityTag:()=>new THREE.Sprite(new THREE.SpriteMaterial()),paintPlayerIdentityTag:(...args)=>painted.push(args),
  disposePlayerIdentityTag:()=>disposed++,disposeAirplaneMaterials:()=>{},
  missionCombatIntroAircraft:undefined,missionCombatIntroPath:undefined,flightLaunchState:'idle',flightLaunchStartedAt:0,
  transportView:{arrivalActive:true,arrivalShowsPlayer:false},performance:{now:()=>1000},window:{innerHeight:375,innerWidth:812},
  airplane:{position:new THREE.Vector3(-40000,0,0)},getTerrainHeight:()=>0});
 vm.runInContext(compile(fn('addMissionIntroIdentityTag')+fn('updateMissionCombatIntroIdentityTags')+fn('clearMissionCombatIntroAircraft')),ctx);
 vm.runInContext(compile(source.slice(start,end)),ctx);
 ctx.updateMissionCombatIntroIdentityTags();
 assert.equal(ctx.missionCombatIntroIdentityTags.length,escorts.length);
 for(const [i,entry]of ctx.missionCombatIntroIdentityTags.entries()){
  assert.equal(entry.label.visible,true);assert.ok(scene.children.includes(entry.label));
  assert.equal(entry.fallbackName,`${aircraftDisplayName(mission.escortAircraft[i]).toUpperCase()} ESCORT${mission===journeyDallas08?` ${i+1}`:''}`);
  assert.equal(entry.row,Math.floor(i/2));
  const label=entry.label.position.clone().project(camera),actor=escorts[i].position.clone().project(camera);
  assert.ok(label.y>actor.y);assert.ok(Math.abs(label.x)<=1-188/812+1e-8,'sticker stays inside viewport');
  assert.ok(entry.label.scale.x>0&&entry.label.scale.y>0);
  assert.equal(painted[i][9],true,'reuse gameplay mission-target sticker styling');
 }
 ctx.transportView.arrivalShowsPlayer=true;ctx.updateMissionCombatIntroIdentityTags();
 assert.ok(ctx.missionCombatIntroIdentityTags.every(entry=>!entry.label.visible));
 ctx.clearMissionCombatIntroAircraft();assert.equal(disposed,escorts.length);assert.equal(ctx.missionCombatIntroIdentityTags.length,0);
 assert.ok(scene.children.every(child=>!(child instanceof THREE.Sprite)));
});
