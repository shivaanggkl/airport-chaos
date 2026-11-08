import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {transportGunMounts,transportPose,transportTuning} from '../../shared/giant-incoming.mjs';
import {journeyDallas10} from '../../shared/journey-mission.mjs';
import {createTransportEncounter,stepTransportEncounter,transportGunAim,transportGunMuzzle,transportHullImpact,transportImpact} from './giant-incoming.js';
const id=journeyDallas10.id,zero={x:0,y:0,z:0};
function point(p,x,y,z){return{x:p.x+(Math.cos(p.yaw)*x+Math.sin(p.yaw)*z)*p.scale,y:p.y+y*p.scale,z:p.z+(-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z)*p.scale};}
for(const side of ['rear','front'])test(`M16 ${side} firing uses independent warned bursts from the correct guns`,()=>{
 const e=createTransportEncounter('m16','pilot',0,2000,journeyDallas10.timeLimitMs,true,false,id);
 assert.equal(e.crossfire.guns.length,4);assert.equal(e.crossfire.independent.length,4);
 let firstWarning;const origins=[];
 for(let now=50;now<=3300;now+=50){
  const p=transportPose(now,2000,journeyDallas10.timeLimitMs,id),target=point(p,0,4.7,side==='rear'?100:-100);
  stepTransportEncounter(e,target,p.velocity,[],now);
  if(e.crossfire.guns.some(gun=>gun.warningUntil>now))firstWarning??=now;
  for(const shot of e.shots.splice(0)){
   assert(now>=firstWarning+journeyDallas10.gunWarningMs,'no shot before warning');
   const gun=transportGunMounts(id).findIndex((_m,index)=>{
    const s=e.crossfire.guns[index],m=transportGunMuzzle(p,index,s.yaw,s.pitch);return Math.hypot(m.x-shot.position.x,m.y-shot.position.y,m.z-shot.position.z)<1e-6;
   });
   assert(gun>=0,'shot starts at a real barrel');origins.push(gun);
   assert.equal(transportHullImpact(shot.position,target,p),false,'gun does not shoot through its own plane');
  }
 }
 assert.equal(firstWarning,2000);
 assert.deepEqual(origins,side==='rear'?[0,1,2,0,1,2]:[3,3]);
});

test('M16 excludes opposite arcs and blocked building shots; M17/M18 retain the original layout and schedule',()=>{
 const p={...transportPose(0,2000,journeyDallas10.timeLimitMs,id),yaw:0};
 const rear=point(p,0,4.7,100),front=point(p,0,4.7,-100);
 for(const gun of [0,1,2]){assert(transportGunAim(p,rear,gun).eligible);assert(!transportGunAim(p,front,gun).eligible);}
 assert(transportGunAim(p,front,3).eligible);assert(!transportGunAim(p,rear,3).eligible);
 const e=createTransportEncounter('blocked','pilot',0,2000,journeyDallas10.timeLimitMs,true,false,id);
 for(let now=50;now<7000;now+=50){const pose=transportPose(now,2000,journeyDallas10.timeLimitMs,id);stepTransportEncounter(e,point(pose,0,4.7,100),zero,[{minX:pose.x-5000,maxX:pose.x+5000,minZ:pose.z-5000,maxZ:pose.z+5000,top:10000}],now);}
 assert.equal(e.shots.length,0);
 for(const mission of ['journey-dallas-11','journey-dallas-12']){
  const old=createTransportEncounter('old','pilot',0,2000,260000,true,true,mission);
  assert.equal(old.crossfire.guns.length,3);assert.equal(old.crossfire.independent,undefined);assert.equal(transportGunMounts(mission)[1].yaw,-Math.PI/2);
 }
});

test('M16 visible gun clone barrels match server muzzle geometry and can receive bullet hits',async()=>{
 const bytes=readFileSync(new URL('../../client/public/assets/models/enemies/giant-transport-near.glb',import.meta.url));
 const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
 const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const mounts=transportGunMounts(id),original=model.scene.getObjectByName('RearGunYaw');assert(original);
 for(const [index,mount] of mounts.entries()){
  const root=new THREE.Group(),gun=original.clone(true),p={...transportPose(0,2000,260000,id),yaw:.7,roll:.13};
  root.position.set(p.x,p.y,p.z);root.rotation.set(0,p.yaw,p.roll,'YXZ');root.scale.setScalar(p.scale);
  gun.position.set(mount.x,mount.y,mount.z);gun.rotation.y=mount.yaw;root.add(gun);root.updateMatrixWorld(true);
  const barrel=gun.getObjectByName('RearGunMuzzle').getWorldPosition(new THREE.Vector3()),server=transportGunMuzzle(p,index);
  assert(barrel.distanceTo(new THREE.Vector3(server.x,server.y,server.z))<.001);
  const aim=new THREE.Vector3(0,0,1).applyQuaternion(gun.getWorldQuaternion(new THREE.Quaternion()));
  const pose={...p,sideGuns:[{yaw:0,pitch:0},{yaw:0,pitch:0},{yaw:0,pitch:0}]};
  assert(transportImpact(barrel.clone().addScaledVector(aim,100),barrel.clone().addScaledVector(aim,-100),pose,pose),'gun collider follows its visible mount');
 }
});

