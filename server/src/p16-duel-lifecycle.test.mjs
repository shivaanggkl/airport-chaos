import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {competitiveModes} from '../../shared/competitive-modes.mjs';
import {duelScoreWinner,duelTimeoutWinner} from './sky-duel-rules.js';
import * as missions from '../../shared/journey-mission.mjs';
import * as protocol from '../../shared/protocol.mjs';
import * as visuals from '../../shared/remote-aircraft-visual-rules.mjs';
import {projectileImpactFraction} from '../../shared/projectile-collision.mjs';
import {CombatSpatialIndex} from './combat-spatial-index.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
const text=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',text,ts.ScriptTarget.Latest,true);
const functions=['skyDuelScoreDestruction','finishSkyDuelCombatStep','skyDuelSpawn','runwayCombatProtected','updateRespawningPlayers','markPlayerDestroyed','skyDuelTick','updateProjectiles','applyCombatHit','sameCombatContext','fireBlockReason','canFire'];
const code=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const session={id:'match',playerA:'a',playerB:'b',phase:'active',startedAt:1000,countdownEndsAt:1000,scoreA:0,scoreB:0,respawnA:0,respawnB:0};
 const players=new Map(['a','b'].map(id=>[id,{pilotId:id,skyDuelMode:true,skyDuelMatchId:'match',aircraftType:'trainer',health:100,lifeState:'alive',spawnProtectedUntil:0,position:{x:0,y:0,z:0},lastStateAt:1000,hasRespawnTransform:true}]));
 const outcomes=[],removed=[],packets=[];
 const ctx=vm.createContext({...missions,...protocol,competitiveModes,duelScoreWinner,duelTimeoutWinner,players,
  skyDuelSessions:new Map([['match',session]]),skyDuelScoredMatches:new Set(),skyDuelCombatDeaths:new Set(),skyDuelCombatStep:true,
  removePlayerProjectiles:id=>removed.push(id),skyDuelFinish:(s,result)=>{outcomes.push(result);ctx.skyDuelSessions.delete(s.id);},
  setServerLock(){},clearLocksForTarget(){},skyDuelHealth:100,skyDuelRunwayElevations:[10,10],
  skyDuelRunwaySpawn:slot=>({position:{x:0,y:11.2,z:slot? -2250:2250},heading:slot?0:Math.PI}),
  sendToPlayer:(_id,packet)=>packets.push(packet),sendSkyDuelPeerState(){},pausedJourneyPlayers:new Set(),pausedTrainingPlayers:new Set(),
  sendSkyDuel(){},broadcastToCity(){},broadcastLeaderboard(){},Date:{now:()=>ctx.now},now:1000,
  skyDuelRematches:new Map(),skyDuelQueue:new Map(),hasOpenPlayerSocket:()=>true,
  landingFlightState:new Map(),runwayOrTaxiSpawnArea:()=>({id:'dfw'}),
 });
 vm.runInContext(code,ctx);
 return {ctx,session,players,outcomes,removed,packets};
}
for(const reverse of [false,true])test(`simultaneous terminal destructions settle once as 3–3, order=${reverse}`,()=>{
 const f=fixture();f.session.scoreA=f.session.scoreB=2;
 for(const id of reverse?['b','a']:['a','b']){
  f.ctx.markPlayerDestroyed(id,f.players.get(id),2000);
  f.ctx.skyDuelScoreDestruction(f.session,id,2000);
  f.ctx.skyDuelScoreDestruction(f.session,id,2000);
 }
 assert.deepEqual(f.outcomes,[],'settlement waits until the authoritative step completes');
 assert.deepEqual(f.removed,[],'in-flight trade shots survive until the step ends');
 f.ctx.finishSkyDuelCombatStep(2000);f.ctx.finishSkyDuelCombatStep(2000);
 assert.deepEqual(f.outcomes,['DRAW']);assert.deepEqual([...f.removed].sort(),['a','b']);
 assert.equal(f.session.scoreA,3);assert.equal(f.session.scoreB,3);
 f.ctx.skyDuelScoreDestruction(f.session,'a',2050);assert.equal(f.session.scoreB,3);
});
test('first to three settles at step end; same-step 3–2 remains a win',()=>{
 const f=fixture();f.session.scoreA=2;f.session.scoreB=1;
 for(const id of ['a','b']){f.ctx.markPlayerDestroyed(id,f.players.get(id),2000);f.ctx.skyDuelScoreDestruction(f.session,id,2000);}
 f.ctx.finishSkyDuelCombatStep(2000);assert.deepEqual(f.outcomes,['WIN_A']);
});
test('destruction before deadline scores; exact deadline and later cannot score',()=>{
 for(const offset of [-1,0,1]){
  const f=fixture();f.players.get('b').lifeState='destroyed';
  f.ctx.skyDuelScoreDestruction(f.session,'b',241000+offset);
  assert.equal(f.session.scoreA,offset<0?1:0);
 }
});
test('only the destroyed pilot respawns at full health with a fixed eight-second protection window',()=>{
 const f=fixture(),a=f.players.get('a'),b=f.players.get('b');
 a.health=40;a.position={x:12,y:900,z:8};
 f.ctx.markPlayerDestroyed('b',b,2000);f.ctx.skyDuelScoreDestruction(f.session,'b',2000);
 assert.equal(f.session.respawnB,5000);assert.equal(f.session.respawnA,0);
 f.ctx.skyDuelSpawn('b',f.session,5000);
 assert.equal(b.health,100);assert.equal(b.spawnProtectedUntil,13000);assert.equal(a.health,40);assert.deepEqual(a.position,{x:12,y:900,z:8});
 assert.equal(b.hasRespawnTransform,true,'the authoritative spawn does not wait for a client acknowledgement');
 f.ctx.updateRespawningPlayers(5050);assert.equal(b.lifeState,'alive','protected pilots can take off');
 f.ctx.now=12999;assert(f.ctx.runwayCombatProtected('b',b));
 f.ctx.now=13000;assert.equal(f.ctx.runwayCombatProtected('b',b),false,'remaining grounded cannot extend duel protection');
 assert.equal(b.spawnProtectedUntil,13000);
});
test('loading/launch remain protected and ordinary runway immunity is preserved outside Sky Duel',()=>{
 const f=fixture(),a=f.players.get('a');a.lifeState='respawning';
 for(const phase of ['loading','countdown','launch']){
  f.session.phase=phase;f.ctx.now=30000;f.ctx.updateRespawningPlayers(30000);
  assert.equal(a.lifeState,'respawning');assert(f.ctx.runwayCombatProtected('a',a));
 }
 a.skyDuelMatchId=undefined;a.skyDuelMode=false;
 assert(f.ctx.runwayCombatProtected('a',a));
});

