// Golden River: authored in final Dallas world units. Arc-length table is built once.
export const coinTrailVersion = 2;
const samples = 8192, arc = new Float64Array(samples + 1);
export function coinCenterline(t) { return { x:12000+11000*Math.sin(2*Math.PI*t), z:-35000+75000*t }; }
let previous=coinCenterline(0);
for(let i=1;i<=samples;i++){const p=coinCenterline(i/samples);arc[i]=arc[i-1]+Math.hypot(p.x-previous.x,p.z-previous.z);previous=p;}
export const coinTrailLength=arc[samples];
export const dallasCoinTrail=Object.freeze(Array.from({length:1000},(_,i)=>{
 const distance=i*coinTrailLength/999;let lo=0,hi=samples;
 while(lo+1<hi){const mid=(lo+hi)>>>1;if(arc[mid]<distance)lo=mid;else hi=mid;}
 const t=(lo+(distance-arc[lo])/(arc[hi]-arc[lo]))/samples,p=coinCenterline(t);
 const dx=22000*Math.PI*Math.cos(2*Math.PI*t),dz=75000,n=Math.hypot(dx,dz),offset=i%2?95:-95;
 return Object.freeze({x:p.x+dz/n*offset,z:p.z-dx/n*offset,t});
}));
export const emptyCoinMask='0'.repeat(250);
export function coinCollected(mask,index){return Boolean(parseInt(mask[Math.floor(index/4)]??'0',16)&(1<<(index%4)));}
// Fixed numeric grid and integer references, shared by pickup and visible-instance selection.
const cell=1024,minX=-1024,minZ=-36864,cols=26,rows=78;
const heads=new Int32Array(cols*rows).fill(-1),next=new Int32Array(1000);
for(let i=0;i<1000;i++){const p=dallasCoinTrail[i],k=Math.floor((p.z-minZ)/cell)*cols+Math.floor((p.x-minX)/cell);next[i]=heads[k];heads[k]=i;}
export function queryCoinTrail(minimumX,maximumX,minimumZ,maximumZ,visit){
 const x0=Math.max(0,Math.floor((minimumX-minX)/cell)),x1=Math.min(cols-1,Math.floor((maximumX-minX)/cell));
 const z0=Math.max(0,Math.floor((minimumZ-minZ)/cell)),z1=Math.min(rows-1,Math.floor((maximumZ-minZ)/cell));
 for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)for(let i=heads[z*cols+x];i!==-1;i=next[i])visit(i);
}
/** Fed only accepted movement. No client pickup counts or teleport segments. */
export function collectTrail(coins,altitude,mask,start,end,radius,limit){
 let bits,count=0,lastIndex=-1;const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,length=dx*dx+dy*dy+dz*dz;
 const visit=i=>{
  if(count>=limit||coinCollected(mask,i))return;
  const p=coins[i],t=length?Math.max(0,Math.min(1,((p.x-start.x)*dx+(altitude-start.y)*dy+(p.z-start.z)*dz)/length)):0;
  if((start.x+dx*t-p.x)**2+(start.y+dy*t-altitude)**2+(start.z+dz*t-p.z)**2>radius*radius)return;
  bits??=mask.split('');const at=Math.floor(i/4);bits[at]=(parseInt(bits[at],16)|(1<<(i%4))).toString(16);count++;lastIndex=Math.max(lastIndex,i);
 };
 if(coins===dallasCoinTrail)queryCoinTrail(Math.min(start.x,end.x)-radius,Math.max(start.x,end.x)+radius,Math.min(start.z,end.z)-radius,Math.max(start.z,end.z)+radius,visit);
 else for(let i=0;i<coins.length;i++)visit(i);
 return {mask:bits?bits.join(''):mask,count,lastIndex};
}
