import test from 'node:test';
import assert from 'node:assert/strict';
import {createStrikingWarlordEncounter,strikingWarlordSpecies} from './striking-warlord.js';
import {createHuntingWarlordEncounter,huntingWarlordSpecies} from './hunting-warlord.js';
import {createShowdownWarlordEncounter,showdownWarlordSpecies} from './showdown-warlord.js';
import {createPursuitWarlordEncounter,pursuitWarlordSpecies} from './pursuit-warlord.js';
import {createFinalWarlordEncounter,finalWarlordSpecies} from './final-warlord.js';
import {stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
const zero={x:0,y:0,z:0};
for(const [mission,create] of [[20,createStrikingWarlordEncounter],[21,createHuntingWarlordEncounter],[22,createShowdownWarlordEncounter],[23,createPursuitWarlordEncounter],[24,createFinalWarlordEncounter]])test(`M${mission} releases three distinct fireballs together from one authored throw`,()=>{
 const e=create('volley','pilot',0,()=>135,[]),yaw=e.frame.yaw;
 const target={x:e.frame.position.x+Math.sin(yaw)*4000,y:e.frame.position.y+1400,z:e.frame.position.z+Math.cos(yaw)*4000};
 let releasedAt;
 try{
  for(let ms=50;ms<=120000;ms+=50){
   stepM19(e,target,zero,18,ms);
   const releases=e.events.filter(event=>event.type==='release');
   if(releasedAt!==undefined){
    assert.equal(releases.length,0,'the same throw must not release additional rounds');
    if(ms-releasedAt>=500)break;
   }else if(releases.length){
    releasedAt=ms;
    assert.equal(releases.length,3,'all rounds must release on the same server step');
    assert.equal(e.frame.animation.clip,model.clips.shoot.name);
    assert.equal(e.frame.projectiles.length,3);
    assert.equal(new Set(e.frame.projectiles.map(p=>p.id)).size,3);
    assert.equal(new Set(e.frame.projectiles.map(p=>JSON.stringify(p.velocity))).size,3,'slight spread keeps the fireballs visually separate');
    for(const event of releases)assert.deepEqual(event.position,releases[0].position,'all three originate from the same hand release');
   }
  }
  assert(releasedAt!==undefined,'monster must actually release a volley');
 }finally{disposeM19(e);assert.equal(e.engine.snapshot().projectiles.length,0);}
});

for(const type of Object.keys(aircraftFlightEnvelope))for(const boost of [false,true])test(`M20 fireballs reach a steadily receding ${type} at ${boost?'boost':'normal'} speed`,()=>{
 const e=createStrikingWarlordEncounter('fire','pilot',0,()=>135,[]),yaw=e.frame.yaw,speed=aircraftFlightEnvelope[type].maxSpeed*(boost?aircraftFlightEnvelope[type].boostMaxSpeed:1);
 const initial={x:e.frame.position.x+Math.sin(yaw)*2400,y:e.frame.position.y+1600,z:e.frame.position.z+Math.cos(yaw)*2400};
 const velocity={x:Math.sin(yaw)*speed,y:0,z:Math.cos(yaw)*speed};
 let damage=0,releases=0;
 try{
  for(let ms=50;ms<=36000&&!damage;ms+=50){
   const position={x:initial.x+velocity.x*ms/1000,y:initial.y,z:initial.z+velocity.z*ms/1000};
   stepM19(e,position,velocity,18,ms);
   for(const event of e.events){
    if(event.type==='release'){assert.equal(e.frame.animation.clip,model.clips.shoot.name);releases++;}
    if(event.kind==='damage'&&event.type==='projectile'){
     assert.equal(event.amount,25);damage+=permittedM19Damage(e,event,100000+ms);assert.equal(permittedM19Damage(e,event,100000+ms),0);
    }
   }
   for(const shot of e.frame.projectiles)assert(Math.abs(Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)-6000)<.001);
  }
  assert(releases>0,'must release a real projectile');assert.equal(damage,25,'steady flight can be caught by a genuine swept fireball collision');
 }finally{disposeM19(e);}
});

test('M20 release predicts a newly changed aircraft velocity and launches from the authored hand',()=>{
 const e=createStrikingWarlordEncounter('lead','pilot',0,()=>135,[]),yaw=e.frame.yaw;
 const initial={x:e.frame.position.x+Math.sin(yaw)*3500,y:e.frame.position.y+1600,z:e.frame.position.z+Math.cos(yaw)*3500};
 let released=false,position={...initial};
 try{
  for(let ms=50;ms<=18000&&!released;ms+=50){
   const active=e.frame.ability,remaining=active?active.warning+active.windup-active.elapsed:Infinity;
   const velocity=remaining<=.15?{x:Math.cos(yaw)*1600,y:120,z:-Math.sin(yaw)*1600}:zero;
   for(const axis of ['x','y','z'])position[axis]+=velocity[axis]*.05;
   stepM19(e,position,velocity,18,ms);
   const event=e.events.find(v=>v.type==='release');if(!event)continue;
   const shot=e.frame.projectiles.find(p=>p.id.endsWith(':1'));assert(shot);const hand=e.frame.limbs['hand-right'];
   assert(Math.hypot(event.position.x-hand.x,event.position.y-hand.y,event.position.z-hand.z)<5);
   const relative={x:shot.velocity.x-velocity.x,y:shot.velocity.y-velocity.y,z:shot.velocity.z-velocity.z};
   const offset={x:position.x-event.position.x,y:position.y-event.position.y,z:position.z-event.position.z};
   const seconds=(offset.x*relative.x+offset.y*relative.y+offset.z*relative.z)/(relative.x**2+relative.y**2+relative.z**2);
   assert(seconds>0);assert(Math.hypot(offset.x-relative.x*seconds,offset.y-relative.y*seconds,offset.z-relative.z*seconds)<.01,'lead uses current velocity, not stale movement memory');
   released=true;
  }
  assert(released);
 }finally{disposeM19(e);}
});

