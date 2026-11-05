import assert from 'node:assert/strict';
import test from 'node:test';
import { CrashSequence } from '../../client/src/crash-sequence.ts';

for (const surface of ['transport', 'ground', 'obstacle', 'runway']) {
  test(`${surface} crash blasts immediately, once, before the result`, () => {
    const sequence = new CrashSequence('attempt-1', surface);
    const impact = sequence.update(0);
    assert.equal(impact.blast, true);
    assert.equal(impact.complete, false);
    assert.ok(impact.flash > 0);
    assert.equal(sequence.update(.1).blast, false);
    assert.equal(sequence.update(.96).complete, true);
  });
}

import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const code=name=>ts.transpileModule(ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

for(const ended of [false,true])test(`transport breakup uses the visible aircraft and plays once even with terminal message first: ${ended}`,()=>{
  const airplane=new THREE.Group();airplane.position.set(100,200,300);
  const group=new THREE.Group(),piece=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());group.add(piece);
  const effects=[];const c={THREE,CrashSequence,airplane,aircraftType:'fighter',crashed:ended,journeyPreflightActive:()=>false,crashSequence:null,crashPresentationStarted:false,crashPlayerWasVisible:true,journeyAttemptId:'m13',transportCrashFlash:{style:{}},
    createDestructionEffect:(position,type,scale)=>{effects.push({position:position.clone(),type,scale});return group;},playDestructionSound(){},audioManager:{playTone(){}},hapticsManager:{emit(){}}};
  runInNewContext(`${code('showCrashBlast')};${code('beginCrashPresentation')};beginCrashPresentation('transport');beginCrashPresentation('transport');`,c);
  assert.equal(effects.length,1);assert.deepEqual(effects[0].position.toArray(),[100,201,300]);assert.equal(effects[0].scale,3);
  assert.equal(c.crashSequence.surface,'transport');assert.equal(airplane.visible,false);assert.equal(piece.material.depthTest,false);assert.equal(piece.renderOrder,40);
  piece.geometry.dispose();piece.material.dispose();
});

test('pooled breakup fragments restore normal depth testing before reuse',()=>{
  const materials=Array.from({length:4},()=>new THREE.MeshBasicMaterial({depthTest:false}));
  const group=new THREE.Group(),parts=materials.slice(0,3).map(m=>new THREE.Mesh(new THREE.BoxGeometry(),m));group.add(...parts);for(const p of parts)p.renderOrder=40;
  const effect={group,flash:parts[0],fire:parts[1],smoke:parts[2],flashMaterial:materials[0],fireMaterial:materials[1],smokeMaterial:materials[2],debrisMaterial:materials[3],debris:[],elapsed:1,scale:1};
  const c={THREE,destructionEffects:[],MAX_DESTRUCTION_EFFECTS:24,destructionEffectPool:[effect],scene:new THREE.Scene(),position:new THREE.Vector3(5,6,7)};
  const result=runInNewContext(`${code('createDestructionEffect')};createDestructionEffect(position,'trainer',3);`,c);
  assert.equal(result,group);assert(materials.every(m=>m.depthTest));assert(parts.every(p=>p.renderOrder===0));assert.deepEqual(group.position.toArray(),[5,6,7]);
  for(const p of parts)p.geometry.dispose();for(const m of materials)m.dispose();
});