for(const [a,b,outcome] of [[2,1,'WIN_A'],[0,1,'WIN_B'],[2,2,'DRAW']])test(`timeout ${a}–${b} resolves once at exactly four minutes`,()=>{
 const f=fixture();f.session.scoreA=a;f.session.scoreB=b;
 f.ctx.skyDuelTick(240999);assert.deepEqual(f.outcomes,[]);
 f.ctx.skyDuelTick(241000);f.ctx.skyDuelTick(241001);assert.deepEqual(f.outcomes,[outcome]);
});
test('validated terminal scores from before the deadline settle before a racing timeout',()=>{
 const f=fixture();f.session.scoreA=2;f.ctx.markPlayerDestroyed('b',f.players.get('b'),240999);
 f.ctx.skyDuelScoreDestruction(f.session,'b',240999);f.ctx.skyDuelTick(241000);assert.deepEqual(f.outcomes,[]);
 f.ctx.finishSkyDuelCombatStep(241000);assert.deepEqual(f.outcomes,['WIN_A']);
});

for(const order of [['a','b'],['b','a']])test(`real swept projectile trades produce 3–3 regardless of iteration order ${order}`,()=>{
 const f=fixture();f.session.scoreA=f.session.scoreB=2;f.ctx.now=2000;
 for(const [id,p] of f.players){Object.assign(p,{entityType:'player',cityId:'dallas',velocity:{x:0,y:0,z:0},position:{x:id==='a'?0:100,y:1000,z:0}});}
 Object.assign(f.ctx,missions,protocol,visuals,{projectileImpactFraction,
  projectiles:new Map(),playerJourneyAttempts:new Map(),playerJourneyRunwayPrep:new Set(),pausedJourneyAttempts:new Set(),
  combatSpatialIndex:new CombatSpatialIndex(),combatNearbyPlayers:[],maxCombatHitRadius:100,
  projectileHitRadiusMultiplier:1,projectileVisualRadius:1,
  focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,
  broadcastProjectileStates(){},updateMonsterEncounters(){},updateTransportEncounters(){},sendSkyDuelScore(){},
 });
 f.ctx.removeProjectile=id=>f.ctx.projectiles.delete(id);
 const remove=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='removePlayerProjectiles');
 vm.runInContext(ts.transpileModule(remove.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,f.ctx);
 for(const id of order)f.ctx.projectiles.set(id,{projectileId:id,ownerId:id,cityId:'dallas',skyDuelMatchId:'match',
  position:{...f.players.get(id).position},direction:{x:id==='a'?1:-1,y:0,z:0},speed:7000,traveled:0,damage:100});
 f.ctx.updateProjectiles(.05);f.ctx.skyDuelCombatStep=false;f.ctx.finishSkyDuelCombatStep(2000);
 assert.equal(f.players.get('a').health,0);assert.equal(f.players.get('b').health,0);
 assert.deepEqual(f.outcomes,['DRAW']);assert.equal(f.ctx.projectiles.size,0);
});

