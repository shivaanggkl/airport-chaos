import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {strikingWarlord as timing} from '../../shared/striking-warlord.mjs';
import {journeyDallas20} from '../../shared/journey-mission.mjs';
const base=structuredClone(ashenWarlordSpecies);
export const strikingWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'striking-warlord',health:700,level:'EASY',contactDamage:25,director:undefined,
 anchored:timing,animations:timing.motions,
 movement:{...base.movement,walk:0,run:0,chargeSpeed:0,turnRate:.45,turnAcceleration:.6,independentAim:false,traversalLeap:false},
 regions:base.regions.map(r=>({...r,multiplier:1})),
 abilities:base.abilities.filter(a=>['hand-strike','fireball-barrage'].includes(a.id)).map(a=>a.id==='hand-strike'?
 {...a,animation:'punch',interruptible:false,moving:false,damage:15,warning:.35,windup:.2,active:.3,recovery:1.4,cooldown:4}:
 {...a,animation:'shoot',requires:['hand-right'],interruptible:false,moving:false,count:3,simultaneous:true,damage:25,cooldown:8,projectileSpeed:6000,radius:24,
 warning:timing.castSeconds,windup:timing.releaseSeconds,active:.05,recovery:timing.shootSeconds-timing.releaseSeconds-.05,cone:.8,spread:.03})
});
export function createStrikingWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health=700){
 return createM19Encounter(id,playerId,started,ground,buildings,health,strikingWarlordSpecies,
 {geometry,spawn:journeyDallas20.monster,environmentDamage:false,articulate:createAshenPose(health,false,true)});
}
