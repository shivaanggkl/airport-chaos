import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import { aircraftCameraProfile, normalAircraftCameraProfile, cacheAircraftSafetyPoints, fitAircraftChase, requiredChaseDistance } from '../../client/src/chase-camera-framing.ts';
const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const framing = source.slice(source.indexOf('function refreshCameraFraming()'), source.indexOf('function updateCamera('));
const cameraStart = source.indexOf('function updateCamera(');
const chase = source.slice(cameraStart, source.indexOf('  if (cameraOrbitBlend > 0) {', cameraStart)) + '\n}';
const compiled = ts.transpileModule(framing + chase, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

async function fixture(type, aspect=844/390) {
 const definition=aircraftDefinitions[type];
 const file=type==='privateJet'?'private-jet':type;
 const bytes=readFileSync(new URL(`../../client/public/assets/models/aircraft/${file}.glb`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const model=new THREE.Group();model.add(gltf.scene);
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
 model.scale.setScalar(Math.min(definition.wingSpan/size.x,(definition.bodyLength+definition.noseLength)/size.z));
 const center=new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());model.position.copy(center).negate();
 if(gltf.scene.userData.aircraftNormalizationCenter)model.position.fromArray(gltf.scene.userData.aircraftNormalizationCenter).multiply(model.scale).negate();
 const airplane=new THREE.Group();airplane.add(model);airplane.position.y=1000;airplane.userData.assetStatus='loaded';
 const camera=new THREE.PerspectiveCamera(58,aspect,2,10000);
 const state={THREE,fitAircraftChase,cacheAircraftSafetyPoints,requiredChaseDistance,aircraftCameraProfile,normalAircraftCameraProfile,aircraftType:type,smoothedChaseElevation:normalAircraftCameraProfile(type).elevation,smoothedChaseFocusRatio:normalAircraftCameraProfile(type).focusRatio,cameraSafetyPoints:[],smoothedCameraSafetyDistance:0,cameraSafetyRotation:new THREE.Quaternion(),roll:0,airplane,camera,aircraftVictory:null,currentAircraft:definition,
  CAMERA_CHASE_FOV:58,innerWidth:844,innerHeight:844/aspect,
  flightGameRoot:{},getComputedStyle:()=>({getPropertyValue:()=> '0px'}),performance:{now:()=>1000},
  cameraFramingKey:'',cameraFramingAssetStatus:'',cameraFramingAspect:0,cameraFramePoints:[],cameraFrameVertex:new THREE.Vector3(),cameraFramingWidth:0,cameraFramingHeight:0,defaultChaseDistance:0,defaultChaseHeight:0,
  cameraFocusAhead:0,smoothedChaseDistance:0,cameraDistanceMultiplier:1,cameraOrbitRadiusTarget:0,
  cameraOrbitDragging:false,cameraOrbitRecenterAt:null,cameraOrbitBlend:0,cameraOrbitYaw:0,cameraOrbitPitch:0,
  cameraWorldUp:new THREE.Vector3(0,1,0),cameraPitchAxis:new THREE.Vector3(1,0,0),
  cameraFrameLocalBounds:new THREE.Box3(),cameraFrameMeshBounds:new THREE.Box3(),
  cameraFrameRootInverse:new THREE.Matrix4(),cameraFrameRelativeMatrix:new THREE.Matrix4(),groundPlaneY:()=>0};
 for(const key of ['cameraFrameSize','cameraFrameCenter','cameraFrameWorldCenter','cameraAircraftForward','cameraOrbitOffset','cameraOrbitReturnFocus','cameraOrbitFocusLocal','chaseCameraPosition','chaseLookTarget'])state[key]=new THREE.Vector3();
 for(const key of ['cameraOrbitYawQuaternion','cameraChaseQuaternion','cameraChasePitchQuaternion','cameraOrbitReferenceQuaternion','cameraOrbitInverseYawQuaternion'])state[key]=new THREE.Quaternion();
 vm.createContext(state);vm.runInContext(compiled,state);state.updateCamera(1);
 return state;
}

for(const type of Object.keys(aircraftDefinitions))test(`${type}: actual GLB bounds fit rear view through turns, pitch, Boost and resizing`,async()=>{
 for(const aspect of [844/390,16/9,4/3,21/9]){
  const s=await fixture(type,aspect),{camera,airplane}=s;
  let ordinaryDistance;
  for(const fov of [58,60])for(const [pitch,bank] of [[0,0],[0,1.22],[0,-1.22],[.6,.8],[-.6,-.8]]){
   s.roll=bank;airplane.rotation.set(pitch,.8,bank,'YXZ');airplane.updateWorldMatrix(true,true);s.updateCamera(pitch===0&&bank===0?6:1);
   camera.fov=fov;camera.updateProjectionMatrix();camera.position.copy(s.chaseCameraPosition);camera.lookAt(s.chaseLookTarget);camera.rotateZ(Math.max(-Math.PI/30,Math.min(Math.PI/30,bank*.08)));camera.updateMatrixWorld();
   let left=Infinity,right=-Infinity;
   const p=new THREE.Vector3();
   for(let index=0;index<s.cameraFramePoints.length;index+=3){
    p.set(s.cameraFramePoints[index]+s.cameraFrameCenter.x,s.cameraFramePoints[index+1]+s.cameraFrameCenter.y,s.cameraFramePoints[index+2]+s.cameraFrameCenter.z);
    p.applyMatrix4(airplane.matrixWorld).project(camera);
    assert.ok(Math.abs(p.x)<.98&&Math.abs(p.y)<1&&p.z>-1,`${type}: cropped at pitch ${pitch}, bank ${bank}, FOV ${fov}: ${p.toArray()}`);
    left=Math.min(left,p.x);right=Math.max(right,p.x);
   }
   if(pitch===0&&bank===0){
    const expected=normalAircraftCameraProfile(type).widthFraction;
    assert.ok(fov===58 ? Math.abs((right-left)/2-expected)<(aspect>2.2?.025:.01) : (right-left)/2<=expected+.002,`${type} actual projected width ${(right-left)/2}, aspect ${aspect}, base ${s.defaultChaseDistance}, safety ${s.smoothedCameraSafetyDistance}`);
    assert.ok(s.smoothedCameraSafetyDistance<.01,'straight flight must not retain an extreme-attitude allowance');
    const offset=s.chaseCameraPosition.clone().sub(airplane.position).sub(s.cameraFrameWorldCenter);
    assert.ok(Math.abs(Math.atan2(offset.y,Math.hypot(offset.x,offset.z))-normalAircraftCameraProfile(type).elevation)<1e-6);
    const screen=s.cameraFrameWorldCenter.clone().add(airplane.position).project(camera);assert.ok(screen.y<0&&screen.y>-.4);
    if(ordinaryDistance)assert.ok(Math.abs(offset.length()-ordinaryDistance)<1e-6,`Boost cannot change camera position: ${ordinaryDistance} / ${offset.length()}, safety ${s.smoothedCameraSafetyDistance}`);
    ordinaryDistance=offset.length();
   }
  }
  const old=s.defaultChaseDistance;s.cameraDistanceMultiplier=1.4;camera.aspect=aspect*.8;s.innerWidth=700;s.updateCamera(1/60);
  assert.equal(s.cameraDistanceMultiplier,1.4,'resize preserves manual zoom');
  assert.notEqual(s.defaultChaseDistance,old);
  assert.ok(Math.abs(s.smoothedChaseDistance-old)<Math.abs(s.defaultChaseDistance*1.4-old),'resize eases into framing');
 }
});

test('manual orbit follows current heading; return stays at a safe radius',async()=>{
 const s=await fixture('fighter');
 s.cameraOrbitBlend=1;s.cameraOrbitDragging=true;s.cameraOrbitRadius=30;s.cameraOrbitRadiusTarget=30;s.cameraOrbitYaw=.8;s.cameraOrbitPitch=.2;
 const start=source.indexOf('  if (cameraOrbitBlend > 0) {',cameraStart);
 const block=source.slice(start,source.indexOf('  // Keep throttle changes',start));
 for(const key of ['orbitCameraPosition','orbitLookTarget','targetCameraPosition','lookTarget'])s[key]=new THREE.Vector3();
 vm.runInContext('let delta=1/60;let recentering=false;'+block,s);const first=s.targetCameraPosition.clone().sub(s.airplane.position);
 s.airplane.rotation.y=1;s.updateCamera(1/60);vm.runInContext(block,s);
 assert.ok(s.targetCameraPosition.clone().sub(s.airplane.position).distanceTo(first)>10,'turning aircraft carries its orbit camera');
 s.cameraOrbitYaw=3;s.cameraOrbitDragging=false;s.cameraOrbitRecenterAt=0;
 for(let frame=0;frame<240;frame++){
  s.updateCamera(1/60);
  assert.ok(s.cameraOrbitRadius>=s.defaultChaseDistance*.8,'return cannot cut through the aircraft');
 }
 assert.equal(s.cameraOrbitBlend,0);
});

test('camera damping has the same result at 30, 60 and 120 FPS and roll stays within six degrees',()=>{
 const start=source.indexOf('    targetCameraRelativeOffset.copy(targetCameraPosition).sub(airplane.position);');
 const end=source.indexOf('  const nextFov',start);
 const block=source.slice(start,end).replace(/\n  }\s*$/,'');
 const results=[];
 for(const fps of [30,60,120]){
  const s={THREE,normalCameraProfile:aircraftCameraProfile,delta:1/fps,cameraFollow:4.7,cameraOrbitDragging:false,cameraOrbitBlend:0,cameraChaseRoll:0,roll:2,cameraRelativeOffsetInitialized:true,
   airplane:new THREE.Group(),camera:new THREE.PerspectiveCamera(),targetCameraPosition:new THREE.Vector3(10,20,30),lookTarget:new THREE.Vector3(5,10,15),groundPlaneY:()=>-1000};
  for(const k of ['targetCameraRelativeOffset','targetCameraLookOffset','smoothedCameraRelativeOffset','smoothedCameraLookOffset'])s[k]=new THREE.Vector3();
  vm.createContext(s);
  const code=ts.transpileModule('function step(){'+block+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(code,s);
  for(let frame=0;frame<fps;frame++){s.lookTarget.set(5,10,15);s.step();}
  assert.ok(Math.abs(s.cameraChaseRoll)<=Math.PI/30);results.push(s.camera.position.clone());
 }
 assert.ok(results[0].distanceTo(results[1])<1e-8&&results[1].distanceTo(results[2])<1e-8);
 assert.match(source,/CAMERA_CHASE_FOV \+ boostVisualStrength \* 2\.0/);
});

test('canvas holds are inert, drag has a 12px threshold, and pinch owns only its two canvas fingers',async()=>{
 const s=await fixture('fighter');
 const handlers=new Map(),captures=new Set();
 s.renderer={domElement:{addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)}};
 Object.assign(s,{flightLaunchState:'complete',worldMap:{isOpen:()=>false},pilotMenu:{isOpen:()=>false},aircraftGarage:{isOpen:()=>false},flightDialogOpen:()=>false,
  cameraTouchPointers:new Map(),cameraPendingPointerId:null,cameraPinchStartDistance:0,cameraPinchDistance:0,cameraPinchActive:false,
  cameraOrbitPointerId:null,cameraOrbitPointerX:0,cameraOrbitPointerY:0,cameraOrbitRadius:0,cameraOrbitBlend:0,
  guidedTutorialActive:false,trainingSlides:{recordAction(){},acceptsInput:()=>false},trackpadGestureScale:0});
 s.camera.position.copy(s.chaseCameraPosition);s.lookTarget=new THREE.Vector3().copy(s.chaseLookTarget);
 s.pinchZoomFactor=(a,b)=>Math.max(.84,Math.min(1.16,a/b));
 const start=source.indexOf('const applyCameraZoom =');
 const end=source.indexOf('const gameplayCinematicStartPosition',start);
 vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,s);
 const send=(name,id,x,y)=>handlers.get(name)({pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,preventDefault(){}});
 send('pointerdown',1,100,100);
 assert.equal(s.cameraOrbitBlend,0);assert.equal(s.cameraOrbitDragging,false);
 send('pointermove',1,108,107);assert.equal(s.cameraOrbitDragging,false);
 send('pointermove',99,400,400);assert.equal(s.cameraOrbitBlend,0,'a joystick/other finger cannot start orbit');
 send('pointermove',1,112,100);assert.equal(s.cameraOrbitDragging,true);
 const yaw=s.cameraOrbitYaw,pitch=s.cameraOrbitPitch;
 send('pointermove',1,132,120);
 assert.ok(Math.abs(s.cameraOrbitYaw-yaw+.08)<1e-10);assert.ok(Math.abs(s.cameraOrbitPitch-pitch+.06)<1e-10);
 send('pointerup',1,132,120);assert.equal(s.cameraOrbitRecenterAt,1250);
 send('pointerdown',2,100,100);send('pointerdown',3,200,100);
 const zoom=s.cameraDistanceMultiplier;
 send('pointermove',3,205,100);assert.equal(s.cameraDistanceMultiplier,zoom,'pinch jitter must not zoom');
 send('pointermove',3,220,100);send('pointermove',3,240,100);
 assert.ok(s.cameraDistanceMultiplier<zoom);
 const zoomed=s.cameraDistanceMultiplier;
 send('pointerdown',4,500,100);send('pointermove',4,900,100);
 assert.equal(s.cameraDistanceMultiplier,zoomed,'a third finger cannot join a pinch');
 send('pointerup',3,240,100);send('pointermove',2,102,100);
 assert.equal(s.cameraOrbitDragging,false,'remaining pinch finger must cross a fresh drag threshold');
 vm.runInContext('resetCameraPointers();',s);assert.equal(s.cameraTouchPointers.size,0);assert.equal(s.cameraPendingPointerId,null);
 assert.equal(s.cameraDistanceMultiplier,zoomed,'reset preserves selected zoom');
});


