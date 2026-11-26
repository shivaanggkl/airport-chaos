import {pursuitWarlord} from '../../shared/pursuit-warlord.mjs';
import {pursuitWarlordSpecies} from './pursuit-warlord.js';
import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
import {cityRegistry} from '../../shared/city-registry.mjs';

const size=pursuitWarlord.finalSizeScale;
const base=structuredClone(ashenWarlordSpecies);
// Scale physical dimensions and authoritative anchors together; keep combat tuning unchanged.
for(const joint of Object.values(base.joints)){
 joint.position={x:joint.position.x*size,y:joint.position.y*size,z:joint.position.z*size};
 if(joint.reach!==undefined)joint.reach*=size;
}
for(const region of base.regions){
 region.radius*=size;
 if(region.radii)region.radii={x:region.radii.x*size,y:region.radii.y*size,z:region.radii.z*size};
}
// M2 runs; its turning, roars and ranged combat match M1.
export const finalWarlordSpecies=new SpeciesRegistry().register({
 ...base,scale:base.scale*size,height:base.height*size,radius:base.radius*size,id:'final-warlord',level:'LEGENDARY',
 health:journeyDallas19.bossHealth,contactDamage:25,
 animations:['idle','run','turn','roar','shoot','defeat'],
 movement:{...ashenWarlordSpecies.movement,stride:base.movement.stride*size,runStride:base.movement.runStride===undefined?undefined:base.movement.runStride*size,chargeSpeed:0,turnRate:pursuitWarlordSpecies.movement.turnRate,turnAcceleration:pursuitWarlordSpecies.movement.turnAcceleration},
 director:{...ashenWarlordSpecies.director!,combatDistance:9600,maintainCombatDistance:true,
  attackSpacing:pursuitWarlordSpecies.director!.attackSpacing,roarInterval:pursuitWarlordSpecies.director!.roarInterval,roarDuration:pursuitWarlordSpecies.director!.roarDuration},
 abilities:pursuitWarlordSpecies.abilities.map(a=>({...structuredClone(a),count:pursuitWarlord.fireball.finalCount})),
});
export function createFinalWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health:number=journeyDallas19.bossHealth){
 const halfSize=Number(cityRegistry.dallas.worldSize)/2;
 return createM19Encounter(id,playerId,started,ground,buildings,health,finalWarlordSpecies,
 {geometry,spawn:journeyDallas19.monster,environmentDamage:false,navigation:'city-bounds',
  bounds:{minX:-halfSize,maxX:halfSize,minZ:-halfSize,maxZ:halfSize},articulate:createAshenPose(health,false,false,false,false,false,finalWarlordSpecies.height)});
}