test('crash packets require an accepted unsafe ground impact, not a client-declared kill',()=>{
 let branch;
 function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(ast)==="message.type === 'skyDuelGroundCrash'")branch=node.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert(branch);
 const handler=ts.transpileModule(`function crashPacket(){${branch}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const scenario of ['parked','airborne','protected','loading','expired','hard-landing','overspeed']){
  const f=fixture(),player=f.players.get('a');
  Object.assign(player,{rotation:{x:0,y:0,z:0},position:{x:0,y:1.2,z:0},velocity:{x:0,y:0,z:0}});
  f.ctx.now=10000;
  if(scenario==='airborne'){player.position.y=1000;player.velocity.y=-30;}
  if(scenario==='protected')player.spawnProtectedUntil=18000;
  if(scenario==='loading')f.session.phase='loading';
  if(scenario==='expired')f.ctx.now=241000;
  if(scenario==='hard-landing')player.velocity.y=-30;
  if(scenario==='overspeed')player.velocity.x=200;
  Object.assign(f.ctx,{player,playerId:'a',message:{type:'skyDuelGroundCrash'},aircraftFlightEnvelope,
   botTerrainHeight:()=>0,aircraftGroundOffset:1.2,groundedAtAirport:()=>({id:'dfw'}),sendSkyDuelScore(){}});
  vm.runInContext(handler,f.ctx);f.ctx.crashPacket();f.ctx.crashPacket();
  const valid=scenario==='hard-landing'||scenario==='overspeed';
  assert.equal(f.session.scoreB,valid?1:0,scenario);assert.equal(player.lifeState,valid?'destroyed':'alive',scenario);
 }
});

test('firing closes at the exact deadline or a pending terminal score, before result presentation',()=>{
 const f=fixture(),player=f.players.get('a');Object.assign(player,{entityType:'player',lastFireAt:0});
 f.ctx.fireIntervalMs=protocol.fireIntervalMs;
 f.ctx.now=240999;assert.equal(f.ctx.canFire(player,240999,'a'),true);
 f.ctx.now=241000;assert.equal(f.ctx.canFire(player,241000,'a'),false);
 f.ctx.now=2000;f.session.scoreA=3;assert.equal(f.ctx.canFire(player,2000,'a'),false);
});

test('surrender or cancellation cannot override a validated terminal combat batch',()=>{
 const f=fixture();f.session.scoreA=2;f.ctx.markPlayerDestroyed('b',f.players.get('b'),2000);
 f.ctx.skyDuelScoreDestruction(f.session,'b',2000);
 const settle=f.ctx.skyDuelFinish,fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='skyDuelFinish');
 vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,f.ctx);
 f.ctx.skyDuelFinish(f.session,'WIN_B',2000,'forfeit');
 f.ctx.skyDuelFinish(f.session,'CANCELLED',2000);
 assert(f.ctx.skyDuelSessions.has(f.session.id));assert.deepEqual(f.outcomes,[]);
 f.ctx.skyDuelFinish=settle;f.ctx.finishSkyDuelCombatStep(2000);
 assert.deepEqual(f.outcomes,['WIN_A']);
});
