import {ashenWarlordSpecies} from './ashen-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {createM19Encounter,type DistrictBuildings} from './m19-titan.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {journeyDallas25} from '../../shared/journey-mission.mjs';

const base=structuredClone(ashenWarlordSpecies);
const punch=base.abilities.find(a=>a.id==='hand-strike')!;
export const stationaryWarlordSpecies=new SpeciesRegistry().register({...base,
    id:'stationary-warlord',health:500,level:'EASY',contactDamage:25,director:undefined,
    stationary:{roarDuration:model.clips.roar!.duration,roarInterval:6.5,firstRoarAfter:0,idlePunchDuration:model.clips.punch!.duration,actionRestSeconds:.25},
    animations:['idle','punch','roar','defeat'],
    movement:{...base.movement,walk:0,run:0,chargeSpeed:0,turnRate:0,turnAcceleration:0,independentAim:false,traversalLeap:false},
    regions:base.regions.map(region=>({...region,multiplier:1})),
    abilities:[{...punch,animation:'punch',interruptible:false,moving:false,damage:15,warning:.35,windup:.2,active:.3,recovery:1.4,cooldown:4}]
});
export function createStationaryWarlordEncounter(id:string,playerId:string,started:number,ground:(x:number,z:number)=>number,buildings:DistrictBuildings,health=500){
    return createM19Encounter(id,playerId,started,ground,buildings,health,stationaryWarlordSpecies,
        {geometry,spawn:journeyDallas25.monster,environmentDamage:false,articulate:createAshenPose(health,true)});
}
