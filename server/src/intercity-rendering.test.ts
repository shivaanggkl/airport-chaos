import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

const source=readFileSync('client/src/intercity-visuals.ts','utf8');
const ast=ts.createSourceFile('intercity-visuals.ts',source,ts.ScriptTarget.Latest,true);
const helper=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='prepareCityGpu')!;
const code=ts.transpileModule(helper.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

for(const fail of [false,true])test(`city GPU preparation preserves reversed depth, material writes and scene ownership${fail?' on failure':''}`,async()=>{
 const world=new THREE.Scene(),lighting=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,1000);
 lighting.add(world);
 const material=new THREE.MeshBasicMaterial(),geometry=new THREE.BoxGeometry(2,2,2),mesh=new THREE.Mesh(geometry,material);
 mesh.position.z=-10;world.add(mesh);
 let reversed=true,draws=0,autoClear=true,scissorTest=true;
 const viewport=new THREE.Vector4(0,0,844,390),scissor=viewport.clone();
 const renderer={
  get autoClear(){return autoClear;},set autoClear(value:boolean){autoClear=value;},
  getRenderTarget:()=>null,setRenderTarget:()=>{},compileAsync:async()=>{},
  getViewport:(out:THREE.Vector4)=>out.copy(viewport),getScissor:(out:THREE.Vector4)=>out.copy(scissor),
  getScissorTest:()=>scissorTest,setScissorTest:(value:boolean)=>{scissorTest=value;},
  setViewport:(...args:unknown[])=>{if(args[0] instanceof THREE.Vector4)viewport.copy(args[0]);else viewport.set(...args as [number,number,number,number]);},
  setScissor:(value:THREE.Vector4)=>scissor.copy(value),
  resetState:()=>{reversed=false;},
  render:()=>{draws++;assert.equal(material.colorWrite,false);assert.equal(material.depthWrite,false);if(fail)throw new Error('GPU upload failed');},
 };
 const context={THREE,performance,DOMException,requestAnimationFrame:(callback:()=>void)=>callback(),cityPreparationStep:async(work:Promise<unknown>)=>work,renderer,world,camera,lighting,signal:new AbortController().signal,result:undefined as Promise<void>|undefined};
 runInNewContext(code+'\nresult=prepareCityGpu(renderer,world,camera,lighting,performance.now()+10000,null,signal);',context);
 if(fail)await assert.rejects(context.result!,/GPU upload failed/);else await context.result;
 assert.equal(draws,1);assert.equal(reversed,true,'resetState disables EXT_clip_control reversed depth');
 assert.equal(material.colorWrite,true);assert.equal(material.depthWrite,true);assert.equal(material.depthTest,true);
 assert.equal(autoClear,true);assert.equal(scissorTest,true);assert.deepEqual(viewport.toArray(),[0,0,844,390]);
 assert.equal(mesh.parent,world);assert.equal(world.children.length,1);
 geometry.dispose();material.dispose();
});

test('transit aircraft fill is applied once and restores the original paint and emissive values',()=>{
 const declaration=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='IntercityVisuals') as ts.ClassDeclaration;
 const method=declaration.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)==='setTransit')!;
 const fillCode=ts.transpileModule(`class Transit { aircraftFill=new Map();inTransit=false;tunnel={};gateway={};title={};gate=undefined;aircraft=()=>plane;${method.getText(ast)} }\nconst transit=new Transit();transit.setTransit(true,'milwaukee');transit.setTransit(true,'milwaukee');`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const material=new THREE.MeshStandardMaterial({color:0xcc3030,emissive:0x102030,emissiveIntensity:.4});
 const paint=material.color.clone(),emissive=material.emissive.clone();
 const plane=new THREE.Mesh(new THREE.BoxGeometry(),material),context={THREE,plane};
 runInNewContext(fillCode,context);
 assert.deepEqual(material.color,paint);assert.ok(material.emissive.r>emissive.r*.4);
 runInNewContext('transit.setTransit(false);',context);
 assert.deepEqual(material.emissive,emissive);assert.equal(material.emissiveIntensity,.4);assert.deepEqual(material.color,paint);
 plane.geometry.dispose();material.dispose();
});
