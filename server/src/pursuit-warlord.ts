import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {cityRegistry} from '../../shared/city-registry.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
const base=structuredClone(ashenWarlordSpecies),stride=model.height*model.clips.walk!.stride!,walk=stride/model.clips.walk!.duration*.32;
export const pursuitWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'pursuit-warlord',health:1000,level:'EASY',contactDamage:25,director:{...base.director!},hunting:undefined,animations:[...base.animations,'punch','shoot'],
 movement:{...base.movement,runOnly:false,walk,run:walk,chargeSpeed:base.movement.chargeSpeed,acceleration:walk/1.5,deceleration:walk/1.2,
  stride,runStride:stride,idleBetweenActions:undefined,turnRate:.45,turnAcceleration:.6,independentAim:true,traversalLeap:false},
 regions:base.regions.map(r=>({...r,multiplier:1})),
 abilities:base.abilities.map(a=>a.mechanism==='charge'?{...a,damage:20}:a.mechanism==='sweep'?
  {...a,animation:'punch',interruptible:false,moving:false,damage:15,warning:.35,windup:.2,active:.3,recovery:1.4,cooldown:4}:
  {...a,animation:'shoot',requires:['hand-right'],interruptible:false,moving:true,count:6,simultaneous:true,damage:25,cooldown:9,projectileSpeed:1200,radius:24,maxRange:60000,
   warning:a.warning,windup:a.windup,active:a.active,recovery:a.recovery,cone:.8,spread:.03})
});
export function createPursuitWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health=1000){
 const halfSize=Number(cityRegistry.dallas.worldSize)/2;
 return createM19Encounter(id,playerId,started,ground,buildings,health,pursuitWarlordSpecies,
 {geometry,spawn:journeyDallas23.monster,environmentDamage:false,navigation:'city-bounds',bounds:{minX:-halfSize,maxX:halfSize,minZ:-halfSize,maxZ:halfSize},articulate:createAshenPose(health,false,false,false,true)});
}
