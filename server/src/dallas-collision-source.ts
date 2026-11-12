import {readFileSync,readdirSync} from 'node:fs';
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

/** Build-only skyline envelopes; never imported by the live server loader. */
export function authoredDallasBuildings():DallasBuilding[] {
  const heightAt=(x:number,z:number)=>dallasElevationAt(x*S,z*S)/S;
  const bounds=dallasLandmarks.flatMap(b=>landmarkBounds(b,heightAt));
  const airports=cityAirports.dallas.map(a=>({...a,x:a.x/S,z:a.z/S,runwayWidth:a.runwayWidth/S,runwayLength:a.runwayLength/S}));
  for(const b of generateDallasSkyline(airports,bounds))bounds.push({x:b.x,z:b.z,halfX:b.width/2,halfZ:b.depth/2,height:b.height+(b.pattern===6?24:3),baseY:heightAt(b.x,b.z),polygon:[]});
  return bounds.map(b=>({minX:(b.x-b.halfX)*S,maxX:(b.x+b.halfX)*S,minZ:(b.z-b.halfZ)*S,maxZ:(b.z+b.halfZ)*S,top:(b.baseY+b.height)*S}));
}

export type DallasBuildingCoverage = {minX:number;maxX:number;minZ:number;maxZ:number};
const overlaps=(b:DallasBuildingCoverage,c:DallasBuildingCoverage)=>b.maxX>=c.minX&&b.minX<=c.maxX&&b.maxZ>=c.minZ&&b.minZ<=c.maxZ;

/** Build-only reference reader. Preserve original chunk filtering and Float64 arithmetic. */
export function loadDallasCombatBuildings(coverages:readonly DallasBuildingCoverage[],masks?:number[]):DallasBuilding[] {
  const dir=new URL('../../client/public/data/dallas/near/',import.meta.url),result:DallasBuilding[]=[];
  const cellSize=2000*S;
  for(const name of readdirSync(dir).sort()){
    const match=/^(-?\d+)_(-?\d+)\.json$/.exec(name);if(!match)continue;
    const x=Number(match[1])*cellSize,z=Number(match[2])*cellSize;
    if(!coverages.some(c=>overlaps({minX:x,maxX:x+cellSize,minZ:z,maxZ:z+cellSize},c)))continue;
    const chunk=JSON.parse(readFileSync(new URL(name,dir),'utf8')) as {b:number[][]};
    for(const row of chunk.b){
      if(row.length<10)continue;
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(let i=4;i+1<row.length;i+=2){
        const bx=row[i]!*S,bz=row[i+1]!*S;
        minX=Math.min(minX,bx);maxX=Math.max(maxX,bx);minZ=Math.min(minZ,bz);maxZ=Math.max(maxZ,bz);
      }
      if(replacedDallasFootprint(minX,maxX,minZ,maxZ))continue;
      const b={minX,maxX,minZ,maxZ,top:(row[0]!+row[3]!)*S};
      const mask=coverages.reduce((mask,c,i)=>mask|(overlaps({minX:x,maxX:x+cellSize,minZ:z,maxZ:z+cellSize},c)&&overlaps(b,c)?1<<i:0),0);
      if(mask){result.push(b);masks?.push(mask);}
    }
  }
  for(const b of authoredDallasBuildings()){
    const mask=coverages.reduce((mask,c,i)=>mask|(overlaps(b,c)?1<<i:0),0);
    if(mask){result.push(b);masks?.push(mask);}
  }
  return result;
}