test('model load rebuilds geometry once; resize reuses the cache and preserves zoom',async()=>{
 const s=await fixture('fighter');const original=s.defaultChaseDistance;
 s.airplane.children[0].scale.multiplyScalar(1.2);s.airplane.userData.assetStatus='reloaded';
 s.cameraDistanceMultiplier=1.3;s.updateCamera(1/60);
 assert.ok(s.defaultChaseDistance>original*1.19);assert.equal(s.cameraDistanceMultiplier,1.3);
 s.airplane.traverse=()=>{throw Error('resize must not traverse unchanged geometry');};
 s.camera.aspect*=.9;s.innerWidth-=80;s.updateCamera(1/60);
 assert.equal(s.cameraDistanceMultiplier,1.3);
});


test('one default profile applies to all aircraft and fallback framing',()=>{
 assert.equal(aircraftCameraProfile.widthFraction,.35);assert.equal(aircraftCameraProfile.elevation,5*Math.PI/180);
 for(const d of Object.values(aircraftDefinitions)){
  const frame=fitAircraftChase(d.wingSpan,d.bodyRadius*3,d.bodyLength+d.noseLength,16/9);
  assert.ok(Number.isFinite(frame.distance)&&frame.distance>0);
  assert.ok(Math.abs(Math.atan2(frame.height,frame.distance)-aircraftCameraProfile.elevation)<1e-12);
 }
});

