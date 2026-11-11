import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import * as missions from '../../shared/journey-mission.mjs';
import {CombatMissionIntroPath as MissionSevenIntroPath,MISSION_COMBAT_INTRO_DURATION_MS as MISSION_SEVEN_INTRO_DURATION_MS} from '../../client/src/mission-combat-intro.ts';

test('M7 previews the airborne opponent, then hands off to the selected player',()=>{
 const enemy=new THREE.Group(),player=new THREE.Group();
 enemy.add(new THREE.Mesh(new THREE.BoxGeometry(11,3,13)));player.add(new THREE.Mesh(new THREE.BoxGeometry(8,2,7)));
 enemy.position.set(-5140,140,-7780);enemy.rotation.y=.4;player.position.set(-22800,160,-13600);
 const enemyStart=enemy.position.clone(),playerStart=player.position.clone();
 const intro=new MissionSevenIntroPath(enemy,player),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(-22800,165,-13580),look=new THREE.Vector3(-22800,161,-13605);
 for(const elapsed of [0,1500,3499,4000,4500,6000,8000]){
  intro.sample(elapsed,position,target,chase,look);
  assert.ok(position.distanceTo(elapsed<4000?enemy.position:player.position)<50);
  assert.ok(position.y>(elapsed<4000?enemy.position.y:player.position.y));
  assert.ok(position.distanceTo(target)>5);assert.ok(position.toArray().every(Number.isFinite));
  const departure = new THREE.Vector3(0,0,-1).applyAxisAngle(THREE.Object3D.DEFAULT_UP,.4);
  assert.ok(enemy.position.distanceTo(enemyStart.clone().addScaledVector(departure, Math.min(elapsed,4000)*.16))<1e-8);
  assert.equal(enemy.position.y,enemyStart.y);assert.ok(player.position.equals(playerStart));
 }
 assert.ok(position.equals(chase));assert.ok(target.equals(look));assert.equal(intro.fov(8000,58),58);
 assert.equal(intro.streamingPosition(0),enemy.position);assert.equal(intro.streamingPosition(4500),player.position);
 assert.equal(MISSION_SEVEN_INTRO_DURATION_MS,9000);
});

