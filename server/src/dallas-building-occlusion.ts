import {readFileSync} from 'node:fs';
import {CollisionBuildings,CollisionBuildingView} from './collision-buildings.js';
export type {Building as DallasBuilding} from './collision-buildings.js';
export type DallasBuildingCoverage={minX:number;maxX:number;minZ:number;maxZ:number};
let shared:CollisionBuildings|undefined;
const views=new Map<number,CollisionBuildingView>();
/** Server-only city package, built before startup. Missing/corrupt data is fatal. */
export function loadDallasCombatBuildings(expectedCoverages?:readonly DallasBuildingCoverage[]):CollisionBuildings {
  if(!shared){
    const manifest=JSON.parse(readFileSync(new URL('../collision-data/dallas-v1.json',import.meta.url),'utf8')) as {version:number;records:number;bytes:number;coverages:DallasBuildingCoverage[]};
    const buffer=readFileSync(new URL('../collision-data/dallas-v1.bin',import.meta.url));
    if(manifest.version!==1||buffer.length!==manifest.bytes||expectedCoverages&&JSON.stringify(expectedCoverages)!==JSON.stringify(manifest.coverages))throw Error('Stale Dallas collision package: rebuild server collision data');
    const loaded=new CollisionBuildings(buffer);
    if(loaded.length!==manifest.records)throw Error('Invalid Dallas collision record count');
    shared=loaded;
  }
  return shared;
}
export function dallasMissionBuildings(mask:1|2):CollisionBuildingView{
  let view=views.get(mask);if(!view){const source=loadDallasCombatBuildings();view=new CollisionBuildingView(source,(_b,id)=>source.hasMask(id,mask));views.set(mask,view);}return view;
}
