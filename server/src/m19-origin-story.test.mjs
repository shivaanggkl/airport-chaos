import vm from 'node:vm';
import * as journeyMissions from '../../shared/journey-mission.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {ImageStorySequence,imageStorySceneAt,IMAGE_STORY_FADE_MS} from '../../client/src/image-story.js';
import {M19_ORIGIN_STORY as scenes} from '../../client/src/m19-origin-story.js';
class Element {
  constructor(){this.children=[];this.hidden=false;this.textContent='';this.values=new Set();this.style={setProperty(){}};this.classList={add:(...v)=>v.forEach(x=>this.values.add(x)),remove:(...v)=>v.forEach(x=>this.values.delete(x))};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(){} removeAttribute(name){if(name==='src')this.src='';}
}
class StoryImage extends Element {
  static loads=[];static failures=new Set();static blocked=false;
  naturalWidth=1672;
  decode(){StoryImage.loads.push(this.src);return StoryImage.blocked?new Promise(()=>{}):StoryImage.failures.has(this.src)?Promise.reject(Error('image unavailable')):Promise.resolve();}
}
globalThis.document={createElement:()=>new Element()};globalThis.Image=StoryImage;
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const reset=()=>{StoryImage.loads=[];StoryImage.failures.clear();StoryImage.blocked=false;};
const narration=[
 'One day, a scientist named Dr. Boss was working on a secret experiment in Dallas.',
 'Dr. Boss mixed two strange liquids together.',
 'Suddenly, the mixture turned red and started bubbling!',
 "The liquid smelled so good that Dr. Boss couldn't resist taking a sip!",
 'His stomach started hurting badly, and he fell to the ground.',
 'His body began growing bigger and bigger!',
 'Dr. Boss had turned into a giant monster!',
 'Monster Dr. Boss escaped and headed straight toward downtown Dallas!',
];
test('exact numbered story, narration and durations total 27 seconds; compressed assets keep their original dimensions',()=>{
 assert.deepEqual(scenes.map(s=>s.durationSeconds),[4,3,3,4,3,3,3,4]);assert.deepEqual(scenes.map(s=>s.narration),narration);
 let start=0,bytes=0;
 for(const [index,scene] of scenes.entries()){
   assert.equal(scene.src,`/media/stories/m19-dr-boss/${index+1}.jpg`);
   assert.equal(imageStorySceneAt(scenes,start),index);assert.equal(imageStorySceneAt(scenes,start+scene.durationSeconds*1000-1),index);start+=scene.durationSeconds*1000;
   const asset=new URL('../../client/public'+scene.src,import.meta.url),data=readFileSync(asset);bytes+=statSync(asset).size;
   assert.equal(data.readUInt16BE(0),0xffd8);
   let at=2,width=0,height=0;
   while(at<data.length){const marker=data.readUInt16BE(at),length=data.readUInt16BE(at+2);if([0xffc0,0xffc1,0xffc2].includes(marker)){height=data.readUInt16BE(at+5);width=data.readUInt16BE(at+7);break;}at+=length+2;}
   assert.equal(width,index===3?1671:1672);assert.equal(height,941);
 }
 assert.equal(start,27000);assert.equal(imageStorySceneAt(scenes,27000),-1);assert(bytes<5*1024*1024);
});
test('two decoded layers play eight scenes with exact captions, no duplicate loads, stable outgoing frames, then fade and release',async()=>{
 reset();const parent=new Element(),story=new ImageStorySequence(parent,scenes);assert(await story.prepare());assert.equal(story.durationMs,27000);
 assert.equal(StoryImage.loads.length,2);let elapsed=0;
 for(let index=0;index<scenes.length;index++){
   const previous=story.currentSlot;assert(story.update(elapsed));assert.equal(story.caption.textContent,narration[index]);assert.equal(story.frame.children.filter(c=>c instanceof StoryImage).length,2);
   if(previous>=0){const outgoing=story.slots[previous];assert(outgoing.image.values.has('is-current'),'outgoing image remains opaque beneath the fade');const old=outgoing.image.src;story.update(elapsed+IMAGE_STORY_FADE_MS-1);assert.equal(outgoing.image.src,old);}
   story.update(elapsed+IMAGE_STORY_FADE_MS);await flush();elapsed+=scenes[index].durationSeconds*1000;
 }
 assert.deepEqual(StoryImage.loads,scenes.map(s=>s.src));assert.equal(story.update(27000),false);
 story.fadeOut();assert(story.element.values.has('is-leaving'));assert(story.caption.hidden);assert.equal(story.update(27000),false);
 story.dispose();story.dispose();assert.equal(parent.children.length,0);assert.equal(story.pending.size,0);
});
test('first/upcoming decode failures bypass safely; cancellation releases pending decodes and a retry starts fresh',async()=>{
 reset();StoryImage.failures.add(scenes[0].src);const parent=new Element();const initial=new ImageStorySequence(parent,scenes);assert.equal(await initial.prepare(),false);assert(initial.failed);initial.dispose();assert.equal(parent.children.length,0);
 reset();const later=new ImageStorySequence(parent,scenes);assert(await later.prepare());StoryImage.failures.add(scenes[2].src);later.update(0);later.update(4000);later.update(4250);await flush();assert(later.failed);assert.equal(later.update(4300),false);later.dispose();assert.equal(parent.children.length,0);
 reset();StoryImage.blocked=true;const cancelled=new ImageStorySequence(parent,scenes),pending=cancelled.prepare();cancelled.dispose();assert.equal(await pending,false);assert.equal(cancelled.pending.size,0);assert.equal(parent.children.length,0);
 reset();const retry=new ImageStorySequence(parent,scenes);assert(await retry.prepare());assert(retry.update(0));assert.equal(retry.caption.textContent,narration[0]);retry.dispose();
});
test('story is M19-only, shares the existing launch clock, keeps skip/countdown cleanup, and preserves complete compositions on mobile',()=>{
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const prepare=main.slice(main.indexOf('async function prepareMonsterMissionIntro'),main.indexOf('function beginFlightLaunchCinematic'));
 assert(prepare.includes('const arrivalIntro=journeyAttempt.missionId===journeyDallas25.id'));assert(prepare.indexOf('if(arrivalIntro){')<prepare.indexOf('new ImageStorySequence'));assert(prepare.includes('if(!ready){story.dispose();missionImageStory=undefined;}'));
 const render=main.slice(main.indexOf('function applyFlightLaunchCamera'),main.indexOf('function applyFlightLaunchCamera')+7500);
 assert(render.includes('elapsed=Math.max(0,elapsed-m19StoryOffsetMs)'));assert(render.includes('missionImageStory.fadeOut()'));assert(render.includes('missionImageStory.failed'));assert(render.includes('flightLaunchStartedAt=now-m19StoryOffsetMs-cut'));
 assert(!render.includes('beginFlightLaunchCinematic()'),'image-to-3D handoff does not restart the cinematic');
 const cleanup=main.slice(main.indexOf('function clearFlightLaunchPresentation'),main.indexOf('function applyFlightLaunchCamera'));
 assert(cleanup.includes('missionImageStory?.dispose();missionImageStory=undefined;m19StoryOffsetMs=0'));assert(cleanup.includes('beginMissionStartCountdown()'));assert(main.includes('flightLaunchSkipStartedAt = now'));assert(main.includes("matchMedia('(prefers-reduced-motion: reduce)')"));
 const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
 assert(css.includes('aspect-ratio: 16 / 9'));assert(css.includes('object-fit: contain'));assert(css.includes('scale(.975)'));assert(css.includes('scale(1)'));assert(css.includes('transition: opacity 250ms'));assert(css.includes('.image-story-caption'));assert(css.includes('color: #fff'));assert(css.includes('prefers-reduced-motion: reduce'));
});

test('restarting visible M19 launches its own internal mission and resets the complete intro; M24 stays separate',()=>{
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const retry=main.slice(main.indexOf('async function retryJourneyMission'),main.indexOf("window.addEventListener('airport-chaos-city-exit'"));
 const start=retry.indexOf('apiUrl(')+7,end=retry.indexOf('), {',start),urlExpression=retry.slice(start,end);
 for(const mission of [journeyMissions.journeyDallas25,journeyMissions.journeyDallas19,journeyMissions.journeyDallas20,journeyMissions.journeyDallas21,journeyMissions.journeyDallas22,journeyMissions.journeyDallas23]){
   const id=mission.id;
   const actual=vm.runInNewContext(urlExpression,{...journeyMissions,journeyAttempt:{missionId:id}});
   assert.equal(actual,`/api/journey/dallas/mission-${id.slice(-2)}/launch`,`${id} retries a different mission`);
 }
 assert.equal(journeyMissions.journeyMissionSlot(journeyMissions.journeyDallas25.id),19);
 assert.equal(journeyMissions.journeyMissionSlot(journeyMissions.journeyDallas19.id),24);
 assert(retry.includes('if(journeyAttempt.missionId===journeyDallas25.id)clearFlightLaunchPresentation()'));
 assert(retry.indexOf('clearFlightLaunchPresentation()')<retry.indexOf('monsterView?.dispose()'));
 assert(retry.includes('flightLaunchWelcomeHandled = false'));assert(retry.includes("flightLaunchState = 'pending'"));
 assert(retry.includes('missionStartCountdownPending = true'));
 const prepare=main.slice(main.indexOf('async function prepareMonsterMissionIntro'),main.indexOf('function beginFlightLaunchCinematic'));
 assert(prepare.includes('new ImageStorySequence(flightGameRoot,M19_ORIGIN_STORY)'));
});
