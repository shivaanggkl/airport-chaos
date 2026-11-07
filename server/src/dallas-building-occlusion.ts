import {DALLAS_WORLD_SCALE as S} from '../../shared/dallas-world-scale.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {dallasLandmarks,landmarkBounds} from '../../shared/dallas-landmarks.mjs';
import {generateDallasSkyline,inDallasCore} from '../../shared/dallas-skyline.mjs';
import {dallasElevationAt} from './dallas-elevation.js';
export type DallasBuilding = {minX:number;maxX:number;minZ:number;maxZ:number;top:number};

// The renderer omits these raw downtown footprints in favor of the authored skyline.
export function replacedDallasFootprint(minX:number,maxX:number,minZ:number,maxZ:number):boolean {
  return inDallasCore((minX+maxX)/(2*S),(minZ+maxZ)/(2*S));
}

/** One startup calculation; no geometry, rendering, or per-tick allocation. */
export function authoredDallasBuildings():DallasBuilding[] {
  const heightAt=(x:number,z:number)=>dallasElevationAt(x*S,z*S)/S;
  const bounds=dallasLandmarks.flatMap(b=>landmarkBounds(b,heightAt));
  const airports=cityAirports.dallas.map(a=>({...a,x:a.x/S,z:a.z/S,runwayWidth:a.runwayWidth/S,runwayLength:a.runwayLength/S}));
  for(const b of generateDallasSkyline(airports,bounds))bounds.push({x:b.x,z:b.z,halfX:b.width/2,halfZ:b.depth/2,height:b.height+(b.pattern===6?24:3),baseY:heightAt(b.x,b.z),polygon:[]});
  return bounds.map(b=>({minX:(b.x-b.halfX)*S,maxX:(b.x+b.halfX)*S,minZ:(b.z-b.halfZ)*S,maxZ:(b.z+b.halfZ)*S,top:(b.baseY+b.height)*S}));
}
