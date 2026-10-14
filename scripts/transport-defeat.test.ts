import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TransportDefeatSequence} from '../client/src/transport-defeat.js';

test('transport crash reaches sampled terrain once, finishes after impact, and cleans bounded effects',()=>{
  const previousDocument=globalThis.document;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillStyle:''})})}});
  try{
    const scene=new THREE.Scene(),root=new THREE.Group(),level=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(48,16,44),new THREE.MeshBasicMaterial());
    level.add(mesh);root.add(level);root.scale.setScalar(8);root.position.set(0,900,0);scene.add(root);
    for(let i=0;i<4;i++){const socket=new THREE.Object3D();socket.name=`EngineSmoke_${i}`;socket.position.set((i-1.5)*10,0,0);level.add(socket);}
    const terrain=(x:number,z:number)=>30+x*.005+z*.003;
    const view=new TransportDefeatSequence(scene,root,{x:263,y:0,z:40},terrain);
    let hits=0,impactTime=0,seconds=0;view.onImpact=()=>{hits++;impactTime=seconds;};
    const camera=new THREE.PerspectiveCamera(65,2,.1,20000);camera.position.set(-800,900,600);
    const initialEffects=scene.children[1]!.children.length;
    while(!view.complete && seconds<20){seconds+=1/60;view.update(1/60);view.frame(camera,1/60);assert.ok(Number.isFinite(root.position.y));assert.equal(scene.children[1]!.children.length,initialEffects);}
    assert.equal(hits,1);assert.ok(view.complete);assert.ok(impactTime>4&&impactTime<13);assert.ok(seconds-impactTime>=3.2);assert.ok(root.position.y<250);
    view.update(10);assert.equal(hits,1);
    view.dispose();view.dispose();assert.equal(scene.children.length,1);
    mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
  }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:previousDocument});}
});
