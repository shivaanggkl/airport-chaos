import { dallasCoinTrail } from '../../shared/collectible-trail.mjs';
import { journeyDallasCoinHunt01 as mission } from '../../shared/journey-mission.mjs';
/** Inspect the complete pickup corridor once, using the existing terrain/building index. */
export function coinTrailAltitude(clearanceAt:(x:number,z:number)=>number):number {
  let top=0;
  const spawn=mission.airborneSpawn;
  let previous:{x:number;z:number}=spawn;
  for(const coin of dallasCoinTrail){
    const steps=Math.ceil(Math.hypot(coin.x-previous.x,coin.z-previous.z)/100);
    for(let i=0;i<=steps;i++){
      const t=i/steps,x=previous.x+(coin.x-previous.x)*t,z=previous.z+(coin.z-previous.z)*t;
      for(const dx of [-mission.pickupRadius,0,mission.pickupRadius])for(const dz of [-mission.pickupRadius,0,mission.pickupRadius]){
        const floor=clearanceAt(x+dx,z+dz);
        if(!Number.isFinite(floor))throw new Error('Coin trail clearance unavailable');
        top=Math.max(top,floor);
      }
    }
    previous=coin;
  }
  return top+mission.airborneSpawn.altitude;
}
