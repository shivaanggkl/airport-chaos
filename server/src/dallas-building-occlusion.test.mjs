import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {dallasLandmarks,landmarkBounds} from '../../shared/dallas-landmarks.mjs';
import {generateDallasSkyline} from '../../shared/dallas-skyline.mjs';
import {DALLAS_WORLD_SCALE as S} from '../../shared/dallas-world-scale.mjs';
import {authoredDallasBuildings,replacedDallasFootprint,loadDallasCombatBuildings} from './dallas-collision-source.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {loadTransportBuildings} from './giant-incoming.js';
import {transportPose,transportTuning,transportFootprintRadius} from '../../shared/giant-incoming.mjs';
import {monsterArena} from '../../shared/m19-environment.mjs';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
import {monsterGeometry} from '../../shared/monster-arrival-geometry.mjs';
import {COMBAT_RANGE} from '../../shared/protocol.mjs';
import {loadMonsterDistrictBuildings,segmentBlockedByBuildings,indexBuildingsForOcclusion,monsterAttackRange} from './monster-arrival.js';
import {airports,getTerrainHeight} from '../../client/src/dallas-world.js';

function renderedLandmarks(source){
 const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true);
 const names=['addObstacle','addCityBox','addSteppedTower','addSignatureTower','addReunionTower','addDallasSkyline'];
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const materials=Object.fromEntries(['glassDark','glassBlue','glassGreen','steel','concrete','reunion'].map(name=>{const m=new THREE.MeshBasicMaterial();m.name=name;return[name,m];}));
 const terrain=(x,z)=>100+x*.001+z*.002;
 const geometries={towerFacadeStrip:new THREE.PlaneGeometry(1,1),signaturePrism:new THREE.CylinderGeometry(1,1,1,6),signatureTaper:new THREE.CylinderGeometry(.58,1,1,5),signatureNeedle:new THREE.CylinderGeometry(.25,.45,1,6)};
 const context=vm.createContext({THREE,dallasLandmarks,landmarkBounds,landmarkMaterials:materials,getTerrainHeight:terrain,dallasLocations:{lasColinas:{x:-13500,z:-9350}},...geometries});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const scene=new THREE.Scene(),bounds=[];context.addDallasSkyline(scene,bounds);
 const meshes=scene.children.map(o=>({type:o.type,geometry:o.geometry.type,parameters:o.geometry.parameters,position:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray(),material:o.material.name,count:o.count,instances:o.instanceMatrix?Array.from(o.instanceMatrix.array):undefined}));
 const snapshot=JSON.stringify({meshes,bounds});
 for(const o of scene.children)o.geometry.dispose();for(const g of Object.values(geometries))g.dispose();for(const m of Object.values(materials))m.dispose();
 return createHash('sha256').update(snapshot).digest('hex');
}

test('shared landmark definitions preserve every existing rendered shape, transform, material and collision box',()=>{
 const source=readFileSync(new URL('../../client/src/dallas-world.ts',import.meta.url),'utf8');
 // Reference captured from the unmodified QA renderer, including its collision boxes.
 assert.equal(renderedLandmarks(source),'026b9605daeb9b4fac737f0654df2f23d6f0b079e65db2a795936a9177ffc40a');
});

test('authored server occlusion matches the renderer collision envelopes after exactly one scale conversion',()=>{
 const reserved=dallasLandmarks.flatMap(b=>landmarkBounds(b,getTerrainHeight));
 const district=generateDallasSkyline(airports,reserved).map(b=>({x:b.x,z:b.z,halfX:b.width/2,halfZ:b.depth/2,height:b.height+(b.pattern===6?24:3),baseY:getTerrainHeight(b.x,b.z)}));
 const expected=[...reserved,...district].map(b=>({minX:(b.x-b.halfX)*S,maxX:(b.x+b.halfX)*S,minZ:(b.z-b.halfZ)*S,maxZ:(b.z+b.halfZ)*S,top:(b.baseY+b.height)*S}));
 const actual=authoredDallasBuildings();assert.equal(actual.length,expected.length);
 for(let i=0;i<expected.length;i++)for(const k of Object.keys(expected[i]))assert(Math.abs(actual[i][k]-expected[i][k])<1e-7,`building ${i}: ${k}`);
 for(const b of dallasLandmarks)assert(Math.abs(dallasElevationAt(b.x*S,b.z*S)-getTerrainHeight(b.x,b.z)*S)<1e-7);
});

test('both authoritative building indexes replace invisible downtown footprints and include the visible skyline',()=>{
 const authored=authoredDallasBuildings(),key=b=>JSON.stringify(b),known=new Set(authored.map(key));
 const reach=monsterAttackRange+journeyDallas19.monster.height*Math.hypot(monsterGeometry.mouth.x,monsterGeometry.mouth.z)+300;
 const first=transportPose(0),last=transportPose(transportTuning.durationMs),transportReach=COMBAT_RANGE+transportFootprintRadius;
 const coverages=[{minX:monsterArena.minX-reach,maxX:monsterArena.maxX+reach,minZ:monsterArena.minZ-reach,maxZ:monsterArena.maxZ+reach},
  {minX:first.x-transportReach,maxX:last.x+transportReach,minZ:Math.min(first.z,last.z)-transportReach,maxZ:Math.max(first.z,last.z)+transportReach}];
 for(const [index,view] of [loadMonsterDistrictBuildings(),loadTransportBuildings()].entries()){
  const buildings=Array.from(view);
  const c=coverages[index],expected=authored.filter(b=>b.maxX>=c.minX&&b.minX<=c.maxX&&b.maxZ>=c.minZ&&b.minZ<=c.maxZ);
  assert(expected.length>0);
  assert.deepEqual(buildings.filter(b=>known.has(key(b))),[...new Map(expected.map(b=>[key(b),b])).values()],'every visible authored envelope inside this loader coverage is indexed');
  for(const b of buildings.filter(b=>replacedDallasFootprint(b.minX,b.maxX,b.minZ,b.maxZ)))assert(known.has(key(b)),'no hidden raw-map footprint remains downtown');
  const target=expected[0],x=(target.minX+target.maxX)/2,z=(target.minZ+target.maxZ)/2;
  assert.equal(segmentBlockedByBuildings({x:x-1,y:target.top-2,z},{x:x+1,y:target.top-2,z},buildings),true);
 }
 assert.equal(replacedDallasFootprint(-50,50,-50,50),true);
 assert.equal(replacedDallasFootprint(-50000,-49900,-50000,-49900),false);
});


test('overlapping mission coverage shares one set of surfaces without losing collision results',()=>{
 const a={minX:-42000,maxX:-39000,minZ:-29000,maxZ:-27000},b={minX:-41000,maxX:-38000,minZ:-29000,maxZ:-27000};
 const left=loadDallasCombatBuildings([a]),right=loadDallasCombatBuildings([b]),union=loadDallasCombatBuildings([a,b]);
 const key=x=>JSON.stringify(x),separate=[...left,...right];
 assert(left.length>0&&right.length>0);assert(union.length<left.length+right.length);
 assert.deepEqual(new Set(union.map(key)),new Set([...left,...right].map(key)));
 indexBuildingsForOcclusion(union);
 for(const row of [...left,...right].filter((_,i)=>i%29===0)){
  const x=(row.minX+row.maxX)/2,z=(row.minZ+row.maxZ)/2,start={x:x-50,y:row.top-1,z},end={x:x+50,y:row.top-1,z};
  assert.equal(segmentBlockedByBuildings(start,end,union),segmentBlockedByBuildings(start,end,separate));
 }
});
