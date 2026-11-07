import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {segmentHitsWorldObstacle} from '../../shared/world-obstacle-collision.mjs';
const wall={x:590,z:100,halfX:6,halfZ:40,height:100,baseY:0,polygon:[]};
const point=(x,y=50,z=100)=>({x,y,z});

test('all four aircraft detect thin Dallas obstacles at normal/Boost caps and 15–60 FPS',()=>{
 for(const e of Object.values(aircraftFlightEnvelope))for(const boost of [1,e.boostMaxSpeed])for(const fps of [15,20,30,60]){
  const travel=e.maxSpeed*boost*Math.min(1/fps,.05);
  assert.equal(segmentHitsWorldObstacle(point(wall.x-travel/2),point(wall.x+travel/2),wall),true);
  assert.equal(segmentHitsWorldObstacle(point(wall.x-travel/2,102),point(wall.x+travel/2,102),wall),false);
 }
});

test('sweep uses the polygon opening and the height at contact, without bounding-box false hits',()=>{
 const triangle={...wall,x:0,z:0,halfX:10,halfZ:10,polygon:[[-10,-10],[10,-10],[-10,10]]};
 assert.equal(segmentHitsWorldObstacle(point(-20,50,0),point(20,50,0),triangle),true);
 assert.equal(segmentHitsWorldObstacle(point(8,50,7),point(12,50,7),triangle),false);
 assert.equal(segmentHitsWorldObstacle(point(0,50,0),point(0,50,0),triangle),true);
 assert.equal(segmentHitsWorldObstacle(point(580,200),point(700,20),wall),false,'descent below roof occurs after passing the wall');
 assert.equal(segmentHitsWorldObstacle(point(550,110),point(630,90),wall),true);
 assert.equal(segmentHitsWorldObstacle(point(500),point(550),wall),false);
});

test('actual flight collision path sweeps every crossed grid cell and retains portal/Milwaukee behavior',()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const names=['pointInWorldPolygon','collisionCellKey','hitsWorldObstacle'];
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const context=vm.createContext({cityId:'dallas',portalInTransit:false,airplane:{position:point(640)},obstacleGrid:new Map([[0,[wall]]]),mountainGrid:new Map(),noNearbyObstacles:[],noNearbyMountains:[],waterBounds:[],COLLISION_CELL_SIZE:600,COLLISION_PADDING:3.5,segmentHitsWorldObstacle});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(context.hitsWorldObstacle(point(550)),true,'wall is in the previous cell and neither endpoint touches it');
 context.portalInTransit=true;assert.equal(context.hitsWorldObstacle(point(550)),false);
 context.portalInTransit=false;context.cityId='milwaukee';assert.equal(context.hitsWorldObstacle(point(550)),false);
 assert.match(source,/obstacleSweepStart.copy\(airplane.position\);\s*airplane.position.addScaledVector\(velocity, delta\)/);
 assert.match(source,/if \(hitsWorldObstacle\(obstacleSweepStart\)\)/);
});
