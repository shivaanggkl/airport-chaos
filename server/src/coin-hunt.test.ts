import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import * as THREE from 'three';
import {journeyDallasCoinHunt01 as mission,journeyCatalog} from '../../shared/journey-mission.mjs';
import {dallasCoinTrail as trail,emptyCoinMask,collectTrail,coinCollected} from '../../shared/collectible-trail.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {RewardedAdStore} from './rewarded-ads.js';
import {coinTrailAltitude} from './coin-hunt.js';
import {loadDallasCombatBuildings} from './dallas-building-occlusion.js';
import {queryBuildings} from './collision-buildings.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {CoinHuntIntro,coinHuntIntroTexts} from '../../client/src/coin-hunt-intro.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {throttleSpeedTarget,cruiseThrottleStops} from '../../shared/flight-control-rules.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
const p=(i:number,y=1100)=>({...trail[i]!,y});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'coins-')),path=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');profiles.getOrCreate('other','Other');
 const store=new JourneyAttemptStore(path,true),db=new DatabaseSync(path),now=Date.now();
 const start=()=>{const a=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',a.attemptId,now+1);
  store.prepareCoinHunt('pilot',a.attemptId,1100);return store.startCoinHunt('pilot',a.attemptId,now+15000)!;};
 return {path,store,db,now,start,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('M12 unique slot, safe deterministic continuous 100-coin corridor and moderate cruise timing',()=>{
 assert.equal(journeyCatalog.length,30);assert.equal(journeyCatalog[11]!.id,mission.id);assert.equal(trail.length,100);
 const buildings=loadDallasCombatBuildings();
 const clearance=(x:number,z:number)=>{let top=dallasElevationAt(x,z);queryBuildings(buildings,x-220,x+220,z-220,z+220,b=>{top=Math.max(top,b.top);return false;});return top;};
 const altitude=coinTrailAltitude(clearance);let length=0;
 for(let i=0;i<100;i++){
  const c=trail[i]!;assert.ok(Math.abs(c.x)<75000&&Math.abs(c.z)<75000);assert.ok(altitude-clearance(c.x,c.z)>=1100);
  if(i){const prev=trail[i-1]!;length+=Math.hypot(c.x-prev.x,c.z-prev.z);}
  if(i>1){const a=trail[i-2]!,b=trail[i-1]!;const change=Math.abs(Math.atan2(c.x-b.x,c.z-b.z)-Math.atan2(b.x-a.x,b.z-a.z));assert.ok(change<.01);}
 }
 assert.ok(length/throttleSpeedTarget(cruiseThrottleStops[2]!,aircraftFlightEnvelope.trainer)>20&&length/throttleSpeedTarget(cruiseThrottleStops[2]!,aircraftFlightEnvelope.trainer)<35);
 const first=trail[0]!,s=mission.airborneSpawn;
 assert.ok(Math.abs(Math.atan2(-(first.x-s.x),-(first.z-s.z))-s.heading)<.01);
 assert.ok(Math.hypot(first.x-s.x,first.z-s.z)>1000);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'})!.showAmbientAIAircraft,false);
 console.log(`M12 corridor: ${length.toFixed(0)} m; clearance altitude ${altitude.toFixed(1)} m; MED Bluejay trail ${(length/1222).toFixed(1)} s`);
});
test('all four boosted aircraft swept collection covers fast multi-pickups, misses, reverse visits, duplicate suppression and cap',()=>{
 for(const aircraft of Object.values(aircraftFlightEnvelope)){
  const step=aircraft.maxSpeed*aircraft.boostMaxSpeed*.15;
  let mask=emptyCoinMask,count=0,previous=p(0);
  for(let i=0;i<100;i++){
   const end=p(i);const n=Math.max(1,Math.ceil(Math.hypot(end.x-previous.x,end.z-previous.z)/step));
   const start=previous;for(let j=1;j<=n;j++){const q={x:start.x+(end.x-start.x)*j/n,y:1100,z:start.z+(end.z-start.z)*j/n};const r=collectTrail(trail,1100,mask,previous,q,260,90-count);mask=r.mask;count+=r.count;previous=q;}
  }
  assert.equal(count,90);assert.equal(collectTrail(trail,1100,mask,p(99),p(0),260,0).count,0);
 }
 assert.equal(collectTrail(trail,1100,emptyCoinMask,p(0,1500),p(99,1500),260,90).count,0);
 const r=collectTrail(trail,1100,emptyCoinMask,p(7),p(4),260,90);assert.equal(r.count,4);
 assert.equal(collectTrail(trail,1100,r.mask,p(4),p(7),260,90).count,0);
 assert.equal(coinCollected(r.mask,5),true);assert.equal(coinCollected(r.mask,8),false);
 assert.equal(collectTrail(trail,1100,emptyCoinMask,p(0),p(7),260,3).count,3);
});
test('authoritative progress persists; atomic first clear pays exactly 900, replay and duplicate pay zero',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId;assert.equal(a.deadlineAt!-a.startedAt!,240000);
  assert.equal(f.store.collectCoins('other',id,p(0),p(1),f.now+16000),undefined);
  assert.equal(f.store.collectCoins('pilot',id,p(0),p(1,NaN),f.now+16000),undefined);
  for(let i=0;i<90;i++){
   f.store.collectCoins('pilot',id,p(i),p(i),f.now+16000+i*50);
   if(i===40){const reopened=new JourneyAttemptStore(f.path,true);assert.equal(reopened.get('pilot',id)!.coinHunt!.collected,41);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM wallet_transactions WHERE reason='MISSION_REWARD'").get()!.n,0);}
  }
  const result=f.store.get('pilot',id)!;assert.equal(result.status,'COMPLETED');assert.equal(result.coinHunt!.collected,90);assert.equal(result.firstClearCredits,900);
  assert.equal(f.store.collectCoins('pilot',id,p(90),p(99),f.now+22000),undefined);
  const replay=f.start();for(let i=0;i<90;i++)f.store.collectCoins('pilot',replay.attemptId,p(i),p(i),f.now+16000+i*50);
  assert.equal(f.store.get('pilot',replay.attemptId)!.firstClearCredits,0);
  assert.equal(f.db.prepare('SELECT sum(amount) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,900);
 }finally{f.close();}
});
test('pause, expiry, ad continuation, abandon and retry preserve legitimate coins without partial payout',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId,at=f.now+16000;f.store.collectCoins('pilot',id,p(0),p(3),at);
  f.store.pause('pilot',id,at+1);assert.equal(f.store.collectCoins('pilot',id,p(4),p(4),at+2),undefined);
  const resumed=f.store.resume('pilot',id,at+1001)!;assert.equal(resumed.attempt.coinHunt!.collected,4);
  assert.equal(f.store.collectCoins('pilot',id,p(4),p(4),resumed.attempt.deadlineAt!),undefined);
  f.store.fail('pilot',id,'CRASHED',at+1100);assert.ok(f.store.saveContinuation('pilot',id,at+1100,{position:p(3),heading:0,bots:[]}));
  const adUnitId='ca-app-pub-3940256099942544/5224354917',ads=new RewardedAdStore(f.path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId},webEnabled:false,providerRewardAmount:'1'});
  const ad=ads.createAttempt('pilot','android',at+1101,`${id}:${at+1100}`);assert.ok(ad.ok);if(!ad.ok)throw Error();
  ads.grantVerifiedReward({adUnit:adUnitId,customData:ad.attempt.attemptId,rewardAmount:'1',rewardItem:'reward',timestamp:at+1102,transactionId:'coins-ad'},at+1102);
  const continued=f.store.continueAfterAd('pilot',id,ad.attempt.attemptId,at+1103)!;assert.equal(continued.coinHunt!.collected,4);assert.ok(continued.deadlineAt!-(at+1103)<=240000);
  assert.equal(f.store.collectCoins('pilot',id,p(0),p(3),at+1104),undefined);
  const retry=f.start();assert.equal(retry.coinHunt!.collected,0);f.store.abandon('pilot',retry.attemptId);
  assert.equal(f.store.collectCoins('pilot',retry.attemptId,p(0),p(3),at+1200),undefined);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM wallet_transactions WHERE reason='MISSION_REWARD'").get()!.n,0);
 }finally{f.close();}
});
test('intro moves through four shots and restores chase camera; shared bounded animation and artwork',()=>{
 const intro=new CoinHuntIntro(),camera=new THREE.PerspectiveCamera(60,16/9,.1,126000),chase=new THREE.Vector3(15300,1200,-26800),look=new THREE.Vector3(15600,1100,-25500);
 for(const aspect of [16/9,844/390,390/844]){
  camera.aspect=aspect;intro.sample(0,0,1100,camera,chase,look,60);camera.updateMatrixWorld();
  for(const coin of trail){const screen=new THREE.Vector3(coin.x,1100,coin.z).project(camera);assert.ok(Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&screen.z<1,'full overview trail fits viewport');}
 }
 for(const time of [0,3000,6000,9000]){intro.sample(time,0,1100,camera,chase,look,60);const before=camera.position.clone();intro.sample(time+500,0,1100,camera,chase,look,60);assert.ok(before.distanceTo(camera.position)>1);}
 intro.sample(12000,1,1100,camera,chase,look,60);assert.ok(camera.position.equals(chase));assert.equal(camera.fov,60);assert.equal(coinHuntIntroTexts.length,4);
 const view=readFileSync('client/src/collectible-trail.ts','utf8');assert.match(view,/i<5/);assert.match(view,/prefers-reduced-motion/);assert.match(view,/animateCreditFlight/);assert.match(view,/InstancedMesh/);
 assert.equal(createHash('sha256').update(readFileSync('client/public/media/missions/credit-coin.webp')).digest('hex'),'58f2b5011fe3ef496a146f8032c454705d8654af569cad261fc4f4509cec2014');
});

