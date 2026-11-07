import { cityAirports } from './city-airports.mjs';
import { cityWeatherZones } from './weather-zones.mjs';
import { DALLAS_WORLD_SCALE } from './dallas-world-scale.mjs';

export const cityRegistry = Object.freeze({
  dallas: Object.freeze({ cityId:'dallas', legacyIds:['dallas'], name:'Dallas', displayName:'Dallas', regionName:'North Texas', worldOrigin:{x:0,z:0}, worldSize:50_000 * DALLAS_WORLD_SCALE,
    airports:cityAirports.dallas, regions:['Metroplex','Central District','Canal District','North Metro','South Metro'], discoveryIds:['dfw','love','addison','executive'], weatherZones:cityWeatherZones.dallas,
    capabilities:Object.freeze({tutorialEnabled:false,practiceMode:false,progressionEnabled:true,territoriesEnabled:true,competitiveEnabled:true}),
    briefing:Object.freeze({title:'DALLAS OPERATIONS',summary:'Complete contracts, capture territories, fight rivals, explore regions, and land safely.'}),
    chaosEventSpawnRules:{enabled:true}, missionRouteRules:{enabled:true}, sponsorSlots:[], enabled:true, recommendedAircraft:'nightowl', difficulty:'LARGE' }),
  milwaukee: Object.freeze({ cityId:'milwaukee', legacyIds:['milwaukee'], name:'Milwaukee', displayName:'Milwaukee', regionName:'Lake Coast & Mountain Ridge', worldOrigin:{x:0,z:0}, worldSize:12_000,
    airports:cityAirports.milwaukee, regions:['Central','Lake Coast','Mountain Ridge','Countryside'], discoveryIds:['central-international','coast-airport','mountain-airfield','countryside-airstrip','mountain-ridge'], weatherZones:cityWeatherZones.milwaukee,
    capabilities:Object.freeze({tutorialEnabled:true,practiceMode:true,progressionEnabled:false,territoriesEnabled:false,competitiveEnabled:false}),
    briefing:Object.freeze({title:'MILWAUKEE OPERATIONS',summary:'Practice flying, explore the city, and land safely. Milwaukee earns no rewards.'}),
    chaosEventSpawnRules:{enabled:true,fallback:'soloAirportSprint'}, missionRouteRules:{enabled:true}, sponsorSlots:[], enabled:true, recommendedAircraft:'nightowl', difficulty:'EXPLORER' }),
});

export const cityAliases=Object.freeze({city_dallas_001:'dallas',city_milwaukee_002:'milwaukee',dallas:'dallas',milwaukee:'milwaukee'});
export function normalizeCityId(value){return cityAliases[value];}
export function cityDefinition(value){const id=normalizeCityId(value);return id?cityRegistry[id]:undefined;}
export function cityCapabilities(value){return cityDefinition(value)?.capabilities;}
export function airportsForCity(value){return cityDefinition(value)?.airports??[];}

export function nearestCityAirport(cityId, position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return;
  return airportsForCity(cityId).reduce((nearest, airport) => !nearest ||
    Math.hypot(airport.x-position.x, airport.z-position.z) < Math.hypot(nearest.x-position.x, nearest.z-position.z) ? airport : nearest, undefined);
}

export const intercityRoutes=Object.freeze([
  Object.freeze({routeId:'dallas-milwaukee',fromCityId:'dallas',toCityId:'milwaukee',distanceLabel:'Northbound Intercity Corridor',rewardProfile:{credits:250},sponsorSlotId:undefined,enabled:true}),
  Object.freeze({routeId:'milwaukee-dallas',fromCityId:'milwaukee',toCityId:'dallas',distanceLabel:'Southbound Intercity Corridor',rewardProfile:{credits:250},sponsorSlotId:undefined,enabled:true}),
]);
export function routeDefinition(routeId){return intercityRoutes.find(route=>route.routeId===routeId&&route.enabled);}
export function routesFromCity(cityId){return intercityRoutes.filter(route=>route.enabled&&route.fromCityId===normalizeCityId(cityId));}
