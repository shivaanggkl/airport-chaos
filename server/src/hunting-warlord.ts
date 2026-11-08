import {strikingWarlordSpecies} from './striking-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuilding} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {huntingWarlord} from '../../shared/hunting-warlord.mjs';
import {journeyDallas21} from '../../shared/journey-mission.mjs';
const base=structuredClone(strikingWarlordSpecies),walk=model.height*model.clips.walk!.stride!/model.clips.walk!.duration*.32;
export const huntingWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'hunting-warlord',health:900,level:'MEDIUM',anchored:undefined,hunting:huntingWarlord,animations:huntingWarlord.motions,
 movement:{...base.movement,runOnly:false,walk,run:walk,acceleration:walk/1.5,deceleration:walk/1.2,stride:model.height*model.clips.walk!.stride!,runStride:model.height*model.clips.walk!.stride!,idleBetweenActions:.6},
 abilities:base.abilities.map(a=>({...a,damage:a.mechanism==='sweep'?20:25,maxRange:a.mechanism==='sweep'?a.maxRange:60000,projectileSpeed:a.mechanism==='projectile'?1400:a.projectileSpeed}))
});
export function createHuntingWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:readonly DistrictBuilding[],health=900){
 return createM19Encounter(id,playerId,started,ground,buildings,health,huntingWarlordSpecies,
 {geometry,spawn:journeyDallas21.monster,environmentDamage:false,articulate:createAshenPose(health,false,true,true)});
}
