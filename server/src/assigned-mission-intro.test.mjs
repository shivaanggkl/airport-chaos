import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import * as THREE from 'three';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.ts';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
import {journeyDallasTwinHunters01,journeyDallasTerritoryDefense01} from '../../shared/journey-mission.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
function introFixture(mission=journeyDallasTwinHunters01){
 const actor=()=>{const group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(30,8,25)));return group;};
 let starts=0;const context=vm.createContext({journeyDallasTwinHunters01,journeyDallasTerritoryDefense01,CombatMissionIntroPath,MissionCaptureIntroPath,
  journeyAttempt:{attemptId:'attempt',missionId:mission.id,status:'APPROACH',targetId:null,secondaryTargetId:null},flightLaunchState:'pending',missionCombatIntroPath:undefined,missionCaptureIntroPath:undefined,
  airplane:actor(),remotePlayers:new Map(),territoryDefinitions:territoriesForCity('dallas'),getTerrainHeight:()=>0,flightGameRoot:{classList:{add(){}}},beginFlightLaunchCinematic(){starts++;context.flightLaunchState='active';}});
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['prepareAssignedMissionIntro','prepareMissionCombatIntro'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {context,actor,starts:()=>starts,pump:async()=>{context.prepareAssignedMissionIntro();await new Promise(resolve=>setImmediate(resolve));}};
}

test('M15 prepares once when aircraft precede the final assigned-ID packet',async()=>{
 const f=introFixture(),c=f.context;await f.pump();
 c.remotePlayers.set('one',{plane:f.actor()});await f.pump();assert.equal(f.starts(),0);
 c.journeyAttempt={...c.journeyAttempt,targetId:'one'};await f.pump();assert.equal(f.starts(),0);
 c.remotePlayers.set('two',{plane:f.actor()});await f.pump();assert.equal(f.starts(),0);
 c.journeyAttempt={...c.journeyAttempt,secondaryTargetId:'two'};await f.pump();assert.equal(f.starts(),1);assert.equal(c.missionCombatIntroPath.opponent,c.remotePlayers.get('one').plane);assert.equal(c.missionCombatIntroPath.durationMs,10000);
 await f.pump();assert.equal(f.starts(),1);
});

test('assigned intro waits for both real assets and cancels stale preparation',async()=>{
 const f=introFixture(),c=f.context;let release;const ready=new Promise(resolve=>release=resolve),one=f.actor(),two=f.actor();one.userData.assetReady=ready;two.userData.assetReady=ready;
 c.journeyAttempt={...c.journeyAttempt,targetId:'one',secondaryTargetId:'two'};c.remotePlayers.set('one',{plane:one});c.remotePlayers.set('two',{plane:two});c.prepareAssignedMissionIntro();c.prepareAssignedMissionIntro();assert.equal(f.starts(),0);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.starts(),1);
 const stale=introFixture();let releaseStale;const delayed=stale.actor();delayed.userData.assetReady=new Promise(resolve=>releaseStale=resolve);stale.context.journeyAttempt={...stale.context.journeyAttempt,targetId:'one',secondaryTargetId:'two'};stale.context.remotePlayers.set('one',{plane:delayed});stale.context.remotePlayers.set('two',{plane:stale.actor()});stale.context.prepareAssignedMissionIntro();stale.context.journeyAttempt.status='ABANDONED';releaseStale();await new Promise(resolve=>setImmediate(resolve));assert.equal(stale.starts(),0);
});

test('M16 uses the same assigned-packet retry without duplicating its real invader',async()=>{
 const f=introFixture(journeyDallasTerritoryDefense01),c=f.context;await f.pump();c.remotePlayers.set('invader',{plane:f.actor()});await f.pump();assert.equal(f.starts(),0);c.journeyAttempt={...c.journeyAttempt,targetId:'invader'};await f.pump();assert.equal(f.starts(),1);assert.equal(c.missionCaptureIntroPath.defense.invader,c.remotePlayers.get('invader').plane);
});

test('both actor arrival and the attempt handler invoke preparation outside the one-time welcome handshake',()=>{
 let handler;const find=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='handleServerMessage')handler=node;ts.forEachChild(node,find);};find(ast);assert.ok(handler);
 const attemptBranch=handler.body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==="message.type === 'journeyAttempt'");
 assert.ok(attemptBranch.thenStatement.statements.some(n=>ts.isExpressionStatement(n)&&n.expression.getText(ast)==='prepareAssignedMissionIntro()'));
 const remote=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateRemotePlayer');assert.match(remote.getText(ast),/remotePlayers\.set\(player.playerId, remote\);\s*prepareAssignedMissionIntro\(\)/);
});

