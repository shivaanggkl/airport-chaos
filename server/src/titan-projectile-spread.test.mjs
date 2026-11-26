import test from 'node:test';
import assert from 'node:assert/strict';
import {titanProjectileDirection as direction} from '../../shared/titan-projectiles.mjs';
import {pursuitWarlordSpecies as species} from './pursuit-warlord.js';
import {SpeciesRegistry} from './titan/definitions.js';

test('six-ball cluster has one aimed center and five close surrounding directions, including vertical coverage',()=>{
 for(const vector of [{x:0,y:0,z:1},{x:0,y:1,z:0},{x:3,y:4,z:5}]){
  const length=Math.hypot(vector.x,vector.y,vector.z),center={x:vector.x/length,y:vector.y/length,z:vector.z/length};
  const rounds=Array.from({length:6},(_,i)=>direction(center,i,6,.03,'cluster'));
  assert.deepEqual(rounds[0],center);assert.equal(new Set(rounds.map(v=>JSON.stringify(v))).size,6);
  for(const [i,v]of rounds.entries()){
   assert(Math.abs(Math.hypot(v.x,v.y,v.z)-1)<1e-12);
   if(i>0)assert(Math.abs(v.x*center.x+v.y*center.y+v.z*center.z-Math.cos(.03))<1e-12);
  }
  if(center.z===1){assert(Math.max(...rounds.map(v=>v.y))>.02);assert(Math.min(...rounds.map(v=>v.y))<-.02);}
 }
});

test('other monsters keep the exact existing fan directions',()=>{
 const center={x:.6,y:0,z:.8};
 for(const count of [1,3,6])for(let i=0;i<count;i++){
  const angle=(i-(count-1)/2)*.03,c=Math.cos(angle),s=Math.sin(angle);
  assert.deepEqual(direction(center,i,count,.03),{x:center.x*c+center.z*s,y:0,z:center.z*c-center.x*s});
 }
});

test('invalid spread patterns and incomplete roar timing are rejected',()=>{
 const badSpread=structuredClone(species);badSpread.abilities[0].spreadPattern='invalid';
 assert.throws(()=>new SpeciesRegistry().register(badSpread),/spread pattern/);
 const badRoar=structuredClone(species);delete badRoar.director.roarDuration;
 assert.throws(()=>new SpeciesRegistry().register(badRoar),/roar timing/);
});
