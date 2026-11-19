import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.ts';

test('Twin Hunters reveals both opponents before the player and hands back to the runway camera',()=>{
 const actor=(size,position)=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(...size)));root.position.set(...position);return root;};
 const player=actor([8,3,12],[-50000,10,-40000]);
 const bluejay=actor([100,40,150],[-28900,100,-35700]);
 const nightowl=actor([250,70,360],[-25100,150,-35700]);
 const roots=[player,bluejay,nightowl],originals=roots.map(root=>root.position.clone());
 const path=new CombatMissionIntroPath(bluejay,player,15,false,false,undefined,undefined,false,false,false,undefined,false,nightowl);
 const position=new THREE.Vector3(),target=new THREE.Vector3(),chase=player.position.clone().add(new THREE.Vector3(0,5,25));
 for(const aspect of [1280/589,812/375])for(const [elapsed,actor]of [[0,bluejay],[2499,bluejay],[2500,nightowl],[4000,nightowl],[5499,nightowl],[5500,player],[7000,player],[7999,player]]){
  path.sample(elapsed,position,target,chase,player.position);
  assert.ok(target.distanceTo(actor.position)<1e-6);
  assert.ok(path.streamingPosition(elapsed).distanceTo(actor.position)<1e-6);
  const camera=new THREE.PerspectiveCamera(path.fov(elapsed,58),aspect,.1,126000);
  camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();
  actor.updateWorldMatrix(true,true);
  let left=Infinity,right=-Infinity;
  const mesh=actor.children[0],vertices=mesh.geometry.getAttribute('position'),point=new THREE.Vector3();
  for(let i=0;i<vertices.count;i++){
   point.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).project(camera);
   assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1&&point.z<1);
   left=Math.min(left,point.x);right=Math.max(right,point.x);
  }
  assert.ok((right-left)/2>.1,'aircraft must be readable rather than tiny distant dots');
 }
 path.sample(10000,position,target,chase,player.position);
 assert.ok(position.distanceTo(chase)<1e-6);assert.ok(target.distanceTo(player.position)<1e-6);
 roots.forEach((root,i)=>assert.ok(root.position.equals(originals[i]),'intro cannot reposition gameplay actors'));
});

test('Twin Hunters hides only its assigned contact markers during the intro and restores them during play',()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const start=source.indexOf('    const twinHuntersIntroActor =');
 const end=source.indexOf('\n    const distance =',start);
 const code=ts.transpileModule(source.slice(start,end)+'\nresult=identityVisible;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const first={},second={},other={};
 for(const [state,mission,plane,id,expected]of [
  ['active',15,first,'first',false],['active',15,second,'second',false],['active',15,other,'other',true],
  ['complete',15,first,'first',true],['active',20,first,'first',true],['active',26,first,'first',true],
 ]){
  const ctx={flightLaunchState:state,missionCombatIntroPath:{missionNumber:mission,opponent:first},remote:{plane,playerId:id},journeyAttempt:{secondaryTargetId:'second'},remoteIdentityVisible:()=>true};
  vm.runInNewContext(code,ctx);assert.equal(ctx.result,expected);
 }
 assert.match(source,/remote\.playerProxy\.visible = identityVisible/);
});
