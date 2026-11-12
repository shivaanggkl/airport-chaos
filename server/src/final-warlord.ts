import {showdownWarlordSpecies} from './showdown-warlord.js';
import {pursuitWarlordSpecies} from './pursuit-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {finalWarlord} from '../../shared/final-warlord.mjs';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
const base=structuredClone(showdownWarlordSpecies);
export const finalWarlordSpecies=new SpeciesRegistry().register({...base,
 id:'final-warlord',health:1500,hunting:finalWarlord,animations:finalWarlord.motions,
 movement:{...base.movement,run:pursuitWarlordSpecies.movement.run,runStride:pursuitWarlordSpecies.movement.runStride},
 abilities:base.abilities.map(a=>({...a,cooldown:a.mechanism==='projectile'?5:3.5}))
});
export function createFinalWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health=1500){
 return createM19Encounter(id,playerId,started,ground,buildings,health,finalWarlordSpecies,
 {geometry,spawn:journeyDallas19.monster,environmentDamage:false,articulate:createAshenPose(health,false,true,true)});
}
