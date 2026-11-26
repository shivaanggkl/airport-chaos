import {pursuitWarlord} from '../../shared/pursuit-warlord.mjs';
import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {cityRegistry} from '../../shared/city-registry.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
const base=structuredClone(ashenWarlordSpecies),stride=model.height*model.clips.walk!.stride!,walk=stride/model.clips.walk!.duration*.32*6;
export const pursuitWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'pursuit-warlord',health:journeyDallas23.bossHealth,level:'EASY',contactDamage:25,director:{...base.director!,attackSpacing:base.director!.attackSpacing/6,roarInterval:20,roarDuration:model.clips.roar!.duration},hunting:undefined,animations:['idle','walk','turn','roar','shoot','defeat'],
 movement:{...base.movement,runOnly:false,walk,run:walk,chargeSpeed:0,acceleration:walk/1.5,deceleration:walk/1.2,
  stride,runStride:stride,idleBetweenActions:undefined,turnRate:.45*6,turnAcceleration:.6*6,independentAim:true,traversalLeap:false},
 regions:base.regions.map(r=>({...r,multiplier:1})),
 abilities:base.abilities.filter(a=>a.mechanism==='projectile').map(a=>
  ({...a,animation:'shoot',requires:['hand-right'],interruptible:false,moving:true,count:6,simultaneous:true,damage:25,cooldown:9/6,projectileSpeed:pursuitWarlord.fireball.speed,radius:pursuitWarlord.fireball.radius,maxRange:60000,
   warning:a.warning/6,windup:a.windup/6,active:a.active/6,recovery:a.recovery/6,cone:.8,spread:pursuitWarlord.fireball.spread,spreadPattern:'cluster',groundClearanceAim:true}))
});
export function createPursuitWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health:number=journeyDallas23.bossHealth){
 const halfSize=Number(cityRegistry.dallas.worldSize)/2;
 return createM19Encounter(id,playerId,started,ground,buildings,health,pursuitWarlordSpecies,
 {geometry,spawn:journeyDallas23.monster,environmentDamage:false,navigation:'city-bounds',roamBoundary:pursuitWarlord.downtown,bounds:{minX:-halfSize,maxX:halfSize,minZ:-halfSize,maxZ:halfSize},articulate:createAshenPose(health,false,false,false,true,false)});
}
