import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import * as THREE from 'three';
import {journeyDallasCoinHunt01 as mission,journeyCatalog} from '../../shared/journey-mission.mjs';
import {dallasCoinTrail as trail,emptyCoinMask,collectTrail,coinCollected,coinCenterline,coinTrailLength,queryCoinTrail} from '../../shared/collectible-trail.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {coinTrailAltitude} from './coin-hunt.js';
import {loadDallasCombatBuildings} from './dallas-building-occlusion.js';
import {queryBuildings} from './collision-buildings.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {CoinHuntIntro,coinHuntIntroTexts} from '../../client/src/coin-hunt-intro.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
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
test('Golden River: exact anchors, equal arc spacing, single three-bend trail, safe corridor and spawn',()=>{
 assert.equal(journeyCatalog[11]!.id,mission.id);assert.equal(trail.length,1000);
 const anchors=[[0,12000,-35000],[1/6,23000,-22500],[.5,1000,2500],[5/6,23000,27500],[1,12000,40000]];
 anchors.forEach(([t,x,z])=>{const point=coinCenterline(t!);assert.ok(Math.abs(point.x-x!)<1e-8&&Math.abs(point.z-z!)<1e-8);});
 assert.ok(Math.abs(coinTrailLength-103213.23)<.05);
 assert.equal(new Set(trail.map(c=>`${c.x},${c.z}`)).size,1000);
 for(let i=0;i<1000;i++){
  const c=trail[i]!,base=coinCenterline(c.t);
  assert.equal(c.x,base.x);assert.equal(c.z,base.z);
  if(i){const before=coinCenterline(trail[i-1]!.t);assert.ok(Math.abs(Math.hypot(base.x-before.x,base.z-before.z)-coinTrailLength/999)<.01);}
 }
 assert.deepEqual(mission.airborneSpawn,{x:10102.53,z:-37059.03,heading:-2.397,speed:1200,altitude:1100});
 const first=coinCenterline(0),spawn=mission.airborneSpawn;assert.ok(Math.abs(Math.atan2(-(first.x-spawn.x),-(first.z-spawn.z))-spawn.heading)<.001);
 const buildings=loadDallasCombatBuildings();
 const clearance=(x:number,z:number)=>{let top=dallasElevationAt(x,z);queryBuildings(buildings,x-220,x+220,z-220,z+220,b=>{top=Math.max(top,b.top);return false;});return top;};
 const altitude=coinTrailAltitude(clearance);
 for(const c of trail)for(const dx of [-260,0,260])for(const dz of [-260,0,260])assert.ok(altitude-clearance(c.x+dx,c.z+dz)>=1100);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'})!.showAmbientAIAircraft,false);
 console.log(`Golden River ${coinTrailLength.toFixed(2)} units; constant altitude ${altitude.toFixed(2)}`);
});
test('all four boosted aircraft collect the single trail on the centerline; indexed lookup matches brute force',()=>{
 for(const aircraft of Object.values(aircraftFlightEnvelope)){
  const step=aircraft.maxSpeed*aircraft.boostMaxSpeed*.15;
  let mask=emptyCoinMask,count=0,previous={...coinCenterline(0),y:1100};
  for(let distance=0;distance<=coinTrailLength+step;distance+=step){
   // Fine route samples exercise the same swept pickup path at high speed.
   const index=Math.min(999,Math.round(Math.min(distance,coinTrailLength)/coinTrailLength*999)),end={...coinCenterline(trail[index]!.t),y:1100};
   const result=collectTrail(trail,1100,mask,previous,end,260,1000-count);
   const reference=collectTrail([...trail],1100,mask,previous,end,260,1000-count);
   assert.equal(result.mask,reference.mask);assert.equal(result.count,reference.count);
   mask=result.mask;count+=result.count;previous=end;
  }
  assert.equal(count,1000);assert.equal(collectTrail(trail,1100,mask,p(999),p(0),260,1000).count,0);
 }
 assert.equal(collectTrail(trail,1100,emptyCoinMask,p(0,1500),p(999,1500),260,1000).count,0);
 let visited=0;queryCoinTrail(trail[500]!.x-260,trail[500]!.x+260,trail[500]!.z-260,trail[500]!.z+260,()=>visited++);assert.ok(visited<30);
});
test('server settlement: exact partial/zero/full awards, persistence, ownership and replay idempotency',()=>{
 for(const desired of [0,125,487,900,1000]){
  const f=fixture();try{
   const a=f.start(),id=a.attemptId;assert.equal(a.deadlineAt!-a.startedAt!,120000);
   assert.equal(f.store.collectCoins('other',id,p(0),p(1),f.now+16000),undefined);
   assert.equal(f.store.collectCoins('pilot',id,p(0),p(1,NaN),f.now+16000),undefined);
   // Each isolated accepted position can also collect a neighboring coin; walk until requested count.
   for(let i=0;i<1000&&f.store.get('pilot',id)!.coinHunt!.collected<desired;i++){
    const current=f.store.get('pilot',id)!;const remaining=desired-current.coinHunt!.collected;
    if(remaining<6){
      // An accepted vertical segment tangent to a single trail coin excludes neighbors.
      const c=trail[i]!;f.store.collectCoins('pilot',id,{x:c.x,y:1359,z:c.z},{x:c.x,y:1359,z:c.z},f.now+16000+i);
    }else f.store.collectCoins('pilot',id,p(i),p(i),f.now+16000+i);
   }
   assert.equal(f.store.get('pilot',id)!.coinHunt!.collected,desired);
   if(desired===1000)assert.equal(f.store.get('pilot',id)!.status,'COMPLETED');
   const reopened=new JourneyAttemptStore(f.path,true);assert.equal(reopened.get('pilot',id)!.coinHunt!.collected,desired);
   if(desired<1000)assert.equal(f.db.prepare("SELECT count(*) AS n FROM wallet_transactions WHERE reason='MISSION_REWARD'").get()!.n,0);
   const result=reopened.settleCoinHunt('pilot',id,a.deadlineAt!)!;
   assert.equal(result.status,'COMPLETED');assert.equal(result.firstClearCredits,desired);
   assert.equal(reopened.progress('pilot',mission.id).coinsCollected,desired);
   assert.equal(reopened.progress('other',mission.id).coinsCollected,undefined);
   reopened.abandon('pilot',id,a.deadlineAt!+1);reopened.settleExpiredCoinHunts(a.deadlineAt!+2);reopened.settleCoinHunt('pilot',id);
   assert.equal(reopened.get('pilot',id)!.firstClearCredits,desired);
   assert.equal(f.store.collectCoins('pilot',id,p(0),p(999),f.now+20000),undefined);
   const replay=f.start();f.store.collectCoins('pilot',replay.attemptId,p(0),p(3),f.now+16000);
   assert.equal(f.store.abandon('pilot',replay.attemptId)!.firstClearCredits,0);
   assert.equal(f.store.progress('pilot',mission.id).coinsCollected,desired);
   assert.equal(f.db.prepare('SELECT COALESCE(sum(amount),0) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,desired);
  }finally{f.close();}
 }
});
test('crash preserves attempt, pause shifts deadline, offline expiry settles once and active launch cannot reset',()=>{
 const f=fixture();try{
  const a=f.start(),id=a.attemptId,at=f.now+16000;f.store.collectCoins('pilot',id,p(0),p(3),at);
  const collected=f.store.get('pilot',id)!.coinHunt!.collected;
  assert.equal(f.store.launch('pilot','trainer',at,mission.id).attemptId,id);
  assert.equal(f.store.fail('pilot',id,'CRASHED',at)!.status,'RACING');assert.equal(f.store.saveContinuation('pilot',id,at,{position:p(3),heading:0,bots:[]}),false);
  f.store.pause('pilot',id,at+1);assert.equal(f.store.collectCoins('pilot',id,p(10),p(10),at+2),undefined);
  const resumed=f.store.resume('pilot',id,at+1001)!.attempt;assert.equal(resumed.deadlineAt,a.deadlineAt!+1000);
  assert.equal(f.store.collectCoins('pilot',id,p(10),p(10),resumed.deadlineAt!),undefined);
  const reopened=new JourneyAttemptStore(f.path,true);assert.equal(reopened.settleExpiredCoinHunts(resumed.deadlineAt!).length,1);
  assert.equal(reopened.settleExpiredCoinHunts(resumed.deadlineAt!+1).length,0);
  assert.equal(reopened.get('pilot',id)!.firstClearCredits,collected);
  const paused=f.start();f.store.pause('pilot',paused.attemptId,at);assert.equal(f.store.expirePaused(at+300001)[0]!.status,'COMPLETED');
 }finally{f.close();}
});
test('legacy in-progress coins retire safely without altering historical completions or rewards',()=>{
 const f=fixture();try{
  const a=f.start();f.db.prepare('UPDATE journey_attempts SET coin_hunt_state=? WHERE attempt_id=?').run(JSON.stringify({mask:'f'.repeat(25),collected:80,altitude:1100}),a.attemptId);
  f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('other',mission.id,'historic',1,10000);
  new JourneyAttemptStore(f.path,true);
  assert.equal(f.store.get('pilot',a.attemptId)!.status,'ABANDONED');assert.equal(f.db.prepare('SELECT first_attempt_id FROM journey_completions WHERE pilot_id=?').get('other')!.first_attempt_id,'historic');
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM wallet_transactions WHERE reason='MISSION_REWARD'").get()!.n,0);
 }finally{f.close();}
});
test('intro uses four moving presentation-only shots and restores chase camera',()=>{
 const intro=new CoinHuntIntro(),camera=new THREE.PerspectiveCamera(60,16/9,.1,126000),chase=new THREE.Vector3(10102,1200,-37059),look=new THREE.Vector3(12000,1100,-35000);
 for(const time of [0,3000,6000,9000]){intro.sample(time,0,1100,camera,chase,look,60);const before=camera.position.clone();intro.sample(time+500,0,1100,camera,chase,look,60);assert.ok(before.distanceTo(camera.position)>1);}
 // The trail shot moves about 207 units per half second, with no stepped aim jumps.
 intro.sample(3000,0,1100,camera,chase,look,60);const trailStart=camera.position.clone();
 intro.sample(3500,0,1100,camera,chase,look,60);assert.ok(camera.position.distanceTo(trailStart)<220);
 intro.sample(3249,0,1100,camera,chase,look,60);const beforeStep=intro.target.clone();
 intro.sample(3251,0,1100,camera,chase,look,60);assert.ok(intro.target.distanceTo(beforeStep)<1);
 intro.sample(12000,1,1100,camera,chase,look,60);assert.ok(camera.position.equals(chase));assert.equal(camera.fov,60);
 assert.deepEqual([...coinHuntIntroTexts],['DALLAS BONUS ROUND!','Follow the golden coin trail!','Every coin is worth 1 Credit!','Collect as many as you can before time runs out!']);
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
  camera.position.set(trail[0]!.x,1100,trail[0]!.z-1000);camera.lookAt(trail[10]!.x,1100,trail[10]!.z);camera.updateMatrixWorld();
  const material=view.mesh.material as THREE.MeshBasicMaterial;
  assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);assert.equal(material.alphaTest,.08);
  const state={mask:emptyCoinMask,collected:0,altitude:1100};view.setState(state,true,camera,()=>{});
  view.demonstrate();assert.match(header.children[0].children[1].textContent,/1 CREDITS COLLECTED/);assert.equal(state.collected,0);
  view.restoreCounter();assert.match(header.children[0].children[1].textContent,/0 CREDITS COLLECTED/);
  let sound=0;
  for(let i=0;i<10;i++){view.update(camera,performance.now());const next=collectTrail(trail,1100,state.mask,p(i),p(i),260,1000-state.collected);state.mask=next.mask;state.collected+=next.count;view.setState({...state},false,camera,()=>sound++);}
  assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit').length,5);
  assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,5);
  assert.match(header.children[0].children[1].textContent,/CREDITS COLLECTED/);assert.ok(sound<=1);
  view.update(camera,performance.now()+1000);assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,0);
  camera.position.set(-100000,1100,-100000);
  view.update(camera,performance.now()+1200);
  assert.equal(view.mesh.count,1000);assert.equal(view.mesh.instanceMatrix.count,1000);assert.equal((view.mesh.geometry as THREE.PlaneGeometry).parameters.width,90);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion();
  for(const index of [100,500,999]){view.mesh.getMatrixAt(index,matrix);matrix.decompose(position,quaternion,scale);assert.ok(Math.abs(position.x-trail[index]!.x)<.01);assert.ok(Math.abs(position.z-trail[index]!.z)<.01);assert.ok(Math.abs(scale.x-1)<1e-6);}
  // Even an uncollected coin directly in front of the camera cannot cover the view.
  const near=trail[500]!;
  for(const height of [360,720,1080])for(const depth of [5,30,300]){
    globalThis.innerHeight=height;
    camera.position.set(near.x,1100,near.z+depth);camera.lookAt(near.x,1100,near.z);
    view.update(camera,performance.now()+1400);
    view.mesh.getMatrixAt(500,matrix);matrix.decompose(position,quaternion,scale);
    const pixels=90*scale.x*height/(2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    assert.ok(pixels<=Math.min(72,height*.0975)+.001);
    assert.ok(scale.x>0);assert.equal(view.mesh.count,1000);
  }
  for(let i=1;i<trail.length;i++)assert.ok(Math.hypot(trail[i]!.x-trail[i-1]!.x,trail[i]!.z-trail[i-1]!.z)>90);
  assert.equal(scene.children.length,1);
  // A delayed server acknowledgment uses the last visible coin, not its now-behind-camera projection.
  view.setState({mask:emptyCoinMask,collected:0,altitude:1100},true,camera,()=>{});
  const coin=trail[0]!;
  camera.position.set(coin.x,1100,coin.z-1000);camera.lookAt(coin.x,1100,coin.z);
  view.update(camera,performance.now());
  const projected=new THREE.Vector3(coin.x,1100+Math.sin(performance.now()*.0015)*5,coin.z).project(camera);
  camera.position.set(coin.x,1100,coin.z+1000);camera.lookAt(coin.x,1100,coin.z+2000);camera.updateMatrixWorld();
  const pickup=collectTrail(trail,1100,emptyCoinMask,p(0),p(0),260,1000);
  view.setState({mask:pickup.mask,collected:pickup.count,altitude:1100},false,camera,()=>{});
  const flying=nodes.find(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden);
  assert.ok(flying);assert.ok(Math.abs(parseFloat(flying.style.left)-(projected.x+1)*innerWidth/2)<1);
  assert.ok(Math.abs(parseFloat(flying.style.top)-(1-projected.y)*innerHeight/2)<1);
  view.update(camera,performance.now());view.mesh.getMatrixAt(0,matrix);matrix.decompose(position,quaternion,scale);assert.equal(scale.x,0);
  view.setState({mask:emptyCoinMask,collected:0,altitude:1100},true,camera,()=>{});
  view.update(camera,performance.now());
  view.setState({mask:pickup.mask,collected:pickup.count,altitude:1100},false,camera,()=>{});
  assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,0);
  reduced=true;view.fly(600,400);assert.equal(nodes.filter(n=>n.className==='coin-hunt-flying-credit'&&!n.hidden).length,0);
  view.dispose();assert.equal(scene.children.length,0);assert.ok(header.children[0].removed);assert.ok(canceled>0);
 }finally{Object.assign(globalThis,originals);THREE.TextureLoader.prototype.load=originals.load;}
});