for(const type of ['trainer','cargo','privateJet','fighter'])for(const boost of [false,true])for(const side of ['rear','front'])test(`${type} ${boost?'boost':'normal'} ${side}: M16 leads and intercepts a steadily moving aircraft`,async()=>{
 const {aircraftFlightEnvelope}=await import('../../shared/aircraft-flight-envelope.mjs');
 const envelope=aircraftFlightEnvelope[type],speed=envelope.maxSpeed*(boost?envelope.boostMaxSpeed:1);
 const e=createTransportEncounter('moving','pilot',0,2000,journeyDallas10.timeLimitMs,true,false,id);
 const centerPose=transportPose(3000,2000,journeyDallas10.timeLimitMs,id),center=point(centerPose,0,4.7,side==='rear'?65:-65);
 const velocity={x:Math.cos(centerPose.yaw)*speed,y:0,z:-Math.sin(centerPose.yaw)*speed};
 let hits=0,largestLead=0;
 for(let now=50;now<=3600;now+=50){
  const target={x:center.x+velocity.x*(now-3000)/1000,y:center.y,z:center.z+velocity.z*(now-3000)/1000};
  stepTransportEncounter(e,target,velocity,[],now);
  for(const shot of e.shots.splice(0)){
   assert.equal(shot.speed,6000);
   const offset={x:target.x-shot.position.x,y:target.y-shot.position.y,z:target.z-shot.position.z};
   const relative={x:shot.direction.x*shot.speed-velocity.x,y:shot.direction.y*shot.speed-velocity.y,z:shot.direction.z*shot.speed-velocity.z};
   const seconds=(offset.x*relative.x+offset.y*relative.y+offset.z*relative.z)/(relative.x**2+relative.y**2+relative.z**2);
   assert(seconds>0&&seconds*shot.speed<=4500);
   assert(Math.hypot(offset.x-relative.x*seconds,offset.y-relative.y*seconds,offset.z-relative.z*seconds)<.01,'real straight bullet intersects the moving aircraft');
   largestLead=Math.max(largestLead,speed*seconds);hits++;
  }
 }
 assert(hits>0,'moving targets must receive real aimed fire');assert(largestLead>100,'aim anticipates movement instead of firing at the old position');
});

test('M16 bullets remain dodgeable after launch and damage is isolated to this mission',async()=>{
 const {transportGunIntercept}=await import('./giant-incoming.js');
 const p=transportPose(0,2000,journeyDallas10.timeLimitMs,id),target=point(p,0,4.7,65),v={x:1000,y:0,z:0};
 const solution=transportGunIntercept(p,target,v,0);assert(solution);
 const changedCourse={x:target.x-v.x*solution.seconds,y:target.y+500*solution.seconds,z:target.z};
 assert(Math.hypot(solution.point.x-changedCourse.x,solution.point.y-changedCourse.y,solution.point.z-changedCourse.z)>100,'a turn can evade the fixed trajectory');
 assert.equal(journeyDallas10.gunShotDamage,20);
 const {journeyDallas11,journeyDallas12}=await import('../../shared/journey-mission.mjs');
 assert.equal(journeyDallas11.gunShotDamage,10);assert.equal(journeyDallas12.gunShotDamage,10);assert.equal(transportTuning.shotDamage,10);
 const {default:ts}=await import('typescript'),{default:vm}=await import('node:vm');
 const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
 let damage;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='shotDamage'&&n.initializer?.getText(ast).includes('journeyDallas10.gunShotDamage'))damage=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(damage);
 for(const [missionId,fortress,crossfire,expected] of [[id,false,true,20],['journey-dallas-11',true,true,10],['journey-dallas-12',true,true,10],['journey-dallas-08',false,false,10]]){
  assert.equal(vm.runInNewContext(damage,{e:{missionId,fortressTurrets:fortress?[250,250]:undefined,crossfire},journeyDallas10,journeyDallas11,transportTuning}),expected);
 }
});
