import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStationaryWarlordEncounter,stationaryWarlordSpecies} from './stationary-warlord.js';
import {strikingWarlordSpecies} from './striking-warlord.js';
import {stepM19,permittedM19Damage,disposeM19} from './m19-titan.js';
import {aircraftHitRadii} from '../../shared/remote-aircraft-visual-rules.mjs';
import {createStrikingWarlordEncounter} from './striking-warlord.js';
import {createHuntingWarlordEncounter} from './hunting-warlord.js';
import {createShowdownWarlordEncounter} from './showdown-warlord.js';
import {createPursuitWarlordEncounter} from './pursuit-warlord.js';
import {createFinalWarlordEncounter} from './final-warlord.js';
import * as missions from '../../shared/journey-mission.mjs';
const variants=[
 {mission:missions.journeyDallas25,create:createStationaryWarlordEncounter},
 {mission:missions.journeyDallas20,create:createStrikingWarlordEncounter},
 {mission:missions.journeyDallas21,create:createHuntingWarlordEncounter},
 {mission:missions.journeyDallas22,create:createShowdownWarlordEncounter},
 {mission:missions.journeyDallas23,create:createPursuitWarlordEncounter},
 {mission:missions.journeyDallas19,create:createFinalWarlordEncounter},
];
const zero={x:0,y:0,z:0},make=(variant=variants[0])=>variant.create('contact','pilot',0,()=>135,[]);
for(const variant of variants)for(const type of ['trainer','cargo','privateJet','fighter'])test(`${variant.mission.name} ${type}: a fast sweep through real body geometry hurts once`,()=>{
 const e=make(variant);try{
  const center=e.frame.limbs.gem,position={x:center.x,y:center.y,z:center.z+250},velocity={x:0,y:0,z:5000};
  stepM19(e,position,velocity,aircraftHitRadii[type],100);
  const contacts=e.events.filter(event=>event.kind==='damage'&&event.type==='contact');
  assert.equal(contacts.length,1,'sweep catches traversal even when the endpoint has left the body');
  const event=contacts[0];assert.equal(permittedM19Damage(e,event,100100),25);assert.equal(permittedM19Damage(e,event,100100),0);
  assert.equal(e.contactAt,0,'body contact does not consume the four-second punch cooldown');
  assert.equal(e.engine.snapshot().health,variant.mission.bossHealth,'aircraft collision does not invent damage to the boss');
 }finally{disposeM19(e);}
});

for(const variant of variants)test(`${variant.mission.name}: body overlap is throttled; near misses and a defeated monster cannot hurt the plane`,()=>{
 const e=make(variant);try{
  const center=e.frame.limbs.gem;let previous=-Infinity,hits=0;
  for(let ms=100;ms<=3100;ms+=100){
   stepM19(e,e.frame.limbs.gem,zero,18,ms);
   for(const event of e.events)if(event.kind==='damage'&&event.type==='contact'){
    assert(ms-previous>=1000);previous=ms;hits++;assert.equal(permittedM19Damage(e,event,100000+ms),25);
   }
  }
  assert(hits>=3);
  const far={x:center.x,y:e.frame.position.y+variant.mission.monster.height+1000,z:center.z};
  stepM19(e,far,zero,18,3200);assert(!e.events.some(event=>event.kind==='damage'));
  const body=e.frame.limbs.gem,from={x:body.x,y:body.y,z:body.z+2000},to={x:body.x,y:body.y,z:body.z-2000};
  e.engine.damage({encounterId:e.attemptId,source:'pilot',sequence:1,from,to,amount:variant.mission.bossHealth,radius:1,delta:0});
  stepM19(e,center,zero,18,3300);assert(!e.events.some(event=>event.kind==='damage'));
 }finally{disposeM19(e);}
});

for(const variant of variants)test(`${variant.mission.name}: body contact cannot cross ownership, disposed or unsupported-damage boundaries`,()=>{
 const e=make(variant);try{
  stepM19(e,e.frame.limbs.gem,zero,18,100);const event=e.events.find(event=>event.kind==='damage'&&event.type==='contact');assert(event);
  assert.equal(permittedM19Damage(e,{...event,targetId:'other'},100100),0);
  assert.equal(permittedM19Damage(e,{...event,encounterId:'other'},100100),0);
  assert.equal(permittedM19Damage(e,{...event,amount:999},100100),0);
  disposeM19(e);assert.equal(permittedM19Damage(e,event,100100),0);
  assert.equal(stationaryWarlordSpecies.contactDamage,25);assert.equal(strikingWarlordSpecies.contactDamage,25);
 }finally{disposeM19(e);}
});


for(const variant of variants)test(`${variant.mission.name}: a server-confirmed body impact reduces actual pilot health and respects spawn protection`,()=>{
 const e=make(variant);try{
  stepM19(e,e.frame.limbs.gem,zero,18,100);
  const event=e.events.find(v=>v.kind==='damage'&&v.type==='contact');assert(event);
  const damage=permittedM19Damage(e,event,100100);assert.equal(damage,25);
  const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='damageMonsterPilot');assert(fn);
  const packets=[],pilot={lifeState:'alive',health:200,spawnProtectedUntil:0,aircraftType:'trainer'};
  const ctx=vm.createContext({encounter:e,pilot,damage,airportRepairStays:new Map(),maxHealthForAircraft:()=>200,
   broadcastToCity:(_city,message)=>packets.push(message),failPlayerJourney:()=>assert.fail('nonfatal contact cannot fail the mission'),markPlayerDestroyed:()=>assert.fail('nonfatal contact cannot destroy the plane')});
  vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+"\ndamageMonsterPilot(encounter,pilot,damage,100100);",ctx);
  assert.equal(pilot.health,175);assert.equal(packets[0].type,'damage');assert.equal(packets[0].health,175);
  pilot.spawnProtectedUntil=200000;vm.runInContext('damageMonsterPilot(encounter,pilot,damage,100200)',ctx);
  assert.equal(pilot.health,175);assert.equal(packets.length,1);
 }finally{disposeM19(e);}
});