test('coin view batches rapid confirmations into five reusable animations, restores demo and disposes resources',async()=>{
 const {CollectibleTrailView}=await import('../../client/src/collectible-trail.js');
 const originals={document:globalThis.document,matchMedia:globalThis.matchMedia,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,load:THREE.TextureLoader.prototype.load};
 const nodes:any[]=[];let reduced=false,canceled=0;
 const make=()=>{const node:any={style:{},hidden:false,textContent:'',children:[],removed:false,
  append(...children:any[]){this.children.push(...children);},remove(){this.removed=true;},
  getBoundingClientRect:()=>({left:300,top:40,width:190,height:40}),
  animate:()=>({cancel(){canceled++;}})};nodes.push(node);return node;};
 Object.assign(globalThis,{document:{createElement:make,body:make()},matchMedia:()=>({matches:reduced}),innerWidth:1280,innerHeight:720});
 THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
 try{
  const scene=new THREE.Scene(),header=make(),view=new CollectibleTrailView(scene,header),camera=new THREE.PerspectiveCamera(60,16/9,.1,126000);
  camera.position.set(15300,1100,-27000);camera.lookAt(15600,1100,-25500);camera.updateMatrixWorld();
  const state={mask:emptyCoinMask,collected:0,altitude:1100};view.setState(state,true,camera,()=>{});
  view.demonstrate();assert.match(header.children[0].children[1].textContent,/COINS 1/);assert.equal(state.collected,0);
  view.restoreCounter();assert.match(header.children[0].children[1].textContent,/COINS 0/);
  let sound=0;
  for(let i=0;i<10;i++){const next=collectTrail(trail,1100,state.mask,p(i),p(i),260,90-state.collected);state.mask=next.mask;state.collected+=next.count;view.setState({...state},false,camera,()=>sound++);}
  assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit').length,5);
  assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,5);
  assert.match(header.children[0].children[1].textContent,/COINS 10/);assert.ok(sound<=1);
  view.update(camera,performance.now()+1000);assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,0);
  reduced=true;view.fly(600,400);assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,0);
  view.dispose();assert.equal(scene.children.length,0);assert.ok(header.children[0].removed);assert.ok(canceled>0);
 }finally{Object.assign(globalThis,originals);THREE.TextureLoader.prototype.load=originals.load;}
});