test('temporary safety distance is attitude-specific, smooth and returns to the selected zoom',async()=>{
 for(const type of Object.keys(aircraftDefinitions)){
  const s=await fixture(type,21/9);s.cameraDistanceMultiplier=1.1;
  const count=s.cameraSafetyPoints.length;
  assert.ok(count>0&&count<=26*3);
  // Geometry cannot be revisited while maneuvering.
  s.airplane.traverse=()=>{throw Error('per-frame geometry scan');};
  let peak=0,last=0;
  for(let frame=0;frame<180;frame++){
   const amount=frame<60?frame/60:frame<120?1:(180-frame)/60;
   s.roll=amount*1.22;s.airplane.rotation.set(amount*.6,0,s.roll,'YXZ');s.updateCamera(1/60);
   if(frame%30===0){
    s.airplane.updateWorldMatrix(true,true);
    s.camera.position.copy(s.chaseCameraPosition);s.camera.lookAt(s.chaseLookTarget);s.camera.rotateZ(s.roll*.08);s.camera.updateMatrixWorld();
    const point=new THREE.Vector3();
    for(let index=0;index<s.cameraFramePoints.length;index+=3){
     point.set(s.cameraFramePoints[index]+s.cameraFrameCenter.x,s.cameraFramePoints[index+1]+s.cameraFrameCenter.y,s.cameraFramePoints[index+2]+s.cameraFrameCenter.z);
     point.applyMatrix4(s.airplane.matrixWorld).project(s.camera);
     assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1,`${type}: maneuver transition crops at frame ${frame}: ${point.toArray()}`);
    }
   }
   const change=Math.abs(s.smoothedCameraSafetyDistance-last);
   assert.ok(change<s.defaultChaseDistance*.15,'safety adjustment cannot jump');
   peak=Math.max(peak,s.smoothedCameraSafetyDistance);last=s.smoothedCameraSafetyDistance;
  }
  s.roll=0;s.airplane.rotation.set(0,0,0);
  for(let frame=0;frame<240;frame++)s.updateCamera(1/60);
  assert.ok(s.smoothedCameraSafetyDistance<.001,'level flight returns to base distance');
  assert.equal(s.cameraDistanceMultiplier,1.1,'temporary safety never rewrites user zoom');
  assert.equal(s.cameraSafetyPoints.length,count);
  assert.ok(peak>=0);
 }
});


