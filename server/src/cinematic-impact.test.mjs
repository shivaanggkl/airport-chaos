import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {CinematicImpactBlast,TRANSPORT_IMPACT_SCALE} from '../../client/src/cinematic-impact.ts';
import {MonsterCityBlast} from '../../client/src/monster-timeout.ts';
import {TransportDefeatSequence} from '../../client/src/transport-defeat.ts';

test('M19 reuses M13 textured billows, fire-to-smoke transition and flash at exactly eight times the spatial scale',()=>{
 const transport=new CinematicImpactBlast(),city=new MonsterCityBlast(),p=new THREE.Vector3(10,20,30);
 assert.equal(city.scale,transport.scale*8);assert.equal(city.root.children[0].material.fog,false,'city-scale aftermath must remain visible from the wide ending camera');assert.equal(transport.scale,TRANSPORT_IMPACT_SCALE);
 for(const age of [.2,.9,1.7,3,5]){
  transport.update(age,p);city.update(age,p);assert(transport.root.position.equals(city.root.position));
  assert.equal(city.root.children.length,20,'fixed sprite count rather than extra particles for a larger blast');
  for(let i=0;i<city.root.children.length;i++){
   const a=transport.root.children[i],b=city.root.children[i];
   assert(b.position.distanceTo(a.position.clone().multiplyScalar(8))<1e-6);
   assert(Math.abs(b.scale.x-a.scale.x*8)<1e-6);assert(Math.abs(b.scale.y-a.scale.y*8)<1e-6);
   assert.equal(a.material.opacity,b.material.opacity);assert.equal(a.material.color.getHex(),b.material.color.getHex());
   if(a.isSprite){assert(b.isSprite);assert.deepEqual(a.material.map.image.data,b.material.map.image.data);}
  }
 }
 assert(city.root.children.slice(1,19).every(s=>s.material.map===city.smoke),'billows turn into smoke rather than stay a solid glowing ball');
 city.update(6,p);assert(!city.root.visible);transport.dispose();city.dispose();
});

test('M13 still falls, impacts once, runs the shared blast, frames it and disposes all owned effects',()=>{
 const scene=new THREE.Scene(),aircraft=new THREE.Group();aircraft.position.y=100;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(100,60,80),new THREE.MeshBasicMaterial());aircraft.add(mesh);scene.add(aircraft);
 const sequence=new TransportDefeatSequence(scene,aircraft,{x:100,y:0,z:0},()=>0);let impacts=0;sequence.onImpact=()=>impacts++;
 const camera=new THREE.PerspectiveCamera();camera.position.set(500,500,500);
 for(let i=0;i<450&&!sequence.complete;i++){sequence.update(.05);sequence.frame(camera,.05);assert(camera.position.toArray().every(Number.isFinite));}
 assert.equal(impacts,1);assert(sequence.complete);sequence.dispose();assert.equal(scene.children.length,1);
 mesh.geometry.dispose();mesh.material.dispose();
});
