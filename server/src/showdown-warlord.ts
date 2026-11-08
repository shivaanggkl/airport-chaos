import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuilding} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {showdownWarlord as timing} from '../../shared/showdown-warlord.mjs';
import {journeyDallas22} from '../../shared/journey-mission.mjs';
const base=structuredClone(ashenWarlordSpecies),stride=model.height*model.clips.walk!.stride!,walk=stride/model.clips.walk!.duration*.32;
export const showdownWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'showdown-warlord',health:1100,level:'HARD',contactDamage:25,director:undefined,hunting:timing,animations:timing.motions,
 movement:{...base.movement,runOnly:false,walk,run:walk,chargeSpeed:0,acceleration:walk/1.5,deceleration:walk/1.2,
  stride,runStride:stride,idleBetweenActions:.6,turnRate:.45,turnAcceleration:.6,independentAim:false,traversalLeap:false},
 regions:base.regions.map(r=>({...r,multiplier:1})),
 abilities:base.abilities.filter(a=>['hand-strike','fireball-barrage'].includes(a.id)).map(a=>a.mechanism==='sweep'?
  {...a,animation:'punch',interruptible:false,moving:false,damage:25,warning:.35,windup:.2,active:.3,recovery:1.4,cooldown:3.5}:
  {...a,animation:'shoot',requires:['hand-right'],interruptible:false,moving:false,count:3,simultaneous:true,damage:25,cooldown:6,projectileSpeed:1400,radius:24,maxRange:60000,
   warning:timing.castSeconds,windup:timing.releaseSeconds,active:.05,recovery:timing.shootSeconds-timing.releaseSeconds-.05,cone:.8,spread:.03})
});
export function createShowdownWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:readonly DistrictBuilding[],health=1100){
 return createM19Encounter(id,playerId,started,ground,buildings,health,showdownWarlordSpecies,
 {geometry,spawn:journeyDallas22.monster,environmentDamage:false,articulate:createAshenPose(health,false,true,true)});
}