for (const missionNumber of [7,8,9,10,11,12]) test(`M${missionNumber} labels every cinematic opponent using the shared identity tag`,async()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const functions=['prepareMissionCombatIntro','updateMissionCombatIntroIdentityTags','clearMissionCombatIntroAircraft'];
 const code=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&functions.includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');
 const player=new THREE.Group();player.userData.assetReady=Promise.resolve();
 const labels=[],painted=[],disposed=[];
 const definition=missions[`journeyDallas${missionNumber+6}`];
 const ctx=vm.createContext({...missions,THREE,airplane:player,scene:new THREE.Scene(),
  missionCombatIntroAircraft:undefined,missionCombatIntroIdentityTags:[],missionCombatIntroLabelPosition:new THREE.Vector3(),remotePlayers:new Map(),
  journeyAttempt:{attemptId:'attempt',status:'APPROACH',targetId:'primary',secondaryTargetId:'secondary',rearGuardThirdId:'third',rearGuardFourthId:'fourth'},flightLaunchState:'pending',
  airports:['love','addison','executive','dfw'].map(id=>({id,x:100,z:200,spawnOffset:10,heading:.3})),
  getTerrainHeight:()=>130,groundPlaneY:()=>132,
  applyEquippedLivery(){},applyPlaneGroundContact(){},disposeAirplaneMaterials(){},
  createPlayerIdentityTag(name,type){const label=new THREE.Sprite();labels.push({label,name,type});return label;},
  paintPlayerIdentityTag(...args){painted.push(args);},disposePlayerIdentityTag(label){disposed.push(label);},
  performance:{now:()=>1000},flightLaunchStartedAt:0,camera:new THREE.PerspectiveCamera(58,1,.1,100000),window:{innerHeight:900},
  aircraftVisualGroundY:()=>130,cityWorld:{},beginFlightLaunchCinematic(){},
  createAirplane(){const plane=new THREE.Group();plane.add(new THREE.Mesh(new THREE.BoxGeometry(11,3,13)));
   plane.userData.assetGear=new THREE.Group();plane.userData.assetReady=Promise.resolve();return plane;},
  CombatMissionIntroPath:MissionSevenIntroPath});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 await ctx.prepareMissionCombatIntro('attempt',definition.id);
 const stage=ctx.missionCombatIntroAircraft;
 if(missionNumber===7){
  assert.equal(stage.position.x,definition.enemySpawn.x);assert.equal(stage.position.z,definition.enemySpawn.z);
  assert.equal(stage.position.y,130+definition.enemyAltitude);assert.equal(stage.rotation.y,-Math.PI/2);
 }
 assert.equal(ctx.missionCombatIntroPath.missionNumber,missionNumber);
 assert.equal(labels.length,missionNumber===12?4:missionNumber===11?3:missionNumber===10?2:1);
 assert.deepEqual(labels.map(({name})=>name),missionNumber===12?missions.journeyDallas18.enemies.map(enemy=>enemy.name):missionNumber===11?missions.journeyDallas17.enemies.map(enemy=>enemy.name):missionNumber===10?['RED NIGHTOWL','BLUEJAY WINGMAN']:
  [{7:'RED NIGHTOWL',8:'ATTACKING BLUEJAY',9:missions.journeyDallas15.bossName,11:'ARMORED MAMMOTH',12:'LEGENDARY FIREHAWK'}[missionNumber]]);
 ctx.flightLaunchState='active';
 stage.position.add(new THREE.Vector3(75,30,-120));
 ctx.remotePlayers.set('primary',{displayName:'LIVE TARGET',identityTag:{userData:{ownershipColors:['#abc']}}});
 ctx.updateMissionCombatIntroIdentityTags();
 for(const [index,{label,type}] of labels.entries()){
  const aircraft=stage.children[index],position=aircraft.getWorldPosition(new THREE.Vector3()),args=painted[index];
  assert.equal(aircraft.userData.assetGear.visible,false);
  assert.equal(label.parent,ctx.scene);assert.equal(label.visible,true);
  assert.equal(args[1],index===0?'LIVE TARGET':missionNumber===12?missions.journeyDallas18.enemies[index].name:missionNumber===11?missions.journeyDallas17.enemies[index].name:'BLUEJAY WINGMAN');assert.equal(args[2],type);
  assert.equal(args[6],position.distanceTo(player.position));assert.equal(args[10],position.y-130);
  assert.equal(args[12],true,'include distance even at close range');
  assert.equal(label.position.x,position.x);assert.equal(label.position.z,position.z);
  assert.ok(label.position.y>position.y);
 }
 ctx.updateMissionCombatIntroIdentityTags();assert.equal(painted.length,labels.length,'throttle canvas painting');
 ctx.flightLaunchState='complete';ctx.updateMissionCombatIntroIdentityTags();
 assert.ok(labels.every(({label})=>!label.visible));
 ctx.clearMissionCombatIntroAircraft();
 assert.equal(ctx.missionCombatIntroIdentityTags.length,0);assert.equal(disposed.length,labels.length);
 assert.ok(labels.every(({label})=>label.parent===null));assert.equal(stage.parent,null);
});
test('airfield cuts are hidden and M7 reuses skip/countdown/input locking and cleanup',()=>{
 const intro=new MissionSevenIntroPath(new THREE.Group(),new THREE.Group());
 assert.equal(intro.wipe(0),0);assert.equal(intro.wipe(4000),1);assert.equal(intro.wipe(4500),0);assert.equal(intro.wipe(8500),1);assert.equal(intro.wipe(9000),0);
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 assert.match(source,/prepareMissionCombatIntro\(message\.attempt\.attemptId, message\.attempt\.missionId\)/);
 assert.match(source,/aircraft\.userData\.assetReady/);
 assert.match(source,/missionCombatIntroPath = undefined;\s+clearMissionCombatIntroAircraft\(\)/);
 assert.match(source,/missionCombatIntroPath \? missionCombatIntroPath\.durationMs/);
 assert.match(source,/missionCombatIntroPath \? missionCombatIntroPath\.missionNumber : missionSixIntroPath/);
 assert.match(source,/journeyCountdownComplete/);
});

