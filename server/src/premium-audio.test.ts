import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,statSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {audioClips} from '../../client/src/audio-clips.js';

const source=readFileSync(new URL('../../client/src/audio-manager.ts',import.meta.url),'utf8');
function fixture(){
 let fetches=0,decoded=0,concurrency=0,maximum=0,created=0;
 const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
 const gain=()=>({gain:param(),connect(){},disconnect(){}});
 const context:any={state:'running',currentTime:1,createGain:gain,createStereoPanner:()=>({pan:param(),connect(){},disconnect(){}}),
  createBufferSource:()=>{created++;return {buffer:null,loop:false,onended:undefined as (()=>void)|undefined,connect(){},disconnect(){},start(){},stop(){this.onended?.();}};},
  decodeAudioData:async()=>{concurrency++;maximum=Math.max(maximum,concurrency);await Promise.resolve();decoded++;concurrency--;return {duration:1};}};
 const ctx=vm.createContext({audioClips,fetch:async()=>{fetches++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};},console,Map,Set});
 const code=ts.transpileModule(source.replace(/^import .*\n/,'').replace('export const audioManager = new AudioManager();','globalThis.manager = new AudioManager();'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace(/export \{\};?/g,'');
 vm.runInContext(code,ctx);const manager:any=ctx.manager;
 manager.context=context;manager.menuMusicDesired=false;manager.categoryGains=new Map(['ui','engine','weapons','impacts','music'].map(key=>[key,gain()]));manager.masterGain=gain();
 return {manager,context,counts:()=>({fetches,decoded,maximum,created})};
}

test('38 selected AAC assets are bounded, production-only, and have exact source attribution',()=>{
 assert.equal(Object.keys(audioClips).length,38);
 let bytes=0;
 for(const clip of Object.values(audioClips)){
  const file=new URL(`../../client/public${clip.file}`,import.meta.url);
  assert.equal(statSync(file).size,clip.bytes);assert(clip.duration>0&&clip.duration<=8);assert.match(clip.file,/\.m4a$/);assert.match(clip.sha256,/^[a-f0-9]{64}$/);bytes+=clip.bytes;
 }
 assert(bytes<1_000_000);assert.equal(readdirSync(new URL('../../client/public/audio/sonniss-2026/',import.meta.url)).length,38);
});

test('preparation deduplicates fetch/decode; hit and warning playback never fetch or decode',async()=>{
 const f=fixture();assert.equal(f.manager.playEffect('hit'),false);assert.equal(f.counts().fetches,0);
 await Promise.all([f.manager.prepareGameplay(),f.manager.prepareGameplay()]);
 assert.equal(f.counts().fetches,38);assert.equal(f.counts().decoded,38);assert(f.counts().maximum<=2);
 const before=f.counts();for(const key of ['click','toggle','confirm','back','error','credits','count','select','purchase','checkpoint','victory','hit','heavyHit','damage','thunder'])assert.equal(f.manager.playEffect(key),true);
 f.manager.playWarning();f.manager.playExplosion('giant');f.manager.playMonster('roar');
 assert.equal(f.counts().fetches,before.fetches);assert.equal(f.counts().decoded,before.decoded);assert(f.manager.voices.size<=16);
});

test('confirmed events deduplicate beyond the cooldown; mute, ad and pause suppress playback',async()=>{
 const f=fixture();await f.manager.prepareGameplay();
 f.manager.playOnce('purchase:receipt','purchase');const count=f.counts().created;
 f.context.currentTime+=10;f.manager.playOnce('purchase:receipt','purchase');assert.equal(f.counts().created,count);
 f.manager.setMuted(true);assert.equal(f.manager.playEffect('click'),false);f.manager.setMuted(false);
 f.manager.setAdActive(true);assert.equal(f.manager.playEffect('click'),false);f.manager.setAdActive(false);
 f.manager.setScenePaused(true);assert.equal(f.manager.playEffect('hit'),false);assert.equal(f.manager.voices.size,0);
 f.manager.setScenePaused(false);assert.equal(f.manager.playEffect('hit'),true);
});

test('loops stop on pause and background, resume from logical state, and unload when leaving gameplay',async()=>{
 const f=fixture();await f.manager.prepareGameplay();f.manager.gameplayAudio=true;
 for(const key of ['wind','portalHum','outdoor','lake'])f.manager.setLoop(key,.1);
 assert.equal(f.manager.loops.size,4);f.manager.setScenePaused(true);assert.equal(f.manager.loops.size,0);
 f.manager.setScenePaused(false);assert.equal(f.manager.loops.size,4);
 f.manager.setGameplayAudio(false);assert.equal(f.manager.loops.size,0);assert.equal(f.manager.desiredLoops.size,0);
 for(const key of ['wind','portalHum','outdoor','lake'])assert.equal(f.manager.clipBuffers.has(key),false);
});
