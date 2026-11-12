import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {CollisionBuildings,buildCollisionBuffer,type Building} from './collision-buildings.js';
import {loadDallasCombatBuildings as loadSource,authoredDallasBuildings} from './dallas-collision-source.js';
import {loadDallasCombatBuildings,dallasMissionBuildings} from './dallas-building-occlusion.js';
import {monsterBuildingCoverage,segmentBlockedByBuildings,monsterMotionClear,monsterJumpClear,nearbyMotionBuildings} from './monster-arrival.js';
import {transportBuildingCoverage,transportAltitude} from './giant-incoming.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {monsterGeometry} from '../../shared/monster-arrival-geometry.mjs';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
import {monsterJumpMotion} from '../../shared/monster-motion.mjs';

const fields=['minX','maxX','minZ','maxZ','top'] as const;
const coverage=[monsterBuildingCoverage(),transportBuildingCoverage()];
const originalMasks:number[]=[];
const original=loadSource(coverage,originalMasks),packed=loadDallasCombatBuildings(coverage);
const referenceCode=ts.transpileModule(readFileSync(new URL('./fixtures/collision-reference.ts.txt',import.meta.url),'utf8').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const legacy=runInNewContext(`${referenceCode}; ({indexBuildingsForOcclusion,segmentBlockedByBuildings,monsterMotionClear,monsterJumpClear,nearbyMotionBuildings});`,{monsterGeometry,journeyDallas19,monsterAttack:{jumpHeight:monsterJumpMotion.height}});
legacy.indexBuildingsForOcclusion(original);
let seed=12345;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const empty=():Building=>({minX:0,maxX:0,minZ:0,maxZ:0,top:0});

test('every original Float64 building envelope survives exactly, with only exact duplicates removed',()=>{
  const order=Uint32Array.from({length:original.length},(_,i)=>i);
  const compare=(a:Building,b:Building)=>{for(const k of fields){if(a[k]!==b[k])return a[k]-b[k];if(Object.is(a[k],-0)!==Object.is(b[k],-0))return Object.is(a[k],-0)?-1:1;}return 0;};
  order.sort((a,b)=>compare(original[a]!,original[b]!));
  const packedOrder=Uint32Array.from({length:packed.length},(_,i)=>i),left=empty(),right=empty();
  packedOrder.sort((a,b)=>compare(packed.read(a,left),packed.read(b,right)));
  let unique=0,prior:Building|undefined,priorId=-1;
  for(const id of order){const b=original[id]!;if(prior&&compare(prior,b)===0){
      for(const mask of [1,2])if(originalMasks[id]!&mask)assert.equal(packed.hasMask(priorId,mask),true);continue;
    }
    priorId=packedOrder[unique++]!;const actual=packed.read(priorId,left);for(const mask of [1,2])if(originalMasks[id]!&mask)assert.equal(packed.hasMask(priorId,mask),true);for(const k of fields)assert.equal(Object.is(actual[k],b[k]),true,`${unique}:${k}`);prior=b;
  }
  assert.equal(unique,packed.length);assert.ok(packed.length<original.length);
  assert.equal(loadDallasCombatBuildings(),packed,'all consumers share one city dataset');
  for(const mask of [1,2] as const){const view=dallasMissionBuildings(mask);assert.equal(view.source,packed);}
});

test('new grid preserves segment, boundary, height and full 6km envelope collision decisions',()=>{
  let checks=0;
  const check=(a:{x:number;y:number;z:number},b:typeof a,padding=0)=>{
    assert.equal(segmentBlockedByBuildings(a,b,packed,padding),legacy.segmentBlockedByBuildings(a,b,original,padding),JSON.stringify({a,b,padding}));checks++;
  };
  for(let i=0;i<800;i++){
    const b=original[Math.floor(random()*original.length)]!,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2;
    for(const y of [b.top-1,b.top+1,b.top+1.000001])check({x:b.minX-1,y,z},{x:b.maxX+1,y,z});
    check({x:b.minX,y:b.top,z:b.minZ},{x:b.minX,y:b.top,z:b.minZ});
    const angle=random()*Math.PI*2,range=i%3===0?6000:random()*6000;
    check({x,y:b.top+random()*500,z},{x:x+Math.cos(angle)*range,y:b.top-50,z:z+Math.sin(angle)*range},i%7===0?24:0);
  }
  for(const b of authoredDallasBuildings().filter((_,i)=>i%1000===0))check({x:b.minX-1,y:b.top,z:b.minZ},{x:b.maxX+1,y:b.top,z:b.maxZ});
  assert.ok(checks>=4000);
});

test('monster motion, cached neighborhood and transport altitude remain identical',()=>{
  for(let i=0;i<80;i++){
    const x=-25000+random()*12000,z=-15000+random()*12000,yaw=random()*Math.PI*2,lift=i%3===0?150:0;
    assert.equal(monsterMotionClear(x,z,yaw,dallasElevationAt,packed,lift),legacy.monsterMotionClear(x,z,yaw,dallasElevationAt,original,lift));
    const a={x,z},b={x,z};
    const actual=nearbyMotionBuildings(a,packed),expected=legacy.nearbyMotionBuildings(b,original);
    assert.equal(nearbyMotionBuildings(a,packed),actual,'same cell reuses its bounded neighborhood');
    assert.equal(monsterMotionClear(x,z,yaw,dallasElevationAt,actual,lift),legacy.monsterMotionClear(x,z,yaw,dallasElevationAt,expected,lift));
    if(i<12){const encounter={x,z,yaw};const end={x:x+300,y:0,z:z+300};assert.equal(monsterJumpClear(encounter as never,end,dallasElevationAt,packed),legacy.monsterJumpClear(encounter,end,dallasElevationAt,original));}
  }
  for(const mission of [undefined,'journey-dallas-07','journey-dallas-08','journey-dallas-10','journey-dallas-11','journey-dallas-12'])
    assert.equal(transportAltitude(packed,dallasElevationAt,mission),transportAltitude(original,dallasElevationAt,mission));
});

test('collision packages are deterministic, preserve precision and fail closed on corrupt artifacts',()=>{
  const sample=[{minX:-256,maxX:256,minZ:-0,maxZ:0,top:100.00000000001},{minX:256,maxX:256,minZ:0,maxZ:256,top:200}];
  const a=buildCollisionBuffer([...sample,sample[0]!]);assert.deepEqual(a,buildCollisionBuffer([...sample,sample[0]!]));
  const data=new CollisionBuildings(a);assert.equal(data.length,2);assert.equal(Object.is(data.read(0,empty()).minZ,-0),true);
  assert.equal(data.read(0,empty()).top,sample[0]!.top);
  const damaged=Buffer.from(a);damaged[128]^=1;assert.throws(()=>new CollisionBuildings(damaged),/checksum/);
  assert.throws(()=>new CollisionBuildings(a.subarray(0,a.length-1)),/length/);
  const version=Buffer.from(a);version.writeUInt32LE(99,8);assert.throws(()=>new CollisionBuildings(version),/version/);
  const emptyData=new CollisionBuildings(buildCollisionBuffer([]));assert.equal(emptyData.query(-1,1,-1,1,()=>true),false);
  // Stamp rollover cannot make a building temporarily invisible.
  (data as unknown as {stamp:number}).stamp=0xffffffff;
  assert.equal(data.query(-256,256,-1,256,()=>true),true);
});
