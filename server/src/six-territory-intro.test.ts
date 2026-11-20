import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
import {territoriesForCity} from '../../shared/city-territories.mjs';

test('the shared screenplay presents all six territories and their actual starting ownership',()=>{
 const ids=['love-field','trinity-corridor','white-rock','las-colinas','downtown','addison'];
 const territories=ids.map(id=>territoriesForCity('dallas').find(t=>t.id===id)!);
 const player=new THREE.Group();player.position.set(-68400,500,-44736);const original=player.position.clone();
 const intro=new MissionCaptureIntroPath(territories[0]!,15000,()=>0,undefined,{player,territories,showNeutralOwnership:true,
  instructions:['Defeat the territory owners','Capture all 6 TERRITORIES','Own all 6 together to win'],
  owners:[{territoryId:'love-field',name:'NIGHTOWL GUARDIAN'},{territoryId:'trinity-corridor',name:'MAMMOTH GUARDIAN'}]});
 assert.equal(intro.durationMs,17000);assert.equal(intro.sweepMs,16500,'terrain streaming remains focused through all six territory shots');
 const position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(-68000,700,-44000),aim=player.position.clone();
 for(const [index,id]of ids.entries()){
  const time=3000+index*2000;assert.equal(intro.territoryAt(time)?.id,id);assert.equal(intro.showsTerritory(time),true);
  assert.match(intro.text(time),index<2?/GUARDIAN/:/UNASSIGNED/);assert.match(intro.text(time),/Own all 6 together to win/);assert.doesNotMatch(intro.text(time),/hold|respawn|aggressive/i);
 }
 for(let time=0;time<=intro.durationMs;time+=100){intro.sample(time,position,target,chase,aim);assert.ok([...position,...target].every(Number.isFinite));assert.deepEqual(player.position,original);}
 assert.deepEqual(position,chase);assert.deepEqual(target,aim);assert.equal(intro.showsTerritory(intro.durationMs),false);
});
