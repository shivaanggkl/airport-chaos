import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {pursuitWarlord as timing} from '../../shared/pursuit-warlord.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
const base=structuredClone(ashenWarlordSpecies),stride=model.height*model.clips.walk!.stride!,walk=stride/model.clips.walk!.duration*.32;
const runStride=model.height*model.clips.run!.stride!,run=runStride/model.clips.run!.duration*.28;
export const pursuitWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'pursuit-warlord',health:1000,level:'EASY',contactDamage:25,director:undefined,hunting:timing,animations:timing.motions,
 movement:{...base.movement,runOnly:false,walk,run,chargeSpeed:0,acceleration:walk/1.5,deceleration:walk/1.2,
  stride,runStride,idleBetweenActions:.6,turnRate:.45,turnAcceleration:.6,independentAim:false,traversalLeap:false},
 regions:base.regions.map(r=>({...r,multiplier:1})),
 abilities:base.abilities.filter(a=>['hand-strike','fireball-barrage'].includes(a.id)).map(a=>a.mechanism==='sweep'?
  {...a,animation:'punch',interruptible:false,moving:false,damage:15,warning:.35,windup:.2,active:.3,recovery:1.4,cooldown:4}:
  {...a,animation:'shoot',requires:['hand-right'],interruptible:false,moving:false,count:3,simultaneous:true,damage:25,cooldown:8,projectileSpeed:1200,radius:24,maxRange:60000,
   warning:timing.castSeconds,windup:timing.releaseSeconds,active:.05,recovery:timing.shootSeconds-timing.releaseSeconds-.05,cone:.8,spread:.03})
});
export function createPursuitWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health=1000){
 return createM19Encounter(id,playerId,started,ground,buildings,health,pursuitWarlordSpecies,
 {geometry,spawn:journeyDallas23.monster,environmentDamage:false,articulate:createAshenPose(health,false,true,true)});
}
