import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatSpatialIndex } from './combat-spatial-index.js';
import { projectileImpactFraction } from '../../shared/projectile-collision.mjs';
test('swept broad phase includes crossing targets across negative cell boundaries and separates cities', () => {
  const same={cityId:'dallas',position:{x:-513,y:50,z:0},velocity:{x:-4000,y:0,z:0}};
  const other={...same,cityId:'milwaukee'};
  const index=new CombatSpatialIndex<typeof same>();index.rebuild([same,other]);
  const out:typeof same[]=[];index.query('dallas',{x:-380,y:50,z:-10},{x:-380,y:50,z:10},205,out);
  assert.deepEqual(out,[same]);index.rebuild([]);index.query('dallas',same.position,same.position,10,out);assert.equal(out.length,0);
});
test('broad phase preserves every exact swept hit and its earliest fraction', () => {
  let seed=124;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const targets=Array.from({length:100},(_,id)=>({id,cityId:id%3?'dallas':'milwaukee',position:{x:rand()*4000-2000,y:rand()*1000,z:rand()*4000-2000},velocity:{x:rand()*2000-1000,y:rand()*300-150,z:rand()*2000-1000}}));
  const index=new CombatSpatialIndex<typeof targets[number]>();index.rebuild(targets);const out:typeof targets=[];
  const radius=170,delta=.05,padding=radius+Math.max(...targets.map(t=>Math.hypot(t.velocity.x,t.velocity.y,t.velocity.z)))*delta;
  for(let n=0;n<500;n++){
    const start={x:rand()*4000-2000,y:rand()*1000,z:rand()*4000-2000},end={x:start.x+rand()*200-100,y:start.y+rand()*30-15,z:start.z+rand()*200-100};
    const hit=(t:typeof targets[number])=>projectileImpactFraction(start,end,t.position,t.velocity,delta,radius);
    const all=targets.filter(t=>t.cityId==='dallas').map(t=>[t.id,hit(t)] as const).filter(t=>t[1]!==null).sort((a,b)=>a[1]!-b[1]!);
    index.query('dallas',start,end,padding,out);
    const nearby=out.map(t=>[t.id,hit(t)] as const).filter(t=>t[1]!==null).sort((a,b)=>a[1]!-b[1]!);
    assert.deepEqual(nearby,all);
  }
});
