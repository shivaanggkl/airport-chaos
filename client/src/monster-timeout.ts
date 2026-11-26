import {dallasDowntownCenter,inDallasCore,generateDallasSkyline} from '../../shared/dallas-skyline.mjs';
import {DALLAS_WORLD_SCALE,scaleDallasPoint} from '../../shared/dallas-world-scale.mjs';
import type {ObstacleBounds} from './world';
import {CinematicImpactBlast,TRANSPORT_IMPACT_SCALE} from './cinematic-impact';

export const M19_TIMEOUT = Object.freeze({ shootAt: .35, releaseAt: 1.65, impactAt: 3.65, durationMs: 9500 });

/** M1 keeps the same ending length while allowing the full bombardment and aftermath to read. */
export const M1_TIMEOUT=Object.freeze({...M19_TIMEOUT,impactSpacing:.12,fadeAt:8,blackAt:9.2});

/** Twelve rooftop strikes across the actual downtown district; six times the former blast size. */
export const M2_TIMEOUT=Object.freeze({...M1_TIMEOUT,blastScale:36,downtown:Object.freeze(scaleDallasPoint(dallasDowntownCenter))});

export function m2DowntownStrikeSites(buildings:readonly ObstacleBounds[],groundAt:(x:number,z:number)=>number):Array<{x:number;y:number;z:number}>{
  const scale=DALLAS_WORLD_SCALE;
  let candidates=buildings.filter(b=>inDallasCore(b.x/scale,b.z/scale)&&b.height>=100*scale);
  if(candidates.length<12)candidates=generateDallasSkyline().filter(b=>b.height>=100).map(b=>({
    x:b.x*scale,z:b.z*scale,height:(b.height+(b.pattern===6?24:3))*scale,baseY:groundAt(b.x*scale,b.z*scale),halfX:b.width*scale/2,halfZ:b.depth*scale/2
  }));
  const available=[...candidates],sites=[];
  for(let i=0;i<12;i++){
    const x=M2_TIMEOUT.downtown.x+(i%4-1.5)*600*scale,z=M2_TIMEOUT.downtown.z+(Math.floor(i/4)-1)*750*scale;
    let best=0,distance=Infinity;
    for(let j=0;j<available.length;j++){const b=available[j]!,d=(b.x-x)**2+(b.z-z)**2;if(d<distance){best=j;distance=d;}}
    const b=available.splice(best,1)[0]!;
    sites.push({x:b.x,y:(b.baseY??groundAt(b.x,b.z))+b.height,z:b.z});
  }
  return sites;
}

export const M19_CITY_BLAST_SCALE=TRANSPORT_IMPACT_SCALE*8;

/** M13's exact impact renderer, enlarged eightfold for the downtown strike. */
export class MonsterCityBlast extends CinematicImpactBlast {
  constructor(){super(M19_CITY_BLAST_SCALE,undefined,false);this.root.name='m19-downtown-timeout-blast';}
}
