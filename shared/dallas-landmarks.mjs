// Source-space landmark data shared by rendering and authoritative occlusion.
export const dallasLandmarks = Object.freeze([
  {kind:'reunion',x:-1120,z:130,width:56,depth:56,height:171},
  {kind:'stepped',x:-330,z:-360,width:58,depth:72,height:282,material:0,rotation:.05},
  {kind:'faceted',x:-780,z:-230,width:100,depth:100,height:224},
  ...[
    [-600,-610,54,52,205,1,-.15],[-170,-700,48,58,186,0,.18],
    [-1050,-580,52,48,164,3,-.1],[-1230,-370,44,50,150,1,.22],
  ].map(([x,z,width,depth,height,material,rotation])=>({kind:'stepped',x,z,width,depth,height,material,rotation})),
  ...[
    [-420,20,48,66,330],[-650,50,40,45,275],[-900,120,45,48,300],
    [-250,150,38,42,235],[-1340,10,42,46,260],[-940,-790,44,50,310],
    [-420,-980,52,48,285],[-1280,-760,46,44,245],
  ].map(([x,z,width,depth,height],style)=>({kind:'signature',x,z,width,depth,height,style})),
  ...[
    [-13500,-9350,68,62,138],[-13270,-9180,55,48,112],[-13740,-8990,52,48,94],
    [-13080,-9570,46,48,82],[-14000,-9560,48,44,78],
  ].map(([x,z,width,depth,height],i)=>({kind:'stepped',x,z,width,depth,height,material:i%2?2:1,rotation:.12})),
].map(Object.freeze));

export function landmarkBounds(b,heightAt) {
  const {x,z,width:w,depth:d,height:h}=b, result=[];
  const add=(cx,cz,width,depth,height,offset=0)=>result.push({x:cx,z:cz,halfX:width/2,halfZ:depth/2,height,baseY:heightAt(cx,cz)+offset,polygon:[]});
  if(b.kind==='stepped'){
    const podium=Math.min(28,h*.14),shaft=(h-podium)*.8;
    add(x,z,w*1.2,d*1.2,podium);add(x,z,w,d,shaft,podium);add(x,z,w*.72,d*.72,h-podium-shaft,podium+shaft);
  }else if(b.kind==='signature'){
    add(x,z,w*1.08,d*1.08,15);
    switch(b.style%4){
      case 0:add(x,z,w*.5,d*.5,15,h-15);break;
      case 1:add(x-w*.18,z,w*.47,d*.82,h-24,15);add(x+w*.19,z,w*.42,d*.78,h-45,15);break;
      case 2:add(x,z,w*.88,d*.88,h*.72,15);break;
      case 3:add(x,z,w*.94,d*.92,h*.57,15);add(x+w*.14,z-d*.08,w*.58,d*.68,h*.3,h*.57+15);break;
    }
    add(x,z,w,d,h);
  }else add(x,z,w,d,h);
  return result;
}