test('M20 tuning preserves warnings, cooldown, three-shot volleys, and other monster fireball speeds',()=>{
 const shot=s=>s.abilities.find(a=>a.id==='fireball-barrage'),fireball=shot(strikingWarlordSpecies);
 assert.equal(fireball.damage,25);assert.equal(fireball.projectileSpeed,6000);assert.equal(fireball.cooldown,8);assert.equal(fireball.count,3);assert.equal(fireball.simultaneous,true);assert(fireball.warning+fireball.windup>6);
 for(const [species,damage,speed] of [[huntingWarlordSpecies,25,1400],[showdownWarlordSpecies,25,1400],[pursuitWarlordSpecies,25,1200],[finalWarlordSpecies,25,1400]]){
  assert.equal(shot(species).damage,damage);assert.equal(shot(species).projectileSpeed,speed);
 }
});


for(const blocked of [false,true])test(`M20 fast fireballs ${blocked?'stop at real building geometry':'can be dodged by turning after release'}`,()=>{
 const buildings=[],e=createStrikingWarlordEncounter('dodge','pilot',0,()=>135,buildings),yaw=e.frame.yaw;
 const initial={x:e.frame.position.x+Math.sin(yaw)*3500,y:e.frame.position.y+1600,z:e.frame.position.z+Math.cos(yaw)*3500};
 let firedAt,shot,damage=0,wallHit=false;
 try{
  for(let ms=50;ms<=15000;ms+=50){
   const elapsed=firedAt===undefined?0:(ms-firedAt)/1000;
   const velocity=elapsed&&!blocked?{x:Math.cos(yaw)*1600,y:0,z:-Math.sin(yaw)*1600}:zero;
   const position={x:initial.x+velocity.x*elapsed,y:initial.y,z:initial.z+velocity.z*elapsed};
   stepM19(e,position,velocity,18,ms);
   if(firedAt===undefined&&e.events.some(event=>event.type==='release')){
    firedAt=ms;shot=e.frame.projectiles[0];assert(shot);
    if(blocked){const center={x:shot.position.x+shot.velocity.x*.1,y:shot.position.y+shot.velocity.y*.1,z:shot.position.z+shot.velocity.z*.1};buildings.push({minX:center.x-50,maxX:center.x+50,minZ:center.z-50,maxZ:center.z+50,top:center.y+1000});}
   }
   for(const event of e.events){if(event.kind==='damage')damage++;if(event.type==='projectile-impact')wallHit=true;}
   if(shot){const flying=e.frame.projectiles.find(p=>p.id===shot.id);if(flying)assert.deepEqual(flying.velocity,shot.velocity,'projectile must not home after launch');}
   if(firedAt!==undefined&&ms-firedAt>=1000)break;
  }
  assert(firedAt!==undefined);assert.equal(damage,0);
  if(blocked){assert(wallHit);assert(!e.frame.projectiles.some(p=>p.id===shot.id));}
 }finally{disposeM19(e);}
});


for(const [mission,create] of [[20,createStrikingWarlordEncounter],[21,createHuntingWarlordEncounter],[22,createShowdownWarlordEncounter],[23,createPursuitWarlordEncounter],[24,createFinalWarlordEncounter]])test(`M${mission} confirmed fireball removes exactly 25 HP once`,async()=>{
 const {readFileSync}=await import('node:fs'),{default:vm}=await import('node:vm'),{default:ts}=await import('typescript');
 const e=create('damage','pilot',0,()=>135,[]),yaw=e.frame.yaw;
 const target={x:e.frame.position.x+Math.sin(yaw)*4000,y:e.frame.position.y+1400,z:e.frame.position.z+Math.cos(yaw)*4000};
 let hit=false;
 try{
  for(let ms=50;ms<=120000&&!hit;ms+=50){
   stepM19(e,target,zero,18,ms);
   for(const event of e.events)if(event.kind==='damage'&&event.type==='projectile'){
    assert.equal(event.amount,25);
    for(const old of [10,15,20])assert.equal(permittedM19Damage(e,{...event,amount:old},100000+ms),0,'old fireball damage cannot bypass validation');
    const damage=permittedM19Damage(e,event,100000+ms);assert.equal(damage,25);assert.equal(permittedM19Damage(e,event,100000+ms),0);
    const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
    const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='damageMonsterPilot');
    const packets=[],pilot={lifeState:'alive',health:200,spawnProtectedUntil:0,aircraftType:'trainer'};
    const context=vm.createContext({e,pilot,damage,airportRepairStays:new Map(),maxHealthForAircraft:()=>200,broadcastToCity:(_city,message)=>packets.push(message)});
    vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\ndamageMonsterPilot(e,pilot,damage,200000);',context);
    assert.equal(pilot.health,175);assert.equal(packets[0].health,175);assert.equal(packets[0].damage,25);hit=true;break;
   }
  }
  assert(hit,'requires a real server projectile collision');
 }finally{disposeM19(e);}
});
