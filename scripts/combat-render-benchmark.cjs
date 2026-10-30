// Isolated rendering benchmark using production models/functions; not a gameplay or device acceptance test.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const esbuild=require('../node_modules/esbuild');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9)||'/tmp/airport-combat-render.json';
const setting=(name,fallback)=>process.argv.find(v=>v.startsWith('--'+name+'='))?.split('=').slice(1).join('=')||fallback;
const baselineRef=setting('baseline-ref','4ba21da');
const counts=setting('counts','10,25,50,100').split(',').map(Number),seconds=Number(setting('seconds','20')),dpr=Number(setting('dpr','1'));
if(counts.some(n=>!Number.isInteger(n)||n<1||n>100)||!Number.isFinite(seconds)||seconds<5||seconds>120||!Number.isFinite(dpr)||dpr<1||dpr>3)throw Error('Invalid benchmark bounds');
const harness=`window.__combatQa = {
 scene(options={}) {
  flightLaunchState='complete';missionStartCountdownPending=false;missionStartCountdownStartedAt=null;missionClearStartedAt=null;
  document.body.classList.remove('launch-cinematic-pending','launch-cinematic-active');flightGameRoot.classList.remove('launch-cinematic-pending','launch-cinematic-active');
  for(const e of document.body.children) if(e!==flightGameRoot && !e.contains(flightGameRoot) && e.tagName!=='SCRIPT' && e.tagName!=='STYLE')e.style.display='none';
  document.querySelector('#home-hangar').style.display='none';document.querySelector('#city-selector').style.display='none';
  contextualHints.setEnabled(false);flightGameRoot.hidden=false;crashed=false;runStarted=true;onGround=false;journeyPaused=false;trainingPaused=false;localLifeState='alive';
  airplane.visible=true;airplane.position.set(-22000,1100,-12000);airplane.rotation.set(options.pitch||0,options.yaw||0,options.roll||0,'YXZ');
  velocity.set(0,0,-120);currentSpeed=120;flightLaunchState='complete';setFlightState('FLYING');
  for(const id of [...remotePlayers.keys()])removeRemotePlayer(id);
  const offsets=options.count===0?[]:Array.from({length:options.count||3},(_,i)=>new THREE.Vector3(((i%10)-4.5)*100,Math.floor(i/10)*20,-1100-Math.floor(i/10)*100));
  for(let i=0;i<offsets.length;i++){
    const pos=offsets[i].applyQuaternion(airplane.quaternion).add(airplane.position);
    updateRemotePlayer({playerId:'qa-'+i,cityId,entityType:'player',position:pos,rotation:{x:0,y:options.yaw||0,z:0},aircraftType:['trainer','cargo','privateJet','fighter'][i%4],displayName:'ESCORT '+(i+1),lifeState:'alive',isBot:true,health:1000,maxHealth:1000,rearGuardEscort:true});
    const r=remotePlayers.get('qa-'+i);r.timeSinceUpdate=0;r.plane.position.copy(pos);r.plane.visible=true;r.velocity.set(70,0,-80);
  }
  if(options.mission){
    journeyAttempt={attemptId:'visual-qa',missionId:options.mission===8?journeyDallas08.id:journeyDallas09.id,status:'RACING',deadlineAt:Date.now()+280000,targetHealth:2000,monsterHealth:2000,targetId:'qa-0',secondaryTargetId:'qa-1',gateIndex:0,serverNow:Date.now()};
    transportView?.dispose();transportView=new GiantIncomingView(scene,getTerrainHeight,false,false);
    const p=new THREE.Vector3(0,30,-1000).applyQuaternion(airplane.quaternion).add(airplane.position);
    transportView.setState({type:'transportState',attemptId:'visual-qa',pose:{x:p.x,y:p.y,z:p.z,yaw:options.yaw||0,velocity:{x:0,y:0,z:-80}},gunYaw:0,gunPitch:0,warningUntil:0,hitSequence:0,health:2000,shots:[],serverNow:Date.now()});transportView.update(.016);
  }else{journeyAttempt=null;transportView?.dispose();transportView=undefined;}
  clearCombatTarget();
  serverAimTargetId=offsets.length?'qa-1':null;serverLockedTargetId=serverAimTargetId;serverAimReceivedAt=performance.now();
  previousServerAim.x=serverAim.x=visualAim.x=.025;previousServerAim.y=serverAim.y=visualAim.y=.01;previousAimId=serverAimId=1;
  updateRemotePlayers(0);updateCombatTarget(0);updateCamera(1);camera.updateMatrixWorld(true);updateRemotePlayers(0);
  if(options.edge){camera.position.copy(airplane.position).add(new THREE.Vector3(0,20,-100));camera.lookAt(airplane.position);camera.updateMatrixWorld(true);}
  if(typeof hasServerLeadPoint!=='undefined'){hasServerLeadPoint=offsets.length>0;if(hasServerLeadPoint)serverLeadPoint.copy(remotePlayers.get('qa-1').plane.position).add(new THREE.Vector3(40,0,-30));}
  updateFlightHud();updateJourneyHud();updateLockCircle();
  if(options.firing){getCurrentMuzzleTransform(projectileOrigin,projectileDirection);projectileDirection.set(visualAim.x,visualAim.y,-1).normalize().applyQuaternion(muzzleQuaternion);spawnMuzzleFeedback(projectileOrigin,projectileDirection,'qa-shot');updateProjectiles(.25);}
  renderer.render(scene,camera);
  const e=acquisitionCircleElement.getBoundingClientRect();
  return {reticle:{x:e.x,y:e.y,width:e.width,height:e.height,visibility:getComputedStyle(acquisitionCircleElement).visibility,display:getComputedStyle(acquisitionCircleElement).display,edge:acquisitionCircleElement.classList.contains('aim-edge')},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
 },
 checks(){
  this.scene({count:100});
  const initialFov=camera.fov;camera.fov=40;camera.updateProjectionMatrix();updateLockCircle();const first=acquisitionCircleElement.getBoundingClientRect().width;
  camera.fov=90;camera.updateProjectionMatrix();updateLockCircle();const second=acquisitionCircleElement.getBoundingClientRect().width;
  camera.fov=initialFov;camera.updateProjectionMatrix();
  const beforeId=localPlayerId;localPlayerId='render-local';clearProjectileVisuals();
  const shot={type:'projectileSpawn',ownerId:localPlayerId,projectileId:'own-priority',position:{x:0,y:1000,z:0},direction:{x:0,y:0,z:-1},speed:520,mode:'ballistic'};
  addProjectile(shot);for(let i=0;i<300;i++)addProjectile({...shot,ownerId:'qa-0',projectileId:'remote-'+i});
  const ownSurvives=clientProjectiles.has('own-priority'),bounded=clientProjectiles.size<=256;
  clearProjectileVisuals();localPlayerId=beforeId;
  acquisitionCircleElement.classList.add('locked');
  const ringStroke=getComputedStyle(acquisitionCircleElement.querySelector('.aiming-reticle-ring')).stroke;
  acquisitionCircleElement.classList.add('confirmed-hit');
  const lockedHitStroke=getComputedStyle(acquisitionCircleElement.querySelector('.aiming-reticle-ring')).stroke;
  acquisitionCircleElement.classList.remove('confirmed-hit');
  const bracketElement=acquisitionCircleElement.querySelector('.aiming-reticle-brackets');
  const bracketStroke=bracketElement?getComputedStyle(bracketElement).stroke:null;
  const extraTargetBoxes=[...remotePlayers.values()].filter(r=>r.targetBrackets.visible).length;
  // Moving selected-target markers must stay on the rendered aircraft, not its lead point.
  const selected=remotePlayers.get('qa-1');let maxTargetMarkerError=0;
  if(selected)for(const pose of [[0,0,0],[.2,.3,.6],[-.2,-.3,-.6]]){
    airplane.rotation.set(...pose,'YXZ');updateCamera(1);camera.updateMatrixWorld(true);
    selected.plane.position.copy(airplane.position).add(new THREE.Vector3(160,40,-1600).applyQuaternion(airplane.quaternion));
    selectedCombatTarget={remote:selected,distance:1608,locked:true};
    visualAim.x=-.12;visualAim.y=.04;updateLockCircle();
    if(typeof combatMarkerTransitionAt!=='undefined'){combatMarkerTransitionAt=performance.now()-200;updateLockCircle();}
    const projected=selected.plane.position.clone().project(camera);
    maxTargetMarkerError=Math.max(maxTargetMarkerError,Math.hypot(lockCircleCenterX-(projected.x*.5+.5)*window.innerWidth,lockCircleCenterY-(-projected.y*.5+.5)*window.innerHeight));
  }
  this.scene({count:2});
  const savedSocket=socket,savedId=localPlayerId,savedReady=protocolReady,savedBlocked=protocolBlocked;
  const requests=[];
  try{
    localPlayerId='marker-qa';protocolReady=true;protocolBlocked=false;
    socket={readyState:WebSocket.OPEN,send:raw=>requests.push(JSON.parse(raw))};
    for(const r of remotePlayers.values()){r.plane.position.copy(airplane.position).add(new THREE.Vector3(0,0,-1200));r.timeSinceUpdate=0;}
    serverAimTargetId=null;serverLockedTargetId=null;serverAimReceivedAt=performance.now();requestedLockTargetId=null;
    updateCombatTarget(.016);
  }finally{socket=savedSocket;localPlayerId=savedId;protocolReady=savedReady;protocolBlocked=savedBlocked;}
  const newCandidateRequested=requests.some(m=>m.type==='lock'&&m.targetId);
  const unconfirmedStaysNeutral=!acquisitionCircleElement.classList.contains('locked');
  let smoothAcquisition=null;
  if(typeof combatMarkerTransitionAt!=='undefined'){
    this.scene({count:2});
    const one=remotePlayers.get('qa-0'),two=remotePlayers.get('qa-1');
    one.plane.position.copy(airplane.position).add(new THREE.Vector3(-160,0,-1200));
    two.plane.position.copy(airplane.position).add(new THREE.Vector3(160,0,-1200));
    selectedCombatTarget={remote:one,distance:1210,locked:true};serverLockedTargetId=one.playerId;serverAimTargetId=one.playerId;serverAimReceivedAt=performance.now();
    updateLockCircle();combatMarkerTransitionAt=performance.now()-200;updateLockCircle();const start=lockCircleCenterX;
    selectedCombatTarget={remote:two,distance:1210,locked:true};serverLockedTargetId=two.playerId;serverAimTargetId=two.playerId;
    updateLockCircle();const first=lockCircleCenterX,redDuringTravel=acquisitionCircleElement.classList.contains('locked');
    combatMarkerTransitionAt=performance.now()-90;updateLockCircle();const middle=lockCircleCenterX;
    combatMarkerTransitionAt=performance.now()-200;updateLockCircle();const end=lockCircleCenterX,redAfterTravel=acquisitionCircleElement.classList.contains('locked');
    selectedCombatTarget=null;serverAimTargetId=null;serverLockedTargetId=null;updateLockCircle();const redAfterLoss=acquisitionCircleElement.classList.contains('locked');
    smoothAcquisition={start,first,middle,end,redDuringTravel,redAfterTravel,redAfterLoss};
  }


  return {circleWidths:[first,second],ownSurvives,bounded,afterClear:clientProjectiles.size+predictedProjectiles.size,ringStroke,lockedHitStroke,bracketStroke,extraTargetBoxes,maxTargetMarkerError,newCandidateRequested,unconfirmedStaysNeutral,smoothAcquisition};
 },
 async measure(count,seconds=20){
  this.scene({count});
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const frames=[],cpu=[];let last=performance.now(),started=last,lastShot=last,shots=0;
  while(performance.now()-started<seconds*1000){
   await new Promise(r=>requestAnimationFrame(r));const now=performance.now(),delta=Math.min(.1,(now-last)/1000);
   if(now-started>2000)frames.push(now-last);last=now;const work=performance.now();
   for(const remote of remotePlayers.values())remote.timeSinceUpdate=0;
   serverAimReceivedAt=now;
   if(now-lastShot>=200){lastShot=now;for(let i=0;i<count;i++){
    const remote=remotePlayers.get('qa-'+i);if(!remote)continue;
    addProjectile({type:'projectileSpawn',projectileId:'render-'+shots++,ownerId:remote.playerId,position:{x:remote.plane.position.x,y:remote.plane.position.y,z:remote.plane.position.z},direction:{x:0,y:0,z:-1},speed:520,mode:'ballistic',serverNow:0});
   }}
   updateRemotePlayers(delta);updateCombatTarget(delta);updateLockCircle();updateProjectiles(delta);updateFlashEffects(muzzleFlashes,muzzleFlashPool,delta);updateFlashEffects(impactFlashes,impactFlashPool,delta);
   renderer.render(scene,camera);if(now-started>2000)cpu.push(performance.now()-work);
  }
  const q=(v,p)=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]||0;
  const result={count,gpu,frames:frames.length,frameP50Ms:q(frames,.5),frameP95Ms:q(frames,.95),frameP99Ms:q(frames,.99),cpuP95Ms:q(cpu,.95),meanFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),heapMiB:performance.memory?.usedJSHeapSize/1048576,projectiles:clientProjectiles.size,pool:projectilePool.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,visibleIdentityTags:[...remotePlayers.values()].filter(r=>r.identityTag.visible).length,visibleHealthTags:[...remotePlayers.values()].filter(r=>r.hullTag.visible).length,reticleWidth:acquisitionCircleElement.getBoundingClientRect().width};
  clearProjectileVisuals();result.afterClear=clientProjectiles.size+predictedProjectiles.size;return result;
 }
};`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-angle=metal']});
 const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:dpr});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message)});
 await page.addInitScript(()=>{window.WebSocket=class extends EventTarget{static OPEN=1;static CLOSED=3;readyState=3;send(){}close(){}}});
 await page.route('**/src/bootstrap.ts*',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('**/src/main.ts*',async route=>{
  const response=await route.fetch();let body=await response.text();
  if(baseline){let source=execFileSync('git',['show',baselineRef+':client/src/main.ts'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
   source=source.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(all,q,p)=>{let file=path.resolve(root+'/client/src',p);if(!path.extname(file))file+='.ts';return q+(file.startsWith(root+'/client/src/')?'/src/'+file.slice((root+'/client/src/').length):'/@fs'+file)+q});
   source=source.replace(/from 'three'/,"from '/node_modules/.vite/deps/three.js'").replaceAll('import.meta.env','({DEV:true})');body=esbuild.transformSync(source,{loader:'ts',format:'esm',target:'esnext'}).code;
  }
  body=body.replace('requestAnimationFrame(animate);','window.__qaFrozenFrame=animate;');await route.fulfill({response,body:body+"\n"+harness});
 });
 try{
  await page.goto('http://127.0.0.1:5178/?city=dallas&flighttest=1&launchMode=free-fly',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{await import('/src/main.ts')});await page.waitForFunction(()=>window.__combatQa,null,{timeout:60000});
  const results=[];for(const count of counts){const r=await page.evaluate(({count,seconds})=>window.__combatQa.measure(count,seconds),{count,seconds});results.push(r);console.log(JSON.stringify(r));fs.writeFileSync(output,JSON.stringify({baseline,viewport:{width:844,height:390,dpr},results,errors},null,2));}
  const checks=await page.evaluate(()=>window.__combatQa.checks());fs.writeFileSync(output,JSON.stringify({...JSON.parse(fs.readFileSync(output,'utf8')),checks},null,2));await page.screenshot({path:output.replace('.json','.png')});
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