for (const missionNumber of [8,9,10,11,12]) test(`M${missionNumber} stages a real airborne reveal and hands off to the unchanged player`,()=>{
 const stage=new THREE.Group(),player=new THREE.Group();stage.position.set(-13000,900,-18000);player.position.set(-22800,160,-13600);
 stage.add(new THREE.Mesh(new THREE.BoxGeometry(11,3,13)));
 if(missionNumber===10){const wingman=new THREE.Mesh(new THREE.BoxGeometry(8,2,7));wingman.position.set(60,10,25);stage.add(wingman);}
 const original=stage.position.clone(),playerPosition=player.position.clone();
 const intro=new MissionSevenIntroPath(stage,player,missionNumber),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(-22800,165,-13580),look=new THREE.Vector3(-22800,161,-13605);
 intro.sample(0,position,target,chase,look);assert.ok(position.distanceTo(stage.position)<200);
 intro.sample(2000,position,target,chase,look);assert.equal(stage.position.y,original.y);assert.ok(Math.abs(stage.position.distanceTo(original)-(missionNumber===12?1200:missionNumber===9?840:320))<.001);
 assert.ok(position.distanceTo(stage.position)<200);assert.equal(intro.streamingPosition(2000),stage.position);
 intro.sample(8000,position,target,chase,look);assert.ok(position.equals(chase));assert.ok(target.equals(look));assert.ok(player.position.equals(playerPosition));
 assert.equal(intro.missionNumber,missionNumber);
});


test('M19 reveals the existing full-scale boss then returns to the DFW player without moving either',()=>{
 const boss=new THREE.Group(),player=new THREE.Group();boss.add(new THREE.Mesh(new THREE.BoxGeometry(900,1920,600)));boss.position.set(-5500,135,-2400);player.position.set(-22800,140,-13600);
 const origin=boss.position.clone(),pilot=player.position.clone(),intro=new MissionSevenIntroPath(boss,player,19),camera=new THREE.Vector3(),look=new THREE.Vector3(),chase=pilot.clone().add(new THREE.Vector3(0,8,25)),target=pilot.clone();
 for(const elapsed of [0,2000,5499,6000,6500,9500,11000]){
  intro.sample(elapsed,camera,look,chase,target);assert(camera.toArray().every(Number.isFinite));assert(camera.distanceTo(look)>5);assert(boss.position.equals(origin));assert(player.position.equals(pilot));
  if(elapsed<5500){assert(look.y>origin.y+900);assert(camera.distanceTo(boss.position)>1900);assert(camera.z>boss.position.z,'boss reveal must show its front and chest core');}
 }
 assert(camera.equals(chase));assert(look.equals(target));assert.equal(intro.durationMs,12000);assert.equal(intro.wipe(6000),1);assert.equal(intro.wipe(12000),0);assert.equal(intro.streamingPosition(2000),boss.position);assert.equal(intro.streamingPosition(7000),player.position);
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');assert.match(source,/new CombatMissionIntroPath\(view.introRoot,airplane,19\)/);assert.match(source,/prepareMonsterMissionIntro\(message.attempt.attemptId\)/);
});

test('M19 runway flight is not gated on the combat clock starting',()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const start=source.indexOf('// Airborne encounter spawns wait for their clock');
 const guard=source.slice(start,source.indexOf('// Keep high-speed travel',start));
 assert(start>=0);assert.doesNotMatch(guard,/journeyDallas19/);assert.match(guard,/journeyDallas20/);
});

test('M19 restart resets the shared intro welcome rather than reconnecting directly into gameplay',()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const retry=source.slice(source.indexOf('async function retryJourneyMission()'),source.indexOf("window.addEventListener('airport-chaos-city-exit'"));
 assert.match(retry,/const retryGateIntro = [^\n]*journeyAttempt.missionId === journeyDallas19.id/);
 assert.match(retry,/if \(retryGateIntro\) \{\s*flightLaunchWelcomeHandled = false;\s*flightLaunchState = 'pending';\s*airborneIntroAwaiting = true;/);
 assert.match(retry,/missionStartCountdownPending = true/);
 assert.match(retry,/await replaceRealtimeSocket\('Journey retry'\)/);
});
