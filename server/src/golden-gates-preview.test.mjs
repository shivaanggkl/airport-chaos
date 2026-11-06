import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {JourneyGateSystem} from '../../client/src/journey-gates.ts';
import {journeyDallas01,journeyDallas02,journeyDallas03,journeyDallas04,journeyDallas05,journeyDallas06} from '../../shared/journey-mission.mjs';

for(const mission of [journeyDallas01,journeyDallas02,journeyDallas03,journeyDallas04,journeyDallas05,journeyDallas06]){
  test(`${mission.id} shows the active gate and a dim next gate throughout the race`,()=>{
    const scene=new THREE.Scene(),system=new JourneyGateSystem(scene,()=>0,mission);
    for(let index=0;index<mission.gates.length;index++){
      system.setProgress(index,true);system.update(.6);
      const visible=scene.children.filter(gate=>gate.visible);
      assert.deepEqual(visible.map(gate=>gate.name),mission.gates.slice(index,index+2).map((_,offset)=>`${mission.id}-gate-${index+offset+1}`));
      if(visible.length===2)assert(visible[1].children[0].material.opacity<visible[0].children[0].material.opacity);
    }
    system.dispose();
  });
}
