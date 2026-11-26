import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {finalWarlordSpecies,createFinalWarlordEncounter} from './final-warlord.js';
import {pursuitWarlordSpecies} from './pursuit-warlord.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {AshenWarlordModel} from '../../client/src/ashen-warlord-model.js';
import {titanAnchor} from '../../shared/titan-pose.mjs';
import {stepM19,disposeM19} from './m19-titan.js';

const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

test('only M2 doubles its physical size; health, firing and movement speed stay unchanged',()=>{
 assert.equal(finalWarlordSpecies.height,model.height*2);
 assert.equal(finalWarlordSpecies.scale,model.height*2);
 assert.equal(pursuitWarlordSpecies.height,model.height);
 assert.equal(finalWarlordSpecies.radius,pursuitWarlordSpecies.radius*2);
 assert.equal(finalWarlordSpecies.health,3000);
 assert.equal(finalWarlordSpecies.movement.run,model.height*model.clips.run.stride/model.clips.run.duration*.42);
 assert.equal(finalWarlordSpecies.abilities[0].count,12);
 assert.equal(finalWarlordSpecies.abilities[0].projectileSpeed,pursuitWarlordSpecies.abilities[0].projectileSpeed);
 for(let i=0;i<finalWarlordSpecies.regions.length;i++){
  const larger=finalWarlordSpecies.regions[i],base=pursuitWarlordSpecies.regions[i];
  assert.equal(larger.radius,base.radius*2);
  for(const axis of ['x','y','z'])assert.equal(larger.radii[axis],base.radii[axis]*2);
 }
});

test('doubled M2 mesh, ground contact, server hit volumes and animated firing hand agree',async()=>{
 const encounter=createFinalWarlordEncounter('size-check','p',0,()=>135,[]);
 const visual=new AshenWarlordModel(source,false,true,true,true,false,finalWarlordSpecies.height);
 await visual.ready;
 try{
  let sawShot=false;
  const target=titanAnchor(encounter.frame.position,encounter.frame.yaw,{x:0,y:2500,z:12000});
  for(let i=1;i<=600;i++){
   stepM19(encounter,target,{x:0,y:0,z:0},18,i*50);
   const frame=encounter.frame;
   visual.root.position.set(frame.position.x,frame.position.y,frame.position.z);visual.root.rotation.y=frame.yaw;
   visual.setTitanPose(frame);visual.update(0,2000,0);visual.root.updateMatrixWorld(true);
   for(const [key,side] of [['hand-left','left'],['hand-right','right'],['gem',null]]){
    const point=new THREE.Vector3();if(side)visual.handPosition(side,point);else visual.corePosition(point);
    assert(point.distanceTo(new THREE.Vector3(frame.limbs[key].x,frame.limbs[key].y,frame.limbs[key].z))<.02,key+' matches authoritative doubled pose');
   }
   const body=frame.limbs.body;
   assert(encounter.engine.hitTest({x:body.x-10000,y:body.y,z:body.z},body,1),'enlarged visible body can be hit');
   sawShot ||= frame.projectiles.length>0;
  }
  assert(sawShot,'scaled monster still fires');
  assert.equal(visual.instance.scale.x,model.height*2);
 }finally{visual.dispose();disposeM19(encounter);}
});
