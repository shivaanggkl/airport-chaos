import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
import {cityRegistry} from '../../shared/city-registry.mjs';

// Restore the original running combat director only for visible M24.
// Keep its current mission health and the approved fireball/body-contact damage.
export const finalWarlordSpecies=new SpeciesRegistry().register({
 ...structuredClone(ashenWarlordSpecies),id:'final-warlord',level:'LEGENDARY',
 health:journeyDallas19.bossHealth,contactDamage:25,
 director:{...ashenWarlordSpecies.director!,combatDistance:3500,maintainCombatDistance:true},
 abilities:ashenWarlordSpecies.abilities.map(a=>a.id==='fireball-barrage'?{...a,damage:25,count:12,burstSize:3}:structuredClone(a)),
});
export function createFinalWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health:number=journeyDallas19.bossHealth){
 const halfSize=Number(cityRegistry.dallas.worldSize)/2;
 return createM19Encounter(id,playerId,started,ground,buildings,health,finalWarlordSpecies,
 {geometry,spawn:journeyDallas19.monster,environmentDamage:false,navigation:'city-bounds',
  bounds:{minX:-halfSize,maxX:halfSize,minZ:-halfSize,maxZ:halfSize},articulate:createAshenPose(health)});
}
