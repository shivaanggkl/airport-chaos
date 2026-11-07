import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {COORDINATED_BANK_CAP,stepCoordinatedBank} from '../../shared/flight-control-rules.mjs';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const calculation=source.match(/  const localPitch = [^;]+;/)?.[0];assert(calculation);
const localPitch=new Function('pitch','roll',calculation+'return localPitch;');
const delta=1/60;
function step(plane,pitch,bank,target,rate){
  const current=localPitch(pitch,bank);
  plane.rotation.set(pitch,0,bank,'YXZ');
  plane.rotateX(THREE.MathUtils.clamp(target-current,-rate*delta,rate*delta));
  return plane.rotation.x;
}
test('body-axis pitch agrees with the actual aircraft basis at level, steep bank and inverted attitudes',()=>{
  const plane=new THREE.Object3D(),forward=new THREE.Vector3(),up=new THREE.Vector3();
  for(const pitch of [-.8,-.28,0,.3,.8])for(const bank of [-Math.PI,-COORDINATED_BANK_CAP,0,COORDINATED_BANK_CAP,Math.PI]){
    plane.rotation.set(pitch,.7,bank,'YXZ');
    forward.set(0,0,-1).applyQuaternion(plane.quaternion);up.set(0,1,0).applyQuaternion(plane.quaternion);
    const expected=Math.atan2(forward.y,up.y),actual=localPitch(pitch,bank);
    assert(Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)))<1e-10);
  }
});
test('holding climb or dive while banking cannot amplify nose pitch beyond the approved command',()=>{
  for(const [type,envelope] of Object.entries(aircraftFlightEnvelope))for(const bank of [-COORDINATED_BANK_CAP,-48*Math.PI/180,0,48*Math.PI/180,COORDINATED_BANK_CAP])for(const target of [envelope.maxClimbPitch,-envelope.maxDivePitch]){
    const plane=new THREE.Object3D();let pitch=0;
    for(let frame=0;frame<600;frame++){
      pitch=step(plane,pitch,bank,target,envelope.pitchRate);
      assert(Math.abs(pitch)<=Math.abs(target)+1e-6,`${type}: bank inflated pitch to ${pitch}`);
    }
    assert(Math.abs(localPitch(pitch,bank)-target)<1e-6,`${type}: pitch fails to settle`);
    const expected=Math.atan(Math.tan(target)*Math.cos(bank));
    assert(Math.abs(pitch-expected)<1e-6);
  }
});
test('bank entry, rollout and released pitch remain bounded with keyboard and full-stick turn commands',()=>{
  for(const envelope of Object.values(aircraftFlightEnvelope))for(const turn of [-1,-.9,.9,1]){
    const plane=new THREE.Object3D();let pitch=0,bank=0;
    for(let frame=0;frame<900;frame++){
      bank=stepCoordinatedBank(bank,frame<450?turn:0,delta,envelope);
      pitch=step(plane,pitch,bank,envelope.maxClimbPitch,envelope.pitchRate);
      assert(Math.abs(pitch)<=envelope.maxClimbPitch+1e-6);
    }
    assert(Math.abs(bank)<1e-6);assert(Math.abs(pitch-envelope.maxClimbPitch)<1e-6);
    for(let frame=0;frame<180;frame++)pitch=step(plane,pitch,bank,0,envelope.pitchRate);
    assert(Math.abs(pitch)<1e-6);
  }
});