test('live M15 packet order starts the client intro, keeps both staged actors fresh and reaches GO',{timeout:25000},async()=>{
 const {spawn}=await import('node:child_process'),{createServer}=await import('node:net'),{mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{DatabaseSync}=await import('node:sqlite'),{default:WebSocket}=await import('ws');
 const {PlayerProfileStore}=await import('./player-profiles.js'),{PilotSessionStore}=await import('./session-auth.js'),{JourneyAttemptStore}=await import('./journey-attempts.js'),{PROTOCOL_VERSION}=await import('../../shared/protocol.mjs');
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),dir=mkdtempSync(join(tmpdir(),'m15-intro-live-')),path=join(dir,'p.sqlite'),sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false),profiles=new PlayerProfileStore(path);profiles.getOrCreate(identity.pilotId,'Pilot');
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true);db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run(identity.pilotId,'journey-dallas-05','m14-clear',Date.now());const attempt=store.launch(identity.pilotId,'trainer',Date.now(),journeyDallasTwinHunters01.id);
 const port=await new Promise(resolve=>{const listener=createServer();listener.listen(0,'127.0.0.1',()=>{const port=listener.address().port;listener.close(()=>resolve(port));});});
 const server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});let logs='',socket;server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const packets=[],f=introFixture();
 const wait=async predicate=>{for(let i=0;i<400;i++){const match=packets.find(predicate);if(match)return match;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing mission packet: ${logs}`);};
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>{const p=JSON.parse(String(b));packets.push(p);if(p.type==='journeyAttempt')f.context.journeyAttempt=p.attempt;
   if((p.type==='playerState'||p.type==='state')&&p.isBot&&!f.context.remotePlayers.has(p.playerId)){const plane=f.actor();plane.position.set(p.position.x,p.position.y,p.position.z);f.context.remotePlayers.set(p.playerId,{plane});}
   if(p.type==='journeyAttempt'||p.type==='playerState'||p.type==='state')f.context.prepareAssignedMissionIntro();});
  const welcome=await wait(p=>p.type==='welcome');socket.send(JSON.stringify({type:'state',position:welcome.airborneSpawn.position,rotation:{x:0,y:Math.PI,z:0},aircraftType:'trainer',stateSequence:1}));
  const assigned=await wait(p=>p.type==='journeyAttempt'&&p.attempt.targetId&&p.attempt.secondaryTargetId);await sleep(1200);assert.equal(f.starts(),1,'real packet ordering must leave Preparing Mission and start the intro');
  for(const id of [assigned.attempt.targetId,assigned.attempt.secondaryTargetId]){const states=packets.filter(p=>(p.type==='state'||p.type==='playerState')&&p.playerId===id);assert.ok(states.length>=3);for(const state of states){assert.deepEqual(state.velocity,{x:0,y:0,z:0});assert.deepEqual(state.position,states[0].position);assert.equal(state.health,200);}}
  assert.equal(store.get(identity.pilotId,attempt.attemptId).deadlineAt,null);assert.equal(packets.some(p=>p.type==='damage'),false);
  socket.send(JSON.stringify({type:'journeyCountdownComplete',attemptId:attempt.attemptId}));const go=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');assert.equal(go.attempt.deadlineAt-go.attempt.startedAt,journeyDallasTwinHunters01.timeLimitMs);await sleep(500);
  for(const id of [assigned.attempt.targetId,assigned.attempt.secondaryTargetId]){const states=packets.filter(p=>(p.type==='state'||p.type==='playerState')&&p.playerId===id);assert.notDeepEqual(states.at(-1).position,states[0].position);}
 }finally{socket?.terminate();server.kill();await sleep(100);db.close();rmSync(dir,{recursive:true,force:true});}
});

test('the real client sends its initial spawn handshake while the mission countdown is pending',()=>{
 const stateFunction=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sendLocalState');assert.ok(stateFunction);
 const sent=[],context=vm.createContext({visualQaInspectionActive:false,freeFlyRespawnPending:false,journeyPaused:false,trainingPaused:false,localPlayerId:'pilot',connectionReady:()=>true,missionStartCountdownPending:true,missionStartCountdownStartedAt:null,
  airborneIntroAwaiting:true,runwayJourneyIntroAwaiting:false,flushProfileRewards(){},socket:{send:value=>sent.push(JSON.parse(value))},clientStateSequence:0,airplane:{position:{x:-27000,y:1100,z:-40000},rotation:{x:0,y:Math.PI,z:0}},aircraftType:'trainer',cityId:'dallas',boostActive:false,tutorialLandingIntentPending:undefined,championshipLandingIntentPending:undefined,performance:{now:()=>1000}});
 vm.runInContext(ts.transpileModule(stateFunction.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 context.sendLocalState();assert.equal(sent.length,0,'ordinary gameplay packets remain blocked');
 context.sendLocalState(true);assert.equal(sent.length,1,'spawn handshake must reach the server so it can stage the real intro actors');assert.equal(sent[0].type,'state');assert.equal(sent[0].position.x,-27000);
 context.missionStartCountdownStartedAt=1000;context.sendLocalState();assert.equal(sent.length,1,'countdown still blocks ordinary movement');context.journeyPaused=true;context.sendLocalState(true);assert.equal(sent.length,1,'handshake never bypasses pause');
});
