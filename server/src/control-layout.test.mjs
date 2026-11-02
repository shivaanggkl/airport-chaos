import assert from 'node:assert/strict';
import test from 'node:test';
import { fitControl, controlsOverlap } from '../../client/src/control-layout-geometry.ts';
const area={width:844,height:390,left:45,right:45,top:60,bottom:18};
test('drag bounds keep the complete scaled control clear of notches, toolbar and bottom edge',()=>{
 const box={width:116,height:116};
 for(const x of [-100,0,50,100,200])for(const y of [-100,0,50,100,200]){
  const p=fitControl({x,y,scale:1.25},box,area),cx=p.x*area.width/100,cy=p.y*area.height/100;
  assert.ok(cx-box.width*p.scale/2>=area.left-1e-8);
  assert.ok(cx+box.width*p.scale/2<=area.width-area.right+1e-8);
  assert.ok(cy-box.height*p.scale/2>=area.top-1e-8);
  assert.ok(cy+box.height*p.scale/2<=area.height-area.bottom+1e-8);
 }
});
test('overlap checks use rendered sizes, saved scale and a finger gap',()=>{
 const box={width:116,height:116},p={x:50,y:50,scale:1};
 assert.equal(controlsOverlap(p,box,p,box,area),true);
 assert.equal(controlsOverlap(p,box,{...p,x:65},box,area),false);
 assert.equal(controlsOverlap(p,box,{...p,x:64},box,area),true);
});
test('saved relative positions adapt to a smaller viewport without clipping',()=>{
 const p=fitControl({x:98,y:90,scale:1.3},{width:180,height:180},{...area,width:667,height:375});
 assert.ok(p.x<98);assert.ok(p.y<90);
 assert.ok(p.y*375/100+90*p.scale<=357);
});

test('resizing packs saved controls apart while retaining all four controls',async()=>{
 const {arrangeControls}=await import('../../client/src/control-layout-geometry.ts');
 const ids=['radar','stick','throttle','fire'];
 const points={radar:{x:90,y:25,scale:1},stick:{x:70,y:70,scale:1},throttle:{x:75,y:40,scale:.95},fire:{x:75,y:78,scale:1}};
 const boxes={radar:{width:108,height:108},stick:{width:118,height:118},throttle:{width:70,height:145},fire:{width:120,height:120}};
 const result=arrangeControls(ids,points,boxes,area);assert.ok(result);
 for(const a of ids)for(const b of ids)if(a!==b)assert.equal(controlsOverlap(result[a],boxes[a],result[b],boxes[b],area),false);
 assert.deepEqual(points.stick,{x:70,y:70,scale:1});
});
