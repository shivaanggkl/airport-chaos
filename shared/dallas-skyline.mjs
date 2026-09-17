// Deterministic authored downtown district; streamed suburbs retain OSM heights.
export const dallasFacadePalette = [0x4385ad,0xaabcc9,0x4c948a,0xc5a563,0x9a7359,0xdce0da,0xc7b79c,0xa45e4d,0x273d5c,0x439fac,0x72658f,0xb98666,0x83939e,0xd1d4cc,0x859bb3];
export const dallasFacadePatterns = ['vertical stripes','horizontal bands','checker grid','glass panels','stepped tower','twin tower','antenna','helipad','crown','slanted crown','faceted corners','podium tower','stacked blocks','dark columns','bright rows'];
export const inDallasCore = (x,z) => x >= -1900 && x <= 1100 && z >= -1900 && z <= 1000;
export function skylineAirportExcluded(x,z,padding,airports) {
  return airports.some(a => { const dx=x-a.x,dz=z-a.z;return Math.abs(dx*Math.cos(a.heading)-dz*Math.sin(a.heading))<Math.max(700,a.runwayWidth/2+300)+padding && Math.abs(dx*Math.sin(a.heading)+dz*Math.cos(a.heading))<a.runwayLength/2+1600+padding; });
}
export function generateDallasSkyline(airports=[],reserved=[]) {
  const result=[];
  for(let row=0;row<19;row++)for(let column=0;column<20;column++){
    const index=row*20+column,x=-1825+column*150,z=-1825+row*150;
    const seed=(Math.imul(index+71,2654435761)>>>0),width=54+seed%29,depth=48+(seed>>>8)%32;
    if(skylineAirportExcluded(x,z,65,airports)||reserved.some(b=>Math.abs(x-b.x)<b.halfX+70&&Math.abs(z-b.z)<b.halfZ+70))continue;
    const tall=result.length%5!==4;
    const centerWeight=Math.max(0,1-Math.hypot(x+450,z+450)/2100);
    const height=tall?110+(seed>>>12)%125+centerWeight*165:24+seed%32;
    result.push({x,z,width,depth,height,material:index%15,pattern:(row*7+column)%15});
  }
  return result;
}
