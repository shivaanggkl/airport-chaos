import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { projectMissionObjective } from '../../client/src/objective-guidance.ts';

test('Golden Gates peripheral box uses matching side lanes and keeps front/rear targets at the bottom', () => {
  for (const [width, height, safe] of [
    [1280, 720, {left:0,right:0,top:0,bottom:0}],
    [844, 390, {left:44,right:44,top:0,bottom:21}],
  ]) {
    const camera = new THREE.PerspectiveCamera(70, width / height, .1, 20000);
    camera.updateMatrixWorld();
    const place = target => projectMissionObjective(camera, target, 200, width, height,
      [], safe, undefined, undefined, true, true);
    for (const z of [-1000,1000]) {
      const center = place(new THREE.Vector3(0,0,z));
      assert.equal(center.kind,'arrow');assert.equal(center.x,width*.5);
      assert.ok(center.y > height*.78);
      assert.ok(z < 0 ? center.angle < 0 : center.angle > 0,'front points up and rear points down');
      for (const side of [-1,1]) {
        const placement = place(new THREE.Vector3(side*2000,0,z));
        assert.ok(side < 0 ? placement.x < width*.3 : placement.x > width*.7);
        assert.ok(Math.abs(placement.y-height*.5) <= 8,'side cues stay near mid-height');
        assert.ok(placement.x >= safe.left+94 && placement.x <= width-safe.right-94);
      }
    }
    // A visible gate above the nose still has no label covering the forward view.
    const high = place(new THREE.Vector3(0,500,-1500));
    assert.equal(high.kind,'arrow');assert.ok(high.y>height*.78);
    // The active orbit camera determines left/right, rather than stale aircraft yaw.
    camera.rotation.y = Math.PI;camera.updateMatrixWorld();
    const orbited = place(new THREE.Vector3(2000,0,-1000));
    assert.ok(orbited.x<width*.3);
  }
});

test('Golden Gates peripheral box clears mission details, radar and touch controls on the requested side', () => {
  for (const [width,height,safe,obstacles] of [
    [1280,720,{left:0,right:0,top:0,bottom:0},[
      {left:12,top:84,right:352,bottom:390},
      {left:1070,top:22,right:1260,bottom:220},
      {left:300,top:675,right:1000,bottom:720},
    ]],
    [844,390,{left:44,right:44,top:0,bottom:21},[
      {left:44,top:56,right:275,bottom:170},
      {left:660,top:44,right:800,bottom:175},
      {left:50,top:260,right:220,bottom:390},
      {left:650,top:260,right:820,bottom:390},
    ]],
  ]) {
    const camera = new THREE.PerspectiveCamera(70,width/height,.1,20000);camera.updateMatrixWorld();
    const halfWidth=height<520?94:112;
    for(const side of [-1,0,1]){
      const placement=projectMissionObjective(camera,new THREE.Vector3(side*2000,0,-1000),200,
        width,height,obstacles,safe,undefined,undefined,true,true);
      assert.ok(obstacles.every(rect=>placement.x+halfWidth<=rect.left-7||placement.x-halfWidth>=rect.right+7||
        placement.y+23<=rect.top-7||placement.y-23>=rect.bottom+7),'the entire box must clear HUD/control bounds');
      if(side<0){assert.ok(placement.x<width*.3);assert.ok(placement.y-23>obstacles[0].bottom);}
      if(side>0)assert.ok(placement.x>width*.7);
      if(side===0){assert.equal(placement.x,width*.5);assert.ok(placement.y>=height*.8);}
    }
  }
  const camera=new THREE.PerspectiveCamera(70,844/390,.1,20000);camera.updateMatrixWorld();
  const crowded=projectMissionObjective(camera,new THREE.Vector3(-2000,0,-1000),200,844,390,
    [{left:0,top:0,right:280,bottom:390}],{left:44,right:44,top:0,bottom:21},undefined,undefined,true,true);
  assert.equal(crowded.x,422);assert.ok(crowded.y>390*.8,'a fully occupied side falls back below the flight view');
});
