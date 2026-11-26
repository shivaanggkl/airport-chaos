import * as THREE from 'three';

export const DALLAS_FINALE=Object.freeze({entry:2.5,writeEnd:11.5,solidAt:13.5,goldAt:18,achievementAt:21,duration:26});
export const DALLAS_VICTORY_WORD='VICTORY';
// Single-line lettering: the finished word follows exactly the smoke the pilots laid down.
const letters:ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number,number]>>>=[
 [[[0,65],[22,0],[44,65]]],
 [[[22,0],[22,65]]],
 [[[44,58],[35,65],[12,65],[0,50],[0,15],[12,0],[35,0],[44,8]]],
 [[[0,65],[44,65]],[[22,65],[22,0]]],
 [[[22,65],[6,60],[0,45],[0,20],[6,5],[22,0],[38,5],[44,20],[44,45],[38,60],[22,65]]],
 [[[0,0],[0,65],[28,65],[44,55],[44,43],[28,33],[0,33]],[[24,33],[44,0]]],
 [[[0,65],[22,33],[44,65]],[[22,33],[22,0]]],
];
export type FinaleSegment={curve:THREE.Curve<THREE.Vector3>;ink:boolean;start:number;end:number};
export type FinaleFlight={segments:FinaleSegment[];samples:Array<{point:THREE.Vector3;at:number}>};
export function createFinaleFlights():FinaleFlight[]{
 return [[0,1],[2,3,4],[5,6]].map(group=>{
  const parts:Array<{curve:THREE.Curve<THREE.Vector3>;ink:boolean;length:number}>=[];
  let previous:THREE.Vector3|undefined;
  for(const index of group)for(const stroke of letters[index]!){
   const points=stroke.map(([x,y])=>new THREE.Vector3(index*58+x-196,y+12,0));
   if(previous){
    const middle=previous.clone().lerp(points[0]!,.5);middle.y+=22;middle.z+=18;
    const curve=new THREE.CatmullRomCurve3([previous,middle,points[0]!]);parts.push({curve,ink:false,length:curve.getLength()});
   }
   // Rounded corners retain legible capital letters without instantaneous turns.
   const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');parts.push({curve,ink:true,length:curve.getLength()});
   previous=points.at(-1)!;
  }
  const total=parts.reduce((sum,p)=>sum+p.length,0),segments:FinaleSegment[]=[],samples:FinaleFlight['samples']=[];let distance=0;
  for(const part of parts){
   const start=distance/total;distance+=part.length;const end=distance/total;
   segments.push({curve:part.curve,ink:part.ink,start,end});
   if(part.ink){const count=Math.ceil(part.length/2);for(let i=0;i<=count;i++)samples.push({point:part.curve.getPointAt(i/count),at:start+(end-start)*i/count});}
  }
  return {segments,samples};
 });
}
export function finalePhase(t:number):'arrival'|'writing'|'crimson'|'gold'|'achievement'|'complete'{
 return t<DALLAS_FINALE.entry?'arrival':t<DALLAS_FINALE.writeEnd?'writing':t<DALLAS_FINALE.solidAt?'crimson':t<DALLAS_FINALE.achievementAt?'gold':t<DALLAS_FINALE.duration?'achievement':'complete';
}