test('Firehawk has a slightly higher rear angle while other aircraft profiles stay unchanged',async()=>{
 const s=await fixture('fighter');const profile=normalAircraftCameraProfile('fighter');
 assert.equal(profile.elevation,12*Math.PI/180);assert.equal(profile.widthFraction,.34);assert.equal(profile.focusRatio,.01);
 for(const type of ['trainer','privateJet','cargo']){
  const other=normalAircraftCameraProfile(type);
  assert.equal(other.elevation,type==='trainer'?14*Math.PI/180:8*Math.PI/180);
  assert.equal(other.focusRatio,profile.focusRatio);
  assert.equal(other.groundClearance,profile.groundClearance);
  assert.equal(other.widthFraction,type==='privateJet'?.42:.35);
 }
 const center=new THREE.Vector3().copy(s.cameraFrameWorldCenter).add(s.airplane.position);
 s.camera.position.copy(s.chaseCameraPosition);s.camera.lookAt(s.chaseLookTarget);s.camera.updateMatrixWorld();
 assert.ok(Math.abs(center.project(s.camera).y)<.04,'Firehawk moves closer to screen center instead of the bottom edge');
 s.airplane.position.y=0;s.updateCamera(6);
 const runwayOffset=s.chaseCameraPosition.clone().sub(s.airplane.position).sub(s.cameraFrameWorldCenter);
 assert.ok(Math.atan2(runwayOffset.y,Math.hypot(runwayOffset.x,runwayOffset.z))<profile.elevation+2*Math.PI/180,'runway clearance stays within two degrees of the configured Firehawk angle');
});


test('automatic camera keeps the same rear aircraft-relative angle through climbs and dives without inheriting bank',async()=>{
 for(const type of Object.keys(aircraftDefinitions)){
  const s=await fixture(type);
  for(const pitch of [-.65,-.3,0,.3,.65]){
   s.airplane.rotation.set(pitch,.7,.4,'YXZ');s.roll=.4;s.updateCamera(1);
   const center=s.cameraFrameWorldCenter.clone().add(s.airplane.position);
   const rear=s.chaseCameraPosition.clone().sub(center).applyQuaternion(s.cameraChaseQuaternion.clone().invert());
   assert.ok(Math.abs(rear.x)<1e-6&&rear.z>0,`${type}: camera must remain directly behind`);
   assert.ok(Math.abs(Math.atan2(rear.y,rear.z)-normalAircraftCameraProfile(type).elevation)<1e-6,`${type}: climb must preserve the rear viewing angle`);
   const cameraForward=new THREE.Vector3(0,0,-1).applyQuaternion(s.cameraChaseQuaternion);
   const aircraftForward=new THREE.Vector3(0,0,-1).applyQuaternion(s.airplane.quaternion);
   assert.ok(cameraForward.distanceTo(aircraftForward)<1e-6,`${type}: chase must follow the nose through climbs and dives`);
   const cameraRight=new THREE.Vector3(1,0,0).applyQuaternion(s.cameraChaseQuaternion);
   assert.ok(Math.abs(cameraRight.y)<1e-6,`${type}: aircraft banking must not tilt the chase frame`);
  }
 }
});
